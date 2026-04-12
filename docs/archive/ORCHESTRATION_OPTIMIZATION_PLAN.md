# Orchestration Layer Optimization Plan

## Identified Bottlenecks & Anti-Patterns

### 1. Sequential DB Write Amplification (Critical)

**Location**: `pipeline/orchestrator.ts`, `pipeline/research.ts`, `pipeline/fallback.ts`

Every pipeline stage performs **sequential, un-batched DB writes** where independent operations could be parallelized:

- `createWorkflowJob` → `createResearchRun` → `updateWorkflowJob` → `updateResearchRun` → `updateLetterStatus` → `logReviewAction` → `notifyAdmins` — all sequential `await`s
- In `runFullPipeline`: after research completes, `setLetterResearchUnverified` is awaited separately from the research run update
- In `bestEffortFallback`: 5+ sequential DB writes that are independent: `setLetterQualityDegraded`, `createLetterVersion`, `updateLetterVersionPointers`, `updateLetterStatus`, `logReviewAction`

**Fix**: Use `Promise.all()` / `Promise.allSettled()` for independent DB writes.

### 2. Redundant DB Reads in Hot Paths (High)

**Location**: `pipeline/orchestrator.ts`, `pipeline/fallback.ts`, `worker.ts`

- `autoAdvanceIfPreviouslyUnlocked` re-fetches the letter record that the caller already has
- `bestEffortFallback` calls `getLetterById(letterId)` twice — once for status check, once for subscriber email
- Worker `processRunPipeline` calls `getLetterRequestById` inside the retry loop on every attempt
- `updateLetterStatus` with `force: true` does an extra SELECT before the UPDATE

**Fix**: Pass existing records through function parameters; cache within pipeline context.

### 3. Fire-and-Forget Notification Scatter (Medium)

**Location**: `pipeline/research.ts:127-139`, `pipeline/fallback.ts:230-257`, `worker.ts:163-198`

Admin notifications (email + in-app) are sent in serial loops:
```
for (const admin of admins) {
  await sendEmail(admin);
  await createNotification(admin);
}
```

**Fix**: Batch notifications with `Promise.allSettled()` and use a single notification helper.

### 4. Duplicated Citation Revalidation Logic (Medium)

**Location**: `pipeline/orchestrator.ts` lines 281-313 (runFullPipeline) and 512-526 (retryPipelineFromStage research path) and 539-553 (retryPipelineFromStage drafting path)

The citation registry build → skip-check → revalidation logic is copy-pasted 3 times with minor variable name differences.

**Fix**: Extract into a shared `buildAndRevalidateCitations()` helper.

### 5. Redundant `getDb()` Calls Per Operation (Medium)

**Location**: `server/db/*.ts` — every single DB helper calls `await getDb()`

Since `getDb()` is a lazy singleton, the `await` overhead is minimal after first call, but every DB operation still goes through the async path unnecessarily.

**Fix**: Already acceptable given the singleton pattern, but can be micro-optimized by caching the resolved promise.

### 6. Worker Concurrency = 1 (Architectural Note)

**Location**: `worker.ts:362`

The worker processes jobs with `localConcurrency: 1`, meaning only one letter pipeline runs at a time. This is intentional for resource safety but limits throughput.

**Fix**: Not changing this (intentional design), but documenting it.

### 7. Intermediate Content Registry is In-Memory Only (Risk)

**Location**: `pipeline/orchestrator.ts:37`

`_intermediateContentRegistry` is a plain `Map` — if the worker process restarts between stages, intermediate content is lost. The fallback system already handles this by checking DB versions, but it adds latency.

**Fix**: Already mitigated by DB fallback tiers in `bestEffortFallback`. No change needed.

---

## Optimization Implementation Plan

### A. Parallelize Independent DB Writes in Orchestrator
### B. Eliminate Redundant DB Reads via Context Passing
### C. Batch Admin Notifications
### D. Extract Citation Revalidation Helper
### E. Optimize getDb() Resolution
