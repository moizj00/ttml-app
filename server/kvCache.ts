import { createHash } from "crypto";
import type { ResearchPacket } from "../shared/types";
import { logger } from "./logger";

const KV_CACHE_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

function getWorkerConfig(): { url: string; token: string } | null {
  const url = process.env.KV_WORKER_URL;
  const token = process.env.KV_WORKER_AUTH_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/**
 * Builds a deterministic cache key from letter type, jurisdiction, and
 * a normalised hash of the situation description.
 *
 * Normalisation: lowercase, collapse whitespace, sort words so that minor
 * wording differences (re-ordering) still produce the same key.
 */
export function buildCacheKey(
  letterType: string,
  jurisdiction: { country?: string | null; state?: string | null; city?: string | null },
  situationDescription: string
): string {
  const jCountry = (jurisdiction.country ?? "US").toLowerCase().trim();
  const jState = (jurisdiction.state ?? "").toLowerCase().trim();
  const jCity = (jurisdiction.city ?? "").toLowerCase().trim();

  const normalized = situationDescription
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized
    .split(/\W+/)
    .filter(Boolean)
    .sort();

  const situationHash = createHash("sha256")
    .update(words.join("|"))
    .digest("hex")
    .slice(0, 16);

  const keyParts = [
    "research",
    letterType.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    jCountry || "us",
    jState || "na",
    jCity || "na",
    situationHash,
  ];

  return keyParts.join(":");
}

/**
 * Look up a research packet in Cloudflare KV via the Worker.
 * Returns the cached packet on hit, or null on miss / error / worker not configured.
 */
export async function getCachedResearch(
  cacheKey: string
): Promise<ResearchPacket | null> {
  const config = getWorkerConfig();
  if (!config) {
    logger.debug("[KVCache] Worker not configured — cache lookup skipped");
    return null;
  }

  try {
    const res = await fetch(`${config.url}/research/${encodeURIComponent(cacheKey)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (res.status === 404) {
      logger.debug(`[KVCache] Cache miss for key: ${cacheKey}`);
      return null;
    }

    if (!res.ok) {
      logger.warn(`[KVCache] Unexpected status ${res.status} for key: ${cacheKey}`);
      return null;
    }

    const packet = (await res.json()) as ResearchPacket;
    logger.info(`[KVCache] Cache hit for key: ${cacheKey}`);
    return packet;
  } catch (err) {
    logger.warn("[KVCache] Cache lookup failed (non-fatal):", err);
    return null;
  }
}

/**
 * Store a validated research packet in Cloudflare KV via the Worker.
 * Failures are non-fatal — the pipeline continues regardless.
 */
export async function setCachedResearch(
  cacheKey: string,
  packet: ResearchPacket
): Promise<void> {
  const config = getWorkerConfig();
  if (!config) {
    logger.debug("[KVCache] Worker not configured — cache store skipped");
    return;
  }

  try {
    const res = await fetch(`${config.url}/research/${encodeURIComponent(cacheKey)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ packet, ttl: KV_CACHE_TTL_SECONDS }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      logger.warn(`[KVCache] Failed to store cache entry (status ${res.status}) for key: ${cacheKey}`);
    } else {
      logger.info(`[KVCache] Stored research packet in cache for key: ${cacheKey} (TTL: ${KV_CACHE_TTL_SECONDS}s)`);
    }
  } catch (err) {
    logger.warn("[KVCache] Cache store failed (non-fatal):", err);
  }
}
