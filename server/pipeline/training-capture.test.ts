import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockFile = vi.fn(() => ({ save: mockSave }));
const mockBucket = vi.fn(() => ({ file: mockFile }));

vi.mock("../db/core", () => ({
  getDb: vi.fn(),
}));
vi.mock("../sentry", () => ({
  captureServerException: vi.fn(),
}));
vi.mock("../../drizzle/schema", () => ({
  trainingLog: Symbol("trainingLog"),
}));
vi.mock("@google-cloud/storage", () => ({
  Storage: class MockStorage {
    bucket = mockBucket;
  },
}));

const { getDb } = await import("../db/core");
const { captureServerException } = await import("../sentry");
const { captureTrainingExample } = await import("./training-capture");

const mockGetDb = vi.mocked(getDb);
const mockCapture = vi.mocked(captureServerException);

function makeIntake() {
  return {
    schemaVersion: "1.0",
    letterType: "demand",
    sender: { name: "John Doe", address: "123 Main St" },
    recipient: { name: "Jane Corp", address: "456 Oak Ave" },
    jurisdiction: { country: "US", state: "CA" },
    matter: {
      category: "contract",
      subject: "Unpaid Invoice",
      description: "Breach of contract for services rendered",
    },
    desiredOutcome: "Full payment of $5,000",
  };
}

describe("training-capture", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      GCS_TRAINING_BUCKET: "ttml-training",
      GCP_PROJECT_ID: "ttml-test-project",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("captureTrainingExample", () => {
    it("uploads to GCS and inserts DB record when GCS is configured", async () => {
      const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      mockGetDb.mockResolvedValue({ insert: mockInsert } as any);

      await captureTrainingExample(
        42,
        "demand",
        "CA",
        makeIntake() as any,
        "Dear Jane Corp, we hereby demand...",
      );

      expect(mockSave).toHaveBeenCalledOnce();
      expect(mockInsert).toHaveBeenCalledOnce();
      const valuesCall = mockInsert.mock.results[0].value.values;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({
          letterRequestId: 42,
          letterType: "demand",
          jurisdiction: "CA",
          gcsPath: expect.stringContaining("gs://ttml-training/training-data/"),
          tokenCount: expect.any(Number),
        }),
      );
    });

    it("skips GCS upload when env vars are missing", async () => {
      delete process.env.GCS_TRAINING_BUCKET;
      delete process.env.GCP_PROJECT_ID;

      const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      mockGetDb.mockResolvedValue({ insert: mockInsert } as any);

      await captureTrainingExample(42, "demand", "CA", makeIntake() as any, "content");

      expect(mockSave).not.toHaveBeenCalled();
      const valuesCall = mockInsert.mock.results[0].value.values;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({
          gcsPath: null,
        }),
      );
    });

    it("still inserts DB record when GCS upload fails", async () => {
      mockSave.mockRejectedValueOnce(new Error("GCS down"));

      const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      mockGetDb.mockResolvedValue({ insert: mockInsert } as any);

      await captureTrainingExample(42, "demand", "CA", makeIntake() as any, "content");

      expect(mockInsert).toHaveBeenCalledOnce();
      expect(mockCapture).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { component: "training_capture", error_type: "gcs_upload_failed" },
        }),
      );
    });

    it("handles null jurisdiction", async () => {
      const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      mockGetDb.mockResolvedValue({ insert: mockInsert } as any);

      await captureTrainingExample(42, "cease_desist", null, makeIntake() as any, "content");

      const valuesCall = mockInsert.mock.results[0].value.values;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({ jurisdiction: null }),
      );
    });

    it("estimates token count as ceil(length / 4)", async () => {
      const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      mockGetDb.mockResolvedValue({ insert: mockInsert } as any);

      const content = "x".repeat(400);
      await captureTrainingExample(42, "demand", "CA", makeIntake() as any, content);

      const valuesCall = mockInsert.mock.results[0].value.values;
      const args = valuesCall.mock.calls[0][0];
      expect(args.tokenCount).toBeGreaterThan(0);
    });

    it("catches top-level errors and reports to Sentry", async () => {
      mockGetDb.mockRejectedValue(new Error("DB connect fail"));

      await captureTrainingExample(42, "demand", "CA", makeIntake() as any, "content");

      expect(mockCapture).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { component: "training_capture", error_type: "capture_failed" },
        }),
      );
    });

    it("builds training example with correct message structure", async () => {
      const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      mockGetDb.mockResolvedValue({ insert: mockInsert } as any);

      await captureTrainingExample(42, "demand", "CA", makeIntake() as any, "Final letter content");

      expect(mockSave).toHaveBeenCalledOnce();
      const savedContent = mockSave.mock.calls[0][0] as string;
      const parsed = JSON.parse(savedContent.trim());
      expect(parsed.messages).toHaveLength(3);
      expect(parsed.messages[0].role).toBe("system");
      expect(parsed.messages[1].role).toBe("user");
      expect(parsed.messages[2].role).toBe("assistant");
      expect(parsed.messages[2].content).toBe("Final letter content");
      expect(parsed.messages[1].content).toContain("Letter Type: demand");
      expect(parsed.messages[1].content).toContain("Jurisdiction: CA, US");
    });
  });
});
