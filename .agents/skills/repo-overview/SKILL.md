---
name: repo-overview
description: Comprehensive overview of the Talk-to-My-Lawyer codebase — architecture, file map, data flows, role system, conventions, and gotchas. Use when onboarding to the repo, planning features, debugging, or needing to understand how any part of the system fits together.
---

# Talk-to-My-Lawyer — Repository Overview

## 1. Project Identity & Stack

**Product**: Legal letter SaaS — AI drafts attorney-reviewed legal letters for consumers.

| Layer | Technology |
|---|---|
| Backend | Express + tRPC, Node.js |
| Frontend | React 18, Wouter (routing), Vite, TanStack Query |
| ORM / DB | Drizzle ORM → Supabase PostgreSQL |
| Auth | Supabase Auth (JWT), server-side session cookies |
| Queue | BullMQ (Upstash Redis) |
| AI | Anthropic Claude (drafting/assembly/vetting), Perplexity Sonar (research) |
| Billing | Stripe (subscriptions + one-time payments) |
| Email | Resend (direct + Cloudflare Worker relay) |
| Storage | Cloudflare R2 (PDFs, attachments) |
| Edge | Cloudflare Workers (email, PDF generation, blog cache, affiliate tracking) |
| Monitoring | Sentry (server + client) |

---

## 2. Directory Structure & Key Files

```
├── server/
│   ├── _core/
│   │   ├── index.ts          # Express entry — tRPC mount, Sentry, CSP, CORS
│   │   ├── trpc.ts           # tRPC context, middleware, procedure helpers
│   │   └── env.ts            # Centralized env var validation
│   ├── routers.ts            # All tRPC routers (auth, letters, review, admin, billing…)
│   ├── db.ts                 # Drizzle DB access layer (queries, helpers)
│   ├── pipeline.ts           # 4-stage AI pipeline (research → draft → assembly → vetting)
│   ├── queue.ts              # BullMQ queue configuration
│   ├── worker.ts             # Standalone pipeline worker process
│   ├── stripe.ts             # Stripe helpers (checkout, portal, subscription management)
│   ├── stripeWebhook.ts      # Stripe webhook handler (payment events, idempotency)
│   ├── email.ts              # 25+ email templates via Resend (dual-path: worker + direct)
│   ├── supabaseAuth.ts       # Auth middleware, JWT verify, user sync, SUPER_ADMIN_EMAILS
│   └── learning.ts           # Recursive learning system (quality scoring, lesson extraction)
│
├── client/src/
│   ├── App.tsx               # All routes (public, subscriber, attorney, admin, employee)
│   ├── _core/                # Core hooks (useAuth)
│   ├── components/           # UI components + /ui (shadcn)
│   ├── pages/                # Views: /admin, /attorney, /employee, /subscriber
│   ├── hooks/                # Custom hooks (animations, realtime, composition)
│   └── lib/
│       ├── trpc.ts           # tRPC client hooks
│       └── supabase.ts       # Supabase Realtime client
│
├── drizzle/
│   └── schema.ts             # Complete DB schema (19 tables, 16 enums)
│
├── shared/
│   └── types.ts              # ALLOWED_TRANSITIONS (status machine), PipelineError, error codes
│
├── workers/                  # Cloudflare Workers
│   ├── email-worker/         # Email rendering + Resend delivery
│   └── pdf-worker/           # PDF generation
│
├── cloudflare-worker/        # Additional workers (blog cache, affiliate)
├── k8s/                      # Kubernetes configs + Dockerfiles
├── scripts/                  # DB migration, seeding, pipeline trigger scripts
├── docs/                     # Architecture docs, feature maps, audit reports
└── memory/                   # PRD.md (Product Requirements Document)
```

---

## 3. Core Flows

### 3a. Letter Lifecycle (13 Statuses)

```
submitted → researching → drafting → generated_locked → pending_review
    ↑           ↓              ↓                              ↓
    │      pipeline_failed  pipeline_failed              under_review
    │                                                   ↙     ↓      ↘
    ├─────────── needs_changes                    approved  rejected
    ├─────────── rejected                            ↓
    └─────────── pipeline_failed         client_approval_pending
                                                     ↓
                                              client_approved
                                                     ↓
                                                    sent (terminal)
```

Source of truth: `ALLOWED_TRANSITIONS` in `shared/types.ts`.
Admin `forceStatusTransition` can bypass this map with `force: true`.

### 3b. AI Pipeline (4 Stages)

| Stage | Provider | Model | Purpose |
|---|---|---|---|
| 1. Research | Perplexity | `sonar-pro` | Web-grounded legal research, citation extraction, KV caching |
| 2. Drafting | Anthropic | `claude-opus-4-5` | Structured legal draft from research + intake |
| 3. Assembly | Anthropic | `claude-opus-4-5` | Polish into professional letter (format, tone, word count) |
| 4. Vetting | Anthropic | `claude-sonnet-4` | Quality audit: anti-hallucination, anti-bloat, jurisdiction check |

Key behavior:
- **Assembly↔Vetting loop**: If vetting finds critical issues, it retries assembly with feedback (up to 3 retries)
- **Lesson injection**: Past attorney feedback is injected into drafting prompts
- **Citation registry**: Research builds a verified citation set; vetting removes unverified citations
- Orchestrated by `runFullPipeline` in `server/pipeline.ts`
- Each stage creates a `workflow_jobs` record tracking tokens, cost, provider

### 3c. Authentication Flow

```
Supabase Auth (email/password or OAuth)
  → JWT issued
  → Server verifies JWT via supabaseAuth.ts
  → Local user record synced (upsert)
  → Session cookie set
  → SUPER_ADMIN_EMAILS whitelist enforced (self-healing role sync)
  → RLS exists but server connects as DB owner (bypasses RLS)
```

### 3d. Billing Flow

```
Free trial (first letter free)
  → Stripe Checkout (subscription or one-time payment)
  → Webhook processes payment events (idempotent via processed_stripe_events table)
  → Subscription stored in subscriptions table
  → Letter allowance checked on each submit
  → Billing portal for self-service management
```

### 3e. Attorney Review Flow

```
Letter enters pending_review queue
  → Attorney claims letter (under_review)
  → Attorney can: approve / reject / request changes / save edits
  → On approve: PDF generated, subscriber notified, learning system triggered
  → On reject/needs_changes: subscriber notified, can resubmit
  → Learning system extracts lessons from attorney actions for pipeline improvement
```

### 3f. Email System (Dual-Path)

- **Primary**: POST payload to Cloudflare Email Worker → renders template → sends via Resend
- **Fallback**: Direct send from server using Resend SDK
- 25+ templates: verification, welcome, status updates, approval, rejection, attorney alerts, admin 2FA, commission notifications, recipient delivery
- `sendWithRetry` implements exponential backoff for critical emails

---

## 4. Role System

| Role | Access | Notes |
|---|---|---|
| `subscriber` | Dashboard, submit letters, view own letters, billing | Default role on signup |
| `attorney` | Review center, claim/review/approve/reject letters | Promoted by admin only |
| `employee` | Affiliate dashboard, referral links, commissions | Selected during onboarding or assigned by admin |
| `admin` | Full system access, user management, analytics, pipeline control | Hard-coded whitelist only |

**Security invariants**:
- `SUPER_ADMIN_EMAILS` in `server/supabaseAuth.ts` — hard-coded email whitelist
- `OWNER_OPEN_ID` env var — alternative admin grant by Supabase user ID
- **Self-healing**: Every auth request checks the whitelist; non-whitelisted admins are auto-demoted to subscriber
- Admin operations require **2FA** (TOTP via `adminProcedure`)

**Backend enforcement**: `adminProcedure`, `attorneyProcedure`, `employeeProcedure`, `subscriberProcedure` in tRPC middleware.
**Frontend enforcement**: `ProtectedRoute` component with `allowedRoles` prop + email verification gate.

---

## 5. tRPC Routers

All routers defined in `server/routers.ts`, merged into `appRouter`:

| Router | Key Procedures |
|---|---|
| `system` | `health`, `version`, `info` |
| `auth` | `me`, `logout`, `completeOnboarding` |
| `letters` | `submit`, `myLetters`, `detail`, `updateForChanges`, `retryFromRejected` |
| `review` | `queue`, `letterDetail`, `claim`, `unclaim`, `approve`, `reject`, `requestChanges`, `saveEdit` |
| `admin` | `stats`, `costAnalytics`, `qualityStats`, `users`, `updateRole`, `inviteAttorney`, `allLetters`, `forceStatusTransition`, `failedJobs`, `retryJob`, `lessons`, … |
| `notifications` | `list`, `markRead`, `markAllRead` |
| `versions` | `get` (paywall-aware version access) |
| `billing` | `getSubscription`, `checkCanSubmit`, `createCheckout`, `createBillingPortal`, `freeUnlock`, `payToUnlock`, `paymentHistory`, `receipts` |
| `affiliate` | `myCode`, `rotateCode`, `myEarnings`, `myCommissions`, `validateCode`, `adminAllCodes`, `adminProcessPayout`, … |
| `profile` | `updateProfile`, `changeEmail`, `changePassword` |
| `documents` | `analyze`, `getMyAnalyses` |
| `blog` | `list`, `getBySlug`, `adminCreate`, `adminUpdate`, `adminDelete` |

---

## 6. Database Schema

**19 tables** in `drizzle/schema.ts`:

| Table | Purpose |
|---|---|
| `users` | User accounts, roles, auth details |
| `letter_requests` | Core letter submissions, status, jurisdiction, assignee |
| `letter_versions` | Immutable version history (AI draft, attorney edit, final) |
| `review_actions` | Audit trail for review status changes |
| `workflow_jobs` | Pipeline execution logs (tokens, cost, provider) |
| `research_runs` | AI research task logs with caching |
| `attachments` | User-uploaded file metadata |
| `notifications` | User-facing notifications |
| `subscriptions` | Stripe subscription state and letter limits |
| `discount_codes` | Employee referral discount codes |
| `commission_ledger` | Affiliate commission tracking |
| `payout_requests` | Affiliate payout requests |
| `email_verification_tokens` | Email verification tokens |
| `pipeline_lessons` | Learning system feedback for AI improvement |
| `letter_quality_scores` | Pipeline quality metrics |
| `document_analyses` | Document analyzer results |
| `processed_stripe_events` | Stripe webhook idempotency |
| `admin_verification_codes` | Admin 2FA codes |
| `blog_posts` | Blog CMS content |

**17 enums**: `userRoleEnum`, `letterStatusEnum`, `letterTypeEnum`, `versionTypeEnum`, `actorTypeEnum`, `jobStatusEnum`, `jobTypeEnum`, `researchStatusEnum`, `priorityEnum`, `noteVisibilityEnum`, `subscriptionPlanEnum`, `subscriptionStatusEnum`, `commissionStatusEnum`, `payoutStatusEnum`, `pipelineStageEnum`, `lessonCategoryEnum`, `lessonSourceEnum`.

---

## 7. Frontend Routes

### Public
`/`, `/pricing`, `/faq`, `/terms`, `/privacy`, `/analyze`, `/blog`, `/blog/:slug`

### Auth
`/login`, `/signup`, `/forgot-password`, `/verify-email`, `/reset-password`, `/accept-invitation`, `/onboarding`

### Subscriber (role: subscriber)
`/dashboard`, `/submit`, `/letters`, `/letters/:id`, `/subscriber/billing`, `/subscriber/receipts`, `/profile`

### Attorney (roles: attorney, admin)
`/attorney`, `/attorney/queue`, `/attorney/review/:id`, `/attorney/:id`
Legacy aliases: `/review`, `/review/queue`, `/review/:id`

### Employee (roles: employee, admin)
`/employee`, `/employee/referrals`, `/employee/earnings`

### Admin (role: admin, requires 2FA)
`/admin/verify`, `/admin`, `/admin/users`, `/admin/jobs`, `/admin/letters`, `/admin/letters/:id`, `/admin/affiliate`, `/admin/learning`, `/admin/blog`, `/admin/pipeline`

---

## 8. Environment Variables

### Required — Core
- `DATABASE_URL` — PostgreSQL connection string
- `SUPABASE_URL` / `VITE_SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side admin key (bypasses RLS)
- `VITE_SUPABASE_ANON_KEY` — Client-side public key
- `JWT_SECRET` — Session cookie signing

### Required — AI Pipeline
- `ANTHROPIC_API_KEY` — Claude (drafting, assembly, vetting)
- `PERPLEXITY_API_KEY` — Legal research
- `OPENAI_API_KEY` — Supplemental AI tasks

### Required — Payments
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY`

### Required — Email
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

### Required — Queue
- `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### Required — Storage
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`

### Optional — Workers
- `EMAIL_WORKER_URL`, `EMAIL_WORKER_SECRET`
- `PDF_WORKER_URL`, `PDF_WORKER_SECRET`
- `AFFILIATE_WORKER_URL`, `AFFILIATE_WORKER_SECRET`
- `KV_WORKER_URL`, `KV_WORKER_AUTH_TOKEN`
- `CF_BLOG_CACHE_WORKER_URL`, `CF_BLOG_CACHE_INVALIDATION_SECRET`

### Optional — Monitoring & Deployment
- `SENTRY_DSN` / `VITE_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
- `NODE_ENV`, `PORT`, `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS`
- `OWNER_OPEN_ID` — Alternative super-admin grant by Supabase user ID
- `N8N_WEBHOOK_URL`, `N8N_CALLBACK_SECRET`, `N8N_PRIMARY`

---

## 9. Critical Conventions & Gotchas

### Known Issues — Do Not Fix
- **Pre-existing TS errors** in `admin2fa.ts` and Blog files — leave them alone
- **`drizzle-kit migrate` exits code 1** — migration journal drift; known issue, does not block functionality
- **Database initialized via `db:push`**, not sequential migrations

### Development Gotchas
- **Dev auth is rate-limited** by Supabase — use Supabase token endpoint for test auth
- **Resend domain unverified in dev** — 403 on emails is expected
- **Pipeline concurrency = 1** — sequential processing per worker instance
- **RLS policies exist** but server connects as DB owner (bypasses RLS)
- **Session cookies** use `JWT_SECRET` for signing — must match across server instances

### Code Conventions
- Shared types/constants go in `shared/` (imported by both client and server)
- Insert schemas generated via `createInsertSchema` from `drizzle-zod`
- Frontend uses `@`-prefixed imports (aliases configured in Vite)
- All interactive elements must have `data-testid` attributes
- tRPC queries use default `queryFn` — don't define custom fetchers
- Mutations use `apiRequest` from `@lib/queryClient` and must invalidate cache by `queryKey`
- Use array query keys for hierarchical data: `['/api/letters', id]` not template strings

### Pipeline Conventions
- Each pipeline stage creates a `workflow_jobs` record
- `ALLOWED_TRANSITIONS` is the canonical status machine — never bypass without `force: true`
- Lessons from attorney reviews are automatically extracted and injected into future prompts
- Citation registry is built during research and enforced during vetting

---

## 10. Testing Notes

- Test users are documented with IDs in the codebase
- `ALLOWED_TRANSITIONS` in `shared/types.ts` is the status machine source of truth
- Integration/E2E tests exist in `server/*.test.ts`
- Frontend uses shadcn components with `data-testid` for test targeting
- Pipeline tests can be triggered via scripts in `scripts/`
