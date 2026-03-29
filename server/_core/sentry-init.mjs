/**
 * Sentry ESM Initialization
 * 
 * This file must be imported BEFORE any application code via:
 *   node --import ./dist/sentry-init.js dist/index.js
 * 
 * It initializes Sentry for automatic error tracking and performance monitoring.
 */
import * as Sentry from "@sentry/node";

const SENTRY_DSN = process.env.SENTRY_DSN || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: true,
    environment: IS_PRODUCTION ? "production" : "development",
    release: `ttml-server@${process.env.npm_package_version ?? "1.0.0"}`,

    // Performance: sample 30% of transactions in production
    tracesSampleRate: IS_PRODUCTION ? 0.3 : 1.0,

    // Integrations — Sentry v8+ auto-includes all Node.js integrations
    // via getDefaultIntegrations(). We only add Express explicitly.
    integrations: [
      Sentry.expressIntegration(),
    ],

    // Before send hook to redact sensitive data
    beforeSend(event) {
      if (event.request?.headers) {
        const headers = { ...event.request.headers };
        if (headers.authorization) headers.authorization = "[REDACTED]";
        if (headers.cookie) headers.cookie = "[REDACTED]";
        event.request.headers = headers;
      }
      return event;
    },

    // Ignore common non-actionable errors
    ignoreErrors: [
      "ECONNRESET",
      "ECONNREFUSED",
      "EPIPE",
      "socket hang up",
    ],
  });

  console.log("[Sentry] ESM initialization complete — monitoring enabled");
} else {
  console.log("[Sentry] No DSN configured — monitoring disabled");
}
