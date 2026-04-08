import { ENV } from "./_core/env";
import { logger } from "./logger";

/**
 * Sends a cache invalidation request to the Cloudflare Blog Cache Worker.
 *
 * - type "post"  → delete a single post entry by slug
 * - type "list"  → delete all blog:list:* entries
 * - type "all"   → delete list entries + the specific post entry (if slug given)
 *
 * Failures are logged but never thrown so that admin mutations always succeed
 * even if the Worker is unreachable.
 */
async function invalidateBlogCache(payload: {
  type: "post" | "list" | "all";
  slug?: string;
}): Promise<void> {
  const workerUrl = ENV.cfBlogCacheWorkerUrl;
  const secret = ENV.cfBlogCacheInvalidationSecret;

  if (!workerUrl || !secret) {
    return;
  }

  try {
    const res = await fetch(`${workerUrl}/blog-cache/invalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn(
        `[blog-cache] Invalidation failed (${res.status}): ${await res.text()}`
      );
    }
  } catch (err) {
    logger.warn({ err: err }, "[blog-cache] Invalidation request error:");
  }
}

/**
 * Invalidate all list caches + the cached post for the given slug.
 * Call after create / update / delete of any blog post.
 */
export async function invalidateBlogPostCache(slug?: string): Promise<void> {
  await invalidateBlogCache({ type: "all", slug });
}
