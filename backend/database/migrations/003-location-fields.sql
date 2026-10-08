-- ============================================
-- Migration 003: Location Fields for Business
-- ============================================
-- Run this AFTER 002 in Supabase SQL Editor

ALTER TABLE wb_users
  ADD COLUMN IF NOT EXISTS business_address VARCHAR(500),
  ADD COLUMN IF NOT EXISTS google_maps_link VARCHAR(500);
