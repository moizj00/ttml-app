/**
 * Internal (uncached) blog REST endpoints called exclusively by the
 * Cloudflare Blog Cache Worker on KV cache miss.
 *
 * These routes go directly to the database — they MUST NOT call the Worker
 * or any other cache layer to avoid recursive request loops.
 *
 * Routes:
 *   GET /api/blog-internal/list?category=&limit=12&offset=0
 *   GET /api/blog-internal/post/:slug
 *
 * Security: When CF_BLOG_CACHE_INVALIDATION_SECRET is set, callers must
 * supply it in the X-Blog-Internal-Secret request header. This prevents
 * arbitrary public callers from bypassing the KV cache and hitting the DB
 * directly. The Cloudflare Worker is configured to send this header.
 *
 * When the secret env var is absent (dev / Worker not deployed), these
 * endpoints are open — they only ever return published posts (no PII).
 */

import type { Express, Request, Response, NextFunction } from "express";
import { ENV } from "./_core/env";
import { getPublishedBlogPosts, getBlogPostBySlug } from "./db";

function blogInternalAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = ENV.cfBlogCacheInvalidationSecret;
  if (!secret) {
    next();
    return;
  }
  const provided = req.headers["x-blog-internal-secret"];
  if (provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function registerBlogInternalRoutes(app: Express): void {
  /**
   * GET /api/blog-internal/list
   * Query params: category (optional), limit (default 12), offset (default 0)
   */
  app.get("/api/blog-internal/list", blogInternalAuth, async (req, res) => {
    try {
      const category =
        typeof req.query.category === "string" && req.query.category
          ? req.query.category
          : undefined;
      const limit = Math.min(
        50,
        Math.max(1, parseInt(String(req.query.limit ?? "12"), 10) || 12)
      );
      const offset = Math.max(
        0,
        parseInt(String(req.query.offset ?? "0"), 10) || 0
      );

      const data = await getPublishedBlogPosts({ category, limit, offset });
      res.json(data);
    } catch (err) {
      console.error("[blog-internal] /list error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /api/blog-internal/post/:slug
   */
  app.get("/api/blog-internal/post/:slug", blogInternalAuth, async (req, res) => {
    try {
      const { slug } = req.params;
      if (!slug) {
        res.status(400).json({ error: "Missing slug" });
        return;
      }

      const post = await getBlogPostBySlug(slug);
      if (!post) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.json(post);
    } catch (err) {
      console.error("[blog-internal] /post/:slug error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
