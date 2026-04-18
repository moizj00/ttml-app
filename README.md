# Talk-to-My-Lawyer

AI-powered legal letter drafting with mandatory attorney review.

## Documentation Index

| Document | Purpose |
|----------|---------|
| [`STRUCTURE.md`](STRUCTURE.md) | Primary architecture reference — schema, routes, status machine, pipeline |
| [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md) | Comprehensive feature inventory (Phases 1–86+) |
| [`docs/PIPELINE_ARCHITECTURE.md`](docs/PIPELINE_ARCHITECTURE.md) | AI pipeline deep-dive (4-stage: OpenAI Research → Opus × 2 → Sonnet vetting) |
| [`SPEC_COMPLIANCE.md`](SPEC_COMPLIANCE.md) | Spec compliance tracking |
| [`CONTENT-STRATEGY.md`](CONTENT-STRATEGY.md) | SEO content strategy, blog calendar, keyword map |
| [`todo.md`](todo.md) | Full feature and bug tracking (all phases) |

## Tech Stack

- **Frontend:** Vite · React 19 · Wouter · Tailwind CSS · shadcn/ui
- **Backend:** Express · tRPC · Drizzle ORM
- **Database:** Supabase (PostgreSQL + RLS)
- **Auth:** Supabase Auth (JWT)
- **Payments:** Stripe (subscriptions + per-letter checkout)
- **Email:** Resend (transactional, 17 templates)
- **AI Pipeline:** OpenAI `gpt-4o-search-preview` (primary research with web search; Perplexity sonar-pro optional failover) → Anthropic Claude Opus (draft + assembly) → Anthropic Claude Sonnet (vetting); local 4-stage pipeline is primary, n8n is dormant alternative

## Development

```bash
pnpm install        # install dependencies
pnpm dev            # start dev server (port 3000)
pnpm test           # run Vitest suite
pnpm tsc --noEmit   # TypeScript check
```

## Deployment

### Architecture

The app is split into three independently runnable roles from a **single Docker image**:

| Role | Command | Purpose |
|------|---------|---------|
| **app** | `pnpm start:app` | Express + tRPC web server, serves the React client |
| **worker** | `pnpm start:worker` | pg-boss pipeline worker (consumes letter generation jobs) |
| **migrate** | `pnpm start:migrate` | One-shot Drizzle ORM migration runner |

All three roles read from the same `.env` / environment variables. Only `app` receives HTTP traffic; `worker` and `migrate` are headless.

**Deploy flow:**
1. Build the image (`docker build .`)
2. Run `migrate` (once, fail-fast if migrations fail)
3. Start `app` and `worker` using the same image

### Docker Compose (local / staging)

```bash
# Build the image
docker compose build

# Run migrations (one-shot, then exits)
docker compose run --rm migrate

# Start web server + worker
docker compose up app worker

# Or start everything including migrations:
docker compose --profile ops up
```

The `migrate` service is under the `ops` profile so it doesn't run on every `docker compose up`. Run it explicitly before starting `app` and `worker`.

For production-like settings with resource limits and replica counts:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale app=3 --scale worker=2
```

### Railway (production)

Create **three Railway services** from the same GitHub repo (`moibftj/ttml-app`). All use the same Dockerfile build — only the start command differs.

| Railway Service | Start Command | Domain? | Health Check? |
|----------------|---------------|---------|---------------|
| `ttml-app` | `node --dns-result-order=ipv4first --import ./dist/instrument.js dist/index.js` | Yes (port 8080) | `/api/health` |
| `ttml-worker` | `node --dns-result-order=ipv4first --import ./dist/instrument.js dist/worker.js` | No | None |
| `ttml-migrate` | `node --dns-result-order=ipv4first dist/migrate.js` | No | None |

**Setup steps:**
1. Create all three services from the `moibftj/ttml-app` repo.
2. Set the same environment variables on all three (copy from `.env.example`).
3. Set `PORT=8080` on the `ttml-app` service.
4. Configure the start command for each (see table above).
5. Add your custom domain to `ttml-app` only — set `targetPort: 8080`.
6. On the `ttml-migrate` service, set **Restart Policy** to `Never` so it runs once per deploy and exits.
7. On `ttml-worker`, disable the health check (it's headless, no HTTP).

**Deploy order:** trigger `ttml-migrate` first. Once it exits successfully, deploy `ttml-app` and `ttml-worker`.

> **Tip:** The `railway.toml` in this repo is pre-configured for the `ttml-app` service. For worker and migrate, override the start command in the Railway dashboard — `railway.toml` only applies to the primary service.

### All-in-one mode (legacy)

For simple platforms that don't support multi-service orchestration, use `PROCESS_TYPE=all` with the `docker-entrypoint.sh` dispatcher. This runs migrations, starts the worker in the background, and then starts the web server in the foreground.

```bash
# In Dockerfile or platform config:
PROCESS_TYPE=all ./docker-entrypoint.sh
```

It works but couples all processes — a crash in the worker kills the web server too.

### Package scripts reference

| Script | Purpose |
|--------|---------|
| `pnpm start:app` | Production web server only (no migrations, no worker) |
| `pnpm start:worker` | Production pg-boss worker only |
| `pnpm start:migrate` | One-shot migration runner (exits after completion) |
| `pnpm start` | Alias for web server (same as `start:app` without IPv4 flag) |
| `pnpm start:legacy` | Migrations + web server (no worker) — legacy compatibility |
| `pnpm dev` | Development server with hot reload |
| `pnpm build` | Build client (Vite) + server (esbuild) for production |

## Validation Gate

After every implementation:
1. `pnpm test` — all ~1300 tests must pass (54 test files)
2. `pnpm tsc --noEmit` — 0 TypeScript errors
3. `pnpm build` — production build must succeed
4. Verify no `ALLOWED_TRANSITIONS` regression in `shared/types.ts`
