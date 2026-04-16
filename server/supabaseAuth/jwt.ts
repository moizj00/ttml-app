/**
 * JWT verification and request authentication.
 *
 * Exports:
 *  - authenticateRequest — verify a request's JWT and return the app User
 */
import type { Request } from "express";
import * as db from "../db";
import type { User } from "../../drizzle/schema";
import { getAdminClient, SUPER_ADMIN_EMAILS, SUPABASE_SESSION_COOKIE } from "./client";
import {
  _cacheGet,
  _cacheSet,
  _userCache,
  invalidateUserCache,
  LAST_SIGNED_IN_WRITE_INTERVAL_MS,
} from "./user-cache";
import { isSupabaseEmailConfirmed } from "./helpers";
import { captureServerException } from "../sentry";
import { logger } from "../logger";
import { parseCookieHeader } from "../_core/cookies";

// ─── Cookie / Token Extraction ─────────────────────────────────────────────
// Re-exported alias for backward compatibility with existing callers
export const parseCookies = parseCookieHeader;

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

function extractCookieToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const sbSession = cookies.get(SUPABASE_SESSION_COOKIE);
  if (!sbSession) return null;
  try {
    const parsed = JSON.parse(sbSession);
    return parsed.access_token || null;
  } catch {
    logger.warn("[SupabaseAuth] Stored session value is not JSON, treating as raw token");
    return sbSession;
  }
}

export function extractAccessToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const sbSession = cookies.get(SUPABASE_SESSION_COOKIE);
  if (sbSession) {
    try {
      const parsed = JSON.parse(sbSession);
      return parsed.access_token || null;
    } catch {
      logger.warn("[SupabaseAuth] sb-session cookie is not JSON, treating as raw token");
      return sbSession;
    }
  }
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

// ─── Token Verification ────────────────────────────────────────────────────
async function verifyToken(token: string): Promise<User | null> {
  try {
    const admin = getAdminClient();
    const { data: { user: supabaseUser }, error } = await admin.auth.getUser(token);
    if (error || !supabaseUser) return null;

    const supabaseUid = supabaseUser.id;
    const email = supabaseUser.email || null;
    const name = supabaseUser.user_metadata?.name ||
                 supabaseUser.user_metadata?.full_name ||
                 email?.split("@")[0] ||
                 null;
    const emailVerified = isSupabaseEmailConfirmed(supabaseUser);

    const ownerOpenId = process.env.OWNER_OPEN_ID;
    const isOwner =
      (ownerOpenId && supabaseUid === ownerOpenId) ||
      (email ? (SUPER_ADMIN_EMAILS as readonly string[]).includes(email.toLowerCase()) : false);

    // Cache fast-path: return cached user if still valid
    const cached = _cacheGet(supabaseUid);
    if (cached) {
      const cachedUser = cached.user;
      const illegalAdmin = cachedUser.role === "admin" && !isOwner;
      if (!illegalAdmin) {
        const now = Date.now();
        if (now - cached.lastSignedInWrittenAt > LAST_SIGNED_IN_WRITE_INTERVAL_MS) {
          db.upsertUser({
            openId: supabaseUid,
            email,
            name,
            loginMethod: supabaseUser.app_metadata?.provider || "email",
            lastSignedIn: new Date(),
            emailVerified,
          }).then(() => {
            const entry = _userCache.get(supabaseUid);
            if (entry) entry.lastSignedInWrittenAt = now;
          }).catch((err) => {
            logger.warn({ err: err }, "[SupabaseAuth] Failed to update lastSignedIn (non-blocking):");
            captureServerException(err instanceof Error ? err : new Error(String(err)), {
              tags: { component: "supabase_auth", error_type: "last_signed_in_update_failed" },
            });
          });
        }
        return cachedUser;
      }
      invalidateUserCache(supabaseUid);
    }

    // Full DB sync path: cache miss or illegal admin — query the database
    let appUser = await db.getUserByOpenId(supabaseUid);
    if (!appUser) {
      await db.upsertUser({
        openId: supabaseUid,
        name,
        email,
        loginMethod: supabaseUser.app_metadata?.provider || "email",
        lastSignedIn: new Date(),
        emailVerified,
        ...(isOwner ? { role: "admin" } : {}),
      });
      appUser = await db.getUserByOpenId(supabaseUid);
    } else {
      // Hard-coded super admin whitelist enforcement (verifyToken)
      // non-whitelisted with admin → strip to subscriber
      const roleOverride = isOwner
        ? { role: "admin" as const }
        : appUser.role === "admin"
        ? { role: "subscriber" as const } // strip admin from anyone not on the whitelist
        : {};
      const hasRoleChange = Object.keys(roleOverride).length > 0;
      if (hasRoleChange) {
        await db.upsertUser({
          openId: supabaseUid,
          email,
          name,
          loginMethod: supabaseUser.app_metadata?.provider || "email",
          lastSignedIn: new Date(),
          emailVerified,
          ...roleOverride,
        });
        appUser = await db.getUserByOpenId(supabaseUid);
      } else {
        const now = Date.now();
        const lastWritten = appUser.lastSignedIn
          ? new Date(appUser.lastSignedIn).getTime()
          : 0;
        if (now - lastWritten > LAST_SIGNED_IN_WRITE_INTERVAL_MS) {
          await db.upsertUser({
            openId: supabaseUid,
            email,
            name,
            loginMethod: supabaseUser.app_metadata?.provider || "email",
            lastSignedIn: new Date(),
            emailVerified,
          });
          appUser = await db.getUserByOpenId(supabaseUid);
        }
      }
    }

    if (appUser) {
      const lastSignedInWrittenAt = appUser.lastSignedIn
        ? new Date(appUser.lastSignedIn).getTime()
        : Date.now();
      _cacheSet(supabaseUid, appUser, lastSignedInWrittenAt);
    }
    return appUser || null;
  } catch (err) {
    logger.warn({ err: err }, "[SupabaseAuth] authenticateRequest failed, returning null:");
    captureServerException(err instanceof Error ? err : new Error(String(err)), {
      tags: { component: "supabase_auth", error_type: "authenticate_request_failed" },
    });
    return null;
  }
}

/**
 * Verify a Supabase JWT and return the authenticated user from our app database.
 * Tries the httpOnly session cookie first (authoritative after OAuth), then the
 * Authorization bearer token as fallback.
 */
export async function authenticateRequest(req: Request): Promise<User | null> {
  const cookieToken = extractCookieToken(req);
  if (cookieToken) {
    const user = await verifyToken(cookieToken);
    if (user) return user;
  }

  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const user = await verifyToken(bearerToken);
    if (user) return user;
  }

  if (bearerToken || cookieToken) {
    logger.warn("[SupabaseAuth] JWT verification failed: all auth sources rejected");
  }
  return null;
}
