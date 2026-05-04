-- Migration 0013: Add pipeline_locked_at column for DB-level pipeline execution locking
-- Prevents concurrent pipeline runs for the same letter across restarts or horizontal scaling.

ALTER TABLE letter_requests
  ADD COLUMN IF NOT EXISTS pipeline_locked_at TIMESTAMPTZ;
