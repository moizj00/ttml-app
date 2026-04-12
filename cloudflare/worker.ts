/**
 * Cloudflare Worker — static frontend + API proxy.
 *
 * Architecture:
 *   - Static assets (dist/public) served directly from Cloudflare edge
 *   - /api/* requests proxied to Railway backend (Express + pg-boss pipeline)
 *
 * The real Node.js server with tRPC, Supabase, pg-boss, and the AI pipeline
 * still runs on Railway. This Worker exists solely to (1) serve the client
 * from Cloudflare's global edge for low-latency asset delivery, and (2)
 * transparently proxy API calls so the client can use relative /api/trpc
 * paths without CORS or domain-switching complexity.
 *
 * The `run_worker_first: ["/api/*"]` rule in wrangler.jsonc ensures that
 * non-API routes are served directly from the assets bucket without
 * invoking this Worker at all — cheap, fast, and edge-cached globally.
 */

export interface Env {
  ASSETS: Fetcher;
  RAILWAY_BACKEND_URL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Proxy /api/* to the Railway backend
    if (url.pathname.startsWith("/api/")) {
      if (!env.RAILWAY_BACKEND_URL) {
        return new Response("RAILWAY_BACKEND_URL not configured", { status: 500 });
      }

      const backendBase = env.RAILWAY_BACKEND_URL.replace(/\/$/, "");
      const backendUrl = `${backendBase}${url.pathname}${url.search}`;

      // Forward the request as-is. The Worker doesn't read or rewrite the body,
      // so streaming works for large uploads (attachments) and Server-Sent Events.
      const proxyRequest = new Request(backendUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: "manual",
      });

      return fetch(proxyRequest);
    }

    // Everything else → static assets (React SPA).
    // In practice this branch is rarely hit because wrangler.jsonc's
    // run_worker_first list only routes /api/* through this Worker.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
