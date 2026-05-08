import os from "node:os";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { getRedis } from "./rateLimiter";
import { getR2HealthStatus, checkR2Connectivity } from "./storage";
import { ENV } from "./_core/env";
import { captureServerException } from "./sentry";
import { logger } from "./logger";
import { getBoss, QUEUE_NAME, isQueueConnectionConfigured } from "./queue";

export type ServiceStatus = "ok" | "error" | "unconfigured";

export type ServiceCheckResult = {
  status: ServiceStatus;
  responseTimeMs: number;
  error?: string;
};

export type ResourceMetrics = {
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  uptimeSeconds: number;
};

export type HealthCheckResult = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
  uptime: number;
  services: Record<string, ServiceCheckResult>;
  resources: ResourceMetrics;
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

async function checkOpenAI(): Promise<ServiceCheckResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: "unconfigured", responseTimeMs: 0 };
  }
  return checkService("openai", async () => {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 429) throw new Error(`OpenAI API returned ${res.status}`);
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

async function checkQueue(): Promise<ServiceCheckResult> {
  if (!isQueueConnectionConfigured()) {
    return { status: "unconfigured", responseTimeMs: 0 };
  }
  return checkService("queue", async () => {
    const boss = await getBoss();
    const stats = await boss.getQueueStats(QUEUE_NAME);
    const queuedCount = (stats?.queuedCount ?? 0) + (stats?.deferredCount ?? 0);
    const activeCount = stats?.activeCount ?? 0;
    if (queuedCount > 50) {
      throw new Error(`${queuedCount} jobs queued, ${activeCount} active — backlog critical`);
    }
  });
}

const startedAt = Date.now();

function deriveStatus(
  services: Record<string, ServiceCheckResult>,
  resources: ResourceMetrics
): HealthCheckResult["status"] {
  const db = services.database;
  const secondary = Object.entries(services).filter(([k]) => k !== "database").map(([, v]) => v);

  if (db.status === "error") return "unhealthy";
  if (secondary.some(s => s.status === "error")) return "degraded";
  // Degrade if resource pressure is high (single-container mode contention)
  if (resources.memoryUsagePercent > 85) return "degraded";
  if (resources.cpuUsagePercent > 90) return "degraded";
  return "healthy";
}

function getUptime(): number {
  return Math.floor((Date.now() - startedAt) / 1000);
}

function getResourceMetrics(): ResourceMetrics {
  const memTotal = os.totalmem();
  const memUsed = process.memoryUsage().rss;
  const cpuUsage = process.cpuUsage();
  const uptime = process.uptime();
  // CPU percentage: user + system time divided by elapsed wall-clock time
  // normalized to percentage of a single core
  const cpuPercent = uptime > 0
    ? ((cpuUsage.user + cpuUsage.system) / 1e6 / uptime) * 100
    : 0;

  return {
    cpuUsagePercent: Math.round(cpuPercent * 10) / 10,
    memoryUsagePercent: Math.round((memUsed / memTotal) * 1000) / 10,
    memoryUsedMB: Math.round(memUsed / 1024 / 1024),
    memoryTotalMB: Math.round(memTotal / 1024 / 1024),
    uptimeSeconds: Math.round(uptime),
  };
}

async function executeFullChecks(): Promise<HealthCheckResult> {
  const [database, redis, stripe, resend, anthropic, openai, r2, queue] =
    await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkStripe(),
      checkResend(),
      checkAnthropic(),
      checkOpenAI(),
      checkR2(),
      checkQueue(),
    ]);

  const services: Record<string, ServiceCheckResult> = {
    database,
    redis,
    stripe,
    resend,
    anthropic,
    openai,
    r2,
    queue,
  };

  const resources = getResourceMetrics();

  return {
    status: deriveStatus(services, resources),
    timestamp: Date.now(),
    uptime: getUptime(),
    services,
    resources,
  };
}

async function runBackgroundProbe(): Promise<void> {
  if (probeRunning) return;
  probeRunning = true;
  try {
    cachedResult = await executeFullChecks();
    if (cachedResult.status !== "healthy") {
      const failing = Object.entries(cachedResult.services)
        .filter(([, v]) => v.status === "error")
        .map(([k, v]) => `${k}: ${v.error} (${v.responseTimeMs}ms)`);
      logger.warn({ status: cachedResult.status, failing }, "[HealthCheck] Non-healthy status detected");
    }
  } catch (err) {
    logger.error({ err: err }, "[HealthCheck] Background probe failed:");
  } finally {
    probeRunning = false;
  }
}

export function startHealthProbe(): void {
  runBackgroundProbe().catch((err) => {
    logger.error({ err: err }, "[HealthProbe] Initial probe failed:");
    captureServerException(err, { tags: { component: "health_probe", error_type: "probe_failed" } });
  });
  setInterval(() => {
    runBackgroundProbe().catch((err) => {
      logger.error({ err: err }, "[HealthProbe] Background probe failed:");
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
