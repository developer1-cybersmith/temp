import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { FileProcessorService } from '../services/file-processor.js';
import { CatalogService } from '../services/catalog-service.js';
import { RagService } from '../services/rag-service.js';
import { validate, fileProcess } from '../utils/validation.js';

export const fileRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Register multipart support for this scope
  await server.register(multipart, {
    limits: {
        fileSize: 15 * 1024 * 1024, // 15MB max
    },
  });

  const processor = new FileProcessorService();
  const rag = new RagService(server.supabase);
  const catalog = new CatalogService(server.supabase, rag);

  /**
   * Upload and parse a file (Excel/CSV)
   * Returns: columns detected, preview rows, fileId
   */
  server.post('/upload', async (request, reply) => {
    const userId = request.userId;

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const filename = file.filename;
    const ext = filename.split('.').pop()?.toLowerCase();

    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
      return reply.status(400).send({ error: 'Only .xlsx, .xls, and .csv files are supported' });
    }

    try {
      // Read file buffer
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Parse based on file type
      let parseResult;
      const fileType = ext === 'csv' ? 'csv' : 'excel';

      if (fileType === 'csv') {
        parseResult = processor.parseCSV(buffer);
      } else {
        parseResult = await processor.parseExcel(buffer);
      }

      // Store file reference in database
      const { data: fileRecord, error: fileError } = await server.supabase
        .from('wb_source_files')
        .insert({
          user_id: userId,
          filename,
          file_type: fileType,
          file_hash: parseResult.fileHash,
          data_type: 'structured',
          row_count: parseResult.totalRows,
          processing_status: 'parsed',
        })
        .select()
        .single();

      if (fileError) {
        return reply.status(500).send({ error: 'Failed to save file record' });
      }

      return reply.send({
        fileId: fileRecord.id,
        filename,
        fileType,
        totalRows: parseResult.totalRows,
        columns: parseResult.columns,
        preview: parseResult.rows.slice(0, 5), // first 5 rows as preview
        rows: parseResult.rows, // full dataset for processing
      });
    } catch (err: any) {
      console.error('❌ File parse error:', err.message);
      return reply.status(400).send({ error: `Failed to parse file: ${err.message}` });
    }
  });

  /**
   * Process a parsed file with column mapping
   * Takes fileId + columnMapping → creates catalog items
   */
  server.post('/:fileId/process', async (request, reply) => {
    const userId = request.userId;
    const { fileId } = request.params as { fileId: string };
    const body = validate(fileProcess, request.body, reply);
    if (!body) return;
    const { columnMapping, rows } = body;

    try {
      // Verify file belongs to user
      const { data: fileRecord } = await server.supabase
        .from('wb_source_files')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', userId)
        .single();

      if (!fileRecord) {
        return reply.status(404).send({ error: 'File not found' });
      }
      // Update file status
      await server.supabase
        .from('wb_source_files')
        .update({ processing_status: 'processing' })
        .eq('id', fileId);

      // Map rows to catalog items using the column mapping
      const catalogItems = processor.mapRowsToCatalogItems(rows, columnMapping);

      if (catalogItems.length === 0) {
        return reply.status(400).send({ error: 'No valid items found after mapping. Make sure item_name is mapped.' });
      }

      // Batch add to catalog with embeddings
      const result = await catalog.batchAddItems(userId, catalogItems, fileId);

      // Update file status
      await server.supabase
        .from('wb_source_files')
        .update({
          processing_status: 'completed',
          row_count: result.added,
          processed_at: new Date().toISOString(),
        })
        .eq('id', fileId);

      // Auto-save schema from column mapping if user doesn't have one yet
      const { data: userRecord } = await server.supabase
        .from('wb_users')
        .select('inventory_schema')
        .eq('id', userId)
        .single();

      if (userRecord && (!userRecord.inventory_schema?.fields || userRecord.inventory_schema.fields.length === 0)) {
        // Auto-generate schema from the column mapping
        const fields = Object.entries(columnMapping)
          .filter(([_, target]) => target.startsWith('attributes.'))
          .map(([source, target]) => ({
            key: target.replace('attributes.', ''),
            label: source,
            type: 'text' as const,
            required: false,
          }));

        if (fields.length > 0) {
          await server.supabase
            .from('wb_users')
            .update({ inventory_schema: { fields } })
            .eq('id', userId);
        }
      }

      return reply.send({
        success: true,
        added: result.added,
        failed: result.failed,
        total: catalogItems.length,
      });
    } catch (err: any) {
      // Update file status on error
      await server.supabase
        .from('wb_source_files')
        .update({
          processing_status: 'failed',
          error_message: err.message,
        })
        .eq('id', fileId);

      console.error('❌ File processing error:', err.message);
      return reply.status(500).send({ error: `Processing failed: ${err.message}` });
    }
  });

  /** List uploaded files */
  server.get('/', async (request, reply) => {
    try {
      const userId = request.userId;

      const { data, error } = await server.supabase
        .from('wb_source_files')
        .select('*')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });

      if (error) return reply.status(500).send({ error: 'Failed to fetch files' });
      return reply.send({ files: data || [] });
    } catch (err: any) {
      console.error('❌ GET /files error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /** Delete a file and its associated catalog items */
  server.delete('/:fileId', async (request, reply) => {
    try {
      const userId = request.userId;
      const { fileId } = request.params as { fileId: string };

      // Soft-delete catalog items from this file
      await server.supabase
        .from('wb_catalog_items')
        .update({ is_active: false })
        .eq('source_file_id', fileId)
        .eq('user_id', userId);

      // Delete the file record
      const { error } = await server.supabase
        .from('wb_source_files')
        .delete()
        .eq('id', fileId)
        .eq('user_id', userId);

      if (error) return reply.status(500).send({ error: 'Failed to delete file' });
      return reply.send({ success: true });
    } catch (err: any) {
      console.error('❌ DELETE /files/:fileId error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
};
