CREATE TYPE "public"."actor_type" AS ENUM('system', 'subscriber', 'employee', 'admin');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('research', 'draft_generation', 'generation_pipeline', 'retry');--> statement-breakpoint
CREATE TYPE "public"."letter_status" AS ENUM('submitted', 'researching', 'drafting', 'generated_locked', 'pending_review', 'under_review', 'needs_changes', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."letter_type" AS ENUM('demand-letter', 'cease-and-desist', 'contract-breach', 'eviction-notice', 'employment-dispute', 'consumer-complaint', 'general-legal');--> statement-breakpoint
CREATE TYPE "public"."note_visibility" AS ENUM('internal', 'user_visible');--> statement-breakpoint
CREATE TYPE "public"."priority_level" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."research_status" AS ENUM('queued', 'running', 'completed', 'failed', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('per_letter', 'monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'none');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('subscriber', 'employee', 'admin');--> statement-breakpoint
CREATE TYPE "public"."version_type" AS ENUM('ai_draft', 'attorney_edit', 'final_approved');--> statement-breakpoint
CREATE TABLE "attachments" (
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
--> statement-breakpoint
CREATE TABLE "letter_requests" (
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
--> statement-breakpoint
CREATE TABLE "letter_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_request_id" integer NOT NULL,
	"version_type" "version_type" NOT NULL,
	"content" text NOT NULL,
	"created_by_type" "actor_type" NOT NULL,
	"created_by_user_id" integer,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
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
--> statement-breakpoint
CREATE TABLE "research_runs" (
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
--> statement-breakpoint
CREATE TABLE "review_actions" (
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
--> statement-breakpoint
CREATE TABLE "subscriptions" (
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
--> statement-breakpoint
CREATE TABLE "users" (
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
--> statement-breakpoint
CREATE TABLE "workflow_jobs" (
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
--> statement-breakpoint
CREATE INDEX "idx_letter_requests_status" ON "letter_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_user_id" ON "letter_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_assigned_reviewer" ON "letter_requests" USING btree ("assigned_reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_letter_versions_letter_request_id" ON "letter_versions" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_research_runs_letter_request_status" ON "research_runs" USING btree ("letter_request_id","status");--> statement-breakpoint
CREATE INDEX "idx_review_actions_letter_request_id" ON "review_actions" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_jobs_letter_request_status" ON "workflow_jobs" USING btree ("letter_request_id","status");ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "pdf_url" text;ALTER TYPE "public"."actor_type" ADD VALUE 'attorney';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'attorney';ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;CREATE TYPE "public"."commission_status" AS ENUM('pending', 'paid', 'voided');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'completed', 'rejected');--> statement-breakpoint
CREATE TABLE "commission_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"letter_request_id" integer,
	"subscriber_id" integer,
	"discount_code_id" integer,
	"stripe_payment_intent_id" varchar(255),
	"sale_amount" integer NOT NULL,
	"commission_rate" integer DEFAULT 500 NOT NULL,
	"commission_amount" integer NOT NULL,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"discount_percent" integer DEFAULT 20 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"max_uses" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"payment_method" varchar(100) DEFAULT 'bank_transfer' NOT NULL,
	"payment_details" jsonb,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_by" integer,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_commission_ledger_employee_id" ON "commission_ledger" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_commission_ledger_status" ON "commission_ledger" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_commission_ledger_employee_status" ON "commission_ledger" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "idx_discount_codes_code" ON "discount_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_discount_codes_employee_id" ON "discount_codes" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_payout_requests_employee_id" ON "payout_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_payout_requests_status" ON "payout_requests" USING btree ("status");CREATE TABLE "email_verification_tokens" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "token" varchar(128) NOT NULL,
        "email" varchar(320) NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "used_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_email_verification_tokens_token" ON "email_verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_email_verification_tokens_user_id" ON "email_verification_tokens" USING btree ("user_id");ALTER TYPE "public"."letter_status" ADD VALUE 'generated_unlocked' BEFORE 'pending_review';ALTER TYPE "public"."subscription_plan" ADD VALUE 'free_trial_review';--> statement-breakpoint
ALTER TYPE "public"."subscription_plan" ADD VALUE 'starter';--> statement-breakpoint
ALTER TYPE "public"."subscription_plan" ADD VALUE 'professional';ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "draft_reminder_sent_at" timestamp with time zone;ALTER TYPE "public"."letter_status" ADD VALUE 'upsell_dismissed' BEFORE 'pending_review';--> statement-breakpoint
DROP INDEX "idx_letter_requests_status";--> statement-breakpoint
DROP INDEX "idx_letter_requests_user_id";--> statement-breakpoint
DROP INDEX "idx_letter_requests_assigned_reviewer";--> statement-breakpoint
DROP INDEX "idx_letter_versions_letter_request_id";--> statement-breakpoint
DROP INDEX "idx_research_runs_letter_request_status";--> statement-breakpoint
DROP INDEX "idx_review_actions_letter_request_id";--> statement-breakpoint
DROP INDEX "idx_workflow_jobs_letter_request_status";--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "pdf_storage_path" varchar(1000);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "free_review_used_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_commission_ledger_stripe_pi" ON "commission_ledger" USING btree ("stripe_payment_intent_id");ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "research_unverified" boolean DEFAULT false NOT NULL;ALTER TYPE "public"."subscription_plan" ADD VALUE 'single_letter';--> statement-breakpoint
ALTER TYPE "public"."subscription_plan" ADD VALUE 'yearly';ALTER TYPE "public"."letter_status" ADD VALUE 'client_approval_pending' BEFORE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'client_approved' BEFORE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."subscription_plan" ADD VALUE 'monthly_basic' BEFORE 'annual';CREATE TYPE "public"."lesson_category" AS ENUM('citation_error', 'jurisdiction_error', 'tone_issue', 'structure_issue', 'factual_error', 'bloat_detected', 'missing_section', 'style_preference', 'legal_accuracy', 'general');--> statement-breakpoint
CREATE TYPE "public"."lesson_source" AS ENUM('attorney_approval', 'attorney_rejection', 'attorney_changes', 'attorney_edit', 'manual');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('research', 'drafting', 'assembly', 'vetting');--> statement-breakpoint
CREATE TABLE "letter_quality_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_request_id" integer NOT NULL,
	"first_pass_approved" boolean NOT NULL,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"vetting_pass_count" integer DEFAULT 0 NOT NULL,
	"vetting_fail_count" integer DEFAULT 0 NOT NULL,
	"attorney_edit_distance" integer,
	"time_to_first_review_ms" bigint,
	"time_to_approval_ms" bigint,
	"computed_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_type" "letter_type",
	"jurisdiction" varchar(100),
	"pipeline_stage" "pipeline_stage",
	"category" "lesson_category" DEFAULT 'general' NOT NULL,
	"lesson_text" text NOT NULL,
	"source_letter_request_id" integer,
	"source_action" "lesson_source" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quality_scores_letter_request" ON "letter_quality_scores" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_pipeline_lessons_active" ON "pipeline_lessons" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_pipeline_lessons_letter_type" ON "pipeline_lessons" USING btree ("letter_type");--> statement-breakpoint
CREATE INDEX "idx_pipeline_lessons_jurisdiction" ON "pipeline_lessons" USING btree ("jurisdiction");--> statement-breakpoint
CREATE INDEX "idx_pipeline_lessons_stage" ON "pipeline_lessons" USING btree ("pipeline_stage");ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "category" varchar(50) DEFAULT 'general' NOT NULL;ALTER TYPE "public"."job_type" ADD VALUE 'vetting';-- Deduplicate existing rows before adding unique constraint (keep most recently updated per user)
DELETE FROM "subscriptions"
WHERE "id" NOT IN (
  SELECT DISTINCT ON ("user_id") "id"
  FROM "subscriptions"
  ORDER BY "user_id", "updated_at" DESC NULLS LAST, "id" DESC
);

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id");ALTER TYPE "public"."letter_status" ADD VALUE 'pipeline_failed' BEFORE 'pending_review';CREATE TABLE "document_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_name" varchar(500) NOT NULL,
	"file_type" varchar(20) NOT NULL,
	"analysis_json" jsonb NOT NULL,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_document_analyses_user_id" ON "document_analyses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_document_analyses_created_at" ON "document_analyses" USING btree ("created_at");CREATE INDEX "idx_attachments_letter_request_id" ON "attachments" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_user_id" ON "letter_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_status" ON "letter_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_assigned_reviewer_id" ON "letter_requests" USING btree ("assigned_reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_created_at" ON "letter_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_letter_versions_letter_request_id" ON "letter_versions" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_research_runs_letter_request_id" ON "research_runs" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_review_actions_letter_request_id" ON "review_actions" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_jobs_letter_request_id" ON "workflow_jobs" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_jobs_status" ON "workflow_jobs" USING btree ("status");ALTER TYPE "public"."lesson_source" ADD VALUE 'subscriber_update';--> statement-breakpoint
ALTER TYPE "public"."lesson_source" ADD VALUE 'subscriber_retry';CREATE TABLE "processed_stripe_events" (
	"event_id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_notifications_read_at" ON "notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_stripe_subscription_id" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_stripe_customer_id" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");ALTER TABLE "commission_ledger" ALTER COLUMN "employee_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_requests" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD CONSTRAINT "letter_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD CONSTRAINT "letter_requests_assigned_reviewer_id_users_id_fk" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_versions" ADD CONSTRAINT "letter_versions_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;ALTER TYPE "public"."letter_status" ADD VALUE 'sent' BEFORE 'rejected';CREATE TABLE "admin_verification_codes" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "code" varchar(8) NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "used" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "submitter_role_id" varchar(16);--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "reviewer_role_id" varchar(16);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscriber_id" varchar(16);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employee_id" varchar(16);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "attorney_id" varchar(16);--> statement-breakpoint
CREATE INDEX "idx_admin_verification_codes_user_id" ON "admin_verification_codes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_subscriber_id_unique" UNIQUE("subscriber_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_unique" UNIQUE("employee_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_attorney_id_unique" UNIQUE("attorney_id");CREATE TABLE "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(300) NOT NULL,
	"title" varchar(300) NOT NULL,
	"excerpt" text NOT NULL,
	"content" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"meta_description" text,
	"og_image_url" varchar(2000),
	"author_name" varchar(200) DEFAULT 'Talk to My Lawyer' NOT NULL,
	"reading_time_minutes" integer DEFAULT 5 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_blog_posts_slug" ON "blog_posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_blog_posts_status" ON "blog_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_blog_posts_published_at" ON "blog_posts" USING btree ("published_at");ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "pipeline_locked_at" timestamp with time zone;ALTER TABLE "workflow_jobs" ADD COLUMN IF NOT EXISTS "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD COLUMN IF NOT EXISTS "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD COLUMN IF NOT EXISTS "estimated_cost_usd" numeric(10, 6);ALTER TABLE "research_runs" ADD COLUMN IF NOT EXISTS "cache_hit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "research_runs" ADD COLUMN IF NOT EXISTS "cache_key" varchar(256);-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0029: RLS InitPlan Performance & Index Fixes
-- Talk-to-My-Lawyer — Supabase PostgreSQL
--
-- Fixes Supabase performance advisor WARN-level auth_rls_initplan findings:
-- Wraps all current_setting() / app_user_id() / app_user_role() calls in
-- RLS policies with (SELECT ...) subqueries so PostgreSQL evaluates them
-- once per query (as an InitPlan) instead of per-row.
--
-- Also adds a missing foreign key index and removes a duplicate index.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── TABLE: users ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS users_select_own ON "users";--> statement-breakpoint
CREATE POLICY users_select_own ON "users"
  FOR SELECT
  USING (id = (SELECT public.app_user_id()) OR (SELECT public.is_app_admin()));--> statement-breakpoint

DROP POLICY IF EXISTS users_update_admin ON "users";--> statement-breakpoint
CREATE POLICY users_update_admin ON "users"
  FOR UPDATE
  USING ((SELECT public.is_app_admin()))
  WITH CHECK ((SELECT public.is_app_admin()));--> statement-breakpoint

DROP POLICY IF EXISTS users_update_own ON "users";--> statement-breakpoint
CREATE POLICY users_update_own ON "users"
  FOR UPDATE
  USING (id = (SELECT public.app_user_id()))
  WITH CHECK (id = (SELECT public.app_user_id()));--> statement-breakpoint

-- ─── TABLE: letter_requests ──────────────────────────────────────────────────

DROP POLICY IF EXISTS letter_requests_select_own ON "letter_requests";--> statement-breakpoint
CREATE POLICY letter_requests_select_own ON "letter_requests"
  FOR SELECT
  USING (user_id = (SELECT public.app_user_id()));--> statement-breakpoint

DROP POLICY IF EXISTS letter_requests_select_employee ON "letter_requests";--> statement-breakpoint
CREATE POLICY letter_requests_select_employee ON "letter_requests"
  FOR SELECT
  USING ((SELECT public.is_app_employee_or_admin()));--> statement-breakpoint

DROP POLICY IF EXISTS letter_requests_insert_own ON "letter_requests";--> statement-breakpoint
CREATE POLICY letter_requests_insert_own ON "letter_requests"
  FOR INSERT
  WITH CHECK (user_id = (SELECT public.app_user_id()) OR (SELECT public.is_app_admin()));--> statement-breakpoint

DROP POLICY IF EXISTS letter_requests_update_own ON "letter_requests";--> statement-breakpoint
CREATE POLICY letter_requests_update_own ON "letter_requests"
  FOR UPDATE
  USING (user_id = (SELECT public.app_user_id()) OR (SELECT public.is_app_employee_or_admin()))
  WITH CHECK (user_id = (SELECT public.app_user_id()) OR (SELECT public.is_app_employee_or_admin()));--> statement-breakpoint

-- ─── TABLE: letter_versions ──────────────────────────────────────────────────

DROP POLICY IF EXISTS letter_versions_select_own ON "letter_versions";--> statement-breakpoint
CREATE POLICY letter_versions_select_own ON "letter_versions"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "letter_requests" lr
      WHERE lr.id = letter_request_id AND lr.user_id = (SELECT public.app_user_id())
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS letter_versions_select_employee ON "letter_versions";--> statement-breakpoint
CREATE POLICY letter_versions_select_employee ON "letter_versions"
  FOR SELECT
  USING ((SELECT public.is_app_employee_or_admin()));--> statement-breakpoint

-- ─── TABLE: review_actions ───────────────────────────────────────────────────

DROP POLICY IF EXISTS review_actions_select_subscriber ON "review_actions";--> statement-breakpoint
CREATE POLICY review_actions_select_subscriber ON "review_actions"
  FOR SELECT
  USING (
    note_visibility = 'user_visible' AND EXISTS (
      SELECT 1 FROM "letter_requests" lr
      WHERE lr.id = letter_request_id AND lr.user_id = (SELECT public.app_user_id())
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS review_actions_select_employee ON "review_actions";--> statement-breakpoint
CREATE POLICY review_actions_select_employee ON "review_actions"
  FOR SELECT
  USING ((SELECT public.is_app_employee_or_admin()));--> statement-breakpoint

-- ─── TABLE: workflow_jobs ────────────────────────────────────────────────────

DROP POLICY IF EXISTS workflow_jobs_select_admin ON "workflow_jobs";--> statement-breakpoint
CREATE POLICY workflow_jobs_select_admin ON "workflow_jobs"
  FOR SELECT
  USING ((SELECT public.is_app_admin()));--> statement-breakpoint

DROP POLICY IF EXISTS workflow_jobs_update ON "workflow_jobs";--> statement-breakpoint
CREATE POLICY workflow_jobs_update ON "workflow_jobs"
  FOR UPDATE
  USING ((SELECT public.is_app_admin()))
  WITH CHECK (true);--> statement-breakpoint

DROP POLICY IF EXISTS workflow_jobs_delete_admin ON "workflow_jobs";--> statement-breakpoint
CREATE POLICY workflow_jobs_delete_admin ON "workflow_jobs"
  FOR DELETE
  USING ((SELECT public.is_app_admin()));--> statement-breakpoint

-- ─── TABLE: research_runs ────────────────────────────────────────────────────

DROP POLICY IF EXISTS research_runs_select ON "research_runs";--> statement-breakpoint
CREATE POLICY research_runs_select ON "research_runs"
  FOR SELECT
  USING ((SELECT public.is_app_employee_or_admin()));--> statement-breakpoint

-- ─── TABLE: attachments ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS attachments_select_own ON "attachments";--> statement-breakpoint
CREATE POLICY attachments_select_own ON "attachments"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "letter_requests" lr
      WHERE lr.id = letter_request_id AND lr.user_id = (SELECT public.app_user_id())
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS attachments_select_employee ON "attachments";--> statement-breakpoint
CREATE POLICY attachments_select_employee ON "attachments"
  FOR SELECT
  USING ((SELECT public.is_app_employee_or_admin()));--> statement-breakpoint

DROP POLICY IF EXISTS attachments_insert_own ON "attachments";--> statement-breakpoint
CREATE POLICY attachments_insert_own ON "attachments"
  FOR INSERT
  WITH CHECK (
    uploaded_by_user_id = (SELECT public.app_user_id()) OR (SELECT public.is_app_admin())
  );--> statement-breakpoint

-- ─── TABLE: notifications ────────────────────────────────────────────────────

DROP POLICY IF EXISTS notifications_select_own ON "notifications";--> statement-breakpoint
CREATE POLICY notifications_select_own ON "notifications"
  FOR SELECT
  USING (user_id = (SELECT public.app_user_id()) OR (SELECT public.is_app_admin()));--> statement-breakpoint

DROP POLICY IF EXISTS notifications_update_own ON "notifications";--> statement-breakpoint
CREATE POLICY notifications_update_own ON "notifications"
  FOR UPDATE
  USING (user_id = (SELECT public.app_user_id()))
  WITH CHECK (user_id = (SELECT public.app_user_id()));--> statement-breakpoint

-- ─── TABLE: subscriptions ────────────────────────────────────────────────────

DROP POLICY IF EXISTS subscriptions_select_own ON "subscriptions";--> statement-breakpoint
CREATE POLICY subscriptions_select_own ON "subscriptions"
  FOR SELECT
  USING (user_id = (SELECT public.app_user_id()) OR (SELECT public.is_app_admin()));--> statement-breakpoint

-- ─── TABLE: audit_log ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS audit_log_select_admin ON "audit_log";--> statement-breakpoint
CREATE POLICY audit_log_select_admin ON "audit_log"
  FOR SELECT
  USING ((SELECT public.is_app_admin()));--> statement-breakpoint

-- ─── Index Fixes ─────────────────────────────────────────────────────────────

DROP INDEX "idx_blog_posts_slug";--> statement-breakpoint
CREATE INDEX "idx_review_actions_reviewer_id" ON "review_actions" USING btree ("reviewer_id");
DO $$ BEGIN ALTER TYPE "public"."lesson_source" ADD VALUE IF NOT EXISTS 'consolidation'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "hit_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "times_injected" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "consolidated_from_ids" integer[];--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "letters_before_avg_score" integer;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "letters_after_avg_score" integer;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "effectiveness_samples" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "last_injected_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_lessons_type_jurisdiction_active" ON "pipeline_lessons" USING btree ("letter_type","jurisdiction","is_active");
ALTER TYPE "public"."letter_status" ADD VALUE 'client_revision_requested' BEFORE 'client_approved';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'client_declined' BEFORE 'client_approved';ALTER TYPE "public"."letter_type" ADD VALUE 'pre-litigation-settlement';--> statement-breakpoint
ALTER TYPE "public"."letter_type" ADD VALUE 'debt-collection';--> statement-breakpoint
ALTER TYPE "public"."letter_type" ADD VALUE 'estate-probate';--> statement-breakpoint
ALTER TYPE "public"."letter_type" ADD VALUE 'landlord-tenant';--> statement-breakpoint
ALTER TYPE "public"."letter_type" ADD VALUE 'insurance-dispute';--> statement-breakpoint
ALTER TYPE "public"."letter_type" ADD VALUE 'personal-injury-demand';--> statement-breakpoint
ALTER TYPE "public"."letter_type" ADD VALUE 'intellectual-property';--> statement-breakpoint
ALTER TYPE "public"."letter_type" ADD VALUE 'family-law';--> statement-breakpoint
ALTER TYPE "public"."letter_type" ADD VALUE 'neighbor-hoa';ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "quality_degraded" boolean DEFAULT false NOT NULL;CREATE TABLE "fine_tune_runs" (
        "id" serial PRIMARY KEY NOT NULL,
        "vertex_job_id" varchar(500),
        "base_model" varchar(200) NOT NULL,
        "training_example_count" integer NOT NULL,
        "status" varchar(50) DEFAULT 'submitted' NOT NULL,
        "gcs_training_file" varchar(1000),
        "result_model_id" varchar(500),
        "error_message" text,
        "started_at" timestamp with time zone DEFAULT now() NOT NULL,
        "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "training_log" (
        "id" serial PRIMARY KEY NOT NULL,
        "letter_request_id" integer NOT NULL,
        "letter_type" varchar(50) NOT NULL,
        "jurisdiction" varchar(100),
        "gcs_path" varchar(1000),
        "token_count" integer,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letter_versions" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);--> statement-breakpoint
CREATE INDEX "idx_fine_tune_runs_status" ON "fine_tune_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_fine_tune_runs_started_at" ON "fine_tune_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_training_log_letter_request_id" ON "training_log" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_training_log_created_at" ON "training_log" USING btree ("created_at");ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "initial_paywall_email_sent_at" timestamp with time zone;ALTER TABLE "letter_versions" ADD COLUMN "rag_summary" text;CREATE TABLE "letter_templates" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" varchar(200) NOT NULL,
        "scenario_description" text NOT NULL,
        "category" varchar(100) NOT NULL,
        "tags" text[] DEFAULT '{}' NOT NULL,
        "letter_type" "letter_type" NOT NULL,
        "prefill_data" jsonb NOT NULL,
        "active" boolean DEFAULT true NOT NULL,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "contextual_notes" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "template_id" integer;--> statement-breakpoint
CREATE INDEX "idx_letter_templates_active" ON "letter_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_letter_templates_letter_type" ON "letter_templates" USING btree ("letter_type");--> statement-breakpoint
CREATE INDEX "idx_letter_templates_sort_order" ON "letter_templates" USING btree ("sort_order");--> statement-breakpoint
ALTER TABLE "letter_requests" ADD CONSTRAINT "letter_requests_template_id_letter_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."letter_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "letter_templates" ("title", "scenario_description", "category", "tags", "letter_type", "prefill_data", "active", "sort_order") VALUES
  ('Unpaid Invoice', 'You completed work or delivered goods/services but the other party has not paid the agreed amount despite the payment being due.', 'Unpaid Money', ARRAY['invoice','payment','debt','services'], 'demand-letter', '{"subject":"Demand for Payment of Unpaid Invoice","description":"I completed work/delivered goods as agreed, but the other party has failed to pay the outstanding invoice despite the payment being past due.","desiredOutcome":"Full payment of the outstanding invoice amount plus any applicable late fees or interest.","tonePreference":"firm","letterType":"demand-letter"}', true, 10),
  ('Security Deposit Return', 'Your landlord has not returned your security deposit after you moved out, or has made improper deductions from it.', 'Property Damage', ARRAY['security deposit','landlord','tenant','rental'], 'landlord-tenant', '{"subject":"Demand for Return of Security Deposit","description":"I vacated the rental property and left it in good condition. My landlord has failed to return my security deposit within the legally required timeframe.","desiredOutcome":"Full return of the security deposit, or an itemized statement of any lawful deductions with the remaining balance returned.","tonePreference":"firm","letterType":"landlord-tenant"}', true, 20),
  ('Property Damage Claim', 'Someone else''s actions (or negligence) caused damage to your property — vehicle, home, personal belongings, etc.', 'Property Damage', ARRAY['property damage','negligence','compensation','repair'], 'demand-letter', '{"subject":"Demand for Compensation for Property Damage","description":"The other party''s actions or negligence caused damage to my property, and I am seeking compensation for the cost of repair or replacement.","desiredOutcome":"Full compensation for repair or replacement costs, including any related expenses.","tonePreference":"firm","letterType":"demand-letter"}', true, 30),
  ('Defective Product Refund', 'You purchased a product that turned out to be defective, broken, or not as described, and the seller has refused a refund or replacement.', 'Services Not Rendered', ARRAY['defective product','refund','consumer','warranty'], 'consumer-complaint', '{"subject":"Demand for Refund for Defective Product","description":"I purchased a product that was defective/not as described. Despite contacting the seller, they have refused to provide a refund or replacement.","desiredOutcome":"Full refund of the purchase price, or a replacement product that meets the original specifications.","tonePreference":"moderate","letterType":"consumer-complaint"}', true, 40),
  ('Breach of Service Agreement', 'A service provider failed to deliver the services they were contracted to perform, or performed them in a substandard manner.', 'Services Not Rendered', ARRAY['breach of contract','services','agreement','performance'], 'contract-breach', '{"subject":"Notice of Breach of Service Agreement","description":"The service provider failed to deliver the contracted services as agreed, or the services provided were substantially below the agreed-upon standard.","desiredOutcome":"Completion of the contracted services as originally agreed, or a full refund of amounts paid.","tonePreference":"firm","letterType":"contract-breach"}', true, 50),
  ('Debt Collection — Outstanding Balance', 'Someone owes you money — whether from a personal loan, business transaction, or other agreement — and has not repaid despite requests.', 'Unpaid Money', ARRAY['debt collection','outstanding balance','loan','repayment'], 'debt-collection', '{"subject":"Demand for Payment of Outstanding Debt","description":"The debtor owes me money from a prior agreement/transaction and has failed to make payment despite previous requests.","desiredOutcome":"Full repayment of the outstanding balance within 30 days.","tonePreference":"firm","letterType":"debt-collection"}', true, 60),
  ('Insurance Claim Denial Appeal', 'Your insurance company denied a legitimate claim, offered an unfairly low settlement, or is unreasonably delaying payment.', 'Unpaid Money', ARRAY['insurance','claim denial','appeal','settlement'], 'insurance-dispute', '{"subject":"Appeal of Insurance Claim Denial","description":"My insurance claim was denied or undervalued despite being a legitimate, covered claim under my policy. I am requesting a review and reconsideration.","desiredOutcome":"Reversal of the claim denial and full payment of the covered amount, or a fair settlement offer.","tonePreference":"moderate","letterType":"insurance-dispute"}', true, 70),
  ('Personal Injury — Accident Demand', 'You were injured due to someone else''s negligence (car accident, slip and fall, etc.) and are seeking compensation for medical bills, lost wages, and pain/suffering.', 'Property Damage', ARRAY['personal injury','accident','medical bills','negligence'], 'personal-injury-demand', '{"subject":"Demand for Compensation for Personal Injury","description":"I sustained injuries due to the other party''s negligence. I am seeking compensation for medical expenses, lost wages, and pain and suffering.","desiredOutcome":"Fair compensation covering all medical expenses, lost wages, and damages for pain and suffering.","tonePreference":"firm","letterType":"personal-injury-demand"}', true, 80)
ON CONFLICT DO NOTHING;CREATE TABLE "newsletter_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"source" varchar(100) DEFAULT 'footer',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_newsletter_subscribers_email" ON "newsletter_subscribers" USING btree ("email");DROP INDEX "idx_newsletter_subscribers_email";--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "submitted_by_admin" boolean DEFAULT false NOT NULL;ALTER TYPE "public"."job_type" ADD VALUE 'assembly';CREATE TABLE "intake_form_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"base_letter_type" "letter_type" NOT NULL,
	"field_config" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_intake_form_templates_owner" ON "intake_form_templates" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_intake_form_templates_letter_type" ON "intake_form_templates" USING btree ("base_letter_type");ALTER TABLE "users" ADD COLUMN "consent_to_training" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_subscriber_id_users_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_form_templates" ADD CONSTRAINT "intake_form_templates_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_quality_scores" ADD CONSTRAINT "letter_quality_scores_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD CONSTRAINT "pipeline_lessons_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attachments_uploaded_by" ON "attachments" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_status_reviewer" ON "letter_requests" USING btree ("status","assigned_reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_letter_versions_created_by" ON "letter_versions" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_jobs_created_at" ON "workflow_jobs" USING btree ("created_at");-- Migration 0044: Extract inline startup migrations from server/db/core.ts
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
CREATE INDEX "idx_letter_versions_request_type" ON "letter_versions" USING btree ("letter_request_id","version_type");--> statement-breakpoint
CREATE INDEX "idx_research_runs_status" ON "research_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_research_runs_cache_hit" ON "research_runs" USING btree ("cache_hit");--> statement-breakpoint
CREATE INDEX "idx_review_actions_action_created" ON "review_actions" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_users_role_active" ON "users" USING btree ("role","is_active");--> statement-breakpoint
CREATE INDEX "idx_workflow_jobs_status_created" ON "workflow_jobs" USING btree ("status","created_at");-- Migration 0046: new_tables_and_blog_review
-- Adds: client_portal_tokens, letter_analytics, letter_delivery_log
-- Uses CREATE TABLE IF NOT EXISTS — safe to apply even if tables already exist in DB.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_portal_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "token" varchar(64) NOT NULL UNIQUE,
  "recipient_email" varchar(320),
  "recipient_name" varchar(500),
  "expires_at" timestamp with time zone NOT NULL,
  "viewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_portal_tokens_letter_request_id" ON "client_portal_tokens" USING btree ("letter_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_portal_tokens_token" ON "client_portal_tokens" USING btree ("token");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "letter_analytics" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL UNIQUE REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "pipeline_duration_ms" integer,
  "stage_durations_json" jsonb,
  "total_tokens" integer,
  "total_cost_cents" integer,
  "vetting_iterations" integer DEFAULT 1 NOT NULL,
  "quality_score" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_letter_analytics_request_id" ON "letter_analytics" USING btree ("letter_request_id");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "letter_delivery_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "recipient_email" varchar(320),
  "recipient_name" varchar(500),
  "delivery_method" varchar(50) DEFAULT 'email' NOT NULL,
  "delivery_status" varchar(50) DEFAULT 'pending' NOT NULL,
  "resend_message_id" varchar(255),
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_letter_delivery_log_request_id" ON "letter_delivery_log" USING btree ("letter_request_id");
CREATE TABLE "client_portal_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_request_id" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"recipient_email" varchar(320),
	"recipient_name" varchar(500),
	"expires_at" timestamp with time zone NOT NULL,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_portal_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "letter_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_request_id" integer NOT NULL,
	"pipeline_duration_ms" integer,
	"stage_durations_json" jsonb,
	"total_tokens" integer,
	"total_cost_cents" integer,
	"vetting_iterations" integer DEFAULT 1 NOT NULL,
	"quality_score" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "letter_analytics_letter_request_id_unique" UNIQUE("letter_request_id")
);
--> statement-breakpoint
CREATE TABLE "letter_delivery_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_request_id" integer NOT NULL,
	"recipient_email" varchar(320),
	"recipient_name" varchar(500),
	"delivery_method" varchar(50) DEFAULT 'email' NOT NULL,
	"delivery_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"resend_message_id" varchar(255),
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "draft_ready_email_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "reviewed_by" varchar(200);--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_portal_tokens" ADD CONSTRAINT "client_portal_tokens_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_analytics" ADD CONSTRAINT "letter_analytics_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_delivery_log" ADD CONSTRAINT "letter_delivery_log_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_client_portal_tokens_letter_request_id" ON "client_portal_tokens" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_client_portal_tokens_token" ON "client_portal_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_letter_analytics_request_id" ON "letter_analytics" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_letter_delivery_log_request_id" ON "letter_delivery_log" USING btree ("letter_request_id");-- Migration 0048: free_preview_columns
-- Adds first-letter free-preview lead-magnet columns to letter_requests.
--
-- Flow:
--   1. Subscriber submits first letter → is_free_preview = TRUE, free_preview_unlock_at = now() + 24h
--   2. Pipeline generates draft as usual (status → generated_locked)
--   3. A polling cron (every 5 min) finds letters where:
--        is_free_preview = TRUE
--        AND free_preview_unlock_at <= now()
--        AND free_preview_email_sent_at IS NULL
--      → sends the "your draft is ready (unreviewed) — preview it" email and stamps
--        free_preview_email_sent_at to prevent duplicate sends.
--   4. Subscriber clicks the email → a tRPC read returns the FULL ai_draft (no truncation,
--      no PII redaction) because the letter is marked is_free_preview AND
--      free_preview_unlock_at has passed. Content is rendered non-selectable with
--      a DRAFT watermark in the UI.
--   5. Subscriber clicks "Submit For Attorney Review" → redirected to the subscribe flow.
--
-- These columns are strictly ADDITIVE — all existing letter-flow logic is unaffected
-- unless a letter opts into the free-preview path via is_free_preview = TRUE.
--
-- Uses IF NOT EXISTS — safe to apply against a database that already has some
-- or all of these columns (e.g. applied ad-hoc during an earlier patch).

--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "is_free_preview" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "free_preview_unlock_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "free_preview_email_sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "free_preview_viewed_at" timestamp with time zone;

--> statement-breakpoint
-- Composite partial index for the free-preview email scheduler — covers the exact
-- WHERE clause used by processFreePreviewEmails() so the scheduler polls cheaply
-- even with millions of historical letters.
CREATE INDEX IF NOT EXISTS "idx_letter_requests_free_preview_due"
  ON "letter_requests" ("free_preview_unlock_at")
  WHERE "is_free_preview" = true AND "free_preview_email_sent_at" IS NULL;
ALTER TABLE "letter_requests" RENAME COLUMN "initial_paywall_email_sent_at" TO "free_preview_viewed_at";--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "uploaded_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "approved_by_role" varchar(50);--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "is_free_preview" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "free_preview_unlock_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "free_preview_email_sent_at" timestamp with time zone;ALTER TYPE "public"."letter_status" ADD VALUE 'ai_generation_completed_hidden' BEFORE 'generated_locked';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'letter_released_to_subscriber' BEFORE 'generated_locked';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'attorney_review_upsell_shown' BEFORE 'generated_locked';-- Migration 0051: align live DB with app schema
--
-- Cleans up four classes of drift surfaced by the schema audit:
--
--   1. Add enum values used by the attorney-review checkout flow when a live
--      DB is missing them. These are already in drizzle/schema/constants.ts
--      and are idempotent here for local/live parity.
--
--   2. Drop orphan column `letter_requests.initial_paywall_email_sent_at`.
--      Migration 0049 intended to RENAME this to free_preview_viewed_at, but the
--      Supabase migration tracker only ran the IF-NOT-EXISTS variant (0048) which
--      added free_preview_viewed_at directly — leaving initial_paywall_email_sent_at
--      orphaned. No code in server/, client/, or shared/ references the old column.
--      (3 historical rows have non-NULL values; those timestamps are from the legacy
--      paywall-email feature that no longer exists and are not load-bearing.)
--
--   3. Drop duplicate index `idx_blog_posts_slug`. It is identical to the
--      constraint-backed `blog_posts_slug_unique` (UNIQUE btree on slug).
--
--   4. Add covering indexes for 5 unindexed foreign keys flagged by the
--      Supabase performance advisor. All five are FKs that would otherwise
--      require a sequential scan when the parent row is deleted/updated.
--
--   5. Harden the search_path on 10 application-defined PL/pgSQL/SQL
--      functions. With a mutable search_path, a malicious schema on the
--      role's search path could shadow a function or operator and execute
--      arbitrary code in the function's security context. Pinning to
--      `public, pg_catalog` closes the hole. Only public.* app functions
--      are touched here; pg-boss/pgmq functions are owned by their
--      extensions and managed upstream.
--
-- NOTE on `letter_status` enum drift (`assembling`, `vetting` in DB but not
-- in drizzle): Postgres does not support `ALTER TYPE ... DROP VALUE`, and
-- recreating the enum would require rewriting every column that uses it.
-- Per the audit, zero rows use either value. They are handled by adding
-- them to drizzle's letterStatusEnum with a `// legacy` marker (matching
-- the existing pattern for generated_unlocked / upsell_dismissed) — see
-- the companion edit to drizzle/schema/constants.ts. No DDL needed.
--
-- All statements use IF EXISTS / IF NOT EXISTS where applicable so the
-- migration is idempotent and safe to re-run.

--> statement-breakpoint
-- 1. Add enum values required by the app state machine
ALTER TYPE "public"."letter_status"
  ADD VALUE IF NOT EXISTS 'attorney_review_checkout_started'
  AFTER 'attorney_review_upsell_shown';

--> statement-breakpoint
ALTER TYPE "public"."letter_status"
  ADD VALUE IF NOT EXISTS 'attorney_review_payment_confirmed'
  AFTER 'attorney_review_checkout_started';

--> statement-breakpoint
-- 2. Drop orphan column
ALTER TABLE "letter_requests" DROP COLUMN IF EXISTS "initial_paywall_email_sent_at";

--> statement-breakpoint
-- 3. Drop duplicate index (the UNIQUE constraint index `blog_posts_slug_unique` remains)
DROP INDEX IF EXISTS "idx_blog_posts_slug";

--> statement-breakpoint
-- 4. Cover unindexed foreign keys
CREATE INDEX IF NOT EXISTS "idx_commission_ledger_letter_request_id"
  ON "commission_ledger" ("letter_request_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commission_ledger_subscriber_id"
  ON "commission_ledger" ("subscriber_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_letter_requests_template_id"
  ON "letter_requests" ("template_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payout_requests_processed_by"
  ON "payout_requests" ("processed_by");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_lessons_created_by_user_id"
  ON "pipeline_lessons" ("created_by_user_id");

--> statement-breakpoint
-- 5. Pin search_path on app functions (closes function_search_path_mutable advisor warnings)
ALTER FUNCTION public.app_user_id() SET search_path = public, pg_catalog;
ALTER FUNCTION public.app_user_role() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_app_admin() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_app_employee_or_admin() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_app_subscriber() SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_catalog;
-- cleanup_old_stream_chunks is a PROCEDURE (prokind = 'p'), not a function
ALTER PROCEDURE public.cleanup_old_stream_chunks() SET search_path = public, pg_catalog;
ALTER FUNCTION public.count_training_examples_since_last_tune() SET search_path = public, pg_catalog;

--> statement-breakpoint
-- match_letters has two overloads — pin both
ALTER FUNCTION public.match_letters(vector, double precision, integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.match_letters(vector, double precision, integer, text, text)
  SET search_path = public, pg_catalog;

--> statement-breakpoint
ALTER FUNCTION public.match_letters_v2(vector, double precision, integer)
  SET search_path = public, pg_catalog;
-- 0052_canonical_enums.sql
--
-- Reconciles every pgEnum defined in `drizzle/schema/constants.ts` with the
-- live database. Use when a database has drifted from the canonical schema
-- (e.g. older deploys where `ALTER TYPE … ADD VALUE` was missed) or for
-- rebuilding from scratch on a fresh Supabase project.
--
-- Strategy:
--   * `CREATE TYPE … IF NOT EXISTS` for the initial type definition.
--   * `ALTER TYPE … ADD VALUE IF NOT EXISTS` for every value, so this file is
--     idempotent and safe to re-run.
--   * Wrapped in DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL END $$
--     because `ALTER TYPE … ADD VALUE` cannot run inside a transaction block,
--     and the exception swallow keeps the script flowing on Postgres versions
--     that don't fully support `IF NOT EXISTS` in this context.
--
-- Order matches `drizzle/schema/constants.ts` (lines 125-311).

-- ─── user_role ───────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."user_role" AS ENUM ('subscriber', 'employee', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'attorney'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── letter_status ───────────────────────────────────────────────────────
-- 24 values total, 3 legacy (assembling, vetting, generated_unlocked, upsell_dismissed)
-- kept in the enum because Postgres can't DROP VALUE.
DO $$ BEGIN CREATE TYPE "public"."letter_status" AS ENUM ('submitted', 'researching', 'drafting', 'generated_locked', 'pending_review', 'under_review', 'needs_changes', 'approved', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'assembling'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'vetting'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'ai_generation_completed_hidden'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'letter_released_to_subscriber'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'attorney_review_upsell_shown'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'attorney_review_checkout_started'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'attorney_review_payment_confirmed'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'generated_unlocked'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'upsell_dismissed'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'pipeline_failed'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'client_approval_pending'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'client_revision_requested'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'client_declined'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'client_approved'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'sent'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── letter_type ─────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."letter_type" AS ENUM ('demand-letter', 'cease-and-desist', 'contract-breach', 'eviction-notice', 'employment-dispute', 'consumer-complaint', 'general-legal'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'pre-litigation-settlement'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'debt-collection'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'estate-probate'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'landlord-tenant'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'insurance-dispute'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'personal-injury-demand'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'intellectual-property'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'family-law'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'neighbor-hoa'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── version_type ────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."version_type" AS ENUM ('ai_draft', 'attorney_edit', 'final_approved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── actor_type ──────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."actor_type" AS ENUM ('system', 'subscriber', 'employee', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."actor_type" ADD VALUE IF NOT EXISTS 'attorney'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── job_status ──────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."job_status" AS ENUM ('queued', 'running', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── job_type ────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."job_type" AS ENUM ('research', 'draft_generation', 'generation_pipeline', 'retry'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."job_type" ADD VALUE IF NOT EXISTS 'vetting'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."job_type" ADD VALUE IF NOT EXISTS 'assembly'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── research_status ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."research_status" AS ENUM ('queued', 'running', 'completed', 'failed', 'invalid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── priority_level ──────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."priority_level" AS ENUM ('low', 'normal', 'high', 'urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── note_visibility ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."note_visibility" AS ENUM ('internal', 'user_visible'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── subscription_plan ───────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."subscription_plan" AS ENUM ('per_letter', 'monthly', 'annual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'monthly_basic'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'free_trial_review'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'starter'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'professional'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'single_letter'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'yearly'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── subscription_status ─────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."subscription_status" AS ENUM ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'none'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── commission_status ───────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."commission_status" AS ENUM ('pending', 'paid', 'voided'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── payout_status ───────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."payout_status" AS ENUM ('pending', 'processing', 'completed', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── pipeline_stage ──────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."pipeline_stage" AS ENUM ('research', 'drafting', 'assembly', 'vetting'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── lesson_category ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."lesson_category" AS ENUM ('citation_error', 'jurisdiction_error', 'tone_issue', 'structure_issue', 'factual_error', 'bloat_detected', 'missing_section', 'style_preference', 'legal_accuracy', 'general'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── lesson_source ───────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."lesson_source" AS ENUM ('attorney_approval', 'attorney_rejection', 'attorney_changes', 'attorney_edit', 'manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."lesson_source" ADD VALUE IF NOT EXISTS 'subscriber_update'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."lesson_source" ADD VALUE IF NOT EXISTS 'subscriber_retry'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."lesson_source" ADD VALUE IF NOT EXISTS 'consolidation'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "public"."letter_status" ADD VALUE 'assembling' BEFORE 'ai_generation_completed_hidden';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'vetting' BEFORE 'ai_generation_completed_hidden';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'attorney_review_checkout_started' BEFORE 'generated_locked';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'attorney_review_payment_confirmed' BEFORE 'generated_locked';--> statement-breakpoint
CREATE TABLE "pipeline_stream_chunks" (
	"id" bigint PRIMARY KEY NOT NULL,
	"letter_id" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"stage" varchar(50) DEFAULT 'draft' NOT NULL,
	"sequence_number" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_stream_chunks" ADD CONSTRAINT "pipeline_stream_chunks_letter_id_letter_requests_id_fk" FOREIGN KEY ("letter_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pipeline_stream_chunks_letter_id" ON "pipeline_stream_chunks" USING btree ("letter_id");--> statement-breakpoint
CREATE INDEX "idx_pipeline_stream_chunks_letter_sequence" ON "pipeline_stream_chunks" USING btree ("letter_id","sequence_number");-- Talk-to-My-Lawyer: Initial PostgreSQL Schema Migration
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
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0002: Row Level Security Policies, Helper Functions, Performance Indexes
-- Talk-to-My-Lawyer — Supabase PostgreSQL
-- 
-- ARCHITECTURE NOTE:
-- This app uses Supabase Auth with server-side JWT verification, so auth.uid() is NOT available.
-- Server-side Drizzle ORM queries use the postgres.js driver (which connects as the
-- database owner / service_role equivalent), so RLS is effectively bypassed for
-- server-side operations. These policies serve as DEFENSE-IN-DEPTH:
--   1. If anyone connects via Supabase client SDK (anon/authenticated key), RLS applies
--   2. If Supabase Dashboard "Data" tab is used, RLS applies to non-service-role users
--   3. Prevents accidental data leaks from misconfigured API routes
--
-- The helper functions use a session variable approach: the server sets
-- current_setting('app.current_user_id') and current_setting('app.current_user_role')
-- before queries when RLS enforcement is desired.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Helper Functions ─────────────────────────────────────────────────────────

-- Get the current app user ID from session variable (set by server middleware)
CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::INTEGER;
$$;

-- Get the current app user role from session variable
CREATE OR REPLACE FUNCTION public.app_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_role', true), '');
$$;

-- Check if current session user is admin
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_user_role() = 'admin';
$$;

-- Check if current session user is employee (or admin)
CREATE OR REPLACE FUNCTION public.is_app_employee_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_user_role() IN ('employee', 'admin');
$$;

-- Check if current session user is subscriber
CREATE OR REPLACE FUNCTION public.is_app_subscriber()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_user_role() = 'subscriber';
$$;

-- ─── Enable RLS on ALL 9 tables ──────────────────────────────────────────────

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "letter_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "letter_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "review_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "research_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;

-- ─── FORCE RLS (applies even to table owners, except superuser) ──────────────
-- NOTE: We do NOT use FORCE because our Drizzle connection uses the DB owner role.
-- If we FORCE, all Drizzle queries would need session vars set. Instead, RLS only
-- applies to non-owner roles (anon, authenticated, dashboard users).

-- ─── TABLE: users ─────────────────────────────────────────────────────────────

-- Subscribers can see their own row
CREATE POLICY users_select_own ON "users"
  FOR SELECT
  USING (id = public.app_user_id() OR public.is_app_admin());

-- Admins can update any user (role changes, etc.)
CREATE POLICY users_update_admin ON "users"
  FOR UPDATE
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- Users can update their own profile
CREATE POLICY users_update_own ON "users"
  FOR UPDATE
  USING (id = public.app_user_id())
  WITH CHECK (id = public.app_user_id());

-- Insert: system/server only (handled by Drizzle as DB owner)
CREATE POLICY users_insert_system ON "users"
  FOR INSERT
  WITH CHECK (true);

-- ─── TABLE: letter_requests ──────────────────────────────────────────────────

-- Subscribers see own letters
CREATE POLICY letter_requests_select_own ON "letter_requests"
  FOR SELECT
  USING (user_id = public.app_user_id());

-- Employees/admins see letters in reviewable statuses
CREATE POLICY letter_requests_select_employee ON "letter_requests"
  FOR SELECT
  USING (public.is_app_employee_or_admin());

-- Subscribers can create letters
CREATE POLICY letter_requests_insert_own ON "letter_requests"
  FOR INSERT
  WITH CHECK (user_id = public.app_user_id() OR public.is_app_admin());

-- Subscribers can update own letters (e.g., updateForChanges)
CREATE POLICY letter_requests_update_own ON "letter_requests"
  FOR UPDATE
  USING (user_id = public.app_user_id() OR public.is_app_employee_or_admin())
  WITH CHECK (user_id = public.app_user_id() OR public.is_app_employee_or_admin());

-- ─── TABLE: letter_versions ──────────────────────────────────────────────────

-- Subscribers see versions for their own letters
CREATE POLICY letter_versions_select_own ON "letter_versions"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "letter_requests" lr
      WHERE lr.id = letter_request_id AND lr.user_id = public.app_user_id()
    )
  );

-- Employees/admins see all versions
CREATE POLICY letter_versions_select_employee ON "letter_versions"
  FOR SELECT
  USING (public.is_app_employee_or_admin());

-- Insert: system and employees/admins (attorney edits, AI drafts)
CREATE POLICY letter_versions_insert ON "letter_versions"
  FOR INSERT
  WITH CHECK (true);

-- ─── TABLE: review_actions ───────────────────────────────────────────────────

-- Subscribers see user_visible notes on their own letters
CREATE POLICY review_actions_select_subscriber ON "review_actions"
  FOR SELECT
  USING (
    note_visibility = 'user_visible' AND EXISTS (
      SELECT 1 FROM "letter_requests" lr
      WHERE lr.id = letter_request_id AND lr.user_id = public.app_user_id()
    )
  );

-- Employees/admins see all review actions
CREATE POLICY review_actions_select_employee ON "review_actions"
  FOR SELECT
  USING (public.is_app_employee_or_admin());

-- Insert: employees/admins and system
CREATE POLICY review_actions_insert ON "review_actions"
  FOR INSERT
  WITH CHECK (true);

-- ─── TABLE: workflow_jobs ────────────────────────────────────────────────────

-- Admins only
CREATE POLICY workflow_jobs_select_admin ON "workflow_jobs"
  FOR SELECT
  USING (public.is_app_admin());

-- System insert (pipeline creates jobs)
CREATE POLICY workflow_jobs_insert ON "workflow_jobs"
  FOR INSERT
  WITH CHECK (true);

-- System/admin update
CREATE POLICY workflow_jobs_update ON "workflow_jobs"
  FOR UPDATE
  USING (public.is_app_admin())
  WITH CHECK (true);

-- Admin delete (purge failed jobs)
CREATE POLICY workflow_jobs_delete_admin ON "workflow_jobs"
  FOR DELETE
  USING (public.is_app_admin());

-- ─── TABLE: research_runs ────────────────────────────────────────────────────

-- Admins and employees (review center shows research)
CREATE POLICY research_runs_select ON "research_runs"
  FOR SELECT
  USING (public.is_app_employee_or_admin());

-- System insert
CREATE POLICY research_runs_insert ON "research_runs"
  FOR INSERT
  WITH CHECK (true);

-- System update
CREATE POLICY research_runs_update ON "research_runs"
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ─── TABLE: attachments ──────────────────────────────────────────────────────

-- Subscribers see attachments for their own letters
CREATE POLICY attachments_select_own ON "attachments"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "letter_requests" lr
      WHERE lr.id = letter_request_id AND lr.user_id = public.app_user_id()
    )
  );

-- Employees/admins see all attachments
CREATE POLICY attachments_select_employee ON "attachments"
  FOR SELECT
  USING (public.is_app_employee_or_admin());

-- Subscribers can upload to own letters
CREATE POLICY attachments_insert_own ON "attachments"
  FOR INSERT
  WITH CHECK (
    uploaded_by_user_id = public.app_user_id() OR public.is_app_admin()
  );

-- ─── TABLE: notifications ────────────────────────────────────────────────────

-- Users see only their own notifications
CREATE POLICY notifications_select_own ON "notifications"
  FOR SELECT
  USING (user_id = public.app_user_id() OR public.is_app_admin());

-- System insert
CREATE POLICY notifications_insert ON "notifications"
  FOR INSERT
  WITH CHECK (true);

-- Users can mark own notifications as read
CREATE POLICY notifications_update_own ON "notifications"
  FOR UPDATE
  USING (user_id = public.app_user_id())
  WITH CHECK (user_id = public.app_user_id());

-- ─── TABLE: subscriptions ────────────────────────────────────────────────────

-- Subscribers see own subscriptions
CREATE POLICY subscriptions_select_own ON "subscriptions"
  FOR SELECT
  USING (user_id = public.app_user_id() OR public.is_app_admin());

-- System insert (Stripe webhook creates subscriptions)
CREATE POLICY subscriptions_insert ON "subscriptions"
  FOR INSERT
  WITH CHECK (true);

-- System update (Stripe webhook updates subscriptions)
CREATE POLICY subscriptions_update ON "subscriptions"
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ─── Performance Indexes ─────────────────────────────────────────────────────

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_letter_requests_user_status
  ON "letter_requests" (user_id, status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON "subscriptions" (user_id, status);

-- Partial indexes for hot queries (active pipeline letters)
CREATE INDEX IF NOT EXISTS idx_letter_requests_active
  ON "letter_requests" (user_id)
  WHERE status IN ('submitted', 'researching', 'drafting', 'generated_locked', 'pending_review', 'under_review');

-- Partial index for active subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON "subscriptions" (user_id)
  WHERE status = 'active';

-- Partial index for pending review letters (employee queue)
CREATE INDEX IF NOT EXISTS idx_letter_requests_pending_review
  ON "letter_requests" (status, assigned_reviewer_id)
  WHERE status IN ('pending_review', 'under_review', 'needs_changes');

-- Index for notification unread count
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON "notifications" (user_id)
  WHERE read_at IS NULL;
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0003: Atomic Database Functions + Audit Trigger
-- Talk-to-My-Lawyer — Supabase PostgreSQL
--
-- Adapted from ttml-database-rls-security skill patterns.
-- Our schema uses INTEGER serial IDs (not UUIDs) and specific enum types.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Function: check_and_deduct_allowance ────────────────────────────────────
-- Race-safe subscription deduction with row-level locking.
-- Called from billing.payToUnlock and billing.freeUnlock procedures.

CREATE OR REPLACE FUNCTION public.check_and_deduct_allowance(
  p_user_id INTEGER,
  p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(
  success BOOLEAN,
  remaining INTEGER,
  error_message TEXT
) AS $func$
DECLARE
  v_subscription_id INTEGER;
  v_letters_allowed INTEGER;
  v_letters_used INTEGER;
BEGIN
  -- Lock subscription row for update (prevents race conditions)
  SELECT id, letters_allowed, letters_used
  INTO v_subscription_id, v_letters_allowed, v_letters_used
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_subscription_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'No active subscription found'::TEXT;
    RETURN;
  END IF;

  -- Check if unlimited (-1 = unlimited for monthly/annual plans)
  IF v_letters_allowed = -1 THEN
    -- Increment usage counter but always allow
    UPDATE subscriptions
    SET letters_used = letters_used + p_amount, updated_at = NOW()
    WHERE id = v_subscription_id;
    RETURN QUERY SELECT TRUE, -1, NULL::TEXT;
    RETURN;
  END IF;

  -- Check sufficient allowance
  IF (v_letters_allowed - v_letters_used) >= p_amount THEN
    UPDATE subscriptions
    SET letters_used = letters_used + p_amount, updated_at = NOW()
    WHERE id = v_subscription_id;
    RETURN QUERY SELECT TRUE, (v_letters_allowed - v_letters_used - p_amount), NULL::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, (v_letters_allowed - v_letters_used), 'Insufficient letter allowance'::TEXT;
  END IF;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── Function: refund_letter_allowance ───────────────────────────────────────
-- Atomic refund on pipeline failure. Decrements letters_used.

CREATE OR REPLACE FUNCTION public.refund_letter_allowance(
  p_user_id INTEGER,
  p_letter_id INTEGER,
  p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(
  success BOOLEAN,
  new_remaining INTEGER,
  error_message TEXT
) AS $func$
DECLARE
  v_subscription_id INTEGER;
  v_letters_allowed INTEGER;
  v_letters_used INTEGER;
BEGIN
  SELECT id, letters_allowed, letters_used
  INTO v_subscription_id, v_letters_allowed, v_letters_used
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_subscription_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'No active subscription found'::TEXT;
    RETURN;
  END IF;

  -- Decrement usage (but never below 0)
  UPDATE subscriptions
  SET
    letters_used = GREATEST(letters_used - p_amount, 0),
    updated_at = NOW()
  WHERE id = v_subscription_id;

  -- Return new remaining
  IF v_letters_allowed = -1 THEN
    RETURN QUERY SELECT TRUE, -1, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT TRUE, (v_letters_allowed - GREATEST(v_letters_used - p_amount, 0)), NULL::TEXT;
  END IF;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── Function: safe_status_transition ────────────────────────────────────────
-- Validates the status machine at the database level.
-- Prevents invalid transitions even if the application layer has a bug.

CREATE OR REPLACE FUNCTION public.safe_status_transition(
  p_letter_id INTEGER,
  p_new_status letter_status,
  p_actor_id INTEGER DEFAULT NULL,
  p_actor_type actor_type DEFAULT 'system'
)
RETURNS TABLE(
  success BOOLEAN,
  old_status TEXT,
  error_message TEXT
) AS $func$
DECLARE
  v_current_status letter_status;
  v_allowed TEXT[];
BEGIN
  -- Lock the letter row
  SELECT status INTO v_current_status
  FROM letter_requests
  WHERE id = p_letter_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Letter not found'::TEXT;
    RETURN;
  END IF;

  -- Define allowed transitions (mirrors the TypeScript ALLOWED_TRANSITIONS)
  v_allowed := CASE v_current_status::TEXT
    WHEN 'submitted' THEN ARRAY['researching']
    WHEN 'researching' THEN ARRAY['drafting']
    WHEN 'drafting' THEN ARRAY['generated_locked']
    WHEN 'generated_locked' THEN ARRAY['pending_review']
    WHEN 'pending_review' THEN ARRAY['under_review']
    WHEN 'under_review' THEN ARRAY['approved', 'rejected', 'needs_changes']
    WHEN 'needs_changes' THEN ARRAY['researching', 'drafting']
    ELSE ARRAY[]::TEXT[]
  END;

  -- Check if transition is allowed
  IF NOT (p_new_status::TEXT = ANY(v_allowed)) THEN
    RETURN QUERY SELECT FALSE, v_current_status::TEXT,
      format('Invalid transition: %s -> %s (allowed: %s)', v_current_status, p_new_status, array_to_string(v_allowed, ', '))::TEXT;
    RETURN;
  END IF;

  -- Perform the transition
  UPDATE letter_requests
  SET status = p_new_status, updated_at = NOW()
  WHERE id = p_letter_id;

  -- Log in review_actions audit trail
  INSERT INTO review_actions (
    letter_request_id, actor_user_id, actor_type, action,
    from_status, to_status, note_text, note_visibility
  ) VALUES (
    p_letter_id, p_actor_id, p_actor_type, 'status_transition',
    v_current_status::TEXT, p_new_status::TEXT,
    format('Status changed from %s to %s', v_current_status, p_new_status),
    'internal'
  );

  RETURN QUERY SELECT TRUE, v_current_status::TEXT, NULL::TEXT;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── Audit Log Table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  actor_user_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);


-- ─── Audit Trigger Function ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER AS $func$
BEGIN
  INSERT INTO public.audit_log(
    table_name,
    operation,
    record_id,
    old_values,
    new_values,
    changed_fields,
    actor_user_id
  ) VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    CASE WHEN TG_OP = 'UPDATE' THEN
      ARRAY(
        SELECT key FROM jsonb_each(to_jsonb(NEW))
        WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
      )
    ELSE NULL END,
    public.app_user_id()
  );
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Apply Audit Triggers to Sensitive Tables ────────────────────────────────

-- Letter status changes (most critical)
DROP TRIGGER IF EXISTS letter_requests_audit ON letter_requests;
CREATE TRIGGER letter_requests_audit
  AFTER UPDATE ON letter_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_audit_event();

-- Subscription changes (billing-critical)
DROP TRIGGER IF EXISTS subscriptions_audit ON subscriptions;
CREATE TRIGGER subscriptions_audit
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- User role changes (security-critical)
DROP TRIGGER IF EXISTS users_role_audit ON users;
CREATE TRIGGER users_role_audit
  AFTER UPDATE ON users
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.log_audit_event();


-- ─── Enable RLS on audit_log ─────────────────────────────────────────────────

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY audit_log_select_admin ON audit_log
  FOR SELECT USING (public.is_app_admin());

-- System can insert (triggers run as SECURITY DEFINER)
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (true);
-- Migration 0004: Finite letter allowances + explicit free-trial tracking
--
-- 1. Normalize any existing -1 (unlimited) rows to their correct per-plan finite value.
-- 2. Add CHECK constraint so letters_allowed can never be written as -1 again.
-- 3. Add free_review_used_at column to users so the free-trial-used state is
--    explicit and no longer derived from letter-count queries.

-- ── Step 1: Normalise legacy -1 rows ─────────────────────────────────────────
UPDATE subscriptions
SET letters_allowed = CASE plan
  WHEN 'free_trial'         THEN 1
  WHEN 'free_trial_review'  THEN 1
  WHEN 'per_letter'         THEN 1
  WHEN 'monthly_basic'      THEN 4
  WHEN 'starter'            THEN 4
  WHEN 'monthly'            THEN 4
  WHEN 'monthly_pro'        THEN 8
  WHEN 'professional'       THEN 8
  WHEN 'annual'             THEN 8
  ELSE 1
END
WHERE letters_allowed = -1;

-- ── Step 2: Add non-negative constraint ───────────────────────────────────────
ALTER TABLE subscriptions
  ADD CONSTRAINT check_letters_allowed_non_negative
  CHECK (letters_allowed >= 0);

-- ── Step 3: Explicit free-trial tracking column ───────────────────────────────
-- NULL means the free trial has not been used.
-- Non-NULL timestamp means it was used at that point in time.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS free_review_used_at TIMESTAMPTZ;
ALTER TABLE letter_requests ADD COLUMN IF NOT EXISTS research_unverified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category varchar(50) NOT NULL DEFAULT 'general';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_category_check'
  ) THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_category_check
      CHECK (category IN ('users', 'letters', 'employee', 'general'));
  END IF;
END $$;
ALTER TYPE "job_type" ADD VALUE IF NOT EXISTS 'vetting';
CREATE TABLE IF NOT EXISTS "document_analyses" (
  "id" serial PRIMARY KEY NOT NULL,
  "document_name" varchar(500) NOT NULL,
  "file_type" varchar(20) NOT NULL,
  "analysis_json" jsonb NOT NULL,
  "user_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_document_analyses_user_id" ON "document_analyses" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_document_analyses_created_at" ON "document_analyses" ("created_at");
ALTER TYPE "lesson_source" ADD VALUE IF NOT EXISTS 'subscriber_update';
ALTER TYPE "lesson_source" ADD VALUE IF NOT EXISTS 'subscriber_retry';
ALTER TYPE "letter_status" ADD VALUE IF NOT EXISTS 'pipeline_failed';
ALTER TYPE "letter_status" ADD VALUE IF NOT EXISTS 'sent';
-- Migration 0011: Add role-specific human-readable IDs and letter tracking

-- 1. Add role-specific human-readable IDs to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscriber_id VARCHAR(16) UNIQUE,
  ADD COLUMN IF NOT EXISTS employee_id VARCHAR(16) UNIQUE,
  ADD COLUMN IF NOT EXISTS attorney_id VARCHAR(16) UNIQUE;

-- Backfill subscriber IDs (safe for re-run: starts from current max + 1)
WITH max_existing AS (
  SELECT COALESCE(MAX(CAST(SPLIT_PART(subscriber_id, '-', 2) AS INTEGER)), 0) AS max_num
  FROM users WHERE subscriber_id LIKE 'SUB-%'
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) + me.max_num AS rn
  FROM users, max_existing me
  WHERE role = 'subscriber' AND subscriber_id IS NULL
)
UPDATE users
SET subscriber_id = 'SUB-' || LPAD(ranked.rn::text, 4, '0')
FROM ranked
WHERE users.id = ranked.id;

-- Backfill employee IDs (safe for re-run)
WITH max_existing AS (
  SELECT COALESCE(MAX(CAST(SPLIT_PART(employee_id, '-', 2) AS INTEGER)), 0) AS max_num
  FROM users WHERE employee_id LIKE 'EMP-%'
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) + me.max_num AS rn
  FROM users, max_existing me
  WHERE role = 'employee' AND employee_id IS NULL
)
UPDATE users
SET employee_id = 'EMP-' || LPAD(ranked.rn::text, 4, '0')
FROM ranked
WHERE users.id = ranked.id;

-- Backfill attorney IDs (safe for re-run)
WITH max_existing AS (
  SELECT COALESCE(MAX(CAST(SPLIT_PART(attorney_id, '-', 2) AS INTEGER)), 0) AS max_num
  FROM users WHERE attorney_id LIKE 'ATT-%'
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) + me.max_num AS rn
  FROM users, max_existing me
  WHERE role = 'attorney' AND attorney_id IS NULL
)
UPDATE users
SET attorney_id = 'ATT-' || LPAD(ranked.rn::text, 4, '0')
FROM ranked
WHERE users.id = ranked.id;

-- 2. Add submitter and reviewer role IDs to letter_requests for tracking
ALTER TABLE letter_requests
  ADD COLUMN IF NOT EXISTS submitter_role_id VARCHAR(16),
  ADD COLUMN IF NOT EXISTS reviewer_role_id VARCHAR(16);

-- Backfill submitter_role_id for existing letters
UPDATE letter_requests lr
SET submitter_role_id = u.subscriber_id
FROM users u
WHERE lr.user_id = u.id AND u.subscriber_id IS NOT NULL AND lr.submitter_role_id IS NULL;

-- Backfill reviewer_role_id for existing letters that have an assigned reviewer
UPDATE letter_requests lr
SET reviewer_role_id = u.attorney_id
FROM users u
WHERE lr.assigned_reviewer_id = u.id AND u.attorney_id IS NOT NULL AND lr.reviewer_role_id IS NULL;
-- Migration 0012: Add admin verification codes table for 2FA

CREATE TABLE IF NOT EXISTS admin_verification_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  code VARCHAR(8) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_verification_codes_user_id ON admin_verification_codes(user_id);
-- Migration 0013: Add pipeline_locked_at column for DB-level pipeline execution locking
-- Prevents concurrent pipeline runs for the same letter across restarts or horizontal scaling.

ALTER TABLE letter_requests
  ADD COLUMN IF NOT EXISTS pipeline_locked_at TIMESTAMPTZ;
-- Migration 0014: Add cacheHit and cacheKey fields to research_runs
-- Supports Cloudflare KV-based research result caching.

ALTER TABLE research_runs
  ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cache_key VARCHAR(256);
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0015: Database Security Hardening
-- Talk-to-My-Lawyer — Supabase PostgreSQL
--
-- Fixes identified by Supabase security advisor audit:
--   1. Set immutable search_path = '' on all public helper functions
--   2. Add explicit RLS policies to 6 unprotected system tables
--   3. Tighten overly-permissive INSERT policies (WITH CHECK (true))
--   4. Set search_path on audit trigger function
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: Fix function search_path vulnerabilities
-- Setting search_path = '' forces fully-qualified references, preventing
-- search_path injection attacks.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Helper functions from migration 0002 (sql STABLE functions)
-- These only use built-ins and current_setting, so ALTER is safe.
ALTER FUNCTION public.app_user_id() SET search_path = '';
ALTER FUNCTION public.app_user_role() SET search_path = '';

-- These call other public.* functions which are already fully-qualified.
ALTER FUNCTION public.is_app_admin() SET search_path = '';
ALTER FUNCTION public.is_app_employee_or_admin() SET search_path = '';
ALTER FUNCTION public.is_app_subscriber() SET search_path = '';

-- update_updated_at_column from migration 0001 (trigger function)
-- Body only uses NEW.updated_at and now(), no table references needed.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';

-- ─── Recreate log_audit_event with fully-qualified references ──────────────
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER AS $func$
BEGIN
  INSERT INTO public.audit_log(
    table_name,
    operation,
    record_id,
    old_values,
    new_values,
    changed_fields,
    actor_user_id
  ) VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    CASE WHEN TG_OP = 'UPDATE' THEN
      ARRAY(
        SELECT key FROM jsonb_each(to_jsonb(NEW))
        WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
      )
    ELSE NULL END,
    public.app_user_id()
  );
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ─── Recreate check_and_deduct_allowance with fully-qualified references ───
CREATE OR REPLACE FUNCTION public.check_and_deduct_allowance(
  p_user_id INTEGER,
  p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(
  success BOOLEAN,
  remaining INTEGER,
  error_message TEXT
) AS $func$
DECLARE
  v_subscription_id INTEGER;
  v_letters_allowed INTEGER;
  v_letters_used INTEGER;
BEGIN
  SELECT id, letters_allowed, letters_used
  INTO v_subscription_id, v_letters_allowed, v_letters_used
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_subscription_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'No active subscription found'::TEXT;
    RETURN;
  END IF;

  IF v_letters_allowed = -1 THEN
    UPDATE public.subscriptions
    SET letters_used = letters_used + p_amount, updated_at = NOW()
    WHERE id = v_subscription_id;
    RETURN QUERY SELECT TRUE, -1, NULL::TEXT;
    RETURN;
  END IF;

  IF (v_letters_allowed - v_letters_used) >= p_amount THEN
    UPDATE public.subscriptions
    SET letters_used = letters_used + p_amount, updated_at = NOW()
    WHERE id = v_subscription_id;
    RETURN QUERY SELECT TRUE, (v_letters_allowed - v_letters_used - p_amount), NULL::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, (v_letters_allowed - v_letters_used), 'Insufficient letter allowance'::TEXT;
  END IF;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ─── Recreate refund_letter_allowance with fully-qualified references ──────
CREATE OR REPLACE FUNCTION public.refund_letter_allowance(
  p_user_id INTEGER,
  p_letter_id INTEGER,
  p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(
  success BOOLEAN,
  new_remaining INTEGER,
  error_message TEXT
) AS $func$
DECLARE
  v_subscription_id INTEGER;
  v_letters_allowed INTEGER;
  v_letters_used INTEGER;
BEGIN
  SELECT id, letters_allowed, letters_used
  INTO v_subscription_id, v_letters_allowed, v_letters_used
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_subscription_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'No active subscription found'::TEXT;
    RETURN;
  END IF;

  UPDATE public.subscriptions
  SET
    letters_used = GREATEST(letters_used - p_amount, 0),
    updated_at = NOW()
  WHERE id = v_subscription_id;

  IF v_letters_allowed = -1 THEN
    RETURN QUERY SELECT TRUE, -1, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT TRUE, (v_letters_allowed - GREATEST(v_letters_used - p_amount, 0)), NULL::TEXT;
  END IF;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ─── Recreate safe_status_transition with fully-qualified references ───────
CREATE OR REPLACE FUNCTION public.safe_status_transition(
  p_letter_id INTEGER,
  p_new_status public.letter_status,
  p_actor_id INTEGER DEFAULT NULL,
  p_actor_type public.actor_type DEFAULT 'system'
)
RETURNS TABLE(
  success BOOLEAN,
  old_status TEXT,
  error_message TEXT
) AS $func$
DECLARE
  v_current_status public.letter_status;
  v_allowed TEXT[];
BEGIN
  SELECT status INTO v_current_status
  FROM public.letter_requests
  WHERE id = p_letter_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Letter not found'::TEXT;
    RETURN;
  END IF;

  v_allowed := CASE v_current_status::TEXT
    WHEN 'submitted' THEN ARRAY['researching']
    WHEN 'researching' THEN ARRAY['drafting']
    WHEN 'drafting' THEN ARRAY['generated_locked']
    WHEN 'generated_locked' THEN ARRAY['pending_review']
    WHEN 'pending_review' THEN ARRAY['under_review']
    WHEN 'under_review' THEN ARRAY['approved', 'rejected', 'needs_changes']
    WHEN 'needs_changes' THEN ARRAY['researching', 'drafting']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_new_status::TEXT = ANY(v_allowed)) THEN
    RETURN QUERY SELECT FALSE, v_current_status::TEXT,
      format('Invalid transition: %s -> %s (allowed: %s)', v_current_status, p_new_status, array_to_string(v_allowed, ', '))::TEXT;
    RETURN;
  END IF;

  UPDATE public.letter_requests
  SET status = p_new_status, updated_at = NOW()
  WHERE id = p_letter_id;

  INSERT INTO public.review_actions (
    letter_request_id, actor_user_id, actor_type, action,
    from_status, to_status, note_text, note_visibility
  ) VALUES (
    p_letter_id, p_actor_id, p_actor_type, 'status_transition',
    v_current_status::TEXT, p_new_status::TEXT,
    format('Status changed from %s to %s', v_current_status, p_new_status),
    'internal'
  );

  RETURN QUERY SELECT TRUE, v_current_status::TEXT, NULL::TEXT;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: Add explicit RLS policies to 6 unprotected system tables
-- These tables were created after the initial RLS migration and lack policies.
-- Access is restricted to service_role (DB owner bypasses RLS) or admin users.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── TABLE: admin_verification_codes ───────────────────────────────────────
ALTER TABLE "admin_verification_codes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_verification_codes_select ON "admin_verification_codes"
  FOR SELECT
  USING (public.is_app_admin());

CREATE POLICY admin_verification_codes_insert ON "admin_verification_codes"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

CREATE POLICY admin_verification_codes_delete ON "admin_verification_codes"
  FOR DELETE
  USING (public.is_app_admin());

-- ─── TABLE: blog_posts ────────────────────────────────────────────────────
-- Server-side Drizzle (DB owner) bypasses RLS for public blog serving.
-- Non-owner roles restricted to admin only.
ALTER TABLE "blog_posts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY blog_posts_select_admin ON "blog_posts"
  FOR SELECT
  USING (public.is_app_admin());

CREATE POLICY blog_posts_insert_admin ON "blog_posts"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

CREATE POLICY blog_posts_update_admin ON "blog_posts"
  FOR UPDATE
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

CREATE POLICY blog_posts_delete_admin ON "blog_posts"
  FOR DELETE
  USING (public.is_app_admin());

-- ─── TABLE: document_analyses ─────────────────────────────────────────────
-- Server-side Drizzle (DB owner) handles user-scoped queries.
-- Non-owner roles restricted to admin only.
ALTER TABLE "document_analyses" ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_analyses_select ON "document_analyses"
  FOR SELECT
  USING (public.is_app_admin());

CREATE POLICY document_analyses_insert ON "document_analyses"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

-- ─── TABLE: letter_quality_scores ─────────────────────────────────────────
-- Internal metrics table — admin/service_role only.
ALTER TABLE "letter_quality_scores" ENABLE ROW LEVEL SECURITY;

CREATE POLICY letter_quality_scores_select ON "letter_quality_scores"
  FOR SELECT
  USING (public.is_app_admin());

CREATE POLICY letter_quality_scores_insert ON "letter_quality_scores"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

-- ─── TABLE: pipeline_lessons ──────────────────────────────────────────────
-- Internal learning data — admin/service_role only.
ALTER TABLE "pipeline_lessons" ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_lessons_select ON "pipeline_lessons"
  FOR SELECT
  USING (public.is_app_admin());

CREATE POLICY pipeline_lessons_insert ON "pipeline_lessons"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

CREATE POLICY pipeline_lessons_update ON "pipeline_lessons"
  FOR UPDATE
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- ─── TABLE: processed_stripe_events ───────────────────────────────────────
ALTER TABLE "processed_stripe_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY processed_stripe_events_select ON "processed_stripe_events"
  FOR SELECT
  USING (public.is_app_admin());

CREATE POLICY processed_stripe_events_insert ON "processed_stripe_events"
  FOR INSERT
  WITH CHECK (public.is_app_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: Enable RLS on commission_ledger and email_verification_tokens
-- These tables were also added after migration 0002 without RLS.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── TABLE: commission_ledger ─────────────────────────────────────────────
ALTER TABLE "commission_ledger" ENABLE ROW LEVEL SECURITY;

-- Drop any legacy permissive INSERT policy (commission_ledger_insert)
DROP POLICY IF EXISTS commission_ledger_insert ON "commission_ledger";

CREATE POLICY commission_ledger_select ON "commission_ledger"
  FOR SELECT
  USING (public.is_app_admin());

CREATE POLICY commission_ledger_insert ON "commission_ledger"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

CREATE POLICY commission_ledger_update ON "commission_ledger"
  FOR UPDATE
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- ─── TABLE: email_verification_tokens ─────────────────────────────────────
ALTER TABLE "email_verification_tokens" ENABLE ROW LEVEL SECURITY;

-- Drop any legacy permissive INSERT policy (evt_insert) that may exist
-- in the live database with WITH CHECK (true)
DROP POLICY IF EXISTS evt_insert ON "email_verification_tokens";

CREATE POLICY email_verification_tokens_select ON "email_verification_tokens"
  FOR SELECT
  USING (public.is_app_admin());

CREATE POLICY email_verification_tokens_insert ON "email_verification_tokens"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

CREATE POLICY email_verification_tokens_delete ON "email_verification_tokens"
  FOR DELETE
  USING (public.is_app_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 4: Tighten overly-permissive INSERT policies
-- Replace WITH CHECK (true) on specific policies with role-scoped conditions.
-- Uses DROP + CREATE since ALTER POLICY cannot change WITH CHECK.
-- ═══════════════════════════════════════════════════════════════════════════════

-- users_insert_system: was WITH CHECK (true), restrict to admin only
-- (Server-side Drizzle runs as DB owner, so service_role bypasses RLS.
--  This policy only affects non-owner roles like anon/authenticated.)
DROP POLICY IF EXISTS users_insert_system ON "users";
CREATE POLICY users_insert_system ON "users"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

-- audit_log_insert: was WITH CHECK (true), restrict to admin
-- (Triggers use SECURITY DEFINER so they bypass RLS; this prevents
--  direct non-owner inserts.)
DROP POLICY IF EXISTS audit_log_insert ON "audit_log";
CREATE POLICY audit_log_insert ON "audit_log"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

-- letter_versions_insert: was WITH CHECK (true)
DROP POLICY IF EXISTS letter_versions_insert ON "letter_versions";
CREATE POLICY letter_versions_insert ON "letter_versions"
  FOR INSERT
  WITH CHECK (public.is_app_employee_or_admin());

-- review_actions_insert: was WITH CHECK (true)
DROP POLICY IF EXISTS review_actions_insert ON "review_actions";
CREATE POLICY review_actions_insert ON "review_actions"
  FOR INSERT
  WITH CHECK (public.is_app_employee_or_admin());

-- workflow_jobs_insert: was WITH CHECK (true)
DROP POLICY IF EXISTS workflow_jobs_insert ON "workflow_jobs";
CREATE POLICY workflow_jobs_insert ON "workflow_jobs"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

-- research_runs_insert: was WITH CHECK (true)
DROP POLICY IF EXISTS research_runs_insert ON "research_runs";
CREATE POLICY research_runs_insert ON "research_runs"
  FOR INSERT
  WITH CHECK (public.is_app_employee_or_admin());

-- notifications_insert: was WITH CHECK (true)
DROP POLICY IF EXISTS notifications_insert ON "notifications";
CREATE POLICY notifications_insert ON "notifications"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

-- subscriptions_insert: was WITH CHECK (true)
DROP POLICY IF EXISTS subscriptions_insert ON "subscriptions";
CREATE POLICY subscriptions_insert ON "subscriptions"
  FOR INSERT
  WITH CHECK (public.is_app_admin());

-- subscriptions_update: was USING (true) WITH CHECK (true)
DROP POLICY IF EXISTS subscriptions_update ON "subscriptions";
CREATE POLICY subscriptions_update ON "subscriptions"
  FOR UPDATE
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- research_runs_update: was USING (true) WITH CHECK (true)
DROP POLICY IF EXISTS research_runs_update ON "research_runs";
CREATE POLICY research_runs_update ON "research_runs"
  FOR UPDATE
  USING (public.is_app_employee_or_admin())
  WITH CHECK (public.is_app_employee_or_admin());

-- workflow_jobs_update: USING was admin but WITH CHECK was (true)
DROP POLICY IF EXISTS workflow_jobs_update ON "workflow_jobs";
CREATE POLICY workflow_jobs_update ON "workflow_jobs"
  FOR UPDATE
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 5: Enable RLS on discount_codes and payout_requests tables
-- (catch any remaining unprotected tables)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE "discount_codes" ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'CREATE POLICY discount_codes_select ON "discount_codes" FOR SELECT USING (public.is_app_admin())';
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'CREATE POLICY discount_codes_insert ON "discount_codes" FOR INSERT WITH CHECK (public.is_app_admin())';
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'CREATE POLICY discount_codes_update ON "discount_codes" FOR UPDATE USING (public.is_app_admin()) WITH CHECK (public.is_app_admin())';
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payout_requests" ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'CREATE POLICY payout_requests_select ON "payout_requests" FOR SELECT USING (employee_id = public.app_user_id() OR public.is_app_admin())';
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'CREATE POLICY payout_requests_insert ON "payout_requests" FOR INSERT WITH CHECK (public.is_app_admin())';
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'CREATE POLICY payout_requests_update ON "payout_requests" FOR UPDATE USING (public.is_app_admin()) WITH CHECK (public.is_app_admin())';
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 6: Leaked Password Protection (Manual Step)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ACTION REQUIRED: Enable HaveIBeenPwned leaked password checking in Supabase.
--
-- Steps:
--   1. Go to Supabase Dashboard → Authentication → Settings → Security
--   2. Enable "Leaked Password Protection" (HaveIBeenPwned integration)
--   3. This prevents users from signing up or changing passwords to known
--      compromised credentials.
--
-- This is a Supabase Auth configuration toggle and cannot be set via SQL.
-- Verification: After enabling, attempt signup with a known leaked password
-- (e.g., "password123") and confirm it is rejected.
-- ═══════════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0016: Lesson Embeddings & Fine-Tune Infrastructure
-- Talk-to-My-Lawyer — Supabase PostgreSQL
--
-- Changes:
--   1. Add embedding vector(1536) column to pipeline_lessons
--   2. Add HNSW index on pipeline_lessons.embedding for fast ANN search
--   3. Add match_lessons() helper function for semantic retrieval
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add embedding column ──────────────────────────────────────────────────
ALTER TABLE pipeline_lessons
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- ── 2. HNSW index for approximate nearest-neighbour search ───────────────────
-- cosine distance (<=>), same as letter_versions uses implicitly.
-- Created concurrently so it doesn't lock the table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pipeline_lessons_embedding
  ON pipeline_lessons
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ── 3. match_lessons() — semantic similarity function ────────────────────────
-- Returns active lessons ordered by cosine similarity to a query embedding.
-- Falls back gracefully to an empty result if pgvector isn't available.
CREATE OR REPLACE FUNCTION match_lessons(
  query_embedding  vector(1536),
  match_threshold  float   DEFAULT 0.70,
  match_count      int     DEFAULT 10,
  p_letter_type    text    DEFAULT NULL,
  p_jurisdiction   text    DEFAULT NULL,
  p_pipeline_stage text    DEFAULT NULL
)
RETURNS TABLE (
  id                        int,
  letter_type               text,
  jurisdiction              text,
  pipeline_stage            text,
  category                  text,
  lesson_text               text,
  weight                    int,
  hit_count                 int,
  times_injected            int,
  letters_before_avg_score  int,
  letters_after_avg_score   int,
  similarity                float
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT
    pl.id,
    pl.letter_type::text,
    pl.jurisdiction,
    pl.pipeline_stage::text,
    pl.category::text,
    pl.lesson_text,
    pl.weight,
    pl.hit_count,
    pl.times_injected,
    pl.letters_before_avg_score,
    pl.letters_after_avg_score,
    1 - (pl.embedding <=> query_embedding) AS similarity
  FROM public.pipeline_lessons pl
  WHERE pl.is_active = true
    AND pl.embedding IS NOT NULL
    AND 1 - (pl.embedding <=> query_embedding) >= match_threshold
    AND (p_letter_type   IS NULL OR pl.letter_type    = p_letter_type::public.letter_type_enum   OR pl.letter_type IS NULL)
    AND (p_jurisdiction  IS NULL OR pl.jurisdiction   = p_jurisdiction                            OR pl.jurisdiction IS NULL)
    AND (p_pipeline_stage IS NULL OR pl.pipeline_stage = p_pipeline_stage::public.pipeline_stage_enum OR pl.pipeline_stage IS NULL)
  ORDER BY pl.embedding <=> query_embedding
  LIMIT match_count;
$$;
-- Migration: 0017_initial_paywall_email_sent_at
-- Adds initial_paywall_email_sent_at column to letter_requests table.
-- This column tracks when the first timed paywall notification email was sent
-- to the subscriber (10-15 minutes after the letter reaches generated_locked status).
-- NULL means the email has not been sent yet.
-- Idempotency: the cron job only sends the email once per letter.

ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "initial_paywall_email_sent_at" timestamp with time zone;
ALTER TABLE "letter_requests" ADD COLUMN "submitted_by_admin" boolean DEFAULT false NOT NULL;CREATE TABLE IF NOT EXISTS "intake_form_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_user_id" integer NOT NULL,
  "title" varchar(200) NOT NULL,
  "base_letter_type" "letter_type" NOT NULL,
  "field_config" jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_intake_form_templates_owner" ON "intake_form_templates" ("owner_user_id");
CREATE INDEX IF NOT EXISTS "idx_intake_form_templates_letter_type" ON "intake_form_templates" ("base_letter_type");
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0020: RLS Insert Policy Hardening (Supabase Security Advisor fixes)
-- Talk-to-My-Lawyer — Supabase PostgreSQL
--
-- Problem:
--   Four tables had P0 "WITH CHECK (true)" INSERT policies that effectively
--   allowed any client (anon or authenticated) to insert arbitrary rows,
--   bypassing business invariants:
--
--     1. commission_ledger        — affiliate/employee commissions (money)
--     2. email_verification_tokens — auth tokens (account takeover risk)
--     3. newsletter_subscribers   — mailing list (spam/abuse risk)
--     4. users                    — account creation (privilege escalation)
--
-- Resolution (per product owner):
--   - commission_ledger      → service_role / admin only (backend-only inserts
--                              after successful Stripe checkout + affiliate code)
--   - email_verification_tokens → service_role only (only auth flows issue tokens)
--   - users                  → service_role only (only backend creates users
--                              via Supabase Auth → local users sync)
--   - newsletter_subscribers → anon + authenticated allowed (public signup form)
--
-- Backend context:
--   Our Drizzle connection (server/db/core.ts) uses postgres-js with the
--   Supabase DB-owner role, which bypasses RLS. These policies apply to
--   clients hitting Supabase REST/PostgREST directly (anon/authenticated key)
--   or the Supabase Dashboard Data tab. They are defense-in-depth.
--
-- Mirrors the policies applied ad-hoc via Supabase SQL editor on 2026-04-22.
-- Idempotent (DROP POLICY IF EXISTS ... CREATE POLICY ...).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Ensure RLS is enabled on all four tables ────────────────────────────────

ALTER TABLE public.commission_ledger         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                     ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. commission_ledger — service_role / admin only
-- ═══════════════════════════════════════════════════════════════════════════════
-- Rows are created automatically by the Stripe webhook handler
-- (server/stripeWebhook/handlers/checkout.ts → trackCommission() →
--  server/db/affiliates.ts → createCommission()) when a subscriber
-- successfully pays with an affiliate-tied discount code.
-- No client should ever write to this table directly.

DROP POLICY IF EXISTS commission_ledger_insert            ON public.commission_ledger;
DROP POLICY IF EXISTS commission_ledger_insert_system     ON public.commission_ledger;
DROP POLICY IF EXISTS commission_ledger_service_insert    ON public.commission_ledger;

CREATE POLICY commission_ledger_service_insert
  ON public.commission_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR (current_setting('role'::text, true) = 'service_role'::text)
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. email_verification_tokens — service_role only
-- ═══════════════════════════════════════════════════════════════════════════════
-- Rows are issued by the backend during signup / email-change / resend flows
-- (server/supabaseAuth/routes/verification.ts, signup-login.ts,
--  server/routers/profile.ts).
-- Clients must never mint their own verification tokens.

DROP POLICY IF EXISTS email_verification_tokens_insert         ON public.email_verification_tokens;
DROP POLICY IF EXISTS email_verification_tokens_insert_system  ON public.email_verification_tokens;
DROP POLICY IF EXISTS email_verification_tokens_service_insert ON public.email_verification_tokens;
DROP POLICY IF EXISTS evt_insert                               ON public.email_verification_tokens;
DROP POLICY IF EXISTS evt_service_role_insert                  ON public.email_verification_tokens;

CREATE POLICY evt_service_role_insert
  ON public.email_verification_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_app_admin()
    OR (current_setting('role'::text, true) = 'service_role'::text)
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. users — service_role only
-- ═══════════════════════════════════════════════════════════════════════════════
-- The public.users table is populated by backend upsertUser() calls during
-- Supabase Auth → local sync (server/db/users.ts, server/supabaseAuth/*).
-- Clients must never insert their own user rows — role defaults, freeReviewUsedAt,
-- and the super-admin whitelist depend on backend-only creation.
-- Replaces the old permissive "users_insert_system WITH CHECK (true)" policy.

DROP POLICY IF EXISTS users_insert                ON public.users;
DROP POLICY IF EXISTS users_insert_system         ON public.users;
DROP POLICY IF EXISTS users_service_insert        ON public.users;
DROP POLICY IF EXISTS users_service_role_insert   ON public.users;

CREATE POLICY users_service_role_insert
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_app_admin()
    OR (current_setting('role'::text, true) = 'service_role'::text)
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. newsletter_subscribers — anon + authenticated allowed
-- ═══════════════════════════════════════════════════════════════════════════════
-- The footer newsletter signup form is publicly accessible (no auth).
-- Backend endpoint: POST /api/newsletter/subscribe (server/newsletterRoute.ts).
-- Anonymous visitors AND authenticated users may add themselves. Rate-limiting
-- and email validation happen at the app layer (and should be tightened — see
-- audit notes in TODO).

DROP POLICY IF EXISTS newsletter_subscribers_insert        ON public.newsletter_subscribers;
DROP POLICY IF EXISTS newsletter_subscribers_insert_system ON public.newsletter_subscribers;
DROP POLICY IF EXISTS newsletter_subscribers_public_insert ON public.newsletter_subscribers;

CREATE POLICY newsletter_subscribers_public_insert
  ON public.newsletter_subscribers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════════════════════
-- Run after apply:
--   SELECT schemaname, tablename, policyname, cmd, roles, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('commission_ledger','email_verification_tokens',
--                       'newsletter_subscribers','users')
--     AND cmd = 'INSERT'
--   ORDER BY tablename, policyname;
-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0046: new tables + blog_posts review columns
--
-- Adds:
--   1. letter_delivery_log   — tracks every outbound delivery to the recipient
--   2. client_portal_tokens  — time-limited tokens for the recipient portal view
--   3. letter_analytics      — per-letter pipeline performance & cost data
--   4. blog_posts.reviewed_by / reviewed_at  — admin sign-off before publish
-- ═══════════════════════════════════════════════════════════════════════════════

--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. letter_delivery_log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "letter_delivery_log" (
  "id"                 serial          PRIMARY KEY,
  "letter_request_id"  integer         NOT NULL
    REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "recipient_email"    varchar(320),
  "recipient_name"     varchar(500),
  "delivery_method"    varchar(50)     NOT NULL DEFAULT 'email',
  "delivery_status"    varchar(50)     NOT NULL DEFAULT 'pending',
  "resend_message_id"  varchar(255),
  "delivered_at"       timestamptz,
  "created_at"         timestamptz     NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_letter_delivery_log_request_id"
  ON "letter_delivery_log" ("letter_request_id");

--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. client_portal_tokens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "client_portal_tokens" (
  "id"                 serial          PRIMARY KEY,
  "letter_request_id"  integer         NOT NULL
    REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "token"              varchar(64)     NOT NULL UNIQUE,
  "recipient_email"    varchar(320),
  "recipient_name"     varchar(500),
  "expires_at"         timestamptz     NOT NULL,
  "viewed_at"          timestamptz,
  "created_at"         timestamptz     NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_portal_tokens_letter_request_id"
  ON "client_portal_tokens" ("letter_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_portal_tokens_token"
  ON "client_portal_tokens" ("token");

--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. letter_analytics
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "letter_analytics" (
  "id"                    serial          PRIMARY KEY,
  "letter_request_id"     integer         NOT NULL UNIQUE
    REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "pipeline_duration_ms"  integer,
  "stage_durations_json"  jsonb,
  "total_tokens"          integer,
  "total_cost_cents"      integer,
  "vetting_iterations"    integer         NOT NULL DEFAULT 1,
  "quality_score"         text,
  "created_at"            timestamptz     NOT NULL DEFAULT now(),
  "updated_at"            timestamptz     NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_letter_analytics_request_id"
  ON "letter_analytics" ("letter_request_id");

--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. blog_posts — add reviewed_by + reviewed_at columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "blog_posts"
  ADD COLUMN IF NOT EXISTS "reviewed_by"  varchar(200),
  ADD COLUMN IF NOT EXISTS "reviewed_at"  timestamptz;
