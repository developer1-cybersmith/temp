import type OpenAI from 'openai';
import { agentOpenai, AGENT_MODEL } from '../openai-client.js';
import { withAbortTimeout } from '../abortable-call.js';
import { TOOL_DEFINITIONS, executeTool, escalateConversation } from '../tools.js';
import type { AgentState, AgentStateUpdate, ToolCallLogEntry } from '../state.js';

/**
 * Static bound on the tool-CALLING LOOP's LLM round-trips (how many times we
 * ask the model to decide again after seeing tool results) — a safety valve
 * distinct from the §5.4 hard cap below, which bounds actual tool
 * EXECUTIONS. Kept generous since the real enforcement is the 3-call cap.
 */
const MAX_LOOP_ITERATIONS = 5;

/** GENAI_POC_PRD.md §5.4: "decide_and_retrieve = 6s per tool call". */
const DECIDE_TIMEOUT_MS = 6000;

/** GENAI_POC_PRD.md §5.4: "Hard cap: max 3 tool calls per message". */
const MAX_TOOL_CALLS = 3;

const CAP_HANDOFF_MESSAGE =
  'I need to bring in a team member to help you further with this. Connecting you now.';
const CAP_HANDOFF_MESSAGE_HI =
  'Ji, iske liye main aapko hamare team member se connect karwa deta hoon.';

function buildDecisionPrompt(state: AgentState): string {
  const historyTail = state.history.slice(-8).map((m) => `${m.sender}: ${m.content}`).join('\n');
  return `You are a sales assistant for ${state.user.business_name || 'this business'} (${state.domain.displayName}).
You decide which tool(s), if any, to call to help answer the customer's message. Call at most one tool per turn unless you genuinely need more than one. If no tool is needed (e.g. a greeting), respond without calling any tool.

Classified intent: ${state.intent || 'unknown'}
Extracted entities: ${JSON.stringify(state.entities || {})}
Customer language: ${state.languageDetected || 'unknown'}

Recent conversation:
${historyTail || 'No previous messages.'}

Current customer message: "${state.messageText}"`;
}

export async function decideAndRetrieveNode(state: AgentState): Promise<AgentStateUpdate> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildDecisionPrompt(state) },
  ];

  let toolCallLog: ToolCallLogEntry[] = [...state.toolCallLog];
  let toolCallCount = state.toolCallCount;
  let retrievedContext: AgentState['retrievedContext'] = state.retrievedContext;
  let escalated = false;
  let escalationReasonFinal: string | undefined;
  let capExceeded = false;

  for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS && !escalated; iteration++) {
    let response;
    try {
      response = await withAbortTimeout(DECIDE_TIMEOUT_MS, 'decide_and_retrieve', (signal) =>
        agentOpenai.chat.completions.create(
          {
            model: AGENT_MODEL,
            messages,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
            temperature: 0.2,
          },
          { signal }
        )
      );
    } catch (err: any) {
      // A timed-out/failed decision call must not crash the whole graph run
      // (Phase 4 found this: a slow completion here previously took down the
      // entire message with no reply sent at all). Stop deciding for this
      // turn and fall through to generate with whatever context was already
      // retrieved (possibly none) — same fail-open behavior ai-router.ts
      // already uses elsewhere on LLM failure.
      console.error('❌ [agent/decide_and_retrieve] decision call failed:', err.message);
      break;
    }

    const choice = response.choices[0]?.message;
    if (!choice) break;

    const toolCalls = choice.tool_calls || [];
    if (toolCalls.length === 0) {
      // Model decided no tool call is needed for this turn — done.
      break;
    }

    messages.push(choice);

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;

      // Hard cap check BEFORE invocation (§5.4) — force escalate_to_human
      // instead of executing the 4th+ tool call.
      if (toolCallCount >= MAX_TOOL_CALLS) {
        capExceeded = true;
        escalated = true;
        escalationReasonFinal = `Tool call cap (${MAX_TOOL_CALLS}) exceeded`;
        await escalateConversation(state.conversationId, escalationReasonFinal);

        toolCallLog = [
          ...toolCallLog,
          {
            tool: call.function.name,
            input: {},
            output: { ok: false, error: `Tool call cap of ${MAX_TOOL_CALLS} exceeded — forced escalation, not executed` },
            ok: false,
            latencyMs: 0,
            timestamp: new Date().toISOString(),
          },
        ];
        break;
      }

      const start = Date.now();
      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }

      const result = await executeTool(call.function.name, args, state);
      const latencyMs = Date.now() - start;

      toolCallLog = [
        ...toolCallLog,
        {
          tool: call.function.name,
          input: args,
          output: result.envelope,
          ok: result.envelope.ok,
          latencyMs,
          timestamp: new Date().toISOString(),
        },
      ];
      toolCallCount += 1;

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result.envelope),
      });

      if (result.retrievedContext) {
        retrievedContext = result.retrievedContext;
      }
      if (result.escalated) {
        escalated = true;
        escalationReasonFinal = result.escalationReason;
      }
    }
  }

  const update: AgentStateUpdate = {
    toolCallLog,
    toolCallCount,
    retrievedContext: retrievedContext ?? { source: 'none', items: [] },
    escalated,
  };

  if (escalated) {
    update.escalationReasonFinal = escalationReasonFinal;
    const isHindi = state.languageDetected?.startsWith('hi');
    if (capExceeded) {
      // Distinct copy from the escalate_to_human tool's handoff so a trace
      // reviewer can tell "model chose to escalate" apart from "cap forced it".
      update.replyDraft = isHindi ? CAP_HANDOFF_MESSAGE_HI : CAP_HANDOFF_MESSAGE;
    } else {
      // Fixed handoff copy — mirrors pipeline-service.ts's existing
      // deterministic handoff message (GENAI_POC_PRD.md §5.2).
      update.replyDraft = isHindi
        ? 'Ji, main samajh sakta hoon. Main aapko hamare senior team member se connect karwa deta hoon jo aapki better help kar sakenge.'
        : 'I understand your concern. Let me connect you with a senior team member who can help you better.';
    }
  }

  return update;
}
