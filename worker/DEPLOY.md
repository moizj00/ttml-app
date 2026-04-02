# TTML Affiliate Tracker — Cloudflare Worker

Handles referral link redirects and click tracking for Talk-to-My-Lawyer employees.

## How it works

1. Employee shares: `https://refer.talktomylawyer.com/TTML-001`
2. Worker validates the code is in the KV allowlist (populated by the main server)
3. Worker logs the click (timestamp, country, unique visitor hash, referrer) to KV using `ctx.waitUntil` — non-blocking
4. Visitor is redirected to: `https://www.talk-to-my-lawyer.com/pricing?coupon=TTML-001`
5. Pricing page auto-applies the 20% discount

Invalid codes (not in allowlist) redirect to the main site without a coupon and are never logged.

## Code Allowlist

The Worker validates discount codes against a KV allowlist before logging or redirecting.
The main server syncs codes automatically:
- When a new employee discount code is created → Worker KV entry added
- When a code is rotated → old entry removed, new entry added
- Admin endpoint: `POST /admin/codes` with `{ code, action: "add"|"remove" }` authenticated by bearer token

## First-time setup

### 1. Install Wrangler
```bash
npm install -g wrangler
wrangler login
```

### 2. Create the KV namespace
```bash
cd worker
wrangler kv:namespace create AFFILIATE_CLICKS
wrangler kv:namespace create AFFILIATE_CLICKS --preview
```
Copy the IDs into `wrangler.toml`.

### 3. Set secrets and variables
```bash
wrangler secret put ANALYTICS_SECRET
# Enter a strong random string — keep it safe, it protects analytics + admin endpoints

# If your main site URL differs from the default:
wrangler vars put MAIN_SITE_URL https://www.talk-to-my-lawyer.com
```

### 4. Deploy
```bash
cd worker
npm install
npm run deploy
```

### 5. Configure DNS
In Cloudflare Dashboard → DNS → add a CNAME:
- Name: `refer`
- Target: your Workers subdomain (e.g. `ttml-affiliate-tracker.<account>.workers.dev`)

Then add a Custom Domain for the Worker: `refer.talktomylawyer.com`.

### 6. Configure the main server
Set these environment variables in your hosting environment (Railway, etc.):
- `AFFILIATE_WORKER_URL` = `https://refer.talktomylawyer.com`
- `AFFILIATE_WORKER_SECRET` = the ANALYTICS_SECRET you set above

The server will automatically sync new/rotated codes to the Worker allowlist.

### 7. Backfill existing codes (first deploy only)
After deploying, existing employee codes need to be added to the allowlist.
Run this script once against your production database or use the admin endpoint:

```bash
# For each existing active employee discount code:
curl -X POST https://refer.talktomylawyer.com/admin/codes \
  -H "Authorization: Bearer <your-secret>" \
  -H "Content-Type: application/json" \
  -d '{"code": "TTML-001", "action": "add"}'
```

## Analytics API

```
GET https://refer.talktomylawyer.com/<CODE>/analytics?days=30
Authorization: Bearer <ANALYTICS_SECRET>
```

Returns:
```json
{
  "totalClicks": 42,
  "uniqueVisitors": 31,
  "daily": [
    { "date": "2026-03-25", "clicks": 5, "uniqueVisitors": 4 },
    ...
  ]
}
```

The Employee Affiliate Dashboard fetches this automatically via the server proxy
(`affiliate.clickAnalytics` tRPC endpoint).

## KV Key Patterns

| Key | Value | Notes |
|-----|-------|-------|
| `valid_codes:{CODE}` | `"1"` | Allowlist entry (written by `/admin/codes` endpoint) |
| `click:{CODE}:{date}:{visitorHash}` | `"1"` | Unique visit marker, TTL 90 days |
| `meta:{CODE}:total` | number (string) | Total all-time click count |
| `meta:{CODE}:unique` | number (string) | Total unique visitor count |
| `meta:{CODE}:daily:{YYYY-MM-DD}` | `{clicks, uniqueVisitors}` | Daily bucket, TTL 1 year |
| `clicks:{CODE}:recent` | `ClickEntry[]` | Last 500 clicks, TTL 90 days |
