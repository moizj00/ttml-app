/**
 * Auth helper functions:
 *  - URL validation and getOriginUrl
 *  - Role-based redirect path calculation
 *  - sendRoleBasedWelcomeEmail
 *  - Google OAuth upsert (exported at end of file)
 */
import type { Request } from "express";
import * as db from "../db";
import type { User } from "../../drizzle/schema";
import { SUPER_ADMIN_EMAILS } from "./client";
import { invalidateUserCache } from "./user-cache";
import {
  sendWelcomeEmail,
  sendEmployeeWelcomeEmail,
  sendAttorneyWelcomeEmail,
} from "../email";
import { captureServerException } from "../sentry";
import { logger } from "../logger";

// ─── Canonical Origin URL ──────────────────────────────────────────────────
const CANONICAL_DOMAIN = "https://www.talk-to-my-lawyer.com";

const ALLOWED_ORIGIN_HOSTS = new Set([
  "www.talk-to-my-lawyer.com",
  "talk-to-my-lawyer.com",
]);

function isAllowedHost(host: string): boolean {
  return (
    ALLOWED_ORIGIN_HOSTS.has(host) ||
    /^[a-z0-9-]+\.railway\.app$/.test(host) ||
    /^[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.janeway\.replit\.dev$/.test(host) ||
    /^[a-z0-9-]+\.replit\.dev$/.test(host)
  );
}

/**
 * Get the origin URL from the request, with a safe production fallback.
 * Priority: origin header → x-forwarded-host → host header → canonical domain.
 * NEVER falls back to localhost, and validates hosts against an allowlist to
 * prevent x-forwarded-host spoofing attacks that could redirect auth emails.
 */
export function getOriginUrl(req: Request): string {
  if (req.headers.origin && !req.headers.origin.includes("localhost")) {
    try {
      const { hostname } = new URL(req.headers.origin);
      if (isAllowedHost(hostname)) return req.headers.origin;
    } catch {
      // Malformed origin — fall through to canonical
    }
    return CANONICAL_DOMAIN;
  }
  const rawHost = req.headers["x-forwarded-host"] ?? req.headers.host;
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  if (host && !host.includes("localhost") && isAllowedHost(host)) {
    return `https://${host}`;
  }
  return CANONICAL_DOMAIN;
}

// ─── Redirect Helpers ──────────────────────────────────────────────────────
export function getAuthRedirectPath(role: string | null | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "attorney") return "/attorney";
  if (role === "employee") return "/employee";
  return "/dashboard";
}

export function getSafeRelativePath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

function isRoleAllowedOnPath(role: string | null | undefined, path: string): boolean {
  if (role === "admin") return true;
  if (role === "subscriber") {
    return (
      path.startsWith("/dashboard") ||
      path.startsWith("/submit") ||
      path.startsWith("/letters") ||
      path.startsWith("/subscriber")
    );
  }
  if (role === "employee") return path.startsWith("/employee");
  if (role === "attorney") return path.startsWith("/attorney") || path.startsWith("/review");
  return false;
}

export function getPostAuthRedirectPath(role: string | null | undefined, next: string | null): string {
  if (next && isRoleAllowedOnPath(role, next)) return next;
  return getAuthRedirectPath(role);
}

// ─── Welcome Email ─────────────────────────────────────────────────────────
export async function sendRoleBasedWelcomeEmail(user: User, origin: string): Promise<void> {
  if (!user.email) return;
  const userName = user.name || user.email.split("@")[0];

  if (user.role === "employee") {
    const discountCode = await db.getDiscountCodeByEmployeeId(user.id).catch((err) => {
      logger.warn(`[SupabaseAuth] Failed to fetch discount code for employee ${user.id}:`, err);
      return null;
    });
    await sendEmployeeWelcomeEmail({
      to: user.email,
      name: userName,
      discountCode: discountCode?.code,
      dashboardUrl: `${origin}/employee`,
    });
    return;
  }

  if (user.role === "attorney") {
    await sendAttorneyWelcomeEmail({
      to: user.email,
      name: userName,
      dashboardUrl: `${origin}/attorney`,
    });
    return;
  }

  await sendWelcomeEmail({
    to: user.email,
    name: userName,
    dashboardUrl: `${origin}${getAuthRedirectPath(user.role)}`,
  });
}

// ─── Google User Sync ──────────────────────────────────────────────────────
export async function syncGoogleUser({
  req,
  user,
  requestedRole,
}: {
  req: Request;
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, any>;
  };
  requestedRole?: string;
}): Promise<{ dbUser: User | undefined; resolvedRole: string }> {
  const name =
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "User";
  const existingUser = await db.getUserByOpenId(user.id);
  const ownerOpenId = process.env.OWNER_OPEN_ID;
  const isOwner =
    (ownerOpenId && user.id === ownerOpenId) ||
    (user.email ? (SUPER_ADMIN_EMAILS as readonly string[]).includes(user.email.toLowerCase()) : false);
  const existingRole = existingUser?.role;
  // Hard-coded super admin whitelist enforcement (syncGoogleUser)
  // Never downgrade an existing admin; never allow a non-whitelisted user to become admin
  const resolvedRole = isOwner
    ? "admin"
    : existingRole === "admin"
    ? "subscriber" // strip admin from anyone not on the whitelist
    : existingRole || requestedRole || "subscriber";

  await db.upsertUser({
    openId: user.id,
    name,
    email: user.email || null,
    loginMethod: "google",
    lastSignedIn: new Date(),
    emailVerified: true,
    role: resolvedRole as "subscriber" | "employee" | "admin" | "attorney",
  });

  invalidateUserCache(user.id);

  const dbUser = await db.getUserByOpenId(user.id);

  if (dbUser && dbUser.role === "employee" && (!existingUser || existingUser.role !== "employee")) {
    try {
      await db.createDiscountCodeForEmployee(dbUser.id, dbUser.name || name);
    } catch (codeErr) {
      logger.error("[SupabaseAuth] Failed to create discount code after Google auth:", codeErr);
    }
  }

  if (dbUser && !existingUser) {
    try {
      const origin = getOriginUrl(req);
      await db.notifyAdmins({
        category: "users",
        type: "new_signup",
        title: `New user signup: ${name}`,
        body: `${user.email ?? "unknown"} signed up as ${resolvedRole} via Google OAuth.`,
        link: `/admin/users`,
        emailOpts: {
          subject: `New User Signup: ${name}`,
          preheader: `${user.email ?? "unknown"} just signed up via Google`,
          bodyHtml: `<p>Hello,</p><p>A new user has signed up:</p><ul><li><strong>Name:</strong> ${name}</li><li><strong>Email:</strong> ${user.email ?? "unknown"}</li><li><strong>Role:</strong> ${resolvedRole}</li><li><strong>Method:</strong> Google OAuth</li></ul>`,
          ctaText: "View Users",
          ctaUrl: `${origin}/admin/users`,
        },
      });
    } catch (notifyErr) {
      logger.error("[notifyAdmins] new_signup (Google):", notifyErr);
      captureServerException(notifyErr instanceof Error ? notifyErr : new Error(String(notifyErr)), {
        tags: { component: "supabase_auth", error_type: "notify_admins_failed" },
      });
    }
    try {
      const origin = getOriginUrl(req);
      const freshUser = dbUser.id ? await db.getUserById(dbUser.id) : null;
      await sendRoleBasedWelcomeEmail(freshUser || dbUser, origin);
    } catch (emailErr) {
      logger.error("[SupabaseAuth] Failed to send welcome email after Google auth:", emailErr);
    }
  }

  return { dbUser: dbUser || undefined, resolvedRole };
}

export function isSupabaseEmailConfirmed(user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
} | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}
