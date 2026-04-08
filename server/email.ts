/**
 * Email notification service — barrel re-export.
 *
 * Infrastructure (Resend client, Worker dispatch, HTML builders, low-level senders)
 * lives in ./email/core.ts.
 *
 * All public send*Email template functions are split by audience under ./email/templates/.
 * The full index (including validateResendCredentials from ./email/mailer.ts) is
 * re-exported via ./email/templates.ts.
 *
 * Importing from this file keeps all existing callers working unchanged.
 */

export * from "./email/core";
export * from "./email/templates";
