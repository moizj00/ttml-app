import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RunPipelineJobData, RetryFromStageJobData } from "./queue";

// ─── Mock pg-boss ──────────────────────────────────────────────────────────

const { mockBoss } = vi.hoisted(() => {
  const mockBoss = {
    on: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue("job-test-id-99"),
    work: vi.fn().mockResolvedValue("worker-id"),
    createQueue: vi.fn().mockResolvedValue(undefined),
    findJobs: vi.fn().mockResolvedValue([]),
    getQueueStats: vi.fn().mockResolvedValue({ queuedCount: 0, activeCount: 0, deferredCount: 0, totalCount: 0 }),
  };
  return { mockBoss };
});

vi.mock("pg-boss", () => {
  const PgBoss = vi.fn(function MockPgBoss(this: Record<string, unknown>) {
    Object.assign(this, mockBoss);
    return this;
  });
  return { PgBoss };
});

vi.mock("./_core/env", () => ({
  ENV: { isProduction: false, databaseUrl: "postgresql://test/test", stripeSecretKey: "sk_test", sentryDsn: "" },
}));

process.env.DATABASE_URL = "postgresql://mock:5432/test";

const { enqueuePipelineJob, enqueueRetryFromStageJob, getPipelineQueue, QUEUE_NAME } = await import("./queue");

const LETTER_ID = 42;
const USER_ID = 7;

const baseRunData: RunPipelineJobData = {
  type: "runPipeline",
  letterId: LETTER_ID,
  intake: { subject: "Security Deposit", letterType: "demand_letter" },
  userId: USER_ID,
  appUrl: "https://test.example.com",
  label: "test-label",
};

const baseRetryData: RetryFromStageJobData = {
  type: "retryPipelineFromStage",
  letterId: LETTER_ID,
  intake: { subject: "Security Deposit", letterType: "demand_letter" },
  stage: "drafting",
  userId: USER_ID,
};

beforeEach(() => {
  vi.mocked(mockBoss.send).mockClear();
  vi.mocked(mockBoss.send).mockResolvedValue("job-test-id-99");
});

describe("QUEUE_NAME constant", () => {
  it("equals 'pipeline'", () => {
    expect(QUEUE_NAME).toBe("pipeline");
  });
});

describe("enqueuePipelineJob", () => {
  it("calls boss.send once", async () => {
    await enqueuePipelineJob(baseRunData);
    expect(mockBoss.send).toHaveBeenCalledOnce();
  });

  it("sends to the 'pipeline' queue", async () => {
    await enqueuePipelineJob(baseRunData);
    const [queueName] = vi.mocked(mockBoss.send).mock.calls[0];
    expect(queueName).toBe("pipeline");
  });

  it("passes correct type, letterId, and userId in job data", async () => {
    await enqueuePipelineJob(baseRunData);
    const [, jobData] = vi.mocked(mockBoss.send).mock.calls[0];
    expect(jobData).toMatchObject({ type: "runPipeline", letterId: LETTER_ID, userId: USER_ID });
  });

  it("passes a string jobId containing the letterId", async () => {
    await enqueuePipelineJob(baseRunData);
    const [, , jobOpts] = vi.mocked(mockBoss.send).mock.calls[0];
    expect(typeof (jobOpts as { id: string }).id).toBe("string");
    expect((jobOpts as { id: string }).id).toContain(String(LETTER_ID));
  });

  it("returns the job ID from boss.send", async () => {
    const id = await enqueuePipelineJob(baseRunData);
    expect(id).toBe("job-test-id-99");
  });
});

describe("enqueueRetryFromStageJob", () => {
  it("calls boss.send once", async () => {
    await enqueueRetryFromStageJob(baseRetryData);
    expect(mockBoss.send).toHaveBeenCalledOnce();
  });

  it("sends to the 'pipeline' queue", async () => {
    await enqueueRetryFromStageJob(baseRetryData);
    const [queueName] = vi.mocked(mockBoss.send).mock.calls[0];
    expect(queueName).toBe("pipeline");
  });

  it("passes type='retryPipelineFromStage', correct stage and letterId in data", async () => {
    await enqueueRetryFromStageJob(baseRetryData);
    const [, jobData] = vi.mocked(mockBoss.send).mock.calls[0];
    expect(jobData).toMatchObject({ type: "retryPipelineFromStage", letterId: LETTER_ID, stage: "drafting" });
  });

  it("uses a singletonKey containing the letter ID", async () => {
    await enqueueRetryFromStageJob(baseRetryData);
    const [, , jobOpts] = vi.mocked(mockBoss.send).mock.calls[0];
    expect((jobOpts as { singletonKey: string }).singletonKey).toContain("letter-42");
  });

  it("works correctly for the 'research' stage", async () => {
    await enqueueRetryFromStageJob({ ...baseRetryData, stage: "research" });
    const [, jobData] = vi.mocked(mockBoss.send).mock.calls[0];
    expect((jobData as RetryFromStageJobData).stage).toBe("research");
  });

  it("returns the job ID from boss.send", async () => {
    const id = await enqueueRetryFromStageJob(baseRetryData);
    expect(id).toBe("job-test-id-99");
  });

  it("returns the singletonKey when boss.send returns null (duplicate job)", async () => {
    vi.mocked(mockBoss.send).mockResolvedValueOnce(null);
    const id = await enqueueRetryFromStageJob(baseRetryData);
    expect(id).toContain("retry");
    expect(id).toContain("drafting");
  });
});

describe("getPipelineQueue shim", () => {
  it("getWaitingCount returns a number", async () => {
    const queue = getPipelineQueue();
    const count = await queue.getWaitingCount();
    expect(typeof count).toBe("number");
  });

  it("getActiveCount returns a number", async () => {
    const queue = getPipelineQueue();
    const count = await queue.getActiveCount();
    expect(typeof count).toBe("number");
  });

  it("getFailedCount returns a number", async () => {
    const queue = getPipelineQueue();
    const count = await queue.getFailedCount();
    expect(typeof count).toBe("number");
  });

  it("getFailed returns an array", async () => {
    const queue = getPipelineQueue();
    const jobs = await queue.getFailed(0, 9);
    expect(Array.isArray(jobs)).toBe(true);
  });

  it("getCompleted returns an array", async () => {
    const queue = getPipelineQueue();
    const jobs = await queue.getCompleted(0, 9);
    expect(Array.isArray(jobs)).toBe(true);
  });
});
