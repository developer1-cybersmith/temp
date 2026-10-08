-- ============================================
-- Migration 010 — Message Media Storage
-- ============================================
-- Adds media fields to wb_messages so incoming images and voice notes
-- from customers can be played back / viewed in the dashboard, rather
-- than only showing a transcript or placeholder.
--
-- Run this in the Supabase SQL Editor.
--
-- After running, manually create the storage bucket via Supabase
-- Dashboard → Storage → New bucket:
--   Name:   whatsapp-media
--   Public: yes (so the dashboard <img>/<audio> tags can load via public URL)
-- ============================================

ALTER TABLE wb_messages
  ADD COLUMN IF NOT EXISTS media_type      VARCHAR,   -- 'image' | 'voice' | 'audio'
  ADD COLUMN IF NOT EXISTS media_url       TEXT,      -- public URL in Supabase Storage
  ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR;

CREATE INDEX IF NOT EXISTS idx_wb_messages_media
  ON wb_messages(conversation_id)
  WHERE media_url IS NOT NULL;
