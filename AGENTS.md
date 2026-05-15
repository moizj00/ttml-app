<!-- From: /workspaces/ttml-app/AGENTS.md -->
# AGENTS.md — Talk to My Lawyer (TTML)

> **Purpose:** Canonical reference for AI coding agents working on this codebase. Read this first before making any changes.
> **Language:** All code, comments, and documentation are in English.
> **Last updated:** 2026-05-15

---

## Documentation Index

| Document | Purpose | When to read |
|----------|---------|-------------|
| **`AGENTS.md`** (this file) | Canonical agent reference — tech stack, conventions, gotchas, env vars | **Always read first** |
| [`README.md`](README.md) | Human onboarding — quick start, deploy overview | When you need human-facing context |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Full architecture — schema, routes, status machine, module map | When implementing features |
| [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md) | Developer workflow, conventions, common pitfalls | When writing code |
| [`docs/PIPELINE_ARCHITECTURE.md`](docs/PIPELINE_ARCHITECTURE.md) | AI pipeline deep-dive — stages, RAG, resilience, n8n, LangGraph | When working on pipeline code |
| [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md) | Pre-deployment checklist, account provisioning, env matrix | When deploying |
| [`docs/FEATURE_MAP.md`](docs/FEATURE_MAP.md) | Comprehensive feature inventory (Phases 1–110+) | When scoping features |
| [`docs/ROLE_AREA_MATRIX.md`](docs/ROLE_AREA_MATRIX.md) | Full access matrix by role | When changing auth/routes |
| [`shared/pricing.ts`](shared/pricing.ts) | Single source of truth for all pricing | Never hardcode prices |
| [`shared/types/letter.ts`](shared/types/letter.ts) | Letter status machine — `ALLOWED_TRANSITIONS` | Never hardcode status strings |

---

## 1. Project Overview

**Talk to My Lawyer (TTML)** is a full-stack legal letter platform. Subscribers submit legal situations through a multi-step intake form, an AI pipeline generates professional demand letters, and licensed attorneys review and approve them before delivery.

**Production URL:** `https://www.talk-to-my-lawyer.com`

The application is a single TypeScript monorepo with a React frontend, Express backend, PostgreSQL database, and an AI pipeline orchestrated via pg-boss. It is deployed to Railway as three services (web, worker, migrate) from a single Docker image.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 8, TypeScript 5.9, Tailwind CSS v4 (OKLCH), shadcn/ui, wouter 3.7, TanStack Query v5 |
| **Backend** | Node.js 22, Express 4.21, tRPC 11.6, TypeScript |
| **Database** | PostgreSQL (Supabase), Drizzle ORM 0.45, pg-boss (PostgreSQL-native job queue) |
| **Auth** | Supabase Auth (JWT), Row-Level Security (RLS) |
| **AI / LLM** | OpenAI `gpt-4o-search-preview` (research), Anthropic Claude Sonnet 4.5 (draft/assembly), Anthropic Claude Sonnet 4.6 (vetting), LangGraph (optional pipeline path) |
| **Payments** | Stripe (subscriptions + per-letter checkout) |
| **Email** | Resend (transactional), optional Cloudflare Email Worker fallback |
| **Rate Limiting** | Upstash Redis (`@upstash/ratelimit`) |
| **File Storage** | Cloudflare R2 (S3-compatible) |
| **Monitoring** | Sentry (frontend + backend), Pino structured logger |
| **Deployment** | Railway (Docker multi-stage build) |

---

## 3. Repository Structure

```
├── client/src/           # React SPA frontend
│   ├── App.tsx           # wouter route definitions
│   ├── pages/            # Route-level page components
│   ├── components/       # Reusable UI + feature components
│   ├── _core/hooks/      # Auth hook (note unusual _core path)
│   ├── hooks/            # Other custom hooks
│   ├── lib/              # Utilities, tRPC client, Supabase client
│   ├── contexts/         # React contexts (theme, etc.)
│   └── index.css         # Tailwind v4 theme (OKLCH colors, keyframes)
├── server/               # Express + tRPC backend
│   ├── _core/            # Server entry, env, context, tRPC setup, CORS, cookies
│   ├── routers/          # tRPC routers (auth, documents, letters, admin, etc.)
│   ├── db/               # Data access layer — ALL DB queries go here
│   ├── pipeline/         # 4-stage AI pipeline + LangGraph alternative path
│   │   ├── orchestrator.ts
│   │   ├── orchestration/
│   │   ├── research/
│   │   ├── vetting/
│   │   ├── graph/        # LangGraph StateGraph implementation
│   │   │   ├── nodes/    # research, draft, assembly, vetting, finalize, init
│   │   │   ├── memory.ts
│   │   │   ├── mode.ts   # LangGraph mode parser
│   │   │   └── state.ts
│   │   └── prompts.ts
│   ├── email/            # Email template helpers
│   ├── supabaseAuth/     # Supabase auth integration, JWT verification
│   ├── stripe/           # Stripe integration helpers
│   ├── worker.ts         # pg-boss pipeline worker entrypoint
│   ├── migrate.ts        # Drizzle migration runner
│   └── *.test.ts         # Vitest unit/integration tests (co-located)
├── shared/               # Shared types and utilities
│   ├── types/            # Zod + Drizzle inferred types, letter status machine
│   ├── pricing.ts        # Single source of truth for all pricing
│   └── utils/            # Shared utility functions
├── drizzle/              # Drizzle schema, relations, migration SQL files
│   ├── schema.ts         # Database schema definition (re-exports schema/)
│   ├── schema/           # Modular schema files (letters, billing, users, etc.)
│   └── relations.ts
├── e2e/                  # Playwright end-to-end tests
├── attached_assets/      # HTML letter templates loaded at runtime (PDF generation)
├── docs/                 # Architecture docs, runbooks, feature maps
└── scripts/              # Utility scripts (seed users, backfill, etc.)
```

---

## 4. Build & Development Commands

Package manager: **pnpm** (`packageManager` is pinned in `package.json`).

```bash
# Install dependencies
pnpm install

# Start dev server (Express + Vite HMR, port 3000)
pnpm dev

# TypeScript type check (no emit)
pnpm check        # alias: pnpm lint

# Run Vitest unit/integration tests
pnpm test

# Build for production
#   - Vite builds client → dist/public/
#   - esbuild bundles server → dist/index.js, dist/worker.js, dist/migrate.js, dist/instrument.js
pnpm build

# Run database migrations (after build)
pnpm db:migrate   # node dist/migrate.js

# Start production server (after build)
pnpm start        # node --import ./dist/instrument.js dist/index.js

# Build + migrate + start (production-like)
pnpm start:migrate

# Run Playwright E2E tests
pnpm test:e2e

# Drizzle ORM commands
pnpm db:push      # generate + migrate
pnpm db:check-migrations
pnpm db:backfill-migrations

# Format code
pnpm format       # prettier --write .
```

**Pre-deploy gate (mandatory):** `pnpm check` → `pnpm test` → `pnpm build` must all pass.

---

## 5. Code Style & Conventions

### 5.1 Prettier Configuration
Prettier is the sole formatter. Config lives in `.prettierrc`:
- `semi: true`
- `singleQuote: false` (double quotes)
- `trailingComma: "es5"`
- `printWidth: 80`
- `tabWidth: 2`, `useTabs: false`
- `arrowParens: "avoid"`
- `endOfLine: "lf"`

Run `pnpm format` before committing.

### 5.2 ESLint
A flat config lives in `eslint.config.mjs`. It is intentionally lightweight — the project relies on `tsc` for full type checking. The one custom rule enforces **Pino logger calling conventions**: the merge-object must come first (`logger.error({ err }, "message")`), not second.

### 5.3 TypeScript
- Target: `ESNext`, module resolution: `bundler`, `strict: true`
- `allowImportingTsExtensions: true` — import `.ts` extensions are allowed
- No explicit `import React` needed — Vite JSX transform handles it
- Types are inferred from Drizzle ORM: `typeof users.$inferSelect`

### 5.4 Tailwind CSS v4
- **NO `tailwind.config.js`**. Theme configuration lives in `client/src/index.css` using `@theme inline` blocks.
- Colors use **OKLCH format**, NOT hex/HSL.
- Custom CSS properties must use `H S% L%` format (space-separated, percentages on S and L), **without wrapping in `hsl()`**.
- Dark mode uses `darkMode: ["class"]` approach via `ThemeContext.tsx`.
- Always use explicit `dark:` variants when not using utility classes from config.

### 5.5 Component Styling
- shadcn/ui components live in `client/src/components/ui/`
- Variants use `class-variance-authority` (CVA)
- Icons: `lucide-react` for actions, `react-icons/si` for company logos
- Animations: custom keyframes in `index.css` (`animate-page-enter`, `hero-card-float`, `skeleton-crossfade`)

### 5.6 File Naming
- Components: PascalCase (`LetterDetail.tsx`)
- Utilities/hooks: camelCase (`useAuth.ts`, `rateLimiter.ts`)
- Tests: co-located with source, suffix `.test.ts` (e.g., `server/pipeline/stages.test.ts`)

---

## 6. Path Aliases

These aliases are configured in `vite.config.ts`, `tsconfig.json`, and `vitest.config.ts`:

| Alias | Resolves to |
|-------|-------------|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |
| `@assets/*` | `attached_assets/*` |

**Do not modify `vite.config.ts`, `tsconfig.json`, or `drizzle.config.ts`** without explicit user approval.

---

## 7. Authentication & Authorization

### 7.1 Hybrid Auth System
1. **Supabase Auth** issues and verifies JWTs.
2. On every authenticated request, the server syncs the Supabase user to the local `users` table.
3. A 30-second in-memory cache prevents excessive DB lookups.
4. JWTs are read from the `Authorization` header OR the `sb_session` cookie.

### 7.2 Roles
| Role | Route | Notes |
|------|-------|-------|
| `subscriber` | `/dashboard` | Own letters, billing, profile |
| `employee` | `/employee` | Affiliate dashboard, discount codes, commissions |
| `attorney` | `/attorney` | Review Center queue + detail, SLA dashboard |
| `admin` | `/admin` | Full platform access; requires email 2FA |

### 7.3 Admin 2FA
Admins must verify a code sent via email. The code sets a signed `admin_2fa` cookie (`server/_core/admin2fa.ts`). The `adminProcedure` middleware checks this cookie.

### 7.4 Route Protection
`ProtectedRoute` component (`client/src/components/ProtectedRoute.tsx`) enforces RBAC:
- Unauthenticated → `/login?next=<returnPath>`
- Email unverified (non-admin) → `/verify-email`
- Admin without 2FA cookie → `/admin/verify`
- Wrong role → user's own role dashboard

### 7.5 Super Admin Whitelist
Super admin emails are hard-coded in `server/supabaseAuth.ts` (`SUPER_ADMIN_EMAILS`). Admin role cannot be assigned via UI/API by design.

---

## 8. Database & ORM Patterns

### 8.1 Schema
- Schema definition: `drizzle/schema.ts` (re-exports from `drizzle/schema/*.ts`)
- Relations: `drizzle/relations.ts`
- Migration runner: `server/migrate.ts`
- Config: `drizzle.config.ts` reads `SUPABASE_DATABASE_URL` or `DATABASE_URL`, converts port `6543` (pooler) to `5432` (direct) for migrations.

### 8.2 Drizzle Conventions
- Use `text().array()` for array columns — **NOT** `array(text())`.
- Infer types: `typeof users.$inferSelect` for selects, `$inferInsert` for inserts.
- Insert schemas use `createInsertSchema` from `drizzle-zod` with `.omit` for auto-generated fields.
- **All DB operations go through `server/db/`**. Never write raw Drizzle queries in routers.

### 8.3 Connection
- Uses `pg` (node-postgres) driver.
- `DATABASE_URL` is the primary connection string.
- `SUPABASE_DIRECT_URL` (port 5432) is recommended for pg-boss queue operations.
- `dns.setDefaultResultOrder("ipv4first")` is forced at startup to avoid IPv6 issues with Supabase pooler on Railway.

---

## 9. API Patterns (tRPC)

### 9.1 tRPC v11 is the default
Almost all client-server communication uses tRPC. REST is only used for:
- `POST /api/auth/signup`, `/api/auth/login` — manual auth
- `POST /api/stripe/webhook` — Stripe webhooks (raw body)
- `POST /api/pipeline/n8n-callback` — n8n pipeline completion
- `GET /api/letters/:id/draft-pdf` — PDF streaming
- `GET /health`, `/api/health`, `/api/system/health` — health checks

### 9.2 tRPC + TanStack Query
- TanStack Query v5 **ONLY** allows object form: `useQuery({ queryKey: ['key'] })` — NOT `useQuery(['key'])`.
- Do NOT define custom `queryFn` for tRPC queries — the default fetcher is already configured.
- After mutations, ALWAYS invalidate cache by `queryKey`. Import `queryClient` from `@/lib/queryClient`.
- For variable keys, use arrays: `queryKey: ['/api/recipes', id]` NOT template strings.
- Superjson is the tRPC serializer — Dates and complex types are handled automatically.

### 9.3 Router Structure
- Entry: `server/routers.ts` → `appRouter`
- Modular routers in `server/routers/` (auth, documents, letters, profile, admin, etc.)
- Admin router is further split: `server/routers/admin/{letters,users,jobs,learning}.ts`

---

## 10. Frontend Patterns

### 10.1 Routing
- Uses **wouter** (not React Router). Use `<Route>`, `<Switch>`, `<Link>`, and `useLocation`.
- Pages use `React.lazy` with a `lazyRetry` wrapper for code splitting and chunk-reload recovery.
- New pages must be registered in `client/src/App.tsx`.

### 10.2 Key Frontend Gotchas
- `useAuth` hook lives at `client/src/_core/hooks/useAuth.ts` (not `client/src/hooks/useAuth.ts`).
- Supabase client is initialized in `client/src/lib/supabase.ts`.
- `useToast` is exported from `@/hooks/use-toast`.
- `<SelectItem>` will throw if it has no `value` prop — always provide one.
- If a form fails to submit silently, log `form.formState.errors`.
- Frontend env vars **MUST** be prefixed with `VITE_` and accessed via `import.meta.env.VITE_*` — NOT `process.env`.

### 10.3 Testing Attributes
Every interactive element needs a `data-testid` attribute following the pattern `{action}-{target}` or `{type}-{content}-{id}`.

### 10.4 Vite Manual Chunks
Heavy libraries are split into separate vendor bundles in `vite.config.ts`:
- `vendor-tiptap`, `vendor-stripe`, `vendor-supabase`, `vendor-radix`, `vendor-pdf`, `vendor-ai`, `vendor-icons`, `vendor-react`
Do not duplicate this logic.

---

## 11. AI Pipeline Architecture

### 11.1 4-Stage Pipeline (Primary Path)
The local 4-stage pipeline is the sole active production path. n8n is dormant.

| Stage | Provider | Model | Purpose | Timeout |
|-------|----------|-------|---------|---------|
| 1. Research | OpenAI | `gpt-4o-search-preview` | Web-grounded legal research | 90s |
| 2. Draft | Anthropic | `claude-sonnet-4-5-20250929` | Initial legal draft | 90s |
| 3. Assembly | Anthropic | `claude-sonnet-4-5-20250929` | Final polished letter | 90s |
| 4. Vetting | Anthropic | `claude-sonnet-4-6-20250514` | Jurisdiction accuracy, anti-hallucination | 120s |

### 11.2 Stage 1 Failover Chain
If OpenAI research fails: Perplexity `sonar-pro` → OpenAI stored prompt → Groq Llama 3.3 70B → **synthetic fallback**. Synthetic fallback sets `researchUnverified = true`.

### 11.3 LangGraph Alternative Path
An optional **LangGraph** StateGraph pipeline lives in `server/pipeline/graph/`. It is controlled by the `LANGGRAPH_PIPELINE` environment variable:

| Mode | `LANGGRAPH_PIPELINE` value | Behavior |
|------|---------------------------|----------|
| `off` | unset / `false` / `off` | Skip LangGraph; use standard 4-stage pipeline |
| `tier3` | `true` / `tier3` | Standard pipeline runs first; LangGraph is last-resort fallback |
| `primary` | `primary` | LangGraph runs first; standard pipeline is fallback |
| `canary` | `canary` | A fraction of letters (default 10%, set via `LANGGRAPH_CANARY_FRACTION`) routes to LangGraph primary; rest use standard |

Key LangGraph files:
- `server/pipeline/graph/index.ts` — StateGraph compiler and runner
- `server/pipeline/graph/nodes/` — Stage nodes (init, research, draft, assembly, vetting, finalize)
- `server/pipeline/graph/mode.ts` — Mode parser and canary routing logic
- `server/pipeline/graph/memory.ts` — Checkpoint memory for graph state

### 11.4 Simple Pipeline Mode
Setting `PIPELINE_MODE=simple` disables pg-boss queueing and runs the pipeline inline within the HTTP request. This is useful for local development or debugging but is **not recommended for production** because it blocks the request and bypasses retries.

### 11.5 Key Pipeline Files
- `server/pipeline/orchestrator.ts` — Main orchestrator
- `server/pipeline/orchestration/` — Stage-specific orchestration logic
- `server/pipeline/research/` — Research stage implementations
- `server/pipeline/vetting/` — Vetting stage implementations
- `server/pipeline/prompts.ts` — Prompt builders
- `server/pipeline/shared.ts` — Shared utilities, sanitization
- `server/pipeline/providers.ts` — Model provider factories, timeouts, pricing
- `server/queue.ts` — pg-boss job enqueueing
- `server/worker.ts` — pg-boss worker entrypoint

### 11.6 Letter Status Machine
The single source of truth is `shared/types/letter.ts` → `ALLOWED_TRANSITIONS`.

Key statuses:
- `submitted` → `researching` → `drafting` → `ai_generation_completed_hidden`
- `ai_generation_completed_hidden` = **24-hour hold** before subscriber visibility
- After hold: `letter_released_to_subscriber` → upsell/checkout → `pending_review`
- `pending_review` → `under_review` (attorney claims) → `approved` → `client_approval_pending`
- `client_approval_pending` → `client_approved` → `sent`
- `approved` is transient — auto-forwards to `client_approval_pending`
- `pipeline_failed` = terminal error status; admin can retry to `submitted`

**Do not hardcode status strings.** Import from `shared/types/letter.ts`.

### 11.7 RAG + Recursive Learning
- On attorney approval, the final letter is embedded (OpenAI `text-embedding-3-small`) and stored in `letter_versions.embedding`.
- During Stage 2 drafting, the top 3 similar approved letters (similarity ≥ 0.70) are injected into the system prompt as style examples.
- Training data is captured to GCS for Vertex AI fine-tuning when 50+ examples accumulate.
- The worker polls fine-tune statuses every 30 minutes when GCP is configured.

---

## 12. Testing Strategy

### 12.1 Unit / Integration Tests
- **Runner:** Vitest (config: `vitest.config.ts`)
- **Location:** Co-located with source files in `server/**/*.test.ts` and `server/**/*.spec.ts`
- **Setup:** `vitest.setup.ts` stubs required env vars for hermetic tests
- **Timeout:** 30s per test/hook
- **Environment:** `node`

### 12.2 E2E Tests
- **Runner:** Playwright (config: `playwright.config.ts`)
- **Location:** `e2e/*.spec.ts`
- **Browser:** Chromium (with `--no-sandbox` for CI)
- **Base URL:** `http://localhost:${PORT || 3000}`
- In CI, Playwright starts `pnpm dev` as the web server automatically.

### 12.3 Test Conventions
- Tests are named by feature/phase (e.g., `phase23.test.ts`, `phase67-pricing.test.ts`).
- `server/__tests__/` contains cross-cutting tests (status machine, sanitization, training capture).
- Mock external services (Sentry, DB, GCS) in unit tests. Live integration tests skip themselves when real credentials are absent.

### 12.4 Test Credentials (seeded via scripts)
| Role | Email | Password |
|------|-------|----------|
| subscriber | `test-subscriber@ttml.dev` | `TestPass123!` |
| employee | `test-employee@ttml.dev` | `TestPass123!` |
| attorney | `test-attorney@ttml.dev` | `TestPass123!` |
| admin | `test-admin@ttml.dev` | `TestPass123!` |

---

## 13. Environment Variables

All env vars are accessed through `server/_core/env.ts` → `ENV` object. Required vars are validated at startup in production via `validateRequiredEnv()`.

> **Canonical env var reference:** See [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md) §4 for the full matrix, sources, and notes.  
> **Quick dev template:** See [`.env.example`](.env.example).

### Required (production boot fails if missing)
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (server only) |
| `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (frontend build-time) |
| `STRIPE_SECRET_KEY` | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `ANTHROPIC_API_KEY` | Claude API (drafting, assembly, vetting) |
| `RESEND_API_KEY` | Transactional email |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Cloudflare R2 file storage |

### Required for full functionality (no validator throw, but app misbehaves without)
| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Cookie signing |
| `OPENAI_API_KEY` | Research + embeddings + OpenAI failover |
| `PERPLEXITY_API_KEY` | Research failover (Perplexity `sonar-pro`) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `SUPABASE_DIRECT_URL` | Direct PostgreSQL for pg-boss (port 5432) |

### Optional (graceful degradation when absent)
`SENTRY_DSN`, `EMAIL_WORKER_URL/SECRET`, `PDF_WORKER_URL/SECRET`, `KV_WORKER_URL/AUTH_TOKEN`, `AFFILIATE_WORKER_URL/SECRET`, `CF_BLOG_CACHE_WORKER_URL/INVALIDATION_SECRET`, `GCP_PROJECT_ID`, `GCS_TRAINING_BUCKET`, `N8N_WEBHOOK_URL/CALLBACK_SECRET`, `R2_PUBLIC_URL`, `LANGGRAPH_PIPELINE`, `LANGGRAPH_CANARY_FRACTION`, `GROQ_API_KEY`.

### Frontend Env Vars
Must be prefixed with `VITE_` to be available via `import.meta.env.VITE_*`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`

---

## 14. Deployment Architecture

### 14.1 Multi-Service Docker Image
One Docker image supports three runtime roles via `PROCESS_TYPE` env var (dispatched by `docker-entrypoint.sh`):

| Role | `PROCESS_TYPE` | Command | Purpose |
|------|----------------|---------|---------|
| Web | `web` (default) | `node --import ./dist/instrument.js dist/index.js` | Express + tRPC + static client |
| Worker | `worker` | `node --import ./dist/instrument.js dist/worker.js` | pg-boss pipeline job consumer |
| Migrate | `migrate` | `node dist/migrate.js` | One-shot Drizzle migration |

A legacy `all` mode also exists for single-container local runs (runs migrate, then worker in background, then web).

### 14.2 Railway (Production)
- Create **three services** from the same repo.
- `ttml-app` (web) receives HTTP traffic on `PORT=8080`, health check `/api/health`.
- `ttml-worker` is headless — no domain, no health check.
- `ttml-migrate` restart policy = `Never` (runs once per deploy).
- **Deploy order:** migrate first → then web + worker.

### 14.3 Docker Compose (Local / Staging)
```bash
docker compose build
docker compose run --rm migrate      # one-shot migrations
docker compose up app worker         # start web + worker
```

### 14.4 Build Process
```
pnpm build
  ├── vite build          → dist/public/ (client assets)
  ├── esbuild server      → dist/index.js (web server)
  ├── esbuild worker      → dist/worker.js (pipeline worker)
  ├── esbuild migrate     → dist/migrate.js (migration runner)
  └── esbuild instrument  → dist/instrument.js (Sentry init)
```

> **Full deployment instructions:** See [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md).

---

## 15. Security Considerations

### 15.1 Headers & Middleware
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (production only)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (production only) — restricts scripts, styles, frames
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Robots-Tag` — `noindex` on auth/dashboard/API routes, `index,follow` on public marketing pages

### 15.2 Rate Limiting
- Auth endpoints (`/api/auth/login`, `/api/auth/signup`, `/api/auth/forgot-password`): 10 req / 15 min
- General tRPC (`/api/trpc`): 60 req / 1 min
- Sensitive actions (letter submission): 5 / hour via `checkTrpcRateLimit`
- Auth rate limiting is **fail-closed** (denies if Redis is down). General rate limiting is **fail-open** (allows if Redis is down).

### 15.3 Body Size Limit
Express JSON/urlencoded limit is **12 MB** to accommodate large legal document uploads.

### 15.4 Webhook Verification
- Stripe webhooks verified via `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`.
- n8n callbacks verified via `timingSafeEqual` with `N8N_CALLBACK_SECRET`.

### 15.5 Database Security
- Supabase RLS policies protect database-level access.
- The `SUPABASE_SERVICE_ROLE_KEY` is **server-only** — never expose to the client.

### 15.6 CORS
Allowed origins: production domains (`talk-to-my-lawyer.com`, `www.talk-to-my-lawyer.com`), any `*.railway.app`, any `*.replit.dev`, `localhost` (dev only), and `CORS_ALLOWED_ORIGINS` env var.

---

## 16. Critical Gotchas for Agents

1. **DO NOT modify `package.json`, `vite.config.ts`, `tsconfig.json`, or `drizzle.config.ts`** without explicit user approval.
2. **DO NOT add a Vite proxy** — it will break the dev server.
3. **DO NOT create REST endpoints** when tRPC already covers the use case.
4. **DO NOT write raw Drizzle queries in routers** — use `server/db/`.
5. **DO NOT hardcode status strings** — import from `shared/types/letter.ts`.
6. **DO NOT skip cache invalidation** after tRPC mutations.
7. **DO NOT use `array(text())` in Drizzle** — use `text().array()`.
8. **DO NOT put non-`VITE_` env vars in frontend code**.
9. **The `useAuth` hook is at `client/src/_core/hooks/useAuth.ts`** — not `client/src/hooks/useAuth.ts`.
10. **After moving a file to a subdirectory** (`foo.ts` → `foo/index.ts`), repath ALL relative imports inside the moved file and its children. Run `pnpm check` before `pnpm test`.
11. **PDF generation happens on subscriber approval** (`clientApprove` mutation), not when the attorney submits.
12. **The pipeline worker is separate from the API** — do not call pipeline stages manually from routers.
13. **Pages must be added to `App.tsx`** — wouter does not auto-discover routes.
14. **Tailwind v4 has no `tailwind.config.js`** — theme lives in `client/src/index.css`.
15. **Pricing is in `shared/pricing.ts`** — never hardcode prices elsewhere.
16. **All intake data passes through `server/intake-normalizer.ts`** before entering the pipeline.
17. **n8n is dormant** — do NOT set `N8N_PRIMARY=true` in production without full testing.
18. **Pino logger calling convention** — merge-object first: `logger.error({ err }, "message")`. The ESLint flat config enforces this.

---

## 17. Key Documentation References

| Document | Purpose |
|----------|---------|
| `README.md` | Quick start, deploy instructions |
| `ARCHITECTURE.md` | Full architecture reference — schema, routes, status machine, module map |
| `docs/AGENT_GUIDE.md` | Developer workflow, conventions, common pitfalls |
| `docs/PIPELINE_ARCHITECTURE.md` | AI pipeline deep-dive — stages, RAG, resilience, n8n, LangGraph |
| `docs/PRODUCTION_RUNBOOK.md` | Pre-deployment checklist, account provisioning, env matrix |
| `docs/FEATURE_MAP.md` | Comprehensive feature inventory (Phases 1–110+) |
| `docs/ROLE_AREA_MATRIX.md` | Full access matrix by role |
| `CONTENT-STRATEGY.md` | SEO content strategy, blog calendar |
| `todo.md` | Feature and bug tracking |
