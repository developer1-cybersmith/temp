-- ============================================
-- Migration 011 — Agent Reasoning Trace
-- ============================================
-- Adds a JSONB column to wb_messages so the new LangGraph agent path
-- (GENAI_POC_PRD.md §5.5, USE_AGENT_GRAPH flag) can persist a readable
-- record of why it replied what it replied: per-node timings and tool
-- calls with inputs/outputs. Only written by the new agent graph's
-- persist node — pipeline-service.ts (the default flag-off path) never
-- writes this column and is unaffected by this migration.
--
-- Run this in the Supabase SQL Editor.
-- ============================================

ALTER TABLE wb_messages
  ADD COLUMN IF NOT EXISTS reasoning_trace JSONB;

CREATE INDEX IF NOT EXISTS idx_wb_messages_reasoning_trace
  ON wb_messages(conversation_id)
  WHERE reasoning_trace IS NOT NULL;
