import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

/**
 * Initialize Sentry for client-side error monitoring.
 * Only activates when VITE_SENTRY_DSN is set (production/staging).
 */
export function initSentry() {
  if (!SENTRY_DSN) {
    console.log("[Sentry] No DSN configured — client-side monitoring disabled");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: true,
    environment: import.meta.env.MODE, // "development" | "production"
    release: `ttml-client@${import.meta.env.VITE_APP_VERSION ?? "1.0.0"}`,

    // ─── Performance Monitoring ───
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text and block all media in replays for privacy
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    // Performance: sample 20% of transactions in production, 100% in dev
    tracesSampleRate: import.meta.env.MODE === "production" ? 0.2 : 1.0,

    // Session Replay: capture 10% of sessions, 100% of sessions with errors
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // ─── Filtering ───
    // Don't send errors from browser extensions or third-party scripts
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],

    // Ignore common non-actionable errors
    ignoreErrors: [
      "ResizeObserver loop",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      // Network errors that aren't bugs
      "Failed to fetch",
      "NetworkError",
      "Load failed",
      "AbortError",
    ],

    // ─── Before Send Hook ───
    beforeSend(event) {
      // Strip PII from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(bc => {
          // Redact authorization headers from fetch breadcrumbs
          if (bc.category === "fetch" && bc.data?.headers) {
            const headers = { ...bc.data.headers };
            if (headers.Authorization) {
              headers.Authorization = "[REDACTED]";
            }
            return { ...bc, data: { ...bc.data, headers } };
          }
          return bc;
        });
      }
      // Scrub tokens from URLs that may appear in event data
      if (event.request?.url) {
        event.request.url = event.request.url
          .replace(/token=[^&]*/gi, "token=[REDACTED]")
          .replace(/access_token=[^&]*/gi, "access_token=[REDACTED]");
      }
      return event;
    },
  });

  console.log("[Sentry] Client-side monitoring initialized");
}

/**
 * Set the current user context for Sentry.
 * Call this after login or when user data is available.
 */
export function setSentryUser(user: {
  id: string;
  email?: string;
  role?: string;
}) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    // Custom tag for role-based filtering in Sentry dashboard
  });
  if (user.role) {
    Sentry.setTag("user.role", user.role);
  }
}

/**
 * Clear user context on logout.
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Capture an exception with optional extra context.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>
) {
  Sentry.captureException(error, {
    extra: context,
  });
}

// Re-export Sentry for direct access when needed
export { Sentry };
