import * as Sentry from "@sentry/node";
import { ENV } from "./_core/env";

let initialized = false;

/**
 * Initialize Sentry for server-side error monitoring.
 * Must be called BEFORE any other imports that might throw.
 */
export function initServerSentry() {
  if (initialized) return;
  if (!ENV.sentryDsn) {
    console.log("[Sentry] No DSN configured — server-side monitoring disabled");
    return;
  }

  Sentry.init({
    dsn: ENV.sentryDsn,
    sendDefaultPii: true,
    environment: ENV.isProduction ? "production" : "development",
    release: `ttml-server@${process.env.npm_package_version ?? "1.0.0"}`,

    // Performance: sample 30% of transactions in production
    tracesSampleRate: ENV.isProduction ? 0.3 : 1.0,

    // ─── Integrations ───
    integrations: [
      // Express integration for automatic request/response tracking
      Sentry.expressIntegration(),
    ],

    // ─── Before Send Hook ───
    beforeSend(event) {
      // Redact sensitive data from request headers
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

  initialized = true;
  console.log("[Sentry] Server-side monitoring initialized");
}

// ─── Helper: Capture exception with context ───

/**
 * Capture a server-side exception with optional extra context.
 */
export function captureServerException(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id: string; email?: string; role?: string };
  }
) {
  if (!initialized) {
    console.error("[Sentry] Not initialized, logging error:", error);
    return;
  }

  Sentry.withScope((scope) => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    if (context?.user) {
      scope.setUser({
        id: context.user.id,
        email: context.user.email,
      });
      if (context.user.role) {
        scope.setTag("user.role", context.user.role);
      }
    }
    Sentry.captureException(error);
  });
}

/**
 * Add a server-side breadcrumb.
 */
export function addServerBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info"
) {
  if (!initialized) return;
  Sentry.addBreadcrumb({ category, message, data, level });
}

/**
 * Set user context for the current scope (call in request middleware).
 */
export function setServerUser(user: {
  id: string;
  email?: string;
  role?: string;
}) {
  if (!initialized) return;
  Sentry.setUser({ id: user.id, email: user.email });
  if (user.role) {
    Sentry.setTag("user.role", user.role);
  }
}

// Re-export for direct access
export { Sentry };
