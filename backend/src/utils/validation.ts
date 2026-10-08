import { z } from 'zod';
import { FastifyReply } from 'fastify';

/** Validate request data against a Zod schema. Returns parsed data or sends 400. */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    reply.status(400).send({ error: 'Validation failed', details: errors });
    return null;
  }
  return result.data;
}

// ─── Shared Schemas ──────────────────────────────────

export const uuidSchema = z.string().uuid();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// ─── Catalog Schemas ─────────────────────────────────

export const catalogItemCreate = z.object({
  item_name: z.string().min(1).max(500),
  category: z.string().max(200).optional(),
  price: z.number().min(0).optional(),
  quantity: z.number().int().min(0).default(1),
  images: z.array(z.object({
    url: z.string().url(),
    caption: z.string().max(500).optional(),
    order: z.number().int().min(0).default(0),
  })).max(5).optional(),
  attributes: z.record(z.string(), z.any()).optional(),
});

export const catalogItemUpdate = z.object({
  item_name: z.string().min(1).max(500).optional(),
  category: z.string().max(200).optional(),
  price: z.number().min(0).optional(),
  quantity: z.number().int().min(0).optional(),
  images: z.array(z.object({
    url: z.string().url(),
    caption: z.string().max(500).optional(),
    order: z.number().int().min(0).default(0),
  })).max(5).optional(),
  attributes: z.record(z.string(), z.any()).optional(),
  is_active: z.boolean().optional(),
});

export const catalogQuery = z.object({
  search: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  status: z.enum(['available', 'sold', 'all']).default('available'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['name', 'price_asc', 'price_desc', 'newest', 'oldest']).default('newest'),
});

export const catalogBatch = z.object({
  items: z.array(catalogItemCreate).min(1).max(1000),
  sourceFileId: z.string().uuid().optional(),
});

// ─── Knowledge Schemas ───────────────────────────────

export const knowledgeCreate = z.object({
  content: z.string().min(1).max(50000),
});

// ─── User Schemas ────────────────────────────────────

export const userUpdate = z.object({
  business_name: z.string().max(200).nullish(),
  industry: z.string().max(200).nullish(),
  services: z.array(z.string().max(1000)).nullish(),
  business_address: z.string().max(500).nullish(),
  google_maps_link: z.string().max(500).nullish(),
  auto_reply_enabled: z.boolean().nullish(),
  ai_confidence_threshold: z.number().min(0).max(1).nullish(),
  followup_timer_hours: z.number().int().min(1).max(720).nullish(),
  inventory_schema: z.object({
    fields: z.array(z.object({
      key: z.string().max(100),
      label: z.string().max(200),
      type: z.enum(['text', 'number', 'dropdown', 'date', 'boolean']),
      required: z.boolean().optional(),
      options: z.array(z.string().max(200)).nullish(),
    })),
  }).nullish(),
});

// ─── Schema Management ───────────────────────────────

export const schemaUpdate = z.object({
  schema: z.object({
    fields: z.array(z.object({
      key: z.string().max(100),
      label: z.string().max(200),
      type: z.enum(['text', 'number', 'dropdown', 'date', 'boolean']),
      required: z.boolean().optional(),
      options: z.array(z.string().max(200)).optional(),
    })),
  }),
});

// ─── Conversation Schemas ────────────────────────────

export const conversationUpdate = z.object({
  status: z.string().max(50).nullish(),
  ai_paused: z.boolean().nullish(),
});

export const sendMessage = z.object({
  content: z.string().min(1).max(5000),
});

// ─── Lead Schemas ────────────────────────────────────

export const leadUpdate = z.object({
  stage: z.string().max(50).nullish(),
  notes: z.string().max(5000).nullish(),
  score: z.enum(['high', 'medium', 'low']).nullish(),
});

// ─── Task Schemas ────────────────────────────────────

export const taskUpdate = z.object({
  is_completed: z.boolean().nullish(),
  title: z.string().max(500).nullish(),
  due_date: z.string().nullish(),
  appointment_time: z.string().nullish(),
});

// ─── File Processing ─────────────────────────────────

export const fileProcess = z.object({
  columnMapping: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.any())).min(1).max(5000),
});
