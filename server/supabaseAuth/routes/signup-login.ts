/**
 * Authentication routes: signup, login, logout, token refresh.
 *
 * Routes registered:
 *  POST /api/auth/signup
 *  POST /api/auth/login
 *  POST /api/auth/logout
 *  POST /api/auth/refresh
 */
import { createClient } from "@supabase/supabase-js";
import type { Request, Response, Express } from "express";
import * as crypto from "crypto";
import * as db from "../../db";
import { getSessionCookieOptions } from "../../_core/cookies";
import { ADMIN_2FA_COOKIE } from "../../_core/admin2fa";
import {
  sendVerificationEmail,
  sendAdminVerificationCodeEmail,
} from "../../email";
import {
  SUPER_ADMIN_EMAILS,
  SUPABASE_SESSION_COOKIE,
  supabaseUrl,
  supabaseAnonKey,
  getAdminClient,
} from "../client";
import { invalidateUserCache } from "../user-cache";
import { getOriginUrl, isSupabaseEmailConfirmed } from "../helpers";
import { extractAccessToken, parseCookies } from "../jwt";
import { logger } from "../../logger";

export function registerSignupLoginRoutes(app: Express) {

  // POST /api/auth/signup — Create a new user via Supabase Auth
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { email, password, name, role: requestedRole, wantsAffiliate } = req.body;
      const ALLOWED_SIGNUP_ROLES = ["affiliate"];
      if (requestedRole && !ALLOWED_SIGNUP_ROLES.includes(requestedRole)) {
        res.status(400).json({ error: "Invalid role. Only 'affiliate' role is allowed for signup. All other users default to subscriber." });
        return;
      }
      const signupRole: "subscriber" | "employee" = requestedRole === "affiliate" ? "employee" : "subscriber";

      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      if (password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }

      const origin = getOriginUrl(req);
      const { data, error } = await getAdminClient().auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { name: name || email.split("@")[0] },
      });

      if (error) {
        logger.error({ err: error }, "[SupabaseAuth] Signup error:");
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

      // Hard-coded super admin whitelist enforcement (signup)
      const ownerOpenId = process.env.OWNER_OPEN_ID;
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
        ...(isOwner ? { role: "admin", emailVerified: true } : { role: signupRole }),
      });

      invalidateUserCache(data.user.id);

      const appUser = await db.getUserByOpenId(data.user.id);

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
          logger.info(`[SupabaseAuth] Verification email sent via Resend to ${email}`);
        } catch (tokenErr) {
          logger.error({ err: tokenErr }, "[SupabaseAuth] Failed to send verification email:");
        }
      }

      if (appUser && signupRole === "employee" && wantsAffiliate === true) {
        try {
          await db.createDiscountCodeForEmployee(appUser.id, userName);
          logger.info(`[SupabaseAuth] Discount code generated for new affiliate employee #${appUser.id}`);
        } catch (codeErr) {
          logger.error({ err: codeErr }, "[SupabaseAuth] Failed to create discount code for employee:");
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
        logger.error({ err: err }, "[notifyAdmins] new_signup:");
      }

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
      logger.error({ err: err }, "[SupabaseAuth] Signup error:");
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

      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await anonClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error({ err: error }, "[SupabaseAuth] Login error:");
        if (error.message.includes("Invalid login credentials")) {
          res.status(401).json({ error: "Invalid email or password" });
          return;
        }
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

      const name = data.user.user_metadata?.name ||
                   data.user.user_metadata?.full_name ||
                   email.split("@")[0];
      const supabaseEmailVerified = isSupabaseEmailConfirmed(data.user);
      const appUserCheck = await db.getUserByEmail(email).catch((err) => {
        logger.warn({ err: err }, `[SupabaseAuth] Failed to fetch app user by email during login (${email}):`);
        return null;
      });

      if (appUserCheck && appUserCheck.emailVerified === false && !supabaseEmailVerified) {
        try {
          const admin = getAdminClient();
          await admin.auth.admin.signOut(data.user.id);
        } catch (signOutErr) {
          logger.warn({ err: signOutErr }, "[SupabaseAuth] Failed to sign out unverified user from Supabase:");
        }
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

      invalidateUserCache(data.user.id);

      const appUser = await db.getUserByOpenId(data.user.id);
      const userRole = appUser?.role || "subscriber";

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(SUPABASE_SESSION_COOKIE, JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }), {
        ...cookieOptions,
        maxAge: data.session.expires_in * 1000,
      });

      let emailFailed = false;
      if (userRole === "admin" && appUser) {
        try {
          const code = await db.createAdminVerificationCode(appUser.id);
          await sendAdminVerificationCodeEmail({
            to: email,
            name: appUser.name || email.split("@")[0],
            code,
          });
          logger.info(`[SupabaseAuth] Admin 2FA code dispatched, to=${email}`);
        } catch (err) {
          logger.error({ err: err }, `[SupabaseAuth] Failed to send admin 2FA code, to=${email}:`);
          emailFailed = true;
        }
      }

      res.json({
        success: true,
        requires2FA: userRole === "admin",
        emailFailed,
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
      logger.error({ err: err }, "[SupabaseAuth] Login error:");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/logout — Sign out
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const token = extractAccessToken(req);
      if (token) {
        const admin = getAdminClient();
        const { data: { user } } = await admin.auth.getUser(token);
        if (user) {
          await admin.auth.admin.signOut(user.id);
        }
      }

      const cookieOptions = getSessionCookieOptions(req);
      res.clearCookie(SUPABASE_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      res.clearCookie(ADMIN_2FA_COOKIE, { ...cookieOptions, maxAge: -1 });

      res.json({ success: true });
    } catch (err) {
      logger.error({ err: err }, "[SupabaseAuth] Logout error:");
      const cookieOptions = getSessionCookieOptions(req);
      res.clearCookie(SUPABASE_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      res.clearCookie(ADMIN_2FA_COOKIE, { ...cookieOptions, maxAge: -1 });
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
      logger.error({ err: err }, "[SupabaseAuth] Refresh error:");
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
