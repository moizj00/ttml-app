# Research Cache Worker

Cloudflare Worker providing GET/PUT endpoints over a KV namespace for caching
Perplexity legal research packets.

## Setup

1. Create a KV namespace:
   ```
   wrangler kv:namespace create RESEARCH_CACHE
   ```
   Copy the returned `id` into `wrangler.toml`.

2. Set the auth token secret:
   ```
   wrangler secret put AUTH_TOKEN
   ```

3. Deploy:
   ```
   npm run deploy
   ```

4. Set environment variables in your main application:
   - `KV_WORKER_URL` — the deployed Worker URL (e.g. `https://research-cache.your-account.workers.dev`)
   - `KV_WORKER_AUTH_TOKEN` — the same token you set in step 2

## API

| Method | Path              | Description                        |
|--------|-------------------|------------------------------------|
| GET    | /research/:key    | Retrieve a cached research packet  |
| PUT    | /research/:key    | Store a research packet            |

All requests require `Authorization: Bearer <AUTH_TOKEN>`.

### PUT body

```json
{
  "packet": { ... },
  "ttl": 604800
}
```

`ttl` is optional (default: 604800 = 7 days).
