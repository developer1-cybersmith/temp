import { agentSupabase } from '../supabase-client.js';
import { cloudClient } from '../../services/whatsapp-cloud-client.js';
import type { AgentState, AgentStateUpdate } from '../state.js';
import type { BaseDomain } from '../../domains/types.js';

/**
 * Mirrors PipelineService['advanceFunnelStage'] (pipeline-service.ts) exactly.
 * Duplicated here rather than imported because that method is private and
 * pipeline-service.ts must remain untouched (GENAI_POC_PRD.md ground rules).
 * Keep in sync manually if the source method changes.
 */
function advanceFunnelStage(currentStage: string, intent: string, _domain: BaseDomain): string {
  const stageOrder: Record<string, number> = {
    inquiry: 1, qualification: 2, test_drive: 3, negotiation: 4,
    booking: 5, documentation: 6, delivery: 7,
    new: 1, engaged: 2, negotiating: 3, booked: 4,
  };

  const intentToStage: Record<string, string> = {
    greeting: 'inquiry', general_question: 'inquiry',
    inventory_browse: 'qualification', inventory_inquiry: 'qualification',
    pricing_inquiry: 'qualification', inventory_compare: 'qualification',
    test_drive_request: 'test_drive', meeting_request: 'test_drive',
    price_negotiation: 'negotiation', trade_in_inquiry: 'negotiation',
    financing_inquiry: 'negotiation', ready_to_buy: 'booking',
    urgency_signal: 'booking', document_inquiry: 'documentation',
  };

  const targetStage = intentToStage[intent] || currentStage;
  const currentOrder = stageOrder[currentStage] || 1;
  const targetOrder = stageOrder[targetStage] || 1;

  return targetOrder > currentOrder ? targetStage : currentStage;
}

/** Mirrors PipelineService['upsertLead'] — see advanceFunnelStage note above. */
async function upsertLead(
  userId: string,
  conversationId: string,
  customerName: string,
  intent: string,
  leadScore: string,
  summary: string,
  domain: BaseDomain,
  conversation: any
): Promise<void> {
  const { data: existingLead } = await agentSupabase
    .from('wb_leads')
    .select('*')
    .eq('conversation_id', conversationId)
    .single();

  const currentStage = conversation.funnel_stage || 'inquiry';
  const newStage = advanceFunnelStage(currentStage, intent, domain);

  if (existingLead) {
    const scorePriority: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const shouldUpdate =
      (scorePriority[leadScore] || 0) > (scorePriority[existingLead.score] || 0) ||
      newStage !== existingLead.stage;

    if (shouldUpdate) {
      await agentSupabase
        .from('wb_leads')
        .update({
          score: leadScore,
          intent,
          summary,
          customer_name: customerName,
          ...(newStage !== existingLead.stage ? { stage: newStage } : {}),
        })
        .eq('id', existingLead.id);
    }
  } else {
    await agentSupabase.from('wb_leads').insert({
      user_id: userId,
      conversation_id: conversationId,
      customer_name: customerName,
      score: leadScore,
      stage: newStage,
      intent,
      summary,
    });
  }

  if (newStage !== currentStage) {
    await agentSupabase
      .from('wb_conversations')
      .update({ funnel_stage: newStage })
      .eq('id', conversation.id);
  }
}

/**
 * Builds the reasoning_trace JSONB array (GENAI_POC_PRD.md §5.5) from the
 * per-node timings + tool call log accumulated in state. One entry per node
 * that ran before persist (persist's own timing isn't included — it hasn't
 * finished yet at the point this runs).
 */
function buildReasoningTrace(state: AgentState): Array<Record<string, unknown>> {
  return state.nodeTimings.map((t) => {
    const base = { node: t.node, latency_ms: t.latencyMs, timestamp: t.timestamp };
    switch (t.node) {
      case 'ingest':
        return { ...base, decision: 'loaded user/conversation/history', input_summary: state.messageText.slice(0, 100) };
      case 'classify':
        return {
          ...base,
          decision: `intent=${state.intent}`,
          output_summary: `confidence=${state.confidence}, entities=${JSON.stringify(state.entities || {})}`,
        };
      case 'decide_and_retrieve':
        return {
          ...base,
          decision: state.escalated ? `escalated: ${state.escalationReasonFinal}` : `retrieved source=${state.retrievedContext?.source ?? 'none'}`,
          tool_called: state.toolCallLog.map((tc) => tc.tool),
          output_summary: JSON.stringify(state.toolCallLog.map((tc) => ({ tool: tc.tool, ok: tc.ok }))),
        };
      case 'generate':
        return { ...base, decision: 'drafted reply', output_summary: (state.replyDraft || '').slice(0, 150) };
      default:
        return base;
    }
  });
}

/**
 * persist — write the reply to wb_messages, update lead/funnel state (mirrors
 * pipeline-service.ts's deterministic upsertLead/advanceFunnelStage — these
 * stay deterministic, not agentic, per GENAI_POC_PRD.md §5.2). Writes
 * reasoning_trace (migration 011) onto the AI reply row so any AI-replied
 * message can be queried to see exactly why the agent replied what it did.
 */
export async function persistNode(state: AgentState): Promise<AgentStateUpdate> {
  if (state.replyDraft) {
    const sent = await cloudClient.sendMessage(state.userId, state.customerJid, state.replyDraft);
    if (sent) {
      await agentSupabase.from('wb_messages').insert({
        conversation_id: state.conversationId,
        sender: 'ai',
        content: state.replyDraft,
        reasoning_trace: buildReasoningTrace(state),
      });
    } else {
      console.error(`[agent/persist] sendMessage failed for conversation=${state.conversationId} — reply not stored`);
    }
  }

  if (state.intent) {
    await upsertLead(
      state.userId,
      state.conversationId,
      state.customerName,
      state.intent,
      'medium',
      state.summaryUpdate || '',
      state.domain,
      state.conversation
    );
  }

  console.log(
    `[agent/persist] conversation=${state.conversationId} intent=${state.intent} toolCalls=${state.toolCallCount} escalated=${state.escalated}`
  );

  return {};
}
