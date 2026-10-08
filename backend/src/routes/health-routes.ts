import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { reminderService } from '../services/reminder-service.js';

const startTime = Date.now();

export const healthRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  /** Public health check — no auth required */
  server.get('/health', async (_request, reply) => {
    const uptimeMs = Date.now() - startTime;
    const hours = Math.floor(uptimeMs / 3600000);
    const minutes = Math.floor((uptimeMs % 3600000) / 60000);

    return reply.send({
      status: 'ok',
      uptime: `${hours}h ${minutes}m`,
      activeReminders: reminderService.activeCount,
    });
  });

  /** Analytics / dashboard metrics — scoped to authenticated user */
  server.get('/analytics', async (request, reply) => {
    try {
      const userId = request.userId;

      const queries = await Promise.all([
        server.supabase.from('wb_conversations').select('id', { count: 'exact' }).eq('user_id', userId),
        server.supabase.from('wb_messages').select('id, conversation_id', { count: 'exact' }),
        server.supabase.from('wb_leads').select('id, score, stage', { count: 'exact' }).eq('user_id', userId),
        server.supabase.from('wb_tasks').select('id, is_completed', { count: 'exact' }).eq('user_id', userId),
        server.supabase.from('wb_messages').select('sender').eq('sender', 'ai'),
      ]);

      const [convos, _msgs, leads, tasks, aiMsgs] = queries;

      const errors = queries.filter((q: any) => q.error).map((q: any) => q.error);
      if (errors.length > 0) {
        server.log.error({ errors }, 'Supabase query errors in analytics');
        return reply.status(500).send({ error: 'Failed to fetch analytics' });
      }

      // Lead distribution
      const leadsByScore = { high: 0, medium: 0, low: 0 };
      const leadsByStage: Record<string, number> = {};
      (leads.data || []).forEach((l: any) => {
        if (l.score in leadsByScore) leadsByScore[l.score as keyof typeof leadsByScore]++;
        leadsByStage[l.stage] = (leadsByStage[l.stage] || 0) + 1;
      });

      const completedTasks = (tasks.data || []).filter((t: any) => t.is_completed).length;

      return reply.send({
        totalConversations: convos.count || 0,
        totalLeads: leads.count || 0,
        leadsByScore,
        leadsByStage,
        totalTasks: tasks.count || 0,
        completedTasks,
        aiMessagesCount: aiMsgs.data?.length || 0,
      });
    } catch (err: any) {
      server.log.error(err, 'Critical error in analytics route');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
