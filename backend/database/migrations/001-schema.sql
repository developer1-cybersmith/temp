-- ============================================
-- WhatsApp Baileys Copilot — Database Schema
-- ============================================
-- All tables prefixed with wb_ to avoid conflicts
-- Run this in your Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Business Owners
CREATE TABLE wb_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR NOT NULL UNIQUE,
  business_name VARCHAR,
  industry VARCHAR,
  services JSONB DEFAULT '[]',
  auto_reply_enabled BOOLEAN DEFAULT true,
  ai_confidence_threshold FLOAT DEFAULT 0.75,
  followup_timer_hours INTEGER DEFAULT 48,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp Sessions (Baileys connections)
CREATE TABLE wb_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES wb_users(id) ON DELETE CASCADE,
  phone_number VARCHAR,
  status VARCHAR DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations
CREATE TABLE wb_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES wb_users(id) ON DELETE CASCADE,
  customer_jid VARCHAR NOT NULL,
  customer_name VARCHAR,
  customer_phone VARCHAR,
  status VARCHAR DEFAULT 'active',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  summary TEXT,
  language VARCHAR DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE wb_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES wb_conversations(id) ON DELETE CASCADE,
  sender VARCHAR NOT NULL,
  content TEXT NOT NULL,
  intent VARCHAR,
  confidence FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads
CREATE TABLE wb_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES wb_users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES wb_conversations(id) ON DELETE CASCADE,
  customer_name VARCHAR,
  score VARCHAR DEFAULT 'low',
  stage VARCHAR DEFAULT 'new',
  intent VARCHAR,
  summary TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks
CREATE TABLE wb_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES wb_users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES wb_conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  due_date DATE,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge Base (RAG)
CREATE TABLE wb_knowledge_base (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES wb_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  source_file VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_wb_sessions_user ON wb_sessions(user_id);
CREATE INDEX idx_wb_conversations_user ON wb_conversations(user_id);
CREATE INDEX idx_wb_conversations_jid ON wb_conversations(user_id, customer_jid);
CREATE INDEX idx_wb_conversations_last_msg ON wb_conversations(user_id, last_message_at DESC);
CREATE INDEX idx_wb_messages_convo ON wb_messages(conversation_id, created_at DESC);
CREATE INDEX idx_wb_leads_user ON wb_leads(user_id, stage);
CREATE INDEX idx_wb_leads_score ON wb_leads(user_id, score);
CREATE INDEX idx_wb_tasks_user ON wb_tasks(user_id, is_completed);
CREATE INDEX idx_wb_kb_user ON wb_knowledge_base(user_id);

-- pgvector similarity search
CREATE INDEX idx_wb_kb_embedding ON wb_knowledge_base
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Auto-update trigger for leads
CREATE OR REPLACE FUNCTION wb_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wb_leads_updated
  BEFORE UPDATE ON wb_leads
  FOR EACH ROW EXECUTE FUNCTION wb_update_timestamp();

-- RAG similarity search function
CREATE OR REPLACE FUNCTION wb_match_knowledge(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_user_id UUID
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
