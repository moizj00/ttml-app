-- ═══════════════════════════════════════════════════════════════════════════════
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
