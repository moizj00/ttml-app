/**
 * Short-lived in-memory user cache.
 *
 * Purpose: eliminate the per-request DB round-trip in verifyToken() for the
 * common case where the same user makes multiple rapid requests (e.g. a page
 * load that triggers several tRPC calls). The cache is keyed on the Supabase
 * UID (openId) and has a 30-second TTL.
 *
 * Security invariants:
 *  1. TTL = 30 s — role changes take effect within 30 s.
 *  2. After any upsertUser() write the entry is immediately invalidated.
 *  3. updateRole mutation explicitly calls invalidateUserCache() so the
 *     promoted user's next request gets a fresh DB read with the new role.
 *  4. Super-admin whitelist stripping still runs on every cache miss.
 *  5. lastSignedIn DB writes are throttled to once per 5 minutes per user.
 */
import type { User } from "../../drizzle/schema";

export const USER_CACHE_TTL_MS = 30_000;
export const LAST_SIGNED_IN_WRITE_INTERVAL_MS = 5 * 60_000;

export interface UserCacheEntry {
  user: User;
  expiresAt: number;
  lastSignedInWrittenAt: number;
}

export const _userCache = new Map<string, UserCacheEntry>();

export function _cacheGet(uid: string): UserCacheEntry | null {
  const entry = _userCache.get(uid);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _userCache.delete(uid);
    return null;
  }
  return entry;
}

export function _cacheSet(uid: string, user: User, lastSignedInWrittenAt: number): void {
  _userCache.set(uid, {
    user,
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
    lastSignedInWrittenAt,
  });
}

/**
 * Invalidate a single user's cache entry by their Supabase UID (openId).
 * Call this after any role change so the next request gets a fresh DB read.
 */
export function invalidateUserCache(openId: string): void {
  _userCache.delete(openId);
}

/**
 * Invalidate all cached user entries.
 * Useful for testing or an emergency cache flush.
 */
export function invalidateAllUserCache(): void {
  _userCache.clear();
}
