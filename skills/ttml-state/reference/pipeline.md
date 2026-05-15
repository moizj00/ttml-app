# Pipeline — Current State

> **Last verified:** 2026-05-14 against `server/pipeline/providers.ts`, `server/pipeline/drafting.ts`, `server/pipeline/assembly.ts`, `server/pipeline/vetting/index.ts`, `server/pipeline/research/index.ts`, `server/pipeline/simple.ts`, `server/pipeline/graph/nodes/*.ts`, `server/pipeline/orchestrator.ts`, `server/worker.ts`, `shared/types/letter.ts`, `drizzle/schema/constants.ts`.

The TTML pipeline turns intake JSON into a vetted legal draft. There are three execution paths, gated by env vars, and an underlying status machine that governs all transitions.

---

## 1. Execution paths

Two env vars control which path runs.

### `PIPELINE_MODE` (orchestrator-level)

| Value | Behaviour |
|---|---|
| `langgraph` | Bypass pg-boss; run the LangGraph `StateGraph` synchronously via `runLangGraphPipeline` ([`server/pipeline/graph/index.ts`](../../../server/pipeline/graph/index.ts)). |
| `simple` | Run the single-stage inline Claude draft via `runSimplePipeline` ([`server/pipeline/simple.ts`](../../../server/pipeline/simple.ts)). No research, no assembly, no vetting. Used in dev/test (e.g. the platform e2e suite). |
| *(unset / other)* | **Default**: pg-boss-queued 4-stage in-app pipeline, with optional n8n webhook first if `N8N_PRIMARY=true`. |

### `LANGGRAPH_PIPELINE` (worker-level)

Independent of `PIPELINE_MODE`. Set on `server/worker.ts`; routes pg-boss jobs through LangGraph while keeping the job under pg-boss ownership. On LangGraph failure the worker releases and re-acquires the lock, then falls through to the classic pipeline. Don't conflate the two gates.

### n8n status

Dormant. Webhook handler at `POST /api/pipeline/n8n-callback` is wired (see [`server/n8nCallback.ts`](../../../server/n8nCallback.ts)) but only fires when `N8N_PRIMARY=true` is set on the orchestrator. `server/n8nMcp.ts` is an empty deprecated stub (removed 2026-04-16).

---

## 2. The 4-stage in-app pipeline

When the default path runs, stages execute sequentially with 90-second `AbortSignal.timeout()` per stage.

### Live model pins (verified from `server/pipeline/providers.ts` and per-stage files, 2026-05-14)

| Stage | Primary | Failover 1 | Failover 2 / Last resort | Source |
|---|---|---|---|---|
| **1 — Research** | OpenAI `gpt-4o-search-preview` via Responses API + `webSearchPreview` tool | Perplexity `sonar-pro` (only if `PERPLEXITY_API_KEY` set) | Anthropic `claude-sonnet-4-5-20250929` ungrounded → sets `researchUnverified: true`. Final OSS tier: Groq `llama-3.3-70b-versatile` (if `GROQ_API_KEY` set). | `server/pipeline/research/index.ts`, `providers.ts:41-86` |
| **2 — Drafting** | Anthropic `claude-sonnet-4-5-20250929` | OpenAI `gpt-4o-mini` | — | `server/pipeline/drafting.ts:152`, `providers.ts:88-98` |
| **3 — Assembly** | Anthropic `claude-sonnet-4-5-20250929` | OpenAI `gpt-4o-mini` | — | `server/pipeline/assembly.ts:78`, `providers.ts:100-110` |
| **4 — Vetting** | Anthropic `claude-sonnet-4-6-20250514` | OpenAI `gpt-4o-mini` | Groq `llama-3.3-70b-versatile` (free OSS) | `server/pipeline/vetting/index.ts:245-323`, `providers.ts:112-139` |

LangGraph alternative path uses `claude-sonnet-4-5-20250929` for vetting (see `server/pipeline/graph/nodes/vetting.ts:40`) — minor internal drift documented in [drift-log.md](drift-log.md).

### Timeouts

```ts
RESEARCH_TIMEOUT_MS = 90_000;
DRAFT_TIMEOUT_MS    = 90_000;
ASSEMBLY_TIMEOUT_MS = 90_000;
// vetting also runs under a 90-120s abort; see vetting/index.ts
```

n8n ack uses `AbortSignal.timeout(10_000)`. On HTTP error, timeout, or non-2xx ack, the orchestrator falls through to the in-app pipeline and logs `provider: "multi-provider"` in `workflow_jobs`.

### Pricing pins (informational)

From `MODEL_PRICING` in `server/pipeline/providers.ts`, USD per million tokens:

| Model | Input | Output |
|---|---|---|
| `claude-sonnet-4-5-20250929` (and `claude-sonnet-4-5`, `claude-sonnet-4-20250514`, `claude-sonnet-4`, `claude-sonnet-4-6-20250514`, `claude-sonnet-4-6`) | 3 | 15 |
| `claude-opus-4-5` | 15 | 75 |
| `sonar-pro` | 3 | 15 |
| `sonar` | 1 | 1 |

Sonnet aliases are stuffed into the pricing map to avoid drift if a stage label differs from the actual pinned ID.

### Stage invariants

- **Workflow logging** — every stage logs a `workflow_jobs` row via [`server/db/pipeline-records.ts`](../../../server/db/pipeline-records.ts), including `provider`, `request_payload_json`, `response_payload_json`, `prompt_tokens`, `completion_tokens`, `estimated_cost_usd`. Log-label drift: the legacy hardcoded `provider` strings array (`["perplexity-sonar-research", "openai-gpt4o-mini-draft", ...]`) is misleading — always trust the row's `provider` column, not the label.
- **Intermediate content registry** — `_intermediateContentRegistry` retains the best draft produced so far. If a later stage crashes, the worker can recover a partial output rather than re-running from scratch.
- **Vetting retry loop** — critical issues (jurisdiction mismatch, hallucinated citations, factual errors) trigger re-assembly. Max 2 retries. After exhaustion, the letter is flagged `qualityDegraded` with `qualityWarnings` and still promoted to `generated_locked` for attorney correction.
- **Error capture** — Sentry via `captureServerException`. Job queue is pg-boss (PostgreSQL-native — no Redis / BullMQ).
- **pg-boss DB requirement** — pg-boss on Supabase requires `SUPABASE_DIRECT_URL` on port **5432** (not the pooler 6543). The worker forces `dns.setDefaultResultOrder("ipv4first")` at startup of `server/worker.ts` because Railway's IPv6 egress fails against Supabase pooler IPs.
- **Audit trail** — every status change calls `logReviewAction` from [`server/db/review-actions.ts`](../../../server/db/review-actions.ts).

---

## 3. LangGraph alternative path

Lives under [`server/pipeline/graph/`](../../../server/pipeline/graph/):

```
graph/
├── index.ts                # StateGraph compiler + runner
├── checkpointer.ts         # Postgres checkpoint persistence
├── memory.ts               # Checkpoint memory adapter
├── mode.ts                 # PIPELINE_MODE / canary parser
├── state.ts                # PipelineState type
└── nodes/
    ├── init.ts             # Boot the graph state
    ├── research.ts         # Stage 1
    ├── draft.ts            # Stage 2 (Sonnet 4.5)
    ├── assembly.ts         # Stage 3 (Sonnet 4.5)
    ├── vetting.ts          # Stage 4 (Sonnet 4.5 — internal drift)
    └── finalize.ts         # Persist final version + dispatch
```

`@langchain/langgraph` v1.2, `@langchain/langgraph-checkpoint-postgres` v1.0 — checkpoints stored in Postgres, so the graph can resume mid-stage if the process dies. The `finalize` node also calls `dispatchFreePreviewIfReady` so the free-preview email fires the moment the draft lands.

---

## 4. Simple pipeline mode (`PIPELINE_MODE=simple`)

[`server/pipeline/simple.ts`](../../../server/pipeline/simple.ts) — one inline Claude call, model pinned to `claude-sonnet-4-5-20250929`. Bypasses pg-boss; runs synchronously within the HTTP request. Used by the platform e2e suite ([`e2e/platform/`](../../../e2e/platform/)) and for local development. Not recommended for production because it blocks the request and skips research + vetting.

**Verified working (2026-05-14):** The integration test at [`server/simple-pipeline-lifecycle.test.ts`](../../../server/simple-pipeline-lifecycle.test.ts) (commits `4f3d5bc` + `4f4c723`, PRs #39 + #40) drives `runSimplePipeline` through the complete lifecycle: submission → `ai_draft` version creation → paywall enforcement (truncated at `generated_locked`) → payment unlock → attorney claim + approval → `final_approved` version creation → subscriber `client_approved`. The `ai_draft` immutability invariant (CLAUDE.md §1) is explicitly asserted — the original content is byte-equal after attorney edits.

---

## 5. Letter status machine

Source of truth: [`shared/types/letter.ts`](../../../shared/types/letter.ts) → `LETTER_STATUS`, `ALLOWED_TRANSITIONS`, `STATUS_CONFIG`, `isValidTransition()`.

Drizzle pgEnum tuple: [`drizzle/schema/constants.ts`](../../../drizzle/schema/constants.ts) → `LETTER_STATUSES`. The pgEnum has 20 statuses; the TS const map `LETTER_STATUS` adds `generated_unlocked` for legacy lookups. Do not rely on `generated_unlocked` for new code — it is not in the pgEnum.

### Current status set (21 in TS, 20 in pgEnum)

```
submitted
researching
drafting
ai_generation_completed_hidden       # 24-hour hold before subscriber visibility
letter_released_to_subscriber        # after 24h: draft is visible (free preview)
attorney_review_upsell_shown         # subscriber saw the "submit for attorney review" CTA
attorney_review_checkout_started     # subscriber clicked through to Stripe Checkout
attorney_review_payment_confirmed    # Stripe webhook confirmed payment
generated_locked                     # legacy unlock path; still wired
generated_unlocked                   # TS-only (not in pgEnum)
pending_review                       # in attorney queue
under_review                         # claimed by attorney
needs_changes                        # attorney requested more info from subscriber
approved                             # transient — auto-forwards to client_approval_pending
client_approval_pending              # subscriber must approve before send
client_revision_requested            # subscriber requested edits
client_approved                      # subscriber approved
sent                                 # terminal
rejected                             # attorney rejected entirely
client_declined                      # terminal — subscriber declined
pipeline_failed                      # AI stage error; admin can retry → submitted
```

### `ALLOWED_TRANSITIONS` (verbatim from current code)

```
submitted                          → researching, pipeline_failed
researching                        → drafting, submitted, pipeline_failed
drafting                           → ai_generation_completed_hidden, generated_locked, submitted, pipeline_failed
ai_generation_completed_hidden     → letter_released_to_subscriber, under_review (admin bypass), pipeline_failed
letter_released_to_subscriber      → attorney_review_upsell_shown, attorney_review_checkout_started, pending_review
attorney_review_upsell_shown       → attorney_review_checkout_started, pending_review
attorney_review_checkout_started   → attorney_review_payment_confirmed, pending_review
attorney_review_payment_confirmed  → pending_review
generated_unlocked                 → pending_review
generated_locked                   → pending_review
pending_review                     → under_review
under_review                       → approved, rejected, needs_changes, pending_review
needs_changes                      → submitted, pending_review
approved                           → sent, client_revision_requested, client_approval_pending
client_approval_pending            → client_approved, client_revision_requested, client_declined
client_revision_requested          → pending_review, under_review
client_approved                    → sent
sent                               → (terminal)
rejected                           → submitted
client_declined                    → (terminal)
pipeline_failed                    → submitted
```

### Key transition rules

- **Free-preview funnel**: `ai_generation_completed_hidden → letter_released_to_subscriber → attorney_review_upsell_shown → attorney_review_checkout_started → attorney_review_payment_confirmed → pending_review`. The 24h hold is `ai_generation_completed_hidden`. After the hold, the subscriber sees the draft (free preview); the upsell CTA appears; clicking through routes to Stripe; payment confirmation triggers transition to `pending_review`.
- **Admin force unlock**: `forceFreePreviewUnlock` mutation in [`server/routers/admin/letters.ts`](../../../server/routers/admin/letters.ts) collapses the 24h cooling window. Idempotent claim on `free_preview_email_sent_at` prevents double-send across cron, pipeline, and admin paths.
- **Admin bypass**: `forceStatusTransition` (admin + 2FA, in `server/routers/admin/letters.ts`) can jump from any hold/upsell status directly to `under_review`, skipping the paywall. Deferred pipeline jobs are cancelled atomically to prevent re-execution.
- **Approval is transient**: once the attorney sets `approved`, the worker auto-forwards to `client_approval_pending`.
- **PDF generation**: triggered on `clientApprove` (subscriber action), NOT when the attorney submits. See [`server/pdfGenerator.ts`](../../../server/pdfGenerator.ts) — server-side PDFKit, uploads to Cloudflare R2.
- **Audit log**: every transition must call `logReviewAction`. `noteVisibility: "internal"` for ops; `"user_visible"` for the subscriber timeline.

---

## 6. RAG + recursive learning

- **Embeddings** — On attorney approval the final letter is embedded via OpenAI `text-embedding-3-small` (1536 dims, see the `vector(1536)` customType in `drizzle/schema/constants.ts`) and stored in `letter_versions.embedding`. See [`server/pipeline/embeddings.ts`](../../../server/pipeline/embeddings.ts).
- **Reuse in drafting** — Stage 2 injects the top 3 similar approved letters (cosine similarity ≥ 0.70) into the system prompt as style examples.
- **Lessons** — Attorney edits feed [`server/learning/`](../../../server/learning/) which stores extracted lessons in `pipeline_lessons` and injects them into future prompts. Managed at `/admin/learning`.
- **Fine-tuning capture** — Training pairs captured to GCS (`GCS_TRAINING_BUCKET`); the worker polls Vertex AI fine-tune statuses every 30 minutes when GCP is configured. See [`server/pipeline/training-capture.ts`](../../../server/pipeline/training-capture.ts) and [`server/pipeline/fine-tune.ts`](../../../server/pipeline/fine-tune.ts). The threshold for kicking off a fine-tune is 50+ approved examples.

---

## 7. Recovery / troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Stuck in `researching` / `drafting` | `workflow_jobs` errored without producing a version | `repairLetterState` (admin) → resets to `submitted` |
| Stuck after n8n webhook | n8n callback signature mismatch or n8n returned non-2xx ack | Check `X-Auth-Token` vs `N8N_CALLBACK_SECRET`; orchestrator should have fallen through to in-app — verify `workflow_jobs.provider` |
| Stuck in LangGraph path | LangGraph node threw without releasing the lock | Check `LANGGRAPH_PIPELINE` env, `pipeline_stream_chunks` for streamed tokens, then `pipeline_failed` status |
| `qualityDegraded = true` on letter | Vetting hit critical issue + retries exhausted | Letter still moved to `generated_locked` — attorney corrects manually |
| PDF missing after approval | PDFKit non-blocking, may have errored | Subscriber re-triggers via `getDownloadUrl` which regenerates on demand |
| Payment + status mismatch | Stripe webhook didn't fire or `processedStripeEvents` deduped wrongly | Check `stripeWebhook` logs + the `processedStripeEvents` table |

Admin recovery playbook:
1. Identify failed stage in `workflow_jobs` (filter by `letter_id`, sort by `created_at` desc).
2. Use `retryJob` (admin) or `enqueueRetryFromStageJob` to resume from the failed stage via pg-boss.
3. If state machine is stuck, use `repairLetterState` or `forceStatusTransition` (admin + 2FA).
4. Monitor the **pipeline-worker** logs in Railway for pg-boss activity.
5. For LangGraph debugging, stream `pipeline_stream_chunks` via Supabase Realtime — the `useLetterStream` React hook surfaces tokens live.

---

## 8. Deeper reading

- **Specialist skill** — [`skills-audit/corrected/ttml-pipeline-expert/SKILL.md`](../../../skills-audit/corrected/ttml-pipeline-expert/SKILL.md) (note: still says draft/assembly/vetting all use Sonnet 4 `20250514` — drifted, see [drift-log.md](drift-log.md)).
- **Deep architecture doc** — [`docs/PIPELINE_ARCHITECTURE.md`](../../../docs/PIPELINE_ARCHITECTURE.md).
- **Status machine pattern** — [`skills/architectural-patterns/strict_status_machine.md`](../../architectural-patterns/strict_status_machine.md).
- **End-to-end verification** — [`skills/platform-e2e-verification/SKILL.md`](../../platform-e2e-verification/SKILL.md).

---

**Sources read:** `server/pipeline/providers.ts`, `server/pipeline/drafting.ts`, `server/pipeline/assembly.ts`, `server/pipeline/vetting/index.ts`, `server/pipeline/research/index.ts`, `server/pipeline/simple.ts`, `server/pipeline/graph/nodes/{draft,assembly,vetting}.ts`, `shared/types/letter.ts`, `drizzle/schema/constants.ts`, `server/_core/env.ts`.
