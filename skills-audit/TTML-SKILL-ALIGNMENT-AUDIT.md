# TTML Skill Alignment Audit

**Date:** April 18, 2026
**Source of truth:** `ARCHITECTURE.md` + `CLAUDE.md` (both in `/sessions/ecstatic-bold-bardeen/mnt/ttml-app/`)
**Scope audited:** All 21 `ttml*` skills under `.claude/skills/`
**Constraint:** Skills filesystem is mounted read-only, so this audit delivers (1) the finding list and (2) drop-in corrected `SKILL.md` files in `skills-audit/corrected/`. Manually copy the corrected files over the read-only originals when filesystem writes are available.

---

## Canonical Spec (what every skill must agree with)

| Dimension | Canonical value |
|-----------|-----------------|
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS v4 (OKLCH), shadcn/ui, wouter, TanStack Query |
| Backend | Node.js, Express 4.21, tRPC 11.6, TypeScript (no Next.js, no API routes) |
| Database | PostgreSQL on Supabase, Drizzle ORM 0.44 |
| Auth | Supabase Auth JWT via `sb_session` httpOnly cookie |
| Pipeline | **4 stages**: Research (Perplexity `sonar-pro`) → Drafting (Claude Opus) → Assembly (Claude Opus) → Vetting (**Claude Sonnet**) |
| Pipeline alternatives | n8n is **dormant** (only active when `N8N_PRIMARY=true`); LangGraph is optional (`LANGGRAPH_PIPELINE=true`) |
| Doc analysis AI | OpenAI GPT-4o |
| RAG embeddings | OpenAI `text-embedding-3-small` |
| Payments | Stripe: **$200 per-letter**, **$200/mo**, **$2000/yr** |
| Email | Resend (17 templates) |
| Background jobs | pg-boss (Postgres-native; **not** BullMQ/Redis) |
| Rate limiting | Upstash Redis via `@upstash/ratelimit` |
| Rich text | Tiptap |
| PDF | PDFKit (server-side) |
| Monitoring | Sentry + Pino |
| Deployment | Railway (Docker multi-stage) — **not** Vercel |
| Roles | Flat 4-role enum: `subscriber`, `employee`, `attorney`, `admin` — **no** `admin_sub_role` |
| Role routes | `/dashboard`, `/employee`, `/attorney`, `/admin` |
| Status machine | `shared/types/letter.ts` → `ALLOWED_TRANSITIONS` (includes `client_approval_pending`, `client_approved`, `sent`, `pipeline_failed`) |
| Key tables | `users`, `letter_requests`, `letter_versions`, `review_actions`, `workflow_jobs`, `research_runs`, `subscriptions`, `pipeline_lessons`, `document_analyses`, `commission_ledger`, `discount_codes`, `blog_posts` |
| Version types | `ai_draft` (immutable), `attorney_edit`, `final_approved` |
| tRPC routers | `server/routers/` sub-router directory (admin/, letters/, review/, affiliate/, billing/, blog); **not** a single `server/routers.ts` file |
| Procedure guards | `subscriberProcedure`, `employeeProcedure`, `attorneyProcedure`, `adminProcedure` in tRPC middleware |
| Super admin whitelist | Hard-coded in `server/supabaseAuth.ts` |
| Commission rate | 5% (500 basis points), stored in cents |

---

## Per-skill findings

Legend:
- **MAJOR** — multiple incorrect stack/schema/pipeline claims; rewrite recommended
- **MODERATE** — one or two material errors (wrong model, wrong table name, wrong role shape)
- **MINOR** — single line/phrase drift
- **CLEAN** — no drift observed; keep as-is

### 1. `ttml--legal-letter-draft-intakedraft` — CLEAN
Prompt-shape skill, no stack claims. No changes needed.

### 2. `ttml-backend-patterns` — MAJOR
- Line 8: claims "Next.js + Express + tRPC" → should be "Vite + Express + tRPC (no Next.js)".
- Line 28: `server/routers.ts` (single file) → canonical is `server/routers/` (sub-router directory).
- Line 41: `shared/types.ts` → canonical is `shared/types/letter.ts`.
- Line 50: "employee ... Also has attorney-level review access" → **wrong**. Employee has affiliate-only scope; attorneys are a distinct role. Remove this claim and the `attorneyProcedure` OR-admin construction needs to be reframed: canonical middleware allows role-or-admin, but employee does not gain attorney access.
- Lines 82–96: router table uses old schema (single file). Replace with canonical `server/routers/<domain>/index.ts` directory map.
- Lines 99–123 (status machine): missing `approved → client_approval_pending → client_approved → sent`, missing `client_revision_requested`, missing `pipeline_failed → submitted`, missing `rejected → submitted`, missing `needs_changes → submitted`. Replace with canonical diagram from ARCHITECTURE.md §Status Machine.
- Line 302: "3-stage AI pipeline" → canonical is **4 stages**. Add Stage 4 Vetting (Claude Sonnet, anti-hallucination).
- Line 311: `claude-opus-4-5` model ID → canonical refers to "Claude Opus" (brand, not version pin). Pipeline also uses `claude-opus-4-5-20250929` / `claude-sonnet-4-5-20250929` per code; don't hardcode dated model IDs in the skill — defer to `server/pipeline/orchestrator.ts`.
- Frontmatter description line 3: "3-stage AI pipeline" → "4-stage AI pipeline".

### 3. `ttml-code-review-qa` — MAJOR
- Section "Authentication & Authorization" and many `POST(request: NextRequest)` examples → **wrong**. Canonical is tRPC procedures, not Next.js App Router route handlers. Replace with `subscriberProcedure.mutation(...)`, etc.
- Uses `@/app/api/...` imports → Next.js-only path alias. Replace with `server/routers/...`.
- Line 60: "Images optimized (Next.js Image component)" → remove; frontend is Vite + React + shadcn/ui.
- Lines 58: `requireSubscriber(request)` helper → not canonical. Use tRPC guard.
- Lines 144–147: references `supabase.from('letters')` client-side queries with RLS → canonical backend uses Drizzle ORM via `server/db/` helpers, not the Supabase JS client with `.from()` chains for business queries. RLS still enforces, but the patterns shown aren't how the app is built.
- Line 589: `vercel rollback --yes` → canonical deploys to Railway, not Vercel. Replace with Railway rollback guidance.
- Line 654: `export async function POST(request: NextRequest)` → replace with tRPC procedure pattern.
- Line 704: "Vercel function execution time" → "Railway container execution time".
- Line 570: integration list says "n8n, Resend" → canonical has n8n as dormant. Primary integrations are Perplexity, Anthropic, OpenAI, Stripe, Resend.
- Attorney role consistently referred to as `attorney_admin` / `super_admin` → replace with flat `attorney` / `admin`.

### 4. `ttml-code-reviewer` — MINOR
- Line 11: "Next.js server vs client boundaries" → replace with "React client vs Express/tRPC server boundaries".
- Line 12: "Supabase SSR/session usage" → reframe as "Supabase Auth JWT (`sb_session` cookie) usage on the Express/tRPC side".

### 5. `ttml-data-analyst` — MINOR
- Line 11: "Assume a Next.js + Supabase stack" → "Assume the canonical TTML stack (React + Vite frontend, Express + tRPC + Drizzle backend on Supabase Postgres); analyses run against Postgres tables defined in `drizzle/schema.ts`".
- Line 20: tables list `profiles, letters, subscriptions, employee_metrics, coupons, transactions` → canonical: `users, letter_requests, letter_versions, review_actions, workflow_jobs, research_runs, subscriptions, commission_ledger, discount_codes`.

### 6. `ttml-data-api-expert` — CLEAN
Aligns with canonical: tRPC procedures, Drizzle, RBAC guards, atomic entitlements, rate limiting. No changes needed.

### 7. `ttml-database-rls-security` — MAJOR
- Entire schema uses wrong tables/roles. Canonical:
  - `profiles` → `users`
  - `letters` → `letter_requests` + `letter_versions` (versioned — this skill is missing the version table entirely)
  - `employee_coupons` → `discount_codes`
  - `commissions` → `commission_ledger`
- `admin_sub_role` with `attorney_admin` / `super_admin` sub-roles → canonical uses flat `user_role` enum (`subscriber | employee | attorney | admin`). Super admin status is gated by the hardcoded whitelist in `server/supabaseAuth.ts`, not a sub-role column.
- RLS helpers `is_super_admin()`, `is_attorney_admin()` → canonical functions are different (and in part enforced in app-layer via tRPC middleware).
- Letter status enum listed as `draft | generating | ...` → canonical uses `submitted, researching, drafting, generated_locked, pending_review, under_review, approved, rejected, needs_changes, client_approval_pending, client_approved, client_revision_requested, sent, pipeline_failed`.
- Commission rate 5% is correct, but discount percent claim of 20% as default is not universal; canonical `discount_codes` table allows arbitrary `discountPercent` set by employee.
- `letter_refunds` table referenced but not in canonical schema — remove or flag as "app-level audit trail".

### 8. `ttml-deployment-readiness` — CLEAN
Aligns with Railway + esbuild + pg-boss + LangGraph. No changes needed.

### 9. `ttml-growth-ops` — CLEAN
Abstract; no stack references. No changes needed.

### 10. `ttml-langgraph-pipeline` — MODERATE
- Uses Perplexity `sonar` (not `sonar-pro`) in examples → canonical is `sonar-pro`.
- `claude-3-5-haiku` fallback referenced → canonical fallback is Claude Opus (non-web-grounded) when Perplexity key missing.
- `claude-3-5-sonnet` for vetting → canonical is "Claude Sonnet" (brand; actual model pin lives in code, `claude-sonnet-4-5-20250929`).
- **Fix:** reference model brands, not fixed IDs; align sonar-pro.

### 11. `ttml-legal-letter-generation` — MAJOR
- Lines 8–16: says "n8n primary workflow + OpenAI fallback" → canonical n8n is **dormant**. Primary pipeline is the 4-stage in-app orchestrator (Perplexity → Claude Opus → Claude Opus → Claude Sonnet). n8n is an alternative only active when `N8N_PRIMARY=true`.
- Line 23: `profiles.role = 'subscriber'` → `users.role = 'subscriber'`.
- Line 30: status machine `draft → generating → pending_review → under_review → (approved|rejected) → completed` → canonical is `submitted → researching → drafting → generated_locked → pending_review → under_review → approved/rejected/needs_changes → client_approval_pending → client_approved → sent` with `pipeline_failed` for failures. There is no `draft`/`generating`/`completed`.
- Lines 50–91 (API route): uses `POST /api/generate-letter` with Next.js `requireSubscriber(request)` → canonical is `letters.submit` tRPC mutation on `subscriberProcedure`.
- Line 287: `model: 'gpt-4-turbo'` → canonical uses Claude Opus for drafting, not OpenAI GPT-4-turbo. OpenAI GPT-4o is only used for document analysis.
- Lines 362–384 (attorney notification): queries `profiles` with `admin_sub_role in ('attorney_admin','super_admin')` → canonical: query `users.role = 'attorney'`.
- Lines 421–433: `/attorney-portal/` route → canonical route is `/attorney` (per role-routes table).
- Lines 568–605 PDF generation: external API call → canonical is PDFKit (server-side, in-process).
- Line 646: `import jsPDF` client-side → not canonical.

### 12. `ttml-n8n-workflow-integration` — MAJOR
- Throughout: frames n8n as **primary**. Canonical: n8n is a **dormant alternative** path, only used when `N8N_PRIMARY=true`. Re-frame entire doc as "dormant alternative path, operational detail".
- `profiles`/`letters` tables referenced → canonical `users`/`letter_requests`/`letter_versions`.
- `gpt-4-turbo` in n8n workflow → canonical AI is Claude Opus; n8n workflow's model choice is a separate implementation detail but the TTML app's canonical pipeline does not depend on it.
- Env vars: canonical uses `N8N_PRIMARY`, `N8N_MCP_URL`, `N8N_MCP_BEARER_TOKEN`, `N8N_CALLBACK_SECRET` (see `ttml-pipeline-orchestrator` skill). The older `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_SECRET`/`N8N_SUPABASE_SERVICE_KEY` names should be cross-checked and updated to match.

### 13. `ttml-payment-subscription-management` — MAJOR
- Line 47 pricing: per-letter shown as `$299` → canonical is **$200** (`shared/pricing.ts`).
- Line 42: "Monthly ($200)" + "Per-letter ($299)" → monthly is correct, per-letter is $200 not $299.
- Line 62 (Plan Configuration): `per-letter | $299 | ...` → change to `$200`.
- Throughout: `profiles` table → `users`; `employee_coupons` → `discount_codes`; `commissions` → `commission_ledger`.
- `requireSubscriber(request)` and `POST /api/verify-payment` → canonical tRPC procedures.
- References `sk_live_*` guard, commission math (5%, $11.96), coupon semantics — commission math needs to be recomputed from $200 base, not $299.
- Line 33: "NEVER use separate INSERT/UPDATE statements for subscription + commission + coupon" — correct pattern, but the tables are wrong.
- Line 42: `plan_type = 'per-letter'` column on discount code → canonical `discount_codes` table does not have a `plan_type` filter column; any plan restriction is enforced in Stripe checkout logic.

### 14. `ttml-pipeline-expert` — MODERATE
- Claims vetting stage uses Claude Opus → canonical is **Claude Sonnet** for vetting.
- Uses `claude-opus-4-5` model ID literally → reference brand name, not dated pin.
- 4-stage description is accurate otherwise.

### 15. `ttml-pipeline-orchestrator` — MODERATE
- Drafting shown as `gpt-4o-mini` in some examples → canonical is **Claude Opus** for drafting; OpenAI GPT-4o only for document analysis (free analyzer).
- 3-tier fallback chain (n8n MCP → webhook → in-app) is accurate but should be explicit that n8n is **dormant** unless `N8N_PRIMARY=true`.

### 16. `ttml-qa-tester` — CLEAN
Abstract. Coupon example 20% is illustrative; canonical allows variable `discountPercent`. No changes needed.

### 17. `ttml-security-review` — MINOR
- Line 14: "Secrets: never in client bundle; use Edge env" → "Edge env" is Vercel terminology. Replace with "use Railway environment variables / Docker build args".

### 18. `ttml-seo` — CLEAN
No stack references. File path on line 98 references a different session path (`zealous-tender-albattani`) — not blocking, but ideally should be `{workspace}/SEO/...`.

### 19. `ttml-sql-data-engineer` — MODERATE
- Line 17 tables: `profiles, letters, subscriptions, employee_metrics, coupons, transactions` → canonical: `users, letter_requests, letter_versions, review_actions, workflow_jobs, research_runs, subscriptions, commission_ledger, discount_codes, blog_posts`.

### 20. `ttml-ui-design-expert` — MINOR
- Frontmatter description: "accessibility checks for Next.js App Router" → canonical frontend is React 19 + Vite 7 + Tailwind v4 + shadcn/ui + wouter. No Next.js.
- Line 11 body: "Next.js + Tailwind + shadcn/ui" → replace with the canonical stack line.

### 21. `ttml-ux-writer` — CLEAN
Abstract. No changes needed.

---

## Summary scoreboard

| Skill | Verdict |
|-------|---------|
| ttml--legal-letter-draft-intakedraft | CLEAN |
| ttml-backend-patterns | **MAJOR** |
| ttml-code-review-qa | **MAJOR** |
| ttml-code-reviewer | MINOR |
| ttml-data-analyst | MINOR |
| ttml-data-api-expert | CLEAN |
| ttml-database-rls-security | **MAJOR** |
| ttml-deployment-readiness | CLEAN |
| ttml-growth-ops | CLEAN |
| ttml-langgraph-pipeline | MODERATE |
| ttml-legal-letter-generation | **MAJOR** |
| ttml-n8n-workflow-integration | **MAJOR** |
| ttml-payment-subscription-management | **MAJOR** |
| ttml-pipeline-expert | MODERATE |
| ttml-pipeline-orchestrator | MODERATE |
| ttml-qa-tester | CLEAN |
| ttml-security-review | MINOR |
| ttml-seo | CLEAN |
| ttml-sql-data-engineer | MODERATE |
| ttml-ui-design-expert | MINOR |
| ttml-ux-writer | CLEAN |

6 MAJOR · 4 MODERATE · 4 MINOR · 7 CLEAN

---

## Corrected drop-in files

Drop-in replacements for every non-CLEAN skill live in `skills-audit/corrected/<skill-name>/SKILL.md`. Each has the same `name:` in frontmatter as the original, so they are byte-compatible swaps.

When the skills filesystem becomes writable (e.g., after remounting or copying into a working branch), apply with:

```bash
for f in skills-audit/corrected/*/SKILL.md; do
  name=$(basename "$(dirname "$f")")
  cp -v "$f" ".claude/skills/$name/SKILL.md"
done
```

Leave the CLEAN skills alone.

---

## Cross-cutting patterns to normalize

When writing or reviewing any TTML skill, replace these drift markers:

| Drift marker | Canonical replacement |
|--------------|----------------------|
| `Next.js` / `Next.js App Router` / `POST(request: NextRequest)` | React + Vite (frontend) / Express + tRPC (backend) — show tRPC procedures |
| `Vercel` | Railway |
| `Edge env` / `@vercel/functions` | Railway environment variables |
| `requireSubscriber(request)` | `subscriberProcedure` tRPC middleware |
| `@/app/api/...` imports | `server/routers/...` |
| `profiles` table | `users` table |
| `letters` table | `letter_requests` + `letter_versions` |
| `employee_coupons` / `coupons` table | `discount_codes` |
| `commissions` table | `commission_ledger` |
| `admin_sub_role` with `attorney_admin` / `super_admin` | flat `user_role` enum; super admin enforced by `server/supabaseAuth.ts` whitelist |
| `/attorney-portal/` route | `/attorney` |
| `/dashboard/letters/<id>` (subscriber) | `/dashboard` (subscriber home + nested) |
| `draft → generating → ... → completed` status machine | canonical `submitted → researching → drafting → generated_locked → pending_review → under_review → approved → client_approval_pending → client_approved → sent` + `pipeline_failed`, `rejected → submitted`, `needs_changes → submitted` |
| 3-stage AI pipeline | 4-stage (Research → Drafting → Assembly → Vetting) |
| Vetting uses Claude Opus | Vetting uses **Claude Sonnet** |
| `claude-opus-4-5`, `claude-3-5-sonnet` model IDs | Use brand names ("Claude Opus", "Claude Sonnet"); exact pin lives in `server/pipeline/orchestrator.ts` |
| `gpt-4-turbo` / `gpt-4o-mini` for drafting | Claude Opus for drafting; **GPT-4o only** for document analyzer (`documents.analyze`) |
| Perplexity `sonar` | Perplexity `sonar-pro` |
| n8n primary | n8n **dormant** (active only when `N8N_PRIMARY=true`) |
| `$299` per-letter | **$200** per-letter (single source of truth: `shared/pricing.ts`) |
| BullMQ / Redis queue | pg-boss (Postgres-native) |
| SendGrid | Resend |
| jsPDF client-side PDF | PDFKit server-side |
| `server/routers.ts` (single file) | `server/routers/` (sub-router directory) |
| `shared/types.ts` | `shared/types/letter.ts` |

---

## Note on version pinning

Several drift skills hard-code dated Anthropic model IDs (`claude-opus-4-5`, `claude-sonnet-4-5-20250929`). The corrected files follow ARCHITECTURE.md's approach: reference the **brand** (Claude Opus, Claude Sonnet), and defer exact pin to `server/pipeline/orchestrator.ts` so skills don't rot every model release.
