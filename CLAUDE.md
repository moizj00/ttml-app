# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **For architecture, tech stack, module map, and status machine details, see [`ARCHITECTURE.md`](ARCHITECTURE.md).**  
> **For day-to-day developer workflow, conventions, and pitfalls, see [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md).**

---

## Commands

```bash
pnpm install          # install dependencies
pnpm dev              # start dev server (port 3000, hot reload)
pnpm check            # TypeScript check (tsc --noEmit) — must pass before commit
pnpm test             # run Vitest unit suite (~1300 tests, 54 files)
pnpm test -- --reporter=verbose   # single test file: pnpm test -- server/phase23.test.ts
pnpm build            # Vite (frontend) + esbuild (backend) — must succeed before deploy
```

**Validation gate** (run before every PR): `pnpm check` → `pnpm test` → `pnpm build`

---

## Core Architectural Invariants

Detailed enforcement rules live in `skills/architectural-patterns/`. **Never violate these.**

1. **Mandatory Attorney Review** — Every AI-generated letter must be reviewed by an attorney. The `ai_draft` letter version is immutable — always create a new `attorney_edit` version. Log all attorney actions via `logReviewAction` in `server/db/review-actions.ts`.

2. **Strict Status Machine** — All transitions validated against `ALLOWED_TRANSITIONS` in `shared/types/letter.ts`. No skipping states. Use `isValidTransition()`. Only admin with `force=true` can bypass. Never hardcode status strings — import from `shared/types/letter.ts`.

3. **RBAC Enforcement** — Use tRPC procedure guards (`publicProcedure`, `protectedProcedure`, `subscriberProcedure`, `attorneyProcedure`, `adminProcedure`) from `server/_core/trpc.ts`. Never rely on client-side checks. Admin also requires 2FA (`admin_2fa` cookie via `server/_core/admin2fa.ts`).

4. **Super Admin Whitelist** — `SUPER_ADMIN_EMAILS` is hard-coded in `server/supabaseAuth.ts`. Cannot be modified via UI or API. Do not generate any endpoint or UI to assign the `admin` role dynamically.

5. **Payment Gate** — Letter content is truncated server-side (~100 chars) in `server/routers/versions.ts` when status is `generated_locked`. Transition to `pending_review` only after confirmed Stripe payment. Frontend blur via `client/src/components/LetterPaywall.tsx`.

6. **Session Refresh** — Role changes take effect via `invalidateUserCache()` + frontend `refetchOnWindowFocus`.

---

## Pre-Change Checklist

Before making any changes, check:

| Concern | File |
| ------- | ---- |
| Schema | `drizzle/schema.ts` |
| Status transitions | `shared/types/letter.ts` → `ALLOWED_TRANSITIONS` |
| tRPC procedure guards | `server/routers/` |
| AI pipeline | `server/pipeline/orchestrator.ts` |
| Audit trail | `logReviewAction` → `review_actions` table |
| Pricing | `shared/pricing.ts` (never hardcode: $200/letter, $200/mo, $2000/yr) |
| Env vars | `server/_core/env.ts` → `ENV` object |

---

## Critical Gotchas

### Tailwind CSS v4 (NOT v3)

- No `tailwind.config.js` — all config lives in `client/src/index.css` under `@theme inline` blocks.
- Colors use OKLCH format. CSS property values use `H S% L%` space-separated — do NOT wrap in `hsl()`.

### tRPC vs REST

Almost all client-server calls use tRPC v11. REST is **only** used for:

- `POST /api/auth/signup` and `/api/auth/login`
- `POST /api/stripe/webhook`
- `POST /api/pipeline/n8n-callback`
- `GET /api/letters/:id/draft-pdf` (PDF streaming)
- `GET /api/system/health`

### TanStack Query v5

- **Object form only**: `useQuery({ queryKey: ['key'] })` — NOT `useQuery(['key'])`.
- Do NOT define your own `queryFn` on tRPC queries — the default fetcher is pre-configured.
- After every mutation, invalidate cache: `queryClient.invalidateQueries({ queryKey: [...] })`.

### Drizzle ORM

- Arrays: use `text().array()` — NOT `array(text())`.
- All DB operations go through `server/db/` data access functions — never write raw Drizzle in routers.
- Drizzle config reads `SUPABASE_DATABASE_URL` or `DATABASE_URL`.

### Authentication

- Supabase Auth issues JWTs; server syncs to local `users` table on every request (30s cache).
- JWTs read from `Authorization` header OR `sb_session` httpOnly cookie.
- `useAuth` hook lives at `client/src/_core/hooks/useAuth.ts` (note the `_core` path).

### Frontend

- Do NOT `import React` — Vite's JSX transformer handles it.
- Routing: `wouter` (not React Router). Use `Link` / `useLocation`.
- Every interactive element needs `data-testid` following pattern `{action}-{target}`.
- Frontend env vars: must be prefixed `VITE_` and accessed via `import.meta.env.VITE_*`.
- Pages use `React.lazy` with `lazyRetry` wrapper — register new pages in `App.tsx`.

### Do Not Modify Without Cause

- `package.json` scripts — ask first
- `vite.config.ts` — aliases, chunks, plugins are pre-configured, do NOT add a proxy
- `server/_core/vite.ts` — dev/prod server integration
- `drizzle.config.ts` — pre-configured for Supabase PostgreSQL
- `tsconfig.json` — path aliases are set

---

## Path Aliases

| Alias | Resolves to |
| ----- | ----------- |
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |
| `@assets/*` | `attached_assets/*` |

---

## Key Workflows

**Letter lifecycle:** `submitted → researching → drafting → generated_locked → [Stripe payment] → pending_review → under_review → approved → client_approval_pending → client_approved → sent`

**PDF generation** is triggered on `clientApprove` (subscriber action) — not when the attorney submits.

**Pipeline worker** (`server/worker.ts`) consumes pg-boss jobs. Do not call pipeline stages directly from tRPC routers.

**Recursive learning** (`server/learning/`): attorney edits generate lessons stored in `pipeline_lessons`, injected into future AI prompts. Managed at `/admin/learning`.

---

## Testing

Test files: `server/*.test.ts` (phase-numbered, e.g. `phase23.test.ts`). Run a single file:

```bash
pnpm test -- server/phase67-pricing.test.ts
```

Test credentials (seeded via `scripts/seed-test-users.ts`, password `TestPass123!`):
`test-subscriber@ttml.dev` / `test-employee@ttml.dev` / `test-attorney@ttml.dev` / `test-admin@ttml.dev`
