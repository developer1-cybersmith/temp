import fp from 'fastify-plugin';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/environment.js';

// Augment Fastify types so request.userId is available everywhere
declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
    isOwner: boolean;
  }
}

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/health',
  '/api/vapi/webhook',
  '/api/webhook/whatsapp',
];

// Use the anon-key client for auth verification (not service role)
const authClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY || config.SUPABASE_SERVICE_ROLE_KEY);

export default fp(async (fastify) => {
  fastify.decorateRequest('userId', '');
  fastify.decorateRequest('userEmail', '');
  fastify.decorateRequest('isOwner', false);

  fastify.addHook('onRequest', async (request, reply) => {
    // Skip auth for public routes
    if (PUBLIC_ROUTES.some(route => request.url.startsWith(route))) {
      return;
    }

    // Skip auth for OPTIONS (CORS preflight)
    if (request.method === 'OPTIONS') {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      const { data: { user }, error } = await authClient.auth.getUser(token);

      if (error || !user) {
        fastify.log.warn({ error }, 'Invalid or expired token');
        return reply.status(401).send({ error: 'Invalid or expired token' });
      }

      // Attach verified user ID to request — all routes use this instead of query/body userId
      request.userId = user.id;
      request.userEmail = user.email || '';
      request.isOwner = Boolean(user.email && config.OWNER_EMAILS.includes(user.email.toLowerCase()));
      if (request.method === 'PATCH' || request.method === 'GET') {
        fastify.log.info({ userId: user.id, method: request.method, url: request.url }, 'Auth successful');
      }
    } catch (err: any) {
      fastify.log.error(err, 'Authentication exception');
      return reply.status(401).send({ error: 'Authentication failed' });
    }
  });
});
