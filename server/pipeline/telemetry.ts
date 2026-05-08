/**
 * Pipeline Telemetry
 *
 * Tracks per-stage timing, success/failure rates, and provider performance.
 * Designed for admin dashboard consumption and operational alerting.
 *
 * Stored in-memory (lost on restart) — for persistent storage, export to
 * time-series DB or structured logs.
 */

import { createLogger } from "../logger";

const telLogger = createLogger({ module: "PipelineTelemetry" });

interface StageEvent {
  letterId: number;
  stage: string;
  status: "started" | "completed" | "failed";
  timestamp: number;
  durationMs?: number;
  provider?: string;
  errorCode?: string;
  letterType?: string;
}

interface ProviderMetric {
  provider: string;
  stage: string;
  calls: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
  avgDurationMs: number;
  p95DurationMs: number;
  lastCallAt: number;
}

// Ring buffers for recent events (keep last N)
const MAX_EVENTS = 1000;
const events: StageEvent[] = [];
const providerMetrics = new Map<string, ProviderMetric>();

function makeProviderKey(provider: string, stage: string): string {
  return `${provider}::${stage}`;
}

function getOrCreateMetric(provider: string, stage: string): ProviderMetric {
  const key = makeProviderKey(provider, stage);
  if (!providerMetrics.has(key)) {
    providerMetrics.set(key, {
      provider,
      stage,
      calls: 0,
      successes: 0,
      failures: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
      lastCallAt: 0,
    });
  }
  return providerMetrics.get(key)!;
}

/** Record a stage start event */
export function recordStageStart(
  letterId: number,
  stage: string,
  letterType?: string
): void {
  events.push({
    letterId,
    stage,
    status: "started",
    timestamp: Date.now(),
    letterType,
  });
  if (events.length > MAX_EVENTS) events.shift();
}

/** Record a stage completion event */
export function recordStageComplete(
  letterId: number,
  stage: string,
  durationMs: number,
  provider?: string,
  letterType?: string
): void {
  const now = Date.now();
  events.push({
    letterId,
    stage,
    status: "completed",
    timestamp: now,
    durationMs,
    provider,
    letterType,
  });
  if (events.length > MAX_EVENTS) events.shift();

  if (provider) {
    const metric = getOrCreateMetric(provider, stage);
    metric.calls++;
    metric.successes++;
    metric.totalDurationMs += durationMs;
    metric.avgDurationMs = Math.round(metric.totalDurationMs / metric.calls);
    metric.lastCallAt = now;

    // Update p95 with recent samples
    const recentDurations = getRecentDurations(provider, stage, 20);
    recentDurations.push(durationMs);
    recentDurations.sort((a, b) => a - b);
    const p95Idx = Math.floor(recentDurations.length * 0.95);
    metric.p95DurationMs = recentDurations[Math.min(p95Idx, recentDurations.length - 1)];
  }

  telLogger.info(
    `[Telemetry] Stage "${stage}" completed for letter #${letterId} ` +
      `in ${durationMs}ms (provider=${provider ?? "unknown"})`
  );
}

/** Record a stage failure event */
export function recordStageFail(
  letterId: number,
  stage: string,
  durationMs: number,
  errorCode?: string,
  provider?: string,
  letterType?: string
): void {
  const now = Date.now();
  events.push({
    letterId,
    stage,
    status: "failed",
    timestamp: now,
    durationMs,
    errorCode,
    provider,
    letterType,
  });
  if (events.length > MAX_EVENTS) events.shift();

  if (provider) {
    const metric = getOrCreateMetric(provider, stage);
    metric.calls++;
    metric.failures++;
    metric.totalDurationMs += durationMs;
    metric.avgDurationMs = Math.round(metric.totalDurationMs / metric.calls);
    metric.lastCallAt = now;
  }

  telLogger.warn(
    `[Telemetry] Stage "${stage}" FAILED for letter #${letterId} ` +
      `after ${durationMs}ms: ${errorCode ?? "unknown"}`
  );
}

function getRecentDurations(provider: string, stage: string, limit: number): number[] {
  return events
    .filter(
      e =>
        e.status === "completed" &&
        e.provider === provider &&
        e.stage === stage &&
        e.durationMs !== undefined
    )
    .slice(-limit)
    .map(e => e.durationMs!);
}

/** Get telemetry summary for admin dashboard */
export function getTelemetry(): {
  recentEvents: StageEvent[];
  providerMetrics: ProviderMetric[];
  summary: {
    totalLetters: number;
    totalFailures: number;
    successRate: number;
    avgPipelineDurationMs: number;
  };
} {
  const recentEvents = [...events].reverse();

  // Count unique letters
  const letterIds = new Set(events.map(e => e.letterId));
  const completedEvents = events.filter(e => e.status === "completed" && e.stage === "pipeline");
  const failedEvents = events.filter(e => e.status === "failed");

  const totalPipelineMs = completedEvents.reduce(
    (sum, e) => sum + (e.durationMs ?? 0),
    0
  );
  const avgPipelineMs = completedEvents.length > 0
    ? Math.round(totalPipelineMs / completedEvents.length)
    : 0;

  return {
    recentEvents,
    providerMetrics: Array.from(providerMetrics.values()),
    summary: {
      totalLetters: letterIds.size,
      totalFailures: failedEvents.length,
      successRate:
        completedEvents.length + failedEvents.length > 0
          ? Math.round(
              (completedEvents.length / (completedEvents.length + failedEvents.length)) * 1000
            ) / 10
          : 100,
      avgPipelineDurationMs: avgPipelineMs,
    },
  };
}

/** Time a stage and auto-record start/complete/fail */
export async function timedStage<T>(
  letterId: number,
  stage: string,
  provider: string,
  letterType: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  recordStageStart(letterId, stage, letterType);
  const start = Date.now();
  try {
    const result = await fn();
    recordStageComplete(letterId, stage, Date.now() - start, provider, letterType);
    return result;
  } catch (err) {
    recordStageFail(letterId, stage, Date.now() - start, undefined, provider, letterType);
    throw err;
  }
}
