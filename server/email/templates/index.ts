/**
 * Email templates barrel — re-exports all per-category template files.
 *
 *  - subscriber.ts  — letter lifecycle, account, and reminder emails for subscribers
 *  - attorney.ts    — review queue notifications for attorneys and employees
 *  - admin.ts       — system alerts, pipeline failures, and 2FA codes for admins
 *  - employee.ts    — onboarding, commission, and payout emails for employees/attorneys
 *  - delivery.ts    — sends the approved letter directly to an external recipient
 */

export * from "./subscriber";
export * from "./attorney";
export * from "./admin";
export * from "./employee";
export * from "./delivery";
