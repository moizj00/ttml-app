# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **For architecture, tech stack, module map, and status machine details, see [`ARCHITECTURE.md`](ARCHITECTURE.md).**
> **For day-to-day developer workflow, conventions, and pitfalls, see [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md).**

---

## Commands

Package manager is **pnpm** (see `packageManager` in `package.json`).

```bash
pnpm install               # install dependencies
pnpm dev                   # dev server with hot reload (tsx watch, single port)
pnpm check                 # TypeScript check — tsc --noEmit
pnpm lint                  # alias for check (no ESLint run)
pnpm test                  # Vitest suite (~1300 tests, ~54 files)
pnpm test:e2e              # Playwright E2E suite
pnpm build                 # Vite client + esbuild server → dist/
pnpm revalidate            # full gate: tsc --noEmit && vitest run && vite build
pnpm format                # Prettier write across repo
pnpm db:push               # drizzle-kit generate && drizzle-kit migrate
pnpm db:check-migrations   # verify no pending migrations
```

### Running a single test

```bash
pnpm test server/path/to/file.test.ts       # one file
pnpm vitest run -t "test or describe name"  # filter by name
pnpm vitest server/path/to/file.test.ts     # watch mode
```

Test files live in `server/` with `.test.ts` suffix and are phase-numbered (e.g. `phase67-pricing.test.ts`).

**Validation gate** (must pass before declaring done): `pnpm check` → `pnpm test` → `pnpm build`. No regression in `ALLOWED_TRANSITIONS` (`shared/types/letter.ts`).

---

## Runtime Shape — Three Roles, One Image

Production splits into three independently runnable roles from a **single Docker image**. Relevant when editing startup code.

| Role | Script | Entry | Purpose |
| --- | --- | --- | --- |
| `app` | `pnpm start:app` | `dist/index.js` (from `server/_core/index.ts`) | Express + tRPC web server; also serves the built Vite client |
| `worker` | `pnpm start:worker` | `dist/worker.js` (from `server/worker.ts`) | pg-boss worker consuming pipeline jobs |
| `migrate` | `pnpm start:migrate` | `dist/migrate.js` (from `server/migrate.ts`) | One-shot Drizzle migration runner |

All three share the same `.env`. Only `app` serves HTTP. Do **not** call pipeline stages directly from tRPC routers — they run on the worker via pg-boss. `start.sh` is a legacy single-container path that runs all three in one process.

---

## High-Level Architecture

### Request flow

- Frontend (React 19 + Vite + wouter + TanStack Query) talks to backend almost exclusively via **tRPC v11** mounted at `/api/trpc`.
- REST is reserved for: `POST /api/auth/signup` · `POST /api/auth/login` · `POST /api/stripe/webhook` · `POST /api/pipeline/n8n-callback` · `GET /api/letters/:id/draft-pdf` · `GET /api/system/health`.
- `client/src/lib/trpc.ts` imports `AppRouter` type from the server for end-to-end type safety. **Superjson** is the serializer.
- Root router: `server/routers/index.ts` → `appRouter`, composed of sub-routers (`letters`, `review`, `admin`, `billing`, `affiliate`, `documents`, `blog`, `auth`, `system`).
- Access gated by tRPC middleware procedures in `server/_core/trpc.ts`: `publicProcedure`, `protectedProcedure`, `subscriberProcedure`, `attorneyProcedure`, `adminProcedure` (last requires 2FA cookie).

### Letter lifecycle (the core domain)

Status machine in `shared/types/letter.ts` → `ALLOWED_TRANSITIONS` is the **single source of truth**.

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

Attorney edits feed the **recursive learning system**: edits extracted into `pipeline_lessons` and injected into future prompts (managed at `/admin/learning`). n8n is a dormant alternative path, only active when `N8N_PRIMARY=true`.

### Data layer

- Drizzle ORM over Supabase PostgreSQL. Schema in `drizzle/schema.ts`, relations in `drizzle/relations.ts`.
- **All DB access goes through `server/db/`** — semantic functions, not raw queries in routers.
- Array columns: use `text().array()`, NOT `array(text())`.
- Drizzle config reads `SUPABASE_DATABASE_URL` or `DATABASE_URL`.

### Auth

Hybrid: Supabase Auth issues JWTs; server syncs user to local `users` table on every authenticated request (30s in-memory cache). JWT is read from `Authorization` header or `sb_session` httpOnly cookie. Admin 2FA uses a signed `admin_2fa` cookie (`server/_core/admin2fa.ts`). Row-Level Security enforced at the DB.

---

## Core Architectural Invariants

Detailed enforcement rules live in `skills/architectural-patterns/`. **Never violate these.**

1. **Mandatory Attorney Review** — Every AI-generated letter must be reviewed by an attorney. The `ai_draft` letter version is immutable — always create a new `attorney_edit` version. Log all attorney actions via `logReviewAction` in `server/db/review-actions.ts`.
2. **Strict Status Machine** — All transitions validated against `ALLOWED_TRANSITIONS` in `shared/types/letter.ts`. No skipping states. Use `isValidTransition()`. Only admin with `force=true` can bypass. Never hardcode status strings — import from `shared/types/letter.ts`.
3. **RBAC Enforcement** — Use tRPC procedure guards from `server/_core/trpc.ts`. Never rely on client-side checks. Admin also requires 2FA (`admin_2fa` cookie via `server/_core/admin2fa.ts`).
4. **Super Admin Whitelist** — `SUPER_ADMIN_EMAILS` hard-coded in `server/supabaseAuth.ts`. Cannot be modified via UI or API. Do not generate any endpoint or UI to assign the `admin` role dynamically.
5. **Attorney Promotion Flow** — Only super admins can promote to attorney; active subscribers cannot be promoted.
6. **Payment Gate** — Letter content is truncated server-side (~100 chars) in `server/routers/versions.ts` when status is `generated_locked`. Transition to `pending_review` only after confirmed Stripe payment. Frontend blur via `client/src/components/LetterPaywall.tsx`.
7. **Session Refresh** — Role changes take effect via `invalidateUserCache()` + frontend `refetchOnWindowFocus`.

---

## Pre-Change Checklist

| Concern | File |
| --- | --- |
| Schema | `drizzle/schema.ts` |
| Status transitions | `shared/types/letter.ts` → `ALLOWED_TRANSITIONS` |
| tRPC procedure guards | `server/routers/` |
| AI pipeline | `server/pipeline/orchestrator.ts` |
| Audit trail | `logReviewAction` → `review_actions` table |
| Pricing (never hardcode) | `shared/pricing.ts` — $200/letter, $200/mo, $2000/yr; Stripe in cents |
| Env vars | `server/_core/env.ts` → `ENV` object |
| Super admin whitelist | `server/supabaseAuth.ts` |
| Entitlements | Atomic usage claim for letter creation |
| Intake normalization | `server/intake-normalizer.ts` (all intake flows through here) |

---

## Critical Gotchas

### Tailwind CSS v4 (NOT v3)

- No `tailwind.config.js` — all config lives in `client/src/index.css` under `@theme inline` blocks.
- Colors use OKLCH format. CSS property values use `H S% L%` space-separated — do NOT wrap in `hsl()`.

### TanStack Query v5

- **Object form only**: `useQuery({ queryKey: ['key'] })` — NOT `useQuery(['key'])`.
- Do NOT define your own `queryFn` on tRPC queries — the default fetcher is pre-configured.
- After every mutation, invalidate cache: `queryClient.invalidateQueries({ queryKey: [...] })`.

### Frontend

- Do NOT `import React` — Vite's JSX transformer handles it.
- Routing: `wouter` (not React Router). Use `Link` / `useLocation`.
- Every interactive element needs `data-testid` following pattern `{action}-{target}` or `{type}-{content}-{id}`.
- Frontend env vars must be prefixed `VITE_` and read via `import.meta.env` — not `process.env`.
- Pages use `React.lazy` with a `lazyRetry` wrapper — register new pages in `client/src/App.tsx`.
- `useAuth` hook lives at `client/src/_core/hooks/useAuth.ts` (note the `_core` path, not `client/src/hooks/`).

### Server

- Express body limit is 12MB (legal document uploads).
- PDF generation triggers on subscriber approval (`clientApprove`) — not when the attorney submits.

### Do Not Modify Without Cause

- `package.json` scripts — ask first
- `vite.config.ts` — aliases, chunks, plugins are pre-configured; do NOT add a proxy
- `server/_core/vite.ts` — dev/prod server integration
- `drizzle.config.ts` — pre-configured for Supabase PostgreSQL
- `tsconfig.json` — path aliases are set

---

## Path Aliases

| Alias | Resolves to |
| --- | --- |
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |
| `@assets/*` | `attached_assets/*` |

Defined in `vite.config.ts`, `tsconfig.json`, and `components.json`.

---

## Testing

Unit test files: `server/**/*.test.ts` (phase-numbered). Run a single file:

```bash
pnpm test server/phase67-pricing.test.ts
```

Test credentials (seeded via `scripts/seed-test-users.ts`, password `TestPass123!`):
`test-subscriber@ttml.dev` · `test-employee@ttml.dev` · `test-attorney@ttml.dev` · `test-admin@ttml.dev`

Seed script is idempotent — safe to re-run.

---

**Note to agent**: Prioritize adherence to these guidelines. If a task conflicts with them, flag it for review and explain the conflict.
