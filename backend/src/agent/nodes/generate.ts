import { agentOpenai, AGENT_MODEL } from '../openai-client.js';
import { withAbortTimeout } from '../abortable-call.js';
import type { AgentState, AgentStateUpdate } from '../state.js';

const GENERATE_TIMEOUT_MS = 10000; // GENAI_POC_PRD.md §5.4 per-node budget

/**
 * generate — drafts the reply. Reuses ai-router.ts's generateReply PROMPT
 * CONSTRUCTION (domain.replyPrompt + inventory/knowledge formatting) but
 * makes its own HTTP call with AbortController — see classify.ts for why
 * generateReply() itself isn't called directly (ai-router.ts must stay
 * untouched, and its internal timeout is Promise.race-based).
 */
export async function generateNode(state: AgentState): Promise<AgentStateUpdate> {
  const domain = state.domain;
  const historyStrings = state.history.map((m) => `${m.sender}: ${m.content}`);

  if (state.retrievedContext?.systemNote) {
    historyStrings.push(state.retrievedContext.systemNote);
  }

  // Mirrors ai-router.ts's generateReply() inventory/knowledge formatting exactly.
  let inventoryInfo = '';
  if (state.retrievedContext?.source === 'inventory') {
    const items = (state.retrievedContext.items as any[]).slice(0, 5);
    if (items.length > 0) {
      const SKIP_KEYS = /(image|img|photo|pic|url|link|description)/i;
      const CORE_KEYS = ['item_name', 'category', 'price', 'quantity'];
      inventoryInfo += '\nAVAILABLE PRODUCTS FROM INVENTORY (REAL DATA — use this!):\n';
      items.forEach((item, i) => {
        const price = item.price ? domain.formatInventoryPrice(item.price) : 'Price on request';
        const attrs = item.attributes
          ? Object.entries(item.attributes)
              .filter(([k, v]) => {
                if (v === null || v === undefined) return false;
                if (SKIP_KEYS.test(k)) return false;
                if (CORE_KEYS.includes(k)) return true;
                const strVal = String(v);
                if (strVal.length >= 50) return false;
                if (/^https?:\/\//i.test(strVal)) return false;
                return true;
              })
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')
          : '';
        inventoryInfo += `${i + 1}. ${item.item_name}${item.category ? ` (${item.category})` : ''} — ₹${price}, ${item.quantity} in stock${attrs ? `, ${attrs}` : ''}\n`;
      });
    }
  }

  const knowledgeChunks = state.retrievedContext?.source === 'knowledge'
    ? (state.retrievedContext.items as string[]).slice(0, 3).map((c) => (c.length > 400 ? c.slice(0, 400) + '...' : c))
    : [];

  const prompt = domain.replyPrompt.buildSystemPrompt({
    businessName: state.user.business_name || 'our business',
    industry: state.user.industry || 'Services',
    services: (state.user.services || []).join(', ') || 'Various',
    conversationMemory: '',
    inventoryInfo,
    knowledgeContext: knowledgeChunks.length > 0 ? 'KNOWLEDGE BASE:\n' + knowledgeChunks.join('\n---\n') : '',
    language: state.languageDetected || 'en',
  });

  const mappedMessages: any[] = [{ role: 'system', content: prompt }];
  historyStrings.slice(-domain.limits.historyLlmLimit).forEach((msgString) => {
    if (msgString.startsWith('ai: ')) {
      mappedMessages.push({ role: 'assistant', content: msgString.replace('ai: ', '') });
    } else {
      mappedMessages.push({ role: 'user', content: msgString.replace(/^.*?: /, '') });
    }
  });
  mappedMessages.push({ role: 'user', content: state.messageText.slice(0, 1500) });

  try {
    const response = await withAbortTimeout(GENERATE_TIMEOUT_MS, 'generate', (signal) =>
      agentOpenai.chat.completions.create(
        {
          model: AGENT_MODEL,
          messages: mappedMessages,
          ...domain.llmParams.reply,
        },
        { signal }
      )
    );
    return { replyDraft: response.choices[0].message.content || domain.fallbacks.aiFailure };
  } catch (err: any) {
    console.error('❌ [agent/generate] AI reply generation failed:', err.message);
    return { replyDraft: domain.fallbacks.aiFailure };
  }
}
