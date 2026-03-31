/**
 * server/worker.test.ts
 *
 * Unit tests for the BullMQ worker's job-processing logic:
 *  - processRunPipeline: lock acquisition, retry loop, permanent errors,
 *    best-effort fallback, usage refund, admin alerts
 *  - processRetryFromStage: delegates correctly
 *  - processJob: routes job types
 *
 * `./queue` is mocked entirely so we never touch IORedis here.
 * `bullmq` Worker is mocked so startWorker() in worker.ts doesn't fail at
 * import time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ════════════════════════════════════════════════════════════════════════════
// MOCKS  (all hoisted before imports by Vitest)
// ════════════════════════════════════════════════════════════════════════════

// Mock ./queue entirely so worker.ts never triggers IORedis / buildRedisConnection.
vi.mock("./queue", () => ({
  QUEUE_NAME: "pipeline",
  getPipelineQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
    close: vi.fn().mockResolvedValue(undefined),
  }),
  enqueuePipelineJob: vi.fn().mockResolvedValue("mock-job-id"),
  enqueueRetryFromStageJob: vi.fn().mockResolvedValue("mock-job-id"),
  buildRedisConnection: vi.fn().mockReturnValue({}),
}));

// BullMQ Worker — mocked so startWorker() (called at module level in worker.ts)
// doesn't open a real Redis connection.
// Must use regular function (not arrow) so `new Worker(...)` succeeds.
vi.mock("bullmq", () => {
  function Queue() { return { add: vi.fn(), close: vi.fn() }; }
  function Worker() { return { on: vi.fn(), close: vi.fn() }; }
  return { Queue, Worker };
});

vi.mock("./pipeline", () => ({
  runFullPipeline: vi.fn().mockResolvedValue(undefined),
  retryPipelineFromStage: vi.fn().mockResolvedValue(undefined),
  bestEffortFallback: vi.fn().mockResolvedValue(false),
  consumeIntermediateContent: vi.fn().mockReturnValue({ content: null, qualityWarnings: [] }),
}));

vi.mock("./db", () => ({
  acquirePipelineLock: vi.fn().mockResolvedValue(true),
  releasePipelineLock: vi.fn().mockResolvedValue(undefined),
  markPriorPipelineRunsSuperseded: vi.fn().mockResolvedValue(undefined),
  getLetterRequestById: vi.fn().mockResolvedValue({ id: 42, status: "submitted" }),
  getLatestResearchRun: vi.fn().mockResolvedValue(null),
  updateLetterStatus: vi.fn().mockResolvedValue(undefined),
  getAllUsers: vi.fn().mockResolvedValue([]),
  createNotification: vi.fn().mockResolvedValue(undefined),
  decrementLettersUsed: vi.fn().mockResolvedValue(undefined),
  refundFreeTrialSlot: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("./email", () => ({
  sendJobFailedAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./sentry", () => ({
  captureServerException: vi.fn(),
  initServerSentry: vi.fn(),
}));

vi.mock("./_core/env", () => ({
  ENV: {
    isProduction: false,
    databaseUrl: "postgresql://test:test@localhost/test",
    stripeSecretKey: "sk_test",
    stripeWebhookSecret: "whsec_test",
    sentryDsn: "",
  },
}));

vi.mock("dotenv/config", () => ({}));

// ════════════════════════════════════════════════════════════════════════════
// IMPORTS  (after mocks; set env var before worker.ts so startWorker() passes)
// ════════════════════════════════════════════════════════════════════════════

// worker.ts calls startWorker() at module level; with queue mocked and
// process.env.UPSTASH_REDIS_URL set (so buildRedisConnection doesn't throw
// even if something leaks), and Worker mocked, the import is safe.
process.env.UPSTASH_REDIS_URL = "redis://mock:6379";

const { processRunPipeline, processRetryFromStage, processJob } = await import("./worker");

const {
  runFullPipeline,
  retryPipelineFromStage: retryPipelineFn,
  bestEffortFallback,
  consumeIntermediateContent,
} = await import("./pipeline");

const {
  acquirePipelineLock,
  releasePipelineLock,
  markPriorPipelineRunsSuperseded,
  getLetterRequestById,
  updateLetterStatus,
  getAllUsers,
  decrementLettersUsed,
  refundFreeTrialSlot,
} = await import("./db");

const { sendJobFailedAlertEmail } = await import("./email");
const { PipelineError } = await import("../shared/types");

// ════════════════════════════════════════════════════════════════════════════
// SHARED FIXTURES
// ════════════════════════════════════════════════════════════════════════════

const LETTER_ID = 42;
const USER_ID = 7;

const baseRunData = {
  type: "runPipeline" as const,
  letterId: LETTER_ID,
  intake: { subject: "Security Deposit", letterType: "demand_letter" },
  userId: USER_ID,
  appUrl: "https://test.example.com",
  label: "test-run",
};

const baseRetryData = {
  type: "retryPipelineFromStage" as const,
  letterId: LETTER_ID,
  intake: { subject: "Security Deposit", letterType: "demand_letter" },
  stage: "drafting" as const,
  userId: USER_ID,
};

/** Replace setTimeout with a synchronous no-op so retry delays are instant. */
function skipDelays() {
  vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: any) => {
    fn();
    return 0 as any;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 1. processRunPipeline — lock acquisition
// ════════════════════════════════════════════════════════════════════════════

describe("processRunPipeline — pipeline lock behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(runFullPipeline).mockResolvedValue(undefined);
    vi.mocked(getLetterRequestById).mockResolvedValue({ id: LETTER_ID, status: "submitted" } as any);
  });

  it("acquires pipeline lock before calling runFullPipeline", async () => {
    await processRunPipeline(baseRunData);
    expect(acquirePipelineLock).toHaveBeenCalledWith(LETTER_ID);
    expect(acquirePipelineLock).toHaveBeenCalledBefore(vi.mocked(runFullPipeline));
  });

  it("skips runFullPipeline entirely when lock is already held", async () => {
    vi.mocked(acquirePipelineLock).mockResolvedValueOnce(false);
    await processRunPipeline(baseRunData);
    expect(runFullPipeline).not.toHaveBeenCalled();
    expect(releasePipelineLock).not.toHaveBeenCalled();
  });

  it("releases pipeline lock in the finally block on success", async () => {
    await processRunPipeline(baseRunData);
    expect(releasePipelineLock).toHaveBeenCalledWith(LETTER_ID);
  });

  it("releases pipeline lock even after retry exhaustion", async () => {
    skipDelays();
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Transient failure"));
    vi.mocked(bestEffortFallback).mockResolvedValue(false);
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(releasePipelineLock).toHaveBeenCalledWith(LETTER_ID);
  });

  it("calls markPriorPipelineRunsSuperseded after acquiring lock", async () => {
    await processRunPipeline(baseRunData);
    expect(markPriorPipelineRunsSuperseded).toHaveBeenCalledWith(LETTER_ID);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. processRunPipeline — happy path
// ════════════════════════════════════════════════════════════════════════════

describe("processRunPipeline — success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(runFullPipeline).mockResolvedValue(undefined);
    vi.mocked(getLetterRequestById).mockResolvedValue({ id: LETTER_ID, status: "submitted" } as any);
  });

  it("calls runFullPipeline with letterId, intake, and userId", async () => {
    await processRunPipeline(baseRunData);
    expect(runFullPipeline).toHaveBeenCalledWith(
      LETTER_ID,
      baseRunData.intake,
      undefined,
      USER_ID
    );
  });

  it("does NOT call sendJobFailedAlertEmail on success", async () => {
    await processRunPipeline(baseRunData);
    expect(sendJobFailedAlertEmail).not.toHaveBeenCalled();
  });

  it("does NOT invoke bestEffortFallback on success", async () => {
    await processRunPipeline(baseRunData);
    expect(bestEffortFallback).not.toHaveBeenCalled();
  });

  it("does NOT refund usage credits on success", async () => {
    await processRunPipeline(baseRunData);
    expect(decrementLettersUsed).not.toHaveBeenCalled();
    expect(refundFreeTrialSlot).not.toHaveBeenCalled();
  });

  it("does NOT mark letter as pipeline_failed on success", async () => {
    await processRunPipeline(baseRunData);
    expect(updateLetterStatus).not.toHaveBeenCalledWith(
      LETTER_ID, "pipeline_failed", expect.anything()
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. processRunPipeline — retry exhaustion
// ════════════════════════════════════════════════════════════════════════════

describe("processRunPipeline — retry exhaustion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipDelays();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(getLetterRequestById).mockResolvedValue({ id: LETTER_ID, status: "submitted" } as any);
    vi.mocked(bestEffortFallback).mockResolvedValue(false);
    vi.mocked(getAllUsers).mockResolvedValue([
      { id: 1, email: "admin@test.com", name: "Admin", role: "admin" } as any,
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries runFullPipeline exactly 4 times (PIPELINE_MAX_RETRIES=3 → 4 total attempts)", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Transient network error"));
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(4);
  });

  it("sends alert email to each admin after retry exhaustion", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("All failed"));
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(sendJobFailedAlertEmail).toHaveBeenCalledOnce();
    expect(sendJobFailedAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@test.com",
        letterId: LETTER_ID,
        jobType: "generation_pipeline",
      })
    );
  });

  it("marks letter as pipeline_failed after all retries are exhausted", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("All failed"));
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(updateLetterStatus).toHaveBeenCalledWith(
      LETTER_ID, "pipeline_failed", expect.anything()
    );
  });

  it("throws a descriptive error describing attempt count after retry exhaustion", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Network timeout"));
    await expect(processRunPipeline(baseRunData)).rejects.toThrow(
      /Pipeline failed after .+ attempts/i
    );
  });

  it("calls bestEffortFallback with letterId after retry exhaustion", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Exhausted"));
    vi.mocked(consumeIntermediateContent).mockReturnValue({
      content: "Partial draft text",
      qualityWarnings: ["Citation unverified"],
    });
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(bestEffortFallback).toHaveBeenCalledWith(
      expect.objectContaining({ letterId: LETTER_ID })
    );
  });

  it("resolves cleanly when bestEffortFallback delivers a degraded draft (returns true)", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Exhausted"));
    vi.mocked(bestEffortFallback).mockResolvedValue(true);
    await expect(processRunPipeline(baseRunData)).resolves.toBeUndefined();
  });

  it("skips admin alert email when bestEffortFallback succeeds", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Exhausted"));
    vi.mocked(bestEffortFallback).mockResolvedValue(true);
    await processRunPipeline(baseRunData);
    expect(sendJobFailedAlertEmail).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. processRunPipeline — permanent PipelineError short-circuits retries
// ════════════════════════════════════════════════════════════════════════════

describe("processRunPipeline — permanent PipelineError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipDelays();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(getLetterRequestById).mockResolvedValue({ id: LETTER_ID, status: "submitted" } as any);
    vi.mocked(bestEffortFallback).mockResolvedValue(false);
    vi.mocked(getAllUsers).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stops after 1 attempt on CONTENT_POLICY_VIOLATION (permanent)", async () => {
    const err = new PipelineError("CONTENT_POLICY_VIOLATION", "Prohibited content", "vetting");
    vi.mocked(runFullPipeline).mockRejectedValueOnce(err);
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(1);
  });

  it("stops after 1 attempt on INTAKE_INCOMPLETE (permanent)", async () => {
    const err = new PipelineError("INTAKE_INCOMPLETE", "Missing fields", "intake");
    vi.mocked(runFullPipeline).mockRejectedValueOnce(err);
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(1);
  });

  it("stops after 1 attempt on API_KEY_MISSING (permanent)", async () => {
    const err = new PipelineError("API_KEY_MISSING", "No API key configured", "research");
    vi.mocked(runFullPipeline).mockRejectedValueOnce(err);
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(1);
  });

  it("still calls bestEffortFallback after a permanent error", async () => {
    const err = new PipelineError("CONTENT_POLICY_VIOLATION", "Prohibited", "vetting");
    vi.mocked(runFullPipeline).mockRejectedValueOnce(err);
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(bestEffortFallback).toHaveBeenCalledOnce();
  });

  it("still releases lock after a permanent error", async () => {
    const err = new PipelineError("CONTENT_POLICY_VIOLATION", "Prohibited", "vetting");
    vi.mocked(runFullPipeline).mockRejectedValueOnce(err);
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(releasePipelineLock).toHaveBeenCalledWith(LETTER_ID);
  });

  it("retries all 4 times on API_TIMEOUT (transient)", async () => {
    const err = new PipelineError("API_TIMEOUT", "Request timed out", "research");
    vi.mocked(runFullPipeline).mockRejectedValue(err);
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(4);
  });

  it("retries all 4 times on RATE_LIMITED (transient)", async () => {
    const err = new PipelineError("RATE_LIMITED", "Rate limit hit", "research");
    vi.mocked(runFullPipeline).mockRejectedValue(err);
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(4);
  });

  it("retries all 4 times on a plain (non-PipelineError) Error", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Unknown crash"));
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(4);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. processRunPipeline — usage refund paths
// ════════════════════════════════════════════════════════════════════════════

describe("processRunPipeline — usage refund on failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipDelays();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(getLetterRequestById).mockResolvedValue({ id: LETTER_ID, status: "submitted" } as any);
    vi.mocked(bestEffortFallback).mockResolvedValue(false);
    vi.mocked(getAllUsers).mockResolvedValue([]);
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Pipeline failed"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls decrementLettersUsed when shouldRefundOnFailure=true and not a free trial", async () => {
    const data = {
      ...baseRunData,
      usageContext: { shouldRefundOnFailure: true as const, isFreeTrialSubmission: false },
    };
    await expect(processRunPipeline(data)).rejects.toThrow();
    expect(decrementLettersUsed).toHaveBeenCalledWith(USER_ID);
    expect(refundFreeTrialSlot).not.toHaveBeenCalled();
  });

  it("calls refundFreeTrialSlot when shouldRefundOnFailure=true and isFreeTrialSubmission=true", async () => {
    const data = {
      ...baseRunData,
      usageContext: { shouldRefundOnFailure: true as const, isFreeTrialSubmission: true },
    };
    await expect(processRunPipeline(data)).rejects.toThrow();
    expect(refundFreeTrialSlot).toHaveBeenCalledWith(USER_ID);
    expect(decrementLettersUsed).not.toHaveBeenCalled();
  });

  it("skips any refund when usageContext is absent", async () => {
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(decrementLettersUsed).not.toHaveBeenCalled();
    expect(refundFreeTrialSlot).not.toHaveBeenCalled();
  });

  it("skips refund when bestEffortFallback delivers the degraded draft", async () => {
    vi.mocked(bestEffortFallback).mockResolvedValue(true);
    const data = {
      ...baseRunData,
      usageContext: { shouldRefundOnFailure: true as const, isFreeTrialSubmission: false },
    };
    await processRunPipeline(data); // resolves
    expect(decrementLettersUsed).not.toHaveBeenCalled();
    expect(refundFreeTrialSlot).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. processRetryFromStage
// ════════════════════════════════════════════════════════════════════════════

describe("processRetryFromStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(retryPipelineFn).mockResolvedValue(undefined);
  });

  it("delegates to retryPipelineFromStage with correct arguments", async () => {
    await processRetryFromStage(baseRetryData);
    expect(retryPipelineFn).toHaveBeenCalledWith(
      LETTER_ID,
      baseRetryData.intake,
      "drafting",
      USER_ID
    );
  });

  it("works correctly for the 'research' stage", async () => {
    await processRetryFromStage({ ...baseRetryData, stage: "research" });
    expect(retryPipelineFn).toHaveBeenCalledWith(
      LETTER_ID, baseRetryData.intake, "research", USER_ID
    );
  });

  it("propagates errors thrown by retryPipelineFromStage", async () => {
    vi.mocked(retryPipelineFn).mockRejectedValueOnce(new Error("Stage failed"));
    await expect(processRetryFromStage(baseRetryData)).rejects.toThrow("Stage failed");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. processJob — job type router
// ════════════════════════════════════════════════════════════════════════════

describe("processJob — job type router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(runFullPipeline).mockResolvedValue(undefined);
    vi.mocked(retryPipelineFn).mockResolvedValue(undefined);
    vi.mocked(getLetterRequestById).mockResolvedValue({ id: LETTER_ID, status: "submitted" } as any);
  });

  const mockJob = (data: any) => ({ id: "test-job-id", data });

  it("routes 'runPipeline' jobs to runFullPipeline (not retryPipelineFromStage)", async () => {
    await processJob(mockJob(baseRunData) as any);
    expect(runFullPipeline).toHaveBeenCalledOnce();
    expect(retryPipelineFn).not.toHaveBeenCalled();
  });

  it("routes 'retryPipelineFromStage' jobs to retryPipelineFromStage (not runFullPipeline)", async () => {
    await processJob(mockJob(baseRetryData) as any);
    expect(retryPipelineFn).toHaveBeenCalledOnce();
    expect(runFullPipeline).not.toHaveBeenCalled();
  });

  it("throws for an unknown job type", async () => {
    await expect(
      processJob(mockJob({ type: "unknownJobType", letterId: LETTER_ID }) as any)
    ).rejects.toThrow();
  });
});
