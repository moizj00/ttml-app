import * as crypto from "crypto";

const ADMIN_2FA_SECRET = process.env.ADMIN_2FA_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ADMIN_2FA_SECRET) {
  throw new Error("ADMIN_2FA_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set for admin 2FA");
}
export const ADMIN_2FA_COOKIE = "admin_2fa";
export const ADMIN_2FA_TTL_MS = 12 * 60 * 60 * 1000;

export function signAdmin2FAToken(userId: number): string {
  const payload = { userId, ts: Date.now() };
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", ADMIN_2FA_SECRET).update(data).digest("hex");
  return JSON.stringify({ data, sig });
}

export function verifyAdmin2FAToken(cookieValue: string, userId: number): boolean {
  try {
    const { data, sig } = JSON.parse(cookieValue);
    const expectedSig = crypto.createHmac("sha256", ADMIN_2FA_SECRET).update(data).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) return false;
    const payload = JSON.parse(data);
    if (payload.userId !== userId) return false;
    if (Date.now() - payload.ts > ADMIN_2FA_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}
