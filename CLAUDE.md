# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Talk-To-My-Lawyer (TTML) — Agent Guidelines

> **For full architecture, tech stack, module map, and status machine details, see [`ARCHITECTURE.md`](ARCHITECTURE.md). For day-to-day gotchas and conventions, see [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md).**

## Common Commands

Package manager is **pnpm** (see `packageManager` in `package.json`). Node scripts assume pnpm.

```bash
pnpm install               # install dependencies
pnpm dev                   # dev server with hot reload (tsx watch, single port)
pnpm check                 # TypeScript check — alias for `tsc --noEmit`
pnpm lint                  # same as check (no ESLint run; `tsc --noEmit`)
pnpm test                  # Vitest suite (run once, no watch)
pnpm test:e2e              # Playwright E2E suite
pnpm build                 # Vite client + esbuild server → dist/
pnpm revalidate            # full gate: tsc --noEmit && vitest run && vite build
pnpm format                # Prettier write across repo
pnpm db:push               # drizzle-kit generate && drizzle-kit migrate
pnpm db:check-migrations   # verify no pending migrations
```

### Running a single test

Vitest config is at `vitest.config.ts`. Test files use `.test.ts` suffix and are phase-numbered (e.g. `phase67-pricing.test.ts`).

```bash
pnpm vitest run server/path/to/file.test.ts     # one file
pnpm vitest run -t "name of test or describe"   # filter by name
pnpm vitest server/path/to/file.test.ts         # watch mode
```

### Validation gate (must pass before declaring done)

1. `pnpm test` — ~1300 tests across ~54 files
2. `pnpm check` — 0 TypeScript errors
3. `pnpm build` — production build must succeed
4. No regression in `ALLOWED_TRANSITIONS` (`shared/types/letter.ts`)

## Runtime Shape — Three Roles, One Image

The production deployment splits into three independently runnable roles from a **single Docker image**. Understanding this matters when editing startup code:

| Role | Script | Entry | Purpose |
|------|--------|-------|---------|
| `app` | `pnpm start:app` | `dist/index.js` (from `server/_core/index.ts`) | Express + tRPC web server, also serves the built Vite client |
| `worker` | `pnpm start:worker` | `dist/worker.js` (from `server/worker.ts`) | pg-boss worker that consumes pipeline jobs |
| `migrate` | `pnpm start:migrate` | `dist/migrate.js` (from `server/migrate.ts`) | One-shot Drizzle migration runner |

All three roles share the same `.env`. Only `app` serves HTTP. Do not call pipeline stages directly from tRPC routers — they run on the worker via pg-boss.

`start.sh` is a legacy single-container path that runs all three in one process; prefer the split deployment.

## High-Level Architecture

### Request flow

- Frontend (React 19 + Vite + wouter + TanStack Query) talks to backend almost exclusively via **tRPC v11** mounted at `/api/trpc`. REST is reserved for auth signup/login, Stripe webhooks, n8n callback, PDF streaming, and `/api/health`.
- The tRPC client (`client/src/lib/trpc.ts`) imports `AppRouter` type from the server for end-to-end type safety. **Superjson** is the serializer.
- Root router: `server/routers/index.ts` → `appRouter`, composed of sub-routers (`letters`, `review`, `admin`, `billing`, `affiliate`, `documents`, `blog`, `auth`, `system`).
- Access is gated by tRPC middleware procedures: `subscriberProcedure`, `attorneyProcedure`, `adminProcedure` (the last also requires 2FA cookie). See `skills/architectural-patterns/rbac_enforcement.md`.

### Letter lifecycle (the core domain)

The status machine in `shared/types/letter.ts` → `ALLOWED_TRANSITIONS` is the **single source of truth**. Simplified:

```text
submitted → researching → drafting → generated_locked [PAYWALL]
                                          ↓ (Stripe payment or subscription)
                                     pending_review → under_review → approved (transient)
                                                                   → rejected / needs_changes → submitted
approved → client_approval_pending → client_approved → sent
                                   → client_revision_requested → pending_review
pipeline_failed → submitted (admin retry)
```

- `generated_locked` is the **paywall** — subscriber sees a blurred preview until Stripe confirms payment. Never skip this state.
- `approved` is transient — auto-forwards to `client_approval_pending`.
- Admin can force any transition with `force=true` (bypasses the map).

### AI pipeline (4 stages, in `server/pipeline/orchestrator.ts`)

1. **Research** — Perplexity `sonar-pro` (Claude Opus fallback if key missing)
2. **Drafting** — Claude Opus (uses RAG examples from prior attorney-approved letters)
3. **Assembly** — Claude Opus (polish into formal legal letter)
4. **Vetting** — Claude Sonnet (anti-hallucination, citation check)

Attorney edits feed the **recursive learning system**: edits are extracted into `pipeline_lessons` and injected into future prompts. n8n is a dormant alternative path, only active when `N8N_PRIMARY=true`.

### Data layer

- Drizzle ORM over Supabase PostgreSQL. Schema in `drizzle/schema.ts`, relations in `drizzle/relations.ts`.
- **All DB access goes through `server/db/`** — semantic functions, not raw queries in routers.
- Array columns: use `text().array()`, NOT `array(text())`.
- Drizzle config reads `SUPABASE_DATABASE_URL` or `DATABASE_URL`.

### Auth

Hybrid: Supabase Auth issues JWTs; server syncs user to local `users` table on every authenticated request (30-second in-memory cache). JWT is read from `Authorization` header or `sb_session` httpOnly cookie. Admin 2FA uses a signed `admin_2fa` cookie (`server/_core/admin2fa.ts`). Row-Level Security is enabled at the DB.

## Core Architectural Invariants

All modifications must respect these patterns. Detailed enforcement rules live in `skills/architectural-patterns/`.

1. **Mandatory Attorney Review** — Every AI-generated letter must be reviewed by an attorney. The `ai_draft` version is immutable; always create a new `attorney_edit` version. (`skills/architectural-patterns/mandatory_attorney_review.md`)
2. **Strict Status Machine** — All transitions validated against `ALLOWED_TRANSITIONS` in `shared/types/letter.ts`. No skipping states. (`skills/architectural-patterns/strict_status_machine.md`)
3. **RBAC Enforcement** — Access gated by tRPC middleware. Always verify `userRole`. (`skills/architectural-patterns/rbac_enforcement.md`)
4. **Super Admin Whitelist** — Hard-coded in `server/supabaseAuth.ts`. Not modifiable via UI or API. (`skills/architectural-patterns/super_admin_whitelist.md`)
5. **Attorney Promotion Flow** — Only super admins can promote to attorney; active subscribers cannot be promoted.
6. **Session Refresh** — Role changes take effect immediately via `invalidateUserCache()` and frontend `refetchOnWindowFocus`.
7. **Payment Gate** — Full letter content locked at `generated_locked` until payment, with server-side truncation AND frontend blurring. (`skills/architectural-patterns/payment_gate.md`)

## Pre-Change Checklist

Before making any changes, consult:

- **Schema**: `drizzle/schema.ts`
- **State transitions**: `shared/types/letter.ts` (`ALLOWED_TRANSITIONS`)
- **Role verification**: `server/routers/` (tRPC procedure guards)
- **AI pipeline**: `server/pipeline/orchestrator.ts`
- **Auditability**: `logReviewAction` writes to `review_actions` table
- **Side effects**: Emails, payments, RAG, training data
- **Super admin whitelist**: `server/supabaseAuth.ts`
- **Entitlements**: Atomic usage claim for letter creation
- **Pricing**: `shared/pricing.ts` (NEVER hardcode prices — Stripe amounts are in cents)

## Non-Obvious Conventions (often tripped on)

- **Path aliases**: `@/*` → `client/src/*`, `@shared/*` → `shared/*`, `@assets/*` → `attached_assets/*`. Defined in `vite.config.ts`, `tsconfig.json`, `components.json`.
- **`useAuth` hook lives at `client/src/_core/hooks/useAuth.ts`** — note the `_core` directory, not `client/src/hooks/`.
- **Tailwind CSS v4, not v3.** There is no `tailwind.config.js`; config lives in `client/src/index.css` via `@theme inline`. Colors are OKLCH. Custom CSS properties use space-separated `H S% L%` (no `hsl()` wrapper).
- **Do NOT `import React`** — Vite's JSX transformer handles it.
- **Interactive elements need `data-testid`** — pattern `{action}-{target}` or `{type}-{content}-{id}`.
- **Frontend env vars must be `VITE_*`** and read via `import.meta.env` — not `process.env`.
- **Express body limit is 12MB** to accept legal document uploads.
- **Pages use `React.lazy` with a `lazyRetry` wrapper**; new pages must be registered in `client/src/App.tsx` (wouter routes).
- **All intake data passes through `server/intake-normalizer.ts`** before the pipeline.
- **PDF generation triggers on subscriber approval** (`clientApprove`), not attorney submission.

**Note to agent**: Prioritize adherence to these guidelines. If a task conflicts with them, flag it for review and explain the conflict.
