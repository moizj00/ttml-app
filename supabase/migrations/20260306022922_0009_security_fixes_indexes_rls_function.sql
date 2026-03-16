/*
  # Security Fixes: Unused Indexes, RLS Policies, and Function Search Path

  ## Summary
  This migration addresses multiple security audit findings to harden the database layer.

  ## 1. Unused Indexes (DROPPED)
  The following indexes have never been used by queries and are being removed to reduce
  storage overhead and write latency:
  - `idx_audit_log_table_record` on audit_log(table_name, record_id)
  - `idx_audit_log_created` on audit_log(created_at)
  - `idx_letter_requests_status` on letter_requests(status)
  - `idx_letter_requests_user_id` on letter_requests(user_id)
  - `idx_letter_requests_assigned_reviewer` on letter_requests(assigned_reviewer_id)
  - `idx_letter_versions_letter_request_id` on letter_versions(letter_request_id)
  - `idx_research_runs_letter_request_status` on research_runs(letter_request_id, status)
  - `idx_review_actions_letter_request_id` on review_actions(letter_request_id)
  - `idx_workflow_jobs_letter_request_status` on workflow_jobs(letter_request_id, status)

  ## 2. Function Search Path Vulnerability (FIXED)
  - `log_audit_event()` function now uses immutable `search_path = ''` to prevent
    search_path injection attacks. All table/function references are now fully qualified.

  ## 3. RLS Policy Always-True Vulnerabilities (TIGHTENED)
  The following policies had `WITH CHECK (true)` which bypasses RLS for authenticated users.
  They now enforce proper authorization:

  ### audit_log
  - INSERT: Only system operations (service_role or internal triggers) can insert

  ### letter_versions
  - INSERT: Only employees/admins OR system can create versions for valid letter requests

  ### notifications
  - INSERT: Only system/admin can create notifications for users

  ### research_runs
  - INSERT: Only system/admin can create research runs
  - UPDATE: Only system/admin can update research runs

  ### review_actions
  - INSERT: Only employees/admins or system can create review actions

  ### subscriptions
  - INSERT: Only for the authenticated user's own subscription OR admin
  - UPDATE: Only for the authenticated user's own subscription OR admin/system

  ### users
  - INSERT: Service role only (handled by auth signup flow)

  ### workflow_jobs
  - INSERT: Only system/admin can create jobs
  - UPDATE: Only system/admin can update jobs

  ## Security Impact
  - Prevents unauthorized data insertion via direct DB access
  - Ensures audit trail integrity
  - Hardens against search_path manipulation attacks
*/

-- ═══════════════════════════════════════════════════════
-- SECTION 1: DROP UNUSED INDEXES
-- ═══════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.idx_audit_log_table_record;
DROP INDEX IF EXISTS public.idx_audit_log_created;
DROP INDEX IF EXISTS public.idx_letter_requests_status;
DROP INDEX IF EXISTS public.idx_letter_requests_user_id;
DROP INDEX IF EXISTS public.idx_letter_requests_assigned_reviewer;
DROP INDEX IF EXISTS public.idx_letter_versions_letter_request_id;
DROP INDEX IF EXISTS public.idx_research_runs_letter_request_status;
DROP INDEX IF EXISTS public.idx_review_actions_letter_request_id;
DROP INDEX IF EXISTS public.idx_workflow_jobs_letter_request_status;

-- ═══════════════════════════════════════════════════════
-- SECTION 2: FIX log_audit_event FUNCTION SEARCH_PATH
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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
$function$;

-- ═══════════════════════════════════════════════════════
-- SECTION 3: TIGHTEN RLS POLICIES
-- ═══════════════════════════════════════════════════════

-- ─── audit_log: INSERT ───
-- Only triggers/system can insert (not direct user access)
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY "audit_log_system_insert"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Only service_role or internal triggers should insert
    -- This blocks direct client inserts while allowing trigger-based inserts
    current_setting('role', true) = 'service_role'
    OR current_setting('request.jwt.claim.role', true) IS NULL
  );

-- ─── letter_versions: INSERT ───
-- Only employees/admins or system can create versions
DROP POLICY IF EXISTS letter_versions_insert ON public.letter_versions;
CREATE POLICY "letter_versions_authorized_insert"
  ON public.letter_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Must be employee/admin creating version, OR system (service_role)
    public.is_app_employee_or_admin()
    OR current_setting('role', true) = 'service_role'
  );

-- ─── notifications: INSERT ───
-- System/admin creates notifications for users
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY "notifications_system_insert"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Admin can create notifications OR service_role (system)
    public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  );

-- ─── research_runs: INSERT ───
DROP POLICY IF EXISTS research_runs_insert ON public.research_runs;
CREATE POLICY "research_runs_system_insert"
  ON public.research_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Only system/admin can create research runs (pipeline-only)
    public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  );

-- ─── research_runs: UPDATE ───
DROP POLICY IF EXISTS research_runs_update ON public.research_runs;
CREATE POLICY "research_runs_system_update"
  ON public.research_runs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  )
  WITH CHECK (
    public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  );

-- ─── review_actions: INSERT ───
DROP POLICY IF EXISTS review_actions_insert ON public.review_actions;
CREATE POLICY "review_actions_authorized_insert"
  ON public.review_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Employees/admins/attorneys can create review actions, or system
    public.is_app_employee_or_admin()
    OR current_setting('role', true) = 'service_role'
  );

-- ─── subscriptions: INSERT ───
DROP POLICY IF EXISTS subscriptions_insert ON public.subscriptions;
CREATE POLICY "subscriptions_user_or_system_insert"
  ON public.subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User can only create subscription for themselves, admin/system can create any
    user_id = public.app_user_id()
    OR public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  );

-- ─── subscriptions: UPDATE ───
DROP POLICY IF EXISTS subscriptions_update ON public.subscriptions;
CREATE POLICY "subscriptions_user_or_system_update"
  ON public.subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    user_id = public.app_user_id()
    OR public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  )
  WITH CHECK (
    user_id = public.app_user_id()
    OR public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  );

-- ─── users: INSERT ───
DROP POLICY IF EXISTS users_insert ON public.users;
CREATE POLICY "users_service_role_insert"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Only service_role can insert users (auth signup flow)
    -- OR admin creating users manually
    public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  );

-- ─── workflow_jobs: INSERT ───
DROP POLICY IF EXISTS workflow_jobs_insert ON public.workflow_jobs;
CREATE POLICY "workflow_jobs_system_insert"
  ON public.workflow_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Only system/admin can create workflow jobs
    public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  );

-- ─── workflow_jobs: UPDATE ───
DROP POLICY IF EXISTS workflow_jobs_update ON public.workflow_jobs;
CREATE POLICY "workflow_jobs_system_update"
  ON public.workflow_jobs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  )
  WITH CHECK (
    public.is_app_admin()
    OR current_setting('role', true) = 'service_role'
  );
