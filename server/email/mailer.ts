/**
 * Mailer utilities — credential validation and sending infrastructure helpers.
 *
 * Importing from this file keeps all existing callers working unchanged.
 */

import { getResend } from "./core";

/** Validate Resend credentials (used in tests and health checks) */
export async function validateResendCredentials(): Promise<boolean> {
  try {
    const r = getResend();
    const { error } = await r.domains.list();
    return !error;
  } catch (err) {
    console.warn("[Email] Resend credential validation failed:", err);
    return false;
  }
}
