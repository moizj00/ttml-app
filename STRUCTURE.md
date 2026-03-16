# STRUCTURE.md — Talk to My Lawyer

> Single authoritative reference for the entire "Talk to My Lawyer" codebase.
> Last verified against source: March 2026.

---

## App Overview

**Platform:** Talk to My Lawyer — full-stack legal letter platform where users submit legal situations, AI generates professional letters, and a licensed attorney reviews before delivery.

**Production URL:** https://www.talk-to-my-lawyer.com

**Tech Stack:**
- Frontend: React + Vite, TailwindCSS, shadcn/ui, TanStack Query, wouter
- Backend: Express, tRPC, Drizzle ORM
- Database: Supabase PostgreSQL + Supabase Auth
- Payments: Stripe (subscriptions + one-time per-letter unlock)
- AI Pipeline: Perplexity (sonar-pro) for legal research, Anthropic Claude (claude-opus-4-5) for drafting and assembly
- Email: Resend
- Orchestration: n8n webhooks
- Monitoring: Sentry (frontend + backend)
- Anti-spam: hCaptcha (CSP configured; not currently enforced in signup flow)
- Deployment: Railway (Docker multi-stage build)

**User Roles:** subscriber, employee (affiliate), attorney, admin

---

## Frontend Page Routes

All routes defined in `client/src/App.tsx`.

### Public (no auth)
| Path | Description |
|------|-------------|
| `/` | Home: split-screen hero, how-it-works, features, pricing cards, FAQ, footer |
| `/pricing` | Pricing page |
| `/faq` | FAQ page |
| `/terms` | Terms of Service |
| `/privacy` | Privacy Policy |

### Auth Pages
| Path | Description |
|------|-------------|
| `/login` | Email/password + Google OAuth login |
| `/signup` | Registration with hCaptcha |
| `/forgot-password` | Password reset request |
| `/verify-email` | Email verification link handler |
| `/reset-password` | Set new password |
| `/onboarding` | Role selection (subscriber or employee/affiliate) |

### Subscriber (role: subscriber)
| Path | Description |
|------|-------------|
| `/dashboard` | Overview: stats, recent letters, subscription status, quick actions |
| `/submit` | Multi-step letter intake form (letter type, sender/recipient info, jurisdiction, matter details, tone, deadline) |
| `/letters` | My Letters list with status badges |
| `/letters/:id` | Letter detail: view draft, download PDF, upload attachments, track status, see attorney notes |
| `/subscriber/billing` | Subscription management, upgrade/downgrade, Stripe portal |
| `/subscriber/receipts` | Payment history and receipts |
| `/profile` | Edit name, email, password; verify email |

### Attorney / Review Center (roles: attorney, admin)
| Path | Description |
|------|-------------|
| `/attorney` | Dashboard: pending queue count, recently claimed, stats |
| `/attorney/queue` | Full review queue with filters, priority badges |
| `/attorney/:id` | Review detail: read draft, edit inline, add internal/user-visible notes, approve/reject/request-changes |
| `/review`, `/review/queue`, `/review/:id` | Backward-compatible aliases |

### Employee / Affiliate (roles: employee, admin)
| Path | Description |
|------|-------------|
| `/employee` | Affiliate dashboard: referral code, earnings summary, commission table, payout requests |
| `/employee/referrals` | Same page (referrals tab) |
| `/employee/earnings` | Same page (earnings tab) |

### Admin (role: admin)
| Path | Description |
|------|-------------|
| `/admin` | System dashboard: user counts, letter pipeline stats, revenue, job health |
| `/admin/users` | User management: list, search, change roles |
| `/admin/jobs` | Workflow job monitor: failed jobs, retry, purge |
| `/admin/letters` | All letters across all users with full filters |
| `/admin/letters/:id` | Admin letter detail view (same as attorney review + admin controls) |
| `/admin/affiliate` | Affiliate management: all discount codes, commissions, payout processing, employee performance |

### Fallback
| Path | Description |
|------|-------------|
| `/404` and wildcard `*` | NotFound page |

---

## REST API Endpoints

### Auth (`server/supabaseAuth.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Email/password registration with hCaptcha verification, creates Supabase auth user + local users record, sends verification email |
| POST | `/api/auth/login` | Email/password login, sets httpOnly `sb_session` cookie with JWT |
| POST | `/api/auth/logout` | Clears session cookie |
| POST | `/api/auth/refresh` | Refreshes Supabase JWT, re-sets session cookie |
| POST | `/api/auth/forgot-password` | Triggers Supabase password reset email |
| POST | `/api/auth/reset-password` | Exchanges reset token for new password |
| POST | `/api/auth/verify-email` | Verifies custom token from email link |
| GET | `/api/auth/verify-email?token=...` | Same as above via GET (email link click) |
| POST | `/api/auth/resend-verification` | Resend verification email |
| POST | `/api/auth/google` | Initiate Google OAuth, returns redirect URL |
| POST | `/api/auth/google/finalize` | Exchange Google code for session after OAuth callback |
| GET | `/api/auth/callback` | OAuth callback handler (redirects to /onboarding or /dashboard) |

### n8n Pipeline (`server/n8nCallback.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/pipeline/n8n-callback` | Receives AI pipeline results from n8n (research complete, draft ready), advances letter status, creates letter versions |

### Cron / Internal (`server/draftReminders.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/cron/draft-reminders` | Triggered by Railway cron or internal scheduler; sends reminder emails to subscribers with letters stuck in draft for 48h+ |

### Draft PDF (`server/draftPdfRoute.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/letters/:letterId/draft-pdf` | Streams a PDF render of the current AI draft (subscriber-only; must own the letter and status must be `generated_locked`) |

### Dev Tools (`server/emailPreview.ts`, dev-only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dev/email-preview?type=...` | Renders email template HTML in browser for visual testing |

### Stripe (`server/stripeWebhook.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/stripe/webhook` | Stripe signed webhook: handles `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` → syncs subscription records, credits allowances, unlocks letters, records commissions |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Returns `{ ok: true, timestamp }`. Used by Railway health checks every 30s. |

---

## tRPC Procedures

All mounted at `/api/trpc`. Router defined in `server/routers.ts`.

### `system.*`
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `system.health` | query | public | Returns server status and DB connection state |

### `auth.*`
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `auth.me` | query | public | Returns current user object from context (or null) |
| `auth.logout` | mutation | public | Clears `sb_session` cookie |
| `auth.completeOnboarding` | mutation | protected | Sets role to `subscriber` or `employee`; auto-generates affiliate discount code for employees |

### `letters.*`
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `letters.submit` | mutation | subscriber | Validates full intake JSON, checks submission allowance (billing gate), creates `letter_requests` record, logs review action, sends confirmation email, triggers n8n pipeline |
| `letters.myLetters` | query | subscriber | Returns all letters for the authenticated user |
| `letters.detail` | query | subscriber | Returns single letter with versions, actions, and attachments (subscriber sees own only) |
| `letters.updateForChanges` | mutation | subscriber | Subscriber resubmits updated intake after attorney requests changes; re-triggers pipeline |
| `letters.retryFromRejected` | mutation | subscriber | Subscriber retries a rejected letter with optional additional context; re-triggers pipeline |
| `letters.archive` | mutation | subscriber | Archives a letter (soft-delete for subscriber view) |
| `letters.uploadAttachment` | mutation | subscriber | Accepts base64 file, uploads to storage under `attachments/{userId}/{letterId}/...`, creates `attachments` record |

### `review.*` (attorney + admin)
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `review.queue` | query | attorney | Returns letters in `pending_review` status with filter/sort options |
| `review.letterDetail` | query | attorney | Returns full letter detail including all versions, review actions, and attachments |
| `review.claim` | mutation | attorney | Claims a letter for review (sets `assigned_reviewer_id`, status → `under_review`) |
| `review.approve` | mutation | attorney | Approves letter, generates and uploads signed PDF, sends approval email to subscriber |
| `review.reject` | mutation | attorney | Rejects letter with reason, notifies subscriber |
| `review.requestChanges` | mutation | attorney | Sends letter back to subscriber with notes for revision |
| `review.saveEdit` | mutation | attorney | Creates a new `attorney_edit` version, logs the edit action |

### `admin.*`
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `admin.stats` | query | admin | System-wide counts: users, letters by status, revenue, job health |
| `admin.users` | query | admin | All users with optional role filter |
| `admin.updateRole` | mutation | admin | Change any user's role; invalidates their auth cache |
| `admin.allLetters` | query | admin | All letter requests across all users |
| `admin.getLetterDetail` | query | admin | Admin-level letter detail with all versions, review actions, and workflow jobs |
| `admin.retryJob` | mutation | admin | Retries a failed workflow job through the pipeline |
| `admin.failedJobs` | query | admin | Returns up to 100 failed workflow jobs |
| `admin.purgeFailedJobs` | mutation | admin | Deletes all failed jobs from the queue |
| `admin.letterJobs` | query | admin | Returns all workflow jobs for a specific letter |
| `admin.employees` | query | admin | Returns all users with role `employee` |
| `admin.forceStatusTransition` | mutation | admin | Force-transitions a letter to any status (bypasses state machine) |
| `admin.assignLetter` | mutation | admin | Manually assigns a letter to an attorney for review |

### `notifications.*`
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `notifications.list` | query | protected | Returns notifications for current user (optional unread-only filter) |
| `notifications.markRead` | mutation | protected | Marks a single notification as read |
| `notifications.markAllRead` | mutation | protected | Marks all notifications as read |

### `versions.*`
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `versions.get` | query | protected | Returns a single letter version by ID (subscriber can view `final_approved` or `ai_draft` when letter is `generated_locked`; attorneys/admins see all) |

### `billing.*`
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `billing.getSubscription` | query | protected | Returns current subscription record with plan, status, allowances |
| `billing.checkCanSubmit` | query | protected | Returns boolean + reason (used to gate submit button) |
| `billing.createCheckout` | mutation | protected | Creates Stripe Checkout session for subscription plans |
| `billing.createBillingPortal` | mutation | protected | Creates Stripe Customer Portal session for subscription management |
| `billing.checkPaywallStatus` | query | subscriber | Returns paywall state: `free_available`, `need_subscription`, `has_allowance` |
| `billing.checkFirstLetterFree` | query | subscriber | Returns whether the user's first free letter is still available |
| `billing.freeUnlock` | mutation | subscriber | Unlocks a `generated_locked` letter for free (first letter promotion), transitions to `pending_review` |
| `billing.payToUnlock` | mutation | subscriber | Creates Stripe Checkout for per-letter unlock ($200 one-time) |
| `billing.paymentHistory` | query | protected | Returns Stripe payment intents (charges history) |
| `billing.receipts` | query | subscriber | Returns formatted receipt objects with invoice PDF URLs |

### `affiliate.*`
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `affiliate.myCode` | query | employee | Returns the employee's unique discount code and stats |
| `affiliate.myEarnings` | query | employee | Returns earnings summary (total, pending, paid) |
| `affiliate.myCommissions` | query | employee | Returns itemized commission ledger rows for the employee |
| `affiliate.requestPayout` | mutation | employee | Creates a payout request for pending earnings |
| `affiliate.myPayouts` | query | employee | Returns all payout request records for the employee |
| `affiliate.validateCode` | query | public | Returns whether a discount code is valid and its discount amount (used at checkout) |
| `affiliate.adminAllCodes` | query | admin | Returns all discount codes |
| `affiliate.adminAllCommissions` | query | admin | Returns all commission rows |
| `affiliate.adminAllPayouts` | query | admin | Returns all payout requests |
| `affiliate.adminUpdateCode` | mutation | admin | Updates a discount code (active status, percent, max uses) |
| `affiliate.adminProcessPayout` | mutation | admin | Marks a payout as completed or rejected |
| `affiliate.adminEmployeePerformance` | query | admin | Returns per-employee performance summary |

### `profile.*`
| Procedure | Type | Access | Description |
|-----------|------|--------|-------------|
| `profile.updateProfile` | mutation | protected | Updates name (and optionally email) on user record |
| `profile.changeEmail` | mutation | protected | Changes email with password verification, updates Supabase Auth, sends verification email to new address |
| `profile.changePassword` | mutation | protected | Changes password via Supabase Auth with current password verification |

---

## Database Schema

PostgreSQL hosted on Supabase. ORM: Drizzle. Schema defined in `drizzle/schema.ts`.

### Enum Types
| Enum | Values |
|------|--------|
| `user_role` | subscriber, employee, admin, attorney |
| `letter_type` | demand-letter, cease-and-desist, contract-breach, eviction-notice, employment-dispute, consumer-complaint, general-legal |
| `letter_status` | submitted, researching, drafting, generated_locked, generated_unlocked, upsell_dismissed, pending_review, under_review, needs_changes, approved, rejected |
| `version_type` | ai_draft, attorney_edit, final_approved |
| `actor_type` | system, subscriber, employee, admin, attorney |
| `note_visibility` | internal, user_visible |
| `job_type` | research, draft_generation, generation_pipeline, retry |
| `job_status` | queued, running, completed, failed |
| `research_status` | queued, running, completed, failed, invalid |
| `priority_level` | low, normal, high, urgent |
| `subscription_plan` | per_letter, monthly, annual, free_trial_review, starter, professional |
| `subscription_status` | active, canceled, past_due, trialing, incomplete, none |
| `commission_status` | pending, paid, voided |
| `payout_status` | pending, processing, completed, rejected |

### Tables

#### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| open_id | varchar unique | Supabase auth UUID |
| name | text | |
| email | varchar | |
| login_method | varchar | |
| role | user_role | default: subscriber |
| is_active | bool | default: true |
| email_verified | bool | default: false |
| free_review_used_at | timestamptz | nullable |
| last_signed_in | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `letter_requests`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| user_id | FK→users | |
| letter_type | letter_type | |
| subject | varchar | |
| issue_summary | text | |
| jurisdiction_country | varchar | default: US |
| jurisdiction_state | varchar | |
| jurisdiction_city | varchar | |
| intake_json | jsonb | full structured intake form data |
| status | letter_status | default: submitted |
| assigned_reviewer_id | FK→users | nullable |
| current_ai_draft_version_id | FK→letter_versions | nullable |
| current_final_version_id | FK→letter_versions | nullable |
| pdf_url | text | nullable |
| pdf_storage_path | text | nullable |
| priority | priority_level | default: normal |
| draft_reminder_sent_at | timestamptz | nullable |
| last_status_changed_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `letter_versions`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| letter_request_id | FK→letter_requests | |
| version_type | version_type | |
| content | text | full letter body |
| created_by_type | actor_type | |
| created_by_user_id | FK→users | nullable |
| metadata_json | jsonb | nullable; AI model/prompt metadata |
| created_at | timestamptz | |

#### `review_actions`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| letter_request_id | FK→letter_requests | |
| reviewer_id | FK→users | |
| actor_type | actor_type | |
| action | varchar | e.g. "letter_submitted", "claim", "approve", "reject" |
| note_text | text | nullable |
| note_visibility | note_visibility | default: internal |
| from_status | letter_status | nullable |
| to_status | letter_status | nullable |
| created_at | timestamptz | |

#### `subscriptions`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| user_id | FK→users | |
| stripe_customer_id | varchar | |
| stripe_subscription_id | varchar | nullable |
| stripe_payment_intent_id | varchar | nullable |
| plan | subscription_plan | |
| status | subscription_status | |
| letters_allowed | int | |
| letters_used | int | |
| current_period_start | timestamptz | |
| current_period_end | timestamptz | |
| cancel_at_period_end | bool | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `workflow_jobs`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| letter_request_id | FK→letter_requests | |
| job_type | job_type | |
| status | job_status | default: queued |
| attempt_count | int | default: 0 |
| provider | varchar | |
| error_message | text | nullable |
| request_payload_json | jsonb | |
| response_payload_json | jsonb | nullable |
| started_at | timestamptz | nullable |
| completed_at | timestamptz | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `research_runs`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| letter_request_id | FK→letter_requests | |
| workflow_job_id | FK→workflow_jobs | |
| provider | varchar | |
| status | research_status | |
| query_plan_json | jsonb | |
| result_json | jsonb | nullable |
| validation_result_json | jsonb | nullable |
| error_message | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `attachments`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| letter_request_id | FK→letter_requests | |
| uploaded_by_user_id | FK→users | |
| storage_path | text | |
| storage_url | text | |
| file_name | varchar | |
| mime_type | varchar | |
| size_bytes | int | |
| metadata_json | jsonb | nullable |
| created_at | timestamptz | |

#### `notifications`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| user_id | FK→users | |
| type | varchar | |
| title | text | |
| body | text | |
| is_read | bool | default: false |
| link | text | nullable |
| created_at | timestamptz | |

#### `email_verification_tokens`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| user_id | FK→users | |
| token | varchar unique | |
| expires_at | timestamptz | |
| used_at | timestamptz | nullable |
| created_at | timestamptz | |

#### `discount_codes`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| employee_id | FK→users | |
| code | varchar unique | |
| discount_percent | int | |
| is_active | bool | |
| usage_count | int | default: 0 |
| max_uses | int | nullable |
| expires_at | timestamptz | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `commission_ledger`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| employee_id | FK→users | |
| letter_request_id | int | |
| subscriber_id | int | |
| discount_code_id | int | |
| stripe_payment_intent_id | varchar unique | |
| sale_amount | decimal | |
| commission_rate | decimal | |
| commission_amount | decimal | |
| status | commission_status | default: pending |
| paid_at | timestamptz | nullable |
| created_at | timestamptz | |

#### `payout_requests`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| employee_id | FK→users | |
| amount | decimal | |
| payment_method | varchar | |
| payment_details | jsonb | |
| status | payout_status | default: pending |
| processed_at | timestamptz | nullable |
| processed_by | int | nullable |
| rejection_reason | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `audit_log`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| table_name | varchar | |
| operation | varchar | |
| record_id | int | |
| old_values | jsonb | nullable |
| new_values | jsonb | nullable |
| changed_fields | text[] | nullable |
| actor_user_id | int | nullable |
| created_at | timestamptz | |

### Indexes
- `users_open_id_unique` on users(open_id)
- `idx_letter_requests_user_status` on letter_requests(user_id, status)
- `idx_letter_requests_active` — partial index on letter_requests where status IN (researching, drafting, generated_locked, generated_unlocked, pending_review, under_review, needs_changes)
- `idx_letter_requests_pending_review` — partial index for review queue
- `idx_subscriptions_user_status` on subscriptions(user_id, status)
- `idx_subscriptions_active` — partial index on subscriptions where status = 'active'
- `idx_notifications_user_unread` — partial index on notifications(user_id) where is_read = false
- `idx_discount_codes_code` on discount_codes(code)
- `idx_discount_codes_employee_id` on discount_codes(employee_id)
- `idx_commission_ledger_employee_id` on commission_ledger(employee_id)
- `idx_commission_ledger_employee_status` on commission_ledger(employee_id, status)
- `idx_commission_ledger_status` on commission_ledger(status)
- `uq_commission_ledger_stripe_pi` unique on commission_ledger(stripe_payment_intent_id)
- `idx_email_verification_tokens_token` on email_verification_tokens(token)
- `idx_email_verification_tokens_user_id` on email_verification_tokens(user_id)
- `idx_payout_requests_employee_id` on payout_requests(employee_id)
- `idx_payout_requests_status` on payout_requests(status)

### Database Functions & Triggers
- `update_updated_at_column()` — trigger function; auto-updates `updated_at` on INSERT/UPDATE. Fires on: users, letter_requests, subscriptions, workflow_jobs, research_runs, discount_codes, payout_requests
- `log_audit_event()` — trigger function; writes to `audit_log` on INSERT/UPDATE/DELETE. Fires on: letter_requests (UPDATE), subscriptions (INSERT/UPDATE/DELETE), users (UPDATE — role change only)
- `check_and_deduct_allowance(user_id)` — advisory-lock-based function; atomically checks subscription has remaining letters_allowed and decrements letters_used. Called at letter submission.
- `safe_status_transition(letter_id, from_status, to_status)` — enforces the state machine at the DB level; rejects invalid status transitions.
- `refund_letter_allowance(user_id)` — increments letters_used back up when a letter is archived.
- `app_user_id()` / `app_user_role()` — helper functions; read `app.current_user_id` and `app.current_user_role` session variables set by the server before each query for RLS evaluation.
- `is_app_admin()` / `is_app_employee_or_admin()` / `is_app_subscriber()` — convenience role-check functions used in RLS policies.
- `rls_auto_enable()` — utility; ensures RLS is enabled on new tables automatically.

### RLS Policies

Row Level Security is enabled on all tables. RLS policies reference helper functions (`app_user_id()`, `app_user_role()`, `is_app_admin()`, etc.) that read `app.current_user_id` and `app.current_user_role` session variables. These variables are defined in migration SQL; the server connects with a service-role key.

| Table | Policies |
|-------|----------|
| users | select_own, update_own, update_admin, insert_system, service_role_insert |
| letter_requests | select_own (subscriber), select_employee (employee+admin sees all pending/assigned), insert_own, update_own |
| letter_versions | select_own, select_employee, authorized_insert (system+attorney+admin) |
| review_actions | select_subscriber (user_visible only), select_employee (all), authorized_insert |
| subscriptions | select_own, user_or_system_insert, user_or_system_update |
| workflow_jobs | system_insert, system_update, select_admin, delete_admin |
| research_runs | system_insert, system_update, select (employee+admin+own subscriber) |
| attachments | select_own, select_employee, insert_own |
| notifications | select_own, system_insert, update_own |
| email_verification_tokens | evt_select_own, evt_insert, evt_update |
| discount_codes | select_own (employee sees own), insert_admin, update_admin |
| commission_ledger | select_own, insert, update |
| payout_requests | select_own, insert_own, update_admin |
| audit_log | select_admin (admin only), system_insert (trigger only) |

### Storage Buckets (Supabase Storage — legacy; app uses Forge proxy)
The Supabase project has two storage buckets with RLS policies defined, but the application's active storage implementation uses the Forge proxy (`server/storage.ts`) via `BUILT_IN_FORGE_API_URL`.
- **`attachments`** — subscriber uploads. Supabase RLS: attachments_select (own), attachments_insert, attachments_upload, attachments_update, attachments_delete, attorney_read_letter_attachments, subscriber_read_own_attachments
- **`approved-letters`** — system uploads approved PDFs. Supabase RLS: approved_letters_select, approved_letters_insert, approved_letters_upload, approved_letters_update, approved_letters_delete, attorney_read_assigned_approved_letters, subscriber_read_own_approved_letters

---

## AI Pipeline

Defined in `server/pipeline.ts`. Three-stage pipeline triggered at letter submission.

### Stages
1. **Research** (`submitted` → `researching`): Calls Perplexity sonar-pro API with structured 8-task query plan to research jurisdiction-specific statutes, case law, statute of limitations, pre-suit requirements, available remedies, common defenses, and enforcement climate.
2. **Drafting** (`researching` → `drafting`): Passes research packet to Anthropic Claude (claude-opus-4-5) to draft a professional legal letter with inline citations. Target word count varies by letter type (from `LETTER_TYPE_CONFIG`).
3. **Assembly** (`drafting` → `generated_locked`): Final assembly stage; Claude produces the polished letter, creates `letter_versions` row with `version_type = ai_draft`, updates `current_ai_draft_version_id` pointer.

### Validation Gates
- `validateResearchPacket()` — hard requirements (researchSummary, jurisdictionProfile, issuesIdentified, applicableRules, draftingConstraints) + soft warnings for optional fields
- `parseAndValidateDraftLlmOutput()` — parses JSON or plain text, validates draftLetter (min 100 chars), attorneyReviewSummary, openQuestions, riskFlags
- `validateFinalLetter()` — checks minimum length (200 chars), proper salutation, proper closing

### Timeouts
- Research: 90s
- Drafting: 120s
- Assembly: 120s

### Retry
Failed jobs can be retried from any stage via `admin.retryJob` → `retryPipelineFromStage()`. Prior pipeline runs are marked as superseded.

---

## Email Notifications

All emails are transactional, sent via Resend (`server/email.ts`). Brand-consistent HTML template with table-based layout, bulletproof CTAs, and plain-text fallback.

| Function | Recipient | Trigger |
|----------|-----------|---------|
| `sendLetterSubmissionEmail` | subscriber | Letter submitted |
| `sendLetterReadyEmail` | subscriber | AI draft is ready |
| `sendLetterUnlockedEmail` | subscriber | Letter unlocked (payment or free) |
| `sendLetterApprovedEmail` | subscriber | Attorney approves letter |
| `sendLetterRejectedEmail` | subscriber | Attorney rejects letter |
| `sendNeedsChangesEmail` | subscriber | Attorney requests changes |
| `sendStatusUpdateEmail` | subscriber | Generic status change |
| `sendNewReviewNeededEmail` | attorney pool | Letter enters pending_review |
| `sendReviewAssignedEmail` | assigned attorney | Attorney claims a letter |
| `sendReviewCompletedEmail` | subscriber | Review completed (any outcome) |
| `sendJobFailedAlertEmail` | admin | Pipeline job fails |
| `sendVerificationEmail` | user | Email verification link |
| `sendWelcomeEmail` | new user | After registration |
| `sendDraftReminderEmail` | subscriber | Letter stuck in draft 48h+ |
| `sendEmployeeWelcomeEmail` | new employee | Employee onboarding |
| `sendAttorneyWelcomeEmail` | new attorney | Attorney onboarding |
| `sendEmployeeCommissionEmail` | employee | Commission earned from referral |

---

## Cron Jobs

Defined in `server/cronScheduler.ts`.

- **Draft reminder cron**: Runs every hour (`0 * * * *`). Finds letters in `generated_locked` status for > 48h with no reminder sent yet, sends `sendDraftReminderEmail`, sets `draft_reminder_sent_at`.

---

## Authentication Flow

1. User registers via `POST /api/auth/signup` → Supabase creates auth user → server creates local `users` row via `upsertUser()` → verification email sent
2. Login via `POST /api/auth/login` → Supabase validates credentials → JWT stored in httpOnly `sb_session` cookie (SameSite=None; Secure in production)
3. Every tRPC request: `createContext` reads `sb_session` cookie → calls Supabase `getUser()` to verify JWT → looks up local user row → attaches to `ctx.user`
4. Google OAuth: `/api/auth/google` → redirect to Google → `/api/auth/callback` → `POST /api/auth/google/finalize` → session cookie set
5. Role-based guards: `protectedProcedure`, `adminProcedure`, `attorneyProcedure`, `employeeProcedure`, `subscriberProcedure`
6. User cache: in-memory LRU with 30s TTL; `invalidateUserCache(openId)` called after every `upsertUser()` write; `invalidateAllUserCache()` available for emergency flush

---

## Stripe Integration

Files: `server/stripe.ts`, `server/stripeWebhook.ts`, `server/stripe-products.ts`

### Products & Plans
- **Per-letter unlock**: $200 one-time (`LETTER_UNLOCK_PRICE_CENTS = 20000`)
- **Monthly Basic** (`monthly_basic` / legacy alias `starter`): recurring monthly
- **Monthly Pro** (`monthly_pro` / legacy alias `professional`): recurring monthly
- First letter is free (no payment required)

### Checkout Flows
- Subscription plans (monthly/annual) via `billing.createCheckout`
- Per-letter unlock via `billing.payToUnlock`
- Free first letter via `billing.freeUnlock` (no Stripe session)
- Discount codes resolved to Stripe coupons on-the-fly

### Webhook Events Handled
- `checkout.session.completed` — activates subscription or unlocks letter; records commission if discount code used
- `customer.subscription.created` / `customer.subscription.updated` — syncs subscription status
- `customer.subscription.deleted` — marks subscription as canceled
- `invoice.paid` — renews subscription period
- `invoice.payment_failed` — logs warning

### Billing Portal
Subscribers can manage/cancel subscriptions via Stripe Customer Portal (`billing.createBillingPortal`).

---

## Storage Layer

File: `server/storage.ts`

Uses a Forge proxy (`BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY`) for S3-compatible object storage.

| Function | Description |
|----------|-------------|
| `storagePut(key, buffer, mimeType)` | Uploads file to storage via Forge proxy |
| `storageGet(key)` | Retrieves signed download URL from Forge proxy |

File key patterns:
- `attachments/{userId}/{letterId}/{timestamp}-{filename}`
- `approved-letters/{letterId}-{safeSubject}-{timestamp}.pdf`

---

## PDF Generation

File: `server/pdfGenerator.ts`

| Function | Description |
|----------|-------------|
| `generateAndUploadApprovedPdf(letterId)` | Renders letter content to PDF, uploads to storage via Forge proxy under `approved-letters/` key, updates `letter_requests.pdf_url` and `pdf_storage_path` |
| `GET /api/letters/:letterId/draft-pdf` | On-the-fly draft PDF render (no storage; streams directly to subscriber; requires `generated_locked` status) |

---

## Rate Limiting

File: `server/rateLimiter.ts`

| Scope | Middleware | Limit |
|-------|-----------|-------|
| Auth endpoints (login, signup, forgot-password) | `authRateLimitMiddleware` | Strict per-IP limit |
| All `/api/trpc` routes | `generalRateLimitMiddleware` | General per-IP limit |
| `letters.submit` tRPC | `checkTrpcRateLimit("letter", ...)` | 5 submissions/hour per user |
| `billing.payToUnlock` tRPC | `checkTrpcRateLimit("payment", ...)` | 10 payment attempts/hour per user |

---

## Security Headers

Set on every response in `server/_core/index.ts`:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (production only)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 0`
- Full `Content-Security-Policy` (script-src, style-src, connect-src, frame-src, etc.)
- `Permissions-Policy`

---

## Environment Variables

All required in production unless noted.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` / `SUPABASE_DATABASE_URL` | Postgres connection string |
| `SUPABASE_URL` | Supabase project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side service role key (bypasses RLS for internal ops) |
| `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` | Public anon key (used client-side for auth SDK) |
| `STRIPE_SECRET_KEY` | Stripe server-side key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Client-side Stripe key |
| `ANTHROPIC_API_KEY` | Claude for letter drafting and assembly |
| `PERPLEXITY_API_KEY` | Legal research queries (falls back to Claude if not set) |
| `RESEND_API_KEY` | Transactional email delivery |
| `RESEND_FROM_EMAIL` | Sender email address (optional; defaults to noreply@resend.dev) |
| `N8N_WEBHOOK_SECRET` | Validates incoming n8n callbacks |
| `HCAPTCHA_SECRET_KEY` | Server-side hCaptcha verification (CSP configured but not currently enforced in signup) |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Error tracking (backend / frontend) |
| `APP_BASE_URL` | Production base URL (https://www.talk-to-my-lawyer.com) |
| `CORS_ALLOWED_ORIGINS` | Optional comma-separated extra allowed origins |
| `BUILT_IN_FORGE_API_URL` | Replit built-in S3-compatible storage proxy URL |
| `BUILT_IN_FORGE_API_KEY` | Replit built-in storage proxy API key |
| `NODE_ENV` | `development` or `production` |
| `PORT` | Server port (Railway sets automatically; defaults to 3000; dev auto-finds available port) |

---

## Deployment

- **Platform:** Railway
- **Build:** Docker multi-stage — Stage 1: node:22-alpine, installs pnpm@10.4.1, runs `pnpm run build` (Vite frontend + esbuild backend); Stage 2: production image copies compiled assets
- **Start command:** `pnpm run start` → `NODE_ENV=production node --import ./dist/sentry-init.js dist/index.js`
- **Health check:** `GET /api/health` every 30s
- **Config file:** `railway.toml`

### Dev Server
- Command: `pnpm run dev` → `NODE_ENV=development tsx watch server/_core/index.ts`
- Server listens on `process.env.PORT || 3000` with automatic fallback to next available port in dev
- Vite dev server middleware is integrated into the Express server (no separate frontend process)
