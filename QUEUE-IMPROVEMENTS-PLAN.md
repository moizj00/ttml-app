# TTML Queue Worker Improvements — Implementation Plan

## Summary

This plan addresses 6 operational risks identified in the pg-boss queue configuration review. Items are prioritized by production impact and implementation effort. All changes are backward-compatible and require zero downtime.

---

## Priority Matrix

| # | Issue | Priority | Effort | Risk if Not Fixed |
|---|-------|----------|--------|-------------------|
| 1 | **Worker crash on unhandled errors** | P0 — Critical | 2h | Worker restarts, queue stalls, letters stuck |
| 2 | **Queue backlog alerting** | P0 — Critical | 3h | Silent queue growth, SLA breaches |
| 3 | **Concurrency bottleneck (1→configurable)** | P1 — High | 1h | Throughput limited to 1 letter at a time |
| 4 | **Job expiry < pipeline duration** | P1 — High | 30m | Long-running letters killed mid-pipeline |
| 5 | **Enqueue retry race conditions** | P2 — Medium | 1h | Duplicate jobs under connection flapping |
| 6 | **Single-container resource monitoring** | P2 — Medium | 2h | No visibility into CPU/memory contention |

---

## Phase 1: Crash Protection + Backlog Alerting (P0)

### 1.1 Wrap `processJob` with Error Boundary

**File:** `server/worker.ts`  
**Lines:** 720–750 (inside `processJob`), 857–865 (inside `boss.work()` callback)

**Problem:** `processJob` re-throws on any error. While pg-boss's `work()` handler does catch and mark jobs as failed, an unhandled error in the *callback wrapper* (the array iteration logic) or during `boss.on('error')` can crash the worker process.

**Implementation:**

```typescript
// REPLACE the existing boss.work() handler (lines 857-865):
await boss.work(
  QUEUE_NAME,
  { localConcurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "1", 10) },
  (async (jobs: Job<PipelineJobData>[]) => {
    for (const job of jobs) {
      try {
        await processJob(job);
      } catch (err) {
        // Individual job errors are caught here so the worker process
        // NEVER crashes. pg-boss will mark the job as failed.
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(
          { err: msg, jobId: job.id, letterId: job.data.letterId },
          `[Worker] processJob crashed for job ${job.id} — error contained, worker continuing`
        );
        captureServerException(err instanceof Error ? err : new Error(msg), {
          tags: { component: "pipeline-worker", error_type: "processJob_crash_contained" },
          extra: { jobId: job.id, letterId: job.data.letterId, jobType: job.data.type },
        });
        // Re-throw so pg-boss marks the job as failed
        throw err;
      }
    }
  }) as unknown as (job: Job<unknown>) => Promise<void>
);
```

**Testing:**
- Add a test in `server/worker.test.ts` that throws inside `processJob` and verifies the worker process does not exit.
- Verify in Railway logs: `[Worker] processJob crashed for job X — error contained, worker continuing`

**New env var:** None

---

### 1.2 Add Queue Depth to Health Check + Cron Alerting

**Files:**
- `server/healthCheck.ts` — add pg-boss queue check
- `server/cronScheduler.ts` — add queue backlog alert cron

**1.2a — Health Check Extension**

Add to `server/healthCheck.ts` after `checkR2()`:

```typescript
import { getBoss, QUEUE_NAME, isQueueConnectionConfigured } from "./queue";

async function checkQueue(): Promise<ServiceCheckResult> {
  if (!isQueueConnectionConfigured()) {
    return { status: "unconfigured", responseTimeMs: 0 };
  }
  return checkService("queue", async () => {
    const boss = await getBoss();
    const stats = await boss.getQueueStats(QUEUE_NAME);
    const queuedCount = (stats?.queuedCount ?? 0) + (stats?.deferredCount ?? 0);
    const activeCount = stats?.activeCount ?? 0;
    // Degraded if >10 queued, unhealthy if >50
    if (queuedCount > 50) {
      throw new Error(`${queuedCount} jobs queued, ${activeCount} active — backlog critical`);
    }
    if (queuedCount > 10) {
      // Warning-level: report as ok but include count in error field for visibility
      // The deriveStatus logic treats this as ok since no error thrown
    }
  });
}
```

Update `executeFullChecks()` to include `checkQueue()`:

```typescript
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
  database, redis, stripe, resend, anthropic, openai, r2, queue,
};
```

**1.2b — Cron Alert Job**

Add to `server/cronScheduler.ts` after the existing cron jobs:

```typescript
// Queue backlog alerting: runs every 5 minutes
// Alerts admins if queue depth exceeds threshold
const QUEUE_BACKLOG_THRESHOLD = 10;
cron.schedule("*/5 * * * *", async () => {
  const startTime = Date.now();
  logger.info(`[Cron] [${new Date().toISOString()}] Checking queue backlog...`);
  try {
    if (!isQueueConnectionConfigured()) {
      logger.info("[Cron] Queue check skipped (not configured)");
      return;
    }
    const boss = await getBoss();
    const stats = await boss.getQueueStats(QUEUE_NAME);
    const queuedCount = (stats?.queuedCount ?? 0) + (stats?.deferredCount ?? 0);
    const activeCount = stats?.activeCount ?? 0;

    logger.info(`[Cron] Queue depth: ${queuedCount} queued, ${activeCount} active`);

    if (queuedCount >= QUEUE_BACKLOG_THRESHOLD) {
      const admins = await getAllUsers("admin");
      for (const admin of admins) {
        if (admin.email) {
          try {
            await sendJobFailedAlertEmail({
              to: admin.email,
              name: admin.name ?? "Admin",
              letterId: 0, // sentinel for queue alert
              jobType: "queue_backlog_alert",
              errorMessage: `${queuedCount} pipeline jobs are backlogged (${activeCount} active). Threshold: ${QUEUE_BACKLOG_THRESHOLD}. Worker concurrency may need increasing.`,
              appUrl: process.env.APP_URL ?? "",
            });
          } catch (emailErr) {
            logger.error({ err: emailErr }, "[Cron] Failed to send queue backlog alert email");
          }
        }
        try {
          await createNotification({
            userId: admin.id,
            type: "job_failed",
            category: "system",
            title: `Queue backlog alert: ${queuedCount} jobs pending`,
            body: `Pipeline queue has ${queuedCount} queued jobs (${activeCount} active). Consider increasing WORKER_CONCURRENCY or scaling the service.`,
            link: "/admin/letters",
          });
        } catch (notifErr) {
          logger.error({ err: notifErr }, "[Cron] Failed to create queue backlog notification");
        }
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info(`[Cron] Queue backlog check done in ${elapsed}ms — queued: ${queuedCount}, active: ${activeCount}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Cron] Queue backlog check failed: ${msg}`);
    captureServerException(err, {
      tags: { component: "cron", job: "queue_backlog_alert" },
    });
  }
});
```

Update the scheduler registration summary log at line 376 to include the new job.

**Testing:**
- Unit test: mock `getQueueStats` returning 15 queued → verify alert email sent
- Integration test: enqueue 15 dummy jobs → verify admin notification created
- Health check test: verify `/api/health` includes `queue` service

**New env var:** `QUEUE_BACKLOG_THRESHOLD` (optional, default 10)

---

## Phase 2: Concurrency + Expiry Tuning (P1)

### 2.1 Make Worker Concurrency Configurable

**File:** `server/worker.ts`  
**Lines:** 857–865 (the `boss.work()` call)

**Change:**
```typescript
const WORKER_CONCURRENCY = Math.max(1, Math.min(5, parseInt(process.env.WORKER_CONCURRENCY ?? "2", 10)));
```

Replace the hardcoded `localConcurrency: 1` with `localConcurrency: WORKER_CONCURRENCY`.

**Rationale:** Default of 2 allows parallel processing without overwhelming a 2-vCPU Railway instance. Cap at 5 to prevent resource exhaustion. The pg-boss queue is backed by PostgreSQL row-level locking, so concurrent workers won't double-process.

**Log at startup (after line 882):**
```typescript
logger.info(`[Worker] Concurrency: ${WORKER_CONCURRENCY} (max 5, set via WORKER_CONCURRENCY env)`);
```

**New env var:** `WORKER_CONCURRENCY` (optional, default 2, max 5)

---

### 2.2 Increase Job Expiry Timeout

**File:** `server/queue.ts`  
**Lines:** 334–338 (inside `getBoss()` DESIRED_QUEUE_OPTIONS)

**Change:**
```typescript
const DESIRED_QUEUE_OPTIONS = {
  policy: "standard" as const,
  retryLimit: 0,
  expireInSeconds: 60 * 60,      // ← 60 minutes (was 30)
  deleteAfterSeconds: 7 * 24 * 60 * 60,
  retentionSeconds: 30 * 24 * 60 * 60,
};
```

**Rationale:**
- Research stage (Perplexity Sonar): 1–3 min
- Drafting stage (GPT-4o): 2–5 min
- Assembly + vetting loop (multiple iterations): 5–15 min
- LangGraph pipeline (research → draft → assembly → vetting → finalize): 10–25 min
- **Total worst case with retries and retries within vetting:** 30–45 min

30-minute expiry is too close to the edge. 60 minutes provides a safe margin for research-heavy letters and LangGraph pipelines with multiple assembly/vetting iterations.

**Coordination with stale lock recovery:**
- Update `server/stalePipelineLockRecovery.ts` line 31:
  ```typescript
  const STALE_LOCK_THRESHOLD_MS = 60 * 60 * 1000; // 60 min (was 30)
  ```
- The stale lock recovery comment on line 15 also needs updating.

**Rationale for coordination:** The expiry timeout and stale lock threshold should match. If a job expires at 30 min but the lock recovery only runs at 60 min, there's a 30-min window where the letter is orphaned (status = researching/drafting, no active job, lock still held).

**New env var:** None (hardcoded constants are clearer here)

---

## Phase 3: Enqueue Retry + Resource Monitoring (P2)

### 3.1 Add Exponential Backoff to `enqueuePipelineJob` Retry

**File:** `server/queue.ts`  
**Lines:** 417–427 (inside `enqueuePipelineJobImpl`)

**Current code:**
```typescript
try {
  boss = await getBoss();
} catch (firstErr) {
  logger.warn({ err: firstErr }, "[Queue] First getBoss() attempt failed, retrying once...");
  _boss = null;
  boss = await getBoss();
}
```

**Replace with:**
```typescript
let lastErr: unknown = null;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    boss = await getBoss();
    break;
  } catch (err) {
    lastErr = err;
    const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s capped at 8s
    logger.warn(
      { err, attempt: attempt + 1, delayMs },
      `[Queue] getBoss() attempt ${attempt + 1}/3 failed, retrying in ${delayMs}ms...`
    );
    _boss = null;
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}
if (!boss) {
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`[Queue] getBoss() failed after 3 attempts: ${msg}`);
}
```

**Rationale:** Prevents thundering herd under connection flapping (e.g., Supabase maintenance window). Spreads retries across 1s → 2s → 4s instead of instantaneous.

---

### 3.2 Add Resource Metrics to Health Check

**File:** `server/healthCheck.ts`  
**Add Node.js `process` metrics to the health check result:**

```typescript
import os from "node:os";

interface ResourceMetrics {
  cpuUsagePercent: number;       // since last call
  memoryUsagePercent: number;    // RSS / total
  memoryUsedMB: number;
  memoryTotalMB: number;
  eventLoopLagMs: number;
  uptimeSeconds: number;
}

function getResourceMetrics(): ResourceMetrics {
  const memTotal = os.totalmem();
  const memUsed = process.memoryUsage().rss;
  const cpuUsage = process.cpuUsage();
  // Simple: report CPU as a rough percentage of a single core
  const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1e6 / uptime) * 100;

  return {
    cpuUsagePercent: Math.round(cpuPercent * 10) / 10,
    memoryUsagePercent: Math.round((memUsed / memTotal) * 1000) / 10,
    memoryUsedMB: Math.round(memUsed / 1024 / 1024),
    memoryTotalMB: Math.round(memTotal / 1024 / 1024),
    eventLoopLagMs: 0, // Would need event-loop-lag package for accurate measurement
    uptimeSeconds: getUptime(),
  };
}
```

Add `resources` field to `HealthCheckResult`:
```typescript
export type HealthCheckResult = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
  uptime: number;
  services: Record<string, ServiceCheckResult>;
  resources?: ResourceMetrics; // NEW
};
```

Include in both `executeFullChecks()` and `getDetailedHealth()`:
```typescript
const resources = getResourceMetrics();
return { status: deriveStatus(services), timestamp: Date.now(), uptime: getUptime(), services, resources };
```

**Rationale:** In single-container mode (`PROCESS_TYPE=all`), CPU/memory contention between the web server, worker, and cron scheduler is the primary scaling bottleneck. These metrics make it visible in the `/health/details` endpoint and Railway logs.

**Upgrade to "degraded" if resources exceed thresholds:**
```typescript
// Add to deriveStatus() or as a separate check
if (resources.memoryUsagePercent > 85) return "degraded";
if (resources.cpuUsagePercent > 90) return "degraded";
```

**New env var:** None

---

## Environment Variables Summary

| Var | Default | Range | Set In | Description |
|-----|---------|-------|--------|-------------|
| `WORKER_CONCURRENCY` | `2` | 1–5 | Railway dashboard | Parallel pipeline workers |
| `QUEUE_BACKLOG_THRESHOLD` | `10` | 1–100 | Railway dashboard | Alert if queued jobs exceed this |

Both are optional — the system works safely with defaults if unset.

---

## Implementation Order

```
Day 1 (P0 — 5 hours):
  1.1  Worker error boundary         → server/worker.ts
  1.2a Queue health check           → server/healthCheck.ts
  1.2b Queue backlog cron alert     → server/cronScheduler.ts

Day 2 (P1 — 2 hours):
  2.1  Configurable concurrency     → server/worker.ts
  2.2  Job expiry + stale lock      → server/queue.ts + stalePipelineLockRecovery.ts

Day 3 (P2 — 3 hours):
  3.1  Enqueue retry backoff        → server/queue.ts
  3.2  Resource metrics             → server/healthCheck.ts

Day 4 (Testing — 4 hours):
  - Unit tests for error boundary
  - Integration test for queue backlog alert
  - Health check endpoint test
  - Deploy to staging, verify all metrics
  - Load test with 10 concurrent letter submissions

Day 5 (Production — 2 hours):
  - Deploy with safety gates
  - Monitor queue stats for 24h
  - Adjust WORKER_CONCURRENCY based on CPU metrics
```

---

## Safety Gates (per ttml-fullstack-deploy-specialist)

Before production deploy, verify ALL gates:

1. **Git Clean** — `git status --porcelain` returns empty
2. **Env Valid** — `WORKER_CONCURRENCY` and `QUEUE_BACKLOG_THRESHOLD` documented in `.env.example`
3. **Deps** — `pnpm install --frozen-lockfile` succeeds
4. **TypeScript** — `pnpm check` passes
5. **Lint** — `pnpm lint` passes
6. **Tests** — `pnpm test` passes (including new tests)
7. **Build** — `pnpm build` succeeds
8. **Staging** — Deploy to staging, submit 5 test letters, verify all complete
9. **Health** — `/api/health` returns 200 with `queue` service `ok`

---

## Rollback Plan

If any critical issue is detected post-deploy:

1. `git revert HEAD` (all changes are in one commit)
2. `pnpm install --frozen-lockfile && pnpm build`
3. `railway up`
4. Verify `/api/health` returns 200
5. Confirm queue processing resumes (check `getQueueStats`)

**Database migration:** None required — all changes are application-level.
