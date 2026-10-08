import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import ExcelJS from 'exceljs';
import { CatalogService } from '../services/catalog-service.js';
import { RagService } from '../services/rag-service.js';
import { validate, catalogItemCreate, catalogItemUpdate, catalogQuery, catalogBatch, schemaUpdate } from '../utils/validation.js';
import { uploadCatalogImages } from '../services/catalog-image-service.js';

export const catalogRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  await server.register(multipart, {
    limits: {
        fileSize: 15 * 1024 * 1024, // 15MB max per file
      files: 5,
    },
  });

  const rag = new RagService(server.supabase);
  const catalog = new CatalogService(server.supabase, rag);

  /** List catalog items — paginated, filtered, sorted */
  server.get('/', async (request, reply) => {
    const userId = request.userId;
    const filters = validate(catalogQuery, request.query, reply);
    if (!filters) return;

    try {
      const result = await catalog.listItems(userId, filters);
      return reply.send({
        items: result.items,
        total: result.total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(result.total / filters.limit),
      });
    } catch (err: any) {
      console.error('❌ GET /catalog error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /** Get inventory stats */
  server.get('/stats', async (request, reply) => {
    try {
      const stats = await catalog.getStats(request.userId);
      return reply.send(stats);
    } catch (err: any) {
      console.error('❌ GET /catalog/stats error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /** Upload product images to Supabase Storage and return public URLs */
  server.post('/images/upload', async (request, reply) => {
    const parts = request.files();
    const hasAnyFile = Symbol('hasAnyFile');
    let sawFile = false;

    try {
      const images = await uploadCatalogImages(server.supabase, request.userId, (async function* () {
        for await (const part of parts) {
          sawFile = true;
          yield part;
        }
      })());

      if (!sawFile || images.length === 0) {
        return reply.status(400).send({ error: 'No image files uploaded' });
      }

      return reply.send({ images });
    } catch (err: any) {
      const message = err?.message || 'Failed to upload images';
      return reply.status(400).send({ error: message });
    }
  });

  /** Export inventory as Excel (.xlsx) — supports ?type=all|available|sold */
  server.get('/export', async (request, reply) => {
    try {
      const userId = request.userId;
      const { type: exportType } = request.query as { type?: string };

      // Fetch items based on export type
      let query = server.supabase
        .from('wb_catalog_items')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('item_name', { ascending: true });

      if (exportType === 'sold') {
        query = server.supabase
          .from('wb_catalog_items')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .lte('quantity', 0)
          .order('updated_at', { ascending: false });
      } else if (exportType === 'available') {
        query = query.gt('quantity', 0);
      }

      const { data: items } = await query;

      if (!items || items.length === 0) {
        return reply.status(404).send({ error: 'No items to export' });
      }

      // Fetch user's schema for column labels
      const { data: userData } = await server.supabase
        .from('wb_users')
        .select('inventory_schema, business_name')
        .eq('id', userId)
        .single();

      const schemaFields = userData?.inventory_schema?.fields || [];
      const businessName = userData?.business_name || 'Inventory';

      // Build Excel workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Vyavsay AI';

      // Sheet 1: Inventory
      const sheetName = exportType === 'sold' ? 'Sold Items' : 'Inventory';
      const sheet = workbook.addWorksheet(sheetName);

      // Build columns
      const columns: { header: string; key: string; width: number }[] = [
        { header: 'Item Name', key: 'item_name', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Price', key: 'price', width: 15 },
        { header: 'Quantity', key: 'quantity', width: 10 },
      ];

      for (const field of schemaFields) {
        columns.push({ header: field.label, key: `attr_${field.key}`, width: 18 });
      }

      columns.push({ header: 'Status', key: 'status', width: 12 });
      columns.push({ header: 'Added On', key: 'created_at', width: 15 });
      columns.push({ header: 'Last Updated', key: 'updated_at', width: 15 });

      sheet.columns = columns;

      // Style header row
      const headerColor = exportType === 'sold' ? 'FFDC2626' : 'FF4F46E5';
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };

      // Add data rows
      for (const item of items) {
        const row: Record<string, any> = {
          item_name: item.item_name,
          category: item.category || '',
          price: item.price || '',
          quantity: item.quantity,
          status: item.quantity > 0 ? 'Available' : 'Sold',
          created_at: item.created_at ? new Date(item.created_at).toLocaleDateString() : '',
          updated_at: item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '',
        };

        for (const field of schemaFields) {
          row[`attr_${field.key}`] = item.attributes?.[field.key] ?? '';
        }

        const addedRow = sheet.addRow(row);

        // Highlight sold rows in red
        if (item.quantity <= 0) {
          addedRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
          });
        }
      }

      // Auto-filter
      sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };

      const filename = exportType === 'sold'
        ? `${businessName}_sold_report_${new Date().toISOString().split('T')[0]}.xlsx`
        : `${businessName}_inventory_${new Date().toISOString().split('T')[0]}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', `attachment; filename=${filename}`);
      return reply.send(Buffer.from(buffer as ArrayBuffer));
    } catch (err: any) {
      console.error('❌ GET /catalog/export error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /** Get single catalog item */
  server.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const item = await catalog.getItem(request.userId, id);
      if (!item) return reply.status(404).send({ error: 'Item not found' });
      return reply.send({ item });
    } catch (err: any) {
      console.error('❌ GET /catalog/:id error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /** Add a new catalog item */
  server.post('/', async (request, reply) => {
    const body = validate(catalogItemCreate, request.body, reply);
    if (!body) return;

    try {
      const item = await catalog.addItem(request.userId, body);
      if (!item) return reply.status(500).send({ error: 'Failed to add item' });
      return reply.status(201).send({ item });
    } catch (err: any) {
      console.error('❌ POST /catalog error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /** Update a catalog item */
  server.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = validate(catalogItemUpdate, request.body, reply);
    if (!updates) return;

    try {
      const item = await catalog.updateItem(request.userId, id, updates);
      if (!item) return reply.status(404).send({ error: 'Item not found or update failed' });
      return reply.send({ item });
    } catch (err: any) {
      console.error('❌ PATCH /catalog/:id error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /** Quick mark as sold */
  server.patch('/:id/sold', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const item = await catalog.markSold(request.userId, id);
      if (!item) return reply.status(404).send({ error: 'Item not found' });
      return reply.send({ item });
    } catch (err: any) {
      console.error('❌ PATCH /catalog/:id/sold error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /** Soft delete an item */
  server.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const success = await catalog.deleteItem(request.userId, id);
      if (!success) return reply.status(500).send({ error: 'Failed to delete item' });
      return reply.send({ success: true });
    } catch (err: any) {
      console.error('❌ DELETE /catalog/:id error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /** Batch add items (for Excel/CSV import) */
  server.post('/batch', async (request, reply) => {
    const body = validate(catalogBatch, request.body, reply);
    if (!body) return;

    try {
      const result = await catalog.batchAddItems(request.userId, body.items, body.sourceFileId);
      return reply.send(result);
    } catch (err: any) {
      console.error('❌ POST /catalog/batch error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
};

/** Schema management routes */
export const schemaRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  /** Get user's inventory schema */
  server.get('/', async (request, reply) => {
    try {
      const { data, error } = await server.supabase
        .from('wb_users')
        .select('inventory_schema')
        .eq('id', request.userId)
        .single();

      if (error) return reply.status(500).send({ error: 'Failed to fetch schema' });
      return reply.send({ schema: data?.inventory_schema || { fields: [] } });
    } catch (err: any) {
      console.error('❌ GET /schema error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  /** Update user's inventory schema */
  server.patch('/', async (request, reply) => {
    const body = validate(schemaUpdate, request.body, reply);
    if (!body) return;

    try {
      const { data, error } = await server.supabase
        .from('wb_users')
        .update({ inventory_schema: body.schema })
        .eq('id', request.userId)
        .select('inventory_schema')
        .single();

      if (error) return reply.status(500).send({ error: 'Failed to update schema' });
      return reply.send({ schema: data?.inventory_schema });
    } catch (err: any) {
      console.error('❌ PATCH /schema error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
};
