/**
 * Google OAuth routes.
 *
 * Routes registered:
 *  POST /api/auth/google           (initiate OAuth flow)
 *  POST /api/auth/google/finalize  (finalize from hash tokens)
 *  GET  /api/auth/callback         (PKCE callback from Supabase)
 */
import type { Request, Response, Express } from "express";
import * as crypto from "crypto";
import * as db from "../../db";
import { getSessionCookieOptions } from "../../_core/cookies";
import { sendAdminVerificationCodeEmail } from "../../email";
import {
  SUPABASE_SESSION_COOKIE,
  supabaseUrl,
  supabaseAnonKey,
  getAdminClient,
} from "../client";
import { getSafeRelativePath, getPostAuthRedirectPath, syncGoogleUser, getOriginUrl } from "../helpers";
import { parseCookies } from "../jwt";
import { logger } from "../../logger";

/**
 * Cookie options for the PKCE verifier cookie.
 * SameSite=Lax ensures the cookie is sent on top-level GET navigations
 * from external sites (the OAuth redirect chain: Supabase → Google → Supabase → our callback).
 * SameSite=None was being silently blocked by Chrome's third-party cookie deprecation.
 */
const PKCE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

/** Serialize any error value to a loggable string for Railway log visibility */
function serializeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ""}`;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export function registerOAuthRoutes(app: Express) {

  // POST /api/auth/google — Initiate Google OAuth flow
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
      // Attorney role is NOT self-assignable — only super-admin can assign it
      const ALLOWED_OAUTH_ROLES = ["affiliate"];
      if (role && !ALLOWED_OAUTH_ROLES.includes(String(role))) {
        res.status(400).json({ error: "Invalid role. Only 'affiliate' role is allowed for signup." });
        return;
      }
      const safeRole: "employee" | undefined = role === "affiliate" ? "employee" : undefined;

      const redirectUrl = new URL(`${origin}/api/auth/callback`);
      redirectUrl.searchParams.set("intent", safeIntent);
      if (safeNext) redirectUrl.searchParams.set("next", safeNext);
      if (safeRole) redirectUrl.searchParams.set("role", safeRole);

      const codeVerifier = crypto.randomBytes(56).toString("hex");
      const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const supabaseAuthUrl = new URL(`${supabaseUrl}/auth/v1/authorize`);
      supabaseAuthUrl.searchParams.set("provider", "google");
      supabaseAuthUrl.searchParams.set("redirect_to", redirectUrl.toString());
      supabaseAuthUrl.searchParams.set("code_challenge", codeChallenge);
      supabaseAuthUrl.searchParams.set("code_challenge_method", "s256");

      res.cookie("pkce_verifier", codeVerifier, {
        ...PKCE_COOKIE_OPTIONS,
        maxAge: 5 * 60 * 1000,
      });

      logger.info(
        {
          origin,
          redirect_to: redirectUrl.toString(),
          verifier_length: codeVerifier.length,
          supabase_url_set: !!supabaseUrl,
          anon_key_set: !!supabaseAnonKey,
        },
        "[OAuth] Initiated Google OAuth flow"
      );
      res.json({ url: supabaseAuthUrl.toString() });
    } catch (err) {
      logger.error({ err: serializeError(err) }, "[SupabaseAuth] Google OAuth initiation error");
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
        logger.error({ err: serializeError(error), supabase_error: error?.message }, "[SupabaseAuth] Google finalize — getUser failed");
        res.status(401).json({ error: "Google sign-in session is invalid or expired" });
        return;
      }

      // Attorney role is NOT self-assignable — only super-admin can assign it
      const requestedRole: "employee" | undefined = role === "affiliate" ? "employee" : undefined;
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

      const finalRole = dbUser?.role || resolvedRole;
      let emailFailed = false;
      if (finalRole === "admin" && dbUser) {
        try {
          const code = await db.createAdminVerificationCode(dbUser.id);
          await sendAdminVerificationCodeEmail({
            to: data.user.email!,
            name: dbUser.name || data.user.email!.split("@")[0],
            code,
          });
          logger.info(`[SupabaseAuth] Admin 2FA code dispatched, to=${data.user.email} (Google OAuth)`);
        } catch (err) {
          logger.error({ err: serializeError(err) }, `[SupabaseAuth] Failed to send admin 2FA code, to=${data.user.email} (Google OAuth)`);
          emailFailed = true;
        }
      }

      res.json({
        success: true,
        requires2FA: finalRole === "admin",
        emailFailed,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: finalRole,
        },
        redirectPath: finalRole === "admin" ? "/admin/verify" : getPostAuthRedirectPath(finalRole, safeNext),
      });
    } catch (err) {
      logger.error({ err: serializeError(err) }, "[SupabaseAuth] Google finalize error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/auth/callback — Handle Google OAuth callback (PKCE)
  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const intent = req.query.intent === "signup" ? "signup" : "login";
      const next = getSafeRelativePath(req.query.next);
      // Attorney role is NOT self-assignable — only super-admin can assign it
      const requestedRole: "employee" | undefined = req.query.role === "affiliate" ? "employee" : undefined;
      if (!code) {
        const fallbackParams = new URLSearchParams();
        if (next) fallbackParams.set("next", next);
        if (requestedRole) fallbackParams.set("role", requestedRole);
        const fallbackQuery = fallbackParams.toString() ? `?${fallbackParams.toString()}` : "";
        const fallbackPage = intent === "signup" ? "/signup" : "/login";
        res.redirect(`${fallbackPage}${fallbackQuery}`);
        return;
      }

      const reqCookies = parseCookies(req.headers.cookie);
      const storedVerifier = reqCookies.get("pkce_verifier") || "";

      // Log all incoming cookies for debugging (names only, not values)
      const allCookieNames = Array.from(reqCookies.keys());
      logger.info(
        {
          cookie_names: allCookieNames,
          has_pkce: !!storedVerifier,
          verifier_length: storedVerifier.length,
          host: req.headers.host,
          referer: req.headers.referer,
          anon_key_set: !!supabaseAnonKey,
          anon_key_length: supabaseAnonKey.length,
        },
        "[OAuth Callback] Received callback"
      );

      res.clearCookie("pkce_verifier", PKCE_COOKIE_OPTIONS);

      if (!storedVerifier) {
        logger.error(
          {
            cookie_header_present: !!req.headers.cookie,
            cookie_names: allCookieNames,
            host: req.headers.host,
          },
          "[SupabaseAuth] PKCE verifier cookie missing — browser may have blocked the cookie (check sameSite/secure settings and HTTPS)"
        );
        res.redirect(`${intent === "signup" ? "/signup" : "/login"}?error=auth_failed`);
        return;
      }

      logger.info(
        { verifier_length: storedVerifier.length, anon_key_length: supabaseAnonKey.length },
        "[PKCE] Exchanging code via REST"
      );

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
        logger.error(
          {
            status: tokenResponse.status,
            supabase_error: tokenJson.error,
            supabase_error_description: tokenJson.error_description,
            supabase_message: tokenJson.message,
            anon_key_length: supabaseAnonKey.length,
          },
          "[SupabaseAuth] PKCE token exchange failed"
        );
        res.redirect(`${intent === "signup" ? "/signup" : "/login"}?error=auth_failed`);
        return;
      }

      const data = {
        session: {
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token ?? "",
          expires_in: tokenJson.expires_in ?? 3600,
        },
        user: tokenJson.user,
      };

      const user = data.user;

      logger.info({ user_id: user.id, email: user.email }, "[SupabaseAuth] PKCE token exchange succeeded — syncing user");

      const { dbUser, resolvedRole } = await syncGoogleUser({
        req,
        user,
        requestedRole,
      });

      const cookieOptions = getSessionCookieOptions(req);
      const sessionData = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
      res.cookie(SUPABASE_SESSION_COOKIE, JSON.stringify(sessionData), {
        ...cookieOptions,
        maxAge: data.session.expires_in * 1000,
      });

      const callbackRole = dbUser?.role || resolvedRole;
      if (callbackRole === "admin" && dbUser) {
        let emailFailed = false;
        try {
          const code2 = await db.createAdminVerificationCode(dbUser.id);
          await sendAdminVerificationCodeEmail({
            to: user.email!,
            name: dbUser.name || user.email!.split("@")[0],
            code: code2,
          });
          logger.info(`[SupabaseAuth] Admin 2FA code dispatched, to=${user.email} (Google callback)`);
        } catch (err2) {
          logger.error({ err: serializeError(err2) }, `[SupabaseAuth] Failed to send admin 2FA code, to=${user.email} (Google callback)`);
          emailFailed = true;
        }
        res.redirect(emailFailed ? "/admin/verify?emailFailed=1" : "/admin/verify");
      } else {
        const redirectPath = getPostAuthRedirectPath(callbackRole, next);
        res.redirect(redirectPath);
      }
    } catch (err) {
      logger.error(
        {
          err: serializeError(err),
          error_message: err instanceof Error ? err.message : String(err),
          error_name: err instanceof Error ? err.name : "unknown",
          stack: err instanceof Error ? err.stack : undefined,
        },
        "[SupabaseAuth] Google callback error — full details"
      );
      res.redirect("/login?error=server_error");
    }
  });
}
