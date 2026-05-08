/**
 * Worker Memory Monitor
 *
 * Tracks RSS over time and detects memory growth patterns that indicate leaks.
 * Runs inside the worker process, logs snapshots, and triggers alerts on
 * abnormal growth.
 *
 * New env vars:
 *   MEMORY_ALERT_THRESHOLD_PCT - growth % to trigger alert (default: 50)
 *   MEMORY_ALERT_WINDOW_MS     - window for growth measurement (default: 3600000 = 1h)
 *   MEMORY_CHECK_INTERVAL_MS   - snapshot interval (default: 300000 = 5min)
 *   MEMORY_FORCE_RESTART_PCT   - RSS% that triggers graceful restart (default: 90)
 */

import os from "node:os";
import { createLogger } from "./logger";
import { captureServerException } from "./sentry";

const memLogger = createLogger({ module: "MemoryMonitor" });

const ALERT_THRESHOLD_PCT = parseInt(
  process.env.MEMORY_ALERT_THRESHOLD_PCT ?? "50",
  10
);
const ALERT_WINDOW_MS = parseInt(
  process.env.MEMORY_ALERT_WINDOW_MS ?? "3600000",
  10
); // 1 hour
const CHECK_INTERVAL_MS = parseInt(
  process.env.MEMORY_CHECK_INTERVAL_MS ?? "300000",
  10
); // 5 min
const FORCE_RESTART_PCT = parseInt(
  process.env.MEMORY_FORCE_RESTART_PCT ?? "90",
  10
);

interface MemorySnapshot {
  timestamp: number;
  rssMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  systemTotalMB: number;
  usagePercent: number;
}

const snapshots: MemorySnapshot[] = [];
let checkInterval: ReturnType<typeof setInterval> | null = null;

function takeSnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  const systemTotal = os.totalmem();
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const snapshot: MemorySnapshot = {
    timestamp: Date.now(),
    rssMB,
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    arrayBuffersMB: Math.round((mem.arrayBuffers ?? 0) / 1024 / 1024),
    systemTotalMB: Math.round(systemTotal / 1024 / 1024),
    usagePercent: Math.round((mem.rss / systemTotal) * 1000) / 10,
  };
  return snapshot;
}

function pruneOldSnapshots(): void {
  const cutoff = Date.now() - ALERT_WINDOW_MS;
  while (snapshots.length > 0 && snapshots[0].timestamp < cutoff) {
    snapshots.shift();
  }
}

function checkForLeak(current: MemorySnapshot): void {
  pruneOldSnapshots();

  if (snapshots.length < 2) return;

  // Find the oldest snapshot within the window
  const baseline = snapshots[0];
  const growthPct = ((current.rssMB - baseline.rssMB) / baseline.rssMB) * 100;

  if (growthPct >= ALERT_THRESHOLD_PCT) {
    memLogger.error(
      `[MemoryMonitor] LEAK DETECTED: RSS grew ${growthPct.toFixed(1)}% ` +
        `(${baseline.rssMB}MB → ${current.rssMB}MB) over ${ALERT_WINDOW_MS / 60000}min. ` +
        `Threshold: ${ALERT_THRESHOLD_PCT}%`
    );
    captureServerException(
      new Error(
        `Memory leak: RSS grew ${growthPct.toFixed(1)}% ` +
          `(${baseline.rssMB}MB → ${current.rssMB}MB)`
      ),
      {
        tags: { component: "memory-monitor", alert: "leak_detected" },
        extra: {
          growthPct: Math.round(growthPct * 10) / 10,
          baselineMB: baseline.rssMB,
          currentMB: current.rssMB,
          windowMs: ALERT_WINDOW_MS,
        },
      }
    );
  }

  // Force restart if memory exceeds critical threshold
  if (current.usagePercent >= FORCE_RESTART_PCT) {
    memLogger.error(
      `[MemoryMonitor] CRITICAL: RSS ${current.usagePercent}% of system memory. ` +
        `Triggering graceful restart (threshold: ${FORCE_RESTART_PCT}%)`
    );
    captureServerException(
      new Error(
        `Memory critical: RSS ${current.usagePercent}% of system — forcing restart`
      ),
      {
        tags: { component: "memory-monitor", alert: "critical_restart" },
        extra: {
          rssMB: current.rssMB,
          systemTotalMB: current.systemTotalMB,
          usagePercent: current.usagePercent,
        },
      }
    );
    // Graceful restart: worker will exit, Railway/supervisor will restart
    setTimeout(() => process.exit(1), 5000);
  }
}

/** Start periodic memory monitoring */
export function startMemoryMonitor(): void {
  if (checkInterval) return; // Already running

  memLogger.info(
    `[MemoryMonitor] Started (interval=${CHECK_INTERVAL_MS}ms, ` +
      `alertThreshold=${ALERT_THRESHOLD_PCT}%, window=${ALERT_WINDOW_MS}ms, ` +
      `forceRestart=${FORCE_RESTART_PCT}%)`
  );

  // Take initial snapshot
  snapshots.push(takeSnapshot());

  checkInterval = setInterval(() => {
    const snapshot = takeSnapshot();
    snapshots.push(snapshot);

    memLogger.info(
      `[MemoryMonitor] RSS=${snapshot.rssMB}MB ` +
        `heap=${snapshot.heapUsedMB}/${snapshot.heapTotalMB}MB ` +
        `external=${snapshot.externalMB}MB ` +
        `usage=${snapshot.usagePercent}% ` +
        `snaps=${snapshots.length}`
    );

    checkForLeak(snapshot);
  }, CHECK_INTERVAL_MS);
}

/** Stop memory monitoring */
export function stopMemoryMonitor(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    memLogger.info("[MemoryMonitor] Stopped");
  }
}

/** Get memory history for admin dashboard */
export function getMemoryHistory(): {
  snapshots: MemorySnapshot[];
  alertThresholdPct: number;
  forceRestartPct: number;
  windowMs: number;
} {
  pruneOldSnapshots();
  return {
    snapshots: [...snapshots],
    alertThresholdPct: ALERT_THRESHOLD_PCT,
    forceRestartPct: FORCE_RESTART_PCT,
    windowMs: ALERT_WINDOW_MS,
  };
}
