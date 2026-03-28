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
