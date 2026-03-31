/**
 * server/queue.test.ts
 *
 * Unit tests for enqueuePipelineJob and enqueueRetryFromStageJob.
 *
 * Strategy:
 *  - vi.hoisted() creates the mockQueue object BEFORE any vi.mock() factory runs,
 *    so the factory can safely reference it in a closure.
 *  - BullMQ Queue is replaced with a plain function constructor that returns
 *    mockQueue (avoids the "arrow function is not a constructor" error).
 *  - IORedis is replaced with a class (same reason).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ════════════════════════════════════════════════════════════════════════════
// HOISTED REFERENCES  (available inside vi.mock() factories below)
// ════════════════════════════════════════════════════════════════════════════

const { mockQueue } = vi.hoisted(() => {
  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: "job-default-id" }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { mockQueue };
});

// ════════════════════════════════════════════════════════════════════════════
// MOCKS
// ════════════════════════════════════════════════════════════════════════════

vi.mock("bullmq", () => {
  // Use a regular function (not arrow) so `new Queue(...)` works.
  function Queue() { return mockQueue; }
  function Worker() { return { on: vi.fn(), close: vi.fn() }; }
  return { Queue, Worker };
});

// IORedis must be a class/function, not an arrow function, to support `new`.
vi.mock("ioredis", () => {
  function IORedis(_url?: string, _opts?: object) {
    return { on: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), status: "ready" };
  }
  return { default: IORedis };
});

vi.mock("./_core/env", () => ({
  ENV: {
    isProduction: false,
    databaseUrl: "postgresql://test:test@localhost/test",
    stripeSecretKey: "sk_test",
    sentryDsn: "",
  },
}));

// ════════════════════════════════════════════════════════════════════════════
// IMPORTS  (after mocks)
// ════════════════════════════════════════════════════════════════════════════

// Set the Redis URL before importing queue.ts so buildRedisConnection() follows
// the IORedis path (which is mocked above).
process.env.UPSTASH_REDIS_URL = "redis://mock:6379";

const {
  enqueuePipelineJob,
  enqueueRetryFromStageJob,
  getPipelineQueue,
  QUEUE_NAME,
} = await import("./queue");

// ════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ════════════════════════════════════════════════════════════════════════════

const LETTER_ID = 42;
const USER_ID = 7;

const baseRunData = {
  type: "runPipeline" as const,
  letterId: LETTER_ID,
  intake: { subject: "Security Deposit", letterType: "demand_letter" },
  userId: USER_ID,
  appUrl: "https://test.example.com",
  label: "test-label",
};

const baseRetryData = {
  type: "retryPipelineFromStage" as const,
  letterId: LETTER_ID,
  intake: { subject: "Security Deposit", letterType: "demand_letter" },
  stage: "drafting" as const,
  userId: USER_ID,
};

// ════════════════════════════════════════════════════════════════════════════
// SETUP
// ════════════════════════════════════════════════════════════════════════════

beforeAll(() => {
  // Trigger the lazy queue construction so getPipelineQueue() has been called.
  getPipelineQueue();
});

beforeEach(() => {
  vi.mocked(mockQueue.add).mockClear();
  vi.mocked(mockQueue.add).mockResolvedValue({ id: "job-test-id-99" });
});

// ════════════════════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════════════════════

describe("QUEUE_NAME constant", () => {
  it("equals 'pipeline'", () => {
    expect(QUEUE_NAME).toBe("pipeline");
  });
});

describe("enqueuePipelineJob", () => {
  it("calls queue.add exactly once", async () => {
    await enqueuePipelineJob(baseRunData);
    expect(mockQueue.add).toHaveBeenCalledOnce();
  });

  it("job name contains 'pipeline' and the letterId", async () => {
    await enqueuePipelineJob(baseRunData);
    const [jobName] = vi.mocked(mockQueue.add).mock.calls[0];
    expect(jobName).toContain("pipeline");
    expect(jobName).toContain(String(LETTER_ID));
  });

  it("passes correct type, letterId, and userId in job data", async () => {
    await enqueuePipelineJob(baseRunData);
    const [, jobData] = vi.mocked(mockQueue.add).mock.calls[0];
    expect(jobData).toMatchObject({
      type: "runPipeline",
      letterId: LETTER_ID,
      userId: USER_ID,
    });
  });

  it("passes a jobId option string containing the letterId", async () => {
    await enqueuePipelineJob(baseRunData);
    const [, , jobOpts] = vi.mocked(mockQueue.add).mock.calls[0];
    expect(typeof jobOpts?.jobId).toBe("string");
    expect(jobOpts.jobId).toContain(String(LETTER_ID));
  });

  it("returns the job ID string from queue.add", async () => {
    const id = await enqueuePipelineJob(baseRunData);
    expect(typeof id).toBe("string");
    expect(id).toBe("job-test-id-99");
  });
});

describe("enqueueRetryFromStageJob", () => {
  it("calls queue.add exactly once", async () => {
    await enqueueRetryFromStageJob(baseRetryData);
    expect(mockQueue.add).toHaveBeenCalledOnce();
  });

  it("job name contains 'retry', stage, and letterId", async () => {
    await enqueueRetryFromStageJob(baseRetryData);
    const [jobName] = vi.mocked(mockQueue.add).mock.calls[0];
    expect(jobName).toContain("retry");
    expect(jobName).toContain("drafting");
    expect(jobName).toContain(String(LETTER_ID));
  });

  it("passes type='retryPipelineFromStage', correct stage and letterId in data", async () => {
    await enqueueRetryFromStageJob(baseRetryData);
    const [, jobData] = vi.mocked(mockQueue.add).mock.calls[0];
    expect(jobData).toMatchObject({
      type: "retryPipelineFromStage",
      letterId: LETTER_ID,
      stage: "drafting",
    });
  });

  it("passes a jobId containing 'retry' and the stage name", async () => {
    await enqueueRetryFromStageJob(baseRetryData);
    const [, , jobOpts] = vi.mocked(mockQueue.add).mock.calls[0];
    expect(jobOpts?.jobId).toContain("retry");
    expect(jobOpts.jobId).toContain("drafting");
  });

  it("works correctly for the 'research' stage", async () => {
    await enqueueRetryFromStageJob({ ...baseRetryData, stage: "research" });
    const [, jobData] = vi.mocked(mockQueue.add).mock.calls[0];
    expect(jobData.stage).toBe("research");
  });

  it("returns the job ID string from queue.add", async () => {
    const id = await enqueueRetryFromStageJob(baseRetryData);
    expect(typeof id).toBe("string");
    expect(id).toBe("job-test-id-99");
  });
});
