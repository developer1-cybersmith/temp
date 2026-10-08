import { agentOpenai, AGENT_MODEL } from '../openai-client.js';
import { withAbortTimeout } from '../abortable-call.js';
import type { AgentState, AgentStateUpdate } from '../state.js';

const CLASSIFY_TIMEOUT_MS = 8000; // GENAI_POC_PRD.md §5.4 per-node budget

/**
 * classify — calls the LLM to produce intent/entities/confidence. Reuses
 * ai-router.ts's analyzeMessage PROMPT CONSTRUCTION (domain.analysisPrompt)
 * but makes its own HTTP call with AbortController instead of calling
 * analyzeMessage() itself, because that function's internal timeout is
 * Promise.race-based (no real cancellation) and ai-router.ts must remain
 * untouched (GENAI_POC_PRD.md §5.2, §5.4). Falls back to the same defaults
 * analyzeMessage() uses on failure, so behavior matches the old pipeline.
 */
export async function classifyNode(state: AgentState): Promise<AgentStateUpdate> {
  const historyStrings = state.history.map((m) => `${m.sender}: ${m.content}`);
  const domain = state.domain;

  const now = new Date();
  const prompt = domain.analysisPrompt.buildSystemPrompt({
    currentDate: now.toISOString().split('T')[0],
    currentTime: now.toTimeString().split(' ')[0].slice(0, 5),
    dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()],
    tomorrowDate: new Date(now.getTime() + 86400000).toISOString().split('T')[0],
    businessName: state.user.business_name || 'My Business',
    industry: state.user.industry || 'General Services',
    services: (state.user.services || []).join(', ') || 'Various services',
    conversationHistory: historyStrings.length > 0
      ? historyStrings.slice(-domain.limits.historyLlmLimit).join('\n')
      : 'No previous messages.',
    customerMessage: state.messageText.slice(0, 1500),
  });

  try {
    const response = await withAbortTimeout(CLASSIFY_TIMEOUT_MS, 'classify', (signal) =>
      agentOpenai.chat.completions.create(
        {
          model: AGENT_MODEL,
          messages: [{ role: 'system', content: prompt }],
          response_format: { type: 'json_object' },
          ...domain.llmParams.analysis,
        },
        { signal }
      )
    );

    const text = response.choices[0].message.content || '{}';
    const analysis = JSON.parse(text);

    return {
      intent: analysis.intent,
      entities: analysis.entities || {},
      confidence: analysis.confidence,
      languageDetected: analysis.language_detected,
      shouldAutoReply: analysis.should_auto_reply,
      escalationReason: analysis.escalation_reason,
      summaryUpdate: analysis.summary_update,
    };
  } catch (err: any) {
    console.error('❌ [agent/classify] AI analysis failed:', err.message);
    return {
      intent: 'general_question',
      entities: {},
      confidence: 0.3,
      languageDetected: 'en',
      shouldAutoReply: true,
      escalationReason: null,
      summaryUpdate: 'Unable to analyze message',
    };
  }
}
