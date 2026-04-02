# TTML PDF Generator — Cloudflare Worker

A Cloudflare Worker that generates PDFs from rendered HTML using the Browser Rendering API
(headless Chromium managed by Cloudflare). This offloads CPU-intensive Puppeteer rendering
from the main Express server.

## Architecture

```
Main Server (Express)
  │
  ├── buildApprovedLetterHtml() / buildDraftLetterHtml()  ← letterTemplates.ts
  │
  └── POST https://pdf.talktomylawyer.com/generate  ──→  This Worker (Cloudflare)
        { html, headerTemplate, footerTemplate,             │
          watermark, letterId }                             ├── puppeteer.launch(env.BROWSER)
        ← PDF buffer (application/pdf)                     └── page.pdf(...)
```

The main server falls back to local Puppeteer if the Worker is unreachable
(network error, 5xx response, or `PDF_WORKER_URL` env var not configured).

## Request Format

```
POST /
Authorization: Bearer <PDF_WORKER_SECRET>
Content-Type: application/json

{
  "html":           "<html>...</html>",  // fully rendered letter HTML
  "headerTemplate": "<div>...</div>",    // Puppeteer header template
  "footerTemplate": "<div>...</div>",    // Puppeteer footer template
  "watermark":      false,               // true for draft PDFs (logged only)
  "letterId":       42                   // for audit logging
}
```

## Response

- `200 application/pdf` — binary PDF body
- `400 application/json` — `{ "error": "..." }` — bad request
- `401 application/json` — `{ "error": "Unauthorized" }` — missing/invalid token
- `500 application/json` — `{ "error": "..." }` — generation failure

## Prerequisites

- Cloudflare account with **Workers Paid plan** (Browser Rendering API requires paid plan)
- `wrangler` CLI: `npm install -g wrangler`

## Setup

### 1. Authenticate

```bash
wrangler login
```

### 2. Deploy the Worker

```bash
cd workers/pdf-worker
wrangler deploy
# or for staging:
wrangler deploy --env staging
```

### 3. Set the shared secret

```bash
wrangler secret put PDF_WORKER_SECRET
# enter your secret at the prompt (generate with: openssl rand -hex 32)
```

### 4. Configure the main server

Set these environment variables on your Railway deployment:

```
PDF_WORKER_URL=https://ttml-pdf-generator.<your-account>.workers.dev
PDF_WORKER_SECRET=<same secret as above>
```

The server will automatically route PDF generation through the Worker when
`PDF_WORKER_URL` is set. If the Worker is unavailable, it falls back to
local Puppeteer seamlessly.

## Local Development

```bash
wrangler dev
```

Note: Browser Rendering API is not available in local `wrangler dev` — you need
`wrangler dev --remote` to use the actual Cloudflare Browser binding.

## Monitoring

```bash
# Stream live logs
wrangler tail

# View in dashboard
# Workers & Pages → ttml-pdf-generator → Metrics
```

## Rollback

```bash
wrangler rollback
```
