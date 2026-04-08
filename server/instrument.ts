import * as Sentry from "@sentry/node";
import { logger } from "./logger";

// ─── DSN Configuration ───────────────────────────────────────────────────────
// The DSN is sourced from the SENTRY_DSN environment variable at runtime.
// The fallback constant below is the project DSN provided for MCP monitoring
// and is used only when the environment variable is not explicitly set.
const MCP_MONITORING_DSN =
  "https://5dae3a74cf1a8e3880f06d25e44047e5@o4511125171077120.ingest.us.sentry.io/4511125474574336";

const SENTRY_DSN = process.env.SENTRY_DSN || MCP_MONITORING_DSN;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ─── PII field names to scrub from request data ──────────────────────────────
const PII_FIELDS = new Set([
  "password", "newPassword", "currentPassword", "confirmPassword",
  "token", "accessToken", "refreshToken", "access_token", "refresh_token",
  "secret", "apiKey", "api_key",
  "ssn", "socialSecurityNumber",
  "creditCard", "cardNumber", "cvv", "cvc",
]);

/**
 * Recursively scrub PII fields from an object.
 * Returns a shallow copy with sensitive values replaced by "[REDACTED]".
 */
function scrubPii(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELDS.has(key)) {
      result[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = scrubPii(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: true,
    environment: IS_PRODUCTION ? "production" : "development",
    release: `ttml-server@${process.env.npm_package_version ?? "1.0.0"}`,
    // tracesSampleRate must be > 0 for MCP monitoring spans to be captured.
    // In production we keep full sampling so MCP tool calls are never dropped.
    tracesSampleRate: 1.0,
    integrations: [
      Sentry.expressIntegration(),
    ],
    beforeSend(event) {
      // ─── Header scrubbing ───
      if (event.request?.headers) {
        const headers = { ...event.request.headers };
        if (headers.authorization) headers.authorization = "[REDACTED]";
        if (headers.cookie) headers.cookie = "[REDACTED]";
        if (headers["x-forwarded-for"]) headers["x-forwarded-for"] = "[REDACTED]";
        event.request.headers = headers;
      }
      // ─── Request body scrubbing ───
      if (event.request?.data && typeof event.request.data === "object") {
        event.request.data = scrubPii(event.request.data as Record<string, unknown>);
      }
      // ─── Query string scrubbing ───
      if (event.request?.query_string) {
        const qs = event.request.query_string;
        if (typeof qs === "string") {
          // Redact token= and key= params from query strings
          event.request.query_string = qs
            .replace(/token=[^&]*/gi, "token=[REDACTED]")
            .replace(/key=[^&]*/gi, "key=[REDACTED]")
            .replace(/access_token=[^&]*/gi, "access_token=[REDACTED]");
        }
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

  logger.info("[Sentry] Instrumentation initialized via --import");
} else {
  logger.info("[Sentry] No DSN configured — monitoring disabled");
}

// ─── MCP Server Wrapper ───────────────────────────────────────────────────────
// Wraps any McpServer instance with Sentry so that all MCP tool calls,
// resource reads, and prompt invocations are automatically captured as spans.
// Usage:
//   import { wrapMcpServer } from "./instrument";
//   const server = wrapMcpServer(new McpServer({ name: "ttml", version: "1.0.0" }));
export function wrapMcpServer<T>(mcpServer: T): T {
  return Sentry.wrapMcpServerWithSentry(mcpServer as Parameters<typeof Sentry.wrapMcpServerWithSentry>[0]) as T;
}
