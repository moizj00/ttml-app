# ARCHITECTURE.md — Talk to My Lawyer

> **Single source of truth** for the system's architecture, tech stack, module boundaries, and ownership map.
> Last verified: April 2026.

---

## App Overview

**Platform:** Talk to My Lawyer — full-stack legal letter platform where users submit legal situations, AI generates professional letters, and a licensed attorney reviews before delivery.

**Production URL:** <https://www.talk-to-my-lawyer.com>

---

## Tech Stack

| Layer                  | Technology                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Frontend               | React 19, Vite 7, TypeScript, Tailwind CSS v4 (OKLCH), shadcn/ui, wouter, TanStack Query |
| Backend                | Node.js, Express 4.21, tRPC 11.6, TypeScript                                             |
| Database               | PostgreSQL on Supabase, Drizzle ORM 0.44                                                 |
| Auth                   | Supabase Auth (JWT via `sb_session` httpOnly cookie), Row-Level Security                 |
| AI — Research          | OpenAI `gpt-4o-search-preview` (web search); Perplexity `sonar-pro` optional failover    |
| AI — Drafting/Assembly | Anthropic Claude Opus                                                                    |
| AI — Vetting           | Anthropic Claude Sonnet                                                                  |
| AI — Doc Analysis      | OpenAI GPT-4o                                                                            |
| Payments               | Stripe (subscriptions + one-time $299 per-letter unlock)                                 |
| Email                  | Resend (17 transactional templates)                                                      |
| Background Jobs        | pg-boss (PostgreSQL-native queue)                                                        |
| Rate Limiting          | Upstash Redis via @upstash/ratelimit (fail-open for general; fail-closed for auth)       |
| Rich Text Editing      | Tiptap (attorney review)                                                                 |
| PDF Generation         | PDFKit (server-side)                                                                     |
| Monitoring             | Sentry (frontend + backend) + Pino structured logger                                     |
| Deployment             | Railway (Docker multi-stage build)                                                       |

---

## User Roles

| Role        | DB Enum      | Access Scope                                                              | Dashboard Route |
| ----------- | ------------ | ------------------------------------------------------------------------- | --------------- |
| Subscriber  | `subscriber` | Own letters, billing, profile                                             | `/dashboard`    |
| Employee    | `employee`   | Affiliate dashboard, discount codes, commissions, payouts                 | `/employee`     |
| Attorney    | `attorney`   | Review Center (queue + detail), SLA dashboard                             | `/attorney`     |
| Super Admin | `admin`      | Full platform access, user management, jobs, letters, affiliate oversight | `/admin`        |

> **Full access matrix →** [`docs/ROLE_AREA_MATRIX.md`](docs/ROLE_AREA_MATRIX.md)

---

## Status Machine (Letter Lifecycle)

Defined in `shared/types/letter.ts` → `ALLOWED_TRANSITIONS`. This is the **single source of truth** for all status transitions.

```
submitted → researching → drafting → ai_generation_completed_hidden  (24h hold)
                                          │
                          ┌───────────────┴─────────────────────────┐
                          │                                          │
                    [after 24h, auto-release]              [admin force-transition]
                          │                                          │
                          ▼                                          ▼
             letter_released_to_subscriber                    under_review
             attorney_review_upsell_shown
             attorney_review_checkout_started
             attorney_review_payment_confirmed
                          │
                          ▼
                    pending_review → under_review → approved (transient)
                                                  → rejected → submitted
                                                  → needs_changes → submitted

approved → client_approval_pending → client_approved → sent
                                   → client_revision_requested → pending_review

pipeline_failed → submitted (admin retry)
```

**Key rules:**

- `ai_generation_completed_hidden` is the **24-HOUR HOLD** status — all generated letters (free-preview and subscription) are hidden from the subscriber for 24 hours. After the hold expires the letter auto-releases to `letter_released_to_subscriber`.
- **Free-preview funnel**: `letter_released_to_subscriber` → `attorney_review_upsell_shown` → checkout → `attorney_review_payment_confirmed` → `pending_review` for attorney assignment.
- **Admin bypass**: Admins can collapse the 24h window via `forceStatusTransition`, moving a letter directly from any hold/upsell status to `under_review`, skipping the paywall entirely. Deferred pipeline jobs are cancelled atomically to prevent re-execution.
- `approved` is transient — auto-forwards to `client_approval_pending`
- Admin can force ANY transition (bypasses map with `force=true`)
- Any pipeline stage can reach `pipeline_failed` (except post-review stages)
- The `ai_draft` version is immutable — attorney edits always create a new `attorney_edit` version

---

## Module Map

### Frontend (`client/src/`)

```
├── App.tsx                    # Route definitions (wouter)
├── main.tsx                   # Entry point, Sentry init, tRPC provider
├── index.css                  # Tailwind v4 theme (OKLCH), animations
├── _core/hooks/useAuth.ts     # Auth hook (note: _core path)
├── components/
│   ├── ui/                    # shadcn/ui primitives
│   ├── shared/                # Cross-role components (ReviewModal/, SubscriberLetterPreviewModal/)
│   ├── ProtectedRoute.tsx     # RBAC route guard
│   └── LetterPaywall.tsx      # Paywall blur overlay
├── contexts/ThemeContext.tsx   # Dark mode toggle
├── hooks/                     # useLetterRealtime, useMobile
├── lib/                       # trpc.ts, supabase.ts, sentry.ts
└── pages/
    ├── Home.tsx               # Landing page
    ├── admin/                 # Admin dashboard pages
    ├── attorney/              # Attorney review pages (ReviewDetail/)
    ├── employee/              # Affiliate pages (AffiliateDashboard/)
    └── subscriber/            # Subscriber pages
```

**Modularized Pages** (directory pattern with `index.tsx` + `hooks/` + sub-components):

- `DocumentAnalyzer/`, `ReviewModal/`, `Learning/`, `Affiliate/`, `AffiliateDashboard/`, `ReviewDetail/`, `SubscriberLetterPreviewModal/`
- Subscriber dashboard and detail views are also modularized:
      - `client/src/pages/subscriber/Dashboard.tsx` composes `client/src/components/subscriber/dashboard/*`
      - `client/src/pages/subscriber/LetterDetail.tsx` composes `client/src/components/subscriber/letter-detail/*`

### Backend (`server/`)

```
├── _core/                     # Express server, tRPC init, context, env, admin2fa, cookies, vite
├── routers/                   # tRPC sub-routers (admin/, letters/, review/, affiliate/, billing/, blog)
├── db/                        # Data access layer (all DB operations go through here)
├── pipeline/                  # 4-stage AI pipeline (orchestrator + modular orchestration/research/vetting handlers)
├── learning/                  # Recursive learning (extraction, quality, categories, dedup)
├── stripe/                    # Stripe checkout/billing (client, checkouts, subscriptions, coupons)
├── emailPreview/              # Email template preview (builder, templates)
├── email.ts                   # Resend transactional emails
├── supabaseAuth.ts            # JWT verification, user sync, super admin whitelist
├── stripeWebhook.ts           # Stripe webhook handler
├── pdfGenerator.ts            # PDFKit letter generation
├── intake-normalizer.ts       # Intake data standardization
├── rateLimiter.ts             # Upstash rate limiting
├── n8nCallback.ts             # n8n webhook handler (dormant alternative)
├── worker.ts                  # pg-boss worker
├── cronScheduler.ts           # Background cron jobs
├── stalePipelineLockRecovery.ts # Auto-release stuck pipeline locks (15 min)
└── staleReviewReleaser.ts     # Auto-release unclaimed reviews
```

Implementation notes for maintainability:

- Admin router is decomposed under `server/routers/admin/` with `index.ts` composing `letters.ts`, `users.ts`, `jobs.ts`, and `learning.ts`.
- Pipeline routing remains at `server/pipeline/orchestrator.ts`, with shared helpers in `server/pipeline/orchestration/` and stage modules in `server/pipeline/research/` and `server/pipeline/vetting/`.

### Shared (`shared/`)

```
├── types/                     # Status machine (letter.ts), Zod schemas
├── pricing.ts                 # Pricing constants (single source of truth — $299/letter, $299/mo, $2,400/yr)
└── const.ts                   # Error messages
```

### Database (`drizzle/`)

```
├── schema.ts                  # All table definitions, enums, indexes
├── relations.ts               # Drizzle relation definitions
└── migrations/                # SQL migration files
```

---

## Database Schema (Key Tables)

| Table               | Purpose                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `users`             | Role-based accounts (subscriber, employee, attorney, admin)                     |
| `letter_requests`   | Core entity; tracks full lifecycle from `submitted` to `sent`                   |
| `letter_versions`   | Immutable history of drafts and edits (ai_draft, attorney_edit, final_approved) |
| `review_actions`    | Audit trail for status changes and review notes                                 |
| `workflow_jobs`     | Pipeline stage execution logs (tokens, errors)                                  |
| `research_runs`     | AI research results per letter                                                  |
| `subscriptions`     | Stripe billing state (plan, letters_allowed, letters_used)                      |
| `pipeline_lessons`  | Recursive learning: attorney feedback → future AI prompt improvements           |
| `document_analyses` | Results from the free AI document analyzer                                      |
| `commission_ledger` | Employee affiliate earnings                                                     |
| `discount_codes`    | Affiliate discount codes with usage tracking                                    |
| `blog_posts`        | CMS content for the blog section                                                |

---

## tRPC Router Structure

Root router: `server/routers/index.ts` → `appRouter`. Mounted at `/api/trpc`.

| Sub-Router  | Auth Level                    | Key Procedures                                                            |
| ----------- | ----------------------------- | ------------------------------------------------------------------------- |
| `system`    | Public                        | `healthCheck`, `stats`                                                    |
| `auth`      | Public/Protected              | `me`, `logout`, `completeOnboarding`                                      |
| `letters`   | Subscriber                    | `submit`, `myLetters`, `detail`, `clientApprove`, `clientRequestRevision` |
| `review`    | Attorney                      | `queue`, `claim`, `approve`, `reject`, `requestChanges`, `saveEdit`       |
| `admin`     | Admin + 2FA                   | `updateRole`, `allLetters`, `users`, `payouts`, `forceStatusTransition`   |
| `billing`   | Protected                     | `checkout`, `portal`, `subscriptionStatus`                                |
| `affiliate` | Employee                      | `dashboard`, `earnings`, `payouts`                                        |
| `documents` | Protected                     | `analyze`, `upload`                                                       |
| `blog`      | Admin (write) / Public (read) | `getPost`, `createPost`, `updatePost`                                     |

**REST-only endpoints:** auth signup/login, Stripe webhooks, n8n callback, PDF streaming, health checks.

`admin` router composition: `server/routers/admin/index.ts` merges domain procedures from `server/routers/admin/{letters,users,jobs,learning}.ts`.

---

## AI Pipeline (4 Stages)

Defined in `server/pipeline/orchestrator.ts`, with modular handlers in `server/pipeline/orchestration/`, `server/pipeline/research/`, and `server/pipeline/vetting/`.

| Stage        | Model                          | Purpose                                                    | Output                |
| ------------ | ------------------------------ | ---------------------------------------------------------- | --------------------- |
| 1 — Research | OpenAI `gpt-4o-search-preview` | Web-grounded legal research (with `webSearchPreview` tool) | `ResearchPacket`      |
| 2 — Drafting | Claude Opus                    | Initial letter draft from research + intake                | `DraftOutput`         |
| 3 — Assembly | Claude Opus                    | Polish into formal legal letter format                     | Assembled letter text |
| 4 — Vetting  | Claude Sonnet                  | Anti-hallucination, citation check, bloat removal          | Vetted letter text    |

- **RAG/Recursive Learning:** Attorney-approved letters are embedded (OpenAI `text-embedding-3-small`) and used as reference examples in Stage 2 drafting.
- **Research failover chain:** OpenAI gpt-4o-search-preview → Perplexity sonar-pro (if key set) → OpenAI stored prompt → Groq Llama 3.3 70B → synthetic fallback.
- **n8n:** Dormant alternative path, only active when `N8N_PRIMARY=true` is set.

For deep pipeline details, see `docs/PIPELINE_ARCHITECTURE.md`.

---

## Core Architectural Invariants

These invariants are enforced across the codebase. Detailed enforcement rules live in `skills/architectural-patterns/`.

1. **Mandatory Attorney Review** — Every AI-generated letter must be reviewed by an attorney. The `ai_draft` version is immutable. See `skills/architectural-patterns/mandatory_attorney_review.md`.
2. **Strict Status Machine** — All transitions validated against `ALLOWED_TRANSITIONS` in `shared/types/letter.ts`. See `skills/architectural-patterns/strict_status_machine.md`.
3. **RBAC Enforcement** — Access gated by tRPC middleware (`subscriberProcedure`, `attorneyProcedure`, `adminProcedure`). See `skills/architectural-patterns/rbac_enforcement.md`.
4. **Super Admin Whitelist** — Hard-coded in `server/supabaseAuth.ts`, cannot be modified via UI/API. See `skills/architectural-patterns/super_admin_whitelist.md`.
5. **Payment Gate** — Full letter content locked (`generated_locked`) until payment confirmed, with server-side truncation and frontend blurring. See `skills/architectural-patterns/payment_gate.md`.

---

## Documentation Ownership Index

Each piece of information lives in **exactly one place**. This table maps every topic to its authoritative file.

| Topic                                                       | Authoritative File                   | Scope                      |
| ----------------------------------------------------------- | ------------------------------------ | -------------------------- |
| Architecture, tech stack, module map, roles, status machine | `ARCHITECTURE.md` (this file)        | System-wide reference      |
| Agent behavioral rules, architectural invariant summaries   | `CLAUDE.md`                          | AI agent instructions      |
| Architectural pattern enforcement rules                     | `skills/architectural-patterns/*.md` | Per-pattern detailed rules |
| AI pipeline deep-dive (stages, RAG, resilience, n8n)        | `docs/PIPELINE_ARCHITECTURE.md`      | Pipeline-specific          |
| Developer workflow, gotchas, conventions, common pitfalls   | `docs/AGENT_GUIDE.md`                | Day-to-day dev reference   |
| Feature inventory (all phases)                              | `docs/FEATURE_MAP.md`                | What's been built          |
| SEO content strategy, blog calendar, keyword map            | `CONTENT-STRATEGY.md`                | Marketing/content          |
| Complete task and bug tracking (all phases)                 | `todo.md`                            | Historical task log        |
| Workflow summary (letter lifecycle, end-to-end)             | `docs/workflow_summary.md`           | Business logic walkthrough |
| Feature inventory (all phases)                              | `docs/FEATURE_MAP.md`                | What's been built          |
