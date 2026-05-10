# TTML Production Runbook — talk-to-my-lawyer.com

**Status as of 2026-05-07:** Active. Database migrated to Supabase project `uqkqathpcthzuqhwraco`. Custom migrations and RLS policies applied.

> **For tech stack overview:** See [`AGENTS.md`](../AGENTS.md) §2  
> **For build commands:** See [`AGENTS.md`](../AGENTS.md) §4  
> **For architecture:** See [`ARCHITECTURE.md`](../ARCHITECTURE.md)

This doc is the checklist for taking this app from current state → live on `talk-to-my-lawyer.com`. Work top-to-bottom; later sections depend on earlier ones.

---

## 1. Code-readiness gate (must pass before deploy)

CLAUDE.md mandates `pnpm check` → `pnpm test` → `pnpm build` all green pre-deploy.

| Gate | Command |
|---|---|
| TypeScript | `pnpm check` |
| Tests | `pnpm test` |
| Build | `pnpm build` |

---

## 2. Accounts to provision

Each row = one external service.

| # | Service | Plan | What you'll get | Used for |
|---|---|---|---|---|
| 1 | **Supabase** | Pro ($25/mo) | Project URL, anon key, service-role key, DB connection string | Auth, Postgres DB, storage |
| 2 | **Stripe** | Standard (2.9% + 30¢) | Secret key, publishable key, webhook signing secret, 3 prices | Payments ($299/letter, $299/mo, $2,400/yr per `shared/pricing.ts`) |
| 3 | **Anthropic** | Build tier | API key | Claude vetting, drafting fallback, agentic letter assembly |
| 4 | **OpenAI** | Pay-as-you-go | API key | Primary drafting model + lesson embeddings |
| 5 | **Perplexity** | Pro API | API key | Sole research provider — hard fail if missing |
| 6 | **Resend** | Pro ($20/mo, needed for `talk-to-my-lawyer.com` sender) | API key, verified domain | Transactional email |
| 7 | **Cloudflare** | Free (R2) | R2 bucket + access key/secret | Attachments, optional storage |
| 8 | **Upstash** | Pay-as-you-go (free tier OK to start) | Redis REST URL + token | Rate limiting (fail-open) |
| 9 | **Sentry** | Team ($26/mo) — optional | DSN, org slug, project slug | Error monitoring |
| 10 | **Railway** | Hobby ($5/mo) or Pro ($20/mo) | Project, 3 services (web, worker, migrate), domain attachment | Hosting |
| 11 | **GCP** (optional) | Pay-as-you-go | Vertex AI + GCS bucket + service-account JSON | Fine-tuning pipeline — leave blank to skip |
| 12 | **Domain registrar** for `talk-to-my-lawyer.com` | already owned? | DNS access | Pointing apex + subdomains to Railway |

**Minimum viable ship:** rows 1–6, 8, 10 + your domain registrar = ship. Rows 7, 9, 11 can come later.

---

## 3. Domain setup — `talk-to-my-lawyer.com`

### 3a. Apex + www → Railway
1. In Railway, deploy first (§5), get the auto-generated `*.up.railway.app` URL.
2. In Railway → service → Settings → Networking → **Add Custom Domain** → `talk-to-my-lawyer.com` and `www.talk-to-my-lawyer.com`. Railway shows you target records.
3. In your registrar's DNS (or Cloudflare DNS if you use them as nameservers):
   - Apex: ALIAS/ANAME (or A) → Railway target
   - `www`: CNAME → Railway target
4. Wait for Railway to flip to "Active" (issues Let's Encrypt cert automatically). Test `https://talk-to-my-lawyer.com/api/health`.

### 3b. Resend sender domain
Resend needs DNS proof you control the domain before it'll send mail from `noreply@talk-to-my-lawyer.com` (the default in `server/_core/env.ts`).

In Resend → Domains → Add `talk-to-my-lawyer.com`. They show 3 records:
- `MX` for `send.talk-to-my-lawyer.com` → `feedback-smtp.<region>.amazonses.com`
- `TXT` for `send.talk-to-my-lawyer.com` → SPF (`v=spf1 include:amazonses.com ~all`)
- `TXT` for `resend._domainkey.talk-to-my-lawyer.com` → DKIM key

Add all three at the registrar. Click "Verify" in Resend after ~10 min.

### 3c. (Optional) Stripe webhook subdomain
Not strictly needed — the webhook lives at `https://talk-to-my-lawyer.com/api/stripe/webhook`. Skip subdomain.

### 3d. (Optional) Affiliate worker subdomain
`server/_core/env.ts` defaults to `https://refer.talktomylawyer.com` (no hyphens). If you keep that worker, add a CNAME `refer` → Cloudflare Worker. Otherwise unset `AFFILIATE_WORKER_URL`.

---

## 4. Env-var matrix

This is the source of truth. Both `.env` (dev) and Railway service env (prod) get **the same keys** — just different values.

> **Code consumption & validation:** See [`server/_core/env.ts`](../server/_core/env.ts)  
> **Quick dev template:** See [`.env.example`](../.env.example)

### Required (server boot fails without these in production — see `validateRequiredEnv` in `server/_core/env.ts`)

| Var | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (pooler, port 6543) | URL-encode the password |
| `SUPABASE_URL` | Supabase → Settings → API | Same value also as `VITE_SUPABASE_URL` |
| `VITE_SUPABASE_URL` | mirror of above | Frontend build-time access |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role | **Server only — never expose to client** |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public | Frontend build-time |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret | `sk_live_...` for prod |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint → Signing secret | After creating webhook (§5d) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | `sk-ant-...` |
| `RESEND_API_KEY` | resend.com → API Keys | `re_...`. Tied to verified domain (§3b) |
| `R2_ACCOUNT_ID` | Cloudflare → R2 → API → Account ID |  |
| `R2_ACCESS_KEY_ID` | Cloudflare → R2 → API → Manage R2 API tokens → Create | Scope: Object R/W on the bucket |
| `R2_SECRET_ACCESS_KEY` | (returned with key id, only shown once) |  |
| `R2_BUCKET_NAME` | name you gave the bucket (suggest `ttml-attachments`) |  |

### Required for full functionality (no validator throw, but app misbehaves without them)

| Var | Source |
|---|---|
| `JWT_SECRET` | generate: `openssl rand -hex 32` |
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `PERPLEXITY_API_KEY` | perplexity.ai → API |
| `RESEND_FROM_EMAIL` | `noreply@talk-to-my-lawyer.com` (default in code) |
| `UPSTASH_REDIS_REST_URL` | upstash.com → Redis DB → REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | same console |
| `UPSTASH_REDIS_URL` | same console (rediss:// form) |
| `SUPABASE_DIRECT_URL` | Supabase → Settings → Database → Connection string (direct, port 5432) — pg-boss needs direct, not pooled |

### Optional (unset = feature degrades or skips — safe defaults)

`SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `EMAIL_WORKER_URL/SECRET`, `KV_WORKER_URL/AUTH_TOKEN`, `AFFILIATE_WORKER_URL/SECRET`, `CF_BLOG_CACHE_WORKER_URL/INVALIDATION_SECRET`, `PDF_WORKER_URL/SECRET`, `GCP_PROJECT_ID`, `GCP_REGION`, `GCS_TRAINING_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS`, `N8N_WEBHOOK_URL`, `N8N_CALLBACK_SECRET`, `N8N_PRIMARY`, `R2_PUBLIC_URL`.

### Frontend-only env vars (must be prefixed with `VITE_`)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`

---

## 5. Deploy to Railway

Per `railway.toml`, the repo produces **one Docker image** with three runtime modes selected by `PROCESS_TYPE`. You create three Railway services from the same repo, each with a different `PROCESS_TYPE`.

> **Full deployment architecture:** See [`AGENTS.md`](../AGENTS.md) §14.

### 5a. Create Railway project + 3 services
1. Railway → New Project → Deploy from GitHub repo.
2. Service 1 — **`web`**: env `PROCESS_TYPE=web` (or omit; default). This gets the public domain.
3. Service 2 — **`worker`**: env `PROCESS_TYPE=worker`. No domain needed. Consumes pg-boss jobs.
4. Service 3 — **`migrate`**: env `PROCESS_TYPE=migrate`. One-shot per deploy.

All three pull from the same repo and the same `Dockerfile`. The `docker-entrypoint.sh` dispatches based on `PROCESS_TYPE`.

### 5b. Set env vars on each service
Paste the §4 matrix into each. The `web` service needs everything; `worker` needs DB + AI keys + Redis; `migrate` only needs `DATABASE_URL` and `SUPABASE_DIRECT_URL`. Easiest: paste full matrix to all three.

### 5c. Run migrations once
Trigger a deploy on the `migrate` service. It runs `node dist/migrate.js` and exits. Verify in logs.

### 5d. Stripe webhook (after `web` has a public URL)
1. Stripe → Developers → Webhooks → Add endpoint.
2. URL: `https://talk-to-my-lawyer.com/api/stripe/webhook`
3. Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` (plus any others `server/stripeWebhook.ts` listens for — grep that file to confirm).
4. Copy the signing secret → set `STRIPE_WEBHOOK_SECRET` on the `web` service.
5. Redeploy `web`.

### 5e. Stripe products + prices
Per `shared/pricing.ts`: $299/letter (one-time), $299/mo (recurring), $2,400/yr (recurring). Create three products with these prices in Stripe Dashboard.

### 5f. Seed admin user
The "Super Admin Whitelist" is hard-coded in `server/supabaseAuth.ts` (`SUPER_ADMIN_EMAILS`). Sign up through the app with one of those emails to claim admin. If the list is empty, edit it before deploying — admin role cannot be assigned via UI/API by design.

---

## 6. Post-deploy verification

Run these against `https://talk-to-my-lawyer.com` after deploy. All should be green before announcing.

- [ ] `GET /api/health` returns 200 (Railway health check uses `/api/health` per `railway.toml`)
- [ ] `GET /api/system/health` returns 200 with DB connectivity confirmed
- [ ] Sign up + log in via Supabase auth
- [ ] Submit a letter intake (frontend) — letter appears in admin dashboard with status `submitted`
- [ ] Worker picks up the job, status advances to `researching` → `drafting` → `ai_generation_completed_hidden`
- [ ] Free-preview email lands (24h cooling window can be force-unlocked via admin tRPC `forceFreePreviewUnlock` for testing)
- [ ] Stripe test purchase → webhook fires → letter status → `pending_review`
- [ ] Attorney review flow works end-to-end → letter `sent`
- [ ] PDF generation on client approval

---

## 7. Roles & ownership for the rest of this work

What agents can do:
- Fix remaining tsc errors
- Run `pnpm check`, `pnpm test`, `pnpm build` and report
- Author code patches for any bugs surfaced
- Update env handling, fix import paths, modify any source file
- Generate the exact Stripe webhook event list by reading `server/stripeWebhook.ts`
- Generate the exact `SUPER_ADMIN_EMAILS` list
- Audit `server/_core/index.ts` startup chain

What only you can do (account/UI/credentials):
- All of §2 (account creation)
- All of §3 (DNS — needs registrar login)
- All of §5a, 5d, 5e, 5f (Railway dashboard, Stripe dashboard, super-admin email choice)
- Pay invoices

What we can do together:
- §4 — once you give me the keys, I can validate them by booting the dev server and making test API calls.

---

## 8. Suggested execution order

1. **You:** sign up for Supabase, Stripe (test mode initially), Anthropic, OpenAI, Perplexity, Resend, Upstash, Cloudflare R2, Railway. ~1 hour total.
2. **You:** create `.env` locally with test/dev values. Send me a redacted version so I can boot the dev server.
3. **Me:** finish remaining tsc fixes, get `pnpm check` green.
4. **Me:** boot dev server with your `.env`, run `pnpm test` and Playwright e2e.
5. **Me:** fix any test failures.
6. **You:** verify Resend domain (§3b) — DNS lag, do early.
7. **Me:** `pnpm build` succeeds.
8. **You:** create Railway project + 3 services (§5a), paste env vars (§5b).
9. **You:** trigger `migrate` deploy (§5c).
10. **You:** trigger `web` + `worker` deploy.
11. **You:** add custom domain (§3a), wait for cert.
12. **You:** create Stripe webhook (§5d), copy secret to Railway, redeploy `web`.
13. **You + me:** §6 verification.
14. **You:** flip Stripe to live mode, swap test keys → live keys in Railway, redeploy.
15. **You:** announce.

---

## Appendix: minimum-blast-radius dev `.env`

If you want to boot the dev server for code work without provisioning everything yet, the absolute minimum to keep startup from hanging is:

```env
NODE_ENV=development
PORT=3000
JWT_SECRET=<openssl rand -hex 32>
DATABASE_URL=postgresql://postgres:<pw>@db.<ref>.supabase.co:6543/postgres?pgbouncer=true
SUPABASE_DIRECT_URL=postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from supabase>
VITE_SUPABASE_ANON_KEY=<from supabase>

# Test-mode keys are fine for dev:
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # use `stripe listen --print-secret` from Stripe CLI
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
PERPLEXITY_API_KEY=pplx-...

RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=onboarding@resend.dev    # use Resend's sandbox sender until §3b is done

# Real R2 OR an S3-compatible local mock; bucket must exist.
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=ttml-attachments-dev

# Upstash free tier is fine
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
UPSTASH_REDIS_URL=rediss://default:...@...upstash.io:6379
```

Everything else (Sentry, GCP, Workers, n8n) stays unset — code degrades gracefully.
