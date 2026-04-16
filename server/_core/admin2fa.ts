import * as crypto from "crypto";
import { logger } from "../logger";

export const ADMIN_2FA_COOKIE = "admin_2fa";
export const ADMIN_2FA_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Resolves the HMAC secret at call-time rather than module-load time.
 * This prevents a crash during test suite initialization when the env vars
 * are not yet injected, and follows the fail-when-needed principle.
 */
function getAdmin2FASecret(): string {
  const secret = process.env.ADMIN_2FA_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("ADMIN_2FA_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set for admin 2FA");
  }
  return secret;
}

export function signAdmin2FAToken(userId: number): string {
  const secret = getAdmin2FASecret();
  const payload = { userId, ts: Date.now() };
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(data).digest("hex");
  return JSON.stringify({ data, sig });
}

export function verifyAdmin2FAToken(cookieValue: string, userId: number): boolean {
  // Intentionally outside the try/catch: a missing secret is a server
  // misconfiguration and must propagate as an exception, not be silently
  // swallowed as a `false` (invalid-token) result.
  const secret = getAdmin2FASecret();
  try {
    const { data, sig } = JSON.parse(cookieValue);
    const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) return false;
    const payload = JSON.parse(data);
    if (payload.userId !== userId) return false;
    if (Date.now() - payload.ts > ADMIN_2FA_TTL_MS) return false;
    return true;
  } catch (err) {
    logger.warn({ err: err }, "[Admin2FA] Token verification failed (malformed token):");
    return false;
  }
}
