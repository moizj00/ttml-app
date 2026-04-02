/**
 * Cloudflare Worker: Research KV Cache
 *
 * Provides GET and PUT endpoints for looking up and storing Perplexity
 * research packets keyed by a deterministic hash of letter type + jurisdiction
 * + normalised situation description.
 *
 * KV Binding name: RESEARCH_CACHE
 *
 * Authentication: Bearer token checked against the AUTH_TOKEN secret.
 *
 * Routes:
 *   GET  /research/:key   — retrieve a cached research packet
 *   PUT  /research/:key   — store a research packet (body: { packet, ttl? })
 */

export interface Env {
  RESEARCH_CACHE: KVNamespace;
  AUTH_TOKEN: string;
}

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(key: string): Response {
  return new Response(JSON.stringify({ error: "Not found", key }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function checkAuth(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return token === env.AUTH_TOKEN;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!checkAuth(request, env)) {
      return unauthorized();
    }

    const url = new URL(request.url);
    const pathMatch = url.pathname.match(/^\/research\/(.+)$/);

    if (!pathMatch) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const key = decodeURIComponent(pathMatch[1]);

    if (request.method === "GET") {
      const cached = await env.RESEARCH_CACHE.get(key, { type: "text" });
      if (cached === null) {
        return notFound(key);
      }
      try {
        const packet = JSON.parse(cached);
        return ok(packet);
      } catch {
        return new Response(JSON.stringify({ error: "Corrupted cache entry" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (request.method === "PUT") {
      let body: { packet: unknown; ttl?: number };
      try {
        body = await request.json<{ packet: unknown; ttl?: number }>();
      } catch {
        return badRequest("Invalid JSON body");
      }

      if (!body.packet || typeof body.packet !== "object") {
        return badRequest("Missing or invalid 'packet' field in request body");
      }

      const ttl = typeof body.ttl === "number" && body.ttl > 0
        ? body.ttl
        : DEFAULT_TTL_SECONDS;

      await env.RESEARCH_CACHE.put(key, JSON.stringify(body.packet), {
        expirationTtl: ttl,
      });

      return ok({ stored: true, key, ttl });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "GET, PUT" },
    });
  },
};
