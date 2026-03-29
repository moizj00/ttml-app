import * as Sentry from "@sentry/node";

const SENTRY_DSN = process.env.SENTRY_DSN || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: true,
    environment: IS_PRODUCTION ? "production" : "development",
    release: `ttml-server@${process.env.npm_package_version ?? "1.0.0"}`,
    tracesSampleRate: IS_PRODUCTION ? 0.3 : 1.0,
    integrations: [
      Sentry.expressIntegration(),
    ],
    beforeSend(event) {
      if (event.request?.headers) {
        const headers = { ...event.request.headers };
        if (headers.authorization) headers.authorization = "[REDACTED]";
        if (headers.cookie) headers.cookie = "[REDACTED]";
        event.request.headers = headers;
      }
      return event;
    },
    ignoreErrors: [
      "ECONNRESET",
      "ECONNREFUSED",
      "EPIPE",
      "socket hang up",
    ],
  });

  console.log("[Sentry] Instrumentation initialized via --import");
} else {
  console.log("[Sentry] No DSN configured — monitoring disabled");
}
