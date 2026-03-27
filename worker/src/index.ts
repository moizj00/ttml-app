/**
 * Cloudflare Worker — Affiliate Referral Link Tracking
 *
 * Handles requests to refer.talktomylawyer.com/<CODE>
 *   1. Validates the discount code exists in KV allowlist
 *   2. Logs the click to KV (timestamp, country, unique visitor hash, referrer)
 *   3. Redirects to the main site with ?coupon=<CODE>
 *
 * KV Analytics endpoint (GET /<CODE>/analytics)
 *   Authenticated by Authorization: Bearer <ANALYTICS_SECRET>
 *   Returns click counts, unique visitors, and daily breakdown.
 *
 * Code Allowlist management endpoint (POST /admin/codes)
 *   Authenticated by Authorization: Bearer <ANALYTICS_SECRET>
 *   Body: { code: string, action: "add" | "remove" }
 *   The main server calls this when a discount code is created/deleted
 *   to keep the Worker allowlist in sync.
 */

export interface Env {
  AFFILIATE_CLICKS: KVNamespace;
  MAIN_SITE_URL: string;
  ANALYTICS_SECRET: string;
}

interface ClickEntry {
  timestamp: string;
  country: string;
  visitorHash: string;
  referrer: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function hashVisitor(ip: string, ua: string): Promise<string> {
  const raw = `${ip}::${ua}`;
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw)
  );
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Basic format guard before hitting KV — prevents obviously malformed keys */
function isValidCodeFormat(code: string): boolean {
  return /^[A-Z0-9_-]{3,20}$/i.test(code);
}

/** Check whether the code is in the KV allowlist (populated by the main server) */
async function isCodeAllowed(kv: KVNamespace, code: string): Promise<boolean> {
  const val = await kv.get(`valid_codes:${code.toUpperCase()}`);
  return val !== null;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// KV key patterns:
//   valid_codes:{CODE}                  → "1"      (allowlist entry, written by main server)
//   click:{CODE}:{date}:{visitorHash}   → "1"      (unique visit marker, TTL 90 days)
//   meta:{CODE}:total                   → number   (total clicks)
//   meta:{CODE}:unique                  → number   (total unique visitors)
//   meta:{CODE}:daily:{date}            → { clicks, uniqueVisitors }
//   clicks:{CODE}:recent                → ClickEntry[] (last 500, TTL 90 days)

async function logClick(
  kv: KVNamespace,
  code: string,
  entry: ClickEntry
): Promise<void> {
  const day = entry.timestamp.slice(0, 10);
  const uniqueKey = `click:${code}:${day}:${entry.visitorHash}`;
  const isNew = !(await kv.get(uniqueKey));

  // Mark unique visit (expires after 90 days)
  if (isNew) {
    await kv.put(uniqueKey, "1", { expirationTtl: 90 * 24 * 60 * 60 });
  }

  // Increment total clicks
  const totalKey = `meta:${code}:total`;
  const totalRaw = await kv.get(totalKey);
  const total = totalRaw ? parseInt(totalRaw, 10) : 0;
  await kv.put(totalKey, String(total + 1));

  // Increment unique visitors
  if (isNew) {
    const uniqueMetaKey = `meta:${code}:unique`;
    const uniqueRaw = await kv.get(uniqueMetaKey);
    const unique = uniqueRaw ? parseInt(uniqueRaw, 10) : 0;
    await kv.put(uniqueMetaKey, String(unique + 1));
  }

  // Update daily bucket
  const dailyKey = `meta:${code}:daily:${day}`;
  const dailyRaw = await kv.get(dailyKey);
  const daily = dailyRaw
    ? (JSON.parse(dailyRaw) as { clicks: number; uniqueVisitors: number })
    : { clicks: 0, uniqueVisitors: 0 };

  daily.clicks += 1;
  if (isNew) daily.uniqueVisitors += 1;
  await kv.put(dailyKey, JSON.stringify(daily), {
    expirationTtl: 365 * 24 * 60 * 60,
  });

  // Store the raw click entry for recent click log (last 500 per code)
  const clickListKey = `clicks:${code}:recent`;
  const listRaw = await kv.get(clickListKey);
  const list: ClickEntry[] = listRaw ? JSON.parse(listRaw) : [];
  list.unshift(entry);
  if (list.length > 500) list.pop();
  await kv.put(clickListKey, JSON.stringify(list), {
    expirationTtl: 90 * 24 * 60 * 60,
  });
}

async function getAnalytics(
  kv: KVNamespace,
  code: string,
  days = 30
): Promise<{
  totalClicks: number;
  uniqueVisitors: number;
  daily: { date: string; clicks: number; uniqueVisitors: number }[];
}> {
  const [totalRaw, uniqueRaw] = await Promise.all([
    kv.get(`meta:${code}:total`),
    kv.get(`meta:${code}:unique`),
  ]);

  const totalClicks = totalRaw ? parseInt(totalRaw, 10) : 0;
  const uniqueVisitors = uniqueRaw ? parseInt(uniqueRaw, 10) : 0;

  const daily: { date: string; clicks: number; uniqueVisitors: number }[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const rawDay = await kv.get(`meta:${code}:daily:${date}`);
    if (rawDay) {
      daily.push({ date, ...(JSON.parse(rawDay) as { clicks: number; uniqueVisitors: number }) });
    }
  }
  daily.reverse();

  return { totalClicks, uniqueVisitors, daily };
}

/** Verify the Authorization: Bearer <secret> header */
function isAuthorized(request: Request, secret: string): boolean {
  const authHeader = request.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length);
  return token === secret;
}

// ─── Request Handler ─────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.replace(/^\//, "").split("/");
    const firstSegment = pathParts[0];

    // ── Admin: manage code allowlist ─────────────────────────────────────────
    // POST /admin/codes  { code: string, action: "add" | "remove" }
    if (firstSegment === "admin" && pathParts[1] === "codes" && request.method === "POST") {
      if (!isAuthorized(request, env.ANALYTICS_SECRET)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      let body: { code?: string; action?: string };
      try {
        body = await request.json() as { code?: string; action?: string };
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const code = body.code?.toUpperCase();
      if (!code || !isValidCodeFormat(code)) {
        return new Response(JSON.stringify({ error: "Invalid code format" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (body.action === "add") {
        await env.AFFILIATE_CLICKS.put(`valid_codes:${code}`, "1");
        return new Response(JSON.stringify({ ok: true, code, action: "added" }), {
          headers: { "Content-Type": "application/json" },
        });
      } else if (body.action === "remove") {
        await env.AFFILIATE_CLICKS.delete(`valid_codes:${code}`);
        return new Response(JSON.stringify({ ok: true, code, action: "removed" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const code = firstSegment?.toUpperCase();

    // Basic format check first (cheap)
    if (!code || !isValidCodeFormat(code)) {
      return Response.redirect(
        (env.MAIN_SITE_URL ?? "https://www.talk-to-my-lawyer.com").replace(/\/$/, ""),
        302
      );
    }

    // ── Analytics endpoint: GET /<CODE>/analytics ────────────────────────────
    if (pathParts[1] === "analytics" && request.method === "GET") {
      // Authorization: Bearer <ANALYTICS_SECRET> — no query-param fallback
      if (!isAuthorized(request, env.ANALYTICS_SECRET)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const rawDays = parseInt(url.searchParams.get("days") ?? "30", 10);
      const days = Number.isNaN(rawDays) ? 30 : Math.max(1, Math.min(rawDays, 365));
      const analytics = await getAnalytics(env.AFFILIATE_CLICKS, code, days);

      return new Response(JSON.stringify(analytics), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    // ── Click redirect: GET /<CODE> ──────────────────────────────────────────
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Validate code exists in KV allowlist before logging or redirecting
    const allowed = await isCodeAllowed(env.AFFILIATE_CLICKS, code);
    if (!allowed) {
      // Redirect to main site without coupon — do not log invalid codes
      const mainSite = (env.MAIN_SITE_URL ?? "https://www.talk-to-my-lawyer.com").replace(/\/$/, "");
      return Response.redirect(mainSite, 302);
    }

    const ip =
      request.headers.get("CF-Connecting-IP") ??
      request.headers.get("X-Forwarded-For") ??
      "unknown";
    const ua = request.headers.get("User-Agent") ?? "";
    const country = request.headers.get("CF-IPCountry") ?? "XX";
    const referrer = request.headers.get("Referer") ?? "";
    const visitorHash = await hashVisitor(ip, ua);

    const clickEntry: ClickEntry = {
      timestamp: new Date().toISOString(),
      country,
      visitorHash,
      referrer,
    };

    // Fire-and-forget KV write using proper ExecutionContext — keeps redirect fast
    ctx.waitUntil(logClick(env.AFFILIATE_CLICKS, code, clickEntry));

    const mainSite = (env.MAIN_SITE_URL ?? "https://www.talk-to-my-lawyer.com").replace(/\/$/, "");
    const destination = `${mainSite}/pricing?coupon=${encodeURIComponent(code)}`;

    return Response.redirect(destination, 302);
  },
} satisfies ExportedHandler<Env>;
