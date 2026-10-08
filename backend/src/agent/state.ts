import type { BaseDomain } from '../domains/types.js';

/** Media attachment carried into the agent graph (mirrors pipeline-service.ts's MediaAttachment). */
export interface AgentMedia {
  type: 'image' | 'voice';
  data: string;
  mimetype: string;
}

export interface ToolCallLogEntry {
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
  latencyMs: number;
  timestamp: string;
}

export interface RetrievedContext {
  source: 'inventory' | 'knowledge' | 'appointment' | 'none';
  items: unknown[];
  /**
   * Deterministic guidance string for the generate node — e.g. "these slots
   * are available", "this appointment was booked". Mirrors the
   * historyStrings.push('System: ...') pattern pipeline-service.ts already
   * uses to steer generateReply() without changing its function signature.
   */
  systemNote?: string;
}

/** Typed envelope every tool call returns — never a thrown exception (GENAI_POC_PRD.md §5.3). */
export interface ToolEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface AgentEntities {
  product_name?: string | null;
  category?: string | null;
  brand?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  attributes?: Record<string, unknown>;
  /**
   * Set true only when the customer's message is a clear affirmative
   * confirmation of a previously offered specific appointment slot.
   * book_appointment MUST refuse to book unless this is true — resolves
   * GENAI_POC_PRD.md §8 open question 2. There is no equivalent gate in
   * the existing pipeline-service.ts (it books on first proposed_time_iso),
   * so this is new, additive behavior scoped to the agent graph only.
   */
  confirmed_slot?: boolean;
  [key: string]: unknown;
}

/**
 * Single state object threaded through every graph node (LangGraph reducer
 * pattern) — replaces pipeline-service.ts's loose local variables and
 * buildConversationMemory()'s regex-scraped memory string.
 */
export interface AgentState {
  // identity
  userId: string;
  customerJid: string;
  customerName: string;
  customerPhone: string;
  conversationId: string;

  // input
  messageText: string;
  media?: AgentMedia;

  // context loaded at ingest
  user: Record<string, any>;
  domain: BaseDomain;
  conversation: Record<string, any>;
  history: Array<{ sender: string; content: string }>;

  // classification output (from the classify node)
  intent?: string;
  entities?: AgentEntities;
  confidence?: number;
  languageDetected?: string;
  shouldAutoReply?: boolean;
  escalationReason?: string | null;
  summaryUpdate?: string;

  // tool-call tracking
  toolCallLog: ToolCallLogEntry[];
  toolCallCount: number;

  // retrieval output
  retrievedContext?: RetrievedContext;

  // output
  replyDraft?: string;
  escalated: boolean;
  escalationReasonFinal?: string;

  // per-node timing, folded into reasoning_trace by persist (Phase 3)
  nodeTimings: Array<{ node: string; latencyMs: number; timestamp: string }>;
}

/** Partial state update returned by each node — standard LangGraph reducer shape. */
export type AgentStateUpdate = Partial<AgentState>;

export function createInitialToolState(): Pick<AgentState, 'toolCallLog' | 'toolCallCount' | 'escalated' | 'nodeTimings'> {
  return {
    toolCallLog: [],
    toolCallCount: 0,
    escalated: false,
    nodeTimings: [],
  };
}
