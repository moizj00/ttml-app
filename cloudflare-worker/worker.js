/**
 * Talk to My Lawyer — Cloudflare Worker Edge Rate Limiter
 *
 * Acts as a reverse proxy in front of the Railway origin.
 * Enforces IP-based rate limits at the edge before requests reach Railway.
 * Uses the Workers Rate Limiting API (native, no KV needed for counters).
 *
 * Tiered limits:
 *   - Auth endpoints  (/api/auth/*)    : 20 req / 15 min per IP  (coarse guard above Upstash's 10/15min)
 *   - API endpoints   (/api/trpc/*)    : 200 req / 1 min per IP  (coarse guard above Upstash's 60/min)
 *   - Other API       (/api/*)         : 100 req / 1 min per IP
 *   - Static/pages    (everything else): 500 req / 1 min per IP
 *
 * The Worker:
 *   1. Identifies the client IP from CF-Connecting-IP (set by Cloudflare, cannot be spoofed).
 *   2. Checks the appropriate rate limit bucket.
 *   3. On limit exceeded → returns 429 with Retry-After + X-RateLimit-* headers.
 *   4. On allowed → proxies the request to RAILWAY_ORIGIN, preserving X-Forwarded-For
 *      so the Upstash per-user layer downstream continues to work.
 *   5. Logs blocked requests to a KV counter for visibility.
 *
 * Environment bindings (set in wrangler.toml):
 *   - RAILWAY_ORIGIN   : string     — e.g. "https://ttml-production.up.railway.app"
 *   - RATE_LIMIT_AUTH  : RateLimit  — Workers Rate Limiting API binding
 *   - RATE_LIMIT_TRPC  : RateLimit  — Workers Rate Limiting API binding
 *   - RATE_LIMIT_API   : RateLimit  — Workers Rate Limiting API binding
 *   - RATE_LIMIT_STATIC: RateLimit  — Workers Rate Limiting API binding
 *   - BLOCKED_COUNTER  : KV         — for blocked-request analytics counters
 */

export default {
  async fetch(request, env, ctx) {
    // ── Startup binding validation (logged once per isolate cold-start) ─────────
    // Warn loudly in logs if any rate-limit bindings are absent so ops can catch
    // misconfigured deployments before they silently pass traffic unthrottled.
    if (!env.RAILWAY_ORIGIN) {
      return new Response("Worker misconfigured: RAILWAY_ORIGIN not set", {
        status: 502,
      });
    }
    validateBindings(env);

    const url = new URL(request.url);
    const pathname = url.pathname;

    // ── Determine tier ──────────────────────────────────────────────────────────
    const tier = getTier(pathname);

    // ── Extract client IP ───────────────────────────────────────────────────────
    // CF-Connecting-IP is always set by Cloudflare and cannot be forged by clients.
    const clientIp =
      request.headers.get("CF-Connecting-IP") ??
      request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ??
      "unknown";

    // ── Rate limit check ────────────────────────────────────────────────────────
    const rateLimitBinding = getRateLimitBinding(tier, env);

    if (rateLimitBinding) {
      const { success } = await rateLimitBinding.limit({ key: clientIp });

      if (!success) {
        // Log blocked request for analytics (best-effort, non-blocking)
        ctx.waitUntil(recordBlocked(env, tier));

        const limits = TIER_LIMITS[tier];
        // Retry-After = full window duration so clients back off for the entire
        // rate-limit period rather than retrying mid-window and still being blocked.
        const retryAfter = limits.windowSeconds;

        return new Response(
          JSON.stringify({
            error:
              "Too many requests. Your IP has been temporarily rate-limited. Please slow down.",
            retryAfter,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(retryAfter),
              "X-RateLimit-Limit": String(limits.requests),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Policy": `${limits.requests};w=${limits.windowSeconds}`,
              "X-RateLimit-Reset": String(
                Math.floor(Date.now() / 1000) + retryAfter
              ),
            },
          }
        );
      }
    }

    // ── Proxy request to Railway origin ─────────────────────────────────────────
    const origin = env.RAILWAY_ORIGIN;

    const targetUrl = new URL(request.url);
    const originUrl = new URL(origin);
    targetUrl.hostname = originUrl.hostname;
    targetUrl.protocol = originUrl.protocol;
    targetUrl.port = originUrl.port;

    // Build forwarded request — clone headers, preserve / extend X-Forwarded-For
    const forwardedHeaders = new Headers(request.headers);

    // Preserve original client IP for the Upstash downstream rate limiter.
    // We append our confirmed CF-Connecting-IP so Railway's rightmost-IP logic
    // extracts the real client IP rather than the Worker's egress IP.
    const existingXff = request.headers.get("X-Forwarded-For");
    if (existingXff) {
      forwardedHeaders.set("X-Forwarded-For", `${existingXff}, ${clientIp}`);
    } else {
      forwardedHeaders.set("X-Forwarded-For", clientIp);
    }

    // Tag requests that have passed edge rate limiting so Railway knows
    // the Worker has already done a first-pass check.
    forwardedHeaders.set("X-Edge-Rate-Limited", "1");

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: forwardedHeaders,
      body: request.body,
      redirect: "follow",
    });

    try {
      const response = await fetch(proxyRequest);

      // Clone so we can add rate limit policy header to successful responses
      const modifiedResponse = new Response(response.body, response);
      const limits = TIER_LIMITS[tier];
      modifiedResponse.headers.set(
        "X-RateLimit-Policy",
        `${limits.requests};w=${limits.windowSeconds}`
      );

      return modifiedResponse;
    } catch (err) {
      console.error("[Worker] Upstream fetch error:", err?.message ?? err);
      return new Response(
        JSON.stringify({ error: "Bad gateway: upstream unreachable" }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};

// ── Tier definitions ──────────────────────────────────────────────────────────

/**
 * Tier names map to wrangler.toml rate_limit binding names and limit configs.
 */
const TIER_LIMITS = {
  auth:   { requests: 20,  windowSeconds: 900 }, // 20 req / 15 min
  trpc:   { requests: 200, windowSeconds: 60  }, // 200 req / 1 min
  api:    { requests: 100, windowSeconds: 60  }, // 100 req / 1 min
  static: { requests: 500, windowSeconds: 60  }, // 500 req / 1 min
};

function getTier(pathname) {
  if (pathname.startsWith("/api/auth/")) return "auth";
  if (pathname.startsWith("/api/trpc/")) return "trpc";
  if (pathname.startsWith("/api/"))     return "api";
  return "static";
}

function getRateLimitBinding(tier, env) {
  switch (tier) {
    case "auth":   return env.RATE_LIMIT_AUTH   ?? null;
    case "trpc":   return env.RATE_LIMIT_TRPC   ?? null;
    case "api":    return env.RATE_LIMIT_API    ?? null;
    default:       return env.RATE_LIMIT_STATIC ?? null;
  }
}

/**
 * Validate that all expected bindings are present at Worker startup.
 * Logs a WARNING (does not block traffic) so ops can catch misconfigured
 * deployments before abusive traffic slips through unthrottled.
 */
let _bindingsValidated = false;
function validateBindings(env) {
  if (_bindingsValidated) return;
  _bindingsValidated = true;
  const required = [
    ["RATE_LIMIT_AUTH",   env.RATE_LIMIT_AUTH],
    ["RATE_LIMIT_TRPC",   env.RATE_LIMIT_TRPC],
    ["RATE_LIMIT_API",    env.RATE_LIMIT_API],
    ["RATE_LIMIT_STATIC", env.RATE_LIMIT_STATIC],
    ["BLOCKED_COUNTER",   env.BLOCKED_COUNTER],
  ];
  for (const [name, binding] of required) {
    if (!binding) {
      console.warn(
        `[Worker] WARNING: binding "${name}" is not configured. ` +
        `Requests for that tier will pass through unthrottled. ` +
        `Check wrangler.toml and the Cloudflare dashboard.`
      );
    }
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

/**
 * Increment a KV counter for blocked requests.
 * Key format: "blocked:{tier}:{YYYY-MM-DD}" (daily buckets).
 *
 * NOTE: This uses a read-modify-write pattern which is NOT atomic and can
 * undercount under high concurrency. This is intentional — the counter is
 * intended for rough operational visibility, not precise audit metrics.
 * If precise counts are needed, migrate to Cloudflare Analytics Engine or
 * a log-aggregation pipeline (see README for alternatives).
 *
 * Keys expire after 30 days so the KV namespace does not grow unbounded.
 */
async function recordBlocked(env, tier) {
  if (!env.BLOCKED_COUNTER) return;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `blocked:${tier}:${today}`;

  try {
    const current = await env.BLOCKED_COUNTER.get(key);
    const count = (parseInt(current ?? "0", 10) || 0) + 1;
    await env.BLOCKED_COUNTER.put(key, String(count), {
      expirationTtl: 30 * 24 * 60 * 60,
    });
  } catch (err) {
    // Non-critical — don't let analytics errors affect traffic flow
    console.warn("[Worker] Failed to record blocked request:", err?.message);
  }
}
