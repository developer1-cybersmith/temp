-- ============================================
-- Migration 002: Inventory System + RAG Fixes
-- ============================================
-- Run this AFTER 001-schema.sql in Supabase SQL Editor

-- ============================================
-- PART 1: RAG Fixes
-- ============================================

-- Add content_hash column for deduplication
ALTER TABLE wb_knowledge_base
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR,
  ADD COLUMN IF NOT EXISTS source_file_id UUID,
  ADD COLUMN IF NOT EXISTS chunk_index INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_wb_kb_hash ON wb_knowledge_base(user_id, content_hash);

-- Drop the broken IVFFlat index (built on empty table, wrong for small datasets)
DROP INDEX IF EXISTS idx_wb_kb_embedding;

-- Replace with HNSW index (works with any data size, no training needed)
-- Only create if there's data; otherwise skip — HNSW works fine without index on small tables
-- For production with 1000+ chunks, run this:
-- CREATE INDEX idx_wb_kb_embedding ON wb_knowledge_base
--   USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Update the match function with better defaults
CREATE OR REPLACE FUNCTION wb_match_knowledge(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.4,
  match_count INT DEFAULT 5,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (id UUID, content TEXT, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT kb.id, kb.content,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM wb_knowledge_base kb
  WHERE kb.user_id = p_user_id
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


-- ============================================
-- PART 2: Source Files Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS wb_source_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES wb_users(id) ON DELETE CASCADE,
  filename VARCHAR NOT NULL,
  file_type VARCHAR NOT NULL,                        -- 'excel', 'csv', 'pdf', 'image', 'text'
  storage_path TEXT,                                  -- Supabase Storage path
  file_hash VARCHAR,                                  -- SHA256 for change detection
  data_type VARCHAR DEFAULT 'unstructured',           -- 'structured' or 'unstructured'
  row_count INTEGER DEFAULT 0,
  processing_status VARCHAR DEFAULT 'pending',        -- pending | processing | completed | failed
  error_message TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_source_files_user ON wb_source_files(user_id);

-- Add FK from knowledge_base to source_files
ALTER TABLE wb_knowledge_base
  ADD CONSTRAINT fk_kb_source_file
  FOREIGN KEY (source_file_id) REFERENCES wb_source_files(id) ON DELETE CASCADE;


-- ============================================
-- PART 3: Dynamic Inventory / Catalog
-- ============================================

-- Add inventory_schema to users (defines custom fields per business)
ALTER TABLE wb_users
  ADD COLUMN IF NOT EXISTS inventory_schema JSONB DEFAULT '{"fields":[]}';

-- Catalog items table (dynamic schema via JSONB attributes)
CREATE TABLE IF NOT EXISTS wb_catalog_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES wb_users(id) ON DELETE CASCADE,
  source_file_id UUID REFERENCES wb_source_files(id) ON DELETE SET NULL,

  -- Core fixed fields (common to ALL businesses)
  item_name VARCHAR NOT NULL,
  category VARCHAR,
  description TEXT,                     -- Auto-generated from all fields for embedding
  price NUMERIC,
  quantity INTEGER DEFAULT 1,

  -- Multiple images (up to 5)
  -- Format: [{"url": "https://...", "caption": "Front view", "order": 1}, ...]
  images JSONB DEFAULT '[]',

  -- Dynamic fields (business-specific — stores ALL custom columns)
  attributes JSONB DEFAULT '{}',

  -- Vector embedding of description
  embedding VECTOR(1536),

  -- State
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for structured queries
CREATE INDEX IF NOT EXISTS idx_catalog_user_active ON wb_catalog_items(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_catalog_name ON wb_catalog_items(user_id, item_name);
CREATE INDEX IF NOT EXISTS idx_catalog_category ON wb_catalog_items(user_id, category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_catalog_price ON wb_catalog_items(user_id, price) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_catalog_quantity ON wb_catalog_items(user_id, quantity) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_catalog_attrs ON wb_catalog_items USING gin(attributes);

-- HNSW vector index for semantic search on catalog
-- Better than IVFFlat: works with any data size, no training data needed
CREATE INDEX IF NOT EXISTS idx_catalog_embedding ON wb_catalog_items
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Auto-update timestamp trigger for catalog items
CREATE TRIGGER wb_catalog_updated
  BEFORE UPDATE ON wb_catalog_items
  FOR EACH ROW EXECUTE FUNCTION wb_update_timestamp();


-- ============================================
-- PART 4: Catalog Search RPC Function
-- ============================================

CREATE OR REPLACE FUNCTION wb_search_catalog(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.35,
  match_count INT DEFAULT 10,
  p_user_id UUID DEFAULT NULL,
  p_category VARCHAR DEFAULT NULL,
  p_price_min NUMERIC DEFAULT NULL,
  p_price_max NUMERIC DEFAULT NULL,
  p_name_filter VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  item_name VARCHAR,
  category VARCHAR,
  description TEXT,
  price NUMERIC,
  quantity INTEGER,
  images JSONB,
  attributes JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    ci.id, ci.item_name, ci.category, ci.description,
    ci.price, ci.quantity, ci.images, ci.attributes,
    1 - (ci.embedding <=> query_embedding) AS similarity
  FROM wb_catalog_items ci
  WHERE ci.user_id = p_user_id
    AND ci.is_active = true
    AND ci.quantity > 0
    AND (p_category IS NULL OR ci.category ILIKE '%' || p_category || '%')
    AND (p_price_min IS NULL OR ci.price >= p_price_min)
    AND (p_price_max IS NULL OR ci.price <= p_price_max)
    AND (p_name_filter IS NULL OR ci.item_name ILIKE '%' || p_name_filter || '%')
    AND 1 - (ci.embedding <=> query_embedding) > match_threshold
  ORDER BY ci.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Also create a simple structured search (no vector, pure SQL filters)
CREATE OR REPLACE FUNCTION wb_search_catalog_structured(
  p_user_id UUID,
  p_name_filter VARCHAR DEFAULT NULL,
  p_category VARCHAR DEFAULT NULL,
  p_price_min NUMERIC DEFAULT NULL,
  p_price_max NUMERIC DEFAULT NULL,
  p_attributes_filter JSONB DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  item_name VARCHAR,
  category VARCHAR,
  description TEXT,
  price NUMERIC,
  quantity INTEGER,
  images JSONB,
  attributes JSONB,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    ci.id, ci.item_name, ci.category, ci.description,
    ci.price, ci.quantity, ci.images, ci.attributes,
    ci.is_active, ci.created_at, ci.updated_at
  FROM wb_catalog_items ci
  WHERE ci.user_id = p_user_id
    AND ci.is_active = true
    AND (p_name_filter IS NULL OR ci.item_name ILIKE '%' || p_name_filter || '%')
    AND (p_category IS NULL OR ci.category ILIKE '%' || p_category || '%')
    AND (p_price_min IS NULL OR ci.price >= p_price_min)
    AND (p_price_max IS NULL OR ci.price <= p_price_max)
    AND (p_attributes_filter IS NULL OR ci.attributes @> p_attributes_filter)
  ORDER BY ci.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
