import type OpenAI from 'openai';
import { CatalogService } from '../services/catalog-service.js';
import { RagService } from '../services/rag-service.js';
import { AppointmentService } from '../services/appointment-service.js';
import { agentSupabase } from './supabase-client.js';
import type { AgentState, ToolEnvelope } from './state.js';

const rag = new RagService(agentSupabase);
const catalog = new CatalogService(agentSupabase, rag);
const appointments = new AppointmentService(agentSupabase);

/**
 * Four tools per GENAI_POC_PRD.md §5.3, declared for the OpenAI `tools` API.
 * The LLM in decide_and_retrieve chooses which of these to call (if any) —
 * this file only defines schema + typed execution, not the decision itself.
 */
export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_inventory',
      description: 'Search the dealership\'s vehicle inventory (read-only). Use for product/pricing/browse questions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text search query, e.g. the customer\'s message or a product description' },
          category: { type: 'string', description: 'Body type or category, e.g. SUV, Sedan' },
          brand: { type: 'string', description: 'Vehicle brand/manufacturer' },
          price_min: { type: 'number', description: 'Minimum price in INR' },
          price_max: { type: 'number', description: 'Maximum price in INR' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_knowledge_base',
      description: 'Search the business\'s general knowledge base (read-only). Use for questions not about specific inventory items — policies, financing, general info.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The customer question to search for' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_appointment_availability',
      description: 'Check available appointment/test-drive slots for a given date (read-only).',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Book a confirmed appointment slot (write). Only call this if the customer has explicitly confirmed a SPECIFIC previously-offered date/time — never on a first ambiguous request. If unsure, call check_appointment_availability first and ask the customer to confirm.',
      parameters: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service/appointment type, e.g. Test Drive' },
          dateTimeIso: { type: 'string', description: 'Confirmed ISO datetime to book, e.g. 2026-07-20T14:00:00+05:30' },
        },
        required: ['service', 'dateTimeIso'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'Hand off the conversation to a human team member and stop auto-replying. Use for complaints, frustrated/negative sentiment, or requests beyond the assistant\'s authority (e.g. final price approval beyond negotiation limits).',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Short reason for escalation' },
        },
        required: ['reason'],
      },
    },
  },
];

export interface ToolExecutionResult {
  envelope: ToolEnvelope;
  /** Context to fold into AgentState.retrievedContext when this tool produced retrievable data. */
  retrievedContext?: { source: 'inventory' | 'knowledge' | 'appointment'; items: unknown[]; systemNote?: string };
  escalated?: boolean;
  escalationReason?: string;
}

async function execSearchInventory(args: any, state: AgentState): Promise<ToolExecutionResult> {
  const items = await catalog.hybridSearch(state.userId, args.query || state.messageText, {
    product_name: undefined,
    category: args.category,
    price_min: args.price_min,
    price_max: args.price_max,
  });
  return {
    envelope: { ok: true, data: { count: items.length, items: items.slice(0, 5) } },
    retrievedContext: { source: 'inventory', items },
  };
}

async function execLookupKnowledgeBase(args: any, state: AgentState): Promise<ToolExecutionResult> {
  const chunks = await rag.searchKnowledge(state.userId, args.query || state.messageText);
  return {
    envelope: { ok: true, data: { count: chunks.length, chunks } },
    retrievedContext: { source: 'knowledge', items: chunks },
  };
}

async function checkAvailability(userId: string, date: string): Promise<ToolExecutionResult> {
  const slots = await appointments.getAvailableSlots(userId, date);
  const note = slots.length > 0
    ? `System: Available appointment slots on ${date}: ${slots.join(', ')}. Share these with the customer and ask them to pick one.`
    : `System: No appointment slots available on ${date}. Ask the customer to pick another day.`;
  return {
    envelope: { ok: true, data: { date, slots } },
    retrievedContext: { source: 'appointment', items: slots, systemNote: note },
  };
}

async function execBookAppointment(args: any, state: AgentState): Promise<ToolExecutionResult> {
  if (!state.entities?.confirmed_slot) {
    return {
      envelope: {
        ok: false,
        error: 'Booking requires the customer to have explicitly confirmed this specific slot in this conversation first. Ask them to confirm before calling book_appointment again.',
      },
    };
  }
  if (!args.service || !args.dateTimeIso) {
    return { envelope: { ok: false, error: 'service and dateTimeIso are required' } };
  }

  const result = await appointments.bookSlot(state.userId, {
    customerName: state.customerName,
    service: args.service,
    dateTimeIso: args.dateTimeIso,
    conversationId: state.conversationId,
  });

  if (!result.success) {
    return {
      envelope: { ok: false, error: result.message },
      retrievedContext: {
        source: 'appointment',
        items: result.alternatives || [],
        systemNote: `System: The requested slot is not available. ${result.message}`,
      },
    };
  }

  return {
    envelope: { ok: true, data: { message: result.message } },
    retrievedContext: {
      source: 'appointment',
      items: [],
      systemNote: `System: ${result.message}. Confirm this warmly with the customer.`,
    },
  };
}

/**
 * Fixes the known ai_paused bug noted in GENAI_POC_PRD.md §5.3 — the old
 * pipeline's complaint handoff sends a handoff message but never sets
 * ai_paused, so auto-replies continue. This path sets it correctly,
 * scoped only to the new agent graph (pipeline-service.ts untouched).
 * Exported so decide-and-retrieve.ts's hard tool-call cap (§5.4) can force
 * the same escalation without duplicating the DB write.
 */
export async function escalateConversation(conversationId: string, reason: string): Promise<void> {
  await agentSupabase
    .from('wb_conversations')
    .update({ ai_paused: true })
    .eq('id', conversationId);
}

async function execEscalateToHuman(args: any, state: AgentState): Promise<ToolExecutionResult> {
  const reason = args.reason || 'Escalated by agent';
  await escalateConversation(state.conversationId, reason);

  return {
    envelope: { ok: true, data: { reason } },
    escalated: true,
    escalationReason: reason,
  };
}

/** Execute a single tool call by name, returning a typed envelope — never throws. */
export async function executeTool(name: string, args: any, state: AgentState): Promise<ToolExecutionResult> {
  try {
    switch (name) {
      case 'search_inventory':
        return await execSearchInventory(args, state);
      case 'lookup_knowledge_base':
        return await execLookupKnowledgeBase(args, state);
      case 'check_appointment_availability':
        if (!args.date || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
          return { envelope: { ok: false, error: 'date must be in YYYY-MM-DD format' } };
        }
        return await checkAvailability(state.userId, args.date);
      case 'book_appointment':
        return await execBookAppointment(args, state);
      case 'escalate_to_human':
        return await execEscalateToHuman(args, state);
      default:
        return { envelope: { ok: false, error: `Unknown tool: ${name}` } };
    }
  } catch (err: any) {
    return { envelope: { ok: false, error: err.message || 'Tool execution failed' } };
  }
}
