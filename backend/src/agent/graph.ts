import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { ingestNode } from './nodes/ingest.js';
import { classifyNode } from './nodes/classify.js';
import { decideAndRetrieveNode } from './nodes/decide-and-retrieve.js';
import { generateNode } from './nodes/generate.js';
import { persistNode } from './nodes/persist.js';
import type {
  AgentEntities, AgentMedia, RetrievedContext, ToolCallLogEntry,
} from './state.js';
import type { BaseDomain } from '../domains/types.js';
import type { AgentState, AgentStateUpdate } from './state.js';

/** Wraps a node with latency tracking, folded into AgentState.nodeTimings for the reasoning_trace (§5.5). */
function withTiming(name: string, fn: (state: AgentState) => Promise<AgentStateUpdate>) {
  return async (state: AgentState): Promise<AgentStateUpdate> => {
    const start = Date.now();
    const update = await fn(state);
    return {
      ...update,
      nodeTimings: [
        ...state.nodeTimings,
        { node: name, latencyMs: Date.now() - start, timestamp: new Date().toISOString() },
      ],
    };
  };
}

/**
 * LangGraph channel definitions mirroring state.ts's AgentState interface.
 * Every field uses last-write-wins (default reducer) — each node computes
 * and returns the full replacement value for any array field it touches,
 * so no custom accumulating reducer is required.
 */
const AgentStateAnnotation = Annotation.Root({
  userId: Annotation<string>(),
  customerJid: Annotation<string>(),
  customerName: Annotation<string>(),
  customerPhone: Annotation<string>(),
  conversationId: Annotation<string>({ reducer: (_p, n) => n, default: () => '' }),

  messageText: Annotation<string>(),
  media: Annotation<AgentMedia | undefined>(),

  user: Annotation<Record<string, any>>(),
  domain: Annotation<BaseDomain>(),
  conversation: Annotation<Record<string, any>>(),
  history: Annotation<Array<{ sender: string; content: string }>>(),

  intent: Annotation<string | undefined>(),
  entities: Annotation<AgentEntities | undefined>(),
  confidence: Annotation<number | undefined>(),
  languageDetected: Annotation<string | undefined>(),
  shouldAutoReply: Annotation<boolean | undefined>(),
  escalationReason: Annotation<string | null | undefined>(),
  summaryUpdate: Annotation<string | undefined>(),

  toolCallLog: Annotation<ToolCallLogEntry[]>({ reducer: (_p, n) => n, default: () => [] }),
  toolCallCount: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),

  retrievedContext: Annotation<RetrievedContext | undefined>(),

  replyDraft: Annotation<string | undefined>(),
  escalated: Annotation<boolean>({ reducer: (_p, n) => n, default: () => false }),
  escalationReasonFinal: Annotation<string | undefined>(),

  nodeTimings: Annotation<Array<{ node: string; latencyMs: number; timestamp: string }>>({
    reducer: (_p, n) => n,
    default: () => [],
  }),
});

export type AgentGraphState = typeof AgentStateAnnotation.State;

/**
 * Five-node graph per GENAI_POC_PRD.md §5.2. Conditional edge routes
 * decide_and_retrieve → persist directly on escalation (skip reply
 * generation), otherwise → generate → persist. Phase 1 skeleton has no
 * escalation path yet (decide_and_retrieve is unconditional
 * search_inventory), so the conditional always takes the generate branch —
 * the branch exists now so Phase 2 only has to change the node body, not
 * the graph shape.
 */
function buildGraph() {
  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('ingest', withTiming('ingest', ingestNode))
    .addNode('classify', withTiming('classify', classifyNode))
    .addNode('decide_and_retrieve', withTiming('decide_and_retrieve', decideAndRetrieveNode))
    .addNode('generate', withTiming('generate', generateNode))
    .addNode('persist', withTiming('persist', persistNode))
    .addEdge(START, 'ingest')
    .addConditionalEdges(
      'ingest',
      // GENAI_POC_PRD.md acceptance criterion #2: once escalate_to_human sets
      // ai_paused, no further auto-reply should happen on later messages in
      // that conversation. Deterministic gate, not an LLM decision.
      (state: AgentGraphState) => (state.conversation?.ai_paused ? 'end' : 'classify'),
      { classify: 'classify', end: END }
    )
    .addEdge('classify', 'decide_and_retrieve')
    .addConditionalEdges(
      'decide_and_retrieve',
      (state: AgentGraphState) => (state.escalated ? 'persist' : 'generate'),
      { generate: 'generate', persist: 'persist' }
    )
    .addEdge('generate', 'persist')
    .addEdge('persist', END);

  return graph.compile();
}

const compiledGraph = buildGraph();

export interface RunAgentGraphInput {
  userId: string;
  customerJid: string;
  customerName: string;
  customerPhone: string;
  messageText: string;
  media?: AgentMedia;
}

/**
 * Entry point called from webhook-routes.ts when USE_AGENT_GRAPH=true.
 * Runs alongside (never replacing) pipelineService.processIncomingMessage().
 */
export async function runAgentGraph(input: RunAgentGraphInput): Promise<AgentGraphState> {
  const initialState: Partial<AgentGraphState> = {
    userId: input.userId,
    customerJid: input.customerJid,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    conversationId: '', // set by ingestNode from conversation.id
    messageText: input.messageText,
    media: input.media,
    toolCallLog: [],
    toolCallCount: 0,
    escalated: false,
    nodeTimings: [],
  };

  const result = await compiledGraph.invoke(initialState as AgentGraphState);
  return result;
}
