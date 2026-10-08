-- Migration 004: Add domain layer fields for stateful negotiation, buying signals, and sales funnel
-- These fields support per-conversation tracking of negotiation rounds,
-- buying intent scoring, and sales funnel stage progression.

-- Negotiation round tracking (1-4 rounds for used cars domain)
ALTER TABLE wb_conversations ADD COLUMN IF NOT EXISTS negotiation_round INTEGER DEFAULT 0;

-- Buying signal score accumulator (0.0 to 1.0+)
ALTER TABLE wb_conversations ADD COLUMN IF NOT EXISTS buying_signal_score FLOAT DEFAULT 0;

-- Sales funnel stage (inquiry → qualification → test_drive → negotiation → booking → documentation → delivery)
ALTER TABLE wb_conversations ADD COLUMN IF NOT EXISTS funnel_stage VARCHAR(50) DEFAULT 'inquiry';
