# LangGraph Pipeline - Critical Issues Fixed

## Overview
This document summarizes the critical issues identified during PR review and the fixes applied to the LangGraph-based letter generation pipeline.

---

## Issues Fixed

### 1. **FALLBACK_EXCLUDED_CODES: Using `.includes()` on a Set** ✅ FIXED
**File**: `server/pipeline/langgraph/nodes/fallback.ts` (line 66)

**Issue**: `FALLBACK_EXCLUDED_CODES` is a `ReadonlySet`, but code was calling `.includes()` instead of `.has()`.

```typescript
// ❌ WRONG
FALLBACK_EXCLUDED_CODES.includes(lastError.code as any)

// ✅ FIXED
FALLBACK_EXCLUDED_CODES.has(lastError.code)
```

---

### 2. **bestEffortFallback: Wrong Function Signature** ✅ FIXED
**File**: `server/pipeline/langgraph/nodes/fallback.ts` (lines 122-154)

**Issue**: The fallback node was calling `bestEffortFallback()` with positional arguments, but the actual implementation expects an options object.

**Original (Wrong)**:
```typescript
await bestEffortFallback(
  letterId,
  bestContent,
  [...qualityWarnings],
  pipelineCtx
);
```

**Fixed**:
```typescript
const fallbackSuccess = await bestEffortFallback({
  letterId,
  intake,
  intermediateDraftContent: bestContent,
  qualityWarnings,
  pipelineErrorCode: lastError?.code ?? "UNKNOWN_ERROR",
  errorMessage: lastError?.message ?? "Unknown error",
  dbFields: {
    subject: intake.matter?.subject,
    jurisdictionState: intake.jurisdiction?.state ?? intake.jurisdiction?.country ?? null,
  },
});

if (!fallbackSuccess) {
  // Fall through to complete failure
} else {
  // Successfully delivered
  return { currentStage: "complete", vettedLetter: bestContent, ... };
}
```

---

### 3. **Unused Import: `setLetterQualityDegraded`** ✅ FIXED
**File**: `server/pipeline/langgraph/nodes/fallback.ts` (line 15)

**Issue**: The `setLetterQualityDegraded` import was removed but the function call was already handled by `bestEffortFallback()`.

---

### 4. **userId Type Safety: Missing Guards for createNotification** ✅ FIXED
**File**: `server/pipeline/langgraph/nodes/fallback.ts` (lines 81-89, 187-195)

**Issue**: `state.userId` is `number | undefined`, but `createNotification()` expects a valid user ID. Without guards, this could cause runtime errors.

**Fixed by adding conditional notification**:
```typescript
...(state.userId ? [
  createNotification({
    userId: state.userId,
    type: "letter_failed",
    title: "Letter Generation Failed",
    message: `...`,
    link: `/dashboard/letters/${letterId}`,
  }),
] : []),
```

---

### 5. **Critical: vettingReport Null Safety** ✅ FIXED
**File**: `server/pipeline/langgraph/index.ts` (lines 195-265)

**Issue**: Fallback node doesn't provide a `vettingReport`, so calling `finalizeLetterAfterVetting(letterId, vettedLetter, vettingReport!)` with non-null assertion would crash.

**Fixed by splitting success paths**:
```typescript
// Path 1: Full success (research → drafting → assembly → vetting → complete)
if (finalState.currentStage === "complete" && finalState.vettedLetter && finalState.vettingReport) {
  // Safe to call finalizeLetterAfterVetting
  await finalizeLetterAfterVetting(...);
}

// Path 2: Fallback delivery (no vettingReport)
if (finalState.currentStage === "complete" && finalState.vettedLetter && !finalState.vettingReport) {
  pipelineLogger.warn("[LangGraph] Pipeline completed but missing vettingReport - treating as fallback");
  // Fallback path with different handling
  if (pipelineJobId) {
    await updateWorkflowJob(pipelineJobId, { ... });
  }
}
```

---

### 6. **pipelineJobId Undefined: Workflow Job Updates Fail** ✅ FIXED
**File**: `server/pipeline/langgraph/index.ts` (lines 149-160)

**Issue**: If `createWorkflowJob()` returns an object without `insertId`, `pipelineJobId` becomes 0, and subsequent `updateWorkflowJob(0, ...)` calls silently fail.

**Fixed**:
```typescript
const pipelineJobId = (pipelineJob as any)?.insertId ?? 0;

if (!pipelineJobId) {
  pipelineLogger.error({ letterId }, "[LangGraph] Failed to create workflow job - insertId was undefined");
}

if (pipelineJobId) {
  await updateWorkflowJob(pipelineJobId, {
    status: "running",
    startedAt: new Date(),
  });
}
```

---

### 7. **Workflow Job Updates Need Guards Throughout** ✅ FIXED
**Files**: `server/pipeline/langgraph/index.ts` (multiple locations)

**Issue**: All `updateWorkflowJob()` calls should check `pipelineJobId` validity before calling.

**Fixed in**:
- Line 216: Success path update (guarded)
- Line 268: Fallback path update (guarded)
- Lines 298-313: Failure path update (guarded)
- Lines 328-334: Exception handler update (guarded)

All now follow pattern:
```typescript
...(pipelineJobId ? [
  updateWorkflowJob(pipelineJobId, { ... }),
] : []),
```

---

### 8. **Double Retry Layers: Documentation & Architecture Notes** ✅ FIXED
**File**: `server/pipeline/langgraph/index.ts` (lines 99-113)

**Issue**: LangGraph manages internal stage retries (MAX_*_RETRIES), but this differs from the original orchestrator's worker-level retries. The interaction wasn't documented.

**Fixed by adding comprehensive documentation**:
```typescript
/**
 * ARCHITECTURE NOTE: Double Retry Layers
 * ────────────────────────────────────────
 * The LangGraph pipeline manages stage-level retries internally (MAX_*_RETRIES
 * per node). This design differs from the original orchestrator which relied on
 * pg-boss worker retries across multiple invocations.
 * 
 * With LangGraph retries contained within a single runPipeline() call:
 * - All retries happen synchronously within the request/function execution
 * - Fallback delivery happens after internal retries are exhausted
 * - The worker/orchestrator caller doesn't retry again (fallback is final)
 * 
 * This means costs and latency are higher per attempt, but failure recovery
 * is more deterministic. For very long-running pipelines, consider streaming
 * the pipeline via runPipelineStreaming() instead.
 */
```

---

## Summary of Fixes

| Issue | Severity | File | Status |
|-------|----------|------|--------|
| FALLBACK_EXCLUDED_CODES.includes() on Set | CRITICAL | fallback.ts | ✅ Fixed |
| bestEffortFallback wrong signature | CRITICAL | fallback.ts | ✅ Fixed |
| Unused import setLetterQualityDegraded | MEDIUM | fallback.ts | ✅ Fixed |
| userId not guarded for createNotification | HIGH | fallback.ts | ✅ Fixed |
| vettingReport null causing crash | CRITICAL | index.ts | ✅ Fixed |
| pipelineJobId undefined corruption | HIGH | index.ts | ✅ Fixed |
| updateWorkflowJob calls without guards | HIGH | index.ts (×4) | ✅ Fixed |
| Double retry layers undocumented | MEDIUM | index.ts | ✅ Documented |

---

## Testing Recommendations

1. **Unit tests for fallback node**:
   - Test with `userId` present and missing
   - Test with `FALLBACK_EXCLUDED_CODES` error codes
   - Verify `bestEffortFallback()` is called with correct options

2. **Integration tests for full pipeline**:
   - Test workflow job creation failure (missing insertId)
   - Test vetting report missing (fallback path)
   - Test complete success path with all stages

3. **Error scenarios**:
   - Research fails → assembly fails → fallback triggers
   - All notifications sent with proper guards
   - Letter status reverted correctly on failure

---

## Remaining Considerations

### Architecture Notes
- **Streaming pipeline**: `runPipelineStreaming()` should also guard `pipelineJobId` on updates
- **Retry layer semantics**: Consider if internal retries should be exposed to callers
- **Quality warnings**: Ensure warnings accumulate correctly through state reducers
- **Token tracking**: Research node citation revalidation token tracking is accurate

### Future Improvements
1. Add structured logging with request IDs for tracing across retries
2. Consider circuit breaker pattern for repeated provider failures
3. Add telemetry for retry distribution and fallback frequency
4. Document expected behavior when pipeline times out mid-execution
