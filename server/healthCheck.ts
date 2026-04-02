import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { getRedis } from "./rateLimiter";
import { getR2HealthStatus, checkR2Connectivity } from "./storage";
import { ENV } from "./_core/env";
import { captureServerException } from "./sentry";

export type ServiceStatus = "ok" | "error" | "unconfigured";

export type ServiceCheckResult = {
  status: ServiceStatus;
  responseTimeMs: number;
  error?: string;
};

export type HealthCheckResult = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
  uptime: number;
  services: Record<string, ServiceCheckResult>;
};

const CHECK_TIMEOUT_MS = 3000;
const PROBE_INTERVAL_MS = 30_000;

let cachedResult: HealthCheckResult | null = null;
let probeRunning = false;

async function withTimeout<T>(
  promise: Promise<T>,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} check timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS)
    ),
  ]);
}

async function checkService(
  name: string,
  fn: () => Promise<void>
): Promise<ServiceCheckResult> {
  const start = Date.now();
  try {
    await withTimeout(fn(), name);
    return { status: "ok", responseTimeMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      responseTimeMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkDatabase(): Promise<ServiceCheckResult> {
  return checkService("database", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");
    await db.execute(sql`SELECT 1`);
  });
}

async function checkRedis(): Promise<ServiceCheckResult> {
  if (!ENV.upstashRedisRestUrl || !ENV.upstashRedisRestToken) {
    return { status: "unconfigured", responseTimeMs: 0 };
  }
  return checkService("redis", async () => {
    const redis = getRedis();
    if (!redis) throw new Error("Redis client not available");
    await redis.ping();
  });
}

async function checkStripe(): Promise<ServiceCheckResult> {
  if (!ENV.stripeSecretKey) {
    return { status: "unconfigured", responseTimeMs: 0 };
  }
  return checkService("stripe", async () => {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      method: "GET",
      headers: { Authorization: `Bearer ${ENV.stripeSecretKey}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Stripe API returned ${res.status}`);
  });
}

async function checkResend(): Promise<ServiceCheckResult> {
  if (!ENV.resendApiKey) {
    return { status: "unconfigured", responseTimeMs: 0 };
  }
  return checkService("resend", async () => {
    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${ENV.resendApiKey}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Resend API returned ${res.status}`);
  });
}

async function checkAnthropic(): Promise<ServiceCheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { status: "unconfigured", responseTimeMs: 0 };
  }
  return checkService("anthropic", async () => {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
  });
}

async function checkPerplexity(): Promise<ServiceCheckResult> {
  if (!ENV.perplexityApiKey) {
    return { status: "unconfigured", responseTimeMs: 0 };
  }
  return checkService("perplexity", async () => {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.perplexityApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 429) throw new Error(`Perplexity API returned ${res.status}`);
  });
}

async function checkR2(): Promise<ServiceCheckResult> {
  if (!ENV.r2AccountId || !ENV.r2AccessKeyId || !ENV.r2SecretAccessKey || !ENV.r2BucketName) {
    return { status: "unconfigured", responseTimeMs: 0 };
  }
  return checkService("r2", async () => {
    await checkR2Connectivity();
    if (getR2HealthStatus() !== true) throw new Error("R2 connectivity check failed");
  });
}

const startedAt = Date.now();

function deriveStatus(services: Record<string, ServiceCheckResult>): HealthCheckResult["status"] {
  const db = services.database;
  const secondary = Object.entries(services).filter(([k]) => k !== "database").map(([, v]) => v);

  if (db.status === "error") return "unhealthy";
  if (secondary.some(s => s.status === "error")) return "degraded";
  return "healthy";
}

function getUptime(): number {
  return Math.floor((Date.now() - startedAt) / 1000);
}

async function executeFullChecks(): Promise<HealthCheckResult> {
  const [database, redis, stripe, resend, anthropic, perplexity, r2] =
    await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkStripe(),
      checkResend(),
      checkAnthropic(),
      checkPerplexity(),
      checkR2(),
    ]);

  const services: Record<string, ServiceCheckResult> = {
    database,
    redis,
    stripe,
    resend,
    anthropic,
    perplexity,
    r2,
  };

  return {
    status: deriveStatus(services),
    timestamp: Date.now(),
    uptime: getUptime(),
    services,
  };
}

async function runBackgroundProbe(): Promise<void> {
  if (probeRunning) return;
  probeRunning = true;
  try {
    cachedResult = await executeFullChecks();
  } catch (err) {
    console.error("[HealthCheck] Background probe failed:", err);
  } finally {
    probeRunning = false;
  }
}

export function startHealthProbe(): void {
  runBackgroundProbe().catch((err) => {
    console.error("[HealthProbe] Initial probe failed:", err);
    captureServerException(err, { tags: { component: "health_probe", error_type: "probe_failed" } });
  });
  setInterval(() => {
    runBackgroundProbe().catch((err) => {
      console.error("[HealthProbe] Background probe failed:", err);
      captureServerException(err, { tags: { component: "health_probe", error_type: "probe_failed" } });
    });
  }, PROBE_INTERVAL_MS);
}

export function getPublicHealth(): { status: HealthCheckResult["status"]; timestamp: number; uptime: number } {
  return {
    status: cachedResult ? cachedResult.status : "degraded",
    timestamp: Date.now(),
    uptime: getUptime(),
  };
}

export async function getDetailedHealth(): Promise<HealthCheckResult> {
  if (cachedResult) {
    return { ...cachedResult, timestamp: Date.now(), uptime: getUptime() };
  }
  const result = await executeFullChecks();
  cachedResult = result;
  return result;
}
