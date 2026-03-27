import "dotenv/config";
// Sentry must be initialized before other imports
import { initServerSentry, Sentry } from "../sentry";
initServerSentry();

import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { sql } from "drizzle-orm";
import { registerSupabaseAuthRoutes } from "../supabaseAuth";
import { registerN8nCallbackRoute } from "../n8nCallback";
import { registerEmailPreviewRoute } from "../emailPreview";
import { registerDraftRemindersRoute } from "../draftReminders";
import { registerDraftPdfRoute } from "../draftPdfRoute";
import { registerBlogInternalRoutes } from "../blogInternalRoutes";
import { startCronScheduler } from "../cronScheduler";
import { stripeWebhookHandler } from "../stripeWebhook";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";
import {
  authRateLimitMiddleware,
  generalRateLimitMiddleware,
  getRedis,
} from "../rateLimiter";
import { validateRequiredEnv } from "./env";
import { checkR2Connectivity, getR2HealthStatus } from "../storage";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, "0.0.0.0");
  });
}

async function resolveListenPort(preferredPort: number): Promise<number> {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    return preferredPort;
  }

  if (await isPortAvailable(preferredPort)) {
    return preferredPort;
  }

  for (let port = preferredPort + 1; port < preferredPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      console.warn(
        `[Startup] Port ${preferredPort} is in use, falling back to ${port} for development`
      );
      return port;
    }
  }

  throw new Error(
    `No available development port found between ${preferredPort} and ${preferredPort + 19}`
  );
}

async function startServer() {
  // Fail fast in production if required secrets are missing
  if (process.env.NODE_ENV === "production") {
    validateRequiredEnv();
  }

  const app = express();
  // CRITICAL: Trust Railway's proxy to correctly identify HTTPS protocol (X-Forwarded-Proto).
  // This is required for secure cookie handling and protocol detection.
  app.set("trust proxy", 1);
  const server = createServer(app);

  // ─── CORS ────────────────────────────────────────────────────────────────────
  // Allowed origins: production domains + any Railway-generated *.railway.app domain
  // + any Replit *.replit.dev domain.
  // Additional origins can be added via CORS_ALLOWED_ORIGINS (comma-separated env var).
  const STATIC_ALLOWED_ORIGINS = new Set([
    "https://www.talk-to-my-lawyer.com",
    "https://talk-to-my-lawyer.com",
  ]);

  // Extra origins from env (e.g. Railway preview URLs)
  const extraOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);
  for (const o of extraOrigins) STATIC_ALLOWED_ORIGINS.add(o);

  // Add Replit dev domain if available
  const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDevDomain) {
    STATIC_ALLOWED_ORIGINS.add(`https://${replitDevDomain}`);
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isDev = process.env.NODE_ENV !== "production";
    const localhostOrigin =
      origin && /^https?:\/\/localhost(:\d+)?$/.test(origin);
    // Allow any *.railway.app origin (Railway preview deployments)
    const railwayOrigin =
      origin && /^https:\/\/[a-z0-9-]+\.railway\.app$/.test(origin);
    // Allow any *.replit.dev origin (Replit preview deployments)
    const replitOrigin =
      origin && /^https:\/\/[a-z0-9-]+\.replit\.dev$/.test(origin);

    if (
      origin &&
      (STATIC_ALLOWED_ORIGINS.has(origin) ||
        (isDev && localhostOrigin) ||
        railwayOrigin ||
        replitOrigin)
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Client-Info, Apikey, x-trpc-source"
    );
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // ─── Security Headers ─────────────────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains"
      );
    }
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "0");
    const isDev = process.env.NODE_ENV !== "production";
    if (!isDev) {
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self' https://js.stripe.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "img-src 'self' data: https: blob:",
          "font-src 'self' data: https://fonts.gstatic.com",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
          "frame-src https://js.stripe.com https://hooks.stripe.com",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; ")
      );
    }
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    );
    next();
  });
  // ──────────────────────────────────────────────────────────────────────────

  // ─── Standalone health check (plain HTTP GET, no tRPC overhead) ───────────
  // Used by Railway health checks and load balancers.
  // Checks DB connectivity; returns 503 if DB is unreachable.
  app.get("/api/health", async (_req, res) => {
    let dbOk = false;
    try {
      const db = await getDb();
      if (db) {
        await db.execute(sql`SELECT 1`);
        dbOk = true;
      }
    } catch {
      dbOk = false;
    }

    let redisOk: boolean | null = null;
    const redis = getRedis();
    if (redis) {
      try {
        await redis.ping();
        redisOk = true;
      } catch {
        redisOk = false;
      }
    }

    const r2Ok = getR2HealthStatus();

    const ok = dbOk && (redisOk === null || redisOk);
    const status = ok ? 200 : 503;
    res.status(status).json({ ok, db: dbOk, redis: redisOk, r2: r2Ok, timestamp: Date.now() });
  });
  // ──────────────────────────────────────────────────────────────────────────

  // ⚠️ Stripe webhook MUST be registered BEFORE express.json() to get raw body
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    stripeWebhookHandler
  );
  // Body parser — 12 MB cap: 7.5 MB actual file base64-encodes to ~10 MB, plus JSON envelope overhead
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ limit: "12mb", extended: true }));

  // ─── Rate Limiting ──────────────────────────────────────────────────────────
  app.use("/api/auth/login", authRateLimitMiddleware);
  app.use("/api/auth/signup", authRateLimitMiddleware);
  app.use("/api/auth/forgot-password", authRateLimitMiddleware);
  app.use("/api/trpc", generalRateLimitMiddleware);
  // ───────────────────────────────────────────────────────────────────────────

  registerSupabaseAuthRoutes(app);
  registerN8nCallbackRoute(app);
  registerEmailPreviewRoute(app);
  registerDraftRemindersRoute(app);
  registerDraftPdfRoute(app);
  registerBlogInternalRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ─── Sentry Express error handler (must be before other error handlers) ───
  Sentry.setupExpressErrorHandler(app);

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await resolveListenPort(preferredPort);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Warm up DB connection on startup so first request doesn't timeout
    getDb()
      .then(() => console.log("[Startup] Database connection warmed up"))
      .catch(() => {});
    // Start in-process cron scheduler (draft reminders, etc.)
    startCronScheduler();
    // Check Cloudflare R2 connectivity
    checkR2Connectivity().catch(() => {});
  });
}

startServer().catch(console.error);
