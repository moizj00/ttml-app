/**
 * Admin two-factor authentication routes.
 *
 * Routes registered:
 *  POST /api/auth/admin-2fa/verify
 *  POST /api/auth/admin-2fa/resend
 *  GET  /api/auth/admin-2fa/status
 */
import type { Request, Response, Express } from "express";
import * as db from "../../db";
import { getSessionCookieOptions } from "../../_core/cookies";
import { ADMIN_2FA_COOKIE, ADMIN_2FA_TTL_MS, signAdmin2FAToken, verifyAdmin2FAToken } from "../../_core/admin2fa";
import { sendAdminVerificationCodeEmail } from "../../email";
import { authenticateRequest, parseCookies } from "../jwt";
import { logger } from "../../logger";

export function registerAdmin2FARoutes(app: Express) {

  // POST /api/auth/admin-2fa/verify — Verify admin 8-digit code
  app.post("/api/auth/admin-2fa/verify", async (req: Request, res: Response) => {
    try {
      const user = await authenticateRequest(req);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const { code } = req.body;
      if (!code || typeof code !== "string" || code.length !== 8) {
        res.status(400).json({ error: "A valid 8-digit code is required" });
        return;
      }
      const valid = await db.verifyAdminCode(user.id, code);
      if (!valid) {
        res.status(401).json({ error: "Invalid or expired code. Please try again or request a new code." });
        return;
      }
      const cookieOptions = getSessionCookieOptions(req);
      const signedToken = signAdmin2FAToken(user.id);
      res.cookie(ADMIN_2FA_COOKIE, signedToken, {
        ...cookieOptions,
        maxAge: ADMIN_2FA_TTL_MS,
      });
      res.json({ success: true });
    } catch (err) {
      logger.error({ err: err }, "[SupabaseAuth] Admin 2FA verify error:");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/auth/admin-2fa/resend — Resend admin verification code
  app.post("/api/auth/admin-2fa/resend", async (req: Request, res: Response) => {
    try {
      const user = await authenticateRequest(req);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const code = await db.createAdminVerificationCode(user.id);
      await sendAdminVerificationCodeEmail({
        to: user.email!,
        name: user.name || user.email!.split("@")[0],
        code,
      });
      logger.info(`[SupabaseAuth] Admin 2FA resend dispatched, to=${user.email}`);
      res.json({ success: true, message: "A new verification code has been sent to your email." });
    } catch (err) {
      logger.error({ err: err }, "[SupabaseAuth] Admin 2FA resend error:");
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: `Failed to send verification code: ${message}. Please check your email address or try again.` });
    }
  });

  // GET /api/auth/admin-2fa/status — Check if admin has completed 2FA for this session
  app.get("/api/auth/admin-2fa/status", async (req: Request, res: Response) => {
    try {
      const user = await authenticateRequest(req);
      if (!user || user.role !== "admin") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const cookies = parseCookies(req.headers.cookie);
      const tfaCookie = cookies.get(ADMIN_2FA_COOKIE);
      if (!tfaCookie) {
        res.json({ verified: false });
        return;
      }
      res.json({ verified: verifyAdmin2FAToken(tfaCookie, user.id) });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
