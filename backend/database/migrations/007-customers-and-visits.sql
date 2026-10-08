-- ============================================
-- Walk-In Customers + Unified Customer Model
-- ============================================
-- Introduces `customers` as the canonical record per real person,
-- with WhatsApp conversations and walk-in visits as touchpoints.
-- Backfills existing wb_conversations into customers.

-- ─────────────────────────────────────────
-- 1. Customers — one row per real person, per tenant
-- ─────────────────────────────────────────
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES wb_users(id) ON DELETE CASCADE,
  full_name VARCHAR,
  primary_phone VARCHAR,
  alt_phone VARCHAR,
  email VARCHAR,
  first_seen_via VARCHAR DEFAULT 'whatsapp',  -- 'whatsapp' | 'walk_in' | 'phone' | 'referral'
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  hotness VARCHAR DEFAULT 'cold',             -- 'hot' | 'warm' | 'cold'
  status VARCHAR DEFAULT 'new',               -- 'new' | 'engaged' | 'qualified' | 'won' | 'lost' | 'dormant'
  predicted_close_days INTEGER,
  lifetime_value NUMERIC DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',           -- vertical-specific data
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, primary_phone)              -- dedup per tenant; NULL phones allowed multiple
);

CREATE INDEX idx_customers_user ON customers(user_id, last_activity_at DESC);
CREATE INDEX idx_customers_phone ON customers(user_id, primary_phone);
CREATE INDEX idx_customers_hotness ON customers(user_id, hotness);
CREATE INDEX idx_customers_status ON customers(user_id, status);

-- Auto-update timestamp trigger (reuses wb_update_timestamp from migration 001)
CREATE TRIGGER customers_updated
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION wb_update_timestamp();

-- ─────────────────────────────────────────
-- 2. Customer Visits — walk-in records
-- ─────────────────────────────────────────
CREATE TABLE customer_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES wb_users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  duration_minutes INTEGER,
  staff_name VARCHAR,                         -- free-text for now; FK to staff_members in future plan
  items_shown UUID[] DEFAULT '{}',            -- catalog item IDs
  trial_taken BOOLEAN DEFAULT false,
  trial_item_id UUID,
  quoted_amount NUMERIC,
  outcome VARCHAR DEFAULT 'interested',       -- 'interested' | 'not_interested' | 'will_decide' | 'purchased' | 'follow_up'
  next_action TEXT,
  follow_up_at TIMESTAMPTZ,
  manual_notes TEXT,
  ai_summary TEXT,
  custom_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_visits_customer ON customer_visits(customer_id, visited_at DESC);
CREATE INDEX idx_visits_user ON customer_visits(user_id, visited_at DESC);
CREATE INDEX idx_visits_followup ON customer_visits(user_id, follow_up_at)
  WHERE follow_up_at IS NOT NULL;

-- ─────────────────────────────────────────
-- 3. Link existing WhatsApp conversations to customers
-- ─────────────────────────────────────────
ALTER TABLE wb_conversations
  ADD COLUMN customer_id UUID REFERENCES customers(id);

CREATE INDEX idx_conversations_customer ON wb_conversations(customer_id);

-- Make wb_leads.conversation_id nullable so a lead can exist without a conversation
ALTER TABLE wb_leads
  ALTER COLUMN conversation_id DROP NOT NULL,
  ADD COLUMN customer_id UUID REFERENCES customers(id);

CREATE INDEX idx_leads_customer ON wb_leads(customer_id);

-- ─────────────────────────────────────────
-- 4. Backfill: every existing conversation becomes a customer
-- ─────────────────────────────────────────
INSERT INTO customers (
  id, user_id, full_name, primary_phone,
  first_seen_via, first_seen_at, last_activity_at, created_at
)
SELECT
  uuid_generate_v4(),
  c.user_id,
  COALESCE(c.customer_name, 'Unknown'),
  COALESCE(c.customer_phone, c.customer_jid),
  'whatsapp',
  c.created_at,
  c.last_message_at,
  c.created_at
FROM wb_conversations c
WHERE NOT EXISTS (
  SELECT 1 FROM customers cust
  WHERE cust.user_id = c.user_id
    AND cust.primary_phone = COALESCE(c.customer_phone, c.customer_jid)
);

-- Link conversations to their newly-created customers
UPDATE wb_conversations conv
SET customer_id = cust.id
FROM customers cust
WHERE cust.user_id = conv.user_id
  AND cust.primary_phone = COALESCE(conv.customer_phone, conv.customer_jid)
  AND conv.customer_id IS NULL;

-- Link existing leads to customers (via conversation)
UPDATE wb_leads l
SET customer_id = conv.customer_id
FROM wb_conversations conv
WHERE l.conversation_id = conv.id
  AND l.customer_id IS NULL;
