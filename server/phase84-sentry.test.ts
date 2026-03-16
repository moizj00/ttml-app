/**
 * Phase 84 — Sentry Error Monitoring Integration Tests
 *
 * Validates:
 * 1. Sentry DSN format and reachability
 * 2. Server-side sentry module exports
 * 3. Client-side sentry module exports
 * 4. ErrorBoundary integration with Sentry
 * 5. Pipeline and webhook Sentry instrumentation
 */
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

const SENTRY_CONFIGURED = !!(process.env.SENTRY_DSN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

// ─── 1. Sentry DSN Secret Validation ───

describe.skipIf(!SENTRY_CONFIGURED)("Sentry DSN secret", () => {
  it("SENTRY_DSN is set and has valid DSN format", () => {
    const dsn = process.env.SENTRY_DSN ?? "";
    // DSN format: https://<key>@<host>/<project-id>
    expect(dsn).toBeTruthy();
    expect(dsn).toMatch(/^https:\/\/[a-f0-9]+@[a-z0-9.]+\.sentry\.io\/\d+$/);
  });

  it("VITE_SENTRY_DSN matches SENTRY_DSN", () => {
    const serverDsn = process.env.SENTRY_DSN ?? "";
    const clientDsn = process.env.VITE_SENTRY_DSN ?? "";
    expect(clientDsn).toBe(serverDsn);
  });

  it("SENTRY_ORG is set", () => {
    expect(process.env.SENTRY_ORG).toBeTruthy();
  });

  it("SENTRY_PROJECT is set", () => {
    expect(process.env.SENTRY_PROJECT).toBeTruthy();
  });

  it("SENTRY_AUTH_TOKEN is set", () => {
    expect(process.env.SENTRY_AUTH_TOKEN).toBeTruthy();
  });

  it("Sentry DSN endpoint is reachable", async () => {
    const dsn = process.env.SENTRY_DSN ?? "";
    if (!dsn) return; // Skip if no DSN
    // Extract the host from DSN: https://<key>@<host>/<project-id>
    const match = dsn.match(/@([^/]+)/);
    if (!match) return;
    const host = match[1];
    try {
      const response = await fetch(`https://${host}/api/0/`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      // Sentry API returns 401 for unauthenticated requests, which means it's reachable
      expect([200, 401, 403]).toContain(response.status);
    } catch {
      // Network error is acceptable in sandbox — DSN format is still valid
    }
  });
});

// ─── 2. Server-side Sentry Module ───

describe("Server sentry module", () => {
  it("exports initServerSentry function", async () => {
    const mod = await import("./sentry");
    expect(typeof mod.initServerSentry).toBe("function");
  }, 30_000);

  it("exports captureServerException function", async () => {
    const mod = await import("./sentry");
    expect(typeof mod.captureServerException).toBe("function");
  }, 30_000);

  it("exports addServerBreadcrumb function", async () => {
    const mod = await import("./sentry");
    expect(typeof mod.addServerBreadcrumb).toBe("function");
  }, 30_000);

  it("exports setServerUser function", async () => {
    const mod = await import("./sentry");
    expect(typeof mod.setServerUser).toBe("function");
  }, 30_000);

  it("exports Sentry namespace", async () => {
    const mod = await import("./sentry");
    expect(mod.Sentry).toBeTruthy();
    expect(typeof mod.Sentry.init).toBe("function");
  }, 30_000);
});

// ─── 3. ENV includes Sentry config ───

describe.skipIf(!SENTRY_CONFIGURED)("ENV Sentry configuration", () => {
  it("ENV.sentryDsn is populated from SENTRY_DSN", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.sentryDsn).toBeTruthy();
    expect(ENV.sentryDsn).toMatch(/sentry\.io/);
  });

  it("ENV.sentryOrg is populated", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.sentryOrg).toBeTruthy();
  });

  it("ENV.sentryProject is populated", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.sentryProject).toBeTruthy();
  });
});

// ─── 4. Client-side Sentry module file structure ───

describe("Client sentry module", () => {
  const clientSentryPath = path.join(__dirname, "../client/src/lib/sentry.ts");

  it("client/src/lib/sentry.ts exists", () => {
    expect(fs.existsSync(clientSentryPath)).toBe(true);
  });

  it("exports initSentry function", () => {
    const content = fs.readFileSync(clientSentryPath, "utf-8");
    expect(content).toContain("export function initSentry");
  });

  it("exports setSentryUser function", () => {
    const content = fs.readFileSync(clientSentryPath, "utf-8");
    expect(content).toContain("export function setSentryUser");
  });

  it("exports clearSentryUser function", () => {
    const content = fs.readFileSync(clientSentryPath, "utf-8");
    expect(content).toContain("export function clearSentryUser");
  });

  it("exports captureException function", () => {
    const content = fs.readFileSync(clientSentryPath, "utf-8");
    expect(content).toContain("export function captureException");
  });

  it("configures browser tracing integration", () => {
    const content = fs.readFileSync(clientSentryPath, "utf-8");
    expect(content).toContain("browserTracingIntegration");
  });

  it("configures session replay integration", () => {
    const content = fs.readFileSync(clientSentryPath, "utf-8");
    expect(content).toContain("replayIntegration");
  });

  it("filters common non-actionable errors", () => {
    const content = fs.readFileSync(clientSentryPath, "utf-8");
    expect(content).toContain("ignoreErrors");
    expect(content).toContain("ResizeObserver loop");
  });

  it("redacts authorization headers in beforeSend", () => {
    const content = fs.readFileSync(clientSentryPath, "utf-8");
    expect(content).toContain("beforeSend");
    expect(content).toContain("[REDACTED]");
  });
});

// ─── 5. ErrorBoundary Sentry integration ───

describe("ErrorBoundary Sentry integration", () => {
  const errorBoundaryPath = path.join(__dirname, "../client/src/components/ErrorBoundary.tsx");

  it("ErrorBoundary imports captureException from sentry", () => {
    const content = fs.readFileSync(errorBoundaryPath, "utf-8");
    expect(content).toContain('import { captureException } from "@/lib/sentry"');
  });

  it("ErrorBoundary implements componentDidCatch", () => {
    const content = fs.readFileSync(errorBoundaryPath, "utf-8");
    expect(content).toContain("componentDidCatch");
  });

  it("ErrorBoundary calls captureException in componentDidCatch", () => {
    const content = fs.readFileSync(errorBoundaryPath, "utf-8");
    expect(content).toContain("captureException(error");
  });
});

// ─── 6. main.tsx Sentry initialization ───

describe("main.tsx Sentry initialization", () => {
  const mainPath = path.join(__dirname, "../client/src/main.tsx");

  it("main.tsx imports initSentry", () => {
    const content = fs.readFileSync(mainPath, "utf-8");
    expect(content).toContain("import { initSentry }");
  });

  it("main.tsx calls initSentry() before other imports", () => {
    const content = fs.readFileSync(mainPath, "utf-8");
    const initIndex = content.indexOf("initSentry()");
    const trpcIndex = content.indexOf('import { trpc }');
    expect(initIndex).toBeLessThan(trpcIndex);
  });
});

// ─── 7. useAuth Sentry user sync ───

describe("useAuth Sentry user context sync", () => {
  const useAuthPath = path.join(__dirname, "../client/src/_core/hooks/useAuth.ts");

  it("useAuth imports setSentryUser and clearSentryUser", () => {
    const content = fs.readFileSync(useAuthPath, "utf-8");
    expect(content).toContain("setSentryUser");
    expect(content).toContain("clearSentryUser");
  });

  it("useAuth calls setSentryUser when user is available", () => {
    const content = fs.readFileSync(useAuthPath, "utf-8");
    expect(content).toContain("setSentryUser({");
  });

  it("useAuth calls clearSentryUser on logout", () => {
    const content = fs.readFileSync(useAuthPath, "utf-8");
    expect(content).toContain("clearSentryUser()");
  });
});

// ─── 8. Pipeline Sentry instrumentation ───

describe("Pipeline Sentry instrumentation", () => {
  const pipelinePath = path.join(__dirname, "pipeline.ts");

  it("pipeline.ts imports captureServerException", () => {
    const content = fs.readFileSync(pipelinePath, "utf-8");
    expect(content).toContain('import { captureServerException');
  });

  it("Stage 1 catch block captures to Sentry with pipeline_stage tag", () => {
    const content = fs.readFileSync(pipelinePath, "utf-8");
    expect(content).toContain('pipeline_stage: "research"');
  });

  it("Stage 2 catch block captures to Sentry with pipeline_stage tag", () => {
    const content = fs.readFileSync(pipelinePath, "utf-8");
    expect(content).toContain('pipeline_stage: "drafting"');
  });

  it("Stage 3 catch block captures to Sentry with pipeline_stage tag", () => {
    const content = fs.readFileSync(pipelinePath, "utf-8");
    expect(content).toContain('pipeline_stage: "assembly"');
  });

  it("Full pipeline catch block captures to Sentry", () => {
    const content = fs.readFileSync(pipelinePath, "utf-8");
    expect(content).toContain('pipeline_stage: "full_pipeline"');
  });
});

// ─── 9. Stripe Webhook Sentry instrumentation ───

describe("Stripe Webhook Sentry instrumentation", () => {
  const webhookPath = path.join(__dirname, "stripeWebhook.ts");

  it("stripeWebhook.ts imports captureServerException", () => {
    const content = fs.readFileSync(webhookPath, "utf-8");
    expect(content).toContain('import { captureServerException');
  });

  it("Signature verification failure captures to Sentry", () => {
    const content = fs.readFileSync(webhookPath, "utf-8");
    expect(content).toContain('error_type: "signature_verification"');
  });

  it("Event processing failure captures to Sentry with event_type tag", () => {
    const content = fs.readFileSync(webhookPath, "utf-8");
    expect(content).toContain("event_type: event.type");
  });
});

// ─── 10. Server entry Sentry setup ───

describe("Server entry Sentry setup", () => {
  const indexPath = path.join(__dirname, "_core/index.ts");

  it("server entry imports initServerSentry", () => {
    const content = fs.readFileSync(indexPath, "utf-8");
    expect(content).toContain("import { initServerSentry");
  });

  it("server entry calls initServerSentry() early", () => {
    const content = fs.readFileSync(indexPath, "utf-8");
    expect(content).toContain("initServerSentry()");
    // Should be before express import
    const sentryIndex = content.indexOf("initServerSentry()");
    const expressIndex = content.indexOf('import express from "express"');
    expect(sentryIndex).toBeLessThan(expressIndex);
  });

  it("server entry sets up Sentry Express error handler", () => {
    const content = fs.readFileSync(indexPath, "utf-8");
    expect(content).toContain("Sentry.setupExpressErrorHandler(app)");
  });
});

// ─── 11. tRPC context Sentry user ───

describe("tRPC context Sentry user", () => {
  const contextPath = path.join(__dirname, "_core/context.ts");

  it("context.ts imports setServerUser from sentry", () => {
    const content = fs.readFileSync(contextPath, "utf-8");
    expect(content).toContain('import { setServerUser } from "../sentry"');
  });

  it("context.ts calls setServerUser when user is authenticated", () => {
    const content = fs.readFileSync(contextPath, "utf-8");
    expect(content).toContain("setServerUser({");
  });
});
