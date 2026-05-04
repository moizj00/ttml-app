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
CREATE INDEX IF NOT EXISTS "idx_letter_delivery_log_request_id"
  ON "letter_delivery_log" ("letter_request_id");


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
CREATE INDEX IF NOT EXISTS "idx_client_portal_tokens_letter_request_id"
  ON "client_portal_tokens" ("letter_request_id");
CREATE INDEX IF NOT EXISTS "idx_client_portal_tokens_token"
  ON "client_portal_tokens" ("token");


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
CREATE INDEX IF NOT EXISTS "idx_letter_analytics_request_id"
  ON "letter_analytics" ("letter_request_id");


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. blog_posts — add reviewed_by + reviewed_at columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "blog_posts"
  ADD COLUMN IF NOT EXISTS "reviewed_by"  varchar(200),
  ADD COLUMN IF NOT EXISTS "reviewed_at"  timestamptz;
