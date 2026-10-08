-- ============================================================
-- WhatsApp Cloud API — per-tenant WABA accounts + webhook dedup
-- ============================================================
-- Replaces Baileys sessions (wb_sessions) with Cloud API credentials.
-- Each showroom owner connects their own WhatsApp Business number;
-- their phone_number_id + access_token are stored here.
-- During the initial single-tenant phase these fields can be left
-- empty and the system falls back to META_PHONE_NUMBER_ID env var.

-- ─────────────────────────────────────────
-- 1. Per-tenant WhatsApp Cloud API accounts
-- ─────────────────────────────────────────
CREATE TABLE wb_waba_accounts (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                UUID NOT NULL REFERENCES wb_users(id) ON DELETE CASCADE,
  waba_id                VARCHAR NOT NULL,
  phone_number_id        VARCHAR NOT NULL,
  display_phone_number   VARCHAR,
  access_token_encrypted TEXT NOT NULL,     -- plaintext for now; encrypt at rest later
  status                 VARCHAR DEFAULT 'active',  -- 'active' | 'paused' | 'revoked'
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id),                          -- one WhatsApp number per showroom for now
  UNIQUE(phone_number_id)
);

CREATE INDEX idx_waba_accounts_phone ON wb_waba_accounts(phone_number_id);

CREATE TRIGGER waba_accounts_updated
  BEFORE UPDATE ON wb_waba_accounts
  FOR EACH ROW EXECUTE FUNCTION wb_update_timestamp();

-- ─────────────────────────────────────────
-- 2. Webhook event dedup + audit log
-- ─────────────────────────────────────────
-- Meta delivers webhooks at-least-once; duplicate wamids must be ignored.
-- Rows older than 7 days can be purged safely.
CREATE TABLE wb_webhook_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wh_message_id   VARCHAR NOT NULL UNIQUE,  -- Meta's wamid (e.g. "wamid.xxx")
  phone_number_id VARCHAR,
  processed       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_msg   ON wb_webhook_events(wh_message_id);
CREATE INDEX idx_webhook_events_time  ON wb_webhook_events(created_at DESC);
