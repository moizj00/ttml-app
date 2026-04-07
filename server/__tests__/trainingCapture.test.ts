import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db/core", () => ({
  getDb: vi.fn(),
}));
vi.mock("../sentry", () => ({
  captureServerException: vi.fn(),
}));
vi.mock("../../drizzle/schema", () => ({
  trainingLog: Symbol("trainingLog"),
  letterRequests: Symbol("letterRequests"),
  users: Symbol("users"),
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));
vi.mock("@google-cloud/storage", () => ({
  Storage: class MockStorage {
    bucket = vi.fn(() => ({
      file: vi.fn(() => ({
        save: vi.fn().mockResolvedValue(undefined),
      })),
    }));
  },
}));

const { getDb } = await import("../db/core");
const { captureTrainingExample } = await import("../pipeline/training-capture");

const mockGetDb = vi.mocked(getDb);

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

function makeChainableSelect(results: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(results),
      }),
    }),
  };
}

function makeMockDb(opts: { userId?: number | null; consented?: boolean }) {
  let selectCallCount = 0;
  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });

  return {
    db: {
      select: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return makeChainableSelect(
            opts.userId != null ? [{ userId: opts.userId }] : []
          );
        }
        return makeChainableSelect(
          opts.userId != null
            ? [{ consentToTraining: opts.consented ?? false }]
            : []
        );
      }),
      insert: mockInsert,
    } as any,
    mockInsert,
  };
}

describe("Training Capture — Consent Gating", () => {
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

  it("captures training data when user has consented", async () => {
    const { db, mockInsert } = makeMockDb({ userId: 1, consented: true });
    mockGetDb.mockResolvedValue(db);

    await captureTrainingExample(42, "demand", "CA", makeIntake() as any, "Letter content");

    expect(mockInsert).toHaveBeenCalledOnce();
    const valuesCall = mockInsert.mock.results[0].value.values;
    expect(valuesCall).toHaveBeenCalledWith(
      expect.objectContaining({
        letterRequestId: 42,
        letterType: "demand",
        jurisdiction: "CA",
      })
    );
  });

  it("skips capture when user has NOT consented", async () => {
    const { db, mockInsert } = makeMockDb({ userId: 1, consented: false });
    mockGetDb.mockResolvedValue(db);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await captureTrainingExample(42, "demand", "CA", makeIntake() as any, "Letter content");

    expect(mockInsert).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("user has not consented")
    );
    consoleSpy.mockRestore();
  });

  it("skips gracefully when letter is not found (no userId)", async () => {
    const { db, mockInsert } = makeMockDb({ userId: null });
    mockGetDb.mockResolvedValue(db);

    await captureTrainingExample(99, "demand", "CA", makeIntake() as any, "Letter content");

    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it("skips gracefully when user record is not found", async () => {
    let selectCallCount = 0;
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const db = {
      select: vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return makeChainableSelect([{ userId: 999 }]);
        }
        return makeChainableSelect([]);
      }),
      insert: mockInsert,
    } as any;
    mockGetDb.mockResolvedValue(db);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await captureTrainingExample(42, "demand", "CA", makeIntake() as any, "Letter content");

    expect(mockInsert).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("user has not consented")
    );
    consoleSpy.mockRestore();
  });

  it("exits silently when DB is unavailable (getDb returns null)", async () => {
    mockGetDb.mockResolvedValue(null as any);

    await captureTrainingExample(42, "demand", "CA", makeIntake() as any, "Letter content");

    expect(mockGetDb).toHaveBeenCalled();
  });
});
