/**
 * Server-side Cloudflare KV blog cache utilities.
 *
 * tRPC `blog.list` and `blog.getBySlug` call these helpers, which forward the
 * request to the Cloudflare Blog Cache Worker. The Worker checks KV:
 *   - HIT  → returns cached JSON directly
 *   - MISS → Worker calls the *internal* uncached origin REST endpoints
 *            (/api/blog-internal/list, /api/blog-internal/post/:slug),
 *            stores the result in KV, and returns it
 *
 * This prevents any recursive loop: the Worker never calls tRPC endpoints.
 *
 * When CF_BLOG_CACHE_WORKER_URL is absent, calls fall through to the DB.
 */

import { ENV } from "./_core/env";
import {
  getPublishedBlogPosts,
  getBlogPostBySlug,
} from "./db";
import { logger } from "./logger";

type BlogListOptions = { category?: string; limit?: number; offset?: number };
type BlogListResult = Awaited<ReturnType<typeof getPublishedBlogPosts>>;
type BlogPost = NonNullable<Awaited<ReturnType<typeof getBlogPostBySlug>>>;

const WORKER_TIMEOUT_MS = 3000;

/**
 * Fetch blog post list — served from KV via Worker, or DB on fallback.
 */
export async function getCachedBlogPosts(
  options: BlogListOptions = {}
): Promise<BlogListResult> {
  const baseUrl = ENV.cfBlogCacheWorkerUrl;
  if (!baseUrl) {
    return getPublishedBlogPosts(options);
  }

  const { category = "", limit = 12, offset = 0 } = options;

  try {
    const url = new URL(`${baseUrl}/blog-cache/list`);
    if (category) url.searchParams.set("category", category);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
    });

    if (res.ok) {
      return (await res.json()) as BlogListResult;
    }

    logger.warn(
      `[blog-cache] Worker list request failed (${res.status}), falling back to DB`
    );
  } catch (err) {
    logger.warn({ err: err }, "[blog-cache] Worker list request error, falling back to DB:");
  }

  return getPublishedBlogPosts(options);
}

/**
 * Fetch a single published post — served from KV via Worker, or DB on fallback.
 */
export async function getCachedBlogPost(
  slug: string
): Promise<BlogPost | null> {
  const baseUrl = ENV.cfBlogCacheWorkerUrl;
  if (!baseUrl) {
    return getBlogPostBySlug(slug);
  }

  try {
    const url = new URL(
      `${baseUrl}/blog-cache/post/${encodeURIComponent(slug)}`
    );
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
    });

    if (res.status === 404) return null;

    if (res.ok) {
      return (await res.json()) as BlogPost;
    }

    logger.warn(
      `[blog-cache] Worker getBySlug request failed (${res.status}), falling back to DB`
    );
  } catch (err) {
    logger.warn({ err: err }, "[blog-cache] Worker getBySlug request error, falling back to DB:");
  }

  return getBlogPostBySlug(slug);
}
