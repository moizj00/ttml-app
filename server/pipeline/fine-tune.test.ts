import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock the pino logger so we can assert on logger.warn / logger.info calls
const mockLoggerWarn = vi.fn();
const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();
vi.mock("../logger", () => ({
  logger: {
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
    error: mockLoggerError,
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
  },
}));

const mockDownload = vi.fn();
const mockGcsSave = vi.fn().mockResolvedValue(undefined);
const mockGcsFile = vi.fn(() => ({ download: mockDownload, save: mockGcsSave }));
const mockGcsBucket = vi.fn(() => ({ file: mockGcsFile }));

const mockGetAccessToken = vi.fn().mockResolvedValue({ token: "fake-access-token" });
const mockGetClient = vi.fn().mockResolvedValue({ getAccessToken: mockGetAccessToken });

vi.mock("../db/core", () => ({
  getDb: vi.fn(),
}));
vi.mock("../sentry", () => ({
  captureServerException: vi.fn(),
}));
vi.mock("../../drizzle/schema", () => ({
  fineTuneRuns: Symbol("fineTuneRuns"),
}));
vi.mock("@google-cloud/storage", () => ({
  Storage: class MockStorage {
    bucket = mockGcsBucket;
  },
}));
vi.mock("google-auth-library", () => ({
  GoogleAuth: class MockGoogleAuth {
    getClient = mockGetClient;
  },
}));

const { getDb } = await import("../db/core");
const { captureServerException } = await import("../sentry");
const { checkAndTriggerFineTune } = await import("./fine-tune");

const mockGetDb = vi.mocked(getDb);
const mockCapture = vi.mocked(captureServerException);

describe("fine-tune", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      GCP_PROJECT_ID: "ttml-test",
      GCP_REGION: "us-west1",
      GCS_TRAINING_BUCKET: "ttml-training",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("checkAndTriggerFineTune", () => {
      it("skips when Vertex AI is not configured", async () => {
      delete process.env.GCP_PROJECT_ID;
      delete process.env.GCP_REGION;
      delete process.env.GCS_TRAINING_BUCKET;
      await checkAndTriggerFineTune();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Vertex AI not configured"),
      );
    });

    it("skips when a fine-tune run is already in progress", async () => {
      const mockExecute = vi.fn()
        .mockResolvedValueOnce([{ cnt: 1 }]);
      mockGetDb.mockResolvedValue({ execute: mockExecute } as any);
      await checkAndTriggerFineTune();
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.stringContaining("already in progress"),
      );
    });

    it("skips when example count is below threshold (50)", async () => {
      const mockExecute = vi.fn()
        .mockResolvedValueOnce([{ cnt: 0 }])
        .mockResolvedValueOnce([{ cnt: 25 }]);
      mockGetDb.mockResolvedValue({ execute: mockExecute } as any);
      await checkAndTriggerFineTune();
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.stringContaining("25 training examples"),
      );
    });

    it("skips when no training files found in training_log", async () => {
      const mockExecute = vi.fn()
        .mockResolvedValueOnce([{ cnt: 0 }])
        .mockResolvedValueOnce([{ cnt: 60 }])
        .mockResolvedValueOnce([]);
      mockGetDb.mockResolvedValue({ execute: mockExecute } as any);
      await checkAndTriggerFineTune();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("No training files found"),
      );
    });

    it("triggers fine-tune when threshold is met", async () => {
      const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      const mockExecute = vi.fn()
        .mockResolvedValueOnce([{ cnt: 0 }])
        .mockResolvedValueOnce([{ cnt: 55 }])
        .mockResolvedValueOnce([
          { gcs_path: "gs://ttml-training/training-data/2026/03/31/letter-1-123.jsonl" },
          { gcs_path: "gs://ttml-training/training-data/2026/03/31/letter-2-456.jsonl" },
        ]);

      mockGetDb.mockResolvedValue({ execute: mockExecute, insert: mockInsert } as any);
      mockDownload.mockResolvedValue([Buffer.from('{"messages":[{"role":"system","content":"sys"}]}\n')]);

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ name: "projects/ttml-test/locations/us-west1/tuningJobs/123" }), { status: 200 }),
      );

      vi.spyOn(console, "log").mockImplementation(() => {});
      await checkAndTriggerFineTune();

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain("us-west1-aiplatform.googleapis.com");
      expect(url).toContain("tuningJobs");
      const body = JSON.parse(opts!.body as string);
      expect(body.baseModel).toBe("gemini-1.5-flash-002");
      expect(body.supervisedTuningSpec.trainingDatasetUri).toContain("gs://ttml-training/fine-tune-datasets/");

      expect(mockInsert).toHaveBeenCalledOnce();
    });

    it("handles Vertex AI API errors gracefully", async () => {
      const mockExecute = vi.fn()
        .mockResolvedValueOnce([{ cnt: 0 }])
        .mockResolvedValueOnce([{ cnt: 55 }])
        .mockResolvedValueOnce([
          { gcs_path: "gs://ttml-training/training-data/letter-1.jsonl" },
        ]);

      mockGetDb.mockResolvedValue({ execute: mockExecute } as any);
      mockDownload.mockResolvedValue([Buffer.from('{"messages":[]}\n')]);

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("quota exceeded", { status: 429 }),
      );

      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});

      await checkAndTriggerFineTune();

      expect(mockCapture).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { component: "fine_tune", error_type: "trigger_failed" },
        }),
      );
    });

    it("deduplicates GCS paths before merging", async () => {
      const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      const mockExecute = vi.fn()
        .mockResolvedValueOnce([{ cnt: 0 }])
        .mockResolvedValueOnce([{ cnt: 50 }])
        .mockResolvedValueOnce([
          { gcs_path: "gs://ttml-training/training-data/letter-1.jsonl" },
          { gcs_path: "gs://ttml-training/training-data/letter-1.jsonl" },
          { gcs_path: "gs://ttml-training/training-data/letter-2.jsonl" },
        ]);

      mockGetDb.mockResolvedValue({ execute: mockExecute, insert: mockInsert } as any);
      mockDownload.mockResolvedValue([Buffer.from('{"messages":[]}\n')]);

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ name: "job/123" }), { status: 200 }),
      );
      vi.spyOn(console, "log").mockImplementation(() => {});

      await checkAndTriggerFineTune();

      expect(mockDownload).toHaveBeenCalledTimes(2);
    });

    it("parses integer cnt from string", async () => {
      const mockExecute = vi.fn()
        .mockResolvedValueOnce([{ cnt: "0" }])
        .mockResolvedValueOnce([{ cnt: "10" }]);

      mockGetDb.mockResolvedValue({ execute: mockExecute } as any);

      vi.spyOn(console, "log").mockImplementation(() => {});
      await checkAndTriggerFineTune();
    });

    it("returns early when db is null for count queries", async () => {
      mockGetDb.mockResolvedValue(null as any);

      vi.spyOn(console, "log").mockImplementation(() => {});
      await checkAndTriggerFineTune();
    });

    it("records job in fine_tune_runs table on success", async () => {
      const valuesF = vi.fn().mockResolvedValue(undefined);
      const mockInsert = vi.fn().mockReturnValue({ values: valuesF });
      const mockExecute = vi.fn()
        .mockResolvedValueOnce([{ cnt: 0 }])
        .mockResolvedValueOnce([{ cnt: 50 }])
        .mockResolvedValueOnce([{ gcs_path: "gs://ttml-training/training-data/letter-1.jsonl" }]);

      mockGetDb.mockResolvedValue({ execute: mockExecute, insert: mockInsert } as any);
      mockDownload.mockResolvedValue([Buffer.from('{"messages":[]}\n')]);

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ name: "tuningJobs/abc-123" }), { status: 200 }),
      );
      vi.spyOn(console, "log").mockImplementation(() => {});

      await checkAndTriggerFineTune();

      expect(valuesF).toHaveBeenCalledWith(
        expect.objectContaining({
          vertexJobId: "tuningJobs/abc-123",
          baseModel: "gemini-1.5-flash-002",
          trainingExampleCount: 50,
          status: "submitted",
          gcsTrainingFile: expect.stringContaining("gs://ttml-training/fine-tune-datasets/"),
        }),
      );
    });
  });
});
