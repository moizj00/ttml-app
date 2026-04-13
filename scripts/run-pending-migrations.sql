-- =====================================================
-- Combined Pending Migrations (0042-0045)
-- Run this against your Supabase database
-- =====================================================

-- =====================================================
-- Migration 0042: intake_form_templates table
-- =====================================================
CREATE TABLE IF NOT EXISTS "intake_form_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"base_letter_type" letter_type NOT NULL,
	"field_config" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_intake_form_templates_owner" ON "intake_form_templates" USING btree ("owner_user_id");
CREATE INDEX IF NOT EXISTS "idx_intake_form_templates_letter_type" ON "intake_form_templates" USING btree ("base_letter_type");

-- =====================================================
-- Migration 0043: consent_to_training + FK constraints
-- =====================================================
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consent_to_training" boolean DEFAULT false NOT NULL;

-- FK constraints (use DO block to handle "already exists" gracefully)
DO $$ BEGIN
  ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_users_id_fk" 
    FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_letter_request_id_letter_requests_id_fk" 
    FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_subscriber_id_users_id_fk" 
    FOREIGN KEY ("subscriber_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "intake_form_templates" ADD CONSTRAINT "intake_form_templates_owner_user_id_users_id_fk" 
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "letter_quality_scores" ADD CONSTRAINT "letter_quality_scores_letter_request_id_letter_requests_id_fk" 
    FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_processed_by_users_id_fk" 
    FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pipeline_lessons" ADD CONSTRAINT "pipeline_lessons_created_by_user_id_users_id_fk" 
    FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_attachments_uploaded_by" ON "attachments" USING btree ("uploaded_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_letter_requests_status_reviewer" ON "letter_requests" USING btree ("status","assigned_reviewer_id");
CREATE INDEX IF NOT EXISTS "idx_letter_versions_created_by" ON "letter_versions" USING btree ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_jobs_created_at" ON "workflow_jobs" USING btree ("created_at");

-- =====================================================
-- Migration 0044: startup migrations extraction
-- =====================================================

-- 1. Remove maxUses:1 limit from all existing discount codes
UPDATE discount_codes SET max_uses = NULL WHERE max_uses = 1;

-- 2. Add pipeline_locked_at column for session locking feature (CRITICAL for LangGraph)
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

-- =====================================================
-- Migration 0045: Performance indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS "idx_letter_versions_request_type" ON "letter_versions" USING btree ("letter_request_id","version_type");
CREATE INDEX IF NOT EXISTS "idx_research_runs_status" ON "research_runs" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_research_runs_cache_hit" ON "research_runs" USING btree ("cache_hit");
CREATE INDEX IF NOT EXISTS "idx_review_actions_action_created" ON "review_actions" USING btree ("action","created_at");
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" USING btree ("role");
CREATE INDEX IF NOT EXISTS "idx_users_role_active" ON "users" USING btree ("role","is_active");
CREATE INDEX IF NOT EXISTS "idx_workflow_jobs_status_created" ON "workflow_jobs" USING btree ("status","created_at");

-- =====================================================
-- Update drizzle migration journal (mark as applied)
-- =====================================================
INSERT INTO "__drizzle_migrations" (hash, created_at)
VALUES 
  ('0042_smiling_rhino', EXTRACT(EPOCH FROM NOW()) * 1000),
  ('0043_ordinary_juggernaut', EXTRACT(EPOCH FROM NOW()) * 1000),
  ('0044_startup_migrations_extraction', EXTRACT(EPOCH FROM NOW()) * 1000),
  ('0045_perf_indexes', EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT DO NOTHING;

-- =====================================================
-- Done! Verify with: SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 10;
-- =====================================================
