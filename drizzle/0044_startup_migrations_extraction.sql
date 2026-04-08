-- Migration 0044: Extract inline startup migrations from server/db/core.ts
-- These were previously executed on every server boot via _startupMigrationRan guard.
-- Moving them here makes the schema history explicit and removes boot-time schema mutation.

-- 1. Remove maxUses:1 limit from all existing discount codes
UPDATE discount_codes SET max_uses = NULL WHERE max_uses = 1;

-- 2. Add pipeline_locked_at column for session locking feature
ALTER TABLE letter_requests
  ADD COLUMN IF NOT EXISTS pipeline_locked_at TIMESTAMPTZ;

-- 3. Add recursive learning hardening columns to pipeline_lessons
ALTER TABLE pipeline_lessons
  ADD COLUMN IF NOT EXISTS hit_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS times_injected INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consolidated_from_ids INTEGER[],
  ADD COLUMN IF NOT EXISTS letters_before_avg_score INTEGER,
  ADD COLUMN IF NOT EXISTS letters_after_avg_score INTEGER,
  ADD COLUMN IF NOT EXISTS effectiveness_samples INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_injected_at TIMESTAMPTZ;

-- 4. Index for lesson lookup by letter_type, jurisdiction, is_active
CREATE INDEX IF NOT EXISTS idx_pipeline_lessons_type_jurisdiction_active
  ON pipeline_lessons (letter_type, jurisdiction, is_active);

-- 5. Add 'consolidation' value to lesson_source enum
DO $$ BEGIN
  ALTER TYPE lesson_source ADD VALUE IF NOT EXISTS 'consolidation';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 6. Add client approval statuses to letter_status enum
DO $$ BEGIN
  ALTER TYPE letter_status ADD VALUE IF NOT EXISTS 'client_revision_requested';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE letter_status ADD VALUE IF NOT EXISTS 'client_declined';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 7. Add 'assembly' value to job_type enum
DO $$ BEGIN
  ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'assembly';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 8. Create intake_form_templates table
CREATE TABLE IF NOT EXISTS intake_form_templates (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  base_letter_type letter_type NOT NULL,
  field_config JSONB NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 9. Indexes for intake_form_templates
CREATE INDEX IF NOT EXISTS idx_intake_form_templates_owner
  ON intake_form_templates (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_intake_form_templates_letter_type
  ON intake_form_templates (base_letter_type);
