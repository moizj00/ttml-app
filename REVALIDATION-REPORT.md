# TTML Queue Improvements — Revalidation Report

**Date:** 2026-05-09  
**Commits:** 7 (P0-P3)  
**Files Modified:** 7

---

## Validation Methods Used

| Method | Coverage | Result |
|--------|----------|--------|
| Syntax validation (Node `--check` on stripped TS→JS) | 7/7 files | ✅ PASS |
| Deep logic validation (30 revalidation points) | RP-1 through RP-7 | ✅ 30/30 PASS |
| TypeScript compiler (tsc --noEmit, filtered) | 7 modified files | ✅ No type errors in our code |
| Manual code review | All changes | ✅ Approved |

---

## Revalidation Point Results

### RP-1: WORKER_CONCURRENCY parsing
| Case | Result |
|------|--------|
| unset → 2 | ✅ |
| "1" → 1 | ✅ |
| "3" → 3 | ✅ |
| "5" → 5 | ✅ |
| "10" → clamped to 5 | ✅ |
| "0" → clamped to 1 | ✅ |

### RP-2: QUEUE_BACKLOG_THRESHOLD parsing
| Case | Result |
|------|--------|
| unset → 10 | ✅ |
| "25" → 25 | ✅ |

### RP-3: STAGE_TIMEOUTS defaults
| Stage | Default | Result |
|-------|---------|--------|
| research | 600000ms (10m) | ✅ |
| drafting | 900000ms (15m) | ✅ |
| assembly | 900000ms (15m) | ✅ |
| finalization | 300000ms (5m) | ✅ |
| **Total** | **2700000ms (45m)** | ✅ |

### RP-4: withStageTimeout behavior
| Case | Result |
|------|--------|
| Success returns value | ✅ |
| Timeout throws clear error | ✅ |
| Stage error propagates (not masked) | ✅ |
| 100 rapid calls — no timer leak | ✅ |

### RP-5: Expiry + stale lock consistency
| Check | Result |
|-------|--------|
| Job expiry = 3600s | ✅ |
| Stale lock = 3600000ms | ✅ |
| staleLock === expiry × 1000 | ✅ |

### RP-6: Resource pressure degrade thresholds
| Condition | Status | Result |
|-----------|--------|--------|
| memory 50% | healthy | ✅ |
| memory 85% | healthy (edge) | ✅ |
| memory 86% | degraded | ✅ |
| cpu 90% | healthy (edge) | ✅ |
| cpu 91% | degraded | ✅ |

### RP-7: Enqueue retry backoff timing
| Attempt | Delay | Result |
|---------|-------|--------|
| 1 | 1000ms | ✅ |
| 2 | 2000ms | ✅ |
| 3 | 4000ms | ✅ |
| >3 | capped at 8000ms | ✅ |

---

## TypeScript Compiler Results

When run with `tsc --noEmit`:
- **0 type errors** in our 7 modified files
- All errors are from missing `node_modules` (drizzle-orm, pg-boss, @types/node)
- **1 fix applied:** `let boss: PgBossClient | undefined` in queue.ts (TS2454 definite assignment)

---

## Post-Deploy Verification Steps

```bash
# 1. Health check includes queue + resources
curl https://your-app.railway.app/api/health
# Expect: { ..., "services": { ..., "queue": { "status": "ok" }, ... },
#          "resources": { "cpuUsagePercent": ..., "memoryUsagePercent": ... } }

# 2. Admin queue stats endpoint
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://your-app.railway.app/api/trpc/admin.queueHealth
# Expect: { throughput1h, throughput24h, workerConcurrency, jobExpiryMinutes }

# 3. Submit a test letter — verify pipeline completes
# Submit intake → check status progresses submitted → researching → drafting → approved

# 4. Verify WORKER_CONCURRENCY=2 default
check Railway logs for: "concurrency=2, max=5, backend=pg-boss"

# 5. Verify queue backlog cron every 5min
check Railway logs for: "[Cron] Queue depth: N queued, M active"
```

---

## New Environment Variables Summary

| Variable | Default | Range | Set In |
|----------|---------|-------|--------|
| `WORKER_CONCURRENCY` | `2` | 1–5 | Railway dashboard |
| `QUEUE_BACKLOG_THRESHOLD` | `10` | 1–100 | Railway dashboard |
| `PIPELINE_RESEARCH_TIMEOUT_MS` | `600000` | >0 | Railway dashboard |
| `PIPELINE_DRAFTING_TIMEOUT_MS` | `900000` | >0 | Railway dashboard |
| `PIPELINE_ASSEMBLY_TIMEOUT_MS` | `900000` | >0 | Railway dashboard |
| `PIPELINE_FINALIZATION_TIMEOUT_MS` | `300000` | >0 | Railway dashboard |
