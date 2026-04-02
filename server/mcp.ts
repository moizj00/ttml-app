import { wrapMcpServer as wrapMcpServerFromInstrument } from "./instrument";

/**
 * Wraps an MCP server with Sentry monitoring.
 * This is a thin wrapper around Sentry.wrapMcpServerWithSentry
 * exported from server/instrument.ts to provide a consistent 
 * entry point for MCP instrumentation in the project.
 * 
 * @param server The McpServer instance to wrap
 * @returns The wrapped McpServer instance
 */
export function wrapMcpServer<T>(server: T): T {
  return wrapMcpServerFromInstrument(server);
}
