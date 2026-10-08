import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { validate, knowledgeCreate } from '../utils/validation.js';

export const knowledgeRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  server.get('/', async (request, reply) => {
    try {
      const { data, error } = await server.supabase
        .from('wb_knowledge_base')
        .select('*')
        .eq('user_id', request.userId)
        .order('created_at', { ascending: false });

      if (error) return reply.status(500).send({ error: 'Failed to fetch knowledge items' });
      return reply.send(data);
    } catch (err: any) {
      console.error('❌ GET /knowledge error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  server.post('/', async (request, reply) => {
    const body = validate(knowledgeCreate, request.body, reply);
    if (!body) return;

    try {
      const { pipelineService } = await import('../services/pipeline-service.js');
      const storedCount = await pipelineService.getRagService().embedAndStore(request.userId, body.content);

      if (storedCount === 0) {
        return reply.status(400).send({ error: 'Content already exists or failed to generate embeddings' });
      }
      return reply.send({ success: true, count: storedCount });
    } catch (err: any) {
      console.error('❌ Knowledge sync failed:', err.message);
      return reply.status(500).send({ error: 'Failed to process knowledge content' });
    }
  });

  server.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { error } = await server.supabase
        .from('wb_knowledge_base')
        .delete()
        .match({ id, user_id: request.userId });

      if (error) return reply.status(500).send({ error: 'Failed to delete knowledge item' });
      return reply.send({ success: true });
    } catch (err: any) {
      console.error('❌ DELETE /knowledge/:id error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
};
