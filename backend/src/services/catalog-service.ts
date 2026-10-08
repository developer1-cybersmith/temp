import { SupabaseClient } from '@supabase/supabase-js';
import { RagService } from './rag-service.js';

/** Represents a catalog item as stored in the database */
export interface CatalogItem {
  id: string;
  user_id: string;
  source_file_id?: string;
  item_name: string;
  category?: string;
  description?: string;
  price?: number;
  quantity: number;
  images: { url: string; caption?: string; order: number }[];
  attributes: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Filters for structured catalog queries */
export interface CatalogFilters {
  search?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  status?: 'available' | 'sold' | 'all';
  attributes?: Record<string, any>;
  page?: number;
  limit?: number;
  sort?: 'name' | 'price_asc' | 'price_desc' | 'newest' | 'oldest';
}

/** Result from hybrid query (includes similarity score) */
export interface CatalogSearchResult extends CatalogItem {
  similarity?: number;
}

export class CatalogService {
  private rag: RagService;

  constructor(private supabase: SupabaseClient, rag: RagService) {
    this.rag = rag;
  }

  // ─── CRUD Operations ───────────────────────────────────────

  /** List catalog items with filters, pagination, sorting */
  async listItems(userId: string, filters: CatalogFilters = {}): Promise<{ items: CatalogItem[]; total: number }> {
    const {
      search, category, priceMin, priceMax,
      status = 'available', page = 1, limit = 25,
      sort = 'newest',
    } = filters;

    let query = this.supabase
      .from('wb_catalog_items')
      .select(CatalogService.ITEM_COLUMNS, { count: 'exact' })
      .eq('user_id', userId);

    // Status filter
    if (status === 'available') {
      query = query.eq('is_active', true).gt('quantity', 0);
    } else if (status === 'sold') {
      query = query.or('is_active.eq.false,quantity.eq.0');
    }
    // 'all' = no status filter

    // Text search
    if (search) {
      query = query.ilike('item_name', `%${search}%`);
    }

    // Category filter
    if (category) {
      query = query.ilike('category', `%${category}%`);
    }

    // Price range
    if (priceMin !== undefined) query = query.gte('price', priceMin);
    if (priceMax !== undefined) query = query.lte('price', priceMax);

    // Sorting
    switch (sort) {
      case 'name': query = query.order('item_name', { ascending: true }); break;
      case 'price_asc': query = query.order('price', { ascending: true }); break;
      case 'price_desc': query = query.order('price', { ascending: false }); break;
      case 'oldest': query = query.order('created_at', { ascending: true }); break;
      case 'newest':
      default: query = query.order('updated_at', { ascending: false }); break;
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Catalog list error:', error);
      return { items: [], total: 0 };
    }

    return { items: data || [], total: count || 0 };
  }

  // Columns to return for API responses (excludes large embedding vector)
  private static readonly ITEM_COLUMNS = 'id, user_id, source_file_id, item_name, category, description, price, quantity, images, attributes, is_active, created_at, updated_at';

  /** Get a single catalog item (verify ownership) */
  async getItem(userId: string, itemId: string): Promise<CatalogItem | null> {
    const { data, error } = await this.supabase
      .from('wb_catalog_items')
      .select(CatalogService.ITEM_COLUMNS)
      .eq('id', itemId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('❌ Catalog getItem error:', error);
      return null;
    }

    return data;
  }

  /** Add a new catalog item — auto-generates description + embedding */
  async addItem(userId: string, item: {
    item_name: string;
    category?: string;
    price?: number;
    quantity?: number;
    images?: { url: string; caption?: string; order: number }[];
    attributes?: Record<string, any>;
  }): Promise<CatalogItem | null> {
    // Generate text description from all fields for embedding
    const description = this.generateDescription(item.item_name, item.category, item.price, item.attributes);

    // Embed the description (non-fatal — item is created even if embedding fails)
    let embeddingJson: string | null = null;
    try {
      const embeddings = await this.rag.embedBatch([description]);
      if (embeddings?.[0]) {
        embeddingJson = JSON.stringify(embeddings[0]);
      }
    } catch (err) {
      console.error('⚠️ Embedding failed for new item, proceeding without:', err);
    }

    const { data, error } = await this.supabase
      .from('wb_catalog_items')
      .insert({
        user_id: userId,
        item_name: item.item_name,
        category: item.category || null,
        description,
        price: item.price || null,
        quantity: item.quantity ?? 1,
        images: item.images || [],
        attributes: item.attributes || {},
        embedding: embeddingJson,
        is_active: true,
      })
      .select(CatalogService.ITEM_COLUMNS)
      .single();

    if (error) {
      console.error('❌ Catalog add error:', error);
      return null;
    }

    return data;
  }

  /** Update a catalog item — re-generates description + embedding if content changed */
  async updateItem(userId: string, itemId: string, updates: Partial<{
    item_name: string;
    category: string;
    price: number;
    quantity: number;
    images: { url: string; caption?: string; order: number }[];
    attributes: Record<string, any>;
    is_active: boolean;
  }>): Promise<CatalogItem | null> {
    // Fetch current item to merge for description generation
    const current = await this.getItem(userId, itemId);
    if (!current) return null;

    const merged = { ...current, ...updates };
    const contentChanged = updates.item_name || updates.category || updates.price !== undefined || updates.attributes;

    const updatePayload: Record<string, any> = { ...updates };

    // Re-generate description + embedding if content fields changed
    if (contentChanged) {
      const description = this.generateDescription(
        merged.item_name, merged.category, merged.price, merged.attributes
      );
      updatePayload.description = description;

      try {
        const embeddings = await this.rag.embedBatch([description]);
        if (embeddings?.[0]) {
          updatePayload.embedding = JSON.stringify(embeddings[0]);
        }
      } catch (err) {
        console.error('⚠️ Embedding failed for item update, proceeding without:', err);
      }
    }

    const { data, error } = await this.supabase
      .from('wb_catalog_items')
      .update(updatePayload)
      .eq('id', itemId)
      .eq('user_id', userId)
      .select(CatalogService.ITEM_COLUMNS)
      .single();

    if (error) {
      console.error('❌ Catalog update error:', error);
      return null;
    }

    return data;
  }

  /** Mark item as sold (quantity = 0) — direct update, no re-embedding needed */
  async markSold(userId: string, itemId: string): Promise<CatalogItem | null> {
    const { data, error } = await this.supabase
      .from('wb_catalog_items')
      .update({ quantity: 0 })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select(CatalogService.ITEM_COLUMNS)
      .single();

    if (error) {
      console.error('❌ Catalog markSold error:', error);
      return null;
    }

    return data;
  }

  /** Soft delete (is_active = false) */
  async deleteItem(userId: string, itemId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('wb_catalog_items')
      .update({ is_active: false })
      .eq('id', itemId)
      .eq('user_id', userId);

    return !error;
  }

  /** Get inventory stats */
  async getStats(userId: string): Promise<{
    total: number;
    available: number;
    sold: number;
    categories: Record<string, number>;
  }> {
    const { data } = await this.supabase
      .from('wb_catalog_items')
      .select('quantity, is_active, category')
      .eq('user_id', userId);

    const items = data || [];
    const categories: Record<string, number> = {};
    let available = 0;
    let sold = 0;

    for (const item of items) {
      if (item.is_active && item.quantity > 0) {
        available++;
      } else {
        sold++;
      }
      if (item.category) {
        categories[item.category] = (categories[item.category] || 0) + 1;
      }
    }

    return { total: items.length, available, sold, categories };
  }

  // ─── Hybrid Query Engine (for WhatsApp AI) ─────────────────

  /**
   * Hybrid query: structured filters first, semantic vector fallback.
   * Used by the AI pipeline to find products matching customer inquiries.
   */
  async hybridSearch(
    userId: string,
    queryText: string,
    entities?: {
      product_name?: string;
      category?: string;
      price_min?: number;
      price_max?: number;
      attributes?: Record<string, any>;
    }
  ): Promise<CatalogSearchResult[]> {
    const hasEntities = entities && (entities.product_name || entities.category || entities.price_max || entities.price_min);

    // Run BOTH searches in parallel, then merge
    const [structuredResults, semanticResults] = await Promise.all([
      hasEntities ? this.structuredSearch(userId, entities!) : Promise.resolve([]),
      this.semanticSearch(userId, queryText),
    ]);

    // Merge and deduplicate by item ID — structured results take priority
    const seen = new Set<string>();
    const merged: CatalogSearchResult[] = [];

    for (const item of structuredResults) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    for (const item of semanticResults) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }

    return merged.slice(0, 10);
  }

  /** Structured search — exact/filtered SQL lookup */
  private async structuredSearch(
    userId: string,
    entities: {
      product_name?: string;
      category?: string;
      price_min?: number;
      price_max?: number;
      attributes?: Record<string, any>;
    }
  ): Promise<CatalogSearchResult[]> {
    let query = this.supabase
      .from('wb_catalog_items')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('quantity', 0);

    if (entities.product_name) {
      query = query.ilike('item_name', `%${entities.product_name}%`);
    }
    if (entities.category) {
      query = query.ilike('category', `%${entities.category}%`);
    }
    if (entities.price_min) {
      query = query.gte('price', entities.price_min);
    }
    if (entities.price_max) {
      query = query.lte('price', entities.price_max);
    }

    // JSONB attribute filtering
    if (entities.attributes) {
      for (const [key, value] of Object.entries(entities.attributes)) {
        if (value !== null && value !== undefined) {
          query = query.ilike(`attributes->>${key}`, `%${value}%`);
        }
      }
    }

    const { data, error } = await query.order('price', { ascending: true }).limit(10);

    if (error) {
      console.error('❌ Structured catalog search error:', error);
      return [];
    }

    return data || [];
  }

  /** Semantic vector search — cosine similarity on descriptions */
  private async semanticSearch(userId: string, queryText: string, topK = 10): Promise<CatalogSearchResult[]> {
    try {
      const embeddings = await this.rag.embedBatch([queryText]);
      if (!embeddings?.[0]) return [];

      const { data, error } = await this.supabase.rpc('wb_search_catalog', {
        query_embedding: JSON.stringify(embeddings[0]),
        match_threshold: 0.35,
        match_count: topK,
        p_user_id: userId,
      });

      if (error) {
        console.error('❌ Semantic catalog search error:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('❌ Catalog semantic search failed:', err);
      return [];
    }
  }

  /**
   * Find similar items to a sold/unavailable product.
   * Used for "sold out, but here are alternatives" responses.
   */
  async findSimilar(userId: string, soldItemName: string, limit = 3): Promise<CatalogSearchResult[]> {
    return this.semanticSearch(userId, soldItemName, limit);
  }

  /**
   * Search including sold items (for "acknowledge + suggest" flow).
   * Returns the exact item (even if sold) plus available alternatives.
   */
  async searchWithAlternatives(
    userId: string,
    queryText: string,
    entities?: {
      product_name?: string;
      category?: string;
      price_min?: number;
      price_max?: number;
      attributes?: Record<string, any>;
    }
  ): Promise<{ exact: CatalogItem[]; alternatives: CatalogSearchResult[] }> {

    // Search ALL items (including sold) for the exact match
    let exactQuery = this.supabase
      .from('wb_catalog_items')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (entities?.product_name) {
      exactQuery = exactQuery.ilike('item_name', `%${entities.product_name}%`);
    }

    const { data: exactMatches } = await exactQuery.limit(5);
    const exact = exactMatches || [];

    // Separate available and sold
    const available = exact.filter(i => i.quantity > 0);
    const sold = exact.filter(i => i.quantity <= 0);

    // If some are sold, find alternatives
    let alternatives: CatalogSearchResult[] = [];
    if (sold.length > 0 && available.length === 0) {
      alternatives = await this.findSimilar(userId, sold[0].item_name);
    }

    return { exact, alternatives };
  }

  // ─── Helpers ───────────────────────────────────────────────

  /** Generate a natural-language description from all fields — used for embedding.
   *  Rich descriptions dramatically improve semantic search quality. */
  generateDescription(
    name: string,
    category?: string | null,
    price?: number | null,
    attributes?: Record<string, any> | null
  ): string {
    const parts: string[] = [];

    // Start with name and category as a natural phrase
    if (category) {
      parts.push(`${name}, a ${category}`);
    } else {
      parts.push(name);
    }

    // Add key attributes as natural language
    if (attributes) {
      const attrParts: string[] = [];
      // Prioritize important attributes for readability
      const priorityKeys = ['make', 'model', 'year', 'fuel_type', 'fuel type', 'transmission', 'color', 'ownership', 'km_driven', 'kilometers_driven', 'kilometers driven'];
      const seenKeys = new Set<string>();

      for (const pk of priorityKeys) {
        for (const [key, value] of Object.entries(attributes)) {
          if (seenKeys.has(key)) continue;
          if (key.toLowerCase() === pk || key.toLowerCase().replace(/_/g, ' ') === pk) {
            if (value !== null && value !== undefined && value !== '') {
              if (typeof value === 'string' && /^https?:\/\//i.test(value)) continue;
              if (/(image|img|photo|pic)/i.test(key)) continue;
              attrParts.push(`${value}`);
              seenKeys.add(key);
            }
          }
        }
      }

      // Add remaining attributes
      for (const [key, value] of Object.entries(attributes)) {
        if (seenKeys.has(key)) continue;
        if (value === null || value === undefined || value === '') continue;
        if (typeof value === 'string' && /^https?:\/\//i.test(value)) continue;
        if (/(image|img|photo|pic)/i.test(key)) continue;
        const label = key.replace(/_/g, ' ');
        attrParts.push(`${label}: ${value}`);
        seenKeys.add(key);
      }

      if (attrParts.length > 0) {
        parts.push(`with ${attrParts.join(', ')}`);
      }
    }

    // Add price as natural phrase
    if (price) {
      if (price >= 100000) {
        parts.push(`priced at ${(price / 100000).toFixed(1)} lakhs`);
      } else {
        parts.push(`priced at ${price}`);
      }
    }

    return parts.join(', ');
  }

  /**
   * Batch add items from Excel/CSV import.
   * Generates descriptions and embeddings in batch for performance.
   */
  async batchAddItems(
    userId: string,
    items: {
      item_name: string;
      category?: string;
      price?: number;
      quantity?: number;
      images?: { url: string; caption?: string; order: number }[];
      attributes?: Record<string, any>;
    }[],
    sourceFileId?: string
  ): Promise<{ added: number; failed: number }> {
    if (items.length === 0) return { added: 0, failed: 0 };

    // Generate descriptions for all items
    const descriptions = items.map(item =>
      this.generateDescription(item.item_name, item.category, item.price, item.attributes)
    );

    // Batch embed all descriptions (non-fatal — items are created even if embedding fails)
    let embeddings: number[][] | null = null;
    try {
      embeddings = await this.rag.embedBatch(descriptions);
      if (embeddings && embeddings.length !== descriptions.length) {
        console.error('⚠️ Embedding count mismatch, proceeding without embeddings');
        embeddings = null;
      }
    } catch (err) {
      console.error('⚠️ Batch embedding failed, importing without embeddings:', err);
    }

    // Prepare rows for batch insert
    const rows = items.map((item, i) => ({
      user_id: userId,
      source_file_id: sourceFileId || null,
      item_name: item.item_name,
      category: item.category || null,
      description: descriptions[i],
      price: item.price || null,
      quantity: item.quantity ?? 1,
      images: item.images || [],
      attributes: item.attributes || {},
      embedding: embeddings?.[i] ? JSON.stringify(embeddings[i]) : null,
      is_active: true,
    }));

    // Insert in batches of 50
    let added = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await this.supabase.from('wb_catalog_items').insert(batch);
      if (error) {
        console.error(`❌ Batch insert error (items ${i}-${i + batch.length}):`, error);
        failed += batch.length;
      } else {
        added += batch.length;
      }
    }

    console.log(`✅ Catalog import: ${added} added, ${failed} failed out of ${items.length}`);
    return { added, failed };
  }
}
