# Changelog — April 11, 2026

> This document records all changes made to the TTML codebase in the April 11 2026 session.

---

## 1. Orchestration Layer Optimizations

**Commits:** `98cf680`

### Problem
The pipeline orchestrator and all individual stages performed sequential, un-batched database writes where independent operations could be parallelized. Admin notifications were sent in serial loops. Citation revalidation logic was copy-pasted three times across the orchestrator.

### Changes

| File | Change |
|------|--------|
| `server/pipeline/research.ts` | Stage-start DB writes (`updateWorkflowJob`, `updateLetterStatus`, `logReviewAction`) parallelized with `Promise.allSettled()` |
| `server/pipeline/drafting.ts` | Same parallelization applied to stage-start side effects |
| `server/pipeline/vetting.ts` | `finalizeLetterAfterVetting` — independent writes parallelized; redundant DB reads eliminated by passing records through parameters |
| `server/pipeline/fallback.ts` | `bestEffortFallback` — 5+ sequential writes parallelized; admin notification fan-out batched |
| `server/pipeline/orchestrator.ts` | Shared `buildAndRevalidateCitations()` helper extracted to eliminate 3× code duplication; error-path DB writes (`updateWorkflowJob` + `updateLetterStatus`) parallelized |
| `server/db/notifications.ts` | `notifyAdmins` and `notifyAllAttorneys` rewritten with `Promise.allSettled()` fan-out |
| `server/services/letters.ts` | Post-enqueue and post-send side effects parallelized |
| `server/routers/billing/letters.ts` | `subscriptionSubmit` — status + review action parallelized; then email + attorney + admin notifications batched |

### Result
Zero TypeScript errors. Build clean. All pipeline stages now execute independent side effects in parallel, reducing per-letter latency.

---

## 2. Google OAuth Fix — Remove Stale `localStorage` Bearer Token

**Commits:** `27572c1`

### Problem
The tRPC client in `client/src/main.tsx` read `localStorage.getItem("sb_access_token")` on every request and sent it as an `Authorization: Bearer` header. If a stale/expired token existed in `localStorage` from a previous session, it overrode the valid `sb_session` httpOnly cookie, causing all tRPC calls to fail with an auth error. This surfaced as a "Google sign-in error on refresh."

The admin 2FA page (`Verify2FA.tsx`) also read the `localStorage` token for its fetch calls.

### Changes

| File | Change |
|------|--------|
| `client/src/main.tsx` | Removed `localStorage.getItem("sb_access_token")` from the tRPC `headers()` function. Auth is now exclusively via the `sb_session` httpOnly cookie with `credentials: "include"`. |
| `client/src/pages/admin/Verify2FA.tsx` | Removed stale `localStorage` token reads from `admin-2fa/verify` and `admin-2fa/resend` fetch calls. |

All `localStorage.removeItem()` cleanup calls (on logout, OAuth initiation, and unauthorized errors) are preserved — they correctly clear any legacy tokens that may still exist in users' browsers.

### Invariant
The `sb_session` httpOnly cookie is the **sole authoritative auth token** for all server requests. No `Authorization: Bearer` header is ever sent from the browser.

---

## 3. Google OAuth Fix — `SUPABASE_ANON_KEY` Runtime Variable

**Commits:** `6e889ce`

### Problem
`supabaseAnonKey` on the server was read from `VITE_SUPABASE_ANON_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY`. These are Vite build-time variables — they are baked into the frontend JavaScript bundle at compile time but are **not** available as server runtime environment variables on Railway. The PKCE token exchange at `GET /api/auth/callback` sends `"apikey": supabaseAnonKey` to Supabase; with an empty key, Supabase rejects the request, and the server redirects to `/login?error=server_error`.

### Changes

| File | Change |
|------|--------|
| `server/supabaseAuth/client.ts` | `supabaseAnonKey` now reads `SUPABASE_ANON_KEY` first (canonical server-side runtime var), then falls back to `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` for local dev. |
| `server/_core/env.ts` | `validateRequiredEnv()` updated to accept `SUPABASE_ANON_KEY` as the primary check. |
| `server/_core/index.ts` | Startup warning added — logs clearly if `supabaseAnonKey` is empty so future misconfigurations are caught immediately in Railway logs. |

### Required Railway Environment Variable
`SUPABASE_ANON_KEY` must be set in Railway to the Supabase project's `anon` public key.

---

## 4. Migration Startup Fix — `start.sh` + Dockerfile

**Commits:** `0fbb2a2`, `7de00e7`

### Problem
The Dockerfile `CMD` only ran `dist/index.js` (the Express server). It **never executed** `dist/migrate.js`. All 44 Drizzle migrations (0001 through 0045) were never applied to the production Supabase database. The DB was stuck on the initial schema from the first commit.

This caused two production errors:

| Error | Missing Column(s) | Migration |
|-------|-------------------|-----------|
| Google OAuth — `syncGoogleUser → upsertUser` writes `email_verified` | `email_verified` | `0005_low_pride.sql` |
| Paywall email cron — query references multiple missing columns | `initial_paywall_email_sent_at`, `submitted_by_admin`, `template_id`, `pdf_storage_path`, `archived_at`, etc. | `0036`, `0040`, `0038`, `0009`, `0003`, ... |

### Changes

| File | Change |
|------|--------|
| `start.sh` | New startup script: runs `node dist/migrate.js` first (fail-fast on error), then `exec node --import ./dist/instrument.js dist/index.js`. |
| `Dockerfile` | `CMD` changed from `["node", ..., "dist/index.js"]` to `["./start.sh"]`. Script is copied and `chmod +x`'d in the production stage. Docker `HEALTHCHECK --start-period` increased from `15s` to `90s` to accommodate migration window. |
| `railway.toml` | Added `[deploy] healthcheckTimeout = 120` to give Railway's health check time to wait for migrations + server startup. |

### Design Decision
Only one migration path is used (the `start.sh` Docker approach). There is no `preDeployCommand` in `railway.toml` — using both would risk running migrations twice on every deploy.

### Required Railway Environment Variable
`SUPABASE_DIRECT_URL` must be set to the **direct** Supabase connection URL (`postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require`). The pooler URL resolves to IPv6 on Railway (ENETUNREACH) and pgBouncer blocks DDL statements.

---

## 5. Skills Updated

All TTML-related skills were audited and updated to reflect the current architecture:

| Skill | Key Updates |
|-------|-------------|
| `ttml-data-api-expert` | Correct router structure, RBAC guards, DB module paths |
| `ttml-pipeline-expert` | Updated pipeline stages, status machine, orchestration patterns |
| `ttml-status-machine` | Complete state machine with all 15 statuses and transitions |
| `ttml-security-audit` | Correct RBAC guards, super-admin whitelist location |
| `ttml-pattern-recognizer` | Correct tech stack, project structure, status machine |
| `code-quality-analyzer` | Removed stale Next.js reference; added orchestration patterns |
| `doc-updater` | Updated skill list and tech stack references |
| `railway-deployment-expert` | Fixed health check path, Node version, added missing env vars, pg-boss worker note |
| `ttml-post-drafting-flow` | **New skill** — full post-drafting lifecycle: paywall conditions, PII redaction, payment paths, attorney review, client approval, revision logic |

---

## Summary of Files Changed

```
client/src/main.tsx                          — remove stale localStorage bearer token
client/src/pages/admin/Verify2FA.tsx         — remove stale localStorage token reads
server/supabaseAuth/client.ts                — SUPABASE_ANON_KEY runtime var
server/_core/env.ts                          — validateRequiredEnv update
server/_core/index.ts                        — startup warning for empty anonKey
server/pipeline/orchestrator.ts             — parallel error-path writes; shared citation helper
server/pipeline/research.ts                 — parallel stage-start writes
server/pipeline/drafting.ts                 — parallel stage-start writes
server/pipeline/vetting.ts                  — parallel finalizeLetterAfterVetting
server/pipeline/fallback.ts                 — parallel bestEffortFallback
server/db/notifications.ts                  — parallel notifyAdmins / notifyAllAttorneys
server/services/letters.ts                  — parallel post-enqueue/post-send side effects
server/routers/billing/letters.ts           — parallel subscriptionSubmit side effects
start.sh                                     — new startup script (migrate → server)
Dockerfile                                   — CMD → ./start.sh; start-period 90s
railway.toml                                 — healthcheckTimeout = 120
docs/ORCHESTRATION_OPTIMIZATION_PLAN.md     — optimization plan (pre-implementation)
docs/PIPELINE_ARCHITECTURE.md               — orchestration optimizations section added
STRUCTURE.md                                 — auth, migration, orchestration notes updated
skills/ttml-post-drafting-flow/SKILL.md     — new skill
skills/ttml-data-api-expert/SKILL.md        — updated
skills/ttml-pipeline-expert/SKILL.md        — updated
skills/ttml-status-machine/SKILL.md         — updated
skills/ttml-security-audit/SKILL.md         — updated
skills/ttml-pattern-recognizer/SKILL.md     — updated
skills/code-quality-analyzer/SKILL.md       — updated
skills/doc-updater/SKILL.md                 — updated
skills/railway-deployment-expert/SKILL.md   — updated
```
