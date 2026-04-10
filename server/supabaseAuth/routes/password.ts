/**
 * Password management routes: forgot-password, reset-password.
 *
 * Routes registered:
 *  POST /api/auth/forgot-password
 *  POST /api/auth/reset-password
 */
import { createClient } from "@supabase/supabase-js";
import type { Request, Response, Express } from "express";
import * as db from "../../db";
import { getSessionCookieOptions } from "../../_core/cookies";
import { sendAttorneyWelcomeEmail } from "../../email";
import {
  SUPABASE_SESSION_COOKIE,
  supabaseUrl,
  supabaseAnonKey,
  getAdminClient,
} from "../client";
import { getOriginUrl } from "../helpers";
import { logger } from "../../logger";

export function registerPasswordRoutes(app: Express) {

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
        logger.error({ err: error }, "[SupabaseAuth] Password reset error:");
      }

      res.json({ success: true, message: "If an account exists with this email, a password reset link has been sent." });
    } catch (err) {
      logger.error({ err: err }, "[SupabaseAuth] Forgot password error:");
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

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      await userClient.auth.setSession({
        access_token,
        refresh_token: refresh_token || "",
      });

      const { error } = await userClient.auth.updateUser({ password });

      if (error) {
        logger.error({ err: error }, "[SupabaseAuth] Password update error:");
        res.status(400).json({ error: "Failed to reset password. The link may have expired." });
        return;
      }

      let isInvitedAttorney = false;
      try {
        const admin = getAdminClient();
        const { data: { user: supaUser } } = await admin.auth.getUser(access_token);
        if (supaUser?.user_metadata?.invited_attorney === true) {
          const appUser = await db.getUserByOpenId(supaUser.id);
          if (appUser?.role === "attorney") {
            isInvitedAttorney = true;
            const origin = getOriginUrl(req);

            try {
              const signInClient = createClient(supabaseUrl, supabaseAnonKey, {
                auth: { autoRefreshToken: false, persistSession: false },
              });
              const { data: sessionData } = await signInClient.auth.signInWithPassword({
                email: supaUser.email!,
                password,
              });
              if (sessionData?.session) {
                const cookieOptions = getSessionCookieOptions(req);
                res.cookie(SUPABASE_SESSION_COOKIE, JSON.stringify({
                  access_token: sessionData.session.access_token,
                  refresh_token: sessionData.session.refresh_token,
                }), {
                  ...cookieOptions,
                  maxAge: sessionData.session.expires_in * 1000,
                });
                (res as any)._invitationSession = sessionData.session;
              }
            } catch (signInErr) {
              logger.error({ err: signInErr }, "[SupabaseAuth] Failed to auto-sign-in attorney after invitation:");
            }

            try {
              await sendAttorneyWelcomeEmail({
                to: appUser.email || supaUser.email || "",
                name: appUser.name || supaUser.email?.split("@")[0] || "Counselor",
                dashboardUrl: `${origin}/attorney`,
              });
            } catch (welcomeErr) {
              logger.error({ err: welcomeErr }, "[SupabaseAuth] Failed to send attorney welcome email:");
            }
            try {
              await db.createNotification({
                userId: appUser.id,
                type: "role_updated",
                title: "Welcome to the Review Center!",
                body: "Your attorney account is now active. You can start claiming and reviewing letters.",
                link: "/attorney",
              });
            } catch (notifErr) {
              logger.error({ err: notifErr }, "[SupabaseAuth] Failed to create attorney welcome notification:");
            }
            try {
              await admin.auth.admin.updateUserById(supaUser.id, {
                user_metadata: { invited_attorney: false },
              });
            } catch (clearErr) {
              logger.error({ err: clearErr }, "[SupabaseAuth] Failed to clear invited_attorney flag:");
            }
          }
        }
      } catch (postResetErr) {
        logger.error({ err: postResetErr }, "[SupabaseAuth] Post-reset attorney check error:");
      }

      const invitationSession = (res as any)._invitationSession;
      res.json({
        success: true,
        message: "Password has been reset successfully.",
        isInvitedAttorney,
        redirectTo: isInvitedAttorney ? "/attorney" : undefined,
        ...(invitationSession ? {
          session: {
            access_token: invitationSession.access_token,
            refresh_token: invitationSession.refresh_token,
          },
        } : {}),
      });
    } catch (err) {
      logger.error({ err: err }, "[SupabaseAuth] Reset password error:");
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
