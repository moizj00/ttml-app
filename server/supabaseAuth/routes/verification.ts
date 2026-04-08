/**
 * Email verification routes.
 *
 * Routes registered:
 *  POST /api/auth/verify-email  (Supabase code/token_hash flow)
 *  GET  /api/auth/verify-email  (custom token query-param flow)
 *  POST /api/auth/resend-verification
 */
import { createClient, type EmailOtpType } from "@supabase/supabase-js";
import type { Request, Response, Express } from "express";
import * as crypto from "crypto";
import * as db from "../../db";
import { getSessionCookieOptions } from "../../_core/cookies";
import { sendVerificationEmail } from "../../email";
import { captureServerException } from "../../sentry";
import {
  SUPER_ADMIN_EMAILS,
  SUPABASE_SESSION_COOKIE,
  supabaseUrl,
  supabaseAnonKey,
  getAdminClient,
} from "../client";
import { invalidateUserCache } from "../user-cache";
import {
  getOriginUrl,
  getPostAuthRedirectPath,
  sendRoleBasedWelcomeEmail,
  isSupabaseEmailConfirmed,
} from "../helpers";

export function registerVerificationRoutes(app: Express) {

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
      // Hard-coded super admin whitelist enforcement (verify-email)
      const ownerOpenId = process.env.OWNER_OPEN_ID;
      const email = supabaseUser.email || existingUser?.email || null;
      const isOwner =
        (ownerOpenId && supabaseUser.id === ownerOpenId) ||
        (email ? (SUPER_ADMIN_EMAILS as readonly string[]).includes(email.toLowerCase()) : false);
      const name =
        supabaseUser.user_metadata?.name ||
        supabaseUser.user_metadata?.full_name ||
        existingUser?.name ||
        email?.split("@")[0] ||
        null;
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

      invalidateUserCache(supabaseUser.id);

      if (!alreadyVerified) {
        db.getUserByOpenId(supabaseUser.id).then(async (user) => {
          if (!user) return;
          try {
            await sendRoleBasedWelcomeEmail(user, origin);
          } catch (emailErr) {
            console.error("[SupabaseAuth] Failed to send welcome email:", emailErr);
          }
        }).catch((err) => {
          console.error("[SupabaseAuth] Failed to fetch user for welcome email (OAuth verify):", err);
          captureServerException(err instanceof Error ? err : new Error(String(err)), {
            tags: { component: "supabase_auth", error_type: "welcome_email_fetch_failed" },
          });
        });
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

  // GET /api/auth/verify-email?token=xxx — Verify email address via custom token
  app.get("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.query as { token?: string };
      if (!token) {
        res.status(400).json({ error: "Verification token is required" });
        return;
      }
      const record = await db.consumeVerificationToken(token);
      if (!record) {
        res.status(400).json({ error: "Invalid or expired verification token. Please request a new one." });
        return;
      }
      const origin = getOriginUrl(req);
      const user = await db.getUserById(record.userId);
      if (user?.openId) {
        invalidateUserCache(user.openId);
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

      if (user) {
        (async () => {
          if (user.role === "employee") {
            try {
              await db.createDiscountCodeForEmployee(user.id, user.name || "Employee");
            } catch (codeErr) {
              console.error("[SupabaseAuth] Failed to create discount code on verification:", codeErr);
            }
          }

          if (user.email) {
            try {
              const freshUser = await db.getUserById(user.id);
              await sendRoleBasedWelcomeEmail(freshUser || user, origin);
            } catch (emailErr) {
              console.error("[SupabaseAuth] Failed to send welcome email:", emailErr);
            }
          }
        })().catch((err) => {
          console.error("[SupabaseAuth] Background welcome email task failed:", err);
          captureServerException(err instanceof Error ? err : new Error(String(err)), {
            tags: { component: "supabase_auth", error_type: "welcome_email_background_failed" },
          });
        });
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
}
