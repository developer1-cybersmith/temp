import { agentSupabase } from '../supabase-client.js';
import { getDomain } from '../../domains/domain-router.js';
import type { AgentState, AgentStateUpdate } from '../state.js';

/**
 * ingest — fetch/create user + conversation, load history. Deterministic,
 * not an LLM call. Mirrors pipeline-service.ts steps 1-4 (processIncomingMessage)
 * but reimplemented standalone here since pipeline-service.ts must remain
 * untouched per GENAI_POC_PRD.md ground rules.
 */
export async function ingestNode(state: AgentState): Promise<AgentStateUpdate> {
  const { userId, customerJid, customerName, customerPhone } = state;

  let { data: user } = await agentSupabase
    .from('wb_users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!user) {
    const { data: newUser } = await agentSupabase
      .from('wb_users')
      .insert({
        id: userId,
        email: `${userId.slice(0, 8)}@demo.com`,
        business_name: 'Demo Business',
        auto_reply_enabled: true,
      })
      .select()
      .single();
    user = newUser;
  }

  if (!user) {
    throw new Error(`[agent/ingest] Could not find/create user ${userId.slice(0, 8)}`);
  }

  const domain = getDomain(user.industry);

  let { data: conversation } = await agentSupabase
    .from('wb_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('customer_jid', customerJid)
    .single();

  if (!conversation) {
    const { data: newConvo } = await agentSupabase
      .from('wb_conversations')
      .insert({
        user_id: userId,
        customer_jid: customerJid,
        customer_name: customerName,
        customer_phone: customerPhone,
        status: 'active',
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();
    conversation = newConvo;
  } else {
    await agentSupabase
      .from('wb_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        customer_name: customerName,
      })
      .eq('id', conversation.id);
  }

  if (!conversation) {
    throw new Error('[agent/ingest] Failed to find/create conversation');
  }

  // Store incoming message
  const mediaTypeForDb = state.media?.type === 'voice' ? 'voice' : state.media?.type === 'image' ? 'image' : null;
  const storedContent = state.media?.type === 'voice' ? `🎤 [Voice Note]: ${state.messageText}` : state.messageText;
  await agentSupabase.from('wb_messages').insert({
    conversation_id: conversation.id,
    sender: 'customer',
    content: storedContent,
    media_type: mediaTypeForDb,
  });

  const { data: history } = await agentSupabase
    .from('wb_messages')
    .select('sender, content')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
    .limit(domain.limits.historyLoadLimit);

  return {
    user,
    domain,
    conversation,
    conversationId: conversation.id,
    history: history || [],
  };
}
