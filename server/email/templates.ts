/**
 * Email notification templates barrel.
 *
 * All send*Email functions are split by audience into per-category files
 * under ./templates/:
 *
 *  - subscriber.ts  — letter lifecycle, account, and reminder emails for subscribers
 *  - attorney.ts    — review queue notifications for attorneys and employees
 *  - admin.ts       — system alerts, pipeline failures, and 2FA codes for admins
 *  - employee.ts    — onboarding, commission, and payout emails for employees/attorneys
 *  - delivery.ts    — sends the approved letter directly to an external recipient
 *
 * Credential validation helper lives in ./mailer.ts.
 *
 * Importing from this file keeps all existing callers working unchanged.
 */

export * from "./templates/index";
export { validateResendCredentials } from "./mailer";
