---
name: ttml-n8n-workflow-integration
description: n8n workflow integration for the TTML AI letter pipeline. Use when configuring the optional n8n path, debugging n8n MCP/webhook calls, or designing an n8n workflow that mirrors the in-app 4-stage pipeline.
---

# n8n Workflow Integration

## Architecture Overview

The **canonical, primary** letter pipeline runs **in-app** via `server/pipeline/orchestrator.ts` — a 4-stage chain (Perplexity `sonar-pro` research → Claude Opus draft → Claude Opus assembly → Claude Sonnet vetting), driven by pg-boss workers.

n8n is an **optional, dormant** alternative. It is only consulted when `N8N_PRIMARY=true` AND a usable transport is configured (either `N8N_MCP_URL` + `N8N_MCP_BEARER_TOKEN` or a plain `N8N_WEBHOOK_URL`). If the n8n call fails or times out, the orchestrator falls back to the in-app pipeline — **not** to OpenAI. OpenAI GPT-4o is reserved for the free `documents.analyze` analyzer and is not part of the letter pipeline.

```
Default (N8N_PRIMARY unset / false):
  submit → in-app 4-stage pipeline → letter_versions(ai_draft) → pending_review

With N8N_PRIMARY=true:
  submit → try n8n (MCP preferred, webhook fallback)
        ↳ on failure/timeout → in-app 4-stage pipeline
```

When n8n is active, its workflow should mirror the 4-stage chain so the `ai_draft` it writes is comparable in quality to what the in-app path produces.

### Why n8n Is Sometimes Useful

- Visual workflow authoring for legal ops / attorneys who want to tweak jurisdiction-specific prompts without a code deploy
- Built-in integrations to third-party legal-research databases
- Direct Supabase service-role writes for latency-sensitive ops
- Easier to experiment with prompt variations in staging

---

## Critical Rules (MUST Follow)

1. **[DORMANT BY DEFAULT]** n8n must not run unless `N8N_PRIMARY=true`. The default `.env` ships with this unset; production flips it intentionally.

2. **[MCP PREFERRED, WEBHOOK FALLBACK]** Prefer the n8n MCP server (`N8N_MCP_URL` + bearer token). Fall back to the plain webhook path only if MCP is unreachable. Both paths are owned by `server/n8nMcp.ts`.

3. **[SAME OUTPUT SHAPE]** Whatever n8n produces, it must land in the same places the in-app pipeline uses: a `letter_versions` row (`version_type = 'ai_draft'`), an updated `letter_requests.status`, a `workflow_jobs` row per stage, and a `research_runs` row for grounded research. Never invent a parallel table.

4. **[SERVER-ROLE WRITES ONLY]** n8n writes to Supabase using the **service_role** key (bypasses RLS). Never put this key in any client-visible place. Rotate immediately if it leaks.

5. **[TIMEOUT DISCIPLINE]** The orchestrator wraps n8n calls in an `AbortSignal` timeout. If it trips, fail cleanly and let the in-app pipeline take over.

6. **[GRACEFUL FALLBACK]** n8n failures fall back to the in-app pipeline **silently** to the user. The failure is recorded in `workflow_jobs` / Sentry — not surfaced in the UI.

7. **[WEBHOOK SECURITY]** The webhook URL must be HTTPS and carry a secret (`X-Webhook-Secret` header), verified at the n8n entry node.

8. **[PAYLOAD VALIDATION]** Validate the n8n response against a Zod schema before trusting it. Required fields: `letterRequestId`, `status`, and at least one content artifact (draft markdown or a version row id).

9. **[JURISDICTION EXTRACTION]** n8n extracts jurisdiction from the intake address when not explicitly provided. Default to `'CA'` only as a last resort and mark the letter accordingly.

10. **[RESEARCH PROVENANCE]** If n8n does its own research (instead of deferring to Perplexity), persist the statutes / disclosures / KV cache provenance in `research_runs.jsonRaw` for attorney reference.

11. **[MONITORING]** Track n8n availability, response time, and failure rate via `workflow_jobs`. Alert DevOps if success rate <95% or average response time >30 s.

---

## Environment Variables

```env
# Route through n8n when true; otherwise run the in-app pipeline (default)
N8N_PRIMARY=false

# Preferred transport: n8n MCP server
N8N_MCP_URL=https://n8n.example.com/mcp
N8N_MCP_BEARER_TOKEN=sk_live_...

# Fallback transport: plain webhook
N8N_WEBHOOK_URL=https://n8n.example.com/webhook/generate-letter
N8N_WEBHOOK_SECRET=whsec_...

# Supabase connection for n8n's direct DB writes (service_role — NEVER expose this)
N8N_SUPABASE_URL=https://<project>.supabase.co
N8N_SUPABASE_SERVICE_KEY=service_role_key_here

# Optional: use IPv4 direct URL if n8n lives in an IPv4-only network
N8N_SUPABASE_DIRECT_URL=postgresql://postgres:...@db.<project>.supabase.co:5432/postgres
```

### Availability Check

```typescript
// server/n8nMcp.ts — illustrative
export function isN8nActive(): boolean {
  if (process.env.N8N_PRIMARY !== 'true') return false

  const mcpUrl = process.env.N8N_MCP_URL
  const mcpTok = process.env.N8N_MCP_BEARER_TOKEN
  if (mcpUrl && mcpTok) return mcpUrl.startsWith('https://')

  const webhookUrl = process.env.N8N_WEBHOOK_URL
  return !!webhookUrl && webhookUrl.startsWith('https://')
}
```

---

## Integration in the Orchestrator

n8n routing lives in `server/pipeline/orchestrator.ts`, next to (not instead of) the in-app chain. The orchestrator is reached from the pg-boss `pipeline.run` worker — not from a request handler.

```typescript
// server/pipeline/orchestrator.ts (illustrative)
export async function runPipeline(ctx: PipelineCtx) {
  const letterId = ctx.letterRequestId

  if (isN8nActive()) {
    try {
      const result = await triggerN8nPipeline(ctx)
      if (result.ok) return result
      ctx.logger.warn({ letterId, err: result.error }, 'n8n path failed, falling back to in-app pipeline')
    } catch (err) {
      ctx.logger.warn({ letterId, err }, 'n8n path threw, falling back to in-app pipeline')
    }
  }

  // In-app 4-stage pipeline
  await runResearchStage(ctx)   // Perplexity sonar-pro → research_runs row
  await runDraftStage(ctx)      // Claude Opus → intermediate content registry
  await runAssemblyStage(ctx)   // Claude Opus → letter_versions row (ai_draft)
  await runVettingStage(ctx)    // Claude Sonnet → updates ai_draft, may loop
}
```

`triggerN8nPipeline` returns a typed result and does not throw for expected failures (timeout, 5xx, invalid response) — only unexpected bugs propagate.

### Payload Shape

```typescript
// server/n8nMcp.ts
export interface N8nPipelineRequest {
  letterRequestId: string
  userId: string
  letterType: LetterType
  intake: {
    sender: { name: string; address: string; email?: string; phone?: string }
    recipient: { name: string; address: string; email?: string }
    details: Record<string, unknown> // type-specific fields
    jurisdiction?: string            // 2-letter state code
  }
  metadata: {
    userEmail: string
    createdAt: string // ISO
    pipelineVersion: string // e.g. "2026.04" so n8n can branch on it
  }
}

export interface N8nPipelineResult {
  ok: boolean
  letterRequestId: string
  status?: LetterStatus  // expected 'generated_locked' on success
  aiDraftVersionId?: string
  researchRunId?: string
  error?: string
  errorType?: 'http_error' | 'invalid_response' | 'timeout' | 'network_error'
}
```

### Transform + Dispatch

```typescript
export async function triggerN8nPipeline(ctx: PipelineCtx): Promise<N8nPipelineResult> {
  const payload = buildN8nPayload(ctx)

  // Try MCP first
  if (process.env.N8N_MCP_URL) {
    const mcpRes = await callN8nViaMcp(payload)
    if (mcpRes.ok) return mcpRes
    ctx.logger.warn({ err: mcpRes.error }, 'n8n MCP call failed; trying webhook')
  }

  // Fall back to webhook
  if (process.env.N8N_WEBHOOK_URL) {
    return callN8nViaWebhook(payload)
  }

  return { ok: false, letterRequestId: ctx.letterRequestId, error: 'no n8n transport configured', errorType: 'network_error' }
}

async function callN8nViaWebhook(payload: N8nPipelineRequest): Promise<N8nPipelineResult> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL!
  const secret = process.env.N8N_WEBHOOK_SECRET

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'X-Webhook-Secret': secret } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55_000),
    })

    if (!response.ok) {
      const body = await response.text()
      return {
        ok: false,
        letterRequestId: payload.letterRequestId,
        error: `n8n returned ${response.status}: ${body.slice(0, 500)}`,
        errorType: 'http_error',
      }
    }

    const parsed = N8nPipelineResultSchema.safeParse(await response.json())
    if (!parsed.success) {
      return {
        ok: false,
        letterRequestId: payload.letterRequestId,
        error: 'n8n response failed validation',
        errorType: 'invalid_response',
      }
    }
    return { ...parsed.data, ok: true }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        ok: false,
        letterRequestId: payload.letterRequestId,
        error: 'n8n workflow timeout',
        errorType: 'timeout',
      }
    }
    return {
      ok: false,
      letterRequestId: payload.letterRequestId,
      error: err?.message ?? String(err),
      errorType: 'network_error',
    }
  }
}
```

### Jurisdiction Extraction Helpers

```typescript
export function extractStateCode(address: string | undefined): string | null {
  if (!address) return null
  const m = address.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/)
  return m?.[1] ?? null
}

export function extractTypeSpecificFields(letterType: LetterType, intake: Record<string, unknown>) {
  const typeFieldMap: Record<LetterType, string[]> = {
    'demand-letter':       ['amountOwed', 'deadlineDate', 'incidentDescription'],
    'cease-and-desist':    ['violationDescription', 'demandedAction', 'deadlineDate'],
    'contract-breach':     ['contractDate', 'breachDescription', 'remedySought'],
    'eviction-notice':     ['propertyAddress', 'reasonForEviction', 'noticePeriod'],
    'employment-dispute':  ['disputeDescription', 'employmentDates', 'resolutionSought'],
    'consumer-complaint':  ['complaintDescription', 'purchaseDate', 'resolutionSought'],
  }
  const fields = typeFieldMap[letterType] ?? []
  const out: Record<string, unknown> = {}
  for (const f of fields) if (intake[f] !== undefined) out[f] = intake[f]
  return out
}
```

---

## n8n Workflow Design

The n8n workflow should mirror the 4-stage chain so the letter it writes is comparable in quality. A proven layout:

```
1. Webhook Trigger (POST, header-auth via X-Webhook-Secret)
   ↓
2. Extract Jurisdiction (JS code node)
   ↓
3. Research Stage
   - Option A: call Perplexity sonar-pro (recommended)
   - Option B: hit a dedicated legal-research API + persist provenance
   ↓
4. Draft Stage (Anthropic node, Claude Opus)
   ↓
5. Assembly Stage (Anthropic node, Claude Opus)
   ↓
6. Vetting Stage (Anthropic node, Claude Sonnet) with retry loop on critical issues
   ↓
7. Supabase writes:
   - research_runs row with provenance
   - letter_versions row (version_type = 'ai_draft')
   - letter_requests.current_version_id, status = 'generated_locked'
   - workflow_jobs row per stage
   ↓
8. Respond to Webhook (200 + minimal JSON)
```

### Step 1 — Webhook Trigger

- **Method:** POST
- **Path:** `/webhook/generate-letter`
- **Authentication:** Header Auth (`X-Webhook-Secret`, matched against `$env.N8N_WEBHOOK_SECRET`)
- **Response Mode:** Wait for Completion

### Step 2 — Extract Jurisdiction (Code / JavaScript)

```javascript
const item = $input.item.json
const intake = item.intake
const valid = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL',
  'IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY'])

let jurisdiction = (intake.jurisdiction || '').toUpperCase()
if (!valid.has(jurisdiction)) {
  const fromSender    = (intake.sender?.address || '').match(/\b([A-Z]{2})\s+\d{5}/)?.[1]
  const fromRecipient = (intake.recipient?.address || '').match(/\b([A-Z]{2})\s+\d{5}/)?.[1]
  jurisdiction = fromSender || fromRecipient || 'CA'
}

return { json: { ...item, jurisdiction } }
```

### Step 3 — Research (Perplexity sonar-pro preferred)

Use an HTTP Request node against the Perplexity API with the `sonar-pro` model. Persist the response verbatim so `research_runs.jsonRaw` can store it. If Perplexity fails in n8n, fall back to **Claude Opus** (no web grounding) and mark the research_run `webGrounded: false`.

### Step 4 / 5 — Draft + Assembly (Anthropic Claude Opus)

Use the Anthropic node (or HTTP Request against `/v1/messages`). Refer to the model by brand (`claude-opus-*`); exact pinned model IDs live in `server/pipeline/providers.ts` and should not be duplicated in n8n configs without a version note.

### Step 6 — Vetting (Anthropic Claude Sonnet)

Vetting is a separate call that audits the assembled draft for:
- Hallucinated or miscited statutes
- Jurisdiction mismatch
- Factual errors
- Bloat / tone issues

On a "critical issues" response, loop back to Step 5 (Assembly) with the vetting feedback appended. After N retries (default 2), mark `quality_degraded = true` and append `qualityWarnings` but continue to the write stage.

### Step 7 — Supabase Writes

Use the Supabase node with the **service_role** key. Order of operations:

1. Insert `research_runs` row (jurisdiction, provider, `jsonRaw`, `webGrounded`)
2. Insert `letter_versions` row (`letterRequestId`, `versionType = 'ai_draft'`, `contentMarkdown`)
3. Update `letter_requests`:
   - `currentVersionId = <inserted version id>`
   - `status = 'generated_locked'`
   - `researchUnverified = <true if Perplexity failed>`
   - `qualityDegraded = <true if vetting exhausted retries>`
4. Insert `workflow_jobs` rows for each stage (jobType, provider, status, token counts, estimatedCostUsd)

Do **not** write to any legacy table like `letters` — the canonical table is `letter_requests`.

### Step 8 — Respond to Webhook

Return a minimal JSON payload matching `N8nPipelineResult` so the orchestrator can verify and log.

```json
{
  "ok": true,
  "letterRequestId": "<uuid>",
  "status": "generated_locked",
  "aiDraftVersionId": "<uuid>",
  "researchRunId": "<uuid>"
}
```

---

## Error Handling in n8n

### Workflow Error Catcher

Attach an **Error Trigger** to the workflow. On any step error:

```javascript
const error = $json.error
const letterId = $json.letterRequestId

// Write a pipeline_failed workflow_jobs row (service role)
const failedJob = {
  letter_request_id: letterId,
  job_type: 'n8n_' + ($json.$node?.name ?? 'unknown'),
  provider: 'n8n',
  status: 'failed',
  error_message: error?.message?.slice(0, 2000),
}

// Respond with a structured failure so the orchestrator knows to fall back
return {
  json: {
    ok: false,
    letterRequestId: letterId,
    errorType: 'http_error',
    error: error?.message ?? 'unknown n8n error',
  },
}
```

**Do not** set `letter_requests.status = 'pipeline_failed'` from n8n — let the orchestrator decide whether the in-app fallback should run. A false `pipeline_failed` set by n8n would wrongly deny the user a retry.

---

## Monitoring & Debugging

### Health Check

```typescript
// Cron or Railway health-check route
export async function checkN8nHealth() {
  if (!isN8nActive()) return
  try {
    const url = new URL('/health', process.env.N8N_WEBHOOK_URL!).toString()
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5_000) })
    if (!res.ok) logger.error({ status: res.status }, '[n8n] health check failed')
  } catch (err) {
    logger.error({ err }, '[n8n] health check threw')
  }
}
```

### Metrics

`workflow_jobs` already stores per-stage status, provider, and token counts. Roll up via a read-only view:

```sql
CREATE VIEW public.n8n_metrics AS
SELECT
  date_trunc('hour', created_at)                                           AS hour,
  COUNT(*)                                                                 AS total_calls,
  COUNT(*) FILTER (WHERE status = 'succeeded')                             AS successful_calls,
  COUNT(*) FILTER (WHERE status = 'failed')                                AS failed_calls,
  COUNT(*) FILTER (WHERE status = 'failed' AND error_message ILIKE '%timeout%') AS timeout_calls,
  AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)               AS avg_ms
FROM public.workflow_jobs
WHERE provider = 'n8n'
GROUP BY 1
ORDER BY 1 DESC;
```

Expose this only to `service_role` / admins; do not grant to `authenticated`.

---

## Testing n8n Integration

### Manual Webhook Test

```bash
curl -X POST https://n8n.example.com/webhook/generate-letter \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $N8N_WEBHOOK_SECRET" \
  -d '{
    "letterRequestId": "00000000-0000-0000-0000-000000000001",
    "userId":          "00000000-0000-0000-0000-000000000002",
    "letterType":      "demand-letter",
    "intake": {
      "sender":    { "name": "John Doe",   "address": "123 Main St, Los Angeles, CA 90001" },
      "recipient": { "name": "Jane Smith", "address": "456 Oak Ave, Los Angeles, CA 90002" },
      "details":   { "amountOwed": "5000.00", "deadlineDate": "2026-03-01",
                     "incidentDescription": "Unpaid invoice for services rendered" },
      "jurisdiction": "CA"
    },
    "metadata": { "userEmail": "john@example.com", "createdAt": "2026-04-18T00:00:00Z",
                  "pipelineVersion": "2026.04" }
  }'
```

### Integration Test (vitest)

```typescript
describe('n8n Integration (dormant path)', () => {
  beforeAll(() => { process.env.N8N_PRIMARY = 'true' })
  afterAll(() => { delete process.env.N8N_PRIMARY })

  it('writes an ai_draft version + generated_locked status', async () => {
    const request: N8nPipelineRequest = buildTestRequest('demand-letter')
    const result = await triggerN8nPipeline({ ...ctxFixture, ...request })

    expect(result.ok).toBe(true)
    expect(result.status).toBe('generated_locked')

    const version = await db.query.letterVersions.findFirst({
      where: eq(letterVersions.id, result.aiDraftVersionId!),
    })
    expect(version?.versionType).toBe('ai_draft')
  })

  it('falls back to in-app pipeline when n8n times out', async () => {
    mockFetch.timeout()
    const result = await runPipeline(ctxFixture) // orchestrator entry point
    // Expect in-app chain to have produced the ai_draft, not n8n
    expect(result.producedBy).toBe('in_app')
  })
})
```

---

## Related Skills

- `ttml-pipeline-expert` — the 4-stage pipeline semantics
- `ttml-pipeline-orchestrator` — implementation companion (`server/pipeline/`, pg-boss, provider table)
- `ttml-langgraph-pipeline` — optional LangGraph replacement for the in-app path
