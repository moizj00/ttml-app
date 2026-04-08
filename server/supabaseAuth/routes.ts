/**
 * Express auth routes — thin orchestrator.
 *
 * Delegates to focused route modules under ./routes/:
 *  - signup-login.ts  → POST /api/auth/signup, /login, /logout, /refresh
 *  - admin-2fa.ts     → POST/GET /api/auth/admin-2fa/*
 *  - password.ts      → POST /api/auth/forgot-password, /reset-password
 *  - verification.ts  → POST/GET /api/auth/verify-email, /resend-verification
 *  - oauth.ts         → POST/GET /api/auth/google, /google/finalize, /callback
 */
import type { Express } from "express";
import {
  registerSignupLoginRoutes,
  registerAdmin2FARoutes,
  registerPasswordRoutes,
  registerVerificationRoutes,
  registerOAuthRoutes,
} from "./routes/index";

export function registerSupabaseAuthRoutes(app: Express) {
  registerSignupLoginRoutes(app);
  registerAdmin2FARoutes(app);
  registerPasswordRoutes(app);
  registerVerificationRoutes(app);
  registerOAuthRoutes(app);
}
