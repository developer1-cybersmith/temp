import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { config } from './config/environment.js';
import corsPlugin from './plugins/cors-plugin.js';
import supabasePlugin from './plugins/supabase-plugin.js';
import authPlugin from './plugins/auth-plugin.js';
import { healthRoutes } from './routes/health-routes.js';
import { webhookRoutes } from './routes/webhook-routes.js';
import { conversationRoutes } from './routes/conversation-routes.js';
import { leadRoutes } from './routes/lead-routes.js';
import { taskRoutes } from './routes/task-routes.js';

const fastify = Fastify({
  logger: {
    transport: config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
  },
  bodyLimit: 15 * 1024 * 1024, // 15MB max request body (for multipart file uploads)
});

async function main() {
  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP for API-only server
  });

  // Register plugins
  await fastify.register(corsPlugin);
  await fastify.register(supabasePlugin);
  await fastify.register(authPlugin);

  // Register routes
  await fastify.register(healthRoutes, { prefix: '/api' });
  await fastify.register(webhookRoutes, { prefix: '/api/webhook' });
  await fastify.register(conversationRoutes, { prefix: '/api/conversations' });
  await fastify.register(leadRoutes, { prefix: '/api/leads' });
  await fastify.register(taskRoutes, { prefix: '/api/tasks' });

  const { userRoutes } = await import('./routes/user-routes.js');
  await fastify.register(userRoutes, { prefix: '/api/users' });

  const { knowledgeRoutes } = await import('./routes/knowledge-routes.js');
  await fastify.register(knowledgeRoutes, { prefix: '/api/knowledge' });

  const { catalogRoutes, schemaRoutes } = await import('./routes/catalog-routes.js');
  await fastify.register(catalogRoutes, { prefix: '/api/catalog' });
  await fastify.register(schemaRoutes, { prefix: '/api/schema' });

  const { fileRoutes } = await import('./routes/file-routes.js');
  await fastify.register(fileRoutes, { prefix: '/api/files' });

  const { sheetsRoutes } = await import('./routes/sheets-routes.js');
  await fastify.register(sheetsRoutes, { prefix: '/api/sheets' });

  const { ownerRoutes } = await import('./routes/owner-routes.js');
  await fastify.register(ownerRoutes, { prefix: '/api/owner' });

  const { customerRoutes } = await import('./routes/customer-routes.js');
  await fastify.register(customerRoutes, { prefix: '/api/customers' });

  const { visitRoutes } = await import('./routes/visit-routes.js');
  await fastify.register(visitRoutes, { prefix: '/api/visits' });

  const { voiceRoutes } = await import('./routes/voice-routes.js');
  await fastify.register(voiceRoutes, { prefix: '/api/voice' });

  // Voice agent webhook (Vapi) — no auth required, Vapi calls directly
  const { vapiRoutes } = await import('./routes/vapi-routes.js');
  await fastify.register(vapiRoutes, { prefix: '/api/vapi' });


  // Initialize Cron Service
  const { CronService } = await import('./services/cron-service.js');
  const cronService = new CronService(fastify.supabase);
  cronService.init();

  // Start server
  try {
    await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`\n🚀 VyavsayAssist API running on http://localhost:${config.PORT}`);
    console.log(`📡 Health:   http://localhost:${config.PORT}/api/health`);
    console.log(`📲 Webhook:  http://localhost:${config.PORT}/api/webhook/whatsapp`);
    console.log(`🔒 Auth: Enabled | Helmet: Enabled | Env: ${config.NODE_ENV}\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

process.on('unhandledRejection', (err) => {
  console.error('⚠️ Unhandled Rejection:', err);
});

main();
