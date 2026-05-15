# Skills Index — Current State

> **Last verified:** 2026-05-14 against glob of `skills/**/*.md`, `skills-audit/**/*.md`, `.github/agents/*.agent.md`, `ttml-*-agent.agent.md`, `plugins/route-handle/skills/`.

A map of every TTML-specific skill and `.agent.md` definition currently in the repo, with one-line summaries and pointers to deeper coverage. Use this to find the right specialist when a task drills into one domain.

---

## 1. `skills/` (in-repo, committed)

| Skill | Path | Purpose |
|---|---|---|
| **ttml-state** | `skills/ttml-state/SKILL.md` | **This skill.** Canonical current-state map of the TTML repo. Start here for any cross-cutting question |
| Platform E2E verification | [`skills/platform-e2e-verification/SKILL.md`](../../platform-e2e-verification/SKILL.md) | Step-by-step playbook to verify the complete letter lifecycle: submission → AI pipeline → paywall → payment → attorney review → claim. Run after model upgrades, schema migrations, or pipeline changes |

### `skills/architectural-patterns/` (no SKILL.md — folder of pattern docs)

Each file enforces one of the five core architectural invariants. Referenced from `CLAUDE.md` and `ARCHITECTURE.md`.

| File | Pattern |
|---|---|
| [`mandatory_attorney_review.md`](../../architectural-patterns/mandatory_attorney_review.md) | Every AI-generated letter must be reviewed by an attorney. `ai_draft` is immutable; create new `attorney_edit` versions; audit via `logReviewAction` |
| [`strict_status_machine.md`](../../architectural-patterns/strict_status_machine.md) | All transitions validated against `ALLOWED_TRANSITIONS` in `shared/types/letter.ts`. Use `isValidTransition()`. No hardcoded status strings |
| [`rbac_enforcement.md`](../../architectural-patterns/rbac_enforcement.md) | Use tRPC procedure guards. Never trust client-side checks |
| [`super_admin_whitelist.md`](../../architectural-patterns/super_admin_whitelist.md) | Hard-coded super-admin email list — cannot be assigned via UI/API |
| [`payment_gate.md`](../../architectural-patterns/payment_gate.md) | Letter content truncated server-side when `generated_locked`. Transition to `pending_review` only after confirmed Stripe payment. Free-preview exception documented |

---

## 2. `skills-audit/corrected/ttml-*` (specialist skills, not auto-discovered)

These 17 skills cover specific specialist domains. They live in `skills-audit/corrected/` (not `skills/`) because they were the output of a prior alignment-audit pass. They are **not** auto-discovered by Claude Code's skill loader from `skills-audit/`, but they're useful read-references for the topics they cover.

See [`skills-audit/TTML-SKILL-ALIGNMENT-AUDIT.md`](../../../skills-audit/TTML-SKILL-ALIGNMENT-AUDIT.md) for the audit summary that produced them.

| Skill | Purpose |
|---|---|
| [`ttml-backend-patterns`](../../../skills-audit/corrected/ttml-backend-patterns/SKILL.md) | Backend architecture patterns: tRPC routers, Drizzle helpers, role guards, pipeline orchestration, Stripe webhooks, LangGraph, email, audit logging |
| [`ttml-pipeline-expert`](../../../skills-audit/corrected/ttml-pipeline-expert/SKILL.md) | Pipeline + status-machine specialist. **Note**: model pins are drifted (says Sonnet 4 `20250514` for all Claude stages; live is 4.5 for draft/assembly + 4.6 for vetting) — see [drift-log.md](drift-log.md) |
| [`ttml-pipeline-orchestrator`](../../../skills-audit/corrected/ttml-pipeline-orchestrator/SKILL.md) | Orchestrator-level: pipeline modes, worker gates, retries, failure handling |
| [`ttml-legal-letter-generation`](../../../skills-audit/corrected/ttml-legal-letter-generation/SKILL.md) | The end-to-end letter generation domain — intake → research → draft → assembly → vetting → release |
| [`ttml-langgraph-pipeline`](../../../skills-audit/corrected/ttml-langgraph-pipeline/SKILL.md) | LangGraph StateGraph alternative path — nodes, checkpointing, mode parser |
| [`ttml-n8n-workflow-integration`](../../../skills-audit/corrected/ttml-n8n-workflow-integration/SKILL.md) | n8n dormant path — webhook contract, callback secret, when to enable |
| [`ttml-payment-subscription-management`](../../../skills-audit/corrected/ttml-payment-subscription-management/SKILL.md) | Stripe flows, subscriptions, entitlement tracking, affiliate commissions. **Note**: may reference $299 single-letter as a live plan — it's `@deprecated`; see [drift-log.md](drift-log.md) |
| [`ttml-security-review`](../../../skills-audit/corrected/ttml-security-review/SKILL.md) | Security review checklist for TTML PRs — headers, auth, RLS, secret handling |
| [`ttml-database-rls-security`](../../../skills-audit/corrected/ttml-database-rls-security/SKILL.md) | Supabase RLS + service-role-key handling + DB-level access patterns |
| [`ttml-sql-data-engineer`](../../../skills-audit/corrected/ttml-sql-data-engineer/SKILL.md) | SQL query patterns for analytics over `letter_requests`, `workflow_jobs`, `commission_ledger` etc. |
| [`ttml-data-api-expert`](../../../skills-audit/corrected/ttml-data-api-expert/SKILL.md) | Internal data-API patterns — query helpers, ownership guards, common pitfalls |
| [`ttml-data-analyst`](../../../skills-audit/corrected/ttml-data-analyst/SKILL.md) | Analyst-level guidance — KPIs, dashboards, attorney quality metrics |
| [`ttml-code-reviewer`](../../../skills-audit/corrected/ttml-code-reviewer/SKILL.md) | Generic code review for TTML — style, correctness, hidden invariants |
| [`ttml-code-review-qa`](../../../skills-audit/corrected/ttml-code-review-qa/SKILL.md) | Code-review + QA checklist, focused on shipping safely |
| [`ttml-deployment-readiness`](../../../skills-audit/corrected/ttml-deployment-readiness/SKILL.md) | Pre-deploy gate — env config, migrations, smoke tests |
| [`ttml-ui-design-expert`](../../../skills-audit/corrected/ttml-ui-design-expert/SKILL.md) | Frontend design — Tailwind v4, shadcn, accessibility, role-specific dashboards |

If a topic above has both a `ttml-state/reference/*.md` file and a specialist skill, the reference file is the **current-state** index and the specialist skill is the **deep-dive** — use both.

---

## 3. `.agent.md` definitions

Repo-root agent definitions (used by GitHub Copilot and other agent tooling):

| File | Purpose |
|---|---|
| [`ttml-attorney-agent.agent.md`](../../../ttml-attorney-agent.agent.md) | Attorney-role agent persona: review queue handling, edit/approve/reject decisions, audit trail rules |
| [`ttml-subscriber-agent.agent.md`](../../../ttml-subscriber-agent.agent.md) | Subscriber-role agent persona: intake completion, free-preview funnel, paywall, billing actions |
| [`.github/agents/my-agent.agent.md`](../../../.github/agents/my-agent.agent.md) | GitHub-side agent definition |
| [`.github/copilot-instructions.md`](../../../.github/copilot-instructions.md) | GitHub Copilot project instructions |

These are agent personas for non-Claude-Code agent runners. Claude Code reads `CLAUDE.md` (project-level) and `~/.claude/CLAUDE.md` (user-level) instead.

---

## 4. `plugins/route-handle/`

A Claude Code plugin under `plugins/` providing a `route-handle` skill — covers TTML routing on both client and server. Useful when adding a new route or debugging a wouter / tRPC routing issue.

| File | Purpose |
|---|---|
| [`plugins/route-handle/skills/route-handle/SKILL.md`](../../../plugins/route-handle/skills/route-handle/SKILL.md) | Entry point for the route-handle skill |
| [`plugins/route-handle/skills/route-handle/references/ttml-routing.md`](../../../plugins/route-handle/skills/route-handle/references/ttml-routing.md) | Deep dive — wouter routes, tRPC sub-router composition, REST routes |

---

## 5. `.claude/` (Claude Code repo state)

| File | Purpose |
|---|---|
| [`.claude/repo-conventions.md`](../../../.claude/repo-conventions.md) | Repo-specific conventions Claude Code should follow when editing |
| [`.claude/citation-queries.md`](../../../.claude/citation-queries.md) | Reference queries for the citation audit pipeline |
| [`.claude/citation-scores.md`](../../../.claude/citation-scores.md) | Output of the weekly citation feedback loop |
| [`.claude/published-topics.md`](../../../.claude/published-topics.md) | Blog topic state-tracker (used by blog batch automation) |
| [`.claude/reports/*`](../../../.claude/reports/) | Generated reports (citation, etc.) |

---

## 6. How to pick the right skill / doc

Decision flow:

1. **Cross-cutting state question** ("what's currently true about X?") → this skill ([`ttml-state`](../SKILL.md)).
2. **Specific architectural invariant** ("am I about to violate the status machine / payment gate?") → [`skills/architectural-patterns/*.md`](../../architectural-patterns/).
3. **End-to-end lifecycle test** → [`skills/platform-e2e-verification/SKILL.md`](../../platform-e2e-verification/SKILL.md).
4. **Deep specialist domain** (pipeline internals, RLS, Stripe deep dive, security review) → `skills-audit/corrected/ttml-*/SKILL.md`.
5. **Long-form architecture / module map** → [`AGENTS.md`](../../../AGENTS.md), [`ARCHITECTURE.md`](../../../ARCHITECTURE.md).
6. **Developer workflow / pitfalls** → [`docs/AGENT_GUIDE.md`](../../../docs/AGENT_GUIDE.md).
7. **Deploy / env / production** → [`docs/PRODUCTION_RUNBOOK.md`](../../../docs/PRODUCTION_RUNBOOK.md).
8. **Pipeline deep dive** → [`docs/PIPELINE_ARCHITECTURE.md`](../../../docs/PIPELINE_ARCHITECTURE.md).
9. **Feature inventory** ("has X been built yet?") → [`docs/FEATURE_MAP.md`](../../../docs/FEATURE_MAP.md).
10. **Role-area access matrix** → [`docs/ROLE_AREA_MATRIX.md`](../../../docs/ROLE_AREA_MATRIX.md).

When two sources conflict, prefer current code → `ttml-state` → `AGENTS.md` / `ARCHITECTURE.md` → everything else. See [drift-log.md](drift-log.md) for known cases.

---

**Sources read:** glob of `skills/**/*.md`, glob of `skills-audit/**/*.md`, glob of `*.md` at repo root, [`skills-audit/corrected/ttml-backend-patterns/SKILL.md`](../../../skills-audit/corrected/ttml-backend-patterns/SKILL.md), [`skills-audit/corrected/ttml-pipeline-expert/SKILL.md`](../../../skills-audit/corrected/ttml-pipeline-expert/SKILL.md).
