-- Migration 006: Add appointment scheduling support
-- Enables time-slot booking on tasks and configurable working hours per user.

-- 1. Track when an appointment is scheduled for a given task
ALTER TABLE wb_tasks ADD COLUMN IF NOT EXISTS appointment_time TIMESTAMPTZ;

-- 2. Per-user working hours (day-of-week windows) and slot duration
ALTER TABLE wb_users ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT '{"monday":{"start":"10:00","end":"19:00","enabled":true},"tuesday":{"start":"10:00","end":"19:00","enabled":true},"wednesday":{"start":"10:00","end":"19:00","enabled":true},"thursday":{"start":"10:00","end":"19:00","enabled":true},"friday":{"start":"10:00","end":"19:00","enabled":true},"saturday":{"start":"10:00","end":"19:00","enabled":true},"sunday":{"start":"10:00","end":"19:00","enabled":false}}';
ALTER TABLE wb_users ADD COLUMN IF NOT EXISTS slot_duration_minutes INTEGER DEFAULT 30;

-- 3. Partial index for efficient upcoming-appointment lookups
CREATE INDEX IF NOT EXISTS idx_wb_tasks_appointment_time ON wb_tasks (user_id, appointment_time) WHERE appointment_time IS NOT NULL AND is_completed = false;
