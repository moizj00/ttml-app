import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/core", () => ({
  getDb: vi.fn(),
}));
vi.mock("../sentry", () => ({
  captureServerException: vi.fn(),
}));
vi.mock("../db/review-actions", () => ({
  logReviewAction: vi.fn(),
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  ne: vi.fn(),
  desc: vi.fn(),
  lt: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("../../drizzle/schema", () => ({
  letterRequests: {
    id: Symbol("id"),
    status: Symbol("status"),
    assignedReviewerId: Symbol("assignedReviewerId"),
  },
  reviewActions: Symbol("reviewActions"),
  users: Symbol("users"),
  adminVerificationCodes: Symbol("adminVerificationCodes"),
  attachments: Symbol("attachments"),
  blogPosts: Symbol("blogPosts"),
  commissionLedger: Symbol("commissionLedger"),
  discountCodes: Symbol("discountCodes"),
  emailVerificationTokens: Symbol("emailVerificationTokens"),
  letterVersions: Symbol("letterVersions"),
  letterQualityScores: Symbol("letterQualityScores"),
  notifications: Symbol("notifications"),
  payoutRequests: Symbol("payoutRequests"),
  pipelineLessons: Symbol("pipelineLessons"),
  researchRuns: Symbol("researchRuns"),
  subscriptions: Symbol("subscriptions"),
  workflowJobs: Symbol("workflowJobs"),
}));

const { getDb } = await import("../db/core");
const { logReviewAction } = await import("../db/review-actions");
const { updateLetterStatus } = await import("../db/letters");

const mockGetDb = vi.mocked(getDb);
const mockLogReviewAction = vi.mocked(logReviewAction);

function makeForceTransitionDb(opts: { currentStatus?: string } = {}) {
  const fromStatus = opts.currentStatus ?? "submitted";

  const mockReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  const mockLimit = vi.fn().mockResolvedValue([{ status: fromStatus }]);
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  return {
    select: mockSelect,
    update: mockUpdate,
  } as any;
}

function makeNormalTransitionDb() {
  const mockReturning = vi.fn().mockResolvedValue([{ id: 1, status: "researching" }]);
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  return {
    update: mockUpdate,
  } as any;
}

describe("Force-Transition Audit Logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs force_transition action via logReviewAction when force=true", async () => {
    const db = makeForceTransitionDb({ currentStatus: "submitted" });
    mockGetDb.mockResolvedValue(db);
    mockLogReviewAction.mockResolvedValue(undefined as any);

    await updateLetterStatus(1, "researching", {
      force: true,
      reason: "Admin override",
    });

    expect(mockLogReviewAction).toHaveBeenCalledOnce();
    expect(mockLogReviewAction).toHaveBeenCalledWith({
      letterRequestId: 1,
      actorType: "system",
      action: "force_transition",
      fromStatus: "submitted",
      toStatus: "researching",
      noteText: "Admin override",
      noteVisibility: "internal",
    });
  });

  it("uses default note text when no reason is provided", async () => {
    const db = makeForceTransitionDb({ currentStatus: "drafting" });
    mockGetDb.mockResolvedValue(db);
    mockLogReviewAction.mockResolvedValue(undefined as any);

    await updateLetterStatus(1, "sent", { force: true });

    expect(mockLogReviewAction).toHaveBeenCalledWith(
      expect.objectContaining({
        noteText: "Forced transition: drafting → sent",
      })
    );
  });

  it("does NOT call logReviewAction for normal (non-force) transitions", async () => {
    const db = makeNormalTransitionDb();
    mockGetDb.mockResolvedValue(db);

    await updateLetterStatus(1, "researching");

    expect(mockLogReviewAction).not.toHaveBeenCalled();
  });

  it("succeeds even when audit logging fails (non-blocking)", async () => {
    const db = makeForceTransitionDb({ currentStatus: "submitted" });
    mockGetDb.mockResolvedValue(db);
    mockLogReviewAction.mockRejectedValue(new Error("Audit DB down"));

    await expect(
      updateLetterStatus(1, "researching", { force: true })
    ).resolves.not.toThrow();

    expect(mockLogReviewAction).toHaveBeenCalledOnce();
  });

  it("throws when letter is not found during force transition", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

    const db = { select: mockSelect, update: mockUpdate } as any;
    mockGetDb.mockResolvedValue(db);

    await expect(
      updateLetterStatus(999, "researching", { force: true })
    ).rejects.toThrow("Letter 999 not found");

    expect(mockLogReviewAction).not.toHaveBeenCalled();
  });
});
