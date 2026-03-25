# Pipeline Architecture — Talk to My Lawyer

> **Last confirmed:** March 16, 2026 (Phase 86)  
> **Status:** Production-verified

---

## Active Pipeline Path

**We use DIRECT 4-stage API calls. n8n is NOT active.**

```
Letter Submit
    │
    ▼
Stage 1: Perplexity sonar-pro
         (web-grounded legal research)
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

## Routing Decision (pipeline.ts line 462)

```ts
const useN8nPrimary = process.env.N8N_PRIMARY === "true"
  && !!n8nWebhookUrl
  && n8nWebhookUrl.startsWith("https://");
```

**Three conditions must ALL be true to activate n8n:**

| Condition | Current Value | Result |
|-----------|--------------|--------|
| `N8N_PRIMARY=true` | **NOT SET** | ❌ Short-circuits here |
| `N8N_WEBHOOK_URL` set | Set in secrets | ✅ |
| URL starts with `https://` | Yes | ✅ |

Because `N8N_PRIMARY` is not set, the pipeline **always** falls through to the direct 4-stage path.

---

## Model Summary

| Stage | Provider | Model | Timeout |
|-------|----------|-------|---------|
| Research | Perplexity (OpenAI-compatible) | `sonar-pro` | 90s |
| Draft | Anthropic | `claude-opus-4-5` | 120s |
| Assembly | Anthropic | `claude-opus-4-5` | 120s |
| Vetting | Anthropic | `claude-sonnet` | 120s |

**Fallback:** If `PERPLEXITY_API_KEY` is not set, Stage 1 falls back to `claude-opus-4-5` for research.

---

## n8n Status

- `n8nCallback.ts` is registered as an Express route at `/api/pipeline/n8n-callback`
- It will **never be called** unless `N8N_PRIMARY=true` is set in environment
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
| `server/n8nCallback.ts` | n8n webhook handler (dormant) |
| `server/pdfGenerator.ts` | PDFKit-based PDF generation on approval |
| `server/routers.ts` | tRPC procedures that trigger pipeline |
| `server/email.ts` | Email notifications at each status change |
| `server/db.ts` | All database query helpers |
| `drizzle/schema.ts` | Database schema + enums |

---

## Environment Variables (Pipeline-related)

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | **Yes** | Stages 2 + 3 (always required) |
| `PERPLEXITY_API_KEY` | Recommended | Stage 1 research (falls back to Claude if missing) |
| `N8N_WEBHOOK_URL` | No | n8n webhook URL (only used if N8N_PRIMARY=true) |
| `N8N_CALLBACK_SECRET` | No | n8n auth header secret |
| `N8N_PRIMARY` | No | Set to `"true"` to activate n8n path (default: off) |
