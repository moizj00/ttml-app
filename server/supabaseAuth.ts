/**
 * Supabase Auth Module
 * 
 * Handles server-side authentication using Supabase Auth:
 * - JWT verification from Authorization header or cookie
 * - User creation/sync between Supabase auth.users and app users table
 * - Admin operations using service_role key
 */
import { createClient, type EmailOtpType, type SupabaseClient } from "@supabase/supabase-js";
import type { Request, Response, Express } from "express";
import * as crypto from "crypto";
import * as db from "./db";
import type { User } from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { sendVerificationEmail, sendWelcomeEmail, sendEmployeeWelcomeEmail, sendAttorneyWelcomeEmail } from "./email";

// ─── Canonical Origin URL ──────────────────────────────────────────────────
const CANONICAL_DOMAIN = "https://www.talk-to-my-lawyer.com";

// Explicit production hostnames allowed in email redirect links and auth flows.
// Railway *.railway.app subdomains are also permitted for preview deployments.
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
    return `https://${host}`; // Always HTTPS; never trust x-forwarded-proto alone
  }
  return CANONICAL_DOMAIN;
}

// ─── Super Admin Whitelist ─────────────────────────────────────────────────
// Hard-coded super admin whitelist — no UI, API, or env-var can override this.
// Changing admin access requires a code deploy + review, which is by design.
const SUPER_ADMIN_EMAILS = ["ravivo@homes.land", "moizj00@gmail.com"] as const;


// ─── Supabase Clients ──────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

// Admin client (service_role) — bypasses RLS, used for JWT verification and admin ops
let adminClient: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("[SupabaseAuth] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}

// ─── Session Cookie ────────────────────────────────────────────────────────
const SUPABASE_SESSION_COOKIE = "sb_session";

// ─── User Cache ────────────────────────────────────────────────────────────
/**
 * Short-lived in-memory cache for verified users.
 *
 * Purpose: eliminate the per-request DB round-trip in verifyToken() for the
 * common case where the same user makes multiple rapid requests (e.g. a page
 * load that triggers several tRPC calls). The cache is keyed on the Supabase
 * UID (openId) and has a 30-second TTL.
 *
 * Security invariants preserved:
 *  1. TTL = 30 s — role changes (attorney promotion) take effect within 30 s.
 *  2. After any upsertUser() write the entry is immediately invalidated so the
 *     next read always reflects the freshly written DB row.
 *  3. The updateRole mutation explicitly calls invalidateUserCache() so the
 *     promoted user's next request gets a fresh DB read with the new role.
 *  4. Super-admin whitelist stripping still runs on every cache miss, ensuring
 *     the self-healing property is preserved.
 *  5. lastSignedIn DB writes are throttled to once per 5 minutes per user to
 *     eliminate the write-on-every-request pattern.
 */
const USER_CACHE_TTL_MS = 30_000;               // 30 seconds
const LAST_SIGNED_IN_WRITE_INTERVAL_MS = 5 * 60_000; // 5 minutes

interface UserCacheEntry {
  user: User;
  expiresAt: number;
  lastSignedInWrittenAt: number;
}

const _userCache = new Map<string, UserCacheEntry>();

function _cacheGet(uid: string): UserCacheEntry | null {
  const entry = _userCache.get(uid);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _userCache.delete(uid);
    return null;
  }
  return entry;
}

function _cacheSet(uid: string, user: User, lastSignedInWrittenAt: number): void {
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

function isSupabaseEmailConfirmed(user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
} | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

function getAuthRedirectPath(role: string | null | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "attorney") return "/attorney";
  if (role === "employee") return "/employee";
  return "/dashboard";
}

function getSafeRelativePath(path: unknown): string | null {
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

function getPostAuthRedirectPath(role: string | null | undefined, next: string | null): string {
  if (next && isRoleAllowedOnPath(role, next)) return next;
  return getAuthRedirectPath(role);
}

async function sendRoleBasedWelcomeEmail(user: User, origin: string): Promise<void> {
  if (!user.email) return;
  const userName = user.name || user.email.split("@")[0];

  if (user.role === "employee") {
    const discountCode = await db.getDiscountCodeByEmployeeId(user.id).catch(() => null);
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

async function syncGoogleUser({
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
  // Hard-coded super admin whitelist enforcement (verifyToken)
  const isOwner =
    (ownerOpenId && user.id === ownerOpenId) ||
    (user.email ? (SUPER_ADMIN_EMAILS as readonly string[]).includes(user.email.toLowerCase()) : false);
  // Never downgrade an existing admin; never allow a non-whitelisted user to become admin
  const existingRole = existingUser?.role;
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

  // Invalidate cache after upsert so the fresh DB row is returned, not a stale entry
  invalidateUserCache(user.id);

  const dbUser = await db.getUserByOpenId(user.id);

  if (dbUser && dbUser.role === "employee" && (!existingUser || existingUser.role !== "employee")) {
    try {
      await db.createDiscountCodeForEmployee(dbUser.id, dbUser.name || name);
    } catch (codeErr) {
      console.error("[SupabaseAuth] Failed to create discount code after Google auth:", codeErr);
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
    } catch (err) {
      console.error("[notifyAdmins] new_signup_google:", err);
    }
    try {
      const origin = getOriginUrl(req);
      // Re-fetch dbUser to ensure it has the discount code if it was just created
      const freshUser = await db.getUserById(dbUser.id);
      await sendRoleBasedWelcomeEmail(freshUser || dbUser, origin);
    } catch (emailErr) {
      console.error("[SupabaseAuth] Failed to send welcome email after Google auth:", emailErr);
    }
  }

  return { dbUser, resolvedRole };
}

// ─── JWT Verification ──────────────────────────────────────────────────────
/**
 * Extract the Supabase access token from the request.
 * Checks: sb_session cookie → Authorization header.
 *
 * Cookie must win because OAuth callback writes a fresh httpOnly session cookie,
 * while the browser may still have an older access token cached in localStorage.
 * If the header wins, stale tokens can override a valid new cookie and break
 * Google sign-in with repeated "token is expired" verification failures.
 */
function extractAccessToken(req: Request): string | null {
  // 1. Supabase session cookie
  const cookies = parseCookies(req.headers.cookie);
  const sbSession = cookies.get(SUPABASE_SESSION_COOKIE);
  if (sbSession) {
    try {
      const parsed = JSON.parse(sbSession);
      return parsed.access_token || null;
    } catch {
      return sbSession; // Might be the raw token
    }
  }

  // 2. Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
}

function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  if (!cookieHeader) return new Map();
  const map = new Map<string, string>();
  cookieHeader.split(";").forEach(pair => {
    const [key, ...rest] = pair.split("=");
    if (key) {
      map.set(key.trim(), decodeURIComponent(rest.join("=").trim()));
    }
  });
  return map;
}

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
    return sbSession; // Might be the raw token
  }
}

/**
 * Verify a single Supabase JWT token and sync the user into the app database.
 * Returns the app User on success, null if the token is invalid/expired.
 *
 * Caching strategy:
 *  - Cache hit (< 30 s old): return cached user immediately, skip all DB reads.
 *  - Cache miss / expired: run full DB sync, populate cache, return fresh user.
 *  - After any upsertUser() write: invalidate cache entry before re-reading DB.
 *  - lastSignedIn writes: throttled to once per 5 minutes to avoid write-per-request.
 */
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
    // Hard-coded super admin whitelist enforcement (syncUserFromSupabaseJwt)
    const isOwner =
      (ownerOpenId && supabaseUid === ownerOpenId) ||
      (email ? (SUPER_ADMIN_EMAILS as readonly string[]).includes(email.toLowerCase()) : false);

    // ── Cache fast-path ────────────────────────────────────────────────────
    // On a cache hit we skip all DB reads. We still need to check the super
    // admin whitelist invariant: if the cached user has admin role but is NOT
    // on the whitelist (should never happen, but defensive), fall through to
    // the full DB sync path to strip the role.
    const cached = _cacheGet(supabaseUid);
    if (cached) {
      const cachedUser = cached.user;
      const illegalAdmin = cachedUser.role === "admin" && !isOwner;
      if (!illegalAdmin) {
        // Throttle lastSignedIn writes: only update DB if last write was > 5 min ago
        const now = Date.now();
        if (now - cached.lastSignedInWrittenAt > LAST_SIGNED_IN_WRITE_INTERVAL_MS) {
          // Fire-and-forget — do NOT await; this must not block the response
          db.upsertUser({
            openId: supabaseUid,
            email,
            name,
            loginMethod: supabaseUser.app_metadata?.provider || "email",
            lastSignedIn: new Date(),
            emailVerified,
          }).then(() => {
            // Update the cache entry's lastSignedInWrittenAt timestamp in-place
            const entry = _userCache.get(supabaseUid);
            if (entry) entry.lastSignedInWrittenAt = now;
          }).catch(() => { /* non-blocking, ignore */ });
        }
        return cachedUser;
      }
      // Illegal admin detected in cache — fall through to full sync to strip it
      invalidateUserCache(supabaseUid);
    }

    // ── Full DB sync path (cache miss, expired, or illegal admin) ──────────
    let appUser = await db.getUserByOpenId(supabaseUid);
    if (!appUser) {
      // New user — create the record
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
      // Existing user — enforce whitelist and throttle lastSignedIn write
      const roleOverride = isOwner
        ? { role: "admin" as const }
        : appUser.role === "admin"
        ? { role: "subscriber" as const } // strip admin from non-whitelisted user
        : {};
      const hasRoleChange = Object.keys(roleOverride).length > 0;
      if (hasRoleChange) {
        // Role correction always writes immediately
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
        // No role change — only write lastSignedIn if stale
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
      // Populate cache — record when lastSignedIn was last written
      const lastSignedInWrittenAt = appUser.lastSignedIn
        ? new Date(appUser.lastSignedIn).getTime()
        : Date.now();
      _cacheSet(supabaseUid, appUser, lastSignedInWrittenAt);
    }
    return appUser || null;
  } catch {
    return null;
  }
}

/**
 * Verify a Supabase JWT and return the authenticated user from our app database.
 * Tries the httpOnly session cookie first (authoritative after OAuth), then the
 * Authorization bearer token as fallback. Cookie-first prevents stale localStorage
 * tokens from overriding a fresh OAuth session cookie.
 */
export async function authenticateRequest(req: Request): Promise<User | null> {
  // 1. Try the httpOnly session cookie first (set after OAuth or refresh — authoritative)
  const cookieToken = extractCookieToken(req);
  if (cookieToken) {
    const user = await verifyToken(cookieToken);
    if (user) return user;
    // Cookie token failed (e.g. expired) — fall through to bearer
  }

  // 2. Try the Authorization: Bearer header (e.g. from localStorage on the client)
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    const user = await verifyToken(bearerToken);
    if (user) return user;
  }

  // All sources failed — only log if at least one token was present (not anonymous requests)
  if (bearerToken || cookieToken) {
    console.warn("[SupabaseAuth] JWT verification failed: all auth sources rejected");
  }
  return null;
}

// ─── Express Auth Routes ───────────────────────────────────────────────────
export function registerSupabaseAuthRoutes(app: Express) {
  
  // POST /api/auth/signup — Create a new user via Supabase Auth
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { email, password, name, role: requestedRole, wantsAffiliate } = req.body;
      // Attorney role is NOT self-assignable — it can only be granted by a super admin via the Users page
      const ALLOWED_SIGNUP_ROLES = ["subscriber", "employee"];
      if (requestedRole && !ALLOWED_SIGNUP_ROLES.includes(requestedRole)) {
        res.status(400).json({ error: "Invalid role. Only 'subscriber' or 'employee' roles are allowed for signup." });
        return;
      }
      const signupRole = ALLOWED_SIGNUP_ROLES.includes(requestedRole) ? requestedRole : "subscriber";

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }

      // Use admin client to create user without triggering Supabase's own confirmation email.
      // We send exactly one verification email via Resend below.
      const origin = getOriginUrl(req);
      const { data, error } = await getAdminClient().auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { name: name || email.split("@")[0] },
      });

      if (error) {
        console.error("[SupabaseAuth] Signup error:", error.message);
        if (error.message.includes("already been registered") || error.message.includes("already exists") || error.message.includes("already registered")) {
          res.status(409).json({ error: "An account with this email already exists. Please sign in instead." });
          return;
        }
        res.status(400).json({ error: error.message });
        return;
      }

      if (!data.user) {
        res.status(500).json({ error: "Failed to create user" });
        return;
      }

      // Create user in our app database
      const ownerOpenId = process.env.OWNER_OPEN_ID;
      // Hard-coded super admin whitelist enforcement (signup)
      const isOwner =
        (ownerOpenId && data.user.id === ownerOpenId) ||
        (SUPER_ADMIN_EMAILS as readonly string[]).includes(email.toLowerCase());

      const userName = name || email.split("@")[0];
      await db.upsertUser({
        openId: data.user.id,
        name: userName,
        email,
        loginMethod: "email",
        lastSignedIn: new Date(),
        ...(isOwner ? { role: "admin", emailVerified: true } : { role: signupRole as "subscriber" | "employee" }),
      });

      // Invalidate cache after signup upsert so the fresh DB row is returned
      invalidateUserCache(data.user.id);

      // Get the app user record to get the integer id
      const appUser = await db.getUserByOpenId(data.user.id);

      // Send the single verification email via Resend.
      // Supabase's own confirmation email is suppressed (admin createUser with email_confirm: false).
      if (appUser && !isOwner) {
        try {
          const customVerificationToken = crypto.randomBytes(48).toString("hex");
          await db.deleteUserVerificationTokens(appUser.id);
          await db.createEmailVerificationToken(appUser.id, email, customVerificationToken);
          const verifyUrl = `${origin}/verify-email?token=${customVerificationToken}`;
          await sendVerificationEmail({
            to: email,
            name: userName,
            verifyUrl,
          });
          console.log(`[SupabaseAuth] Verification email sent via Resend to ${email}`);
        } catch (tokenErr) {
          console.error("[SupabaseAuth] Failed to send verification email:", tokenErr);
        }
      }

      // Auto-generate discount code for employees who opted into the affiliate program
      if (appUser && signupRole === "employee" && wantsAffiliate === true) {
        try {
          await db.createDiscountCodeForEmployee(appUser.id, userName);
          console.log(`[SupabaseAuth] Discount code generated for new affiliate employee #${appUser.id}`);
        } catch (codeErr) {
          console.error("[SupabaseAuth] Failed to create discount code for employee:", codeErr);
          // Non-fatal — employee can still sign up
        }
      }

      try {
        await db.notifyAdmins({
          category: "users",
          type: "new_signup",
          title: `New user signup: ${userName}`,
          body: `${email} signed up as ${signupRole} via email.`,
          link: `/admin/users`,
          emailOpts: {
            subject: `New User Signup: ${userName}`,
            preheader: `${email} just signed up as ${signupRole}`,
            bodyHtml: `<p>Hello,</p><p>A new user has signed up:</p><ul><li><strong>Name:</strong> ${userName}</li><li><strong>Email:</strong> ${email}</li><li><strong>Role:</strong> ${signupRole}</li><li><strong>Method:</strong> Email/Password</li></ul>`,
            ctaText: "View Users",
            ctaUrl: `${origin}/admin/users`,
          },
        });
      } catch (err) {
        console.error("[notifyAdmins] new_signup:", err);
      }

      // Return success — user must verify email before accessing the app
      res.status(201).json({
        success: true,
        requiresVerification: !isOwner,
        message: isOwner
          ? "Account created successfully."
          : "Account created! Please check your email to verify your address before signing in.",
        user: {
          id: data.user.id,
          email: data.user.email,
          name: userName,
        },
      });
    } catch (err) {
      console.error("[SupabaseAuth] Signup error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/login — Sign in with email/password
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      // Use anon client for sign-in
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await anonClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("[SupabaseAuth] Login error:", error.message);
        if (error.message.includes("Invalid login credentials")) {
          res.status(401).json({ error: "Invalid email or password" });
          return;
        }
        // Supabase returns "Email not confirmed" when email_confirm is required
        if (error.message.includes("Email not confirmed") || error.message.includes("email_not_confirmed")) {
          res.status(401).json({ error: "Email not verified", code: "EMAIL_NOT_VERIFIED" });
          return;
        }
        res.status(401).json({ error: error.message });
        return;
      }
      if (!data.session || !data.user) {
        res.status(401).json({ error: "Authentication failed" });
        return;
      }

      // Sync user to app database
      const name = data.user.user_metadata?.name || 
                   data.user.user_metadata?.full_name || 
                   email.split("@")[0];
      const supabaseEmailVerified = isSupabaseEmailConfirmed(data.user);
      const appUserCheck = await db.getUserByEmail(email).catch(() => null);

      if (appUserCheck && appUserCheck.emailVerified === false && !supabaseEmailVerified) {
        try {
          const admin = getAdminClient();
          await admin.auth.admin.signOut(data.user.id);
        } catch {}
        res.status(401).json({ error: "Email not verified", code: "EMAIL_NOT_VERIFIED" });
        return;
      }
      
      await db.upsertUser({
        openId: data.user.id,
        name,
        email,
        loginMethod: data.user.app_metadata?.provider || "email",
        lastSignedIn: new Date(),
        emailVerified: supabaseEmailVerified || appUserCheck?.emailVerified || false,
      });

      // Invalidate cache after upsert so the fresh DB row is returned
      invalidateUserCache(data.user.id);

      // Fetch the app user to get their role
      const appUser = await db.getUserByOpenId(data.user.id);
      const userRole = appUser?.role || "subscriber";

      // Set session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(SUPABASE_SESSION_COOKIE, JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }), {
        ...cookieOptions,
        maxAge: data.session.expires_in * 1000,
      });

      res.json({
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
          name,
          role: userRole,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
        },
      });
    } catch (err) {
      console.error("[SupabaseAuth] Login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/logout — Sign out
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const token = extractAccessToken(req);
      if (token) {
        const admin = getAdminClient();
        // Get user to sign them out
        const { data: { user } } = await admin.auth.getUser(token);
        if (user) {
          await admin.auth.admin.signOut(user.id);
        }
      }

      // Clear session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.clearCookie(SUPABASE_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });

      res.json({ success: true });
    } catch (err) {
      console.error("[SupabaseAuth] Logout error:", err);
      // Still clear cookies even if Supabase call fails
      const cookieOptions = getSessionCookieOptions(req);
      res.clearCookie(SUPABASE_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      res.json({ success: true });
    }
  });

  // POST /api/auth/refresh — Refresh the access token
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const sbSession = cookies.get(SUPABASE_SESSION_COOKIE);
      
      if (!sbSession) {
        res.status(401).json({ error: "No session found" });
        return;
      }

      let refreshToken: string;
      try {
        const parsed = JSON.parse(sbSession);
        refreshToken = parsed.refresh_token;
      } catch {
        res.status(401).json({ error: "Invalid session" });
        return;
      }

      if (!refreshToken) {
        res.status(401).json({ error: "No refresh token" });
        return;
      }

      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await anonClient.auth.refreshSession({ refresh_token: refreshToken });

      if (error || !data.session) {
        res.status(401).json({ error: "Session expired. Please sign in again." });
        return;
      }

      // Update cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(SUPABASE_SESSION_COOKIE, JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }), {
        ...cookieOptions,
        maxAge: data.session.expires_in * 1000,
      });

      res.json({
        success: true,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
        },
      });
    } catch (err) {
      console.error("[SupabaseAuth] Refresh error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/forgot-password — Send password reset email
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }

      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { error } = await anonClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${getOriginUrl(req)}/reset-password`,
      });

      if (error) {
        console.error("[SupabaseAuth] Password reset error:", error.message);
      }

      // Always return success to prevent email enumeration
      res.json({ success: true, message: "If an account exists with this email, a password reset link has been sent." });
    } catch (err) {
      console.error("[SupabaseAuth] Forgot password error:", err);
      res.json({ success: true, message: "If an account exists with this email, a password reset link has been sent." });
    }
  });

  // POST /api/auth/reset-password — Reset password with token
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { access_token, refresh_token, password } = req.body;
      
      if (!password || password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }

      if (!access_token) {
        res.status(400).json({ error: "Invalid or expired reset link" });
        return;
      }

      // Create a client with the user's session from the reset link
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Set the session from the reset link tokens
      await userClient.auth.setSession({
        access_token,
        refresh_token: refresh_token || "",
      });

      const { error } = await userClient.auth.updateUser({ password });

      if (error) {
        console.error("[SupabaseAuth] Password update error:", error.message);
        res.status(400).json({ error: "Failed to reset password. The link may have expired." });
        return;
      }

      res.json({ success: true, message: "Password has been reset successfully." });
    } catch (err) {
      console.error("[SupabaseAuth] Reset password error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/verify-email — Complete email verification from a Supabase redirect
  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { code, access_token, token_hash, type } = req.body as {
        code?: string;
        access_token?: string;
        token_hash?: string;
        type?: string;
      };

      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      let supabaseUser:
        | {
            id: string;
            email?: string | null;
            email_confirmed_at?: string | null;
            confirmed_at?: string | null;
            user_metadata?: Record<string, any>;
            app_metadata?: Record<string, any>;
          }
        | null
        = null;
      let sessionTokens: { access_token: string; refresh_token: string; expires_in: number } | null = null;

      if (code) {
        const { data, error } = await anonClient.auth.exchangeCodeForSession(code);
        if (error || !data.user) {
          console.error("[SupabaseAuth] Code exchange failed:", error?.message);
          res.status(400).json({ error: "Verification failed. The link may have expired." });
          return;
        }
        supabaseUser = data.user;
        if (data.session) {
          sessionTokens = {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
          };
        }
      } else if (access_token) {
        const admin = getAdminClient();
        const { data, error } = await admin.auth.getUser(access_token);
        if (error || !data.user) {
          console.error("[SupabaseAuth] Access token verification failed:", error?.message);
          res.status(400).json({ error: "Verification failed. The link may have expired." });
          return;
        }
        supabaseUser = data.user;
      } else if (token_hash && type) {
        const { data, error } = await anonClient.auth.verifyOtp({
          token_hash,
          type: type as EmailOtpType,
        });
        if (error || !data.user) {
          console.error("[SupabaseAuth] OTP verification failed:", error?.message);
          res.status(400).json({ error: "Verification failed. The link may have expired." });
          return;
        }
        supabaseUser = data.user;
        if (data.session) {
          sessionTokens = {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
          };
        }
      } else {
        res.status(400).json({ error: "Verification data is required" });
        return;
      }

      const origin = getOriginUrl(req);
      const existingUser = await db.getUserByOpenId(supabaseUser.id);
      const alreadyVerified = existingUser?.emailVerified === true;
      // Uses module-level SUPER_ADMIN_EMAILS constant (line 61) — single source of truth
      const ownerOpenId = process.env.OWNER_OPEN_ID;
      const email = supabaseUser.email || existingUser?.email || null;
      // Hard-coded super admin whitelist enforcement (OAuth callback)
      const isOwner =
        (ownerOpenId && supabaseUser.id === ownerOpenId) ||
        (email ? (SUPER_ADMIN_EMAILS as readonly string[]).includes(email.toLowerCase()) : false);
      const name =
        supabaseUser.user_metadata?.name ||
        supabaseUser.user_metadata?.full_name ||
        existingUser?.name ||
        email?.split("@")[0] ||
        null;
      // Enforce whitelist: whitelisted → admin; non-whitelisted with admin → strip to subscriber
      const VALID_ROLES = ["subscriber", "employee", "admin", "attorney"] as const;
      type ValidRole = typeof VALID_ROLES[number];
      const roleOverride = isOwner
        ? { role: "admin" as ValidRole }
        : existingUser?.role === "admin"
        ? { role: "subscriber" as ValidRole }
        : existingUser?.role && VALID_ROLES.includes(existingUser.role as ValidRole)
        ? { role: existingUser.role as ValidRole }
        : {};
      await db.upsertUser({
        openId: supabaseUser.id,
        email,
        name,
        loginMethod: (supabaseUser.app_metadata?.provider as string | undefined) || existingUser?.loginMethod || "email",
        lastSignedIn: new Date(),
        emailVerified: true,
        ...roleOverride,
      });

      // Invalidate cache after verification upsert so subsequent reads get the fresh row
      invalidateUserCache(supabaseUser.id);

      if (!alreadyVerified) {
        db.getUserByOpenId(supabaseUser.id).then(async (user) => {
          if (!user) return;
          try {
            await sendRoleBasedWelcomeEmail(user, origin);
          } catch (emailErr) {
            console.error("[SupabaseAuth] Failed to send welcome email:", emailErr);
          }
        }).catch(() => {});
      }

      const freshUser = await db.getUserByOpenId(supabaseUser.id);
      const userRole = freshUser?.role || "subscriber";

      if (sessionTokens) {
        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(SUPABASE_SESSION_COOKIE, JSON.stringify({
          access_token: sessionTokens.access_token,
          refresh_token: sessionTokens.refresh_token,
        }), {
          ...cookieOptions,
          maxAge: sessionTokens.expires_in * 1000,
        });
      }

      const redirectPath = getPostAuthRedirectPath(userRole, null);
      res.json({
        success: true,
        message: "Email verified successfully!",
        sessionSet: !!sessionTokens,
        redirectPath,
        user: {
          id: supabaseUser.id,
          email: supabaseUser.email,
          role: userRole,
        },
      });
    } catch (err) {
      console.error("[SupabaseAuth] Supabase email verification error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/auth/verify-email?token=xxx — Verify email address
  app.get("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.query as { token?: string };
      if (!token) {
        res.status(400).json({ error: "Verification token is required" });
        return;
      }
      // consumeVerificationToken now returns the record on success, or null
      const record = await db.consumeVerificationToken(token);
      if (!record) {
        res.status(400).json({ error: "Invalid or expired verification token. Please request a new one." });
        return;
      }
      const origin = getOriginUrl(req);
      // consumeVerificationToken writes directly to the DB (not via upsertUser),
      // so we must call invalidateUserCache manually here.
      const user = await db.getUserById(record.userId);
      if (user?.openId) {
        invalidateUserCache(user.openId);
        // Mark email as confirmed in Supabase before responding so that
        // signInWithPassword works immediately after the user clicks the link.
        try {
          await getAdminClient().auth.admin.updateUserById(user.openId, { email_confirm: true });
        } catch (confirmErr) {
          console.error("[SupabaseAuth] Failed to confirm email in Supabase:", confirmErr);
        }
      }

      try {
        await db.notifyAdmins({
          category: "users",
          type: "email_verified",
          title: `Email verified: ${user?.email ?? "unknown"}`,
          body: `${user?.name ?? "A user"} (${user?.email ?? "unknown"}) verified their email address.`,
          link: `/admin/users`,
          emailOpts: {
            subject: `Email Verified: ${user?.name ?? user?.email ?? "A user"}`,
            preheader: `${user?.email ?? "A user"} just verified their email`,
            bodyHtml: `<p>Hello,</p><p><strong>${user?.name ?? "A user"}</strong> (${user?.email ?? "unknown"}) has verified their email address and can now sign in.</p>`,
            ctaText: "View Users",
            ctaUrl: `${origin}/admin/users`,
          },
        });
      } catch (err) {
        console.error("[notifyAdmins] email_verified:", err);
      }

      // Non-critical side-effects (discount codes, welcome email) run in the background.
      if (user) {
        (async () => {
          // Auto-generate discount code for employees on verification if not already done
          if (user.role === "employee") {
            try {
              await db.createDiscountCodeForEmployee(user.id, user.name || "Employee");
            } catch (codeErr) {
              console.error("[SupabaseAuth] Failed to create discount code on verification:", codeErr);
            }
          }

          if (user.email) {
            try {
              // Re-fetch user to ensure it has the discount code if it was just created
              const freshUser = await db.getUserById(user.id);
              await sendRoleBasedWelcomeEmail(freshUser || user, origin);
            } catch (emailErr) {
              console.error("[SupabaseAuth] Failed to send welcome email:", emailErr);
            }
          }
        })().catch(() => {});
      }

      res.json({ success: true, message: "Email verified successfully! You can now sign in." });
    } catch (err) {
      console.error("[SupabaseAuth] Email verification error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
    // POST /api/auth/resend-verification — Resend verification email
  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }
      const user = await db.getUserByEmail(email);
      if (!user) {
        // Don't reveal if user exists
        res.json({ success: true, message: "If an unverified account exists with this email, a new verification link has been sent." });
        return;
      }
      if (user.emailVerified) {
        res.json({ success: true, message: "Your email is already verified. Please sign in." });
        return;
      }
      const origin = getOriginUrl(req);

      const verificationToken = crypto.randomBytes(48).toString("hex");
      await db.deleteUserVerificationTokens(user.id);
      await db.createEmailVerificationToken(user.id, email, verificationToken);
      const verifyUrl = `${origin}/verify-email?token=${verificationToken}`;
      try {
        await sendVerificationEmail({ to: email, name: user.name || email.split("@")[0], verifyUrl });
        console.log(`[SupabaseAuth] Custom verification email sent to ${email}`);
      } catch (emailErr) {
        console.error("[SupabaseAuth] Failed to resend verification email:", emailErr);
      }

      try {
        const admin = getAdminClient();
        const { data: authLookup } = await admin.auth.admin.getUserById(user.openId);
        if (authLookup?.user && !isSupabaseEmailConfirmed(authLookup.user)) {
          const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          await anonClient.auth.resend({
            type: "signup",
            email,
            options: { emailRedirectTo: `${origin}/verify-email` },
          });
        }
      } catch (supabaseErr) {
        console.error("[SupabaseAuth] Supabase resend (secondary) failed:", supabaseErr);
      }

      res.json({ success: true, message: "Verification email sent. Please check your inbox." });
    } catch (err) {
      console.error("[SupabaseAuth] Resend verification error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/google — Initiate Google OAuth flow
  //
  // PKCE IMPLEMENTATION NOTE:
  // Supabase's signInWithOAuth() with a custom storage object does NOT reliably
  // call storage.setItem() in server-side (non-browser) environments. The
  // @supabase/auth-js GoTrueClient uses an internal storage reference that is
  // not the same object as the one passed via createClient options in SSR mode.
  //
  // Solution: Generate the PKCE verifier/challenge manually using Node.js crypto
  // (matching Supabase's own algorithm), build the OAuth URL directly against the
  // Supabase /auth/v1/authorize endpoint, and store the raw verifier in an
  // httpOnly cookie for the callback handler to use.
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    try {
      const origin = getOriginUrl(req);
      const { next, role, intent } = req.body as {
        next?: string;
        role?: string;
        intent?: string;
      };
      const safeNext = getSafeRelativePath(next);
      const safeIntent = intent === "signup" ? "signup" : "login";
      const ALLOWED_OAUTH_ROLES = ["subscriber", "employee"];
      if (role && !ALLOWED_OAUTH_ROLES.includes(String(role))) {
        res.status(400).json({ error: "Invalid role. Only 'subscriber' or 'employee' roles are allowed." });
        return;
      }
      const safeRole = role && ALLOWED_OAUTH_ROLES.includes(String(role))
        ? String(role)
        : undefined;
      const redirectUrl = new URL(`${origin}/api/auth/callback`);
      redirectUrl.searchParams.set("intent", safeIntent);
      if (safeNext) redirectUrl.searchParams.set("next", safeNext);
      if (safeRole) redirectUrl.searchParams.set("role", safeRole);

      // ── Manual PKCE generation (matches Supabase's own algorithm) ──────────
      // 1. Generate a cryptographically random verifier (56 random hex bytes = 112 chars)
      const codeVerifier = crypto.randomBytes(56).toString("hex");
      // 2. SHA-256 hash the verifier, then base64url-encode it (no padding)
      const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // ── Build the Supabase OAuth URL directly ─────────────────────────────
      const supabaseAuthUrl = new URL(`${supabaseUrl}/auth/v1/authorize`);
      supabaseAuthUrl.searchParams.set("provider", "google");
      supabaseAuthUrl.searchParams.set("redirect_to", redirectUrl.toString());
      supabaseAuthUrl.searchParams.set("code_challenge", codeChallenge);
      supabaseAuthUrl.searchParams.set("code_challenge_method", "s256");

      // ── Persist the verifier in an httpOnly cookie for the callback ────────
      // Use sameSite: "lax" — the Google→callback redirect is a top-level
      // navigation, and "lax" cookies are included in top-level navigations
      // from external sites. "none" was silently rejected by Safari ITP,
      // Firefox private mode, and some corporate proxies.
      res.cookie("pkce_verifier", codeVerifier, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 5 * 60 * 1000,
        path: "/",
      });

      res.json({ url: supabaseAuthUrl.toString() });
    } catch (err) {
      console.error("[SupabaseAuth] Google OAuth error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/google/finalize — Finish Google OAuth when tokens come back in the URL hash
  app.post("/api/auth/google/finalize", async (req: Request, res: Response) => {
    try {
      const {
        access_token,
        refresh_token,
        expires_in,
        next,
        role,
      } = req.body as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number | string;
        next?: string;
        role?: string;
      };

      if (!access_token) {
        res.status(400).json({ error: "Missing Google access token" });
        return;
      }

      const admin = getAdminClient();
      const { data, error } = await admin.auth.getUser(access_token);
      if (error || !data.user) {
        console.error("[SupabaseAuth] Google finalize failed:", error);
        res.status(401).json({ error: "Google sign-in session is invalid or expired" });
        return;
      }

      // Attorney role is NOT self-assignable via OAuth — only admin can grant it
      const requestedRole = ["subscriber", "employee"].includes(String(role))
        ? String(role)
        : undefined;
      const safeNext = getSafeRelativePath(next);
      const { dbUser, resolvedRole } = await syncGoogleUser({
        req,
        user: data.user,
        requestedRole,
      });

      const cookieOptions = getSessionCookieOptions(req);
      const maxAgeSeconds = Number(expires_in);
      res.cookie(
        SUPABASE_SESSION_COOKIE,
        JSON.stringify({
          access_token,
          refresh_token: refresh_token || "",
        }),
        {
          ...cookieOptions,
          maxAge: Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 ? maxAgeSeconds * 1000 : 60 * 60 * 1000,
        }
      );

      res.json({
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: dbUser?.role || resolvedRole,
        },
        redirectPath: getPostAuthRedirectPath(dbUser?.role || resolvedRole, safeNext),
      });
    } catch (err) {
      console.error("[SupabaseAuth] Google finalize error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/auth/callback — Handle Google OAuth callback
  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const intent = req.query.intent === "signup" ? "signup" : "login";
      const next = getSafeRelativePath(req.query.next);
      // Attorney role is NOT self-assignable via OAuth — only admin can grant it
      const requestedRole = ["subscriber", "employee"].includes(String(req.query.role))
        ? String(req.query.role)
        : undefined;
      if (!code) {
        // No PKCE code present — Supabase may have used the implicit (hash) flow,
        // returning tokens in the URL fragment instead. Hash fragments are never
        // sent to the server, so we redirect the browser back to the correct page
        // WITHOUT an error param. The client-side useEffect will detect the hash
        // tokens and call /api/auth/google/finalize to complete the session.
        const fallbackParams = new URLSearchParams();
        if (next) fallbackParams.set("next", next);
        if (requestedRole) fallbackParams.set("role", requestedRole);
        const fallbackQuery = fallbackParams.toString() ? `?${fallbackParams.toString()}` : "";
        const fallbackPage = intent === "signup" ? "/signup" : "/login";
        res.redirect(`${fallbackPage}${fallbackQuery}`);
        return;
      }

      // Restore the PKCE code_verifier that was saved during initiation
      const reqCookies = parseCookies(req.headers.cookie);
      const storedVerifier = reqCookies.get("pkce_verifier") || "";

      // Clear the one-time PKCE cookie immediately (before any async work).
      // Options MUST exactly match the options used when the cookie was set.
      res.clearCookie("pkce_verifier", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      });

      if (!storedVerifier) {
        console.error("[SupabaseAuth] PKCE verifier cookie missing — browser may have blocked the cookie (check sameSite/secure settings and HTTPS)");
        res.redirect(`${intent === "signup" ? "/signup" : "/login"}?error=auth_failed`);
        return;
      }

      // IMPORTANT: Supabase's createClient wraps the custom storage in a proxy
      // that does NOT forward getItem() calls to our implementation. This means
      // exchangeCodeForSession() always fails with pkce_code_verifier_not_found.
      //
      // Fix: Call the Supabase PKCE token exchange REST endpoint directly,
      // bypassing the broken storage proxy entirely.
      console.log("[PKCE] Exchanging code directly via REST | verifier length:", storedVerifier.length);
      const tokenResponse = await fetch(
        `${supabaseUrl}/auth/v1/token?grant_type=pkce`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseAnonKey,
          },
          body: JSON.stringify({
            auth_code: code,
            code_verifier: storedVerifier,
          }),
        }
      );
      const tokenJson = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        user?: { id: string; email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> };
        error?: string;
        error_description?: string;
        message?: string;
      };

      if (!tokenResponse.ok || !tokenJson.access_token || !tokenJson.user) {
        console.error("[SupabaseAuth] PKCE token exchange failed:", {
          status: tokenResponse.status,
          error: tokenJson.error,
          description: tokenJson.error_description,
          message: tokenJson.message,
        });
        res.redirect(`${intent === "signup" ? "/signup" : "/login"}?error=auth_failed`);
        return;
      }

      // Wrap the REST response in a shape matching what the rest of this handler expects
      const data = {
        session: {
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token ?? "",
          expires_in: tokenJson.expires_in ?? 3600,
        },
        user: tokenJson.user,
      };

      const user = data.user;
      const name =
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "User";

      // Sync user to app database (handles role, welcome email, discount code)
      const { dbUser, resolvedRole } = await syncGoogleUser({
        req,
        user,
        requestedRole,
      });

      // Set session cookie
      // IMPORTANT: The client will also set localStorage tokens via the finalize endpoint.
      // The extractAccessToken() function prioritizes cookies over headers, so this
      // fresh cookie will be used for all subsequent requests. However, if the client
      // still has an old/expired token in localStorage, the Authorization header will
      // fail first, then fall back to the cookie. This is correct behavior.
      const cookieOptions = getSessionCookieOptions(req);
      const sessionData = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
      res.cookie(SUPABASE_SESSION_COOKIE, JSON.stringify(sessionData), {
        ...cookieOptions,
        maxAge: data.session.expires_in * 1000,
      });

      const redirectPath = getPostAuthRedirectPath(dbUser?.role || resolvedRole, next);
      res.redirect(redirectPath);
    } catch (err) {
      console.error("[SupabaseAuth] Google callback error:", err);
      res.redirect("/login?error=server_error");
    }
  });
}
