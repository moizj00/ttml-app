-- Talk-to-My-Lawyer: Initial PostgreSQL Schema Migration
-- Supabase (PostgreSQL) schema
-- 12 enums, 9 tables, 7 indexes

-- ═══════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TYPE "public"."actor_type" AS ENUM('system', 'subscriber', 'employee', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."job_type" AS ENUM('research', 'draft_generation', 'generation_pipeline', 'retry');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."letter_status" AS ENUM('submitted', 'researching', 'drafting', 'generated_locked', 'pending_review', 'under_review', 'needs_changes', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."letter_type" AS ENUM('demand-letter', 'cease-and-desist', 'contract-breach', 'eviction-notice', 'employment-dispute', 'consumer-complaint', 'general-legal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."note_visibility" AS ENUM('internal', 'user_visible');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."priority_level" AS ENUM('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."research_status" AS ENUM('queued', 'running', 'completed', 'failed', 'invalid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."subscription_plan" AS ENUM('per_letter', 'monthly', 'annual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."subscription_status" AS ENUM('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."user_role" AS ENUM('subscriber', 'employee', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."version_type" AS ENUM('ai_draft', 'attorney_edit', 'final_approved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "open_id" varchar(64) NOT NULL,
  "name" text,
  "email" varchar(320),
  "login_method" varchar(64),
  "role" "user_role" DEFAULT 'subscriber' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_signed_in" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);

CREATE TABLE IF NOT EXISTS "letter_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "letter_type" "letter_type" NOT NULL,
  "subject" varchar(500) NOT NULL,
  "issue_summary" text,
  "jurisdiction_country" varchar(100) DEFAULT 'US',
  "jurisdiction_state" varchar(100),
  "jurisdiction_city" varchar(200),
  "intake_json" jsonb,
  "status" "letter_status" DEFAULT 'submitted' NOT NULL,
  "assigned_reviewer_id" integer,
  "current_ai_draft_version_id" integer,
  "current_final_version_id" integer,
  "priority" "priority_level" DEFAULT 'normal' NOT NULL,
  "last_status_changed_at" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "letter_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL,
  "version_type" "version_type" NOT NULL,
  "content" text NOT NULL,
  "created_by_type" "actor_type" NOT NULL,
  "created_by_user_id" integer,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "review_actions" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL,
  "reviewer_id" integer,
  "actor_type" "actor_type" NOT NULL,
  "action" varchar(100) NOT NULL,
  "note_text" text,
  "note_visibility" "note_visibility" DEFAULT 'internal',
  "from_status" varchar(50),
  "to_status" varchar(50),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "workflow_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL,
  "job_type" "job_type" NOT NULL,
  "provider" varchar(50),
  "status" "job_status" DEFAULT 'queued' NOT NULL,
  "attempt_count" integer DEFAULT 0,
  "error_message" text,
  "request_payload_json" jsonb,
  "response_payload_json" jsonb,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "research_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL,
  "workflow_job_id" integer,
  "provider" varchar(50) DEFAULT 'perplexity',
  "status" "research_status" DEFAULT 'queued' NOT NULL,
  "query_plan_json" jsonb,
  "result_json" jsonb,
  "validation_result_json" jsonb,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "attachments" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL,
  "uploaded_by_user_id" integer NOT NULL,
  "storage_path" varchar(1000) NOT NULL,
  "storage_url" varchar(2000),
  "file_name" varchar(500) NOT NULL,
  "mime_type" varchar(200),
  "size_bytes" bigint,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "type" varchar(100) NOT NULL,
  "title" varchar(500) NOT NULL,
  "body" text,
  "link" varchar(1000),
  "read_at" timestamp with time zone,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "stripe_customer_id" varchar(255),
  "stripe_subscription_id" varchar(255),
  "stripe_payment_intent_id" varchar(255),
  "plan" "subscription_plan" NOT NULL,
  "status" "subscription_status" DEFAULT 'none' NOT NULL,
  "letters_allowed" integer DEFAULT 0 NOT NULL,
  "letters_used" integer DEFAULT 0 NOT NULL,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ═══════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "idx_letter_requests_status" ON "letter_requests" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_letter_requests_user_id" ON "letter_requests" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_letter_requests_assigned_reviewer" ON "letter_requests" USING btree ("assigned_reviewer_id");
CREATE INDEX IF NOT EXISTS "idx_letter_versions_letter_request_id" ON "letter_versions" USING btree ("letter_request_id");
CREATE INDEX IF NOT EXISTS "idx_research_runs_letter_request_status" ON "research_runs" USING btree ("letter_request_id", "status");
CREATE INDEX IF NOT EXISTS "idx_review_actions_letter_request_id" ON "review_actions" USING btree ("letter_request_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_jobs_letter_request_status" ON "workflow_jobs" USING btree ("letter_request_id", "status");

-- ═══════════════════════════════════════════════════════
-- AUTO-UPDATE TRIGGER for updated_at columns
-- Auto-update timestamp on row changes
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_letter_requests_updated_at BEFORE UPDATE ON letter_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_workflow_jobs_updated_at BEFORE UPDATE ON workflow_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_research_runs_updated_at BEFORE UPDATE ON research_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
