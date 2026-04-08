import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    base: {
      service: "ttml-api",
      env: process.env.NODE_ENV ?? "development",
    },
    redact: ["req.headers.authorization", "req.headers.cookie"],
  },
  isDev
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname,service,env",
        },
      })
    : undefined
);

/**
 * Create a child logger with bound context fields.
 * Preserves the [Module] prefix convention as a structured `module` field.
 */
export function createLogger(context: {
  module: string;
  userId?: number | string;
  letterId?: number | string;
  requestId?: string;
  [key: string]: unknown;
}) {
  return logger.child(context);
}

export type Logger = typeof logger;
