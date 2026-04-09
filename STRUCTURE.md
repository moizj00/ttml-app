# STRUCTURE.md — Talk to My Lawyer

> Single authoritative reference for the entire "Talk to My Lawyer" codebase.
> Last verified against source: April 2026.

---

## App Overview

**Platform:** Talk to My Lawyer — full-stack legal letter platform where users submit legal situations, AI generates professional letters, and a licensed attorney reviews before delivery.

**Production URL:** https://www.talk-to-my-lawyer.com

**Tech Stack:**
- Frontend: React 19 + Vite 7, TailwindCSS 4.1, shadcn/ui, TanStack Query, wouter
- Backend: Express 4.21, tRPC 11.6, Drizzle ORM 0.44
- Database: Supabase PostgreSQL + Supabase Auth
- Payments: Stripe (subscriptions + one-time per-letter unlock)
- AI Pipeline: Perplexity sonar-pro (primary research) → Anthropic Claude Opus for drafting + assembly → Anthropic Claude Sonnet for vetting.
- Email: Resend
- Background jobs: pg-boss (PostgreSQL-native queue via Supabase)
- Rate limiting: Upstash Redis via @upstash/ratelimit (fail-open)
- Monitoring: Sentry (frontend + backend) + Pino logger
- Deployment: Railway (Docker multi-stage build)

**User Roles:** subscriber, employee (affiliate), attorney, admin

---

## Frontend Architecture

The frontend follows a **Modular Directory Pattern** for all complex pages and shared components. Instead of single "God files," each major feature is a directory containing:
- `index.tsx`: The thin orchestrator (often using `React.lazy`).
- `hooks/`: Custom hooks for state and tRPC mutations (e.g., `useReviewModal.ts`).
- `SubComponents.tsx`: Smaller, focused UI modules.

### Modularized Pages & Components
| Feature | Path | Components |
|---------|------|------------|
| Document Analyzer | `client/src/pages/DocumentAnalyzer/` | `AnalyzerNav`, `FileUploadZone`, `AnalysisResults` |
| Review Modal | `client/src/components/shared/ReviewModal/` | `ActionDialog`, `ReviewSidePanel`, `ReviewActionDialogs` |
| Admin Learning | `client/src/pages/admin/Learning/` | `LessonsTab`, `QualityTab`, `EffectivenessBadge` |
| Admin Affiliate | `client/src/pages/admin/Affiliate/` | `AffiliatePerformanceTab`, `AffiliateCodesTab`, etc. |
| Employee Dashboard | `client/src/pages/employee/AffiliateDashboard/` | `AffiliateStatsCards`, `AffiliateReferralTools`, etc. |
| Attorney Review | `client/src/pages/attorney/ReviewDetail/` | Orchestrates existing `attorney/review/` panels |
| Subscriber Preview | `client/src/components/shared/SubscriberLetterPreviewModal/` | `LetterPreviewContent`, `SubscriberActionPanel` |

---

## Backend Architecture

The server is decomposed into logical directory modules under `server/` to avoid monolith files.

### Decomposed Server Modules
- **`server/stripe/`**: `client.ts` (Stripe init), `checkouts.ts`, `subscriptions.ts`, `coupons.ts`.
- **`server/learning/`**: `extraction.ts`, `quality.ts`, `categories.ts`, `dedup.ts`.
- **`server/emailPreview/`**: `builder.ts`, `templates.ts`.
- **`server/routers/`**: tRPC routers are split into sub-directories (e.g., `server/routers/review/`, `server/routers/affiliate/`).

### Core Backend Services
- **Logging**: Powered by **Pino**. All `console.log/warn/error` have been replaced with structured `logger` calls: `logger.info({ data }, "message")`.
- **Migrations**: Database migrations are handled via Drizzle. Startup migrations (raw SQL) were extracted from `server/db/core.ts` into `drizzle/0044_startup_migrations_extraction.sql`.
- **Crons**: `server/cronScheduler.ts` manages scheduled tasks, including the new **Stale Pipeline Lock Recovery** (`server/stalePipelineLockRecovery.ts`) which resets stuck letters every 15 minutes.

---

## tRPC Procedure Inventory

Mounted at `/api/trpc`. Main router at `server/routers/index.ts`.

### `letters.*`
| Procedure | Access | Description |
|-----------|--------|-------------|
| `letters.submit` | subscriber | Triggers 4-stage AI pipeline. |
| `letters.clientApprove` | subscriber | Final approval from subscriber (approve & send). |
| `letters.clientRequestRevision` | subscriber | Subscriber requests changes (limited to 5 per letter). |

### `review.*`
| Procedure | Access | Description |
|-----------|--------|-------------|
| `review.claim` | attorney | Attorney claims letter for review. |
| `review.approve` | attorney | Final attorney approval, generates PDF. |
| `review.saveEdit` | attorney | Saves `attorney_edit` version. |

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Role-based accounts (subscriber, employee, attorney, admin). |
| `letter_requests` | Core entity; tracks status from `submitted` to `sent`. |
| `letter_versions` | Immutable history of drafts and edits. |
| `pipeline_lessons` | RAG data for recursive learning. |
| `document_analyses` | Results from the free AI analyzer. |

---

## Status Machine (Letter Lifecycle)

`submitted` → `researching` → `drafting` → `generated_locked`  
`generated_locked` → (Paywall/Subscription) → `pending_review`  
`pending_review` → `under_review` → `approved`  
`approved` → `client_approval_pending` → `client_approved` → `sent`  

*Loopbacks:* `needs_changes`, `rejected`, `client_revision_requested`.
