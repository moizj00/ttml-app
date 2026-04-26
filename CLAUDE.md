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

5. **Payment Gate** — Letter content is truncated server-side (~100 chars) in `server/routers/versions.ts` / `server/db/letter-versions.ts` when status is `generated_locked`. Transition to `pending_review` only after confirmed Stripe payment. Frontend blur via `client/src/components/LetterPaywall.tsx`.
   - **Documented exception — first-letter free preview**: If `letter_requests.is_free_preview = TRUE` AND `letter_requests.free_preview_unlock_at <= NOW()` (24h cooling window elapsed), the subscriber router (`server/routers/letters/subscriber.ts`) sets `freePreviewUnlocked = true` and `getLetterVersionsByRequestId` returns the FULL un-truncated, un-redacted `ai_draft` tagged with `freePreview: true`. The client then renders `FreePreviewViewer` (non-selectable + DRAFT watermark) instead of `LetterPaywall`. The 24h window is stamped at submit time and enforced server-side — never trust the client. This is a lead-magnet path; the only CTA inside the viewer is "Submit For Attorney Review" which routes to `/pricing` for subscription. Subsequent letters follow the normal paywall flow.
   - **Admin force-unlock override**: Admins can collapse the 24h cooling window via the `forceFreePreviewUnlock` tRPC mutation (`server/routers/admin/letters.ts`). It sets `free_preview_unlock_at = NOW()`, logs a `free_preview_force_unlock` review action, and invokes the shared dispatcher `dispatchFreePreviewIfReady` in `server/freePreviewEmailCron.ts`. The "your preview is ready" email fires immediately if the draft is already saved; if the pipeline is still running it fires the moment the draft lands (pipeline finalize in `simple.ts` / `graph/nodes/finalize.ts` / `fallback.ts` also calls the dispatcher). The dispatcher uses an atomic `UPDATE ... RETURNING` claim on `free_preview_email_sent_at` so cron, pipeline, and admin paths cannot double-send; a failed send rolls the stamp back so the cron retries. Non-free-preview letters cannot use this path — the mutation rejects with `BAD_REQUEST`.

6. **Session Refresh** — Role changes take effect via `invalidateUserCache()` + frontend `refetchOnWindowFocus`.

---

## Pre-Change Checklist

Before making any changes, check:

| Concern | File |
| ------- | ---- |
| Schema | `drizzle/schema.ts` |
| Status transitions | `shared/types/letter.ts` → `ALLOWED_TRANSITIONS` |
| tRPC procedure guards | `server/routers/` |
| AI pipeline | `server/pipeline/orchestrator.ts` + `server/pipeline/orchestration/` + `server/pipeline/research/` + `server/pipeline/vetting/` |
| Audit trail | `logReviewAction` → `review_actions` table |
| Pricing | `shared/pricing.ts` (never hardcode: $299/letter, $299/mo, $2,400/yr) |
| Env vars | `server/_core/env.ts` → `ENV` object |

### Refactor Landmarks

- `client/src/pages/subscriber/Dashboard.tsx` is a composition shell; keep feature UI in `client/src/components/subscriber/dashboard/`.
- `client/src/pages/subscriber/LetterDetail.tsx` is a composition shell; keep status-specific UI in `client/src/components/subscriber/letter-detail/` (the single canonical subtree — do not recreate `pages/subscriber/letter-detail/`).
- Admin router is modularized via `server/routers/admin/index.ts` and composed from `server/routers/admin/{letters,users,jobs,learning}.ts`.
- Pipeline stages live in subdirectories: `server/pipeline/research/`, `server/pipeline/vetting/`, and `server/pipeline/orchestration/`. `VettingResult` is exported from `server/pipeline/vetting/index.ts` (not `shared/types`).
- Avoid reintroducing monolithic route/page files unless explicitly requested.
- **Before splitting a `*.ts` file into a `*/index.ts` subdirectory, read the Module Move Checklist in [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md) §1.14** — every relative import inside the moved file shifts one level deeper, and tests that source-grep the old path break silently.

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

**Letter lifecycle (primary path):** `submitted → researching → drafting → ai_generation_completed_hidden (24h hold) → letter_released_to_subscriber/upsell statuses → pending_review → under_review → approved → client_approval_pending → client_approved → sent`

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
