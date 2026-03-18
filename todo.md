# Talk-to-My-Lawyer TODO

## Phase 1: Foundation
- [x] Database schema (users roles, letter_requests, letter_versions, review_actions, workflow_jobs, research_runs, attachments, notifications)
- [x] Status machine enum and transition validation (submitted → researching → drafting → pending_review → under_review → approved/rejected/needs_changes, NO draft state)
- [x] Global design system (color palette, typography, theme)

## Phase 2: Auth & Navigation
- [x] Role-based user system (subscriber, employee, admin)
- [x] Role-based routing and navigation
- [x] DashboardLayout with sidebar for each role (AppLayout component)
- [x] Login/auth flow with role detection and auto-redirect

## Phase 3: Subscriber Portal
- [x] Multi-step letter intake form (jurisdiction, matter type, parties, facts, desired outcome)
- [x] File upload for attachments (S3 integration)
- [x] My Letters list page with status badges
- [x] Letter detail page (status timeline, intake summary, final approved letter only)
- [x] Secure data isolation — subscribers never see AI drafts or research

## Phase 4: Employee/Attorney Review Center
- [x] Review queue with filtering (pending_review, under_review, needs_changes)
- [x] Review detail page with intake panel, AI draft editor, research panel
- [x] Claim/assign letter for review
- [x] Save attorney edit version
- [x] Approve/reject/request changes actions
- [x] Review actions audit trail

## Phase 5: Admin Dashboard
- [x] Failed jobs monitor
- [x] Retry failed pipeline jobs
- [x] System health overview (queue counts, status distribution)
- [x] User management (role assignment)

## Phase 6: AI Pipeline
- [x] Stage 1: Perplexity API research (jurisdiction rules, statutes, case law)
- [x] Research packet validation gate
- [x] Stage 2: Anthropic Claude drafting from validated research
- [x] Draft parser/validator
- [x] Pipeline orchestration (status transitions, job logging)
- [x] Failure handling and retry logic

## Phase 6b: High-Priority Additions
- [x] Deterministic research packet validator (validateResearchPacket)
- [x] Deterministic draft JSON parser/validator (parseAndValidateDraftLlmOutput)
- [x] Subscriber-safe detail endpoint (never returns ai_draft/attorney edits/internal research)
- [x] Notification system via Resend email (subscriber: needs_changes/approved/rejected; attorney/admin: pending_review/failed jobs)
- [x] Transactional email templates: status change, approval, rejection, needs_changes, new_review_needed
- [x] Resend API key configuration (via webdev_request_secrets)
- [x] Claim/assignment locking in attorney review queue
- [x] Retry failed job controls for admins
- [x] Idempotency protections for duplicate submissions/retries
- [x] Note visibility (internal vs user_visible) in review actions
- [x] Final approved version generation on approval (freeze version + current_final_version_id)
- [ ] PDF export / downloadable output for final letters (future enhancement)

## Phase 7: Testing & Delivery
- [x] Vitest unit tests for critical paths (29 tests passing)
- [x] End-to-end verification (TypeScript clean, server healthy)
- [ ] Save checkpoint and deliver

## Future Enhancements (legacy — most now completed)
- [x] PDF export for final approved letters (Phase 38 + 66)
- [x] n8n workflow integration for letter generation (Phase 73 — aligned but dormant)
- [x] Stripe payment integration for subscriptions (Phase 12 + 67 + 76)
- [ ] Mobile PWA optimization

## Phase 8: E2E Workflow Audit & Fix
- [x] Audit intake form fields → pipeline input mapping
- [x] Add 3rd AI stage: Claude/Anthropic final letter assembly (combines research + draft into professional letter)
- [x] Ensure pipeline status transitions fire correctly: submitted → researching → drafting → pending_review
- [x] Ensure review center claim/approve/reject correctly updates status and creates final version
- [x] Ensure approved letter appears in subscriber My Letters with full content
- [x] Ensure subscriber detail page shows final approved letter (not AI drafts/research)

## Phase 9: Stripe Payment Integration
- [ ] Add Stripe feature via webdev_add_feature
- [ ] Subscription plans: per-letter ($200), monthly ($200/mo 4 letters), annual ($2000/yr 4 letters/mo)
- [ ] Checkout session creation with metadata
- [ ] Webhook handler for checkout.session.completed
- [ ] Atomic subscription activation (prevent race conditions)
- [ ] Commission tracking (5% employee referral)
- [ ] Employee coupon system (20% discount on per-letter)
- [ ] Pricing page UI
- [ ] Credit/letter allowance enforcement before letter submission

## Phase 10: Spec Compliance Patches (from pasted_content_4)
- [ ] Add buildNormalizedPromptInput helper (trim strings, safe defaults, filter empty rows)
- [ ] Strengthen validateResearchPacket: require sourceUrl+sourceTitle per rule, prefer >= 3 rules
- [ ] Add subscriber updateForChanges mutation (re-submit after needs_changes)
- [ ] Add admin forceStatusTransition mutation (audited)
- [x] Add frontend polling/revalidation for researching/drafting/pending_review statuses
- [ ] Add status timeline component in subscriber LetterDetail
- [ ] Add subscriber update form when status is needs_changes
- [ ] Verify success path E2E (submit → research → draft → assembly → pending_review → claim → approve → subscriber sees final)
- [ ] Verify failure path (invalid research stops pipeline, invalid draft stops pipeline)
- [ ] Verify security (subscriber cannot access ai_draft/research/internal notes)

## Phase 12: Stripe Payment Integration
- [x] Fix TypeScript error in AdminLetterDetail page
- [x] Add Stripe scaffold via webdev_add_feature
- [x] Configure STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY
- [x] Create subscriptions and payments tables in database
- [x] Create Stripe products/prices: per-letter ($29), monthly ($79/mo), annual ($599/yr)
- [x] Build checkout session endpoint (tRPC)
- [x] Build Stripe webhook handler (subscription events, payment events)
- [x] Build subscription status checker middleware
- [x] Build billing portal redirect endpoint
- [x] Build Pricing page with 3 plans
- [x] Build Subscription status component in subscriber dashboard
- [x] Gate letter submission behind active subscription or available credits
- [x] Show upgrade prompt when subscriber has no active plan
- [x] Admin: view subscriber subscription status
- [x] Run tests and save checkpoint (29/29 passing, 0 TS errors)

## Phase 11: n8n Workflow Integration & Frontend Polish
- [ ] Get n8n workflow webhook URL for the best legal letter workflow
- [ ] Activate the n8n workflow so webhook is live
- [ ] Update pipeline.ts to call n8n webhook as primary, with in-app AI fallback
- [ ] Add N8N_WEBHOOK_URL as environment variable
- [ ] Build admin letter detail page with force status transition dialog
- [ ] Add polling/revalidation to employee ReviewDetail for in-progress statuses
- [ ] Verify TypeScript compiles cleanly
- [ ] Run all tests

## Phase 13: Dashboard Enhancement — Letters History & Payment Receipts
- [ ] Audit current subscriber dashboard, MyLetters, and Billing pages
- [ ] Add backend: letters list with search/filter/sort/pagination (tRPC)
- [ ] Add backend: payment receipts list from Stripe invoices (tRPC)
- [ ] Rebuild MyLetters page as full Letters History with search, filter by status/type/date, sort, pagination
- [ ] Build Payment Receipts page with Stripe invoice history, amounts, dates, downloadable receipt links
- [ ] Enhance subscriber Dashboard with summary stats (total letters, active subscription, credits used, pending reviews)
- [ ] Add recent activity feed on dashboard (last 5 letters with status)
- [ ] Add quick action cards on dashboard (Submit Letter, View Letters, Billing)
- [ ] Run tests, verify, save checkpoint

## Phase 14: Paywall Flow Revision + Dashboard Enhancements
- [x] Add generated_locked status to schema enum and status machine
- [x] Update DB migration to include generated_locked status
- [x] Add payToUnlock mutation: create per-letter checkout, on success advance to pending_review
- [x] Build LetterPaywall component: blurred AI draft preview + Pay Now button
- [x] Update LetterDetail to show LetterPaywall when status = generated_locked
- [x] Update pipeline to set status = generated_locked after AI assembly (instead of pending_review)
- [x] Update Stripe webhook to handle letter unlock (generated_locked → pending_review)
- [x] Update MyLetters list: generated_locked highlighted amber with "Unlock for $29" badge
- [x] Update StatusTimeline: generated_locked step with amber lock icon
- [x] Update StatusBadge: generated_locked shows "Ready to Unlock" in yellow
- [x] Tests: 31/31 passing, 0 TypeScript errors
- [ ] Build Payment Receipts page with invoice history, amounts, dates, receipt links (future)
- [ ] Enhance subscriber Dashboard: subscription status widget, activity feed, quick action cards (future)
- [ ] Add date range filter to Letters History (future)

## Phase 15: Post-Submission Email Notifications
- [x] Add sendLetterSubmissionEmail: branded confirmation email sent immediately after letter submission
- [x] Add sendLetterReadyEmail: "your draft is ready" email sent when AI pipeline sets generated_locked
- [x] Add sendLetterUnlockedEmail: payment confirmation email sent after Stripe unlock webhook
- [x] Wire sendLetterSubmissionEmail into letters.submit mutation (routers.ts)
- [x] Wire sendLetterReadyEmail into pipeline.ts Stage 3 completion (in-app pipeline path)
- [x] Wire sendLetterReadyEmail into n8nCallback.ts completion (n8n pipeline path)
- [x] Wire sendLetterUnlockedEmail into stripeWebhook.ts letter unlock handler
- [x] Tests: 35/35 passing, 0 TypeScript errors

## Phase 16: Dev Email Preview Endpoint
- [x] Build server/emailPreview.ts: dev-only Express route at GET /api/dev/email-preview
- [x] Index page: lists all 9 templates with HTML and plain-text preview links
- [x] Per-template rendering: ?type=submission|letter_ready|unlocked|approved|rejected|needs_changes|new_review|job_failed|status_update
- [x] Query param support: ?name=&subject=&letterId=&state=&letterType=&mode= for realistic preview data
- [x] Guard: only active in NODE_ENV !== production (verified in tests)
- [x] Dev toolbar overlay showing template name and subject line in browser
- [x] Register route in server/_core/index.ts
- [x] Vitest tests: route export, dev registration, production guard (3 new tests)
- [x] Tests: 38/38 passing, 0 TypeScript errors

## Phase 17: Spec Compliance Audit (pasted_content_7)
- [x] Status machine: all required transitions implemented (submitted→researching→drafting→generated_locked→pending_review→under_review→approved/rejected/needs_changes, needs_changes→researching/drafting)
- [x] forceStatusTransition admin mutation: implemented and wired to admin UI
- [x] buildNormalizedPromptInput: implemented in server/intake-normalizer.ts
- [x] validateResearchPacket: implemented in server/pipeline.ts with sourceUrl/sourceTitle enforcement
- [x] updateForChanges subscriber mutation: implemented and re-triggers pipeline
- [x] research_sources table: spec marks as optional for MVP — sources embedded in research_runs.resultJson (sourceUrl + sourceTitle per rule)
- [x] All 8 required tables present: users, letter_requests, letter_versions, review_actions, attachments, notifications, workflow_jobs, research_runs
- [x] Subscriber-safe detail endpoint: ai_draft/research/internal notes never returned to subscribers
- [x] Role-based access: subscriberProcedure, employeeProcedure, adminProcedure guards in place

## Phase 18: Spec Compliance Gaps (from SPEC_COMPLIANCE.md audit)
- [ ] P1: Add 7 missing database indexes (letter_requests.status, user_id, assigned_reviewer_id; letter_versions.letter_request_id; review_actions.letter_request_id; workflow_jobs.letter_request_id+status; research_runs.letter_request_id+status)
- [ ] P1: Add attachment upload UI to SubmitLetter form (step 6 — file upload with size validation)
- [ ] P2: Add `language` field to intake normalizer and SubmitLetter form
- [ ] P2: Add `deadlines` field to intake normalizer and SubmitLetter form
- [ ] P2: Add `communications` field to intake normalizer and SubmitLetter form
- [ ] P2: Normalize `toneAndDelivery` as proper intake object (not just tonePreference string)
- [ ] P3: Add research_sources as a separate table (optional — sources currently embedded in resultJson)
- [ ] P3: Consider role rename: employee→attorney_admin, admin→super_admin (requires migration)
- [ ] P3: Build Payment Receipts page at /subscriber/receipts
- [ ] P3: Add subscriber Dashboard stats widget (total letters, locked, in review)

## Phase 19: Database Indexes Migration
- [x] Add 7 spec-required indexes to drizzle/schema.ts using Drizzle index() API
- [x] Generate migration SQL via pnpm drizzle-kit generate (0004_previous_titania.sql)
- [x] Apply migration via webdev_execute_sql
- [x] Verify all 7 indexes exist in the database (confirmed via information_schema query)
- [x] Update SPEC_COMPLIANCE.md to mark indexes as complete

## Phase 20: Attachment Upload UI (SubmitLetter Step 6)
- [x] Audit uploadAttachment mutation and storage contract
- [x] Build Step 6 Evidence file-picker with drag-drop, file list, remove button, size/type validation
- [x] Upload attachments after submit (parallel, non-blocking failures)
- [x] LetterDetail subscriber attachments panel already complete (storageUrl + fileName download links)
- [x] 38/38 tests passing, 0 TypeScript errors

## Phase 21: Pipeline Routing Inversion
- [x] Read pipeline.ts routing logic
- [x] Make direct 3-stage pipeline (Perplexity + OpenAI + Claude) the primary path
- [x] Make n8n an optional fallback (only if N8N_WEBHOOK_URL is set AND N8N_PRIMARY=true env flag)
- [x] Update log messages to reflect new routing
- [x] 38/38 tests passing, 0 TypeScript errors

## Phase 22: Freemium Model (First Letter Free, Attorney Review Paid)
- [ ] Add `generated_unlocked` status to schema enum and status machine
- [ ] Add DB migration for new status value
- [ ] Update pipeline: check if first letter → set generated_unlocked (free), else generated_locked (paywall)
- [ ] Add sendForReview mutation: generated_unlocked → pending_review (free, no payment)
- [ ] Update LetterDetail: show full AI draft when status = generated_unlocked, CTA = "Send for Attorney Review ($29)"
- [ ] Update LetterPaywall copy: rename to "Get Attorney Review" gate
- [ ] Update MyLetters: show "AI Draft Ready - Free" badge for generated_unlocked
- [ ] Update StatusTimeline: add generated_unlocked step with green checkmark
- [ ] Update StatusBadge: generated_unlocked = "AI Draft Ready" in green
- [ ] Update Pricing page to reflect freemium model (first letter free)
- [ ] Update email: sendLetterReadyEmail copy for free vs paid path
- [ ] Run tests, update SPEC_COMPLIANCE.md, save checkpoint

## Phase 23: Critical Feature Additions
- [x] Add subscriber updateForChanges mutation (re-submit after needs_changes status)
- [x] Fix research provider default (ensure Perplexity is default, not broken fallback)
- [x] Add admin forceStatusTransition mutation with full audit logging
- [x] Add frontend polling/revalidation for researching/drafting/pending_review statuses
- [x] Verify all frontend pages work with real data and fix any issues found

## Phase 24: Pipeline Stuck at Drafting Bug
- [x] Investigate and fix pipeline stuck at 'drafting' status (not transitioning to generated_locked)

## Phase 25: New Letter Intake Form + Pipeline Timeout Fix
- [ ] Build multi-step intake form with validation on New Letter button
- [x] Fix pipeline timeout (add AbortSignal timeouts to generateText calls)
- [x] Unstick letter #1 and verify end-to-end pipeline flow
- [x] Switch pipeline from Forge proxy to direct Anthropic SDK + Perplexity API
- [x] Add proper timeouts (AbortSignal) to all AI calls

## Phase 26: Letter Display Modal + Attorney Review Payment Flow
- [x] Fix AI draft data display in subscriber letter detail (show research + draft in modal)
- [x] First letter is free — implement free tier logic
- [x] $200 fee for attorney review submission via Stripe
- [x] Add 'Submit for Attorney Review' button at top of letter modal
- [x] Ensure generated_locked status shows the draft preview correctly

## Phase 27: Landing Page Redesign (Base44 Clone)
- [x] Rewrite Home.tsx to match exact Base44 landing page design (colors, layout, components)
- [x] Upload logo to S3 and reference it (using Supabase CDN URL directly)
- [x] Verify landing page renders correctly (TS compiles clean, server running, HMR applied)

## Phase 28: Stripe Payment Method Fix
- [x] Fix 'No valid payment method types' error on Stripe checkout (add payment_method_types: ['card'])

## Phase 29: Favicon & Logo Branding
- [x] Set VITE_APP_LOGO to Talk-to-My-Lawyer logo for Manus OAuth login page (manual: Settings → General)
- [x] Ensure website favicon matches the logo (added to index.html)

## Phase 30: Enhanced Subscriber Dashboard
- [x] Add letter pipeline status cards with visual progress indicators
- [x] Show current status (Drafting, In Review, Approved, etc.) with color-coded badges
- [x] Add progress bar/stepper showing where each letter is in the pipeline
- [x] Add clear next-action CTAs per letter status (e.g., "Pay to Unlock", "Awaiting Review")
- [x] Ensure mobile-responsive layout
- [x] Add summary stats cards (Total Letters, In Progress, Approved, Needs Attention)
- [x] Add relative timestamps (e.g., "5m ago", "2h ago")
- [x] Add welcome banner with Submit New Letter CTA
- [x] Add Pipeline Status Guide section explaining each status
- [x] Animated spinner for active pipeline stages (researching, drafting)
- [x] Pulsing amber indicator for paywall (generated_locked)
- [x] "Action Required" badge for letters needing subscriber attention
- [x] 8-second auto-polling when any letter has active pipeline status
- [x] Tests: 99/99 passing (26 new dashboard enhancement tests), 0 TypeScript errors

## Phase 31: Attorney Review Modal with Tiptap Rich Text Editor
- [x] Install Tiptap packages (@tiptap/react, @tiptap/starter-kit, @tiptap/extension-*)
- [x] Build reusable RichTextEditor component with toolbar (bold, italic, headings, lists, undo/redo)
- [x] Build ReviewModal component with intake summary panel + Tiptap editor + action buttons
- [x] Add prominent Approve button (green, top-right) with confirmation dialog
- [x] Add Reject and Request Changes actions with notes input
- [x] Wire modal to existing tRPC review mutations (claim, saveEdit, approve, reject, requestChanges)
- [x] Integrate modal into ReviewQueue page (click row → opens modal instead of navigating)
- [x] Integrate modal into employee Dashboard review cards
- [x] Preserve original AI draft (immutable) + show diff/comparison
- [x] Add attorney notes field for review comments
- [x] Mobile-responsive modal layout
- [x] Write tests for review modal logic (31 tests passing)

## Phase 32: Full Pipeline Architecture Audit (/ttml-full-pipeline-architecture)

- [x] Audit all 3 pipeline stages against architecture spec
- [x] Fix pipeline.ts comments — stages 2 & 3 correctly labeled as Anthropic (not OpenAI)
- [x] Fix pipeline metadata: assembledFrom.draftProvider = "anthropic" (was "openai")
- [x] Fix pipeline stage labels: "anthropic-draft" and "anthropic-assembly" (were "openai-draft", "claude-assembly")
- [x] Fix versions.get procedure — subscribers can now view ai_draft when letter is generated_locked (paywall preview)
- [x] Upgrade LetterDetail download from .txt to print-ready PDF (browser print dialog with letterhead)
- [x] Add purgeFailedJobs db helper (deletes all failed workflow_jobs)
- [x] Add admin.purgeFailedJobs tRPC mutation (admin-only)
- [x] Add "Purge All" button with AlertDialog confirmation to admin Jobs page
- [x] Verify all polling intervals match architecture spec (5s LetterDetail, 8s MyLetters/Dashboard, 10s ReviewQueue, 15s Employee Dashboard)
- [x] Verify email templates: 9 functions present and correct (submission, ready, unlocked, approved, rejected, needs_changes, new_review, job_failed, status_update)
- [x] Verify Stripe webhook: letter unlock flow, subscription events, invoice.paid renewal
- [x] Write architecture audit tests (153 total, all passing, 0 TypeScript errors)

## Phase 33: Database Migration — TiDB (MySQL) → Supabase (PostgreSQL)

- [x] Save safety checkpoint of current TiDB working state (56f02c8e)
- [x] Convert drizzle/schema.ts from MySQL to PostgreSQL dialect (pgTable, pgEnum, serial, text, integer, boolean, timestamp, jsonb, index)
- [x] Update drizzle.config.ts dialect from mysql to postgresql
- [x] Install postgres.js driver + drizzle-orm/postgres-js
- [x] Remove mysql2 driver dependency
- [x] Delete old MySQL migration files and regenerate PostgreSQL migration (0000_nervous_james_howlett.sql)
- [x] Apply migrations to Supabase project lguqhibpxympxvwqpedf via MCP execute_sql (12 enums, 9 tables, 7 indexes, 5 triggers)
- [x] Verify all 9 application tables exist in Supabase public schema
- [x] Set SUPABASE_DATABASE_URL secret (pooler: aws-1-us-east-2.pooler.supabase.com:6543)
- [x] Update server/db.ts: postgres.js driver, SUPABASE_DATABASE_URL priority, connection pooling (max:10, idle:20s, connect:10s)
- [x] Fix PostgreSQL-specific syntax: serial PKs, timestamptz, updated_at trigger function, onConflictDoUpdate
- [x] Run all tests: 164/164 passing, 0 TypeScript errors, 11 new migration tests
- [x] Server log: [Database] Connected to Supabase (PostgreSQL)

## Phase 34: Supabase-Native Enhancements

### RLS Policies (defense-in-depth, layered on top of existing tRPC guards)
- [x] Enable RLS on all 9 application tables
- [x] Create 5 helper functions: app_user_id(), is_app_admin(), is_app_attorney(), is_app_employee(), safe_status_transition()
- [x] Create 25 RLS policies across all tables (subscriber isolation, admin/attorney access, employee scope)
- [x] Add 3 partial performance indexes (active letters, pending review, user active letters)

### Database-Level Atomic Functions
- [x] check_and_deduct_allowance() — race-safe subscription deduction with row locking
- [x] refund_letter_allowance() — atomic refund on pipeline failure
- [x] safe_status_transition() — validates status machine at DB level
- [x] reset_monthly_allowance() — monthly credit reset
- [x] log_letter_status_change() — audit trigger function

### Supabase Realtime (replace polling with live updates)
- [x] Install @supabase/supabase-js client
- [x] Create client/src/lib/supabase.ts singleton with channel registry
- [x] Create useLetterRealtime, useLetterListRealtime, useReviewQueueRealtime hooks
- [x] Integrate Realtime into subscriber LetterDetail (instant status toasts + tRPC invalidation)
- [x] Integrate Realtime into subscriber Dashboard (live letter list updates)
- [x] Integrate Realtime into employee ReviewQueue (instant queue refresh)
- [x] All hooks fall back gracefully to polling if Supabase is not configured

### Tests
- [x] Run all tests: 174/174 passing, 0 TypeScript errors

## Phase 35: Replace Manus OAuth with Supabase Auth (Branded Login/Signup)

### Server-side Auth Migration
- [x] Install @supabase/supabase-js server-side for admin operations
- [x] Create server/supabaseAuth.ts: Supabase Admin client for JWT verification + user management
- [x] Update server/_core/context.ts: verify Supabase JWT (from Authorization header or cookie) instead of Manus session
- [x] Add /api/auth/signup route: create Supabase Auth user + sync to app users table
- [x] Add /api/auth/login route: sign in with Supabase Auth (email/password)
- [x] Add /api/auth/logout route: sign out Supabase session
- [x] Add /api/auth/refresh route: refresh Supabase session tokens
- [x] Add /api/auth/forgot-password route: send password reset email via Supabase
- [x] Update auth.logout tRPC procedure: clear both sb_session and legacy app_session_id cookies
- [x] Preserve all existing role guards (subscriberProcedure, employeeProcedure, adminProcedure)
- [x] Set SUPABASE_SERVICE_ROLE_KEY secret (validated via Supabase Admin API)

### Frontend Auth Pages (Branded)
- [x] Build /login page: branded email/password login form with TTML branding
- [x] Build /signup page: branded registration form (name, email, password)
- [x] Build /forgot-password page: password reset email request form
- [x] Update useAuth.ts: redirect to /login instead of Manus OAuth URL, clear localStorage tokens on logout
- [x] Update main.tsx: send Supabase access token in Authorization header for all tRPC requests
- [x] Update main.tsx: redirect to /login on UNAUTHORIZED errors (not Manus OAuth portal)
- [x] Update AppLayout: sign-in shows both "Sign In" (/login) and "Create Account" (/signup) buttons
- [x] Update App.tsx: add /login, /signup, /forgot-password routes

### Database Updates
- [x] Store Supabase Auth UUID in users.openId column (reuse existing column)
- [x] Ensure user sync on first login (Supabase auth.users → app users table via upsertUser)
- [x] Preserve all existing foreign key relationships

### Testing & Verification
- [x] Write Vitest tests for Supabase Auth service_role key validation (5 tests)
- [x] Fix auth.logout tests to expect 2 cookies cleared (sb_session + legacy)
- [x] 180/180 tests passing, 0 TypeScript errors
- [x] Server health: 0 LSP errors, 0 TypeScript errors

## Phase 36: Fix Manus OAuth Redirect + SEO
- [x] Remove all remaining Manus OAuth redirect references (getLoginUrl removed from DashboardLayout, Home, Pricing)
- [x] Fix homepage title: 44 chars — "Talk to My Lawyer — AI-Drafted Legal Letters"
- [x] Add meta description: 148 chars — covers demand letters, cease and desist, breach of contract, starting at $29
- [x] Add meta keywords: legal letters, attorney reviewed, demand letter, cease and desist, breach of contract, AI legal
- [x] Push all changes to GitHub

## Phase 37: Role-Based Routes, Onboarding, FAQ, Mobile
- [x] Build ProtectedRoute component with role-based access (subscriber/employee/admin)
- [x] Wrap all role-gated routes in App.tsx with ProtectedRoute
- [x] Redirect unauthenticated users to /login, wrong-role users to their correct dashboard
- [x] Build onboarding welcome modal for new subscribers (first-login detection)
- [x] Add guided steps banner on subscriber dashboard (3 steps: Submit → Review → Download)
- [x] Add "Get Started" onboarding CTA on empty state
- [x] Add real FAQ content to homepage (10+ Q&A items covering pricing, process, turnaround, legal validity)
- [x] Create /faq dedicated page with full FAQ list and structured data (JSON-LD)
- [x] Fix mobile nav: hamburger menu for small screens
- [ ] Fix mobile dashboard: stack cards vertically, full-width buttons
- [ ] Fix mobile letter cards: truncate long text, responsive status badges
- [ ] Fix login/signup forms: full-width on mobile, proper input sizing
- [ ] Fix ReviewModal: full-screen on mobile, collapsible sidebar panel
- [x] Run tests, save checkpoint, push to GitHub

## Phase 38: Admin Review Modal — Full Pipeline Sync + PDF Generation

### Claim → Subscriber Notification
- [x] Add email notification to subscriber when attorney claims letter (under_review)
- [x] Add in-app notification to subscriber when letter moves to under_review
- [x] Update claim mutation in routers.ts to send sendStatusUpdateEmail + createNotification

### Approve → PDF Generation + S3 Upload + Delivery
- [x] Install pdfkit for server-side PDF generation
- [x] Add pdfUrl column to letter_requests table (schema + migration)
- [x] Build server/pdfGenerator.ts: convert final approved letter content to professional PDF
- [x] Upload generated PDF to S3 via storagePut
- [x] Store pdfUrl in letter_requests on approval
- [x] Update approve mutation: generate PDF → upload S3 → store URL → notify subscriber with PDF link
- [x] Update subscriber LetterDetail: show "Download PDF" button when pdfUrl is available
- [x] Update sendLetterApprovedEmail to include PDF download link

### Tests
- [x] Write vitest tests for PDF generation, claim notification, approve workflow (30 tests pass)
- [x] Verify TypeScript compiles cleanly
- [x] Save checkpoint

## Architecture Notes (Permanent Reference)

- [x] **Pipeline routing confirmed (Feb 25, 2026):** Direct 3-stage API calls are ACTIVE. n8n is DORMANT.
  - Stage 1: Perplexity sonar-pro (research, 90s timeout)
  - Stage 2: Anthropic claude-opus-4-5 (draft, 120s timeout)
  - Stage 3: Anthropic claude-opus-4-5 (final assembly, 120s timeout)
  - n8n only activates if BOTH N8N_PRIMARY=true AND N8N_WEBHOOK_URL are set in env
  - N8N_PRIMARY is NOT set → n8n is completely dormant
  - Full details: docs/PIPELINE_ARCHITECTURE.md

## Phase 39: Toast Notifications Audit

- [x] ForgotPassword: add toast.error on network failure
- [x] Login: add toast.error on failed login (now shows both inline error + toast)
- [x] AppLayout: add toast.success/error on markAllRead mutation
- [x] AppLayout: add toast.info on logout
- [x] OnboardingModal: add toast.success when user finishes onboarding and clicks "Submit Your First Letter"
- [x] Run tests, save checkpoint

## Phase 40: Employee Affiliate System (GAP 3)

### Database Schema
- [x] Add discount_codes table (code, employeeId, discountPercent, usageCount, maxUses, isActive, expiresAt)
- [x] Add commission_ledger table (employeeId, letterRequestId, stripePaymentIntentId, saleAmount, commissionRate, commissionAmount, status)
- [x] Add payout_requests table (employeeId, amount, paymentMethod, paymentDetails, status, processedAt, processedBy, rejectionReason)
- [x] Add commission_status and payout_status enums
- [x] Apply migration to Supabase via MCP apply_migration
- [x] Add indexes for performance

### Backend (tRPC + DB helpers)
- [x] Auto-generate discount code on employee role assignment
- [x] Employee: getMyDiscountCode query
- [x] Employee: getMyEarnings query (total earned, pending, paid, referral count)
- [x] Employee: getMyCommissions query (list with letter details)
- [x] Employee: requestPayout mutation (validate balance >= amount)
- [x] Employee: getMyPayoutRequests query
- [x] Admin: getAllCommissions query
- [x] Admin: getAllPayoutRequests query
- [x] Admin: processPayoutRequest mutation (approve/reject)
- [x] Stripe webhook: create commission on letter unlock payment with discount code

### Employee Dashboard UI
- [x] Earnings summary cards (Total Earned, Pending, Paid Out, Referrals)
- [x] Discount code card with copy button
- [x] Commission history table
- [x] Payout request form + history
- [x] Share link generator

### Admin Affiliate Oversight
- [x] Commissions overview tab in admin dashboard
- [x] Payout requests management (approve/reject with notes)
- [x] Employee performance table (referrals, earnings, conversion rate)
- [x] Discount code management (toggle active/inactive)
- [x] Admin sidebar link to /admin/affiliate

### Tests
- [x] Vitest tests for affiliate DB helpers (27 tests passing)
- [x] Vitest tests for tRPC affiliate procedures (role guards, CRUD, validation)
- [x] Vitest tests for commission calculation logic (basis points, rounding, edge cases)

## Phase 41: Feature Map Completion (from spec audit)

### G. Admin Review Center Link
- [x] Add "Review Center" link to admin sidebar in AppLayout.tsx

### A. Onboarding Role Split
- [x] Create Onboarding.tsx page (role selection + profile form)
- [x] Add auth.completeOnboarding tRPC mutation
- [x] Add /onboarding route in App.tsx
- [x] Redirect new users to /onboarding after signup (via ProtectedRoute)
- [x] Auto-generate discount code for employee role selection

### C+B. Attorney Route Reorganization + SLA Dashboard
- [x] Create client/src/pages/attorney/ directory
- [x] Create attorney/Dashboard.tsx with SLA indicators (overdue > 24h)
- [x] SLA calculated client-side from createdAt (no new tRPC query needed)
- [x] Add /attorney, /attorney/queue, /attorney/:id routes in App.tsx
- [x] Update attorney sidebar in AppLayout.tsx to use /attorney/* paths
- [x] Keep /review/* routes as backward-compatible aliases
### D. Resume Unfinished Draft
- [x] Save form state to localStorage on step change in SubmitLetter.tsx
- [x] On mount, check for saved draft and show Resume/Discard banner
- [x] Clear draft from localStorage on successfu### F. Intake Form Structured Fields
- [x] Add language, priorCommunication, deliveryMethod to NormalizedIntake + IntakeJson
- [x] Update pipeline prompt to include these fields

### E. In-App Payment History
- [x] Add billing.paymentHistory tRPC query (Stripe API)
- [x] Add Payment History section to Billing.tsx with receipt links

## Phase 42: Logo Replacement
- [x] Upload logo files to public/ (logo.png, logo-full.png, logo-dark.png, logo-icon-192.png, etc.)
- [ ] Replace logo in navbar (Home.tsx / AppLayout.tsx) — logo files exist but may not be wired into all components
- [ ] Replace logo in login/signup pages
- [ ] Replace logo in sidebar (AppLayout.tsx)
- [x] Replace favicon in index.html (favicon-32.png, favicon-16.png, apple-touch-icon)
- [x] Replace meta tags (og:image, twitter:image → logo-full.png)

## Phase 43: Bug Fix - Signup Error
- [x] Investigate signup "unexpected error" — caused by lazy DB init on first request
- [x] Fix: Added DB warmup on server startup + retry/timeout on login & signup fetch
- [x] Account for jamilahmansari@gmail.com was already created successfully in Supabase

## Phase 44: Email Verification
- [x] Add email_verified column to users table (migration applied via run-migration.mjs)
- [x] Create email_verification_tokens table (userId, email, token, expiresAt)
- [x] Mark all 4 existing users as email_verified = true (no disruption to existing accounts)
- [x] Add sendVerificationEmail + sendWelcomeEmail to email.ts (Resend)
- [x] Add DB helpers: createEmailVerificationToken, deleteUserVerificationTokens, consumeVerificationToken, isEmailVerified, getUserByEmail
- [x] Update signup handler: send verification email, return requiresVerification:true
- [x] Add POST /api/auth/verify-email endpoint (consume token, mark verified, send welcome email)
- [x] Add POST /api/auth/resend-verification endpoint (rate-limited, delete old tokens, send new)
- [x] Create VerifyEmail.tsx page (handles ?token= from email link, shows success/error/resend UI)
- [x] Update Signup.tsx: show email-sent confirmation screen after signup (with resend button)
- [x] Add /verify-email route to App.tsx (public, no auth required)
- [x] Gate ProtectedRoute: unverified non-admin users redirected to /verify-email
- [x] Admin role bypasses email verification gate (pre-verified)
- [x] 18 new Vitest tests passing (token generation, DB helpers, gate logic, email sending)

## Phase 45: Email Template Branding
- [x] Replace ⚖️ emoji header with actual TTML logo badge (CDN URL)
- [x] Navy-to-blue gradient header band with logo + tagline
- [x] 4px accent stripe below header (color varies per email type)
- [x] Polished CTA button with gradient + fallback link
- [x] Branded footer with small logo + legal disclaimer
- [x] Per-email accent colors: green (approval), amber (changes), red (rejection/alert), purple (attorney), sky-blue (in-progress)
- [x] Verification email: blue accent + 🔒 title
- [x] Welcome email: green accent + 🎉 title
- [x] All 9 transactional emails updated via shared buildEmailHtml builder
- [x] 18 email verification tests still passing, 0 TS errors

## Phase 46: Split-Stream Free Trial Paywall
- [ ] Audit pipeline.ts Stage 3 (Claude assembly) to understand streaming output
- [ ] Add isFreeTrial flag to user context (first letter = free, rest = paid)
- [ ] Add server-side valve: stream full content to DB, cut client after Subject + 2 lines for locked users
- [ ] Add PAYWALL_LOCKED sentinel token to signal client
- [ ] Update AI system prompt to enforce "Re: [Subject]" format for clean cutoff
- [ ] Build client-side ghost/blur paywall overlay on LetterDetail page
- [ ] Show real teaser text (Subject + 2 lines) above blur overlay
- [ ] Show ghost dummy paragraphs behind blur to simulate full letter
- [ ] Show "Unlock Now" CTA floating over blur overlay
- [ ] Wire unlock CTA to existing payToUnlock mutation
- [ ] Test, checkpoint, and deliver

## Phase 47: Fix Non-Subscriber Paywall Loop
- [x] Add checkPaywallStatus tRPC query returning: free | pay_per_letter | subscribed
- [x] Add hasActiveRecurringSubscription helper in stripe.ts (monthly/annual only, not per_letter)
- [x] Update pipeline.ts Stage 3: if user has active monthly/annual subscription, skip generated_locked and go straight to pending_review
- [x] Update LetterPaywall.tsx: show subscription upsell card prominently when state is pay_per_letter
- [x] Keep $200 pay-per-letter option as secondary option (not the only option)
- [x] Write tests for the three paywall states

## Phase 48: Master Validation — TTML_REMAINING_FEATURES_PROMPT.md
> **Canonical reference:** `docs/TTML_REMAINING_FEATURES_PROMPT.md`
> All future implementation work MUST be validated against this document before delivery.

### Gap 1 — Freemium `generated_unlocked` Status (Phase 22 — HIGHEST COMPLEXITY)
- [x] Add `generated_unlocked` to `letterStatusEnum` pgEnum and `LETTER_STATUSES` const in `drizzle/schema.ts`
- [x] Add `generated_unlocked` transitions to `ALLOWED_TRANSITIONS` in `shared/types.ts`
- [x] Add `generated_unlocked` to `STATUS_CONFIG` in `shared/types.ts`
- [x] Update pipeline Stage 3: first-ever letter → `generated_unlocked`, returning user → `generated_locked`
- [x] Add `billing.sendForReview` tRPC mutation (generated_unlocked → pending_review, free)
- [x] Update `billing.freeUnlock` — remove first-letter eligibility check (logic now in pipeline)
- [x] Update `LetterDetail.tsx`: show full ai_draft + green banner + Send for Review CTA when `generated_unlocked`
- [x] Extend `versions.get` to allow `ai_draft` access when status is `generated_unlocked`
- [x] Update `StatusBadge.tsx`: add `generated_unlocked` = "AI Draft Ready" (green)
- [x] Update `StatusTimeline.tsx`: insert `generated_unlocked` step between `generated_locked` and `pending_review`
- [x] Update `MyLetters.tsx`: green "Free — Send for Review" badge for `generated_unlocked`
- [x] Generate migration SQL via `pnpm drizzle-kit generate` and apply via Supabase MCP

### Gap 2 — Payment Receipts Page (`/subscriber/receipts`)
- [x] Add `billing.receipts` tRPC query (Stripe invoices list for current user)
- [x] Build `client/src/pages/subscriber/Receipts.tsx` page
- [x] Register route in `client/src/App.tsx` with `ProtectedRoute allowedRoles=["subscriber"]`
- [x] Add "View All Receipts" link in `Billing.tsx` next to Stripe portal button
- [x] Add "Receipts" nav item in `AppLayout.tsx` sidebar for subscriber role

### Gap 3 — Intake Form: Missing Fields (`language`, `communications`)
- [x] Update `IntakeJson` in `shared/types.ts`: add `language`, `communications`, `toneAndDelivery`
- [x] Update `intake-normalizer.ts`: handle new fields in `buildNormalizedPromptInput`
- [x] Update `letters.submit` Zod schema in `server/routers.ts`: add new optional fields
- [x] Update `SubmitLetter.tsx`: replace `tonePreference` with `toneAndDelivery` (tone + delivery method)
- [x] Update `SubmitLetter.tsx`: add Prior Communications step (summary, lastContactDate, method)
- [x] Update `SubmitLetter.tsx`: add Language select in Step 5 (Outcome & Preferences)

### Gap 4 — Mobile Responsiveness Fixes
- [x] Fix `Dashboard.tsx`: stats cards 2×2 on mobile, full-width buttons, hide stepper labels
- [x] Fix `MyLetters.tsx`: filter bar stacks vertically on mobile, responsive card layout
- [x] Fix `Login.tsx` and `Signup.tsx`: already mobile-friendly (w-full max-w-md, p-4)
- [x] Fix `ReviewModal.tsx`: full-screen on mobile, scrollable action buttons, compact header

### Validation Gate (run after each gap)
- [x] `pnpm test` — 309/320 passing (11 pre-existing failures in Phase 37/38)
- [x] `pnpm tsc --noEmit` — 0 TypeScript errors
- [x] Status machine: no `ALLOWED_TRANSITIONS` regression (phase23 test updated + passing)

## Phase 49: High-Quality Toast Notifications, Landing Page Copy & Imagery

### Toast Notification Copy Audit & Upgrade
- [x] Audit all toast.success/toast.error/toast.info/toast.warning calls across the codebase
- [x] Rewrite all toast messages to be professional, concise, and action-oriented
- [x] Ensure consistent tone: authoritative legal-tech brand voice
- [x] Add descriptive subtitles where appropriate (toast description field)

### Landing Page Copy Upgrade
- [x] Rewrite hero headline and subheadline (reflect freemium + subscription model)
- [x] Rewrite Features section copy (clear value propositions)
- [x] Rewrite Pricing section copy (accurate plan descriptions)
- [x] Rewrite FAQ section answers (professional, reassuring tone)
- [x] Rewrite CTA buttons and microcopy throughout

### Landing Page Imagery
- [x] Generate or source hero section illustration/image
- [x] Generate or source feature section icons/illustrations
- [x] Ensure all images are high-quality, professional, and legally themed
- [x] Upload images to S3 and replace local paths with CDN URLs

## Phase 50: Breadcrumb Navigation for User Areas

- [x] Create shadcn breadcrumb.tsx component (already present)
- [x] Build route-aware AppBreadcrumb wrapper component with route-to-label mapping
- [x] Integrate breadcrumbs into AppLayout (subscriber, admin, employee areas)
- [x] Ensure breadcrumbs are responsive and hidden on mobile if needed
- [x] Integrate Phase 49 landing page images into Home.tsx (hero, security, attorney review sections)

## Phase 51: Perplexity Research Prompt Upgrade (8-Task Deep Legal Research)

- [x] Replace buildResearchPrompt with buildResearchSystemPrompt + buildResearchUserPrompt (system/user split)
- [x] 8 research tasks: statutes, local ordinances, court decisions, SOL, pre-suit requirements, remedies, enforcement climate, defenses
- [x] Rich JSON output schema: jurisdictionProfile, recentCasePrecedents, statuteOfLimitations, preSuitRequirements, availableRemedies, localJurisdictionElements, enforcementClimate, commonDefenses, riskFlags, draftingConstraints
- [x] Update generateText call: system + prompt, maxOutputTokens 6000
- [x] Update validateResearchPacket: soft-warn on missing new fields (backwards compatible)
- [x] Run tests and verify pipeline still works (310/320 passing, 10 pre-existing)
- [x] Replace buildDraftingPrompt with buildDraftingSystemPrompt + buildDraftingUserPrompt (system/user split)
- [x] Curated context blocks: rules sorted by confidence, cases formatted narratively, remedies scannable
- [x] Pre-empt defenses in legal basis section using commonDefenses from research
- [x] Dynamic response deadline calculation (10d aggressive, 14d firm, 21d moderate)
- [x] Leverage enforcement climate in consequence paragraph
- [x] Rich attorneyReviewSummary memo (statutes chosen, theory strength, factual gaps, demand support)
- [x] Update runDraftingStage: system + prompt, maxOutputTokens 8000
- [x] Update assembly prompt (system+user split) to leverage richer research data with 10000 tokens

## Phase 52: Fix First-Letter-Free Submission Gate
- [x] Update backend checkLetterSubmissionAllowed to allow first-letter-free (countCompletedLetters === 0 bypasses subscription check)
- [x] Frontend gate auto-passes since checkCanSubmit now returns allowed:true for first-time users
- [x] Tests: 310/320 passing (10 pre-existing), 0 TypeScript errors

## Phase 53: Post-Bug-Fix Polish
- [x] Fix post-payment redirect: success_url now points to /subscriber/letters/${letterId}?unlocked=true (was missing /subscriber/ prefix)
- [x] Add subscription status banner to subscriber Dashboard (shows plan name, letters remaining, renewal date for active subscribers; shows free/upgrade CTA for non-subscribers)
- [x] Fix all 10 pre-existing test failures in Phase 37/38 test files
  - Phase 37: Updated ProtectedRoute test to check /employee instead of /review
  - Phase 38: Updated 8 tests to use attorneyProcedure instead of employeeProcedure as boundary markers
  - Phase 38: Fixed LetterDetail "Download PDF" label to match test expectation
- [x] All 320/320 tests passing, 0 TypeScript errors

## Phase 54: Fix Letter Submission Database Insert Failure
- [x] Diagnose and fix letter_requests insert failure (SQL error on submission) — missing `archived_at` column in Supabase DB, applied ALTER TABLE migration

## Phase 55: SEO Fix — Homepage Title + Remove AI References
- [x] Set document.title on homepage (/) to 30-60 characters (done in Phase 62)
- [ ] Audit all frontend files for "AI", "artificial intelligence", "OpenAI", "machine learning" references
- [ ] Rewrite Home.tsx hero, features, how-it-works, and pricing sections
- [ ] Update subscriber Dashboard, LetterDetail, SubmitLetter pages
- [ ] Update shared components, nav, status labels, and email-visible strings
- [ ] Ensure no AI mention remains in any user-visible page or component

## Phase 56: Role Selector on Signup Page
- [x] Add role selector (Client / Attorney / Employee) to Signup page
- [x] Wire selected role to user creation so DB record gets correct role
- [x] Ensure login redirects correctly for all roles

## Phase 57: Attorney & Employee Login/Access Fix
- [x] Audit attorney and employee routing in App.tsx
- [x] Fix login redirect for attorney and employee roles (attorney now goes to /attorney)
- [x] Ensure ProtectedRoute allows attorney role where needed
- [x] Verify employee and attorney dashboards are accessible
- [x] Add attorney to DB user_role enum (was missing, causing signup failures)
- [x] Fix signup redirect (attorney → /attorney, employee → /employee)

## Phase 58: ?next= Deep Link Redirect
- [x] ProtectedRoute appends ?next=<path> when redirecting unauthenticated users to /login
- [x] Login.tsx reads ?next= and redirects there after login (with role validation)
- [x] Signup.tsx also reads ?next= and redirects there after signup

## Phase 59: Subscriber Profile Page
- [x] Add tRPC procedures for profile data, subscription status, and payment history
- [x] Build /profile page with account info, subscription card, and payment history table
- [x] Add profile link to subscriber dashboard nav

## Phase 60: Universal Profile Settings Page
- [x] Add password change tRPC mutation (via Supabase auth — verifies current password, updates via admin API)
- [x] Update Profile page to work for all roles (subscriber, employee, attorney, admin)
- [x] Add username edit and password change sections
- [x] Update /profile route to allow subscriber, employee, attorney, and admin
- [x] Add Settings link to sidebar nav for all 4 roles in AppLayout

## Phase 61: Email Change with Re-Verification
- [x] Add changeEmail tRPC mutation (verify current password, update email in Supabase + app DB, set emailVerified=false)
- [x] Handle Supabase email confirmation flow (sends verification to new email via token)
- [x] Update Profile page UI with email change section (current email display, edit mode, password confirmation)
- [x] Show re-verification banner when emailVerified is false after email change
- [x] Duplicate email check before allowing change

## Phase 62: Homepage SEO Title Fix
- [x] Set document.title on homepage to 'Talk to My Lawyer — Professional Legal Letters' (46 chars)
- [x] Remove all AI references from index.html meta tags (title, description, og, twitter)
- [x] Update meta descriptions to reflect freemium model ('your first letter is free')
- [x] Remove 'AI legal' from keywords, add 'free legal letter'

## Phase 63: Upstash Redis Rate Limiting
- [x] Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN as secrets
- [x] Install @upstash/ratelimit and @upstash/redis packages
- [x] Create server/rateLimiter.ts with per-endpoint limits
- [x] Apply rate limiting to auth endpoints (10 req/15 min per IP)
- [x] Apply rate limiting to letters.submit (5 req/hour per user)
- [x] Apply rate limiting to billing endpoints (10 req/hour per user)
- [x] Apply global tRPC fallback (60 req/min per IP)
- [x] Write 9 Vitest tests (credentials, PONG, allow/block, graceful degradation)
- [x] All 330/330 tests passing, 0 TypeScript errors

## Phase 64: Email Verification & Password Reset Fixes
- [x] Fix verify-email route: look up user before consuming token, send welcome email after verification
- [x] Create ResetPassword.tsx page to handle Supabase hash fragment (#access_token=...&type=recovery)
- [x] Register /reset-password route in App.tsx
- [x] Login page: detect unverified user error, show resend verification link
- [x] Profile page: add Resend Verification Email button to the verification banner
- [x] Write 21 Vitest tests for all fixed flows (351/351 total passing, 0 TS errors)

## Phase 65: Test Suite Fixes (from TTML Test Analysis)
- [x] Fix Category 1: Lazy-init Resend in email.ts — resolved (getResend() lazy-init pattern)
- [x] Fix Category 2: Replace stale "employeeProcedure" with "attorneyProcedure" in phase38 test — resolved (Phase 53)
- [x] Fix Category 3: Add describe.skipIf() guards to supabase-auth.test.ts and supabase-realtime.test.ts — resolved
- [x] Fix Category 4a: Fix invalid "user" role → "subscriber" in ttml.test.ts — resolved
- [x] Fix Category 4b: Fix stale loginMethod "manus" → "email" in ttml.test.ts — resolved (no "manus" references remain)
- [x] Fix Category 4c: Remove duplicate logout test block from ttml.test.ts — resolved (single logout describe block)
- [ ] Update feature map skill: rate limiting is now IMPLEMENTED (Phase 63)
- [x] Run full test suite — 617 tests passing (Phase 84)

## Phase 66: Attorney Approval → PDF → My Letters
- [x] Upgrade PDF generator: proper legal letter formatting (sender/recipient blocks, date, Re: line, multi-page footer, approval stamp, brand colors)
- [x] Pass intakeJson to PDF generator from the approve procedure (sender/recipient names and addresses now appear in PDF)
- [x] My Letters page: show PDF Ready badge (green, Download icon) for approved letters with pdfUrl
- [x] My Letters page: approved letters show green styling, FileCheck icon, and summary stats in header
- [x] Write 14 Vitest tests for PDF generation, schema, approval flow, and My Letters UI (365/365 total passing, 0 TS errors)

## Phase 67: Pricing Restructure
- [x] Update stripe-products.ts: $50 trial review, $200 per-letter, $499/mo starter (4 letters), $799/mo professional (8 letters)
- [x] Add TRIAL_REVIEW_PRICE_CENTS constant (5000 cents)
- [x] Update pipeline.ts status note for generated_unlocked
- [x] Replace sendForReview (free) with payTrialReview ($50 Stripe checkout)
- [x] Update LetterDetail.tsx GeneratedUnlockedView to use payTrialReview with $50 CTA
- [x] Update LetterPaywall.tsx with new pricing tiers (free trial $50, per-letter $200, starter $499/mo, professional $799/mo)
- [x] Update Pricing.tsx with new plan cards
- [x] Update FAQ.tsx pricing answers
- [x] Update email.ts letter-ready CTA to reference $50
- [x] Update stripeWebhook.ts for new plan names (starter/professional)
- [x] Update Billing.tsx plan display names
- [x] Apply DB migration: add starter, professional, free_trial_review to subscription_plan enum
- [x] Write 33 Vitest tests for new pricing model
- [x] Update stale phase26 and phase66 tests for new plan names
- [x] 398/398 tests passing, 0 TypeScript errors

## Phase 68: Employee Commission & Coupon System
- [x] Audit existing employee commission and coupon infrastructure (discount_codes + commission_ledger tables already exist)
- [x] Backend: auto-generate discount code on employee signup (createDiscountCodeForEmployee called in completeOnboarding)
- [x] Backend: add discountCode param to createCheckoutSession in stripe.ts (passed in metadata)
- [x] Backend: add discountCode param to createCheckout tRPC procedure (planId + discountCode)
- [x] Backend: Stripe webhook — commission tracking for subscription payments in checkout.session.completed
- [x] Frontend: promo code field on LetterPaywall (all tiers — validate via affiliate.validateCode, show discount, pass to checkout)
- [x] Frontend: promo code field on LetterDetail $50 trial and $200 per-letter CTAs
- [x] 398/398 tests passing, 0 TypeScript errors

## Phase 69: Simplified Letter Flow (Single-Path Pipeline + Review Queue Cleanup)
- [x] Pipeline always ends at generated_locked (removed generated_unlocked bypass and subscriber free-unlock path)
- [x] STATUS_CONFIG: human-friendly labels — "Draft Ready", "Awaiting Review", "Changes Requested", "Drafting"
- [x] ALLOWED_TRANSITIONS: removed drafting→generated_unlocked and generated_locked→generated_unlocked
- [x] LetterPaywall: simplified to single $200 CTA with blurred draft preview (removed $50 trial and subscription upsell)
- [x] LetterDetail (subscriber): removed generated_unlocked branch, added in-progress status cards, cleaner flow
- [x] StatusTimeline: rewritten with 6-step simplified flow, no generated_unlocked step
- [x] ReviewQueue: filter to REVIEW_STATUSES only (pending_review+), added "New" badge for letters < 24h old
- [x] Tests: 32/32 passing in phase69-letter-flow.test.ts, 0 TypeScript errors

## Phase 70: Draft Ready Email Notification ($200 Attorney Review CTA)
- [x] Rewrote sendLetterReadyEmail with $200 pricing (removed old $50/free-trial copy)
- [x] Added letterType and jurisdictionState optional params for richer email context
- [x] Email includes: letter summary card, "what's included" section (4 benefits), urgency note, amber CTA button
- [x] Wired letterType + jurisdictionState into pipeline.ts call site
- [x] Wired letterType + jurisdictionState into n8nCallback.ts call site
- [x] Fixed n8nCallback.ts fallback paths: Claude-fail and no-intake both land at generated_locked (not pending_review)
- [x] Updated stale $50 test description in phase67-pricing.test.ts
- [x] Tests: 7/7 passing in phase70-draft-ready-email.test.ts, 0 TypeScript errors

## Phase 71: Automated 48-Hour Draft Reminder Email
- [x] Audit existing cron infrastructure and email queue
- [x] Add draft_reminder_sent_at column to letter_requests table (DB migration via Supabase MCP)
- [x] Build sendDraftReminderEmail template (urgency-focused orange, $200 CTA, hoursWaiting param)
- [x] Build processDraftReminders() function: query letters at generated_locked > 48h, draftReminderSentAt IS NULL
- [x] Created /api/cron/draft-reminders Express route with CRON_SECRET bearer auth
- [x] Mark draftReminderSentAt after sending to prevent duplicate sends
- [x] Write tests: 10/10 passing in phase71-draft-reminders.test.ts, 0 TypeScript errors
- [x] Save checkpoint

## Phase 72: Letter History Page
- [ ] Audit existing subscriber pages, letter tRPC procedures, and routing
- [ ] Build LetterHistory page: status cards, filter by status, sort by date/type, empty state
- [ ] Status badge with human-friendly labels and color coding
- [ ] Quick-action buttons: View Draft, Pay for Review ($200), Download PDF (approved only)
- [ ] Wire /letters route and add nav entry to subscriber dashboard
- [ ] Write tests and save checkpoint

## Phase 73.1: Revalidation Fix — Stale Phase 23 Test
- [x] Fixed phase23.test.ts: removed generated_unlocked transition expectation (superseded by Phase 69)
- [x] All 467/467 tests passing, 0 TypeScript errors

## Phase 73: Align n8n Workflow with 3-Stage Pipeline

- [x] Audited current n8n workflow (Pr5n5JlkgBKcwZPe9z678) via n8n REST API — identified 5 gaps
- [x] Built aligned workflow JSON: 16 nodes, 3 stages matching in-app pipeline
  - Stage 1: GPT-4o + Perplexity tool → structured ResearchPacket JSON (full schema)
  - Stage 2: Claude Sonnet 4 → structured DraftOutput JSON (draftLetter, attorneyReviewSummary, openQuestions, riskFlags)
  - Stage 3: Claude Sonnet 4 → final polished letter text (assembly)
  - Parse nodes between stages for robust JSON extraction with fallbacks
  - Callback uses dynamic callbackUrl from incoming payload + structured body
- [x] Deployed via n8n API: deactivate → PUT update → activate (workflow Pr5n5JlkgBKcwZPe9z678)
- [x] Rewrote n8nCallback.ts: detects aligned vs legacy payloads, skips local assembly for aligned, stores research version separately
- [x] Same system/user prompts as pipeline.ts (research, drafting, assembly)
- [x] Tests: 21/21 passing in phase73-n8n-alignment.test.ts, 0 TypeScript errors
- [x] Save checkpoint

## Phase 74: Pipeline Status Sync + Cron Scheduler

- [x] Audited both pipelines: direct API (pipeline.ts) and n8n callback (n8nCallback.ts) for status gaps
- [x] Found gap: n8n callback jumped from researching → generated_locked without setting "drafting"
- [x] Fixed n8n callback: now transitions researching → drafting → generated_locked (matches direct pipeline)
- [x] Fixed audit log fromStatus/toStatus values to be accurate in n8n callback
- [x] Fixed email URL: both pipelines now use canonical production domain (talk-to-my-lawyer.com)
- [x] Created cronScheduler.ts: in-process node-cron scheduler, runs draft reminders every hour at :00
- [x] Wired cronScheduler into server startup (server/_core/index.ts)
- [x] Set CRON_SECRET via webdev_request_secrets
- [x] Installed node-cron + @types/node-cron
- [x] Tests: 10/10 passing in phase74-pipeline-sync.test.ts, 477/477 total, 0 TypeScript errors
- [x] Save checkpoint

## Phase 75: Fix Auth Flow + Employee/Attorney Email Templates

- [x] Created getOriginUrl() helper in supabaseAuth.ts — never falls back to localhost
- [x] Fixed all 5 localhost fallbacks in supabaseAuth.ts (signup, forgot-password, verify-email, resend-verification, welcome)
- [x] Fixed all 3 localhost fallbacks in routers.ts (createCheckout, createBillingPortal, updateEmail)
- [x] Fixed getAppUrl() in routers.ts — canonical domain fallback
- [ ] User must update Supabase Dashboard site URL to https://www.talk-to-my-lawyer.com (cannot be done via API)
- [ ] Audit frontend auth pages: signup, login, forgot-password, reset-password, verify-email
- [x] Add branded employee notification emails (done in Phase 76: sendEmployeeWelcomeEmail, sendEmployeeCommissionEarnedEmail)
- [x] Add branded attorney notification emails (done in Phase 76: sendAttorneyWelcomeEmail, sendAttorneyReviewAssignedEmail, sendAttorneyReviewCompletedEmail)
- [x] Wire employee/attorney emails into signup and relevant procedures (done in Phase 76 + 79 + 80)
- [ ] Update ttml-backend-patterns skill with auth flow and email patterns

## Phase 76: Pricing Model Overhaul + Employee/Attorney Email Templates

- [x] Created shared/pricing.ts as single source of truth for pricing constants
- [x] Rewrote server/stripe-products.ts with new plan IDs: free_trial, per_letter, monthly_basic, monthly_pro
- [x] Added LEGACY_PLAN_ALIASES for backward compatibility (starter→monthly_basic, professional→monthly_pro, etc.)
- [x] Updated stripe.ts: removed TRIAL_REVIEW_PRICE_CENTS import, deprecated createTrialReviewCheckout, updated hasActiveRecurringSubscription to support new + legacy plan IDs
- [x] Updated stripeWebhook.ts: default plan ID changed from starter → monthly_basic
- [x] Rewrote Pricing.tsx with correct prices ($200/letter, $499/month Basic, $699/month Pro)
- [x] Updated Home.tsx pricing section with correct prices
- [x] Updated FAQ.tsx with correct prices
- [x] Updated Billing.tsx with correct plan names and prices
- [x] Updated Dashboard.tsx with correct upgrade CTA copy
- [x] Added 5 new branded email templates: sendEmployeeWelcomeEmail, sendAttorneyWelcomeEmail, sendAttorneyReviewAssignedEmail, sendAttorneyReviewCompletedEmail, sendEmployeeCommissionEarnedEmail
- [x] Wired role-specific welcome emails into verify-email endpoint (employee → employee welcome, attorney_admin → attorney welcome)
- [x] Updated phase67-pricing.test.ts to match new plan IDs and prices
- [x] Updated phase26.test.ts to use monthly_basic/monthly_pro plan IDs
- [x] All 484 tests passing, 0 TypeScript errors

## Phase 77: Upgrade Subscription Banner on Dashboard
- [x] Audit Dashboard.tsx subscription display and Billing.tsx plan detection
- [x] Build UpgradeBanner component: shown only to Monthly Basic subscribers, highlights Monthly Pro benefits
- [x] Wire upgrade CTA to createCheckout mutation with planId=monthly_pro
- [x] Add dismissible state (session-level) so banner doesn't block the dashboard
- [x] Ensure banner is mobile-responsive (already in client/src/components/UpgradeBanner.tsx, wired in Dashboard.tsx)

## Phase 78: Security & Performance Fixes (from PR #6 Code Review)

- [x] Fix XSS vulnerability in plainTextToHtml — add DOMPurify sanitization
- [x] Fix N+1 query in adminEmployeePerformance — batch into 3 queries
- [x] Write tests for both fixes
- [x] Save checkpoint and push to GitHub

## Phase 79: Wire Attorney Review Assigned Email

- [x] Wire sendAttorneyReviewAssignedEmail into claimLetterForReview tRPC procedure
- [x] Write test for the email notification on claim
- [x] Save checkpoint and push to GitHub

## Phase 80: Wire Employee Commission Email

- [x] Audit stripeWebhook.ts commission creation logic
- [x] Wire sendEmployeeCommissionEmail into commission creation block
- [x] Write tests for the commission email notification
- [x] Save checkpoint and push to GitHub

## Phase 81: Full MySQL/TiDB Removal — Supabase Migration Cleanup
- [x] Audit all MySQL/TiDB references across entire codebase (9 files + 40 stale .manus/db logs)
- [x] Remove MySQL from source code: db.ts TiDB fallback log, migration SQL comments
- [x] Remove MySQL from docs: SPEC_COMPLIANCE.md, CODE_REVIEW_VERIFIED.md, FEATURE_MAP.md, VALIDATION_REPORT_PHASE73.md, references/ai-sdk.md
- [x] Remove MySQL from tests: supabase-migration.test.ts TiDB URL test data replaced with generic PostgreSQL URL
- [x] Deleted all 40 stale .manus/db log files containing TiDB/MySQL error output
- [x] Save checkpoint and push to GitHub

## Phase 82: Discount Codes, First-Letter-Free, Mobile Responsiveness

- [x] Create DiscountCodeInput reusable component
- [x] Update Pricing page with discount code input, URL param support (?code=XXX), and discounted price display
- [x] Update LetterPaywall component with discount code support (uses DiscountCodeInput + free-unlock CTA)
- [x] Update Stripe checkout functions to apply discount codes (Stripe coupons created on-the-fly from DB discount %)
- [x] Fix Stripe webhook to track commissions with discount codes (already working — verified in audit)
- [x] Verify first letter free flow works correctly (checkPaywallStatus + freeUnlock + LetterPaywall green CTA)
- [x] Add mobile responsiveness fixes for key pages (SubmitLetter step overflow, Billing rows, AllLetters filters, employee Dashboard grid, scrollbar-thin utility, safe-area padding)
- [x] Test all user flows end-to-end (65 new tests in phase82-discount-mobile.test.ts, 573 total passing)

## Phase 82b — Production Deployment & E2E Checklist Audit
- [x] Stripe checkout metadata: enriched with discount_code_id, employee_id, original_price, final_price
- [x] Commission calculation: uses session.amount_total (final price after Stripe coupon applied)
- [x] Webhook idempotency: createCommission now checks for existing stripePaymentIntentId before insert
- [x] Discount code usage counter: incrementDiscountCodeUsage called in webhook for both payment and subscription modes
- [x] First-letter-free: checkPaywallStatus returns 'free' when 0 unlocked letters, freeUnlock transitions to pending_review
- [x] Referral link format: Pricing page now reads both ?code= and ?coupon= URL params
- [x] Build verification: pnpm build succeeds (0 errors, chunk size warning only)
- [x] TypeScript: 0 errors (tsc watch confirmed)
- [x] Full test suite passes (29 files, 573 tests, 0 failures)

## Phase 82c — Unique DB Index on commission_ledger.stripe_payment_intent_id
- [x] Add unique index to commission_ledger.stripe_payment_intent_id in Drizzle schema (uq_commission_ledger_stripe_pi)
- [x] Generate and apply migration SQL via webdev_execute_sql
- [x] Update createCommission to handle unique constraint violations gracefully (idempotency check)
- [x] Run tests and build verification (verified in Phase 82d Section 8)

## Phase 82d — Full Production Deployment Checklist Audit (10 sections)
### Section 1: Stripe Integration
- [x] 1A: Discount codes apply to subscription purchases (resolveStripeCoupon in createCheckoutSession)
- [x] 1A: Discount codes apply to letter unlock purchases (resolveStripeCoupon in createLetterUnlockCheckout)
- [x] 1A: Discounted pricing calculated server-side (Stripe coupon created on-the-fly from DB discount %)
- [x] 1A: Stripe checkout reflects discounted amount (coupon applied via discounts[] in session)
- [x] 1A: Metadata: discount_code_id, employee_id, original_price, final_price, letter_id all present
- [x] 1B: Webhook validates session on checkout.session.completed (stripe.webhooks.constructEvent)
- [x] 1B: Webhook extracts metadata (userId, planId, letterId, discount_code, employee_id)
- [x] 1B: Webhook creates commission record (5% = 500 basis points of session.amount_total)
- [x] 1B: Webhook increments discount code usage counter (incrementDiscountCodeUsage called)
- [x] 1B: Webhook updates letter/subscription status (generated_locked → pending_review for letters)
- [x] 1B: No duplicate commission entries (app-level check in createCommission + DB unique index uq_commission_ledger_stripe_pi)
### Section 2: First Letter Free
- [x] 2: checkPaywallStatus + checkFirstLetterFree verify no prior unlocked letters (notInArray locked statuses)
- [x] 2: UI shows "First Letter Free" badge + Gift icon (LetterPaywall.tsx line 171-174)
- [x] 2: Free Unlock Button shown ("Submit for Free Review" CTA, no Stripe)
- [x] 2: Paid unlock + DiscountCodeInput shown for non-free-eligible users
- [x] 2: Free unlock → pending_review + sendLetterUnlockedEmail + audit log
- [x] 2: Paid unlock → Stripe checkout → webhook → pending_review + email
### Section 3: Subscriber Workflow
- [x] 3: Intake form submission triggers AI pipeline (submit procedure → runFullPipeline)
- [x] 3: Pipeline stages: researching → drafting → generated_locked (pipeline.ts lines 200, 313, 446)
- [x] 3: Paywall screen shown after draft (LetterPaywall component on generated_locked status)
- [x] 3: First letter free flow works (freeUnlock mutation → pending_review)
- [x] 3: Subsequent letter paid flow works (payToUnlock → Stripe → webhook → pending_review)
- [x] 3: Attorney approval → PDF generated (generateAndUploadApprovedPdf) → downloadable in My Letters + LetterDetail
### Section 4: Attorney Workflow
- [x] 4: Review queue shows pending_review, under_review, needs_changes (attorneyProcedure.queue)
- [x] 4: Attorney can claim letter (review.claim → claimLetterForReview → under_review)
- [x] 4: Attorney can edit via Tiptap rich text editor (RichTextEditor.tsx in ReviewModal)
- [x] 4: Approve → approved + PDF generated + subscriber email notification
### Section 5: Employee (Affiliate) Workflow
- [x] 5: Employee AffiliateDashboard generates referral link /pricing?coupon=CODE
- [x] 5: Commission created in webhook on checkout.session.completed with discount_code
- [x] 5: Commission = 5% (500 basis points) of final sale, recorded with employeeId, subscriberId, saleAmount, commissionAmount
- [x] 5: Employee can request payout (AffiliateDashboard → requestPayout mutation)
- [x] 5: Admin can review and process payouts (admin/Affiliate.tsx → processPayoutRequest)
### Section 6: Admin Workflow
- [x] 6: Filter letters by status (admin.allLetters accepts optional status filter)
- [x] 6: View failed jobs (admin.failedJobs → Jobs.tsx page)
- [x] 6: Retry failed AI generations (admin.retryJob → retryPipelineFromStage)
- [x] 6: Change user roles (admin.updateRole → updateUserRole in db.ts)
- [x] 6: View affiliate performance metrics (admin/Affiliate.tsx → adminEmployeePerformance)
- [x] 6: Approve and process payouts (processPayoutRequest with approve/reject actions)
- [x] 6: Force letter status transitions (admin.forceStatusTransition procedure)
- [x] 6: RBAC enforced (subscriberProcedure, employeeProcedure, attorneyProcedure, adminProcedure)
- [x] 6: Audit logging enabled (logReviewAction called on every status transition)
### Section 7: Mobile Responsiveness
- [x] 7: Pricing page grid stacks vertically on mobile (grid-cols-1 md:grid-cols-2 lg:grid-cols-4)
- [x] 7: Discount field responsive (DiscountCodeInput uses flex gap-2, Input + Button auto-stack)
- [x] 7: Letter Paywall CTA buttons full-width on mobile (w-full sm:w-auto, flex-col sm:flex-row)
- [x] 7: All buttons touch-friendly (h-9+ heights, px-4+ padding, proper tap targets)
### Section 8: Build & Type Safety
- [x] 8: Vite 7 compatible (vite ^7.1.7)
- [x] 8: TypeScript 0 errors, 0 implicit anys (tsc watch confirmed)
- [x] 8: Production build clean output (CI=1 pnpm build succeeds, chunk size warning only)
- [x] 8: Unique index on commission_ledger.stripe_payment_intent_id applied (verified in Supabase)
### Section 9: Full System Testing
- [x] 9: All test files pass (29 files, 573 tests, 0 failures)
### Section 10: Production Readiness
- [x] 10: All flows work end-to-end (verified via code audit of all procedures + UI components)
- [x] 10: First letter free logic cannot be exploited (server-side double-check in freeUnlock + RBAC)
- [x] 10: Role-based permissions enforced (4 procedure guards: subscriber, employee, attorney, admin)

## Phase 83 — Code-Splitting for Frontend Bundle
- [x] Analyze current bundle size and identify splitting targets (baseline: 2,138 kB single chunk)
- [x] Convert admin pages to React.lazy() dynamic imports
- [x] Convert employee pages to React.lazy() dynamic imports
- [x] Convert attorney/review pages to React.lazy() dynamic imports
- [x] Convert subscriber pages to React.lazy() dynamic imports
- [x] Convert public pages (Pricing, FAQ, etc.) to React.lazy() dynamic imports
- [x] Create PublicPageSkeleton (for Pricing, FAQ, Onboarding)
- [x] Create AuthPageSkeleton (for ForgotPassword, VerifyEmail, ResetPassword)
- [x] Create SubscriberPageSkeleton (7 variants: Dashboard, SubmitLetter, MyLetters, LetterDetail, Billing, Receipts, Profile)
- [x] Create AttorneyPageSkeleton (3 variants: Dashboard, ReviewQueue, ReviewDetail)
- [x] Create EmployeePageSkeleton (AffiliateDashboard)
- [x] Create AdminPageSkeleton (6 variants: Dashboard, Users, Jobs, AllLetters, LetterDetail, Affiliate)
- [x] Wire per-route Suspense boundaries with matching skeletons in App.tsx (20 unique skeleton variants)
- [x] Configure Vite manual chunks for vendor libraries (Tiptap, Recharts, Stripe, Supabase, Radix, Framer, PDF, AI SDK, Icons, React)
- [x] Verify build output shows 41 chunks (was 1), largest 357 kB (was 2,138 kB)
- [x] Run full test suite — 29 files, 573 tests, 0 failures
- [x] Measure improvement: initial bundle 357 kB (83% reduction from 2,138 kB baseline)

## Phase 84 — Sentry Error Monitoring Integration
- [x] Install @sentry/react 10.40.0 and @sentry/node 10.40.0
- [x] Request SENTRY_DSN, VITE_SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT secrets set
- [x] Configure client-side Sentry init (React error boundary, performance tracing, session replay)
- [x] Configure server-side Sentry init (Express request handler, tRPC error handler, setupExpressErrorHandler)
- [x] Add custom Sentry context: user role (context.ts), pipeline stage tags, Stripe webhook event type tags
- [x] Instrument ErrorBoundary component with Sentry.captureException + componentDidCatch
- [x] Add Sentry breadcrumbs to critical paths (pipeline 4 catch blocks, webhook 3 catch blocks, tRPC context user)
- [x] Verify build passes with Sentry integration (0 errors, 41 chunks)
- [x] Run full test suite — 30 files, 617 tests (44 new Sentry tests), 0 failures

## Phase 85 — Sentry Alert Rules Configuration
- [x] Verify Sentry API authentication with auth token (org: wwwtalk-to-my-lawyercom, project: sentry-pink-notebook)
- [x] Create alert rule: 🚨 AI Pipeline Failure (id: 16739013, filter: pipeline_stage tag)
- [x] Create alert rule: 💳 Stripe Webhook Error (id: 16739014, filter: component=stripe_webhook)
- [x] Create alert rule: 📈 High Error Rate Spike (id: 16739015, >10 events/hour)
- [x] Verify all 4 alert rules active in Sentry (3 new + 1 existing high-priority)

## Phase 86 — Comprehensive Role & Workflow Audit + Fixes

### Password Reset
- [x] Password reset flow works for all roles (ForgotPassword → Supabase email → ResetPassword with token extraction)
- [x] Reset page has new password + confirm password fields with show/hide toggle
- [x] Redirect works: Supabase sends #access_token=xxx&type=recovery, page extracts and uses tokens

### Unique Sign-up/Login/IDs per Role
- [x] Role selector on sign-up page (subscriber, attorney, employee) with descriptions and icons
- [x] Unique user IDs (Supabase UUID) and role-based access enforced (4 procedure guards + ProtectedRoute)
- [x] Each role redirects to distinct dashboard: subscriber→/dashboard, attorney→/attorney, employee→/employee, admin→/admin

### Letter Lifecycle (Generation → Approval)
- [x] Verified: Submit intake → submitted → researching → drafting → generated_locked (pipeline.ts stages 1+2+assembly)
- [x] Verified: freeUnlock (routers.ts) and Stripe webhook (stripeWebhook.ts) both transition generated_locked → pending_review
- [x] Verified: claim→under_review, approve→approved (PDF+email), reject→rejected, requestChanges→needs_changes
- [x] Verified: approval triggers generateAndUploadApprovedPdf → S3 URL stored → LetterDetail shows Download button
- [x] Full lifecycle synced: submitted→researching→drafting→generated_locked→pending_review→under_review→approved→PDF→downloadable

### Employee Dashboard & Discount Codes
- [x] Employee Dashboard is AffiliateDashboard (display-only with real-time commission stats)
- [x] Show discount code with copy-to-clipboard icon (already in AffiliateDashboard)
- [x] Show referral link with copy icon (already in AffiliateDashboard)
- [x] Show real-time earnings: total commissions, pending payouts, paid out (already in AffiliateDashboard)
- [x] Removed orphaned employee/Dashboard.tsx (had review center code), moved ReviewQueue+ReviewDetail to attorney/ folder
- [x] Auto-generate discount codes for employees on sign-up (verified in supabaseAuth.ts)
- [x] 5% commission on discount code usage tracked in commission_ledger (verified in stripeWebhook.ts)

### Admin Analytics Dashboard
- [x] User counts by role displayed (subscribers, attorneys, employees, admins) in admin Dashboard.tsx
- [x] Letter statistics displayed: total, by status (color-coded grid), recent 30-day count
- [x] Revenue overview displayed: total sales, total commissions, pending payouts, active subscriptions
