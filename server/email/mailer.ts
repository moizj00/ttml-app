/**
 * Mailer utilities — credential validation and sending infrastructure helpers.
 *
 * Importing from this file keeps all existing callers working unchanged.
 */

import { getResend } from "./core";
import { logger } from "../logger";

/** Validate Resend credentials (used in tests and health checks) */
export async function validateResendCredentials(): Promise<boolean> {
  try {
    const r = getResend();
    const { error } = await r.domains.list();
    return !error;
  } catch (err) {
    logger.warn({ err: err }, "[Email] Resend credential validation failed:");
    return false;
  }
}
