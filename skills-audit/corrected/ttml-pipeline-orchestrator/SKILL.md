---
name: ttml-pipeline-orchestrator
description: 'Implementation expert for the TTML pipeline with its 3-tier (n8n MCP → n8n webhook → in-app 4-stage) fallback chain. The n8n tiers are dormant by default and only active when `N8N_PRIMARY=true`. Use AGGRESSIVELY whenever work touches `server/pipeline/`, `server/worker.ts`, `server/queue.ts`, `server/n8nMcp.ts`, or a letter moving through `submitted → researching → drafting → generated_locked`. Trigger on: `runFullPipeline`, `triggerN8nPipeline`, `processN8nSyncResult`, n8n MCP, pg-boss, `workflow_jobs`, `research_runs`, `letter_versions`, Perplexity/Claude vetting, `acquirePipelineLock`, stuck letters, `pipeline_failed`, `ALLOWED_TRANSITIONS`, MCP tool selection, `N8N_MCP_URL`/`N8N_MCP_BEARER_TOKEN`/`N8N_PRIMARY`, `SUPABASE_DIRECT_URL` IPv4 gotcha, adding a new stage or AI provider. Also "kick off a letter", "letter is stuck", "n8n failed over". Implementation companion to `ttml-pipeline-expert`.'
---

# TTML Pipeline Orchestrator

Implementation-level reference for the TTML pipeline. Every letter starts with a form submission. The canonical path is the **in-app 4-stage Perplexity → Claude Opus → Claude Opus → Claude Sonnet pipeline**. When `N8N_PRIMARY=true` is set, a 3-tier fallback chain activates: n8n MCP (tier 1) → n8n webhook (tier 2) → in-app 4-stage (tier 3, last resort). With `N8N_PRIMARY` unset, requests go straight to the in-app pipeline.

This skill tells you exactly where the code lives, what contracts it obeys, and how to extend or debug it without breaking the state machine.

Complement to `ttml-pipeline-expert` (domain/strategy). Use that skill for "what should happen"; use this one for "where does it happen and how do I safely change it".

## When to use

Reach for this skill any time the work touches:

- `server/pipeline/orchestrator.ts`, `research.ts`, `drafting.ts`, `vetting.ts`, `assembly.ts`, `providers.ts`, `citations.ts`, `fallback.ts`, `validators.ts`
- `server/n8nMcp.ts` (MCP client), `server/n8nCallback.ts` (async callback endpoint)
- `server/worker.ts`, `server/queue.ts` (pg-boss)
- `server/db/pipeline-records.ts`, `server/db/letters.ts`, `server/db/letter-versions.ts`
- `drizzle/schema/letters.ts` tables: `letterRequests`, `workflowJobs`, `researchRuns`, `letterVersions`
- `shared/types/pipeline.ts` (`IntakeJson`, `ResearchPacket`, `DraftOutput`, `PipelineContext`, `PipelineError`)
- `shared/types/letter.ts` (`ALLOWED_TRANSITIONS`)
- A user reporting "letter #123 is stuck" or "pipeline failed"
- Adding a new AI provider, a new pipeline stage, a new `job_type`, or a new n8n tool
- Any SQL touching letter status or `workflow_jobs` history

## Canonical flow (with optional 3-tier chain)

```
┌────────────────┐   POST     ┌──────────────────┐   INSERT
│  Intake form   │ ─────────▶ │  tRPC letters.*  │ ─────────▶ letterRequests (status='submitted')
└────────────────┘            └────────┬─────────┘                        │
                                       │ enqueuePipelineJob()              │
                                       ▼                                   │
                              ┌─────────────────────┐                      │
                              │  pg-boss queue      │  singletonKey=letter-{id}
                              │ (Supabase Postgres) │                      │
                              └────────┬────────────┘                      │
                                       ▼                                   ▼
                              ┌────────────────────┐         acquirePipelineLock()
                              │  server/worker.ts  │         3 retries, 10s exp backoff
                              │  processRunPipeline│
                              └────────┬───────────┘
                                       ▼
                          ┌──────────────────────────────┐
                          │ orchestrator.runFullPipeline │
                          └──────────────┬───────────────┘
                                         │
             ┌───────────────────────────┼───────────────────────────┐
             │                           │                           │
             ▼                           ▼                           ▼
   ┌─────────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
   │  TIER 1: n8n MCP    │ ──▶ │  TIER 2: webhook    │ ──▶ │ TIER 3: in-app        │
   │  (dormant unless    │ fail│  (dormant unless    │ fail│ 4-stage pipeline      │
   │   N8N_PRIMARY=true) │     │   N8N_PRIMARY=true) │     │ Perplexity sonar-pro  │
   │  triggerN8nPipeline │     │  POST N8N_WEBHOOK   │     │ → Claude Opus (draft) │
   │  StreamableHTTP+JWT │     │  X-Auth-Token       │     │ → Claude Opus (asm)   │
   │                     │     │                     │     │ → Claude Sonnet (vet) │
   └──────────┬──────────┘     └──────────┬──────────┘     └────────┬─────────────┘
              │                           │                          │
              │ sync result?              │ async ack                 │ always sync
              ├─ yes: processN8nSyncResult│                           │
              └─ no:  await async callback at /api/pipeline/n8n-callback
                                          │
                                          ▼
                            writes to workflow_jobs, research_runs, letter_versions
                            transitions letterRequests.status via updateLetterStatus
                            finalizes → generated_locked
```

**Key fact:** `preflightApiKeyCheck()` is only run **when tier 1 and tier 2 are both skipped or both failed**. With `N8N_PRIMARY` unset (default), the chain skips straight to tier 3 and preflight runs every time.

## The decision to enter n8n mode

Orchestrator pseudocode (see `runFullPipeline` in `server/pipeline/orchestrator.ts`):

```ts
const useN8nPrimary    = process.env.N8N_PRIMARY === "true";
const n8nMcpConfigured = isN8nMcpConfigured();                   // url + token present
const hasWebhookFallback = !!n8nWebhookUrl && n8nWebhookUrl.startsWith("https://");

if (useN8nPrimary && (n8nMcpConfigured || hasWebhookFallback)) {
  // create workflow_job with provider = n8nMcpConfigured ? "n8n-mcp" : "n8n"
  // transition to 'researching'
  // try Strategy 1: MCP
  // try Strategy 2: webhook
  // on success: return. on both-failed: mark job failed, fall through to tier 3
}

// Tier 3: in-app pipeline (default path)
preflightApiKeyCheck("full");
markPriorPipelineRunsSuperseded(letterId);
// Stage 1..4
```

**So:** by default the in-app pipeline runs. To opt into n8n primary, set `N8N_PRIMARY=true` and `N8N_MCP_URL` + `N8N_MCP_BEARER_TOKEN`; leave `N8N_WEBHOOK_URL` unset to skip tier 2.

## Tier 1: n8n MCP (`server/n8nMcp.ts`) — dormant by default

The primary n8n path when `N8N_PRIMARY=true`. Uses `@modelcontextprotocol/sdk` with `StreamableHTTPClientTransport` and a `Bearer <token>` header.

### Config

| Env var | Purpose | Required when N8N_PRIMARY=true |
|---------|---------|---------------------|
| `N8N_MCP_URL` | MCP endpoint (e.g. `https://designtec.app.n8n.cloud/mcp/...`) | **yes** |
| `N8N_MCP_BEARER_TOKEN` | Auth token for the MCP endpoint | **yes** |
| `N8N_MCP_TOOL_NAME` | Explicit tool name override | optional |
| `N8N_PRIMARY` | Must be `"true"` to even attempt tier 1/2 | **yes** |

`isN8nMcpConfigured()` returns true iff `N8N_MCP_URL` and `N8N_MCP_BEARER_TOKEN` are both non-empty.

### Public API

```ts
import {
  isN8nMcpConfigured,
  listN8nTools,         // () => Promise<N8nMcpToolInfo[]>
  callN8nTool,          // (toolName, args) => Promise<N8nMcpCallResult>
  triggerN8nPipeline,   // (payload: N8nPipelinePayload) => Promise<N8nMcpCallResult>
  resetN8nMcpClient,    // force reconnect
} from "./n8nMcp";
```

### Client lifecycle

- Single `_client: Client | null` module-level singleton
- `_connecting: boolean` prevents concurrent connect attempts
- `RECONNECT_COOLDOWN_MS = 30_000` — after a failed connect, no retries for 30s
- On any `listTools`/`callTool` failure, `resetClient()` is called — the next call will reconnect (after cooldown)
- `_discoveredToolName` caches tool name resolution across calls

### Deterministic tool selection (`resolveToolName`)

Strict priority order:

1. **`N8N_MCP_TOOL_NAME` env var** — if set and the tool exists on the server, use it. If set but not found, **abort with an error** (do not fall back to auto-discovery — an explicit override that doesn't exist is a configuration bug).
2. **Cached `_discoveredToolName`** — if previously resolved and still present in the list, use it.
3. **Single-tool auto-select** — if the server exposes exactly one tool, use it.
4. **Keyword match** — look for a tool whose name (lowercased) contains any of: `"legal-letter"`, `"letter-submission"`, `"legal-pipeline"`, `"ttml"`. First match wins.
5. **No match → fail loudly** — log `"Could not identify the correct pipeline tool. Set N8N_MCP_TOOL_NAME env var to specify explicitly."` and return null.

### The payload (`N8nPipelinePayload`)

```ts
{
  letterId, letterType, userId,
  callbackUrl,       // ${APP_BASE_URL}/api/pipeline/n8n-callback
  callbackSecret,    // N8N_CALLBACK_SECRET — used for async callback auth
  intakeData: { sender, recipient, jurisdictionState, jurisdictionCountry, matter, desiredOutcome, letterType, tonePreference?, financials?, additionalContext? },
  normalizedInput?,  // from buildNormalizedPromptInput()
}
```

The tool call is made with `timeout: 120_000` (2 min hard cap).

### Sync vs async detection

After a successful MCP call, the orchestrator inspects `mcpResult.content`:

```ts
const hasSyncResult =
  mcpContent &&
  typeof mcpContent === "object" &&
  typeof mcpContent !== "string" &&
  ("vettedLetter" in mcpContent || "assembledLetter" in mcpContent || "draftContent" in mcpContent);
```

- **Sync result present** → `processN8nSyncResult(letterId, mcpContent)` processes it inline. If that returns `true`, the workflow job is marked `completed` with `mode: "n8n-mcp-sync"` and the run is done.
- **Sync result absent (just an ack)** → mark workflow job still `running` with `mode: "n8n-mcp-async"` and return. The actual draft arrives later via `POST /api/pipeline/n8n-callback`.

If `processN8nSyncResult` returns `false` (no usable draft in the response), the workflow job is marked `failed` with `N8N_ERROR` and the orchestrator falls through to tier 2.

## `processN8nSyncResult` — what it does

Located in `server/pipeline/orchestrator.ts`. **Critical**: this function is the sync-path equivalent of the async n8n callback handler. If you change one, audit the other.

`N8nPipelineResult` from `server/n8nMcp.ts`:
```ts
{
  letterId, success,
  researchPacket?, draftOutput?,
  assembledLetter?, vettedLetter?,
  vettingReport?,            // { citationsVerified, citationsRemoved, citationsFlagged[], bloatPhrasesRemoved[], jurisdictionIssues[], factualIssuesFound[], changesApplied[], overallAssessment, riskLevel }
  researchOutput?,           // legacy string form
  draftContent?,             // legacy string form
  provider?, stages?, bloatDetected?,
  error?,
}
```

Processing order:

1. **Pick the best draft**:
   `effectiveFinalLetter = vettedLetter || assembledLetter`
   `effectiveDraft = effectiveFinalLetter || draftOutput?.draftLetter || draftContent`
   If neither → return `false` (caller falls through to webhook/in-app).

2. **Classify the shape** and tag the provider:
   - `hasVetting = !!(vettedLetter && vettingReport)` → provider `"n8n-mcp-4stage"`
   - `isAligned = !!(researchPacket && draftOutput && assembledLetter)` → provider `"n8n-mcp-3stage"`
   - Otherwise → provider `"n8n-mcp-sync"` (legacy shape)

3. **Transition** `researching → drafting` via `updateLetterStatus()`, log a `status_transition` review action.

4. **Insert the draft `letter_versions` row** (`versionType: "ai_draft"`) with metadata. Point `currentAiDraftVersionId` to it via `updateLetterVersionPointers`.

5. **Store the research version** separately (if `researchPacket.researchSummary` exists) — another `letter_versions` row with `stage: "research"` metadata.

6. **Transition to `generated_locked`**:
   - If `isAligned || hasVetting` → transition directly and log `ai_pipeline_completed` with the stages joined by ` → `.
   - Otherwise (legacy n8n output) → try `runAssemblyStage()` locally. If local assembly throws, still transition to `generated_locked` using the raw n8n draft.

7. **Paywall + unlock coordination** (only when local assembly did not handle emails):
   - `hasLetterBeenPreviouslyUnlocked(letterId)`
   - `autoAdvanceIfPreviouslyUnlocked(letterId)` — if this letter was unlocked before, skip the paywall and advance to `pending_review`

8. **Return `true`** — signals to `runFullPipeline` that the letter is done and it should NOT fall through.

**Hard rule:** the workflow job must only be marked `"completed"` **after** `processN8nSyncResult` returns `true`. If it returns `false`, the job is marked `"failed"` and tier 2 runs.

## Tier 2: legacy webhook — dormant by default

Activates only when `N8N_PRIMARY=true` AND `hasWebhookFallback = true` (`N8N_WEBHOOK_URL` set and starts with `https://`).

```ts
POST <N8N_WEBHOOK_URL>
Headers:
  Content-Type: application/json
  X-Auth-Token: <N8N_CALLBACK_SECRET>
Body: <same payload as MCP>
Timeout: AbortSignal.timeout(10_000)   // 10 seconds — this is just an ACK
```

On a 2xx response, the workflow job is marked `running` with `mode: "n8n-webhook-async"` — the actual letter content arrives later via the callback endpoint. On non-2xx or any throw, fall through to tier 3.

## Tier 3: in-app 4-stage pipeline (canonical default)

Runs when:
- `N8N_PRIMARY !== "true"` (default), OR
- `N8N_PRIMARY === "true"` but neither MCP nor webhook is configured, OR
- Both tier 1 and tier 2 failed.

This is the canonical pipeline. It is the default and must remain present.

1. **`preflightApiKeyCheck("full")`** — verifies `PERPLEXITY_API_KEY`, `ANTHROPIC_API_KEY`. Throws `PipelineError("API_KEY_MISSING")` if missing.
2. **`markPriorPipelineRunsSuperseded(letterId)`**.
3. **Create a `workflow_jobs` row** with `provider: "multi-provider"` and stages `["perplexity-sonar-pro-research", "anthropic-opus-draft", "anthropic-opus-assembly", "anthropic-sonnet-vetting"]`.
4. **Stage 1 — Research:** `runResearchStage` → `{ packet, provider }`. Perplexity `sonar-pro` via direct API. Writes a `research_runs` row + `workflow_jobs` row.
5. **Citation revalidation:** `applyResearchGroundingAndRevalidate` — skipped when research is unverified, 0 or <3 citations, KV cache hit, or all citations already high-confidence.
6. **Stage 2 — Drafting:** `runDraftingStage` → `DraftOutput`. **Claude Opus**. Captures `_intermediateDraftContent` into the content registry.
7. **Stages 3 + 4 — Assembly + Vetting loop:** `runAssemblyVettingLoop` → `{ vettingResult, assemblyRetries }`. **Claude Opus** assembly + **Claude Sonnet** vetting. Iterative — can re-run assembly if vetting flags critical issues.
8. **Finalize:** `finalizeLetterAfterVetting` writes the final `letter_versions` row, updates `currentVersionId`, transitions to `generated_locked`.
9. **Mark `workflow_jobs.status = "completed"`** with token totals and estimated cost (via `calculateCost`).

`_intermediateContentRegistry` (module-level `Map<number, {content, qualityWarnings}>`) is how the worker salvages partial drafts after a failure.

## Real schema (do not invent parallel tables)

### `letter_requests` (the "run")
`drizzle/schema/letters.ts`. One row per form submission. Key columns:
- `id`, `status` → `letter_status` enum
- `intakeJson` (jsonb)
- `pipelineLockedAt` — held by `acquirePipelineLock()`
- `researchUnverified`, `webGrounded`, `qualityDegraded`, `qualityWarnings`
- `currentVersionId` → points to `letter_versions.id`

### `workflow_jobs` (one row per pipeline invocation OR AI call)
```ts
workflowJobs = pgTable("workflow_jobs", {
  id, letterRequestId,
  jobType,            // "research" | "draft_generation" | "generation_pipeline" | "retry" | "vetting" | "assembly"
  provider,           // "n8n-mcp" | "n8n" | "multi-provider" | "perplexity" | "anthropic" | ...
  status,             // "queued" | "running" | "completed" | "failed"
  attemptCount, errorMessage,
  requestPayloadJson, responsePayloadJson,
  promptTokens, completionTokens, estimatedCostUsd,
  startedAt, completedAt, createdAt, updatedAt,
})
```

When an n8n run starts, a single `generation_pipeline` row is created with `provider: "n8n-mcp"` or `"n8n"`. When the in-app path runs, a separate `generation_pipeline` row is created with `provider: "multi-provider"`, plus additional rows per stage.

### `research_runs` — Perplexity cache + provenance
Cached by `cacheKey` built in `server/kvCache.ts`. `cacheHit=true` means Stage 1 was served from KV.

### `letter_versions` — immutable draft history
`versionTypeEnum: "ai_draft" | "attorney_edit" | "final_approved"`. `ai_draft` is immutable. Attorney edits INSERT a new `attorney_edit` row and re-point `currentVersionId`.

## State machine (source of truth)

`shared/types/letter.ts` — `ALLOWED_TRANSITIONS`. Pipeline only owns the first three rows; everything from `generated_locked` onward is human-driven.

```ts
submitted           → researching | pipeline_failed
researching         → drafting | submitted | pipeline_failed
drafting            → generated_locked | submitted | pipeline_failed
generated_locked    → pending_review
pending_review      → under_review
under_review        → approved | rejected | needs_changes | pending_review
needs_changes       → submitted | pending_review
approved            → sent | client_revision_requested | client_approval_pending
client_approval_pending → client_approved | client_revision_requested | client_declined
client_revision_requested → pending_review | under_review
client_approved     → sent
rejected            → submitted
pipeline_failed     → submitted
sent | client_declined → (terminal)
```

**Never write `UPDATE letter_requests SET status = ...` from pipeline code.** Always go through `updateLetterStatus()` which enforces `isValidTransition(from, to)`.

## Queue: pg-boss on Supabase Postgres

`server/queue.ts`. There is no Redis or BullMQ in TTML.

**Critical env setup** — get this wrong and the queue silently breaks:

1. **`SUPABASE_DIRECT_URL`** — port **5432**, NOT 6543. pg-boss needs `LISTEN/NOTIFY`, which does not work through PgBouncer/pooler.
2. **IPv4 DNS forcing** — `dns.setDefaultResultOrder("ipv4first")` at the top of both `queue.ts` and `worker.ts`. Railway resolves Supabase hostnames to IPv6 which is unreachable (ENETUNREACH).
3. **`resolveConnectionToIPv4()`** — further rewrites the hostname to an IPv4 literal before handing the connection string to pg-boss.

Queue policy:
```ts
policy: "standard"             // NOT key_strict_fifo — that permanently blocks retries
retryLimit: 0                  // worker handles retries, not pg-boss
expireInSeconds: 30 * 60
deleteAfterSeconds: 7 * 24 * 60 * 60
retentionSeconds: 30 * 24 * 60 * 60
```

**Deduplication is app-level** via `acquirePipelineLock(letterId)` in `worker.ts` (conditional UPDATE on `pipeline_locked_at`). The `singletonKey: letter-{id}` on `boss.send()` is just a hint.

### Job types

```ts
type PipelineJobType = "runPipeline" | "retryPipelineFromStage";

enqueuePipelineJob({ type: "runPipeline", letterId, intake, userId, appUrl, label, usageContext? })
enqueueRetryFromStageJob({ type: "retryPipelineFromStage", letterId, intake, stage: "research" | "drafting", userId })
```

Returns a job id, or `*-deduplicated` sentinel if a dupe was suppressed.

## Worker: `server/worker.ts`

`processRunPipeline(data)` — order of operations (do not reorder):

1. **`acquirePipelineLock(letterId)`** — if already held, log and return. No double-runs.
2. **`preflightApiKeyCheck("full")`** — see note below. If missing, set `pipeline_failed`, release lock, throw `API_KEY_MISSING`.
3. **`markPriorPipelineRunsSuperseded(letterId)`**.
4. **Retry loop** — `PIPELINE_MAX_RETRIES = 3`, `PIPELINE_BASE_DELAY_MS = 10_000` exponential. Between attempts, re-check letter status against `["submitted","researching","drafting","pipeline_failed"]` — if someone moved it forward, abort.
5. **On exhaustion:** `bestEffortFallback(letterId, consumeIntermediateContent(letterId))`, then fail.
6. **`releasePipelineLock(letterId)`** in a finally block.

**Preflight nuance with n8n primary:** the worker's `preflightApiKeyCheck("full")` still runs before calling `runFullPipeline`. The check requires Perplexity + Anthropic. Even when n8n is intended to be primary, these keys still gate the run because the worker cannot know in advance whether n8n will succeed or the pipeline will fall through to tier 3. **Do not remove the worker-side preflight**.

## Providers: `server/pipeline/providers.ts` (tier 3)

Used when the in-app pipeline runs. **Rule:** every in-app AI call goes through a function here. Never `createAnthropic()` or `createOpenAI()` inline elsewhere.

| Stage | Function | Brand | Provider string |
|------|----------|-------|-----------------|
| Research | `getResearchModel()` | Perplexity `sonar-pro` (OpenAI-compatible baseURL) | `"perplexity"` or `"anthropic-fallback"` |
| Drafting | `getDraftModel()` | **Claude Opus** | `"anthropic"` |
| Assembly | `getAssemblyModel()` | **Claude Opus** | `"anthropic"` |
| Vetting  | `getVettingModel()` | **Claude Sonnet** | `"anthropic"` |

> Exact model pins live in `providers.ts` — refer to brands here.

> **Note:** OpenAI GPT-4o is used **only** for the document analyzer (`documents.analyze` tRPC procedure / `document_analyses` table), not for letter drafting.

Timeout constants — all 90s:
```ts
RESEARCH_TIMEOUT_MS = 90_000
DRAFT_TIMEOUT_MS    = 90_000
ASSEMBLY_TIMEOUT_MS = 90_000
```

Every `generateText()` call in a stage file passes `abortSignal: AbortSignal.timeout(<const>)`. **If you add a new AI call and forget the abort signal, the pipeline will hang.**

### Token accounting

```ts
const tokens = createTokenAccumulator();
const { text, usage } = await generateText({ /* ... */ });
accumulateTokens(tokens, usage);
const cost = calculateCost(modelKey, tokens);
await updateWorkflowJob(jobId, { status: "completed", promptTokens, completionTokens, estimatedCostUsd: cost, completedAt: new Date() });
```

`MODEL_PRICING` is a hardcoded map in `providers.ts`. **When adding a new model, add its entry or `calculateCost()` silently returns `"0"`.**

## PipelineError and error classification

From `shared/types/pipeline.ts`:

```ts
PIPELINE_ERROR_CODES: JSON_PARSE_FAILED, CITATION_VALIDATION_FAILED, WORD_COUNT_EXCEEDED,
  API_TIMEOUT, RATE_LIMITED, GROUNDING_CHECK_FAILED, CONTENT_POLICY_VIOLATION,
  ASSEMBLY_STRUCTURE_INVALID, VETTING_REJECTED, RESEARCH_VALIDATION_FAILED,
  DRAFT_VALIDATION_FAILED, JURISDICTION_MISMATCH, INTAKE_INCOMPLETE,
  API_KEY_MISSING, N8N_ERROR, SUPERSEDED, UNKNOWN_ERROR
```

Each code is `"transient"` or `"permanent"` in `PIPELINE_ERROR_CATEGORY`. The worker retry loop **does not retry permanent errors**.

```ts
throw new PipelineError(
  PIPELINE_ERROR_CODES.DRAFT_VALIDATION_FAILED,
  "Draft had <3 citations",
  "drafting",
  "See workflow_jobs.error_message for full validation report",
);
```

## Adding a new pipeline stage — checklist

Do these in order. Skipping any one breaks something downstream.

1. **Decide where the stage runs:** n8n workflow (add as a node in the n8n tool), in-app (`server/pipeline/`), or both. If both, the n8n workflow needs to return the new field in its result and `processN8nSyncResult` needs to persist it.
2. **Extend the enum:** add the new value to `jobTypeEnum` in `drizzle/schema/constants.ts`. Generate a migration: `pnpm drizzle-kit generate` → `pnpm drizzle-kit migrate` (or apply via `supabase-mcp-sync` skill).
3. **Add the model function** in `providers.ts`: `getMyNewStageModel()` + fallback + timeout constant + `MODEL_PRICING` entry.
4. **Create the stage file** `server/pipeline/my_new_stage.ts`. Follow the existing shape:
   - Exports `runMyNewStage(letterId, intake, prior, pipelineCtx): Promise<MyStageOutput>`
   - Wraps `generateText({ abortSignal: AbortSignal.timeout(MY_TIMEOUT_MS) })`
   - Calls `createWorkflowJob(...)` **before** the AI call with `status: "running"`, `startedAt: new Date()`, `requestPayloadJson`
   - On success: `updateWorkflowJob(jobId, { status: "completed", responsePayloadJson, promptTokens, completionTokens, estimatedCostUsd, completedAt })`
   - On failure: `updateWorkflowJob(jobId, { status: "failed", errorMessage })` and `throw new PipelineError(...)`
   - Uses `withModelFailover()` from `pipeline/shared.ts` for auto primary→fallback switching
5. **Export** from `server/pipeline/index.ts`.
6. **Wire it into `runFullPipeline`** (the tier 3 section) at the right step. Also update `processN8nSyncResult` if the n8n result shape grew a new field for this stage.
7. **Update state machine** only if this stage needs a new `letter_requests.status` value: add to `letterStatusEnum` AND `ALLOWED_TRANSITIONS` AND `STATUS_CONFIG`. Migrate.
8. **Add a stage test** in `server/pipeline/stages.test.ts`.
9. **Update `ttml-pipeline-expert`** to reflect the new stage at the domain level.

## Adding a new AI provider (in-app / tier 3) — checklist

1. Install the SDK.
2. Add `getXClient()` in `providers.ts` that reads `process.env.X_API_KEY` and throws if missing.
3. Add `getXModel()` returning whatever shape the stage expects.
4. Add the model to `MODEL_PRICING` — otherwise `calculateCost` returns `"0"` silently.
5. Add `X_API_KEY` to `preflightApiKeyCheck()` so missing keys fail fast.
6. Every call passes `abortSignal: AbortSignal.timeout(...)`.
7. Document the env var in the README.

## Debugging runbook — stuck or failed letter

Work through this list in order. Do not skip steps.

### 1. Which tier ran?

```sql
select id, job_type, provider, status, error_message, created_at, started_at, completed_at, response_payload_json->>'mode' as mode
from workflow_jobs
where letter_request_id = :letter_id
order by created_at desc;
```

Interpret:
- `provider = "n8n-mcp"`, `mode = "n8n-mcp-sync"`, `status = "completed"` → tier 1 handled it synchronously. Done.
- `provider = "n8n-mcp"`, `mode = "n8n-mcp-async"`, `status = "running"` → tier 1 acked; letter is waiting for `/api/pipeline/n8n-callback`. If stuck, the n8n workflow crashed.
- `provider = "n8n-mcp"`, `status = "failed"`, `error_message` contains `N8N_ERROR` → tier 1 failed. Check if a separate `provider = "multi-provider"` row exists after it for tier 3 fallback.
- `provider = "n8n"`, `mode = "n8n-webhook-async"` → tier 2 handled it; also waiting on callback.
- `provider = "multi-provider"` → tier 3 (in-app) ran. Check per-stage rows for failures.

### 2. Lock check

```sql
select id, status, pipeline_locked_at, now() - pipeline_locked_at as held_for
from letter_requests
where id = :letter_id;
```

Manual release:
```sql
update letter_requests set pipeline_locked_at = null where id = :letter_id;
```

### 3. pg-boss queue state

```sql
select id, name, state, retry_count, created_on, started_on, completed_on, output
from pgboss.job
where data->>'letterId' = :letter_id::text
order by created_on desc
limit 5;
```

States: `created | retry | active | completed | failed | cancelled | expired`.

### 4. n8n MCP-specific failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `[N8nMcp] MCP not configured` | Env vars not set on Railway | Set them; redeploy |
| `[N8nMcp] Failed to connect to n8n MCP server` then 30s cooldown | n8n cloud down, wrong URL, expired token | Check the MCP endpoint; rotate token |
| `[N8nMcp] Configured N8N_MCP_TOOL_NAME not found` | Tool renamed on n8n side | Update `N8N_MCP_TOOL_NAME` or unset |
| `[N8nMcp] Could not identify the correct pipeline tool` | Multiple tools, none matching keywords | Set `N8N_MCP_TOOL_NAME` explicitly |
| Tier 1 succeeds but `processN8nSyncResult` returns false | n8n returned ack but no `vettedLetter`/`assembledLetter`/`draftContent`/`draftOutput.draftLetter` | Fix n8n workflow output schema |
| Letter stuck in `researching` after tier 1 async ack | n8n workflow running but never called back | Check n8n execution history; verify `N8N_CALLBACK_SECRET` |
| `mode: "n8n-mcp-async"` forever | Same as above, or callback returning 401 | Check `n8nCallback.ts` auth; verify `APP_BASE_URL` |

### 5. Tier 3 (in-app) failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `workflow_jobs.error_message` contains `AbortError` / `timeout` | Provider slow or down | Check provider status |
| `401` / `API_KEY_MISSING` | Env var wrong on Railway | Fix env var |
| `ENETUNREACH` or IPv6 noise | `SUPABASE_DIRECT_URL` points at pooler, or IPv4 forcing not active | Confirm `dns.setDefaultResultOrder("ipv4first")` and that `SUPABASE_DIRECT_URL` uses port 5432 |
| Research stage says `researchUnverified=true` | Perplexity unavailable — Claude fallback used (no web grounding) | Check `PERPLEXITY_API_KEY` |
| Letter ends `generated_locked` but `quality_degraded=true` | Vetting flagged critical issues but pipeline proceeded | Inspect `response_payload_json.validationResults` and `vettingReport` |

### 6. Latest research run

```sql
select id, provider, status, cache_hit, cache_key, error_message, created_at
from research_runs
where letter_request_id = :letter_id
order by created_at desc
limit 3;
```

`cache_hit=true` → research came from KV; citation revalidation was skipped.

### 7. Recovery moves

**Safe retry from a given stage (in-app only):**
```ts
await enqueueRetryFromStageJob({
  type: "retryPipelineFromStage",
  letterId, intake,
  stage: "research",      // or "drafting"
  userId,
});
```

**Force back to `submitted` and let the worker pick it up:**
```sql
update letter_requests
set status = 'submitted', pipeline_locked_at = null
where id = :letter_id;
```
Then:
```ts
await enqueuePipelineJob({ type: "runPipeline", letterId, intake, userId, appUrl, label: "manual-retry" });
```

**Force tier 3 only** (bypass n8n): unset `N8N_PRIMARY` on the Railway service.

**Tombstone old runs:**
```ts
await markPriorPipelineRunsSuperseded(letterId);
```

## Common operations

### Kick off a run manually
```ts
import { enqueuePipelineJob } from "./server/queue";

await enqueuePipelineJob({
  type: "runPipeline",
  letterId: 123,
  intake: letterRequest.intakeJson,
  userId: letterRequest.userId,
  appUrl: process.env.APP_URL!,
  label: "manual",
});
```

### Inspect n8n MCP tool availability
```ts
import { listN8nTools, isN8nMcpConfigured } from "./server/n8nMcp";
if (!isN8nMcpConfigured()) console.log("not configured");
console.log(await listN8nTools());
```

### Count tier distribution over the last 24h
```sql
select
  provider,
  response_payload_json->>'mode' as mode,
  status,
  count(*) as jobs
from workflow_jobs
where job_type = 'generation_pipeline'
  and created_at > now() - interval '24 hours'
group by 1, 2, 3
order by 1, 2, 3;
```

### Latest quality issues
```sql
select id, status, quality_degraded, quality_warnings, research_unverified
from letter_requests
where quality_degraded = true
order by updated_at desc
limit 20;
```

## Anti-patterns (things that will break production)

- **Calling AI providers without an `AbortSignal`** — pipeline hangs indefinitely. All in-app stages pass `AbortSignal.timeout(<stage timeout const>)`. The MCP client uses `timeout: 120_000`.
- **Using `SUPABASE_DATABASE_URL` (pooler) for pg-boss** — breaks `LISTEN/NOTIFY`. Use `SUPABASE_DIRECT_URL`.
- **Removing the IPv4 DNS forcing** — Supabase hostnames resolve to unreachable IPv6 on Railway.
- **Skipping `ALLOWED_TRANSITIONS`** — never `update letter_requests set status = 'X'` from pipeline code. Go through `updateLetterStatus()`.
- **Mutating an `ai_draft` `letter_versions` row** — immutable.
- **Writing directly to `workflow_jobs` from a stage without `createWorkflowJob`/`updateWorkflowJob`** — you'll miss fields the dashboards depend on.
- **Setting pg-boss `policy: "key_strict_fifo"`** — permanently blocks new sends for a `singletonKey` when any prior job failed. Use `"standard"`.
- **Hardcoding `retryLimit > 0` on the queue** — fights the worker's retry logic.
- **Adding a new model without updating `MODEL_PRICING`** — `calculateCost` silently returns `"0"`.
- **Removing `processN8nSyncResult`'s fallback to local `runAssemblyStage`** — legacy n8n outputs depend on it.
- **Removing tier 3** — it is the canonical default. Do not delete it.
- **Calling `runFullPipeline` directly from a tRPC route** — always enqueue.
- **Marking `workflow_jobs.status = "completed"` before `processN8nSyncResult` returns true** — breaks the sync-path guarantee.

## Files to know by heart

| Path | What lives there |
|------|------------------|
| `server/n8nMcp.ts` | MCP client, `listN8nTools`, `callN8nTool`, `triggerN8nPipeline`, tool resolution, reconnect cooldown |
| `server/n8nCallback.ts` | `/api/pipeline/n8n-callback` — async result handler |
| `server/queue.ts` | pg-boss bootstrap, `enqueuePipelineJob`, `enqueueRetryFromStageJob`, IPv4 DNS resolution |
| `server/worker.ts` | `processRunPipeline`, lock handling, retry loop |
| `server/pipeline/orchestrator.ts` | `runFullPipeline` (3-tier chain), `retryPipelineFromStage`, `preflightApiKeyCheck`, `processN8nSyncResult` |
| `server/pipeline/providers.ts` | AI client factories, timeout constants, `MODEL_PRICING`, token accounting |
| `server/pipeline/research.ts` | Tier 3 Stage 1 — Perplexity sonar-pro, KV cache |
| `server/pipeline/drafting.ts` | Tier 3 Stage 2 — Claude Opus draft |
| `server/pipeline/assembly.ts` | Tier 3 Stage 3 — Claude Opus assembly |
| `server/pipeline/vetting.ts` | Tier 3 Stage 4 — Claude Sonnet vetting + `runAssemblyVettingLoop` + `finalizeLetterAfterVetting` |
| `server/pipeline/citations.ts` | `buildCitationRegistry`, `revalidateCitationsWithPerplexity`, `runCitationAudit` |
| `server/pipeline/fallback.ts` | `bestEffortFallback`, `autoAdvanceIfPreviouslyUnlocked` |
| `server/pipeline/validators.ts` | Intake/research/draft/final validators |
| `server/db/pipeline-records.ts` | `createWorkflowJob`, `updateWorkflowJob`, `createResearchRun`, `updateResearchRun` |
| `shared/types/pipeline.ts` | Pipeline types and error codes |
| `shared/types/letter.ts` | `ALLOWED_TRANSITIONS`, `STATUS_CONFIG` |
| `drizzle/schema/letters.ts` | `letterRequests`, `workflowJobs`, `researchRuns`, `letterVersions` |
| `drizzle/schema/constants.ts` | All enums |

## Required environment variables

| Var | Required | Notes |
|-----|----------|-------|
| `SUPABASE_DIRECT_URL` | **yes** for pg-boss | Port **5432**, not 6543 |
| `DATABASE_URL` / `SUPABASE_DATABASE_URL` | yes | Drizzle app connection (pooler is fine) |
| `N8N_PRIMARY` | optional | `"true"` enables tier 1/2; default is in-app pipeline |
| `N8N_MCP_URL` | required for tier 1 | The MCP endpoint |
| `N8N_MCP_BEARER_TOKEN` | required for tier 1 | Auth token |
| `N8N_MCP_TOOL_NAME` | optional | Override tool auto-discovery |
| `N8N_WEBHOOK_URL` | required for tier 2 | Must start with `https://` |
| `N8N_CALLBACK_SECRET` | required for tier 1 + 2 | Validates async callbacks |
| `APP_BASE_URL` | yes | Defaults to `https://www.talk-to-my-lawyer.com` |
| `PERPLEXITY_API_KEY` | yes | Tier 3 Stage 1 |
| `ANTHROPIC_API_KEY` | yes | Tier 3 Stages 2, 3, 4 + research fallback |

## Related skills

- `ttml-pipeline-expert` — high-level domain/strategy companion
- `ttml-langgraph-pipeline` — optional `LANGGRAPH_PIPELINE=true` parallel implementation
- `ttml-backend-patterns` — tRPC/Drizzle/guard patterns
- `ttml-database-rls-security` — RLS policies on `letter_requests`
- `ai-pipeline-provider-switch` — direct provider calls + `AbortSignal` timeouts
- `supabase-mcp-sync` — applying Drizzle migrations
- `ttml-n8n-workflow-integration` — n8n workflow design (dormant alternative path)
