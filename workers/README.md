# Blog Cache Worker

A Cloudflare Worker that caches published blog posts in Cloudflare KV, enabling
globally fast (sub-100 ms) reads without hitting the origin database on every
request.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/blog-cache/list?category=&limit=12&offset=0` | Return paginated published posts (cached) |
| GET | `/blog-cache/post/:slug` | Return a single published post (cached) |
| POST | `/blog-cache/invalidate` | Purge cache entries (auth required) |

## Cache keys

- `blog:list:<category>:<limit>:<offset>` — paginated post lists
- `blog:post:<slug>` — individual post objects

TTL: **3 600 seconds** (1 hour). Entries are also invalidated on-demand whenever
an admin creates, updates, or deletes a post.

## Deployment

1. Install Wrangler: `npm install -g wrangler`
2. Create a KV namespace:
   ```
   wrangler kv:namespace create BLOG_CACHE
   wrangler kv:namespace create BLOG_CACHE --preview
   ```
3. Update `wrangler.toml` with the returned namespace IDs.
4. Set secrets:
   ```
   wrangler secret put ORIGIN_URL
   wrangler secret put INVALIDATION_SECRET
   ```
   > **Note:** `INVALIDATION_SECRET` is used for two purposes:
   > 1. Authenticating Worker's `POST /blog-cache/invalidate` endpoint (Bearer token).
   > 2. Authenticating Worker→origin internal REST calls via `X-Blog-Internal-Secret` header.
   > Set the same value as `CF_BLOG_CACHE_INVALIDATION_SECRET` on the origin server.
5. Deploy:
   ```
   cd workers
   wrangler deploy
   ```

## Origin server configuration

Set the following environment variables on the origin server (Railway / .env):

| Variable | Description |
|----------|-------------|
| `CF_BLOG_CACHE_WORKER_URL` | Public URL of the deployed Worker (e.g. `https://ttml-blog-cache.your-subdomain.workers.dev`) |
| `CF_BLOG_CACHE_INVALIDATION_SECRET` | Shared secret that matches `INVALIDATION_SECRET` on the Worker |

When these variables are absent, cache invalidation calls are silently skipped
and the app continues to work normally.
