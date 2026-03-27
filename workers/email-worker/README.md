# TTML Email Worker

A Cloudflare Worker that handles email template rendering and delivery for Talk to My Lawyer.

## Overview

The main Express server sends lightweight JSON payloads to this Worker. The Worker renders the full HTML email from templates and delivers it via the Resend API, with exponential-backoff retry logic and Cloudflare dashboard logging.

## Setup

### 1. Install dependencies

```bash
cd workers/email-worker
npm install
```

### 2. Set secrets

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM_EMAIL
wrangler secret put EMAIL_WORKER_SECRET
```

`EMAIL_WORKER_SECRET` must match the `EMAIL_WORKER_SECRET` environment variable on the main server.

### 3. Deploy

```bash
wrangler deploy
```

The deployed URL (e.g. `https://ttml-email-worker.your-subdomain.workers.dev`) becomes the `EMAIL_WORKER_URL` on the main server.

## Main Server Configuration

Add these environment variables to the main server (Railway / .env):

```
EMAIL_WORKER_URL=https://ttml-email-worker.your-subdomain.workers.dev
EMAIL_WORKER_SECRET=<same-secret-set-on-worker>
```

When these are set, all email sending is delegated to the Worker (fire-and-forget). If they are not set, the server falls back to sending directly via Resend.

## Local Development

```bash
wrangler dev
```

The Worker runs locally at `http://localhost:8787`.

## Architecture

```
Express Server ──POST /──► Cloudflare Worker ──► Resend API ──► Inbox
  (fire-and-forget)           (render + retry)
```

- **Auth**: Shared secret in `Authorization: Bearer <secret>` header
- **Retry**: 4 attempts with 2s / 5s / 10s exponential backoff
- **Logging**: Failures visible in Cloudflare dashboard
- **Fallback**: Server sends directly if Worker URL is not configured
