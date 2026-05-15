# Ops & Deploy — Current State

> **Last verified:** 2026-05-14 against `package.json`, `Dockerfile` / `docker-compose.yml` / `docker-entrypoint.sh` (referenced), `AGENTS.md` §14, `docs/PRODUCTION_RUNBOOK.md` (referenced).

One Docker image, three Railway services, one Postgres on Supabase, one Redis on Upstash (for rate limiting only — pg-boss queue lives in Postgres). Build is split into client (Vite) and four esbuild server bundles.

---

## 1. Build pipeline

`pnpm build` runs four passes in sequence (see `package.json`):

```
vite build                                                   → dist/public/   (static client)
esbuild server/_core/index.ts  → dist/index.js                              (web server)
esbuild server/worker.ts        → dist/worker.js                            (pg-boss worker)
esbuild server/migrate.ts       → dist/migrate.js                           (one-shot migrations)
esbuild server/instrument.ts    → dist/instrument.js                        (Sentry init, loaded with --import)
```

All esbuild bundles target Node (`--platform=node`), use `--format=esm`, bundle dependencies (`--bundle`), externalize `@tailwindcss/vite`, `@vitejs/plugin-react`, `vite` (devDeps only — not in runtime).

Pre-deploy validation gate (mandatory): `pnpm check` → `pnpm test` → `pnpm build`.

---

## 2. Docker entrypoint

`docker-entrypoint.sh` dispatches on `PROCESS_TYPE`:

| `PROCESS_TYPE` | Command | Role |
|---|---|---|
| `web` (default) | `node --import ./dist/instrument.js dist/index.js` | Express + tRPC + static client. Listens on `PORT` (Railway sets it; defaults to 8080). Health at `/api/health` |
| `worker` | `node --import ./dist/instrument.js dist/worker.js` | pg-boss pipeline-job consumer. No HTTP listener, no health check (Railway "worker" service has no domain) |
| `migrate` | `node dist/migrate.js` | Drizzle migration runner. Exits when done. Restart policy = Never |
| `all` (legacy) | `migrate` → background `worker` → foreground `web` | Single-container local convenience mode |

The `dns.setDefaultResultOrder("ipv4first")` call is made at the very top of `server/_core/index.ts` and `server/worker.ts` (also via `--dns-result-order=ipv4first` Node flag in `pnpm start`). Required because Railway's IPv6 egress fails against Supabase pooler IPs.

---

## 3. Railway services

Three services from the same repo / Docker image, distinguished by env vars:

| Service | `PROCESS_TYPE` | Domain | Health | Restart policy |
|---|---|---|---|---|
| `ttml-app` | `web` | `talk-to-my-lawyer.com`, `www.talk-to-my-lawyer.com` | `/api/health` | Always |
| `ttml-worker` | `worker` | none | none | Always |
| `ttml-migrate` | `migrate` | none | none | Never (one-shot per deploy) |

Deploy order: `ttml-migrate` first → on success, `ttml-app` + `ttml-worker`.

`PORT` is set by Railway. Express respects the env var.

---

## 4. Local docker-compose

For local production-like runs:

```bash
docker compose build
docker compose run --rm migrate      # one-shot migrations
docker compose up app worker         # start web + worker
```

---

## 5. Health endpoints

Same data, three URLs (for proxy / load-balancer flexibility):
- `GET /health`
- `GET /api/health`
- `GET /api/system/health` (tRPC also exposes `system.healthCheck`)

Returns `{ ok: true, version, uptime }` when ready.

---

## 6. Security middleware (set in `server/_core/index.ts`)

| Header / config | Value / behaviour |
|---|---|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | Set in production only |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | Set in production only — restricts scripts, styles, frames |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `X-Robots-Tag` | `noindex` on auth/dashboard/API routes; `index,follow` on public marketing |
| Body size limit | **12 MB** for JSON + urlencoded — accommodates legal-document uploads. Larger than typical Express defaults |

### CORS allow-list

Hard-coded plus env-augmented:

- `https://talk-to-my-lawyer.com`, `https://www.talk-to-my-lawyer.com`
- Any `*.railway.app`
- Any `*.replit.dev`
- `http://localhost:*` (dev only)
- Plus comma-separated values from `CORS_ALLOWED_ORIGINS` env var

### Stripe webhook raw-body

`POST /api/stripe/webhook` is registered **before** `express.json()` so the signature check works on the raw payload. Don't reorder middleware.

---

## 7. Rate limiting

[`server/rateLimiter.ts`](../../../server/rateLimiter.ts) — Upstash Redis via `@upstash/ratelimit`:

| Scope | Limit | Failure mode |
|---|---|---|
| `/api/auth/login`, `/api/auth/signup`, `/api/auth/forgot-password` | 10 req / 15 min per IP | **Fail-closed** — denies all requests when Redis is unreachable |
| `/api/trpc/*` general | 60 req / 1 min per session | Fail-open — allows when Redis is unreachable |
| Sensitive mutations (`letters.submit`) | 5 / hour via `checkTrpcRateLimit` | Fail-open |

The auth endpoints are fail-closed deliberately — better to deny logins than to allow a brute-force attempt during a Redis outage.

---

## 8. Background jobs / cron

| Process | What it does | Schedule |
|---|---|---|
| pg-boss worker (`worker.ts`) | Consumes `runPipeline` jobs, runs the 4-stage pipeline | Continuous |
| `cronScheduler.ts` | Schedules in-process crons via `node-cron` | Continuous |
| `stalePipelineLockRecovery.ts` | Releases pipeline locks older than 15 minutes | Periodic |
| `staleReviewReleaser.ts` | Auto-releases attorney reviews that have been unclaimed too long | Periodic |
| `freePreviewEmailCron.ts` | Dispatches "your free preview is ready" emails when cooling window elapses; idempotent atomic claim on `free_preview_email_sent_at` | Every minute |
| Fine-tune poller | Polls Vertex AI fine-tune job statuses | Every 30 min when GCP configured |

---

## 9. Webhook security

- **Stripe**: `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`. Idempotency via `processed_stripe_events` table (`.onConflictDoNothing()` on event `id`).
- **n8n callback**: `timingSafeEqual` against `N8N_CALLBACK_SECRET` header `x-ttml-callback-secret`. Acknowledges with `{ received: true }` immediately, processes async.
- **Email Worker, PDF Worker, Affiliate Worker**: each uses a Bearer token from the corresponding `*_SECRET` env var on the request to the Cloudflare Worker (server → CF), and is also required on inbound responses where applicable.

---

## 10. Logging + monitoring

- **Pino structured logger** — JSON in production, `pino-pretty` in dev. Calling convention enforced by the project's ESLint flat config: merge-object first, e.g. `logger.error({ err, letterId }, "pipeline crashed")`.
- **Sentry** — server (`@sentry/node` + `server/instrument.ts`) and client (`@sentry/react` initialized in `main.tsx`). Tracing + error capture. Set via `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
- **Token usage / pipeline metrics** — stored in `workflow_jobs` rows; surfaced in `/admin/pipeline-analytics` and `/admin/quality-dashboard`.

---

## 11. Deploy procedure (high level)

1. PR is opened → CI runs `pnpm check`, `pnpm test`, `pnpm build`.
2. Merge to `main` → Railway picks up the commit.
3. Railway builds the Docker image (once) and deploys to three services.
4. `ttml-migrate` runs first — exits with code 0 on success.
5. `ttml-app` and `ttml-worker` start with the new image.
6. Health check on `/api/health` confirms the web service is up.
7. Smoke test: see [`skills/platform-e2e-verification/SKILL.md`](../../platform-e2e-verification/SKILL.md) for the full lifecycle test.

For account provisioning, env-var matrix, and pre-deploy checklist, the canonical source is [`docs/PRODUCTION_RUNBOOK.md`](../../../docs/PRODUCTION_RUNBOOK.md).

---

## 12. Specialist-skill cross-references

- Deployment readiness: [`skills-audit/corrected/ttml-deployment-readiness/SKILL.md`](../../../skills-audit/corrected/ttml-deployment-readiness/SKILL.md)
- Code review for production: [`skills-audit/corrected/ttml-code-review-qa/SKILL.md`](../../../skills-audit/corrected/ttml-code-review-qa/SKILL.md)
- E2E verification: [`skills/platform-e2e-verification/SKILL.md`](../../platform-e2e-verification/SKILL.md)

---

**Sources read:** `package.json` scripts + dependencies, `AGENTS.md` §14–§15, `CLAUDE.md`, `ARCHITECTURE.md`. `Dockerfile` / `docker-compose.yml` / `docker-entrypoint.sh` referenced — re-verify before changing deploy contract.
