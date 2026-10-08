import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { config } from '../config/environment.js';

export default fp(async (fastify) => {
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }

      // In development, allow any localhost
      if (config.NODE_ENV === 'development' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        cb(null, true);
        return;
      }

      // In production, allow the configured frontend URL
      if (config.FRONTEND_URL && origin === config.FRONTEND_URL) {
        cb(null, true);
        return;
      }

      cb(new Error('CORS not allowed'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
});
