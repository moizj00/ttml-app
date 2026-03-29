import type { Express } from "express";

export function registerSentryDebugRoute(app: Express): void {
  if (process.env.NODE_ENV === "production") return;

  app.get("/api/debug-sentry", (_req, _res) => {
    throw new Error("My first Sentry error!");
  });
}
