# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **For the canonical agent reference (tech stack, conventions, gotchas, env vars), see [`AGENTS.md`](AGENTS.md).**  
> **For architecture, module map, and status machine, see [`ARCHITECTURE.md`](ARCHITECTURE.md).**  
> **For developer workflow and pitfalls, see [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md).**

---

## Commands

```bash
pnpm install                       # install dependencies (Node ≥22.12, pnpm ≥10.4)
pnpm dev                           # tsx watch server/_core/index.ts — Express + Vite HMR, port 3000
pnpm check                         # tsc --noEmit — must pass before commit
pnpm test                          # vitest run — ~80 test files under server/
pnpm test -- server/foo.test.ts    # single file: pnpm test -- server/phase67-pricing.test.ts
pnpm test:e2e                      # Playwright (e2e/)
pnpm build                         # vite build + esbuild bundles (index, worker, migrate, instrument) → dist/
pnpm revalidate                    # check + test + build in one shot — preferred PR gate
pnpm db:push                       # drizzle-kit generate && migrate
pnpm db:check-migrations           # scripts/check-migrations.mjs
pnpm format                        # prettier --write .
```

**Validation gate** (run before every PR): `pnpm revalidate` (single command runs `check → test → build`).

---

## Core Architectural Invariants

Detailed enforcement rules live in `skills/architectural-patterns/`. **Never violate these.**

1. **Mandatory Attorney Review** — Every AI-generated letter must be reviewed by an attorney. The `ai_draft` letter version is immutable — always create a new `attorney_edit` version. Log all attorney actions via `logReviewAction` in `server/db/review-actions.ts`.

2. **Strict Status Machine** — All transitions validated against `ALLOWED_TRANSITIONS` in `shared/types/letter.ts`. No skipping states. Use `isValidTransition()`. Only `superAdminProcedure` paths (force transition / force unlock) may bypass. Never hardcode status strings.
   - Canonical `LETTER_STATUSES` tuple and `LetterStatus` union live in `drizzle/schema/constants.ts` — import from there for type checks and DB writes.
   - `LETTER_STATUS` key-map, `ALLOWED_TRANSITIONS`, `isValidTransition()`, and `STATUS_CONFIG` live in `shared/types/letter.ts` — import from there for transitions and UI metadata.

3. **RBAC Enforcement** — Use tRPC procedure guards. Never rely on client-side checks.
   - From `server/_core/trpc.ts`: `publicProcedure`, `protectedProcedure`, `emailVerifiedProcedure`, `adminProcedure`, `superAdminProcedure`.
   - From `server/routers/_shared.ts`: `subscriberProcedure`, `verifiedSubscriberProcedure`, `attorneyProcedure`, `employeeProcedure` (all built on `protectedProcedure` / `emailVerifiedProcedure`).
   - `adminProcedure` requires the `admin_2fa` cookie (`server/_core/admin2fa.ts`).
   - `superAdminProcedure` additionally enforces a hard-coded owner email whitelist (`HARDCODED_OWNER_EMAILS` in `server/_core/trpc.ts`) and is the **only** path permitted to skip the status machine (force transition, force free-preview unlock).

4. **Super Admin Whitelist** — Owner emails are hard-coded in `server/_core/trpc.ts` (`HARDCODED_OWNER_EMAILS`) and `server/supabaseAuth.ts` (`SUPER_ADMIN_EMAILS`). Cannot be modified via UI or API. Do not generate any endpoint or UI to assign the `admin` role dynamically.

5. **Payment Gate** — Letter content is truncated server-side (~100 chars) in `server/routers/versions.ts` / `server/db/letter-versions.ts` when status is `generated_locked`. Transition to `pending_review` only after confirmed Stripe payment. Frontend blur via `client/src/components/LetterPaywall.tsx`.
   - **Documented exception — first-letter free preview**: If `letter_requests.is_free_preview = TRUE` AND `letter_requests.free_preview_unlock_at <= NOW()` (24h cooling window elapsed), the subscriber router (`server/routers/letters/subscriber.ts`) sets `freePreviewUnlocked = true` and `getLetterVersionsByRequestId` returns the FULL un-truncated, un-redacted `ai_draft` tagged with `freePreview: true`. The client then renders `FreePreviewViewer` (non-selectable + DRAFT watermark) instead of `LetterPaywall`. The 24h window is stamped at submit time and enforced server-side — never trust the client. This is a lead-magnet path; the only CTA inside the viewer is "Submit For Attorney Review" which routes to `/pricing` for subscription. Subsequent letters follow the normal paywall flow.
   - **Admin force-unlock override**: Admins can collapse the 24h cooling window via the `forceFreePreviewUnlock` tRPC mutation (`server/routers/admin/letters.ts`). It sets `free_preview_unlock_at = NOW()`, logs a `free_preview_force_unlock` review action, and invokes the shared dispatcher `dispatchFreePreviewIfReady` in `server/freePreviewEmailCron.ts`. The "your preview is ready" email fires immediately if the draft is already saved; if the pipeline is still running it fires the moment the draft lands (pipeline finalize in `simple.ts` / `graph/nodes/finalize.ts` / `fallback.ts` also calls the dispatcher). The dispatcher uses an atomic `UPDATE ... RETURNING` claim on `free_preview_email_sent_at` so cron, pipeline, and admin paths cannot double-send; a failed send rolls the stamp back so the cron retries. Non-free-preview letters cannot use this path — the mutation rejects with `BAD_REQUEST`.

6. **Session Refresh** — Role changes take effect via `invalidateUserCache()` + frontend `refetchOnWindowFocus`.

---

## Pre-Change Checklist

Before making any changes, check:

| Concern | File |
| ------- | ---- |
| Schema | `drizzle/schema/` (multi-file) + `drizzle/schema/constants.ts` (`LETTER_STATUSES` tuple, `LetterStatus` union) |
| Status transitions | `shared/types/letter.ts` → `ALLOWED_TRANSITIONS`, `isValidTransition()`, `STATUS_CONFIG` |
| tRPC procedure guards | `server/_core/trpc.ts` (admin / super-admin / email-verified) + `server/routers/_shared.ts` (role guards) |
| AI pipeline | `server/pipeline/orchestrator.ts` + `server/pipeline/{orchestration,research,vetting,graph,prompts}/` |
| Audit trail | `logReviewAction` → `review_actions` table (`server/db/review-actions.ts`) |
| Pricing | `shared/pricing.ts` (never hardcode: $299/letter, $299/mo, $2,400/yr) |
| Env vars | `server/_core/env.ts` → `ENV` object + `validateRequiredEnv()` |

### Refactor Landmarks

- `client/src/pages/subscriber/Dashboard.tsx` is a composition shell; keep feature UI in `client/src/components/subscriber/dashboard/`.
- `client/src/pages/subscriber/LetterDetail.tsx` is a composition shell; keep status-specific UI in `client/src/components/subscriber/letter-detail/` (the single canonical subtree — do not recreate `pages/subscriber/letter-detail/`).
- Admin router is modularized via `server/routers/admin/index.ts` and composed from `server/routers/admin/{letters,users,jobs,learning}.ts`.
- Letters router is modularized via `server/routers/letters/index.ts` and composed from `server/routers/letters/{submit,subscriber,client-approval}.ts`. The same per-feature subdirectory pattern applies to `server/routers/review/`, `server/routers/affiliate/`, and `server/routers/billing/`.
- Pipeline stages live in subdirectories: `server/pipeline/{research,vetting,orchestration,graph,prompts}/`. `VettingResult` is exported from `server/pipeline/vetting/index.ts` (not `shared/types`). Pipeline routing between the simple path, LangGraph (`graph/`), and `fallback.ts` happens in `server/pipeline/routing.ts`.
- DB layer: every router imports data-access functions from `server/db/<feature>.ts` (e.g. `letter-versions.ts`, `review-actions.ts`, `pipeline-records.ts`, `letters/`). Do not write raw Drizzle in routers.
- Avoid reintroducing monolithic route/page files unless explicitly requested.
- **Before splitting a `*.ts` file into a `*/index.ts` subdirectory, read the Module Move Checklist in [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md) §1.14** — every relative import inside the moved file shifts one level deeper, and tests that source-grep the old path break silently.

---

## Critical Gotchas

### Tailwind CSS v4 (NOT v3)

- No `tailwind.config.js` — all config lives in `client/src/index.css` under `@theme inline` blocks.
- Colors use OKLCH format. CSS property values use `H S% L%` space-separated — do NOT wrap in `hsl()`.

### tRPC vs REST

Almost all client-server calls use tRPC v11. REST is reserved for cases tRPC cannot serve (multipart uploads, raw webhook bodies, file streaming, server-rendered HTML). All REST routes are mounted from `server/_core/index.ts` via `register*Route(app)` helpers — do **not** add new REST routes inline; create a new `registerFooRoute` module.

Current REST surface, by registrar:

- `server/supabaseAuth/routes/` → `signup-login.ts`, `password.ts`, `verification.ts`, `oauth.ts`, `admin-2fa.ts` (mounted under `/api/auth/…`)
- `server/n8nCallback.ts` → `POST /api/pipeline/n8n-callback`
- `server/draftPdfRoute.ts` → `GET /api/letters/:id/draft-pdf` (streamed PDF)
- Stripe webhook (raw body parser, separate from `express.json()` middleware)
- `server/blogInternalRoutes.ts`, `sitemapRoute.ts`, `newsletterRoute.ts`, `configRoute.ts`, `clientPortalRoute.ts`, `emailPreview.ts`, `paywallEmailCron.ts`, `freePreviewEmailCron.ts`, `draftReminders.ts`, `sentryDebugRoute.ts`
- Health: `/health`, `/api/health`, plus `/health/details` and `/api/health/details`

### Pipeline routing

- `server/pipeline/routing.ts` selects between `simple.ts`, the LangGraph graph under `server/pipeline/graph/`, and `fallback.ts`.
- tRPC routers must enqueue pipeline jobs via pg-boss; `server/worker.ts` consumes them. Never call pipeline functions directly from a router.

### Infra dependencies

- **Storage** — Cloudflare R2 (`R2_*` env vars) is required at startup (`validateRequiredEnv()` in `server/_core/env.ts`); used for PDFs and uploaded documents.
- **Workers** — Optional Cloudflare Workers for email (`EMAIL_WORKER_URL`), PDF generation (`PDF_WORKER_URL`), KV cache (`KV_WORKER_URL`), blog cache (`CF_BLOG_CACHE_WORKER_URL`), and affiliate redirects (`AFFILIATE_WORKER_URL`). When unset, the server falls back to local Puppeteer / direct Resend / no cache.
- **Queue & cache** — pg-boss runs on the same Postgres for job queuing. Upstash Redis (`UPSTASH_REDIS_*`) backs `@upstash/ratelimit`.
- **Observability** — Pino (`server/instrument.ts` is preloaded at boot via the `start` script's `--import`) and Sentry (Node + React). When logging with Pino, pass the merge object first: `logger.info({ err }, "msg")` — never `logger.info("msg", err)`.
- **AI providers** — Anthropic + OpenAI + Perplexity, orchestrated via the Vercel AI SDK and LangChain/LangGraph (with the Postgres checkpointer at `@langchain/langgraph-checkpoint-postgres`). GCP/Vertex AI + GCS (`GCP_*`, `GCS_TRAINING_BUCKET`) are optional and used only by training capture / fine-tune paths.

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

---

## Key Workflows

**Letter lifecycle (primary happy path):** `submitted → researching → drafting → ai_generation_completed_hidden → letter_released_to_subscriber → attorney_review_upsell_shown → attorney_review_checkout_started → attorney_review_payment_confirmed → pending_review → under_review → approved → client_approval_pending → client_approved → sent`. Recovery edges: `pipeline_failed → submitted`, `needs_changes → submitted`, `rejected → submitted`, `client_revision_requested → pending_review`. Full map in `shared/types/letter.ts` → `ALLOWED_TRANSITIONS`.

**PDF generation** is triggered on `clientApprove` (subscriber action) — not when the attorney submits.

**Pipeline worker** (`server/worker.ts`) consumes pg-boss jobs. Do not call pipeline stages directly from tRPC routers.

**Recursive learning** (`server/learning/`): attorney edits generate lessons stored in `pipeline_lessons`, injected into future AI prompts. Managed at `/admin/learning`.

---

## Testing

Vitest; ~80 test files under `server/`. Some are phase-numbered (e.g. `phase92-langgraph-pipeline.test.ts`, `phase97-letter-lifecycle.test.ts`); others are feature-named (e.g. `attorney-review-pipeline.test.ts`, `entitlement-matrix.test.ts`, `paywall-status.test.ts`). Playwright e2e specs live under `e2e/`.

Run a single file:

```bash
pnpm test -- server/phase67-pricing.test.ts
```

Test credentials (seeded via `scripts/seed-test-users.ts`, password `TestPass123!`):
`test-subscriber@ttml.dev` / `test-employee@ttml.dev` / `test-attorney@ttml.dev` / `test-admin@ttml.dev`
