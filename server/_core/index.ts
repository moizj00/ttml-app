import "dotenv/config";

// Force IPv4 DNS resolution — Railway's network cannot reach Supabase's
// shared pooler via IPv6 (ENETUNREACH). This must be set before any
// database connections are established.
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

// Sentry must be initialized before other imports
import { initServerSentry, Sentry, captureServerException } from "../sentry";
initServerSentry();

import { logger } from "../logger";

process.on("unhandledRejection", (reason) => {
  logger.error({ module: "Process", reason }, "[Process] Unhandled promise rejection");
  captureServerException(reason instanceof Error ? reason : new Error(String(reason)), {
    tags: { component: "process", error_type: "unhandled_rejection" },
  });
  // Flush Sentry and exit — unhandled rejections are programmer errors
  Sentry.close(2000).finally(() => {
    process.exit(1);
  });
});

process.on("uncaughtException", (err) => {
  logger.error({ module: "Process", err }, "[Process] Uncaught exception");
  captureServerException(err, {
    tags: { component: "process", error_type: "uncaught_exception" },
  });
  // Flush Sentry before exiting so the exception is captured
  Sentry.close(2000).finally(() => {
    process.exit(1);
  });
});

import express from "express";
import { createServer } from "http";
import net from "net";
import crypto from "crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { registerSupabaseAuthRoutes, authenticateRequest } from "../supabaseAuth";
import { registerN8nCallbackRoute } from "../n8nCallback";
import { registerEmailPreviewRoute } from "../emailPreview";
import { registerDraftRemindersRoute } from "../draftReminders";
import { registerPaywallEmailRoute } from "../paywallEmailCron";
import { registerDraftPdfRoute } from "../draftPdfRoute";
import { registerBlogInternalRoutes } from "../blogInternalRoutes";
import { registerSitemapRoute } from "../sitemapRoute";
import { registerNewsletterRoute } from "../newsletterRoute";
import { registerConfigRoute } from "../configRoute";
import { registerSentryDebugRoute } from "../sentryDebugRoute";
import { startCronScheduler } from "../cronScheduler";
import { stripeWebhookHandler } from "../stripeWebhook";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";
import {
  authRateLimitMiddleware,
  generalRateLimitMiddleware,
} from "../rateLimiter";
import { validateRequiredEnv } from "./env";
import { checkR2Connectivity } from "../storage";
import { startHealthProbe, getPublicHealth, getDetailedHealth } from "../healthCheck";
import { getBoss } from "../queue";

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
      logger.warn(
        { module: "Startup", preferredPort, fallbackPort: port },
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
  // Warn early if supabaseAnonKey is missing — an empty key causes the PKCE
  // token exchange in GET /api/auth/callback to fail with a 500, surfacing as
  // "A server error interrupted Google sign-in" on the client.
  // VITE_SUPABASE_ANON_KEY is a Vite build-time var baked into the frontend
  // bundle; it is NOT available as a server runtime env var on Railway.
  // The canonical server-side var is SUPABASE_ANON_KEY.
  const _anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "";
  if (!_anonKey) {
    logger.warn(
      { module: "Startup" },
      "[Startup] SUPABASE_ANON_KEY is not set. Google OAuth PKCE token exchange will fail. " +
      "Set SUPABASE_ANON_KEY in Railway environment variables."
    );
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
        railwayOrigin || // Allow Railway preview deployments in all environments (staging/testing)
        (isDev && replitOrigin))
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

  // ─── Request Logging Middleware ────────────────────────────────────────────
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    const reqLogger = logger.child({ module: "HTTP", requestId, method: req.method, url: req.url });
    (req as any).log = reqLogger;
    (req as any).requestId = requestId;
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      reqLogger[level]({ statusCode: res.statusCode, duration }, `${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    });
    next();
  });
  // ──────────────────────────────────────────────────────────────────────────

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
          "script-src 'self' https://js.stripe.com https://static.cloudflareinsights.com https://maps.googleapis.com https://maps.gstatic.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://maps.googleapis.com",
          "img-src 'self' data: https: blob:",
          "font-src 'self' data: https://fonts.gstatic.com",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://maps.googleapis.com https://places.googleapis.com",
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

  // ─── Health check endpoints (plain HTTP GET, no tRPC overhead) ────────────
  // GET /health — public, used by Railway health checks and load balancers.
  // Returns overall status derived from all dependencies (DB, Redis, Stripe,
  // Resend, Anthropic, Perplexity, R2) via a background probe that runs
  // every 30s. Synchronous — no external API calls on each request.
  const healthHandler: express.RequestHandler = (_req, res) => {
    const result = getPublicHealth();
    const httpStatus = result.status === "unhealthy" ? 503 : 200;
    res.status(httpStatus).json(result);
  };
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  // GET /health/details — admin-only, returns per-service breakdown
  // with response times. Background probe refreshes every 30s.
  const healthDetailsHandler: express.RequestHandler = async (req, res) => {
    try {
      const user = await authenticateRequest(req);
      if (!user || user.role !== "admin") {
        res.status(user ? 403 : 401).json({ error: "Admin authentication required" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }

    const result = await getDetailedHealth();
    const httpStatus = result.status === "unhealthy" ? 503 : 200;
    res.status(httpStatus).json(result);
  };
  app.get("/health/details", healthDetailsHandler);
  app.get("/api/health/details", healthDetailsHandler);
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
  registerPaywallEmailRoute(app);
  registerDraftPdfRoute(app);
  registerBlogInternalRoutes(app);
  registerSitemapRoute(app);
  registerNewsletterRoute(app);
  registerConfigRoute(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  registerSentryDebugRoute(app);

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

  // Run DB connection and startup migrations before accepting traffic.
  // If migrations fail fatally the thrown error propagates through startServer()
  // which is caught by the top-level .catch(console.error) — the process exits
  // and the server never starts listening.
  await getDb();
  logger.info({ module: "Startup" }, "[Startup] Database connection and startup migrations complete");

  // Warm up pg-boss so the first letter submission doesn't cold-start it
  // under a live HTTP request (which can time out). Non-fatal — if it fails,
  // the queue will cold-start on first use and the error is already logged.
  getBoss().then(() => {
    logger.info({ module: "Startup" }, "[Startup] pg-boss queue connection warmed up");
  }).catch((err) => {
    logger.error({ module: "Startup", err }, "[Startup] pg-boss warmup failed — queue will cold-start on first use");
    captureServerException(err, { tags: { component: "startup", error_type: "pgboss_warmup_failed" } });
  });

  server.listen(port, () => {
    logger.info({ module: "Startup", port }, `Server running on http://localhost:${port}/`);
    // Start in-process cron scheduler (draft reminders, etc.)
    startCronScheduler();
    // Check Cloudflare R2 connectivity
    checkR2Connectivity().catch((err) => {
      logger.error({ module: "Startup", err }, "[Startup] R2 connectivity check failed");
      captureServerException(err, { tags: { component: "startup", error_type: "r2_connectivity_failed" } });
    });
    // Start background health probe (checks all dependencies every 30s)
    startHealthProbe();
  });
}

startServer().catch((err) => {
  logger.error({ module: "Fatal", err }, "[Fatal] Server failed to start");
  process.exit(1);
});
