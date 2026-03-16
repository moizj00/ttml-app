# Talk-to-My-Lawyer — Comprehensive Feature Map

**Version:** 2.0 — February 27, 2026**Author:** Manus AI**Scope:** Complete inventory of all implemented, partially-implemented, and planned features across the Talk-to-My-Lawyer platform.

---

## 1. Platform Overview

Talk-to-My-Lawyer is an AI-powered legal letter drafting platform with mandatory attorney review. Subscribers submit letter requests, a three-stage AI pipeline (Perplexity research, Anthropic drafting, Anthropic assembly) generates drafts, and licensed attorneys edit and approve letters through a dedicated Review Center. The platform enforces a strict paywall: subscribers see a blurred draft preview and must pay $200 for attorney review before any letter is finalized.

---

## 2. Role System

The platform implements four distinct roles, each with scoped access enforced at both the tRPC procedure level and Supabase Row-Level Security.

| Role | DB Enum Value | Access Scope | Dashboard Route |
| --- | --- | --- | --- |
| Subscriber | `subscriber` | Own letters, billing, profile | `/dashboard` |
| Employee | `employee` | Affiliate dashboard, discount codes, commissions, payouts | `/employee` |
| Attorney | `attorney` | Review Center (queue + detail), SLA dashboard | `/attorney` |
| Super Admin | `admin` | Full platform access, user management, jobs, letters, affiliate oversight | `/admin` |

Role assignment happens during onboarding (`/onboarding`) after signup. Employees automatically receive a generated discount code. The `attorney` role was added to the DB enum in Phase 57.

---

## 3. Authentication & Authorization

### 3.1 Auth Provider: Supabase Auth (Phase 35)

Manus OAuth was fully replaced with Supabase Auth in Phase 35. All auth flows use email/password via the Supabase Admin API.

| Feature | Status | Route / Endpoint |
| --- | --- | --- |
| Email/password signup | **Implemented** | `POST /api/auth/signup` |
| Email/password login | **Implemented** | `POST /api/auth/login` |
| Logout (clear cookies) | **Implemented** | `POST /api/auth/logout` |
| Token refresh | **Implemented** | `POST /api/auth/refresh` |
| Forgot password (email) | **Implemented** | `POST /api/auth/forgot-password` |
| Reset password (token) | **Implemented** | `POST /api/auth/reset-password` + `/reset-password` page |
| Email verification | **Implemented** | `POST /api/auth/verify-email` + `/verify-email` page |
| Resend verification | **Implemented** | `POST /api/auth/resend-verification` |
| Role-based route protection | **Implemented** | `ProtectedRoute` component with `allowedRoles` prop |
| Deep-link redirect (`?next=`) | **Implemented** | Login/signup read `?next=` param (Phase 58) |
| Email change with re-verification | **Implemented** | `auth.changeEmail` tRPC mutation (Phase 61) |
| Password change | **Implemented** | `auth.changePassword` tRPC mutation (Phase 60) |
| Onboarding (role selection) | **Implemented** | `/onboarding` page (Phase 41) |

### 3.2 Security Layers

- **Supabase RLS:** 25 policies across 9 tables (Phase 34)

- **tRPC Guards:** `subscriberProcedure`, `employeeProcedure`, `attorneyProcedure`, `adminProcedure`

- **Upstash Redis Rate Limiting:** Auth (10/15min), letters (5/hr), billing (10/hr), global tRPC (60/min) — Phase 63

- **JWT Verification:** Supabase JWT verified on every `/api/trpc` request via `context.ts`

---

## 4. Database Schema

### 4.1 Tables (9 application tables + 1 auth token table)

| Table | Purpose | Key Columns |
| --- | --- | --- |
| `users` | User accounts synced from Supabase Auth | `id`, `openId` (Supabase UUID), `name`, `email`, `role`, `emailVerified` |
| `letter_requests` | Letter intake + status tracking | `id`, `userId`, `letterType`, `subject`, `status`, `pdfUrl`, `draftReminderSentAt` |
| `letter_versions` | Immutable version history (AI draft, attorney edits, final) | `id`, `letterRequestId`, `versionType`, `content`, `createdByType` |
| `review_actions` | Audit trail for all review actions | `id`, `letterRequestId`, `reviewerId`, `action`, `fromStatus`, `toStatus` |
| `workflow_jobs` | Pipeline execution logging | `id`, `letterRequestId`, `jobType`, `provider`, `status` |
| `research_runs` | Perplexity research results | `id`, `letterRequestId`, `provider`, `queryPlanJson`, `resultJson` |
| `attachments` | File uploads (S3 references) | `id`, `letterRequestId`, `storagePath`, `storageUrl`, `fileName` |
| `notifications` | In-app notifications | `id`, `userId`, `type`, `title`, `body`, `readAt` |
| `subscriptions` | Stripe subscription tracking | `id`, `userId`, `stripeCustomerId`, `plan`, `status`, `lettersAllowed`, `lettersUsed` |
| `discount_codes` | Employee referral codes | `id`, `employeeId`, `code`, `discountPercent`, `usageCount` |
| `commission_ledger` | Employee earnings from referrals | `id`, `employeeId`, `saleAmount`, `commissionAmount`, `status` |
| `payout_requests` | Employee withdrawal requests | `id`, `employeeId`, `amount`, `status`, `processedBy` |
| `email_verification_tokens` | Email verification tokens | `id`, `userId`, `token`, `email`, `expiresAt` |

### 4.2 Enums

| Enum | Values |
| --- | --- |
| `user_role` | `subscriber`, `employee`, `attorney`, `admin` |
| `letter_status` | `submitted`, `researching`, `drafting`, `generated_unlocked`, `generated_locked`, `pending_review`, `under_review`, `approved`, `rejected`, `needs_changes` |
| `letter_type` | `demand`, `cease_and_desist`, `breach_of_contract`, `eviction_notice`, `employment_dispute`, `insurance_claim`, `debt_collection`, `general_legal` |
| `subscription_plan` | `per_letter`, `monthly`, `annual`, `free_trial_review`, `starter`, `professional` |
| `subscription_status` | `active`, `canceled`, `past_due`, `trialing`, `incomplete`, `none` |

### 4.3 Database-Level Atomic Functions (Phase 34)

- `check_and_deduct_allowance()` — race-safe subscription deduction with row locking

- `refund_letter_allowance()` — atomic refund on pipeline failure

- `safe_status_transition()` — validates status machine at DB level

- `reset_monthly_allowance()` — monthly credit reset

- `log_letter_status_change()` — audit trigger function

### 4.4 Indexes

Seven spec-required indexes plus three partial performance indexes are applied (Phase 19, Phase 34).

---

## 5. Letter Pipeline (AI-Powered)

### 5.1 Architecture

The pipeline uses **direct API calls** as the primary path. n8n is dormant unless both `N8N_PRIMARY=true` and `N8N_WEBHOOK_URL` are set.

| Stage | Provider | Model | Timeout | Purpose |
| --- | --- | --- | --- | --- |
| 1 — Research | Perplexity | `sonar-pro` | 90s | 8-task deep legal research (statutes, case law, SOL, remedies, defenses, enforcement climate) |
| 2 — Drafting | Anthropic | `claude-opus-4-5` | 120s | Professional legal letter draft from research |
| 3 — Assembly | Anthropic | `claude-opus-4-5` | 120s | Final letter assembly combining research + draft |

### 5.2 Status Flow (Simplified — Phase 69)

```
submitted → researching → drafting → generated_locked
                                          │
                                    [Subscriber pays $200]
                                          │
                                          ▼
                                    pending_review → under_review → approved
                                                                  → rejected
                                                                  → needs_changes
```

The `generated_unlocked` status still exists in the DB enum but is no longer set by the pipeline (Phase 69 removed the free-unlock path). All letters now terminate at `generated_locked` regardless of whether it is the subscriber's first letter.

### 5.3 Pipeline Entry Points

| Entry | File | Trigger |
| --- | --- | --- |
| In-app pipeline | `server/pipeline.ts` | `letters.submit` tRPC mutation |
| n8n callback | `server/n8nCallback.ts` | `POST /api/pipeline/n8n-callback` (dormant) |

### 5.4 Research Output Schema (Phase 51)

The Perplexity research stage produces a rich JSON output with: `jurisdictionProfile`, `recentCasePrecedents`, `statuteOfLimitations`, `preSuitRequirements`, `availableRemedies`, `localJurisdictionElements`, `enforcementClimate`, `commonDefenses`, `riskFlags`, `draftingConstraints`.

---

## 6. Stripe Payment Integration

### 6.1 Pricing Model (Phase 67 + Phase 69)

| Plan | Price | Type | Letters |
| --- | --- | --- | --- |
| Per Letter | $200 | One-time | 1 |
| Starter | $499/month | Subscription | 4/month |
| Professional | $799/month | Subscription | 8/month |

The $50 free trial review was removed in Phase 69. All letters now require $200 payment for attorney review.

### 6.2 Stripe Integration Points

| Feature | Status | Implementation |
| --- | --- | --- |
| Checkout session creation | **Implemented** | `billing.createCheckout` tRPC mutation |
| Webhook handler | **Implemented** | `POST /api/stripe/webhook` (signature verified) |
| Letter unlock (payment → pending_review) | **Implemented** | Webhook: `generated_locked → pending_review` |
| Subscription management | **Implemented** | Webhook handles `customer.subscription.*` events |
| Billing portal redirect | **Implemented** | `billing.createPortalSession` tRPC mutation |
| Payment history | **Implemented** | `billing.paymentHistory` tRPC query (Stripe API) |
| Receipts page | **Implemented** | `/subscriber/receipts` (Phase 48) |
| Promo code support | **Implemented** | `allow_promotion_codes: true` + discount code field (Phase 68) |
| Commission tracking | **Implemented** | Webhook creates commission_ledger entry on payment with discount code |

### 6.3 Employee Affiliate System (Phase 40 + Phase 68)

- Auto-generated discount codes on employee signup

- 5% commission rate (500 basis points) on referred payments

- Commission ledger with pending/paid status tracking

- Payout request system with admin approval workflow

- Employee dashboard with earnings summary, commission history, and share link generator

---

## 7. Email System

### 7.1 Provider: Resend

All transactional emails are sent via the Resend API. Templates use a shared `buildEmailHtml` builder with branded header, accent stripe, and footer (Phase 45).

### 7.2 Email Templates (13 functions)

| Template | Function | Trigger |
| --- | --- | --- |
| Letter Submission Confirmation | `sendLetterSubmissionEmail` | After `letters.submit` |
| Draft Ready ($200 CTA) | `sendLetterReadyEmail` | Pipeline → `generated_locked` |
| Letter Unlocked (payment confirmed) | `sendLetterUnlockedEmail` | Stripe webhook → `pending_review` |
| Letter Approved (with PDF link) | `sendLetterApprovedEmail` | Attorney approves letter |
| Needs Changes | `sendNeedsChangesEmail` | Attorney requests changes |
| Letter Rejected | `sendLetterRejectedEmail` | Attorney rejects letter |
| New Review Needed (attorney alert) | `sendNewReviewNeededEmail` | Letter enters `pending_review` |
| Job Failed (admin alert) | `sendJobFailedAlertEmail` | Pipeline job failure |
| Status Update (generic) | `sendStatusUpdateEmail` | Any status change |
| Email Verification | `sendVerificationEmail` | After signup |
| Welcome Email | `sendWelcomeEmail` | After email verification |
| 48-Hour Draft Reminder | `sendDraftReminderEmail` | Cron: `generated_locked` > 48h |
| Resend Credential Validator | `validateResendCredentials` | Startup check |

### 7.3 Dev Email Preview

`GET /api/dev/email-preview` — dev-only route that renders all 9+ templates with query param support for realistic preview data. Guarded by `NODE_ENV !== production`.

---

## 8. Frontend Pages & Routes

### 8.1 Public Pages

| Route | Page | Description |
| --- | --- | --- |
| `/` | `Home.tsx` | Landing page with hero, features, pricing, FAQ |
| `/pricing` | `Pricing.tsx` | Plan comparison cards |
| `/faq` | `FAQ.tsx` | Dedicated FAQ with JSON-LD structured data |
| `/login` | `Login.tsx` | Branded email/password login |
| `/signup` | `Signup.tsx` | Registration with role selector |
| `/forgot-password` | `ForgotPassword.tsx` | Password reset email request |
| `/verify-email` | `VerifyEmail.tsx` | Email verification handler |
| `/reset-password` | `ResetPassword.tsx` | Password reset form (Supabase hash fragment) |
| `/onboarding` | `Onboarding.tsx` | Role selection + profile setup (protected) |

### 8.2 Subscriber Pages

| Route | Page | Description |
| --- | --- | --- |
| `/dashboard` | `subscriber/Dashboard.tsx` | Stats cards, letter pipeline cards, subscription banner, guided steps |
| `/submit` | `subscriber/SubmitLetter.tsx` | Multi-step intake form (6 steps) |
| `/letters` | `subscriber/MyLetters.tsx` | Letter history with status badges, filter, sort |
| `/letters/:id` | `subscriber/LetterDetail.tsx` | Letter detail with status timeline, blurred paywall, PDF download |
| `/subscriber/billing` | `subscriber/Billing.tsx` | Subscription management, payment history |
| `/subscriber/receipts` | `subscriber/Receipts.tsx` | Stripe invoice/receipt history |
| `/profile` | `subscriber/Profile.tsx` | Account info, password change, email change (all roles) |

### 8.3 Attorney Pages

| Route | Page | Description |
| --- | --- | --- |
| `/attorney` | `attorney/Dashboard.tsx` | SLA indicators, overdue letters (>24h) |
| `/attorney/queue` | `employee/ReviewQueue.tsx` | Review queue (pending_review+ only, "New" badge) |
| `/attorney/:id` | `employee/ReviewDetail.tsx` | Letter review with Tiptap editor, approve/reject/request changes |

Backward-compatible aliases exist at `/review`, `/review/queue`, `/review/:id`.

### 8.4 Employee Pages

| Route | Page | Description |
| --- | --- | --- |
| `/employee` | `employee/AffiliateDashboard.tsx` | Earnings summary, discount code, commissions, payouts |
| `/employee/referrals` | (same) | Alias |
| `/employee/earnings` | (same) | Alias |

### 8.5 Admin Pages

| Route | Page | Description |
| --- | --- | --- |
| `/admin` | `admin/Dashboard.tsx` | System health overview, queue counts |
| `/admin/users` | `admin/Users.tsx` | User management, role assignment |
| `/admin/jobs` | `admin/Jobs.tsx` | Failed jobs monitor, retry, purge |
| `/admin/letters` | `admin/AllLetters.tsx` | All letters across all users |
| `/admin/letters/:id` | `admin/LetterDetail.tsx` | Admin letter detail with force status transition |
| `/admin/affiliate` | `admin/Affiliate.tsx` | Commission oversight, payout management, discount codes |

---

## 9. Shared Components

### 9.1 Layout & Navigation

| Component | Purpose |
| --- | --- |
| `AppLayout.tsx` | Role-aware layout with sidebar navigation, breadcrumbs, notification bell |
| `DashboardLayout.tsx` | Template dashboard layout (not used — AppLayout is primary) |
| `ProtectedRoute.tsx` | Role-based route guard with `?next=` redirect |
| `AppBreadcrumb.tsx` | Route-aware breadcrumb navigation |
| `ErrorBoundary.tsx` | Global error boundary |

### 9.2 Letter-Specific Components

| Component | Purpose |
| --- | --- |
| `LetterPaywall.tsx` | Blurred draft preview + $200 CTA (promo code field) |
| `StatusBadge.tsx` | Color-coded status badge with human-friendly labels |
| `StatusTimeline.tsx` | 6-step visual pipeline progress indicator |
| `ReviewModal.tsx` | Attorney review modal with Tiptap editor, approve/reject actions |
| `RichTextEditor.tsx` | Tiptap-based rich text editor for attorney draft editing |
| `PipelineProgressModal.tsx` | Real-time pipeline progress display |
| `OnboardingModal.tsx` | First-login welcome modal |

### 9.3 Hooks

| Hook | Purpose |
| --- | --- |
| `useLetterRealtime.ts` | Supabase Realtime subscription for letter status changes |
| `useFileUpload.ts` | File upload with progress tracking |
| `useComposition.ts` | Input composition handling |
| `usePersistFn.ts` | Stable function reference |

---

## 10. API Routes (Non-tRPC Express)

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/stripe/webhook` | POST | Stripe webhook handler (signature verified) |
| `/api/pipeline/n8n-callback` | POST | n8n pipeline callback (dormant) |
| `/api/cron/draft-reminders` | POST | 48-hour draft reminder cron (CRON_SECRET auth) |
| `/api/dev/email-preview` | GET | Dev-only email template preview |
| `/api/auth/signup` | POST | Supabase Auth signup |
| `/api/auth/login` | POST | Supabase Auth login |
| `/api/auth/logout` | POST | Supabase Auth logout |
| `/api/auth/refresh` | POST | Token refresh |
| `/api/auth/forgot-password` | POST | Password reset email |
| `/api/auth/reset-password` | POST | Password reset |
| `/api/auth/verify-email` | GET | Email verification |
| `/api/auth/resend-verification` | POST | Resend verification email |

---

## 11. PDF Generation (Phase 38 + Phase 66)

Server-side PDF generation using `pdfkit`. On attorney approval, the final letter content is rendered as a professional PDF with:

- Sender/recipient address blocks (from intake JSON)

- Date line and "Re:" subject line

- Multi-page footer with page numbers

- Approval stamp

- Brand colors

The PDF is uploaded to S3 via `storagePut` and the URL is stored in `letter_requests.pdfUrl`.

---

## 12. Realtime Updates (Phase 34)

Supabase Realtime channels provide instant updates without polling:

| Hook | Scope | Fallback |
| --- | --- | --- |
| `useLetterRealtime` | Single letter status changes | 5s polling |
| Letter list realtime | Subscriber dashboard/MyLetters | 8s polling |
| Review queue realtime | Attorney review queue | 10s polling |

All hooks fall back gracefully to polling if Supabase Realtime is not configured.

---

## 13. Testing

The project maintains a comprehensive Vitest test suite across 38 test files with approximately 617 individual test cases. Tests cover:

- Pipeline stages and status transitions

- tRPC procedure guards and CRUD operations

- Email template rendering and content

- Stripe integration (checkout, webhook, commission)

- Auth flows (signup, login, verification)

- Rate limiting

- PDF generation

- Database helpers and atomic functions

---

## 14. Remaining / Planned Features

The following items are tracked in `todo.md` but not yet implemented:

| Feature | Phase | Priority | Status |
| --- | --- | --- | --- |
| ~~Mobile dashboard layout fixes~~ | 37 | P2 | ✅ Done (Phase 48 + 82) |
| ~~Mobile letter cards~~ | 37 | P2 | ✅ Done (Phase 48 + 82) |
| ~~Mobile login/signup forms~~ | 37 | P2 | ✅ Done (Phase 48) |
| ~~Mobile ReviewModal~~ | 37 | P2 | ✅ Done (Phase 48) |
| Logo replacement across all pages | 42 | P2 | Open |
| Remove AI references from all user-visible copy | 55 | P1 | Open (SEO title done in Phase 62) |
| Test suite fixes (lazy-init Resend, stale role refs) | 65 | P2 | Open |
| Letter History page redesign | 72 | P1 | Open |
| ~~Upgrade banner for Basic → Pro subscribers~~ | 77 | P2 | ✅ Done (UpgradeBanner.tsx wired in Dashboard.tsx) |
| Research sources as separate table | 18 | P3 | Deferred |

---

## 15. Infrastructure & Environment

### 15.1 Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, Wouter (routing) |
| Backend | Express 4, tRPC 11, Superjson |
| Database | Supabase (PostgreSQL) via Drizzle ORM |
| Auth | Supabase Auth (email/password) |
| Payments | Stripe (Checkout, Webhooks, Billing Portal) |
| Email | Resend |
| AI — Research | Perplexity API (`sonar-pro`) |
| AI — Drafting/Assembly | Anthropic API (`claude-opus-4-5`) |
| Rate Limiting | Upstash Redis |
| Realtime | Supabase Realtime |
| File Storage | S3 via `storagePut`/`storageGet` |
| PDF Generation | pdfkit |
| Rich Text Editor | Tiptap |
| Testing | Vitest |

### 15.2 Environment Variables (31 secrets configured)

The platform requires 31 environment variables covering Supabase, Stripe, Anthropic, Perplexity, Resend, Upstash Redis, n8n, and application-level configuration. All are managed via `webdev_request_secrets`.

### 15.3 Migrations

Nine Drizzle migration files have been generated and applied to the Supabase project (`lguqhibpxympxvwqpedf`) via MCP `apply_migration`.

---

## 16. Phase History Summary

The platform has been built across **86 phases** (Phases 1–86), with major milestones including:

- **Phases 1–7:** Foundation (schema, auth, subscriber portal, review center, admin, pipeline, tests)

- **Phase 12:** Stripe payment integration

- **Phase 33:** Database migration to Supabase (PostgreSQL)

- **Phase 34:** Supabase RLS, atomic functions, Realtime

- **Phase 35:** Supabase Auth (replaced Manus OAuth)

- **Phase 40:** Employee affiliate system

- **Phase 44:** Email verification

- **Phase 51:** Deep legal research prompt upgrade

- **Phase 63:** Upstash Redis rate limiting

- **Phase 66:** PDF generation upgrade

- **Phase 67:** Pricing restructure ($200 per-letter, $499/$799 subscriptions)

- **Phase 69:** Simplified letter flow (single-path pipeline, removed free-trial)

- **Phase 71:** 48-hour draft reminder cron system

### Phase 75–86 Additions

- **Phase 75:** Auth flow fixes — eliminated all localhost fallbacks in supabaseAuth.ts and routers.ts; created `getOriginUrl()` helper for canonical domain resolution

- **Phase 76:** Pricing model overhaul — created `shared/pricing.ts` as single source of truth; rewrote `stripe-products.ts` with new plan IDs (free_trial, per_letter, monthly_basic, monthly_pro); added `LEGACY_PLAN_ALIASES` for backward compat; added 5 branded role-specific email templates (employee welcome, attorney welcome, attorney review assigned, attorney review completed, employee commission earned)

- **Phase 78:** Security & performance fixes — XSS vulnerability fix via DOMPurify sanitization in `plainTextToHtml`; N+1 query fix in `adminEmployeePerformance` (batched into 3 queries)

- **Phase 79:** Wired `sendAttorneyReviewAssignedEmail` into claim procedure

- **Phase 80:** Wired `sendEmployeeCommissionEmail` into Stripe webhook commission creation

- **Phase 81:** Full MySQL/TiDB removal — cleaned all legacy MySQL references from source code, docs, and tests

- **Phase 82:** Discount code support on Pricing + LetterPaywall, first-letter-free flow verification, mobile responsiveness fixes, Stripe coupon on-the-fly creation

- **Phase 82b–d:** Production deployment audit — enriched Stripe metadata, webhook idempotency, unique DB index on `commission_ledger.stripe_payment_intent_id`

- **Phase 83:** Code-splitting — converted all pages to `React.lazy()` dynamic imports with 20 unique skeleton variants; Vite manual chunks for vendor libraries; initial bundle reduced from 2,138 kB to 357 kB (83% reduction)

- **Phase 84:** Sentry error monitoring — `@sentry/react` + `@sentry/node` integration with custom context (user role, pipeline stage tags, Stripe webhook event type), breadcrumbs on critical paths, 44 new tests

- **Phase 85:** Sentry alert rules — AI Pipeline Failure, Stripe Webhook Error, High Error Rate Spike alerts configured

- **Phase 86:** Comprehensive role & workflow audit — verified password reset for all roles, verified full letter lifecycle (submit → research → draft → paywall → review → approve → PDF), cleaned up orphaned employee Dashboard.tsx, verified employee discount code + commission flows, verified admin analytics dashboard

