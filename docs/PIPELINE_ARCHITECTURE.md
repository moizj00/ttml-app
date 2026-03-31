# Pipeline Architecture — Talk to My Lawyer

> **Last confirmed:** March 16, 2026 (Phase 86)  
> **Status:** Production-verified

---

## Active Pipeline Path

**Primary path: DIRECT 4-stage API calls. n8n is dormant (fallback/alternative, not active).**

```
Letter Submit
    │
    ▼
Stage 1: Perplexity sonar-pro [PRIMARY]
         (web-grounded legal research)
         ↳ Fallback: Claude claude-opus-4-5 [if PERPLEXITY_API_KEY missing]
                     (research NOT web-grounded)
    │
    ▼
Stage 2: Anthropic claude-opus-4-5
         (initial legal draft from research packet)
    │
    ▼
Stage 3: Anthropic claude-opus-4-5
         (final polished letter assembly)
    │
    ▼
Stage 4: Anthropic claude-sonnet (vetting)
         (jurisdiction accuracy, anti-hallucination,
          anti-bloat, geopolitical awareness)
    │
    ▼
Status: generated_locked
         (subscriber must pay to unlock)
    │
    ▼ (Stripe payment)
Status: pending_review
         (enters Letter Review Center)
    │
    ▼
Attorney: claim → under_review
          edit draft (inline editor)
          approve / reject / request_changes
    │
    ▼ (on approve)
PDF generated via PDFKit → uploaded to S3
Subscriber notified via email (with PDF link)
Status: approved
PDF available in subscriber's "My Letters"
```

---

## RAG + Recursive Learning (Self-Improving Loop)

This system uses **attorney-approved letters** to improve draft quality from the **very first iteration** of new letters. The loop is fully automated and non-blocking — failures log but never block approval.

### What we use RAG for
- **Draft quality uplift:** Provide style/structure examples in **Stage 2 drafting** so the first draft is closer to previously approved outcomes.
- **Training data capture:** Build supervised datasets for fine-tuning, enabling longer-term model improvement.

### Exactly how it works (step-by-step)
1. **On attorney approval (post-approval hooks):**
   - **Embedding capture:** The final approved content is embedded using OpenAI `text-embedding-3-small` (1536 dims) and stored in `letter_versions.embedding` (pgvector). This is a **retrieval-only** step; we intentionally use OpenAI embeddings for similarity search while fine-tuning runs on Vertex AI’s Gemini models.
   - **Training capture:** A single JSONL example is generated with:
     - `system`: generic drafting instruction
     - `user`: intake summary (letter type, subject, jurisdiction, issue, desired outcome, parties)
     - `assistant`: approved letter content  
     This file is uploaded to `gs://<GCS_TRAINING_BUCKET>/training-data/YYYY/MM/DD/letter-<id>-<ts>.jsonl` and logged in `training_log`.

2. **During Stage 2 drafting (first draft):**
   - The intake summary is embedded and used to query `match_letters()` in Postgres.
   - **Top 3 similar approved letters** (similarity ≥ **0.70**) are returned and injected into the **system prompt** as reference examples (each trimmed to **2,000 raw content characters** before prompt headings/metadata are added).
   - The prompt explicitly instructs the model to **adapt style/structure — not copy verbatim**.
   - If retrieval fails or no matches exist yet, the pipeline continues without RAG (no blocking).

3. **Recursive learning / fine-tuning loop:**
   - When **50+ examples** exist since the last run, all per-example JSONL files are merged into a single dataset (`fine-tune-datasets/YYYY-MM-DD-merged.jsonl`).
   - A **Vertex AI tuning job** is submitted (base model: `gemini-1.5-flash-002`) and recorded in `fine_tune_runs`.
   - This creates a continuous improvement cycle where every approved letter strengthens the next generation of drafts.

**Required configuration:** `OPENAI_API_KEY`, `GCP_PROJECT_ID`, `GCP_REGION`, `GCS_TRAINING_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS`.

---

## Service Resilience — Primary vs Fallback

This section documents every service pair in the system: what is primary, what the fallback is, what triggers the switch, and what capability is lost on fallback.

| Service | Primary | Fallback | Trigger | Capability Lost on Fallback |
|---------|---------|----------|---------|----------------------------|
| **Letter generation** | Local 4-stage pipeline (Perplexity → Opus × 2 → Sonnet) | n8n external workflow | `N8N_PRIMARY=true` env var set (currently NOT set — dormant) | n8n path is less tested; not recommended for production |
| **Stage 1 Research** | Perplexity `sonar-pro` | Anthropic `claude-opus-4-5` | `PERPLEXITY_API_KEY` missing or empty | Research is **not web-grounded**; no live citations; `researchUnverified` flag set on letter |
| **Rate limiting** | Upstash Redis (`@upstash/ratelimit`) | Fail-open / allow-all (general endpoints); fail-closed / deny (auth endpoints) | Redis credentials missing (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) or Redis unreachable | General endpoints lose abuse protection; auth endpoints remain protected via fail-closed behaviour |
| **Monitoring** | Sentry (frontend + backend DSN) | `console.error` / `console.warn` | Sentry DSN not configured or Sentry SDK init fails | Errors still surface in server logs but are not aggregated, alerted, or tracked in Sentry dashboard |
| **Background jobs** | BullMQ + Upstash Redis queue | None — enqueue failure throws `INTERNAL_SERVER_ERROR` and refunds user usage | Redis unavailable when enqueueing | Letter submission fails; usage is automatically refunded; no silent degradation |

### Notes

- **Letter generation routing:** `N8N_PRIMARY` must equal the string `"true"` AND `N8N_WEBHOOK_URL` must be set and start with `https://`. All three conditions must be true simultaneously to activate n8n. The current production environment does not set `N8N_PRIMARY`, so the local pipeline is always used.
- **Stage 1 research fallback:** When Claude is used for research instead of Perplexity, the letter's `researchUnverified` column is set to `true` and `webGrounded` is `false`. This is surfaced to attorneys in the review UI.
- **Rate limiter fail-open vs fail-closed:** Auth endpoints (login, signup, forgot-password) use fail-closed (deny) when Redis is down, to prevent unbounded brute-force. All other endpoints use fail-open (allow) to avoid blocking normal usage during Redis outages. See `server/rateLimiter.ts` lines 133–170.
- **BullMQ / background jobs:** There is no inline fallback for queue failures. If Redis is unavailable and a job cannot be enqueued, the submission is rejected with a user-facing error and any consumed usage credit is refunded.

---

## Routing Decision (pipeline.ts ~line 2716)

```ts
const useN8nPrimary = process.env.N8N_PRIMARY === "true"
  && !!n8nWebhookUrl
  && n8nWebhookUrl.startsWith("https://");
```

**Three conditions must ALL be true to activate n8n (alternative path):**

| Condition | Current Value | Result |
|-----------|--------------|--------|
| `N8N_PRIMARY=true` | **NOT SET** | ❌ Short-circuits here |
| `N8N_WEBHOOK_URL` set | Set in secrets | ✅ |
| URL starts with `https://` | Yes | ✅ |

Because `N8N_PRIMARY` is not set, the pipeline **always** uses the direct 4-stage path (primary).

---

## Model Summary

| Stage | Role | Primary Provider | Primary Model | Fallback Provider | Fallback Model | Timeout |
|-------|------|-----------------|---------------|-------------------|----------------|---------|
| Research | Stage 1 | Perplexity (OpenAI-compatible) | `sonar-pro` | Anthropic | `claude-opus-4-5` | 90s |
| Draft | Stage 2 | Anthropic | `claude-opus-4-5` | — | — | 120s |
| Assembly | Stage 3 | Anthropic | `claude-opus-4-5` | — | — | 120s |
| Vetting | Stage 4 | Anthropic | `claude-sonnet` | — | — | 120s |

**Stage 1 fallback trigger:** `PERPLEXITY_API_KEY` is missing or empty → falls back to `claude-opus-4-5`. Research will **not** be web-grounded when fallback is active.

---

## n8n Status

- `n8nCallback.ts` is registered as an Express route at `/api/pipeline/n8n-callback`
- n8n is a **dormant alternative path** — it is not auto-selected under normal conditions
- It is only activated when `N8N_PRIMARY=true` is explicitly set (plus `N8N_WEBHOOK_URL` starting with `https://`)
- If `N8N_PRIMARY=true` is set and the n8n webhook call itself fails, the pipeline errors out (there is no automatic fallback from n8n back to the local 4-stage pipeline at that point)
- n8n path exists as an optional override for debugging/experimentation only
- **Do NOT set `N8N_PRIMARY=true` in production** without fully testing the n8n workflow

---

## Status Machine (matches `shared/types.ts` → `ALLOWED_TRANSITIONS`)

```
submitted → researching → drafting → generated_locked
    │            │            │           │
    │            │            │     [Stripe $200 payment or subscription]
    │            │            │           │
    │            │            │           ▼
    │            │            │     pending_review → under_review → approved
    │            │            │                   ↻ (release)      → rejected → submitted
    │            │            │                                     → needs_changes → submitted
    │            │            │
    │            │            └→ submitted (pipeline failure reset)
    │            └→ submitted (pipeline failure reset)
    └→ pipeline_failed (any stage failure after retries)
    
    approved → client_approval_pending → client_approved → sent
    pipeline_failed → submitted (admin retry)
```

Exact transitions from `shared/types.ts` → `ALLOWED_TRANSITIONS`:
- `submitted → researching | pipeline_failed`
- `researching → drafting | submitted | pipeline_failed`
- `drafting → generated_locked | submitted | pipeline_failed`
- `generated_locked → pending_review` ($200 per-letter paywall or subscription)
- `pending_review → under_review`
- `under_review → approved | rejected | needs_changes | pending_review` (release claim)
- `needs_changes → submitted`
- `approved → client_approval_pending`
- `client_approval_pending → client_approved`
- `client_approved → sent`
- `sent → (terminal)`
- `rejected → submitted` (subscriber retry from scratch)
- `pipeline_failed → submitted` (admin-triggered retry)

Note: `generated_unlocked` still exists in the DB enum for backward compatibility but is NOT part of the active status machine (removed in Phase 69).

---

## Key Files

| File | Purpose |
|------|---------|
| `server/pipeline.ts` | 4-stage orchestrator + prompt builders |
| `server/n8nCallback.ts` | n8n webhook handler (dormant alternative path) |
| `server/pdfGenerator.ts` | PDFKit-based PDF generation on approval |
| `server/routers.ts` | tRPC procedures that trigger pipeline |
| `server/email.ts` | Email notifications at each status change |
| `server/db.ts` | All database query helpers |
| `server/rateLimiter.ts` | Upstash Redis rate limiting (fail-open/fail-closed) |
| `server/queue.ts` | BullMQ queue setup and job enqueueing |
| `server/worker.ts` | BullMQ worker — processes pipeline jobs |
| `drizzle/schema.ts` | Database schema + enums |

---

## Environment Variables (Pipeline-related)

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | **Yes** | Stages 2, 3 + 4 (always required) |
| `PERPLEXITY_API_KEY` | Recommended | Stage 1 research (primary); falls back to Claude if missing |
| `UPSTASH_REDIS_URL` | Recommended | BullMQ queue connection (IORedis URL form — preferred for BullMQ) |
| `UPSTASH_REDIS_REST_URL` | Recommended | Rate limiter (`@upstash/ratelimit`) + alternative BullMQ connection when `UPSTASH_REDIS_URL` is absent |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | Auth token paired with `UPSTASH_REDIS_REST_URL`; required by both rate limiter and fallback BullMQ connection |
| `N8N_WEBHOOK_URL` | No | n8n webhook URL (only used if N8N_PRIMARY=true) |
| `N8N_CALLBACK_SECRET` | No | n8n auth header secret |
| `N8N_PRIMARY` | No | Set to `"true"` to activate n8n alternative path (default: off) |
