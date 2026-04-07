import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RunPipelineJobData, RetryFromStageJobData, PipelineJobData } from "./queue";
import type { Job } from "bullmq";

vi.mock("./queue", () => ({
  QUEUE_NAME: "pipeline",
  getPipelineQueue: vi.fn().mockReturnValue({ add: vi.fn(), close: vi.fn(), getJob: vi.fn().mockResolvedValue(null) }),
  enqueuePipelineJob: vi.fn().mockResolvedValue("mock-job-id"),
  enqueueRetryFromStageJob: vi.fn().mockResolvedValue("mock-job-id"),
  buildRedisConnection: vi.fn().mockReturnValue({}),
}));

vi.mock("bullmq", () => {
  function Queue(this: Record<string, unknown>) { this.add = vi.fn(); this.close = vi.fn(); return this; }
  function Worker(this: Record<string, unknown>) { this.on = vi.fn(); this.close = vi.fn(); return this; }
  return { Queue, Worker };
});

vi.mock("./pipeline", () => ({
  runFullPipeline: vi.fn().mockResolvedValue(undefined),
  retryPipelineFromStage: vi.fn().mockResolvedValue(undefined),
  bestEffortFallback: vi.fn().mockResolvedValue(false),
  consumeIntermediateContent: vi.fn().mockReturnValue({ content: null, qualityWarnings: [] }),
  preflightApiKeyCheck: vi.fn().mockReturnValue({ ok: true, missing: [], canResearch: true, canDraft: true }),
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

vi.mock("./email", () => ({ sendJobFailedAlertEmail: vi.fn().mockResolvedValue(undefined) }));

vi.mock("./sentry", () => ({ captureServerException: vi.fn(), initServerSentry: vi.fn() }));

vi.mock("./_core/env", () => ({
  ENV: { isProduction: false, databaseUrl: "postgresql://test/test", stripeSecretKey: "sk_test", stripeWebhookSecret: "whsec_test", sentryDsn: "" },
}));

vi.mock("dotenv/config", () => ({}));

process.env.UPSTASH_REDIS_URL = "redis://mock:6379";

const { processRunPipeline, processRetryFromStage, processJob } = await import("./worker");
const { runFullPipeline, retryPipelineFromStage: retryPipelineFn, bestEffortFallback, consumeIntermediateContent } = await import("./pipeline");
const { acquirePipelineLock, releasePipelineLock, markPriorPipelineRunsSuperseded, getLetterRequestById, updateLetterStatus, getAllUsers, decrementLettersUsed, refundFreeTrialSlot } = await import("./db");
const { sendJobFailedAlertEmail } = await import("./email");
const { PipelineError } = await import("../shared/types");

const LETTER_ID = 42;
const USER_ID = 7;

const baseRunData: RunPipelineJobData = {
  type: "runPipeline",
  letterId: LETTER_ID,
  intake: { subject: "Security Deposit", letterType: "demand_letter" },
  userId: USER_ID,
  appUrl: "https://test.example.com",
  label: "test-run",
};

const baseRetryData: RetryFromStageJobData = {
  type: "retryPipelineFromStage",
  letterId: LETTER_ID,
  intake: { subject: "Security Deposit", letterType: "demand_letter" },
  stage: "drafting",
  userId: USER_ID,
};

type MockLetterRecord = { id: number; status: string };

const mockLetter: MockLetterRecord = { id: LETTER_ID, status: "submitted" };
const mockAdmin = { id: 1, email: "admin@test.com", name: "Admin", role: "admin" as const };

function skipDelays() {
  vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: TimerHandler) => {
    (fn as () => void)();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  });
}

function makeMockJob(data: PipelineJobData): Pick<Job<PipelineJobData>, "id" | "data"> {
  return { id: "test-job-id", data };
}

describe("processRunPipeline — lock behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(runFullPipeline).mockResolvedValue(undefined);
    vi.mocked(getLetterRequestById).mockResolvedValue(mockLetter as never);
  });

  it("acquires pipeline lock before calling runFullPipeline", async () => {
    await processRunPipeline(baseRunData);
    expect(acquirePipelineLock).toHaveBeenCalledWith(LETTER_ID);
    expect(acquirePipelineLock).toHaveBeenCalledBefore(vi.mocked(runFullPipeline));
  });

  it("skips runFullPipeline when lock is already held", async () => {
    vi.mocked(acquirePipelineLock).mockResolvedValueOnce(false);
    await processRunPipeline(baseRunData);
    expect(runFullPipeline).not.toHaveBeenCalled();
    expect(releasePipelineLock).not.toHaveBeenCalled();
  });

  it("releases lock in finally block on success", async () => {
    await processRunPipeline(baseRunData);
    expect(releasePipelineLock).toHaveBeenCalledWith(LETTER_ID);
  });

  it("releases lock in finally block on failure", async () => {
    skipDelays();
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("transient"));
    vi.mocked(bestEffortFallback).mockResolvedValue(false);
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(releasePipelineLock).toHaveBeenCalledWith(LETTER_ID);
  });

  it("marks prior runs superseded after lock acquisition", async () => {
    await processRunPipeline(baseRunData);
    expect(markPriorPipelineRunsSuperseded).toHaveBeenCalledWith(LETTER_ID);
  });

  afterEach(() => { vi.restoreAllMocks(); });
});

describe("processRunPipeline — success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(runFullPipeline).mockResolvedValue(undefined);
    vi.mocked(getLetterRequestById).mockResolvedValue(mockLetter as never);
  });

  it("calls runFullPipeline with correct letterId, intake, and userId", async () => {
    await processRunPipeline(baseRunData);
    expect(runFullPipeline).toHaveBeenCalledWith(LETTER_ID, baseRunData.intake, undefined, USER_ID);
  });

  it("does not send alert email on success", async () => {
    await processRunPipeline(baseRunData);
    expect(sendJobFailedAlertEmail).not.toHaveBeenCalled();
  });

  it("does not invoke bestEffortFallback on success", async () => {
    await processRunPipeline(baseRunData);
    expect(bestEffortFallback).not.toHaveBeenCalled();
  });

  it("does not refund usage credits on success", async () => {
    await processRunPipeline(baseRunData);
    expect(decrementLettersUsed).not.toHaveBeenCalled();
    expect(refundFreeTrialSlot).not.toHaveBeenCalled();
  });
});

describe("processRunPipeline — retry exhaustion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipDelays();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(getLetterRequestById).mockResolvedValue(mockLetter as never);
    vi.mocked(bestEffortFallback).mockResolvedValue(false);
    vi.mocked(getAllUsers).mockResolvedValue([mockAdmin] as never);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("retries runFullPipeline 4 times total (PIPELINE_MAX_RETRIES=3)", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("transient"));
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(4);
  });

  it("sends alert email to each admin after retry exhaustion", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("exhausted"));
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(sendJobFailedAlertEmail).toHaveBeenCalledOnce();
    expect(sendJobFailedAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@test.com", letterId: LETTER_ID, jobType: "generation_pipeline" })
    );
  });

  it("marks letter as pipeline_failed after retry exhaustion", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("exhausted"));
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(updateLetterStatus).toHaveBeenCalledWith(LETTER_ID, "pipeline_failed", expect.anything());
  });

  it("throws with attempt count in message after retry exhaustion", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("timeout"));
    await expect(processRunPipeline(baseRunData)).rejects.toThrow(/Pipeline failed after .+ attempts/i);
  });

  it("calls bestEffortFallback with letterId after retry exhaustion", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("exhausted"));
    vi.mocked(consumeIntermediateContent).mockReturnValue({ content: "Partial draft", qualityWarnings: [] });
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(bestEffortFallback).toHaveBeenCalledWith(expect.objectContaining({ letterId: LETTER_ID }));
  });

  it("resolves without throw when bestEffortFallback delivers a degraded draft", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("exhausted"));
    vi.mocked(bestEffortFallback).mockResolvedValue(true);
    await expect(processRunPipeline(baseRunData)).resolves.toBeUndefined();
  });

  it("skips admin alert when bestEffortFallback succeeds", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("exhausted"));
    vi.mocked(bestEffortFallback).mockResolvedValue(true);
    await processRunPipeline(baseRunData);
    expect(sendJobFailedAlertEmail).not.toHaveBeenCalled();
  });
});

describe("processRunPipeline — permanent PipelineError short-circuits retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipDelays();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(getLetterRequestById).mockResolvedValue(mockLetter as never);
    vi.mocked(bestEffortFallback).mockResolvedValue(false);
    vi.mocked(getAllUsers).mockResolvedValue([] as never);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("stops after 1 attempt on CONTENT_POLICY_VIOLATION (permanent category)", async () => {
    vi.mocked(runFullPipeline).mockRejectedValueOnce(
      new PipelineError("CONTENT_POLICY_VIOLATION", "Prohibited content", "vetting")
    );
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(1);
  });

  it("stops after 1 attempt on INTAKE_INCOMPLETE (permanent category)", async () => {
    vi.mocked(runFullPipeline).mockRejectedValueOnce(
      new PipelineError("INTAKE_INCOMPLETE", "Missing fields", "intake")
    );
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(1);
  });

  it("stops after 1 attempt on API_KEY_MISSING (permanent category)", async () => {
    vi.mocked(runFullPipeline).mockRejectedValueOnce(
      new PipelineError("API_KEY_MISSING", "No API key configured", "research")
    );
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(1);
  });

  it("still calls bestEffortFallback after a permanent error", async () => {
    vi.mocked(runFullPipeline).mockRejectedValueOnce(
      new PipelineError("CONTENT_POLICY_VIOLATION", "Prohibited", "vetting")
    );
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(bestEffortFallback).toHaveBeenCalledOnce();
  });

  it("still releases lock after a permanent error", async () => {
    vi.mocked(runFullPipeline).mockRejectedValueOnce(
      new PipelineError("CONTENT_POLICY_VIOLATION", "Prohibited", "vetting")
    );
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(releasePipelineLock).toHaveBeenCalledWith(LETTER_ID);
  });

  it("retries all 4 times on API_TIMEOUT (transient category)", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(
      new PipelineError("API_TIMEOUT", "Request timed out", "research")
    );
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(4);
  });

  it("retries all 4 times on RATE_LIMITED (transient category)", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(
      new PipelineError("RATE_LIMITED", "Rate limit hit", "research")
    );
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(4);
  });

  it("retries all 4 times on a plain Error (treated as transient)", async () => {
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Unknown crash"));
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(runFullPipeline).toHaveBeenCalledTimes(4);
  });
});

describe("processRunPipeline — usage refund paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipDelays();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(getLetterRequestById).mockResolvedValue(mockLetter as never);
    vi.mocked(bestEffortFallback).mockResolvedValue(false);
    vi.mocked(getAllUsers).mockResolvedValue([] as never);
    vi.mocked(runFullPipeline).mockRejectedValue(new Error("Pipeline failed"));
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("calls decrementLettersUsed when shouldRefundOnFailure=true and not free trial", async () => {
    const data: RunPipelineJobData = { ...baseRunData, usageContext: { shouldRefundOnFailure: true, isFreeTrialSubmission: false } };
    await expect(processRunPipeline(data)).rejects.toThrow();
    expect(decrementLettersUsed).toHaveBeenCalledWith(USER_ID);
    expect(refundFreeTrialSlot).not.toHaveBeenCalled();
  });

  it("calls refundFreeTrialSlot when shouldRefundOnFailure=true and isFreeTrialSubmission=true", async () => {
    const data: RunPipelineJobData = { ...baseRunData, usageContext: { shouldRefundOnFailure: true, isFreeTrialSubmission: true } };
    await expect(processRunPipeline(data)).rejects.toThrow();
    expect(refundFreeTrialSlot).toHaveBeenCalledWith(USER_ID);
    expect(decrementLettersUsed).not.toHaveBeenCalled();
  });

  it("skips refund when usageContext is absent", async () => {
    await expect(processRunPipeline(baseRunData)).rejects.toThrow();
    expect(decrementLettersUsed).not.toHaveBeenCalled();
    expect(refundFreeTrialSlot).not.toHaveBeenCalled();
  });

  it("skips refund when bestEffortFallback delivers the degraded draft", async () => {
    vi.mocked(bestEffortFallback).mockResolvedValue(true);
    const data: RunPipelineJobData = { ...baseRunData, usageContext: { shouldRefundOnFailure: true, isFreeTrialSubmission: false } };
    await processRunPipeline(data);
    expect(decrementLettersUsed).not.toHaveBeenCalled();
    expect(refundFreeTrialSlot).not.toHaveBeenCalled();
  });
});

describe("processRunPipeline — stage-aware retry on subsequent attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipDelays();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(getLetterRequestById).mockResolvedValue(mockLetter as never);
    vi.mocked(bestEffortFallback).mockResolvedValue(false);
    vi.mocked(getAllUsers).mockResolvedValue([] as never);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("retries from 'drafting' stage when getLatestResearchRun returns a completed research run", async () => {
    const { getLatestResearchRun } = await import("./db");
    vi.mocked(runFullPipeline).mockRejectedValueOnce(new Error("drafting failed"));
    vi.mocked(getLatestResearchRun).mockResolvedValue({ resultJson: '{"facts":[]}' } as never);
    vi.mocked(retryPipelineFn).mockResolvedValue(undefined);

    await processRunPipeline(baseRunData);

    expect(retryPipelineFn).toHaveBeenCalledWith(LETTER_ID, baseRunData.intake, "drafting", USER_ID);
    expect(runFullPipeline).toHaveBeenCalledTimes(1);
  });

  it("falls back to full pipeline when getLatestResearchRun returns null", async () => {
    const { getLatestResearchRun } = await import("./db");
    vi.mocked(runFullPipeline)
      .mockRejectedValueOnce(new Error("first attempt failed"))
      .mockResolvedValueOnce(undefined);
    vi.mocked(getLatestResearchRun).mockResolvedValue(null);

    await processRunPipeline(baseRunData);

    expect(retryPipelineFn).not.toHaveBeenCalled();
    expect(runFullPipeline).toHaveBeenCalledTimes(2);
  });
});

describe("processRetryFromStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(retryPipelineFn).mockResolvedValue(undefined);
  });

  it("delegates to retryPipelineFromStage with correct arguments", async () => {
    await processRetryFromStage(baseRetryData);
    expect(retryPipelineFn).toHaveBeenCalledWith(LETTER_ID, baseRetryData.intake, "drafting", USER_ID);
  });

  it("works correctly for the 'research' stage", async () => {
    await processRetryFromStage({ ...baseRetryData, stage: "research" });
    expect(retryPipelineFn).toHaveBeenCalledWith(LETTER_ID, baseRetryData.intake, "research", USER_ID);
  });

  it("propagates errors from retryPipelineFromStage", async () => {
    vi.mocked(retryPipelineFn).mockRejectedValueOnce(new Error("Stage failed"));
    await expect(processRetryFromStage(baseRetryData)).rejects.toThrow("Stage failed");
  });
});

describe("processJob — job type router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquirePipelineLock).mockResolvedValue(true);
    vi.mocked(runFullPipeline).mockResolvedValue(undefined);
    vi.mocked(retryPipelineFn).mockResolvedValue(undefined);
    vi.mocked(getLetterRequestById).mockResolvedValue(mockLetter as never);
  });

  it("routes 'runPipeline' jobs to runFullPipeline", async () => {
    await processJob(makeMockJob(baseRunData) as Job<PipelineJobData>);
    expect(runFullPipeline).toHaveBeenCalledOnce();
    expect(retryPipelineFn).not.toHaveBeenCalled();
  });

  it("routes 'retryPipelineFromStage' jobs to retryPipelineFromStage", async () => {
    await processJob(makeMockJob(baseRetryData) as Job<PipelineJobData>);
    expect(retryPipelineFn).toHaveBeenCalledOnce();
    expect(runFullPipeline).not.toHaveBeenCalled();
  });

  it("throws for an unknown job type", async () => {
    const unknownJob = makeMockJob({ type: "runPipeline", ...baseRunData });
    unknownJob.data = { type: "unknownJobType" } as unknown as PipelineJobData;
    await expect(processJob(unknownJob as Job<PipelineJobData>)).rejects.toThrow();
  });
});
