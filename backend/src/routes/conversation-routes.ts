import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { validate, conversationUpdate, sendMessage } from '../utils/validation.js';

export const conversationRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  server.get('/', async (request, reply) => {
    try {
      const { status } = request.query as { status?: string };
      let query = server.supabase
        .from('wb_conversations')
        .select('*, wb_leads(score, stage, intent)')
        .eq('user_id', request.userId)
        .order('last_message_at', { ascending: false });

      if (status) query = query.eq('status', status);
      const { data, error } = await query.limit(50);
      if (error) return reply.status(500).send({ error: 'Failed to fetch conversations' });
      return reply.send({ conversations: data || [] });
    } catch (err: any) {
      console.error('❌ GET /conversations error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  server.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { data: conversation, error: convoError } = await server.supabase
        .from('wb_conversations')
        .select('*')
        .eq('id', id)
        .eq('user_id', request.userId)
        .single();

      if (convoError || !conversation) return reply.status(404).send({ error: 'Conversation not found' });

      const { data: messages, error: msgError } = await server.supabase
        .from('wb_messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (msgError) console.error('⚠️ Messages fetch error:', msgError);

      return reply.send({ conversation, messages: messages || [] });
    } catch (err: any) {
      console.error('❌ GET /conversations/:id error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  server.get('/:id/messages', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { limit: lim } = request.query as { limit?: string };

      const { data: convo } = await server.supabase
        .from('wb_conversations')
        .select('id')
        .eq('id', id)
        .eq('user_id', request.userId)
        .single();
      if (!convo) return reply.status(404).send({ error: 'Conversation not found' });

      const parsedLimit = parseInt(lim || '100', 10);
      const safeLimit = Math.min(Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 100), 500);

      const { data, error } = await server.supabase
        .from('wb_messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true })
        .limit(safeLimit);

      if (error) return reply.status(500).send({ error: 'Failed to fetch messages' });
      return reply.send({ messages: data || [] });
    } catch (err: any) {
      console.error('❌ GET /conversations/:id/messages error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  server.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = validate(conversationUpdate, request.body, reply);
    if (!updates) return;

    try {
      const { data, error } = await server.supabase
        .from('wb_conversations')
        .update(updates)
        .eq('id', id)
        .eq('user_id', request.userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') return reply.status(404).send({ error: 'Conversation not found' });
        return reply.status(500).send({ error: 'Failed to update conversation' });
      }
      return reply.send({ conversation: data });
    } catch (err: any) {
      console.error('❌ PATCH /conversations/:id error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  server.post('/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = validate(sendMessage, request.body, reply);
    if (!body) return;

    try {
      const { data: convo } = await server.supabase
        .from('wb_conversations')
        .select('customer_jid')
        .eq('id', id)
        .eq('user_id', request.userId)
        .single();
      if (!convo) return reply.status(404).send({ error: 'Conversation not found' });

      const { error: insertError } = await server.supabase.from('wb_messages').insert({
        conversation_id: id,
        sender: 'user',
        content: body.content,
      });
      if (insertError) return reply.status(500).send({ error: 'Failed to store message' });

      if (convo.customer_jid) {
        try {
          const { cloudClient } = await import('../services/whatsapp-cloud-client.js');
          await cloudClient.sendMessage(request.userId, convo.customer_jid, body.content);
        } catch (err: any) {
          console.warn(`⚠️ Could not send via WhatsApp: ${err.message}`);
        }
      }

      return reply.send({ success: true });
    } catch (err: any) {
      console.error('❌ POST /conversations/:id/messages error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
};
