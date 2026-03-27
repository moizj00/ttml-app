/**
 * Cloudflare Worker: Blog Content Caching Proxy
 *
 * Caches published blog posts in Cloudflare KV. On cache hit, the KV value is
 * returned immediately (sub-100 ms globally). On cache miss, the Worker calls
 * the origin's *internal* uncached REST endpoints, stores the response in KV,
 * and returns it.
 *
 * Read path (no recursion):
 *   Client  →  Worker /blog-cache/*
 *                ├─ KV hit  → return cached JSON
 *                └─ KV miss → fetch origin /api/blog-internal/* (DB-direct, uncached)
 *                               → store in KV → return
 *
 * Required KV binding (wrangler.toml):
 *   [[kv_namespaces]]
 *   binding = "BLOG_CACHE"
 *   id = "<your-kv-namespace-id>"
 *
 * Required secrets (wrangler secret put ...):
 *   ORIGIN_URL          — base URL of the origin server, no trailing slash
 *                         e.g. https://api.talk-to-my-lawyer.com
 *   INVALIDATION_SECRET — shared Bearer token for cache-invalidation requests
 *
 * Cache key schema:
 *   blog:list:<category>:<limit>:<offset>   → JSON of { posts, total }
 *   blog:post:<slug>                        → JSON of the full post object
 *
 * Cache TTL: 3600 seconds (1 hour). Invalidation is explicit/on-demand.
 */

const CACHE_TTL_SECONDS = 3600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/blog-cache/invalidate") {
      return handleInvalidation(request, env);
    }

    if (pathname === "/blog-cache/list") {
      return handleList(request, env, url);
    }

    if (pathname.startsWith("/blog-cache/post/")) {
      const slug = pathname.replace("/blog-cache/post/", "");
      return handleGetBySlug(request, env, slug);
    }

    return new Response("Not found", { status: 404 });
  },
};

/**
 * GET /blog-cache/list?category=...&limit=...&offset=...
 *
 * On miss, calls the UNCACHED origin endpoint /api/blog-internal/list
 * so there is no recursive loop back through the Worker.
 */
async function handleList(request, env, url) {
  const category = url.searchParams.get("category") ?? "";
  const limit = url.searchParams.get("limit") ?? "12";
  const offset = url.searchParams.get("offset") ?? "0";

  const cacheKey = `blog:list:${category}:${limit}:${offset}`;

  const cached = await env.BLOG_CACHE.get(cacheKey, { type: "json" });
  if (cached !== null) {
    return jsonResponse(cached, { "X-Cache": "HIT" });
  }

  // Fetch from origin's INTERNAL (uncached, DB-direct) endpoint
  const originUrl = new URL(`${env.ORIGIN_URL}/api/blog-internal/list`);
  if (category) originUrl.searchParams.set("category", category);
  originUrl.searchParams.set("limit", limit);
  originUrl.searchParams.set("offset", offset);

  const originRes = await fetch(originUrl.toString(), {
    headers: { "X-Blog-Internal-Secret": env.INVALIDATION_SECRET ?? "" },
  });

  if (!originRes.ok) {
    return new Response(await originRes.text(), {
      status: originRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await originRes.json();

  await env.BLOG_CACHE.put(cacheKey, JSON.stringify(data), {
    expirationTtl: CACHE_TTL_SECONDS,
  });

  return jsonResponse(data, { "X-Cache": "MISS" });
}

/**
 * GET /blog-cache/post/:slug
 *
 * On miss, calls the UNCACHED origin endpoint /api/blog-internal/post/:slug
 * so there is no recursive loop back through the Worker.
 */
async function handleGetBySlug(request, env, slug) {
  if (!slug) return new Response("Missing slug", { status: 400 });

  const cacheKey = `blog:post:${slug}`;

  const cached = await env.BLOG_CACHE.get(cacheKey, { type: "json" });
  if (cached !== null) {
    return jsonResponse(cached, { "X-Cache": "HIT" });
  }

  // Fetch from origin's INTERNAL (uncached, DB-direct) endpoint
  const originRes = await fetch(
    `${env.ORIGIN_URL}/api/blog-internal/post/${encodeURIComponent(slug)}`,
    {
      headers: { "X-Blog-Internal-Secret": env.INVALIDATION_SECRET ?? "" },
    }
  );

  if (originRes.status === 404) {
    return new Response(
      JSON.stringify({ error: "NOT_FOUND", message: "Blog post not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!originRes.ok) {
    return new Response(await originRes.text(), {
      status: originRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await originRes.json();

  await env.BLOG_CACHE.put(cacheKey, JSON.stringify(data), {
    expirationTtl: CACHE_TTL_SECONDS,
  });

  return jsonResponse(data, { "X-Cache": "MISS" });
}

/**
 * POST /blog-cache/invalidate
 * Body: { "type": "post", "slug": "..." }   – invalidate a single post
 *       { "type": "list" }                  – invalidate all list entries
 *       { "type": "all" }                   – invalidate everything (+ slug if given)
 *
 * Requires header: Authorization: Bearer <INVALIDATION_SECRET>
 */
async function handleInvalidation(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!env.INVALIDATION_SECRET || token !== env.INVALIDATION_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { type, slug } = body;

  if (type === "post" && slug) {
    await env.BLOG_CACHE.delete(`blog:post:${slug}`);
    return jsonResponse({ ok: true, invalidated: [`blog:post:${slug}`] });
  }

  if (type === "list") {
    await deleteListKeys(env);
    return jsonResponse({ ok: true, invalidated: ["blog:list:*"] });
  }

  if (type === "all") {
    const invalidated = ["blog:list:*"];
    await deleteListKeys(env);
    if (slug) {
      await env.BLOG_CACHE.delete(`blog:post:${slug}`);
      invalidated.push(`blog:post:${slug}`);
    }
    return jsonResponse({ ok: true, invalidated });
  }

  return new Response("Invalid invalidation type", { status: 400 });
}

/**
 * Delete all cached list keys by listing them with the blog:list: prefix.
 */
async function deleteListKeys(env) {
  let cursor;
  do {
    const result = await env.BLOG_CACHE.list({
      prefix: "blog:list:",
      cursor,
      limit: 1000,
    });
    await Promise.all(result.keys.map((k) => env.BLOG_CACHE.delete(k.name)));
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
}

function jsonResponse(data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
