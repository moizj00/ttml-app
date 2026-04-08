import * as Sentry from "@sentry/node";
import { logger } from "./logger";

let initialized = false;

export function initServerSentry() {
  if (initialized) return;

  const client = Sentry.getClient();
  if (client) {
    initialized = true;
    logger.info("[Sentry] Already initialized via --import instrumentation");
    return;
  }

  logger.info("[Sentry] Not pre-initialized — skipping duplicate init (use --import server/instrument.ts)");
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
  if (!Sentry.getClient()) {
    logger.error({ err: error }, "[Sentry] Not initialized, logging error:");
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
  if (!Sentry.getClient()) return;
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
  if (!Sentry.getClient()) return;
  Sentry.setUser({ id: user.id, email: user.email });
  if (user.role) {
    Sentry.setTag("user.role", user.role);
  }
}

// Re-export for direct access
export { Sentry };
export { wrapMcpServer } from "./mcp";
