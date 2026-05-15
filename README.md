# Talk-to-My-Lawyer

AI-powered legal letter drafting with mandatory attorney review.

> **For AI coding agents:** See [`AGENTS.md`](AGENTS.md) — the canonical agent reference covering tech stack, conventions, and critical gotchas.

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [`AGENTS.md`](AGENTS.md) | **Canonical agent reference** — tech stack, conventions, env vars, deployment |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Architecture — schema, routes, status machine, pipeline, module map |
| [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md) | Feature inventory (Phases 1–110+) |
| [`docs/PIPELINE_ARCHITECTURE.md`](docs/PIPELINE_ARCHITECTURE.md) | AI pipeline deep-dive (4-stage: OpenAI research → Claude Sonnet 4.5 draft/assembly → Claude Sonnet 4.6 vetting) |
| [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md) | Deployment checklist, account provisioning, env var matrix |
| [`docs/ROLE_AREA_MATRIX.md`](docs/ROLE_AREA_MATRIX.md) | Role-based access matrix |
| [`CONTENT-STRATEGY.md`](CONTENT-STRATEGY.md) | SEO content strategy, blog calendar |
| [`todo.md`](todo.md) | Feature and bug tracking |

---

## Quick Start

```bash
pnpm install        # install dependencies
pnpm dev            # start dev server (port 3000)
pnpm test           # run Vitest suite
pnpm check          # TypeScript check (tsc --noEmit)
```

> Full commands: See [`AGENTS.md` §4](AGENTS.md#4-build--development-commands).

---

## Tech Stack (Summary)

- **Frontend:** Vite · React 19 · Wouter · Tailwind CSS v4 · shadcn/ui
- **Backend:** Express · tRPC · Drizzle ORM
- **Database:** Supabase (PostgreSQL + RLS)
- **Auth:** Supabase Auth (JWT)
- **Payments:** Stripe
- **Email:** Resend
- **AI Pipeline:** OpenAI `gpt-4o-search-preview` → Anthropic Claude Sonnet 4.5 (draft/assembly) → Claude Sonnet 4.6 (vetting)

> Full stack details: [`AGENTS.md` §2](AGENTS.md#2-tech-stack).

---

## Deployment

### Architecture

The app is split into three independently runnable roles from a **single Docker image**:

| Role | Command | Purpose |
|------|---------|---------|
| **app** | `pnpm start:app` | Express + tRPC web server, serves the React client |
| **worker** | `pnpm start:worker` | pg-boss pipeline worker (consumes letter generation jobs) |
| **migrate** | `pnpm start:migrate` | One-shot Drizzle ORM migration runner |

**Deploy flow:**
1. Build the image (`docker build .`)
2. Run `migrate` (once, fail-fast if migrations fail)
3. Start `app` and `worker` using the same image

> Full deployment (Railway, Docker Compose, env vars): [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md).

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

> See [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md) §5 for complete Railway setup.

### Package scripts reference

| Script | Purpose |
|--------|---------|
| `pnpm start:app` | Production web server only |
| `pnpm start:worker` | Production pg-boss worker only |
| `pnpm start:migrate` | One-shot migration runner |
| `pnpm start` | Alias for web server |
| `pnpm dev` | Development server with hot reload |
| `pnpm build` | Build client (Vite) + server (esbuild) |

---

## Production Diagnosis Notes

### Free-preview notifications vs. pipeline

Current baseline commit: [`e3120277`](https://github.com/moizj00/ttml-app/commit/e31202773b256f7f2c1bf1c64b7da40732cba2e6) (`pipe`).

Strong recommendation: do **not** change the worker or AI pipeline when diagnosing missing subscriber/admin in-app notifications unless there is direct evidence that generation jobs are failing. The pipeline is responsible for generating drafts, saving `ai_draft` versions, and advancing preview-gated letters. Missing `free_preview_ready` notifications are usually part of the web/API notification path, authenticated-user mapping, frontend rendering, or Supabase schema/migration drift.

For the May 2026 production incident, the pipeline was healthy: drafts were generated, versions were saved, preview unlock worked, emails were sent, and the failing subsystem was the notification insert. The concrete drift was the production `notifications.category` check constraint rejecting `category = 'letters'`. Keep production constraints aligned with app-emitted notification categories.

Before touching pipeline code for a notification issue, verify these first:

1. `notifications` contains the expected row for the subscriber user.
2. `notifications.category` allows categories emitted by code, including `letters`, `users`, and `employee`.
3. `notifications.list` returns the row for the logged-in `ctx.user.id`.
4. The subscriber/admin layout actually renders or polls notifications.
5. Railway web logs do not show `In-app notification failed` errors.

---

## Validation Gate

After every implementation:
1. `pnpm check` — 0 TypeScript errors
2. `pnpm test` — all tests pass
3. `pnpm build` — production build succeeds
4. Verify no `ALLOWED_TRANSITIONS` regression in `shared/types/letter.ts`
