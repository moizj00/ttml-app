# TTML Agent Guide — Developer Workflow & Gotchas

> **Last updated:** April 12, 2026  
> **Status:** Canonical — authoritative reference for all agents and developers

> **Purpose:** This document covers developer workflow, conventions, gotchas, and common pitfalls when working on the TTML codebase. For architecture, tech stack, module map, and status machine, see [`ARCHITECTURE.md`](../ARCHITECTURE.md).

---

## 1. CRITICAL GOTCHAS — READ THESE FIRST

### 1.1 DO NOT MODIFY THESE FILES (unless absolutely necessary)
- `package.json` — ask user before changing scripts. Use packager tool for dependencies.
- `vite.config.ts` — aliases, chunks, and plugins are pre-configured. Do NOT add a proxy.
- `server/_core/vite.ts` — handles dev/prod server integration.
- `drizzle.config.ts` — pre-configured for Supabase PostgreSQL.
- `tsconfig.json` — path aliases are set.

### 1.2 Path Aliases (must be consistent across all config)
| Alias | Resolves to | Where defined |
|-------|------------|---------------|
| `@/*` | `client/src/*` | vite.config.ts, tsconfig.json, components.json |
| `@shared/*` | `shared/*` | vite.config.ts, tsconfig.json |
| `@assets/*` | `attached_assets/*` | vite.config.ts |

### 1.3 Tailwind CSS v4 — NOT v3
- There is NO `tailwind.config.js`. Configuration lives in `client/src/index.css` using `@theme inline` blocks.
- Colors use OKLCH format, NOT hex/HSL.
- The index.css has `red` placeholder comments — every instance must be replaced with real colors.
- Custom CSS properties for Tailwind must use `H S% L%` format (space-separated, percentages on S and L), WITHOUT wrapping in `hsl()`.

### 1.4 Status Machine

See `ARCHITECTURE.md` for the full status machine diagram. The source of truth is `shared/types/letter.ts` → `ALLOWED_TRANSITIONS`.

**GOTCHA:** `generated_locked` is the PAYWALL status. The subscriber sees a blurred preview. They must pay (via Stripe checkout) to move to `pending_review`. Never skip this state.

### 1.5 tRPC — NOT REST
The app uses tRPC v11 for almost all client-server communication. REST is only used for:
- `POST /api/auth/signup` and `/api/auth/login` — manual auth flows
- `POST /api/stripe/webhook` or `/api/webhooks/stripe` — Stripe webhooks
- `POST /api/pipeline/n8n-callback` — n8n pipeline completion
- `GET /api/letters/:id/draft-pdf` — PDF streaming
- `GET /api/system/health` — health checks

**GOTCHA:** TanStack Query v5 ONLY allows object form: `useQuery({ queryKey: ['key'] })` — NOT `useQuery(['key'])`.

**GOTCHA:** tRPC queries through TanStack Query should NOT define their own `queryFn` — the default fetcher is already configured.

**GOTCHA:** After mutations, ALWAYS invalidate cache by `queryKey`. Import `queryClient` from `@/lib/queryClient`. For variable keys, use arrays: `queryKey: ['/api/recipes', id]` NOT template strings.

### 1.6 Authentication Flow
Auth is a HYBRID system:
1. Supabase Auth handles JWT issuance and verification
2. On every authenticated request, the server syncs the Supabase user to the local `users` table
3. A 30-second in-memory cache prevents excessive DB lookups
4. JWTs are read from the `Authorization` header OR `sb_session` cookie

**Admin 2FA:** Admins must verify a code sent via email. The code sets a signed `admin_2fa` cookie (handled in `server/_core/admin2fa.ts`). The `adminProcedure` middleware checks this cookie.

**GOTCHA:** The `useAuth` hook lives at `client/src/_core/hooks/useAuth.ts` (note the `_core` directory — unusual path).

### 1.7 Drizzle ORM Patterns
- Schema is at `drizzle/schema.ts`, relations at `drizzle/relations.ts`
- Use `text().array()` for array columns — NOT `array(text())`
- Types are inferred: `typeof users.$inferSelect` for select types, `$inferInsert` for inserts
- Insert schemas use `createInsertSchema` from `drizzle-zod` with `.omit` for auto-generated fields
- The data access layer is `server/db/` — all DB operations go through semantic functions here, not raw queries in routers
- Drizzle config reads `SUPABASE_DATABASE_URL` or `DATABASE_URL`

### 1.8 Pricing — Single Source of Truth
All pricing lives in `shared/pricing.ts`. NEVER hardcode prices anywhere.
- Single Letter: $200 one-time (1 letter)
- Monthly: $200/month (4 letters)
- Yearly: $2,000/year (4 letters/month, 2 months free)
- Paid Revision: $20 (after the first free revision)
- Affiliate discount: 20% (constant `AFFILIATE_DISCOUNT_PERCENT`)
- Stripe amounts are in CENTS (multiply by 100)

### 1.9 Environment Variables
All env vars are accessed through `server/_core/env.ts` → `ENV` object. Required vars are validated at startup in production.

**Required:**
- `DATABASE_URL` — PostgreSQL connection string
- `SUPABASE_URL` or `VITE_SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase admin key
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe
- `RESEND_API_KEY` — Email

**Optional but used:**
- `OPENAI_API_KEY` — Document analysis (GPT-4o) and RAG embeddings
- `ANTHROPIC_API_KEY` — Letter drafting/vetting (Claude)
- `PERPLEXITY_API_KEY` — Legal research
- `N8N_WEBHOOK_URL`, `N8N_CALLBACK_SECRET` — External pipeline
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — Rate limiting
- `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` — Error tracking
- `VITE_STRIPE_PUBLISHABLE_KEY` — Frontend Stripe key

**GOTCHA:** Frontend env vars MUST be prefixed with `VITE_` and accessed via `import.meta.env.VITE_*` — NOT `process.env`.

### 1.10 Frontend Gotchas
- Do NOT explicitly `import React` — Vite's JSX transformer handles it automatically.
- `useToast` is exported from `@/hooks/use-toast` (check this path if toast isn't working).
- `<SelectItem>` will throw if it has no `value` prop — always provide one.
- If a form fails to submit silently, log `form.formState.errors` — there may be validation errors on fields without visible form controls.
- Pages use `React.lazy` with a `lazyRetry` wrapper for code splitting.
- The app uses `wouter` (not React Router). Use `Link` component or `useLocation` hook.
- Every interactive element needs a `data-testid` attribute following the pattern `{action}-{target}` or `{type}-{content}-{id}`.

### 1.11 Rate Limiting
Two layers:
1. **Express middleware** (Upstash Redis): Auth endpoints = 10 req/15 min; tRPC = 60 req/1 min
2. **tRPC-level** (`checkTrpcRateLimit`): Sensitive actions like letter submission = 5/hour

If Upstash credentials are missing, rate limiting silently degrades (no crash).

### 1.12 Body Size Limit
Express is configured with `express.json({ limit: "12mb" })` to accommodate large legal document uploads.

### 1.13 Current Refactor Map (Important for Future Agents)
- Subscriber dashboard page is intentionally thin: `client/src/pages/subscriber/Dashboard.tsx`.
- Dashboard UI logic belongs in `client/src/components/subscriber/dashboard/*`.
- Subscriber letter detail page is intentionally thin: `client/src/pages/subscriber/LetterDetail.tsx`.
- Letter detail UI logic belongs in `client/src/components/subscriber/letter-detail/*`.
- Admin tRPC router is modularized at `server/routers/admin/index.ts` and composed from `server/routers/admin/{letters,users,jobs,learning}.ts`.
- Pipeline entry is `server/pipeline/orchestrator.ts`; stage-specific orchestration logic is split into `server/pipeline/orchestration/`, `server/pipeline/research/`, and `server/pipeline/vetting/`.

**GOTCHA:** Do not reintroduce monolithic page/router files unless explicitly requested by the user.

---

## 2. STYLING CONVENTIONS

- Tailwind CSS v4 with OKLCH colors defined in `client/src/index.css`
- shadcn/ui components (Radix UI based) in `client/src/components/ui/`
- Component variants via `class-variance-authority` (CVA)
- Dark mode: `darkMode: ["class"]` approach, toggled via `ThemeContext.tsx`
- Always use explicit `dark:` variants for visual properties when not using utility classes from config
- Icons: `lucide-react` for actions, `react-icons/si` for company logos
- Animations: extensive custom keyframes in index.css (`animate-page-enter`, `hero-card-float`, `skeleton-crossfade`)

---

## 3. KEY WORKFLOWS & BUSINESS LOGIC

### Letter Submission Flow
1. Subscriber fills multi-step intake form (`/submit`)
2. Server validates and normalizes intake data
3. Pipeline starts (4 stages) — subscriber sees real-time progress
4. On completion, letter enters `generated_locked` (PAYWALL)
5. Subscriber sees blurred preview, pays $200
6. Payment moves letter to `pending_review`
7. Letter appears in Attorney Review Queue
8. Attorney claims it → `under_review`
9. Attorney edits in Tiptap, submits → `approved` (transient) → `client_approval_pending`
10. Subscriber reviews, approves → `client_approved` (PDF generated) → `sent`
11. OR Subscriber requests revision (first free, then $20 each) → `client_revision_requested` → `pending_review`
12. Server generates branded PDF, sends email
13. After client approval → `sent`

### Recursive Learning System
- When attorneys edit AI drafts, the system extracts "lessons" (`server/learning/`)
- Lessons are stored in `pipeline_lessons` table with jurisdiction + letter type tags
- Future pipeline runs query active lessons and inject them into AI prompts
- Admin manages lessons at `/admin/learning`

### Affiliate System
- Employees get unique discount codes
- Subscribers can apply codes at checkout for 20% off
- Employee earns commission per code usage
- Tracked in `commission_ledger`, payouts via `payout_requests`

---

## 4. COMMON PITFALLS FOR AGENTS

1. **Don't create a new REST endpoint when tRPC already covers it.** Almost everything goes through tRPC. Only add REST for webhooks, streaming, or external callbacks.

2. **Don't skip the storage/db layer.** All DB operations go through `server/db/`. Never write raw Drizzle queries in routers.

3. **Don't hardcode status strings.** Import from `shared/types/letter.ts` → `ALLOWED_TRANSITIONS` or `STATUS_CONFIG`.

4. **Don't forget cache invalidation after mutations.** Every tRPC mutation that changes data must call `queryClient.invalidateQueries()` with the right key.

5. **Don't put non-VITE_ env vars in frontend code.** Only `VITE_` prefixed vars are available via `import.meta.env`.

6. **Don't use `array(text())` in Drizzle.** Use `text().array()` — method call, not wrapper.

7. **Don't modify the Vite proxy/config.** It handles everything. Adding a proxy will break things.

8. **Don't skip intake normalization.** All user intake data passes through `server/intake-normalizer.ts` before entering the pipeline.

9. **Don't create new pages without adding them to `App.tsx`.** Wouter routes must be registered.

10. **Don't forget `data-testid` on interactive elements.** Pattern: `{action}-{target}` or `{type}-{content}-{id}`.

11. **Don't use HSL in index.css theme vars.** Use space-separated `H S% L%` without `hsl()`.

12. **The `useAuth` hook is at `client/src/_core/hooks/useAuth.ts`.** Not `client/src/hooks/useAuth.ts`.

13. **Supabase client is initialized in `client/src/lib/supabase.ts`.** It reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

14. **tRPC client type is imported from server.** `client/src/lib/trpc.ts` imports `AppRouter` type directly from the server for end-to-end type safety.

15. **Manual chunks in Vite config.** Heavy libraries (Tiptap, Stripe, Supabase, Radix, PDFKit) are split into separate vendor bundles. Don't duplicate this.

16. **The server runs on a single port.** Express serves both the API and Vite (dev) / static files (prod). There is no separate frontend server.

17. **Superjson is the tRPC serializer.** Dates and other complex types are handled automatically.

18. **The pipeline worker is separate from the API.** `server/worker.ts` handles the pg-boss queue. Don't call pipeline stages manually from routers.

19. **PDF generation happens on subscriber approval.** `generateAndUploadApprovedPdf` is triggered when the subscriber approves the attorney's submitted draft (`clientApprove` mutation) — not when the attorney submits it.

20. **Supabase Realtime is used for live pipeline progress.** The `useLetterRealtime` hook subscribes to letter status changes.

---

## 5. TESTING

- Test files are in `server/` with `.test.ts` extension (phase-numbered: `phase23.test.ts`, `phase67-pricing.test.ts`, etc.)
- Test runner: Vitest (config at `vitest.config.ts`)
- Always add `data-testid` to new UI elements for E2E testing
- Test reports are in `test_reports/`

### Test Credentials (seeded via `scripts/seed-test-users.ts`)

| Role | Email | Password |
|------|-------|----------|
| subscriber | test-subscriber@ttml.dev | TestPass123! |
| employee | test-employee@ttml.dev | TestPass123! |
| attorney | test-attorney@ttml.dev | TestPass123! |
| admin | test-admin@ttml.dev | TestPass123! |

The seed script is idempotent — safe to run repeatedly. It resets passwords and upserts DB records on each run.

### Route Protection (ProtectedRoute)

The `ProtectedRoute` component enforces RBAC on all protected routes:
- **Unauthenticated** → redirects to `/login?next=<returnPath>`
- **Email unverified** (non-admin) → redirects to `/verify-email`
- **Admin without 2FA cookie** → redirects to `/admin/verify`
- **Wrong role** → redirects to user's own role dashboard (via `getRoleDashboard()`)

---

## 6. DEPLOYMENT

- **Platform:** Railway with Docker multi-stage builds
- **Config:** `railway.toml` defines health checks, env vars, restart policies
- **Health endpoint:** `/api/health` or `/api/system/health`
- **Build:** `npm run build` → Vite builds frontend → esbuild bundles backend
- **Start:** `node --import ./dist/sentry-init.js dist/index.js`
- **Also has:** k8s configs in `k8s/` directory (alternative deployment path)

---

## 7. SECURITY NOTES

- Stripe webhooks verified via `stripe.webhooks.constructEvent` with the webhook secret
- n8n callbacks verified via `timingSafeEqual` with `N8N_CALLBACK_SECRET`
- Admin 2FA uses signed cookies with expiration
- Rate limiting on auth (10/15min) and general API (60/min)
- Express body limit is 12MB
- CORS, CSP, HSTS, XSS protection headers set in server middleware
- Supabase RLS policies protect database-level access

For the full file structure and module map, see [`ARCHITECTURE.md`](../ARCHITECTURE.md).
