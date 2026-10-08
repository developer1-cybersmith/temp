import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { validate, leadUpdate } from '../utils/validation.js';

export const leadRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  server.get('/', async (request, reply) => {
    try {
      const { stage, score } = request.query as { stage?: string; score?: string };
      let query = server.supabase
        .from('wb_leads')
        .select('*, wb_conversations(customer_jid, customer_name, customer_phone, last_message_at)')
        .eq('user_id', request.userId)
        .order('updated_at', { ascending: false });

      if (stage) query = query.eq('stage', stage);
      if (score) query = query.eq('score', score);

      const { data, error } = await query.limit(100);
      if (error) return reply.status(500).send({ error: 'Failed to fetch leads' });
      return reply.send({ leads: data || [] });
    } catch (err: any) {
      console.error('❌ GET /leads error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  server.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = validate(leadUpdate, request.body, reply);
    if (!updates) return;

    try {
      const { data, error } = await server.supabase
        .from('wb_leads')
        .update(updates)
        .eq('id', id)
        .eq('user_id', request.userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') return reply.status(404).send({ error: 'Lead not found' });
        console.error('❌ Lead update error:', error);
        return reply.status(500).send({ error: 'Failed to update lead' });
      }
      return reply.send({ lead: data });
    } catch (err: any) {
      console.error('❌ PATCH /leads/:id error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
};
