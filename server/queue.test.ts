import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { RunPipelineJobData, RetryFromStageJobData } from "./queue";

const { mockQueue } = vi.hoisted(() => {
  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: "job-default-id" }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { mockQueue };
});

vi.mock("bullmq", () => {
  const Queue = vi.fn(function MockQueue(this: Record<string, unknown>) {
    Object.assign(this, mockQueue);
    return this;
  });
  function Worker(this: Record<string, unknown>) {
    this.on = vi.fn();
    this.close = vi.fn();
    return this;
  }
  return { Queue, Worker };
});

vi.mock("ioredis", () => {
  function IORedis(this: Record<string, unknown>) {
    this.on = vi.fn();
    this.connect = vi.fn();
    this.disconnect = vi.fn();
    this.status = "ready";
    return this;
  }
  return { default: IORedis };
});

vi.mock("./_core/env", () => ({
  ENV: { isProduction: false, databaseUrl: "postgresql://test/test", stripeSecretKey: "sk_test", sentryDsn: "" },
}));

process.env.UPSTASH_REDIS_URL = "redis://mock:6379";

const { Queue: BullQueue } = await import("bullmq");
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

beforeAll(() => { getPipelineQueue(); });

beforeEach(() => {
  vi.mocked(mockQueue.add).mockClear();
  vi.mocked(mockQueue.add).mockResolvedValue({ id: "job-test-id-99" });
});

describe("QUEUE_NAME constant", () => {
  it("equals 'pipeline'", () => {
    expect(QUEUE_NAME).toBe("pipeline");
  });
});

describe("Queue construction options", () => {
  it("sets defaultJobOptions.attempts to 1 (worker-side retry handles backoff)", () => {
    const [[, queueOpts]] = vi.mocked(BullQueue).mock.calls;
    expect((queueOpts as { defaultJobOptions: { attempts: number } }).defaultJobOptions.attempts).toBe(1);
  });

  it("configures removeOnComplete to keep the last 200 completed jobs", () => {
    const [[, queueOpts]] = vi.mocked(BullQueue).mock.calls;
    expect((queueOpts as { defaultJobOptions: { removeOnComplete: { count: number } } }).defaultJobOptions.removeOnComplete).toMatchObject({ count: 200 });
  });

  it("configures removeOnFail to keep the last 500 failed jobs", () => {
    const [[, queueOpts]] = vi.mocked(BullQueue).mock.calls;
    expect((queueOpts as { defaultJobOptions: { removeOnFail: { count: number } } }).defaultJobOptions.removeOnFail).toMatchObject({ count: 500 });
  });
});

describe("enqueuePipelineJob", () => {
  it("calls queue.add once", async () => {
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
    expect(jobData).toMatchObject({ type: "runPipeline", letterId: LETTER_ID, userId: USER_ID });
  });

  it("passes a string jobId containing the letterId", async () => {
    await enqueuePipelineJob(baseRunData);
    const [, , jobOpts] = vi.mocked(mockQueue.add).mock.calls[0];
    expect(typeof (jobOpts as { jobId: string }).jobId).toBe("string");
    expect((jobOpts as { jobId: string }).jobId).toContain(String(LETTER_ID));
  });

  it("returns the job ID from queue.add", async () => {
    const id = await enqueuePipelineJob(baseRunData);
    expect(id).toBe("job-test-id-99");
  });
});

describe("enqueueRetryFromStageJob", () => {
  it("calls queue.add once", async () => {
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
    expect(jobData).toMatchObject({ type: "retryPipelineFromStage", letterId: LETTER_ID, stage: "drafting" });
  });

  it("jobId contains 'retry' and the stage name", async () => {
    await enqueueRetryFromStageJob(baseRetryData);
    const [, , jobOpts] = vi.mocked(mockQueue.add).mock.calls[0];
    expect((jobOpts as { jobId: string }).jobId).toContain("retry");
    expect((jobOpts as { jobId: string }).jobId).toContain("drafting");
  });

  it("works correctly for the 'research' stage", async () => {
    await enqueueRetryFromStageJob({ ...baseRetryData, stage: "research" });
    const [, jobData] = vi.mocked(mockQueue.add).mock.calls[0];
    expect((jobData as RetryFromStageJobData).stage).toBe("research");
  });

  it("returns the job ID from queue.add", async () => {
    const id = await enqueueRetryFromStageJob(baseRetryData);
    expect(id).toBe("job-test-id-99");
  });
});
