# TTML Agent Guide — Developer Workflow & Gotchas

> **Last updated:** May 7, 2026
> **Status:** Canonical — authoritative reference for developer workflows
> **For project overview / tech stack / env vars:** See [`AGENTS.md`](../AGENTS.md)

---

## 1. CRITICAL GOTCHAS — READ THESE FIRST

### 1.1 DO NOT MODIFY THESE FILES (unless absolutely necessary)
- `package.json` — ask user before changing scripts. Use packager tool for dependencies.
- `vite.config.ts` — aliases, chunks, and plugins are pre-configured. Do NOT add a proxy.
- `server/_core/vite.ts` — handles dev/prod server integration.
- `drizzle.config.ts` — pre-configured for Supabase PostgreSQL.
- `tsconfig.json` — path aliases are set.

> Full list of protected files: [`AGENTS.md` §16](../AGENTS.md#16-critical-gotchas-for-agents)

### 1.2 Path Aliases

| Alias | Resolves to | Where defined |
|-------|------------|---------------|
| `@/*` | `client/src/*` | vite.config.ts, tsconfig.json, components.json |
| `@shared/*` | `shared/*` | vite.config.ts, tsconfig.json |
| `@assets/*` | `attached_assets/*` | vite.config.ts |

> Full path alias docs: [`AGENTS.md` §6](../AGENTS.md#6-path-aliases)

### 1.3 Tailwind CSS v4 — NOT v3
- There is NO `tailwind.config.js`. Configuration lives in `client/src/index.css` using `@theme inline` blocks.
- Colors use OKLCH format, NOT hex/HSL.
- Custom CSS properties for Tailwind must use `H S% L%` format (space-separated, percentages on S and L), WITHOUT wrapping in `hsl()`.

> Full Tailwind conventions: [`AGENTS.md` §5.3](../AGENTS.md#53-tailwind-css-v4)

### 1.4 Status Machine

The source of truth is `shared/types/letter.ts` → `ALLOWED_TRANSITIONS`.

**GOTCHA:** Current flow uses a 24h hold before subscriber visibility: `drafting` usually transitions to `ai_generation_completed_hidden`, then to `letter_released_to_subscriber` / upsell statuses, then to `pending_review` after checkout/payment. `generated_locked` remains as a compatibility status and can still appear in legacy paths.

> Full status machine: [`AGENTS.md` §11.4](../AGENTS.md#114-letter-status-machine)

### 1.5 tRPC — NOT REST
The app uses tRPC v11 for almost all client-server communication. REST is only used for webhooks, streaming, and health checks.

**GOTCHA:** TanStack Query v5 ONLY allows object form: `useQuery({ queryKey: ['key'] })` — NOT `useQuery(['key'])`.

**GOTCHA:** After mutations, ALWAYS invalidate cache by `queryKey`. Import `queryClient` from `@/lib/queryClient`.

> Full tRPC patterns: [`AGENTS.md` §9](../AGENTS.md#9-api-patterns-trpc)

### 1.6 Authentication Flow
Auth is a HYBRID system:
1. Supabase Auth handles JWT issuance and verification
2. On every authenticated request, the server syncs the Supabase user to the local `users` table
3. A 30-second in-memory cache prevents excessive DB lookups
4. JWTs are read from the `Authorization` header OR `sb_session` cookie

**GOTCHA:** The `useAuth` hook lives at `client/src/_core/hooks/useAuth.ts` (note the `_core` directory).

> Full auth docs: [`AGENTS.md` §7](../AGENTS.md#7-authentication--authorization)

### 1.7 Drizzle ORM Patterns
- Schema is at `drizzle/schema.ts`, relations at `drizzle/relations.ts`
- Use `text().array()` for array columns — NOT `array(text())`
- Types are inferred: `typeof users.$inferSelect`
- The data access layer is `server/db/` — all DB operations go through semantic functions here

> Full Drizzle conventions: [`AGENTS.md` §8](../AGENTS.md#8-database--orm-patterns)

### 1.8 Pricing — Single Source of Truth
All pricing lives in `shared/pricing.ts`. NEVER hardcode prices anywhere.

Active public plans:
- Monthly: $299/month (4 letters)
- Yearly: $2,400/year (8 letters total)

Other constants:
- Paid Revision: $20 (after the first free revision)
- Affiliate discount: 20% (constant `AFFILIATE_DISCOUNT_PERCENT`)
- Stripe amounts are in CENTS (multiply by 100)
- Single Letter ($299 one-time) is `@deprecated` in `shared/pricing.ts` — kept
  for legacy Stripe products and existing customers, NOT shown on the public
  pricing page. Do not reintroduce as a new offering.

### 1.9 Environment Variables
All env vars are accessed through `server/_core/env.ts` → `ENV` object.

> Full env var matrix: [`docs/PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md) §4  
> Quick dev template: [`.env.example`](../.env.example)

### 1.10 Frontend Gotchas
- Do NOT explicitly `import React` — Vite's JSX transformer handles it automatically.
- `useToast` is exported from `@/hooks/use-toast`.
- `<SelectItem>` will throw if it has no `value` prop — always provide one.
- If a form fails to submit silently, log `form.formState.errors`.
- Pages use `React.lazy` with a `lazyRetry` wrapper for code splitting.
- The app uses `wouter` (not React Router).
- Every interactive element needs a `data-testid` attribute.

> Full frontend patterns: [`AGENTS.md` §10](../AGENTS.md#10-frontend-patterns)

### 1.11 Rate Limiting
Two layers:
1. **Express middleware** (Upstash Redis): Auth endpoints = 10 req/15 min; tRPC = 60 req/1 min
2. **tRPC-level** (`checkTrpcRateLimit`): Sensitive actions like letter submission = 5/hour

If Upstash credentials are missing, rate limiting silently degrades (no crash).

> Full rate limiting docs: [`AGENTS.md` §15.2](../AGENTS.md#152-rate-limiting)

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

### 1.14 Module Move Checklist

Whenever you move `pipeline/foo.ts` → `pipeline/foo/index.ts` (or any equivalent file → folder/index.ts move), every relative import inside the moved file shifts one level deeper. Skipping this step has historically broken whole test suites.

Before declaring the move complete:

1. **Repath every relative import inside the moved file:**
   - Sibling becomes parent: `from "./shared"` → `from "../shared"`
   - Parent becomes grandparent: `from "../db"` → `from "../../db"`
   - Re-exports and dynamic imports follow the same rule.
2. **Repath the children too** if you also extracted helpers.
3. **Update any test that reads the file via `fs`:** grep for the old relative path in `server/**/*.test.ts`.
4. **Re-export shared types from the moved module** rather than from `shared/types` if they're pipeline-internal.
5. **Run `pnpm check` *before* `pnpm test`.** `tsc --noEmit` will surface stale paths instantly.

When extracting a sub-component out of a large React page (`pages/foo/Bar.tsx` → `components/.../Bar/*.tsx`), the same idea applies plus two extras:

- **Pick one canonical subtree** — never end up with the same logical area split across `pages/<name>/...` AND `components/<name>/...`. Per the Refactor Map above, `components/subscriber/<name>/` is canonical.
- **Match the existing hook contracts.** `useStaggerReveal(itemCount, staggerMs?)` returns `boolean[]`; `staggerStyle(index, visible)` requires both args.

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
2. Server validates and normalizes intake data (`server/intake-normalizer.ts`)
3. Pipeline starts (4 stages) — subscriber sees real-time progress
4. On completion, letter typically enters `ai_generation_completed_hidden` (24h visibility hold)
5. After hold expiry, subscriber-visible statuses proceed through `letter_released_to_subscriber` and upsell/payment statuses
6. Checkout/payment transitions letter to `pending_review`
7. Letter appears in Attorney Review Queue
8. Attorney claims it → `under_review`
9. Attorney edits in Tiptap, submits → `approved` (transient) → `client_approval_pending`
10. Subscriber reviews, approves → `client_approved` (PDF generated) → `sent`
11. OR subscriber requests revision (first free, then $20 each) → `client_revision_requested` → `pending_review`
12. Server generates branded PDF and sends delivery email

> Full pipeline architecture: [`docs/PIPELINE_ARCHITECTURE.md`](PIPELINE_ARCHITECTURE.md)

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

### Test Credentials

Four seeded accounts (subscriber / employee / attorney / admin at `@ttml.dev`) with password `TestPass123!`. Full table: [`AGENTS.md` §12.4](../AGENTS.md#124-test-credentials-seeded-via-scripts).

The seed script (`scripts/seed-test-users.ts`) is idempotent — safe to run repeatedly. It resets passwords and upserts DB records on each run.

### Route Protection (ProtectedRoute)

The `ProtectedRoute` component enforces RBAC on all protected routes:
- **Unauthenticated** → redirects to `/login?next=<returnPath>`
- **Email unverified** (non-admin) → redirects to `/verify-email`
- **Admin without 2FA cookie** → redirects to `/admin/verify`
- **Wrong role** → redirects to user's own role dashboard (via `getRoleDashboard()`)

---

## 6. SECURITY NOTES

- Stripe webhooks verified via `stripe.webhooks.constructEvent` with the webhook secret
- n8n callbacks verified via `timingSafeEqual` with `N8N_CALLBACK_SECRET`
- Admin 2FA uses signed cookies with expiration
- Rate limiting on auth (10/15min) and general API (60/min)
- Express body limit is 12MB
- CORS, CSP, HSTS, XSS protection headers set in server middleware
- Supabase RLS policies protect database-level access

> Full security docs: [`AGENTS.md` §15](../AGENTS.md#15-security-considerations)

---

For the full file structure and module map, see [`ARCHITECTURE.md`](../ARCHITECTURE.md).
