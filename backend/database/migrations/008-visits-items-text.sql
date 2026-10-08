-- ============================================================
-- Fix: customer_visits.items_shown UUID[] → TEXT[]
-- ============================================================
-- Voice-captured item names (e.g. "Fortuner", "saree") are text,
-- not catalog UUIDs. The UUID[] constraint caused the visit INSERT
-- to fail whenever extraction found any item names, leaving customers
-- with no visit records and no data on the detail page.
-- TEXT[] still works for catalog UUIDs (stored as their text form).

ALTER TABLE customer_visits
  ALTER COLUMN items_shown TYPE TEXT[] USING items_shown::TEXT[];
