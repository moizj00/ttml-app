---
name: ttml-state
description: Canonical current-state map of the Talk-to-My-Lawyer (TTML) monorepo — tech stack, modules, tRPC routers, AI pipeline, letter status machine, pricing, env vars, deployment, plus a skills/docs index and a drift log of where pre-existing docs disagree with live code. Use this as the first read whenever working in this repo — it tells you what is currently true and where the authoritative source file for each topic lives. Triggers on "TTML overview", "what's in the TTML repo", "where is X in TTML", "current state of TTML", "TTML status machine", "TTML pipeline current state", "what models does TTML use today", or any question that requires a current cross-cutting view of the codebase.
---

# TTML State — Canonical Repository State Map

> **Last verified:** 2026-05-15 against `HEAD` of branch `claude/elastic-lalande-3591a4` (most recent commit `974fef0`).
> **Sources of truth used:** `AGENTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `package.json`, `shared/types/letter.ts`, `shared/pricing.ts`, `server/_core/env.ts`, `server/_core/trpc.ts`, `server/routers/_shared.ts`, `server/routers/index.ts`, `server/pipeline/providers.ts`, `server/pipeline/vetting/index.ts`, `server/pipeline/drafting.ts`, `server/pipeline/assembly.ts`, `server/pipeline/graph/nodes/*`, `drizzle/schema/{index,constants,letters,...}.ts`.

This skill is the **canonical state index** for TTML. Each reference file under [reference/](reference/) summarizes one domain, points at the authoritative source file, and links to the deeper specialist skill or doc.

When in doubt about a discrepancy between this skill and another doc: **the live code wins, then this skill, then `AGENTS.md` / `ARCHITECTURE.md`, then everything else.** See [reference/drift-log.md](reference/drift-log.md) for known mismatches.

---

## What TTML is, in one paragraph

Talk to My Lawyer (TTML, [`https://www.talk-to-my-lawyer.com`](https://www.talk-to-my-lawyer.com)) is a full-stack legal-letter platform. A subscriber describes a legal situation through a 6-step intake wizard; an AI pipeline (OpenAI web-grounded research + Claude Sonnet drafting/assembly/vetting) generates a professional letter; a licensed attorney reviews, edits, and approves it; the subscriber re-approves the final version; a PDF is generated and delivered. The codebase is a single TypeScript monorepo — React 19 + Vite SPA frontend, Express 4 + tRPC 11 backend, Drizzle ORM on Supabase PostgreSQL, pg-boss queue, Stripe billing, Resend email, Cloudflare R2 storage — deployed to Railway as three services (web, worker, migrate) from one Docker image.

---

## Read-order by task

| If you are working on... | Start with |
|---|---|
| Anything (first time in repo) | This file, then [architecture.md](reference/architecture.md) |
| Pipeline / models / status transitions | [pipeline.md](reference/pipeline.md) |
| tRPC routers / API surface / role guards | [api-surface.md](reference/api-surface.md), [auth-rbac.md](reference/auth-rbac.md) |
| Database schema / new tables / migrations | [data-model.md](reference/data-model.md) |
| Stripe / pricing / paywall / affiliate | [pricing-billing.md](reference/pricing-billing.md) |
| Adding a page / changing routes / Tailwind v4 | [frontend.md](reference/frontend.md) |
| Deploy, Docker, Railway, env config | [ops-deploy.md](reference/ops-deploy.md), [env-vars.md](reference/env-vars.md) |
| Writing tests / running E2E | [testing.md](reference/testing.md) |
| Looking for an existing skill on TTML | [skills-index.md](reference/skills-index.md) |
| Hit a contradiction between docs | [drift-log.md](reference/drift-log.md) |

---

## Critical invariants (file-pointed)

These five rules are inviolable. Mirrored from `CLAUDE.md` with file paths verified against current code.

1. **Mandatory attorney review** — Every AI-generated letter must be reviewed by an attorney. The `ai_draft` `letterVersions` row is immutable; attorney edits always create a new `attorney_edit` row. Audit every transition via `logReviewAction` from [`server/db/review-actions.ts`](../../server/db/review-actions.ts). Pattern detail: [`skills/architectural-patterns/mandatory_attorney_review.md`](../architectural-patterns/mandatory_attorney_review.md).

2. **Strict status machine** — All transitions go through `isValidTransition()` against `ALLOWED_TRANSITIONS` in [`shared/types/letter.ts`](../../shared/types/letter.ts). Never hardcode a status string — import from `LETTER_STATUS`. Only an admin with `force=true` can bypass (via `forceStatusTransition` in [`server/routers/admin/letters.ts`](../../server/routers/admin/letters.ts)). Pattern detail: [`skills/architectural-patterns/strict_status_machine.md`](../architectural-patterns/strict_status_machine.md). Full machine: [pipeline.md](reference/pipeline.md).

3. **RBAC enforcement** — Use the procedure guards from tRPC. Auth-level guards live in [`server/_core/trpc.ts`](../../server/_core/trpc.ts): `publicProcedure`, `protectedProcedure`, `emailVerifiedProcedure`, `adminProcedure` (role + 2FA), `superAdminProcedure` (role + 2FA + owner-email whitelist). Role-level guards live in [`server/routers/_shared.ts`](../../server/routers/_shared.ts): `subscriberProcedure`, `verifiedSubscriberProcedure`, `attorneyProcedure`, `employeeProcedure`. **Never trust the client.** Pattern detail: [`skills/architectural-patterns/rbac_enforcement.md`](../architectural-patterns/rbac_enforcement.md). Full breakdown: [auth-rbac.md](reference/auth-rbac.md).

4. **Super admin whitelist** — Two layers, hard-coded in the repo, cannot be modified via UI or API: `SUPER_ADMIN_EMAILS` in [`server/supabaseAuth.ts`](../../server/supabaseAuth.ts) (used during user sync), and `HARDCODED_OWNER_EMAILS` in [`server/_core/trpc.ts`](../../server/_core/trpc.ts) (used by `superAdminProcedure` for the most destructive operations — currently `["moizj00@gmail.com", "moizj00@yahoo.com"]`). Pattern detail: [`skills/architectural-patterns/super_admin_whitelist.md`](../architectural-patterns/super_admin_whitelist.md).

5. **Payment gate** — Letter content is truncated server-side (~100 chars) by [`server/routers/versions.ts`](../../server/routers/versions.ts) / [`server/db/letter-versions.ts`](../../server/db/letter-versions.ts) when status is `generated_locked`. Transition to `pending_review` only after confirmed Stripe payment or entitlement consumption from an active subscription. Frontend blur in [`client/src/components/LetterPaywall.tsx`](../../client/src/components/LetterPaywall.tsx) is cosmetic — defence in depth, not the gate. **Free-preview exception:** if `letter_requests.is_free_preview = TRUE` and `free_preview_unlock_at <= NOW()` (24h cooling elapsed), [`server/routers/letters/subscriber.ts`](../../server/routers/letters/subscriber.ts) returns the full `ai_draft` tagged `freePreview: true` and the client renders `FreePreviewViewer` (no edit, DRAFT watermark). Admins can collapse the 24h window via `forceFreePreviewUnlock` ([`server/routers/admin/letters.ts`](../../server/routers/admin/letters.ts)) which delegates to the idempotent `dispatchFreePreviewIfReady` in [`server/freePreviewEmailCron.ts`](../../server/freePreviewEmailCron.ts). Pattern detail: [`skills/architectural-patterns/payment_gate.md`](../architectural-patterns/payment_gate.md). Full flow: [pricing-billing.md](reference/pricing-billing.md).

Plus one operational rule: **session refresh** — role changes take effect via `invalidateUserCache()` on the server plus `refetchOnWindowFocus` on the client.

---

## Documentation ownership

Each topic has exactly one authoritative file. Use this table to avoid duplicating content into a sixth place.

| Topic | Owner |
|---|---|
| Current-state map of the repo (cross-cutting) | **This skill** (`skills/ttml-state/`) |
| Agent behavioural rules + invariants summary | [`CLAUDE.md`](../../CLAUDE.md) |
| Canonical tech stack, conventions, gotchas (long form) | [`AGENTS.md`](../../AGENTS.md) |
| Architecture, module map, status diagram, ownership index | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) |
| Developer workflow + module-move checklist + day-to-day pitfalls | [`docs/AGENT_GUIDE.md`](../../docs/AGENT_GUIDE.md) |
| Deep pipeline architecture (stages, RAG, resilience, n8n, LangGraph) | [`docs/PIPELINE_ARCHITECTURE.md`](../../docs/PIPELINE_ARCHITECTURE.md) |
| Deployment + env-var matrix + account provisioning | [`docs/PRODUCTION_RUNBOOK.md`](../../docs/PRODUCTION_RUNBOOK.md) |
| Per-feature inventory by phase number | [`docs/FEATURE_MAP.md`](../../docs/FEATURE_MAP.md) |
| Per-role full access matrix | [`docs/ROLE_AREA_MATRIX.md`](../../docs/ROLE_AREA_MATRIX.md) |
| Per-invariant enforcement rules | `skills/architectural-patterns/*.md` |
| Specialist deep-dives (pipeline-expert, security-review, etc.) | `skills-audit/corrected/ttml-*/SKILL.md` (see [skills-index.md](reference/skills-index.md)) |
| End-to-end pipeline verification playbook | [`skills/platform-e2e-verification/SKILL.md`](../platform-e2e-verification/SKILL.md) |

---

## Quick reality check — what is currently true

These are the most-asked, most-drifted facts. Use these answers, not older docs:

- **Pipeline mode**: standard production runs pg-boss-queued 4-stage in-app pipeline. `PIPELINE_MODE=simple` collapses to a single inline Claude draft (no research, no vetting). `PIPELINE_MODE=langgraph` runs the LangGraph StateGraph synchronously, bypassing pg-boss. Worker-level `LANGGRAPH_PIPELINE` routes pg-boss jobs through LangGraph while keeping pg-boss ownership. n8n is dormant — only active when `N8N_PRIMARY=true`. ([pipeline.md](reference/pipeline.md))
- **Stage 1 (research)**: OpenAI `gpt-4o-search-preview` via Responses API with `webSearchPreview` tool — primary. Perplexity `sonar-pro` — failover when `PERPLEXITY_API_KEY` is set. Claude `claude-sonnet-4-5-20250929` ungrounded — last-resort (sets `researchUnverified: true`). Groq `llama-3.3-70b-versatile` — free-OSS final tier.
- **Stage 2 (drafting)** and **Stage 3 (assembly)**: Anthropic `claude-sonnet-4-5-20250929`. OpenAI `gpt-4o-mini` failover.
- **Stage 4 (vetting)**: Anthropic `claude-sonnet-4-6-20250514` in the in-app pipeline; `claude-sonnet-4-5-20250929` in the LangGraph alternative. OpenAI `gpt-4o-mini` failover. (See [drift-log.md](reference/drift-log.md) for the internal version mismatch.)
- **Status machine**: 21 statuses in `LETTER_STATUS` (`shared/types/letter.ts`); 20 statuses in the Drizzle pgEnum `LETTER_STATUSES` (`drizzle/schema/constants.ts`) — `generated_unlocked` is TS-only because the pgEnum no longer admits it. Includes the 24h-hold `ai_generation_completed_hidden` and the upsell funnel `letter_released_to_subscriber → attorney_review_upsell_shown → attorney_review_checkout_started → attorney_review_payment_confirmed → pending_review`.
- **Pricing**: monthly $299 / 4 letters; yearly $2,400 / 8 letters. Single-letter $299 is `@deprecated` in `shared/pricing.ts` — subscription-only for new customers; legacy Stripe products still honoured.
- **tRPC sub-routers** (14, composed in `server/routers/index.ts`): `system, auth, letters, review, admin, notifications, versions, billing, affiliate, profile, documents, blog, templates, intakeFormTemplates`.
- **Schema** is split into 7 Drizzle modules under `drizzle/schema/`: `constants, users, letters, billing, notifications, pipeline, content`. The root `drizzle/schema.ts` is a barrel that re-exports them all.
- **Validation gate** before every PR: `pnpm check` → `pnpm test` → `pnpm build`. Test suite is ~1300 tests across ~54 files.

### Verified working flows (as of `974fef0`, 2026-05-14)

The following core flows are **verified working end-to-end** by the integration test at [`server/simple-pipeline-lifecycle.test.ts`](../../server/simple-pipeline-lifecycle.test.ts) (added in commit `4f3d5bc`, refined in `4f4c723`, merged in PRs #39 and #40):

1. **Simple pipeline** — `runSimplePipeline` drives `submitted → researching → drafting → generated_locked`, writes an `ai_draft` version, sets `currentAiDraftVersionId`, and the `workflow_jobs` row completes with `provider: "simple"`.
2. **Subscriber letter generation** — full intake JSON → pipeline execution → letter version creation with correctly populated version pointers.
3. **Paywall** — subscriber view at `generated_locked` returns `truncated: true` (content server-side truncated to ~100 chars); admin/internal view returns full content; after payment unlock (`generated_locked → pending_review`) subscriber view returns the full `ai_draft` with `truncated: false`.
4. **Attorney review workflow** — `claimLetterForReview` assigns the reviewer and advances to `under_review`; attorney approval creates a new `final_approved` version (the original `ai_draft` is preserved byte-for-byte — immutability invariant); auto-advance lands at `client_approval_pending`; subscriber `client_approved` transition completes the lifecycle.

The test mocks LLM SDK clients (Anthropic + OpenAI) so it is deterministic and free of API cost, but exercises real Drizzle DB operations against Postgres. It is gated on `DATABASE_URL` / `SUPABASE_DATABASE_URL` — skips when no real database is available. Additionally, 8 Playwright E2E specs under [`e2e/platform/`](../../e2e/platform/) cover these same flows through the browser (with `PIPELINE_MODE=simple`).

---

## Reference files

- [architecture.md](reference/architecture.md) — tech stack, monorepo layout, path aliases, build, deploy topology
- [data-model.md](reference/data-model.md) — Drizzle schema modules, key tables, enums, vector embeddings
- [api-surface.md](reference/api-surface.md) — tRPC router map, REST endpoints, auth tiers per procedure
- [pipeline.md](reference/pipeline.md) — pipeline modes, current model pins, status machine, RAG, recursive learning
- [auth-rbac.md](reference/auth-rbac.md) — Supabase JWT flow, roles, procedure guards, super-admin whitelists, 2FA
- [pricing-billing.md](reference/pricing-billing.md) — current pricing constants, Stripe flows, paywall, free-preview funnel, affiliate
- [env-vars.md](reference/env-vars.md) — `ENV` object keys, required-at-boot vs optional, frontend `VITE_*`
- [frontend.md](reference/frontend.md) — pages by role, key shared components, wouter routing, Tailwind v4
- [ops-deploy.md](reference/ops-deploy.md) — Railway services, Docker entrypoint, build pipeline, security headers
- [testing.md](reference/testing.md) — Vitest + Playwright setup, seeded test users, e2e platform suite
- [skills-index.md](reference/skills-index.md) — map of existing TTML skills and `.agent.md` files
- [drift-log.md](reference/drift-log.md) — known mismatches between pre-existing docs and live code

---

## How to keep this skill current

Re-verify against the live code (not against `AGENTS.md` or other skills) whenever any of the following change. Each reference file lists its sources in a "Sources read" footer.

| If you change... | Re-verify |
|---|---|
| Model pins in `server/pipeline/providers.ts` or graph nodes | [pipeline.md](reference/pipeline.md), [drift-log.md](reference/drift-log.md) |
| `shared/types/letter.ts` or `drizzle/schema/constants.ts` | [pipeline.md](reference/pipeline.md), [data-model.md](reference/data-model.md) |
| `shared/pricing.ts` | [pricing-billing.md](reference/pricing-billing.md) |
| `server/_core/env.ts` | [env-vars.md](reference/env-vars.md) |
| `server/routers/index.ts` or any sub-router | [api-surface.md](reference/api-surface.md) |
| `server/_core/trpc.ts` or `server/routers/_shared.ts` | [auth-rbac.md](reference/auth-rbac.md) |
| `client/src/App.tsx` or `client/src/pages/**` | [frontend.md](reference/frontend.md) |
| `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh` | [ops-deploy.md](reference/ops-deploy.md) |
