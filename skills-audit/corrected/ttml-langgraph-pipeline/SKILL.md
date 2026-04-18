---
name: ttml-langgraph-pipeline
description: >
  Implementation expert for the TTML LangGraph pipeline — the 4-node StateGraph
  (research → draft → assembly → vetting → finalize/fail) that runs as an
  optional parallel entry point (gated by `LANGGRAPH_PIPELINE=true`) alongside
  the canonical in-app 4-stage pipeline and the dormant n8n path. Use
  AGGRESSIVELY whenever work touches `server/pipeline/graph/`,
  `server/pipeline/graph/nodes/`, `state.ts`, `index.ts`, or
  `pipeline_stream_chunks`. Trigger on: graph topology changes,
  adding/removing nodes, routing logic (`routeAfterVetting`), streaming tokens
  to Supabase Realtime, `LANGGRAPH_PIPELINE=true` env gate, finalize node,
  fail node, vetting retry loop, `errorRetryCount`, `qualityDegraded`, status
  transitions inside graph nodes, LangGraph imports (`@langchain/langgraph`),
  `pipeline_stream_chunks` table, `useLetterStream` React hook, AbortSignal
  timeouts, or any "letter is stuck in the LangGraph path" report.
  Also trigger when someone asks "how does LangGraph fit with n8n", "what happens
  when vetting fails", "why is the fail node unreachable", or "how does streaming work".
---

# TTML LangGraph Pipeline

Implementation reference for the TTML LangGraph StateGraph pipeline, established
April 2026. This is an **optional parallel entry point** — it runs instead of
the canonical in-app 4-stage pipeline when `LANGGRAPH_PIPELINE=true` is set on
the Railway worker service. The canonical pipeline and the dormant n8n chain
(active only when `N8N_PRIMARY=true`) remain intact.

## Where the code lives

```
server/pipeline/graph/
├── index.ts          — buildPipelineGraph(), runLangGraphPipeline(), streamLangGraphPipeline()
├── state.ts          — PipelineState (Annotation.Root), PipelineStateType
└── nodes/
    ├── research.ts   — Perplexity sonar-pro → Claude Opus (non-web-grounded) fallback
    ├── draft.ts      — Claude Opus streaming → pipeline_stream_chunks inserts
    ├── assembly.ts   — optional light assembly pass
    ├── vetting.ts    — Claude Sonnet QA vetting, returns VettingReport
    └── finalize.ts   — writes letter_versions row, transitions status
```

The worker checks `LANGGRAPH_PIPELINE=true` and calls `runLangGraphPipeline()` instead
of the in-app `runFullPipeline()`. The dormant n8n chain is unaffected.

## Graph topology

```
START
  │
  ▼
research  ──error──▶ errorRetryCount++
  │
  ▼
draft     ──error──▶ errorRetryCount++  (also streams tokens → pipeline_stream_chunks)
  │
  ▼
assembly  ──error──▶ errorRetryCount++
  │
  ▼
vetting   ──error──▶ errorRetryCount++
  │
  ├── qualityDegraded && retryCount < 2  ──▶  draft  (max 2 retries)
  ├── errorRetryCount >= 3 || !assembledLetter  ──▶  fail
  └── else  ──▶  finalize
  │
  ├── finalize ──▶ END
  └── fail     ──▶ END
```

**Key invariants:**
- All nodes except `finalize` and `fail` are wrapped with `withErrorRecovery()`, which
  catches any thrown error, increments `errorRetryCount`, and sets `currentStage: "error"`
  without crashing the graph.
- `vettingRouterNode` wraps `vettingNode` and increments `retryCount` if `qualityDegraded`.
- `routeAfterVetting` is the only conditional edge and owns all routing logic.

## `routeAfterVetting` — routing rules (post-audit canonical form)

```typescript
function routeAfterVetting(state: PipelineStateType): string {
  const { qualityDegraded, retryCount, errorRetryCount, assembledLetter } = state;

  // Fail fast: too many node errors OR no draft content ever produced
  if (errorRetryCount >= 3 || !assembledLetter) {
    return "fail";
  }

  // Redraft: vetting flagged quality issues and we have retries left
  if (qualityDegraded && retryCount < 2) {
    return "draft";
  }

  return "finalize";
}
```

**CRITICAL — `addConditionalEdges` must include `fail: "fail"` in the target map:**

```typescript
.addConditionalEdges("vetting", routeAfterVetting, {
  draft: "draft",
  finalize: "finalize",
  fail: "fail",   // ← REQUIRED — without this, returning "fail" crashes the graph
})
```

Without the `fail` key in the map, LangGraph throws at runtime when `routeAfterVetting`
returns `"fail"`. The `fail` node must be registered AND wired. Do not leave it as
dead code.

## The fail node

```typescript
export async function failNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  await updateLetterStatus(letterId, "pipeline_failed");
  return { currentStage: "failed", messages: [...] };
}
```

`pipeline_failed` is a valid `ALLOWED_TRANSITIONS` target from `drafting`. From
`pipeline_failed`, users can resubmit (transitions to `submitted`).

## State shape (`PipelineStateType`)

| Field | Type | Reducer | Purpose |
|-------|------|---------|---------|
| `letterId` | `number` | last-write | Primary key into `letter_requests` |
| `userId` | `number` | last-write | For notifications |
| `intake` | `Record<string, any>` | last-write | Raw intake JSON |
| `messages` | `BaseMessage[]` | **append** | LangChain message history |
| `qualityWarnings` | `string[]` | **append** | Accumulates across retries |
| `researchPacket` | `Record | null` | last-write | Perplexity/Claude output |
| `researchProvider` | `string` | last-write | "perplexity" or "anthropic-fallback" |
| `researchUnverified` | `boolean` | last-write | True when Claude fallback used |
| `assembledLetter` | `string` | last-write | Full letter text after assembly |
| `vettedLetter` | `string` | last-write | Same text (vetting evaluates, doesn't rewrite) |
| `qualityDegraded` | `boolean` | last-write | Vetting flagged serious issues |
| `retryCount` | `number` | last-write | Draft redraft iterations (max 2) |
| `errorRetryCount` | `number` | last-write | Node-level error count (fail at 3) |
| `lastErrorStage` | `string` | last-write | Which node last threw |
| `vettingReport` | `Record | null` | last-write | Full VettingReport JSON |
| `workflowJobId` | `number` | last-write | FK to `workflow_jobs` |
| `currentStage` | `string` | last-write | Tracking / error routing hint |

Note: `messages` and `qualityWarnings` use **append reducers** — do not overwrite them,
only extend them. All other fields use last-write reducers.

## finalize node — hard rules

The finalize node must use ONLY the canonical helpers, never raw Drizzle. This was
a deployment bug found April 2026 and fixed before launch.

```typescript
// CORRECT — use canonical helpers
await db.update(letterRequests).set({ researchUnverified, qualityDegraded, updatedAt: new Date() })
  .where(eq(letterRequests.id, letterId));                 // quality flags only — no status
await updateLetterVersionPointers(letterId, { currentAiDraftVersionId: versionId });
await updateLetterStatus(letterId, "generated_locked");   // enforces ALLOWED_TRANSITIONS

// WRONG — never do this
await db.update(letterRequests).set({ status: "generated_locked" }).where(...); // bypasses state machine
```

**Why:** `updateLetterStatus()` enforces `ALLOWED_TRANSITIONS`, writes `review_actions`
audit rows, and is the single source of truth for state transitions. Raw Drizzle status
updates silently bypass all of this. The transition `drafting → generated_locked` is
valid per `shared/types/letter.ts`.

## draft node — streaming to Supabase Realtime

The draft node streams Claude Opus tokens into the `pipeline_stream_chunks` table so
the frontend's `useLetterStream` hook can show live generation progress.

```typescript
// Requires env vars on the worker service:
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

// Streaming config constants:
DRAFT_TIMEOUT_MS = 120_000          // AbortSignal hard cap on the LLM call
STREAM_FLUSH_INTERVAL_MS = 300      // Flush to Supabase every 300ms
STREAM_MIN_BUFFER_CHARS = 50        // Min chars before an early flush
```

The draft node uses `AnySupabaseClient` (typed as `SupabaseClient<any>`) because the
generated Supabase DB types do not include `pipeline_stream_chunks` — the table was
added via a standalone Supabase migration, not a Drizzle migration. This is intentional.

If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, streaming is disabled
gracefully — the draft still runs, chunks just aren't written. The letter generation
itself does not fail.

## `pipeline_stream_chunks` table

Applied to Supabase production April 14, 2026 via
`supabase/migrations/20260414000001_pipeline_stream_chunks.sql`.

```sql
CREATE TABLE pipeline_stream_chunks (
  id              bigserial PRIMARY KEY,
  letter_id       integer NOT NULL REFERENCES letter_requests(id) ON DELETE CASCADE,
  chunk_text      text NOT NULL,
  stage           varchar(50) NOT NULL DEFAULT 'draft',
  sequence_number integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

**RLS policies** (aligned with TTML's existing `app_user_id()` / `is_app_employee_or_admin()` helpers):
- `stream_chunks_select_own`: users see chunks for their own letters via `app_user_id()`
- `stream_chunks_select_staff`: employees/admins see all via `is_app_employee_or_admin()`
- No INSERT policy needed — service role key bypasses RLS.

**Important:** The original migration used `u.supabase_auth_id` but TTML's `users` table
has no such column — it uses `open_id`. Use `app_user_id()` instead. This was caught
on apply and corrected.

The table is published to `supabase_realtime` so `postgres_changes` subscriptions fire.
A `cleanup_old_stream_chunks()` procedure deletes rows older than 24h (schedule via pg_cron).

## research node

Primary: Perplexity `sonar-pro` (REST, 90s timeout)
Fallback: **Claude Opus** (non-web-grounded; sets `researchUnverified=true`)

If both fail, the node throws — `withErrorRecovery` catches it and increments `errorRetryCount`.

## vetting node

Uses **Claude Sonnet**, 60s timeout. Exact dated model ID lives in code; refer to the brand here.
Returns a `VettingReport`:

```typescript
interface VettingReport {
  riskLevel: "low" | "medium" | "high" | "critical";
  qualityDegraded: boolean;  // true → triggers redraft
  jurisdictionIssues: string[];
  citationsFlagged: string[];
  factualIssuesFound: string[];
  overallScore: number;      // 0-10, <6 → qualityDegraded should be true
  summary: string;
  recommendations: string[];
}
```

If JSON parsing fails, vetting returns a safe default (`qualityDegraded: false, score: 7`)
so the pipeline doesn't get stuck. `retryCount` is passed to the vetting prompt — on
retry #1+, the model is instructed to be more lenient about minor issues.

## Activation

Set `LANGGRAPH_PIPELINE=true` on the Railway **worker** service (not the app service).
The app service doesn't run the pipeline — the worker does.

Required env vars on the worker for LangGraph path:
- `ANTHROPIC_API_KEY` — draft, vetting, and Claude fallback research
- `PERPLEXITY_API_KEY` — research node primary (graceful fallback to Claude Opus if absent)
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — streaming chunks (graceful fallback if absent)
- `DATABASE_URL` — Drizzle ORM access (always required)

## Known bugs fixed before launch (April 2026 audit)

| Bug | Symptom | Fix |
|-----|---------|-----|
| finalize bypassed state machine | Raw Drizzle `.set({ status: "generated_locked" })` — no audit rows, no transition validation | Replaced with `updateLetterStatus()` + `updateLetterVersionPointers()` |
| fail node unreachable | `routeAfterVetting` never returned `"fail"`; `routeAfterError` defined but never wired; `fail` key missing from `addConditionalEdges` map | Rewrote routing function with `errorRetryCount >= 3 \|\| !assembledLetter` check; added `fail: "fail"` to edge map |
| Migration 0044 missing from journal | `drizzle/0044_startup_migrations_extraction.sql` on disk but `_journal.json` jumped from idx 43 → 45 — fresh DB would skip `pipeline_locked_at`, enum values, `intake_form_templates` | Added idx 44 entry to `drizzle/meta/_journal.json` |

## State machine (pipeline-relevant subset)

```
submitted → researching → drafting → generated_locked → pending_review → ...
submitted → pipeline_failed → submitted (retry)
researching → pipeline_failed
drafting → pipeline_failed
```

The LangGraph pipeline calls:
- `researchNode`: `submitted → researching`
- `draftNode`: `researching → drafting`  (note: skips `submitted → researching` since research already set it)
- `finalizeNode`: `drafting → generated_locked`
- `failNode`: current → `pipeline_failed`

All transitions go through `updateLetterStatus()` in `server/db.ts`. Never use raw SQL or
Drizzle for status fields.

## Model ID discipline

Exact Anthropic/Perplexity model pins live in `server/pipeline/orchestrator.ts` and
`server/pipeline/providers.ts`. Skill files reference the **brand** ("Claude Opus",
"Claude Sonnet", "Perplexity `sonar-pro`") so documentation doesn't rot every release.
