import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SheetsSyncService } from '../services/sheets-sync-service.js';

export const sheetsRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  const sheetsSync = new SheetsSyncService();

  // Export dashboard inventory → Google Sheet
  server.post('/export-to-sheet', async (request, reply) => {
    try {
      const count = await sheetsSync.exportToSheet(server.supabase, request.userId);
      return reply.send({ success: true, message: `Exported ${count} items to Google Sheet` });
    } catch (err: any) {
      console.error('Sheet export error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Import from Google Sheet → dashboard inventory
  server.post('/import-from-sheet', async (request, reply) => {
    try {
      const result = await sheetsSync.importFromSheet(server.supabase, request.userId);
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      console.error('Sheet import error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });

  // Full bidirectional sync
  server.post('/sync', async (request, reply) => {
    try {
      const result = await sheetsSync.syncBidirectional(server.supabase, request.userId);
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      console.error('Sheet sync error:', err.message);
      return reply.status(500).send({ error: err.message });
    }
  });
};
