# Drift Log — Where Pre-Existing Docs Disagree With Live Code

> **Last verified:** 2026-05-14 against `server/pipeline/providers.ts`, `server/pipeline/{drafting,assembly}.ts`, `server/pipeline/vetting/index.ts`, `server/pipeline/graph/nodes/*.ts`, `server/_core/trpc.ts`, `server/routers/_shared.ts`, `shared/pricing.ts`, `shared/types/letter.ts`, `drizzle/schema/constants.ts`.

When two sources of truth disagree, **the live code wins** — then this skill, then `AGENTS.md` / `ARCHITECTURE.md`, then everything else. This log calls out the specific mismatches present in the repo as of 2026-05-14 so agents don't act on stale information.

Each entry: what the stale source says, what the live code actually does, where to verify.

---

## D1. Pipeline model pins — "Claude Opus" claim is wrong

**Stale source:** `ARCHITECTURE.md` (Tech Stack table + AI Pipeline section): says drafting and assembly use **Claude Opus**.

**Live code:** Drafting and assembly use **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`).

**Verify in:** `server/pipeline/drafting.ts:152`, `server/pipeline/assembly.ts:78`, `server/pipeline/providers.ts:88-110` (`getDraftModel` and `getAssemblyModel`).

**Why this matters:** Opus pricing is `$15 / $75` per million input/output tokens. Sonnet 4.5 is `$3 / $15`. A cost or capacity discussion that assumes Opus will be 5× off.

---

## D2. Pipeline model pins — `ttml-pipeline-expert` says Sonnet 4 `20250514` for all Claude stages

**Stale source:** [`skills-audit/corrected/ttml-pipeline-expert/SKILL.md`](../../../skills-audit/corrected/ttml-pipeline-expert/SKILL.md) — line 4 description says "Perplexity → Claude Sonnet 4 → Claude Sonnet 4 → Claude Sonnet 4"; §2 table pins all of draft / assembly / vetting to `claude-sonnet-4-20250514`.

**Live code:**
- Draft + assembly = `claude-sonnet-4-5-20250929` (Sonnet **4.5**, not 4.0)
- Vetting (in-app pipeline) = `claude-sonnet-4-6-20250514` (Sonnet **4.6**)
- Vetting (LangGraph alternative) = `claude-sonnet-4-5-20250929` (Sonnet 4.5 — internal sub-drift, see D7 below)

**Verify in:** `server/pipeline/providers.ts:91,103`, `server/pipeline/vetting/index.ts:245,250,261,309`, `server/pipeline/graph/nodes/{draft,assembly,vetting}.ts`.

**Why this matters:** Sonnet 4 / 4.5 / 4.6 are different model snapshots with different training cutoffs and capabilities. Vetting hits 4.6 specifically because the vetting pass benefits from the newer instruction-following and citation accuracy.

---

## D3. Pipeline Stage 1 primary — `ttml-backend-patterns` says Perplexity is primary

**Stale source:** [`skills-audit/corrected/ttml-backend-patterns/SKILL.md`](../../../skills-audit/corrected/ttml-backend-patterns/SKILL.md) line ~319: "Stage 1: Perplexity sonar-pro (RESEARCH_TIMEOUT_MS = 90s)". Also `ttml-pipeline-expert` §2 says Perplexity sonar-pro is primary with OpenAI as failover.

**Live code:** Stage 1 primary is **OpenAI `gpt-4o-search-preview`** via the Responses API with the `webSearchPreview` tool. Perplexity `sonar-pro` is the **failover** (only used if `PERPLEXITY_API_KEY` is set). Final ungrounded fallback is Claude Sonnet 4.5, then Groq OSS.

**Verify in:** `server/pipeline/providers.ts:40-86` (`getResearchModel` returns OpenAI primary; `getResearchModelFallback` returns Perplexity if configured).

**Why this matters:** the agent should expect OpenAI quota / rate-limit issues to dominate Stage 1 failure modes, not Perplexity. The web-search grounding behaviour is also different between the two providers.

---

## D4. Single-letter pricing — listed as a live plan in older skills

**Stale source:** Several skills (`ttml-backend-patterns` §"Stripe Webhook", `ttml-payment-subscription-management`, `ttml-pipeline-expert` §"Paywall & Entitlement Gate") describe "$299 single letter via Stripe Checkout" as a live customer-facing path.

**Live code:** [`shared/pricing.ts`](../../../shared/pricing.ts) marks `PRICING.singleLetter` and `SINGLE_LETTER_PRICE_CENTS` as `@deprecated`. The comment is explicit: "Removed from public plans. Subscription-only for attorney review. Kept for backward compat with legacy Stripe products and existing customers."

`ALL_PLANS` and `PAID_PLANS` are `[monthly, yearly]` only. The `/pricing` page shows only subscription tiers.

**Verify in:** `shared/pricing.ts` lines 17-37 + 82-86.

**Why this matters:** new customers cannot buy a $299 one-off through the public flow. Any quote that includes "or buy a single letter for $299" is incorrect for new sign-ups. The legacy webhook handler is preserved so existing $299 customers' Stripe events still work.

---

## D5. Procedure-guard locations — `CLAUDE.md` says all guards live in `_core/trpc.ts`

**Stale source:** `CLAUDE.md` §3 ("RBAC Enforcement"): "Use tRPC procedure guards (`publicProcedure`, `protectedProcedure`, `subscriberProcedure`, `attorneyProcedure`, `adminProcedure`) from `server/_core/trpc.ts`."

**Live code:** Only the auth-level guards are in `server/_core/trpc.ts`. Role-level guards are in `server/routers/_shared.ts`:

| Guard | File |
|---|---|
| `publicProcedure` | `server/_core/trpc.ts` |
| `protectedProcedure` | `server/_core/trpc.ts` |
| `emailVerifiedProcedure` | `server/_core/trpc.ts` |
| `adminProcedure` | `server/_core/trpc.ts` |
| `superAdminProcedure` | `server/_core/trpc.ts` |
| **`subscriberProcedure`** | `server/routers/_shared.ts` |
| **`verifiedSubscriberProcedure`** | `server/routers/_shared.ts` |
| **`attorneyProcedure`** | `server/routers/_shared.ts` |
| **`employeeProcedure`** | `server/routers/_shared.ts` |

**Verify in:** `server/_core/trpc.ts` (entire file), `server/routers/_shared.ts:108-148`.

**Why this matters:** an agent looking for `subscriberProcedure` in `_core/trpc.ts` won't find it and may invent a duplicate. The shared file is the authoritative export.

---

## D6. Super-admin whitelist — `CLAUDE.md` mentions only `SUPER_ADMIN_EMAILS` in `supabaseAuth.ts`

**Stale source:** `CLAUDE.md` §4 ("Super Admin Whitelist"): "`SUPER_ADMIN_EMAILS` is hard-coded in `server/supabaseAuth.ts`." Same in `AGENTS.md` §7.5.

**Live code:** There are **two** whitelists, with different roles:

| Constant | File | Used by |
|---|---|---|
| `SUPER_ADMIN_EMAILS` | `server/supabaseAuth.ts` | User sync — gates promotion to `admin` role |
| `HARDCODED_OWNER_EMAILS = ["moizj00@gmail.com", "moizj00@yahoo.com"]` | `server/_core/trpc.ts` (~line 101) | `superAdminProcedure` — gates destructive operations (`forceStatusTransition`, `forceFreePreviewUnlock`) |

**Verify in:** `server/_core/trpc.ts:85-119`.

**Why this matters:** if you need to grant a new admin destructive-action access, modifying only `SUPER_ADMIN_EMAILS` is not enough — they also need to be in `HARDCODED_OWNER_EMAILS`. And vice versa: adding to `HARDCODED_OWNER_EMAILS` without admin role + 2FA doesn't help.

---

## D7. Internal pipeline drift — LangGraph vetting uses Sonnet 4.5, in-app vetting uses Sonnet 4.6

**Stale source:** N/A — both branches exist in live code; this is current internal drift.

**Live code:**
- In-app pipeline vetting: `claude-sonnet-4-6-20250514` (`server/pipeline/vetting/index.ts:245,261,309`).
- LangGraph alternative vetting: `claude-sonnet-4-5-20250929` (`server/pipeline/graph/nodes/vetting.ts:40,147`).

**Why this matters:** when comparing vetting quality between the two pipeline paths, this model difference is a confound. If LangGraph vetting appears to underperform, check whether the model pin is the cause vs. the graph node logic. Reconciling these two pins (or documenting the intentional split) is a candidate cleanup task.

---

## D8. Status count — TS has 21, pgEnum has 20

**Stale source:** Several skills (and informally `AGENTS.md`) speak of "the 15-status" or "20-status" machine without nailing the discrepancy.

**Live code:**
- `LETTER_STATUS` in `shared/types/letter.ts` has **21 keys** — includes `generated_unlocked` for legacy lookups in `ALLOWED_TRANSITIONS` / `STATUS_CONFIG`.
- `LETTER_STATUSES` tuple in `drizzle/schema/constants.ts:27-48` has **20 members** — `generated_unlocked` is NOT in the pgEnum because the state machine no longer reaches it as a current-letter state.

**Verify in:** `shared/types/letter.ts:18-40` (LETTER_STATUS), `drizzle/schema/constants.ts:27-48` (LETTER_STATUSES tuple).

**Why this matters:** if you write `status === LETTER_STATUS.generated_unlocked` it will compile and run, but the DB pgEnum will reject any INSERT/UPDATE that tries to set the column to `'generated_unlocked'`. Treat it as TS-only legacy.

---

## D9. n8nMcp.ts — listed as live in older docs, actually a stub

**Stale source:** Some older docs reference an n8n-MCP integration path in `server/n8nMcp.ts`.

**Live code:** `server/n8nMcp.ts` is an **empty deprecated stub** (removed 2026-04-16, per the `ttml-backend-patterns` skill note). There is no dependency on `@modelcontextprotocol/sdk` in `package.json`. The only n8n path that exists is the webhook callback in `server/n8nCallback.ts`, which is itself dormant unless `N8N_PRIMARY=true`.

**Why this matters:** there is no "n8n MCP tier" to debug or extend. Any documentation describing one is stale.

---

## D10. `remaining_letters` column does not exist

**Stale source:** Conversational references in older skills to a `remaining_letters` column on `subscriptions`.

**Live code:** The `subscriptions` table has `lettersAllowed` and `lettersUsed`. Compute the remaining count as `lettersAllowed - lettersUsed`. There is no `remaining_letters` column to read or write.

**Verify in:** `drizzle/schema/billing.ts` (subscriptions table).

---

## D11. Free-preview funnel — not described in older skills

**Stale source:** Most pre-existing skills describe the lifecycle as `submitted → researching → drafting → generated_locked → pending_review`.

**Live code:** Default path for new submissions now routes through the free-preview funnel: `submitted → researching → drafting → ai_generation_completed_hidden (24h hold) → letter_released_to_subscriber → attorney_review_upsell_shown → attorney_review_checkout_started → attorney_review_payment_confirmed → pending_review`. `generated_locked` is still in the transition table but is a legacy unlock path; the free-preview funnel is the customer-facing default.

**Verify in:** `shared/types/letter.ts` (`ALLOWED_TRANSITIONS`), `CLAUDE.md` §5 (full free-preview spec), `server/routers/letters/submit.ts` (sets `isFreePreview = TRUE` + `free_preview_unlock_at`).

---

## How to use this log

- **If you're about to act** on a claim about TTML's current state and that claim comes from a non-live-code source, cross-check it here. If it appears, treat the live code as authoritative.
- **If you discover a new drift**, add it here following the same format (stale source / live code / verify in / why this matters).
- **Don't fix the drifted docs in place** as part of an unrelated task — file a separate cleanup. The drift log is intentionally additive so the audit trail is preserved.

---

**Sources read:** all files cross-referenced in the entries above. Re-verify each entry's "Verify in" line before acting on it.
