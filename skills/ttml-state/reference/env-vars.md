# Environment Variables — Current State

> **Last verified:** 2026-05-14 against [`server/_core/env.ts`](../../../server/_core/env.ts) (`ENV` object + `validateRequiredEnv()`).

All server-side env vars are accessed through the `ENV` object exported from `server/_core/env.ts`. Required vars are validated at startup in production via `validateRequiredEnv()` — the server refuses to boot if any are missing.

---

## 1. Required at boot (`validateRequiredEnv` throws if missing)

These are validated literally — server crashes on startup in production if any are absent.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Drizzle prefers `SUPABASE_DATABASE_URL` if set, falls back to this |
| `SUPABASE_URL` OR `VITE_SUPABASE_URL` | Supabase project URL (either name works) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key. **Server-only — never expose to client** |
| `VITE_SUPABASE_ANON_KEY` OR `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key for the frontend (compiled into Vite bundle) |
| `STRIPE_SECRET_KEY` | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | For verifying `/api/stripe/webhook` signatures |
| `ANTHROPIC_API_KEY` | Claude API — required for drafting, assembly, vetting |
| `RESEND_API_KEY` | Transactional email |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Cloudflare R2 file storage (intake attachments + PDFs) |

If any are missing in production, the server throws:
```
[Startup] Missing required environment variables: <list>
Server cannot start without these. Check your Railway / .env configuration.
```

---

## 2. Required for full functionality (no validator throw, but app misbehaves without)

`validateRequiredEnv` doesn't currently throw on these, but specific features break silently.

| Variable | What breaks without it |
|---|---|
| `JWT_SECRET` | Cookie signing for `sb_session` and `admin_2fa`. Critical for any auth flow — set this even though the validator doesn't catch it |
| `OPENAI_API_KEY` | Research stage primary (`gpt-4o-search-preview`), text embeddings for RAG, document analyzer, OpenAI failover for all Claude stages |
| `PERPLEXITY_API_KEY` | Research failover (Perplexity `sonar-pro`). If missing, Stage 1 falls straight to ungrounded Claude on OpenAI failure |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting. Auth endpoints are **fail-closed** — they reject all requests when Redis is unreachable. General tRPC rate limit is fail-open |
| `SUPABASE_DIRECT_URL` | Direct PostgreSQL on port 5432 for pg-boss (the pooler port 6543 doesn't work with pg-boss queue operations) |

---

## 3. Optional (graceful degradation when absent)

The corresponding feature is disabled or falls back to an alternative.

| Variable | Feature gated |
|---|---|
| `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Error monitoring. Without it, errors are only logged to Pino stdout |
| `EMAIL_WORKER_URL`, `EMAIL_WORKER_SECRET` | Optional Cloudflare Email Worker — used as an additional send path. Falls back to direct Resend if not set |
| `PDF_WORKER_URL`, `PDF_WORKER_SECRET` | Optional Cloudflare PDF Worker — used for HTML→PDF rendering. Falls back to local Puppeteer if not set |
| `KV_WORKER_URL`, `KV_WORKER_AUTH_TOKEN` | Optional Cloudflare KV cache worker. Caching is skipped when not configured |
| `AFFILIATE_WORKER_URL`, `AFFILIATE_WORKER_SECRET` | Cloudflare Worker for affiliate referral-link tracking. Default URL `https://refer.talktomylawyer.com`. Worker degrades gracefully when unreachable |
| `CF_BLOG_CACHE_WORKER_URL`, `CF_BLOG_CACHE_INVALIDATION_SECRET` | Cloudflare KV blog cache. Invalidation on post update |
| `R2_PUBLIC_URL` | Custom CDN domain for R2. If empty, signed URLs only |
| `GCP_PROJECT_ID`, `GCP_REGION`, `GCS_TRAINING_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS` | Vertex AI training capture + fine-tune polling. Worker skips fine-tune polling when GCP isn't configured |
| `N8N_WEBHOOK_URL`, `N8N_CALLBACK_SECRET`, `N8N_PRIMARY` | n8n alternative pipeline (dormant). Only active when `N8N_PRIMARY=true` |
| `LANGGRAPH_PIPELINE` | Worker-level LangGraph routing. Values: unset / `false` / `off` / `true` / `tier3` / `primary` / `canary` |
| `LANGGRAPH_CANARY_FRACTION` | Canary fraction for `LANGGRAPH_PIPELINE=canary` (default 10% = `0.1`) |
| `PIPELINE_MODE` | Orchestrator-level mode. `simple` / `langgraph` / unset (default) |
| `GROQ_API_KEY` | Groq `llama-3.3-70b-versatile` last-resort OSS fallback |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | (Replit Forge integration, present in `ENV` for compatibility — not actively used in Railway prod) |
| `CORS_ALLOWED_ORIGINS` | Comma-separated additional CORS origins (production domains + railway.app + replit.dev + localhost are wired in by default) |
| `PROCESS_TYPE` | Docker entrypoint role — `web` / `worker` / `migrate` / `all`. Defaults to `web` |

---

## 4. Frontend env vars (`VITE_*`)

Compiled into the client bundle at build time. **Never put server secrets here.** Access via `import.meta.env.VITE_*` — NOT `process.env`.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (frontend client) |
| `VITE_SUPABASE_ANON_KEY` OR `VITE_SUPABASE_PUBLISHABLE_KEY` | Public anon key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (server-side `STRIPE_SECRET_KEY` is mirrored to this client-safe form) |

Anything else prefixed `VITE_` will end up in the public JS bundle — only put non-secret config there.

---

## 5. The `ENV` shape (copy of current export, verified 2026-05-14)

```ts
export const ENV = {
  cookieSecret:                    process.env.JWT_SECRET ?? "",
  databaseUrl:                     process.env.DATABASE_URL ?? "",
  isProduction:                    process.env.NODE_ENV === "production",
  forgeApiUrl:                     process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey:                     process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // AI Pipeline
  anthropicApiKey:                 process.env.ANTHROPIC_API_KEY ?? "",
  openAiApiKey:                    process.env.OPENAI_API_KEY ?? "",
  perplexityApiKey:                process.env.PERPLEXITY_API_KEY ?? "",
  // n8n
  n8nWebhookUrl:                   process.env.N8N_WEBHOOK_URL ?? "",
  n8nCallbackSecret:               process.env.N8N_CALLBACK_SECRET ?? "",
  // Email
  resendApiKey:                    process.env.RESEND_API_KEY ?? "",
  resendFromEmail:                 process.env.RESEND_FROM_EMAIL ?? "noreply@talk-to-my-lawyer.com",
  emailWorkerUrl:                  process.env.EMAIL_WORKER_URL ?? "",
  emailWorkerSecret:               process.env.EMAIL_WORKER_SECRET ?? "",
  // Stripe
  stripeSecretKey:                 process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret:             process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePublishableKey:            process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "",
  // Upstash Redis
  upstashRedisRestUrl:             process.env.UPSTASH_REDIS_REST_URL ?? "",
  upstashRedisRestToken:           process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  upstashRedisUrl:                 process.env.UPSTASH_REDIS_URL ?? "",
  // Sentry
  sentryDsn:                       process.env.SENTRY_DSN ?? "",
  sentryOrg:                       process.env.SENTRY_ORG ?? "",
  sentryProject:                   process.env.SENTRY_PROJECT ?? "",
  // Cloudflare KV cache
  kvWorkerUrl:                     process.env.KV_WORKER_URL ?? "",
  kvWorkerAuthToken:               process.env.KV_WORKER_AUTH_TOKEN ?? "",
  // Cloudflare affiliate worker
  affiliateWorkerUrl:              process.env.AFFILIATE_WORKER_URL ?? "https://refer.talktomylawyer.com",
  affiliateWorkerSecret:           process.env.AFFILIATE_WORKER_SECRET ?? "",
  // Cloudflare blog cache worker
  cfBlogCacheWorkerUrl:            process.env.CF_BLOG_CACHE_WORKER_URL ?? "",
  cfBlogCacheInvalidationSecret:   process.env.CF_BLOG_CACHE_INVALIDATION_SECRET ?? "",
  // Cloudflare R2
  r2AccountId:                     process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId:                   process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey:               process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName:                    process.env.R2_BUCKET_NAME ?? "",
  r2PublicUrl:                     process.env.R2_PUBLIC_URL ?? "",
  // Cloudflare PDF worker
  pdfWorkerUrl:                    process.env.PDF_WORKER_URL ?? "",
  pdfWorkerSecret:                 process.env.PDF_WORKER_SECRET ?? "",
  // GCP / Vertex AI / GCS
  gcpProjectId:                    process.env.GCP_PROJECT_ID ?? "",
  gcpRegion:                       process.env.GCP_REGION ?? "",
  gcsTrainingBucket:               process.env.GCS_TRAINING_BUCKET ?? "",
  googleApplicationCredentials:    process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",
};
```

If you add a new env var, follow the pattern: add the key to `ENV`, default to `""` (or appropriate default), and add to `validateRequiredEnv` if mandatory. Then add a row above to keep this skill in sync.

---

## 6. Local dev quick-template

Minimum to start `pnpm dev` against a local-or-staging stack:

```
DATABASE_URL=postgresql://...
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=...
JWT_SECRET=<random 32+ chars>
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
RESEND_API_KEY=re_...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=ttml-dev
PIPELINE_MODE=simple                # optional — skips pg-boss for local e2e
```

For the full production matrix, see [`docs/PRODUCTION_RUNBOOK.md`](../../../docs/PRODUCTION_RUNBOOK.md) §4.

---

**Sources read:** `server/_core/env.ts` (complete file), `AGENTS.md` §13, `CLAUDE.md` (env table).
