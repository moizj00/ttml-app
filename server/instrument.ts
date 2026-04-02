import * as Sentry from "@sentry/node";

// ─── DSN Configuration ───────────────────────────────────────────────────────
// The DSN is sourced from the SENTRY_DSN environment variable at runtime.
// The fallback constant below is the project DSN provided for MCP monitoring
// and is used only when the environment variable is not explicitly set.
const MCP_MONITORING_DSN =
  "https://5dae3a74cf1a8e3880f06d25e44047e5@o4511125171077120.ingest.us.sentry.io/4511125474574336";

const SENTRY_DSN = process.env.SENTRY_DSN || MCP_MONITORING_DSN;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

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

// ─── MCP Server Wrapper ───────────────────────────────────────────────────────
// Wraps any McpServer instance with Sentry so that all MCP tool calls,
// resource reads, and prompt invocations are automatically captured as spans.
// Usage:
//   import { wrapMcpServer } from "./instrument";
//   const server = wrapMcpServer(new McpServer({ name: "ttml", version: "1.0.0" }));
export function wrapMcpServer<T>(mcpServer: T): T {
  return Sentry.wrapMcpServerWithSentry(mcpServer as Parameters<typeof Sentry.wrapMcpServerWithSentry>[0]) as T;
}
