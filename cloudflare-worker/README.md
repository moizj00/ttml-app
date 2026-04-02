# TTML Edge Rate Limiter — Cloudflare Worker

A Cloudflare Worker that acts as a reverse proxy in front of the Railway origin,
providing IP-based rate limiting at the edge before traffic reaches the application.

## Architecture

```
Client → Cloudflare DNS (proxied) → Worker (edge rate limit) → Railway origin → Express (Upstash per-user limits)
```

- **Edge layer (this Worker):** coarse IP-based throttling, blocks abusive bots/DDoS
- **App layer (Upstash Redis):** fine-grained per-user/per-action limits on sensitive endpoints

## Rate Limit Tiers

| Tier            | Path pattern     | Limit              | Rationale                                     |
|-----------------|------------------|--------------------|-----------------------------------------------|
| `auth`          | `/api/auth/*`    | 20 req / 15 min    | Tighter — 2× the Upstash per-IP limit         |
| `trpc`          | `/api/trpc/*`    | 200 req / 1 min    | 3× the Upstash general limit (60/min)         |
| `api`           | `/api/*`         | 100 req / 1 min    | Covers other API routes                       |
| `static`        | everything else  | 500 req / 1 min    | Very lenient for pages and assets             |

All limits are per client IP. Legitimate users never hit these ceilings.

## IP Header Preservation

The Worker sets `X-Forwarded-For` to include the confirmed Cloudflare client IP
(`CF-Connecting-IP`) so the existing Upstash rate limiter downstream continues
to extract the real IP correctly. A `X-Edge-Rate-Limited: 1` header is also
added to signal that the Worker has already performed a first-pass check.

## Analytics

Blocked requests are recorded in Cloudflare KV under daily keys:

```
blocked:{tier}:{YYYY-MM-DD}  →  count
```

Keys expire after 30 days. You can read them with:

```bash
wrangler kv:key list --binding=BLOCKED_COUNTER
wrangler kv:key get --binding=BLOCKED_COUNTER "blocked:auth:2026-03-26"
```

Cloudflare Workers Analytics (available in the dashboard) also shows request
volume, error rates, and CPU time per Worker invocation.

## Prerequisites

- Cloudflare account with the domain (`talk-to-my-lawyer.com`) added and DNS in
  **Cloudflare proxy mode** (orange cloud icon).
- Workers Paid plan or Workers Free plan (rate-limit bindings require the Paid plan).
- `wrangler` CLI installed: `npm install -g wrangler`

## Setup

### 1. Authenticate

```bash
wrangler login
```

### 2. Create the KV namespace

```bash
wrangler kv:namespace create BLOCKED_COUNTER
```

Copy the output `id` and paste it into `wrangler.toml` replacing
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

For staging:

```bash
wrangler kv:namespace create BLOCKED_COUNTER --env staging
```

### 3. Update wrangler.toml

- Set `RAILWAY_ORIGIN` to your actual Railway deployment URL.
- Replace the placeholder KV namespace IDs.
- The `namespace_id` values inside `[[unsafe.bindings]]` for rate limits are
  arbitrary integers that namespace the counters — keep the defaults or change
  them to avoid collisions if you run multiple Workers.

### 4. Deploy

```bash
# Production
wrangler deploy

# Staging
wrangler deploy --env staging
```

### 5. DNS

Ensure your domain's DNS A/CNAME records are **proxied** through Cloudflare
(orange cloud). The Worker routes defined in `wrangler.toml` will then intercept
all traffic automatically.

## Local Development

```bash
wrangler dev
```

This starts a local Worker that proxies to `RAILWAY_ORIGIN`. Rate limit bindings
run in simulation mode locally — they do not actually block requests unless you
use `--remote`.

## Updating Limits

Edit the `simple = { limit = N, period = S }` fields in `wrangler.toml` and
redeploy. No code changes needed.

## Monitoring

- **Cloudflare Dashboard → Workers & Pages → ttml-edge-rate-limiter → Metrics**:
  shows total requests, error rate (429s appear as errors), CPU time.
- **KV analytics**: query the `BLOCKED_COUNTER` namespace as shown above.
- **Real-time logs**: `wrangler tail` streams live Worker logs.

## Rollback

```bash
wrangler rollback
```

This instantly reverts the Worker to the previous deployment without any DNS
changes.
