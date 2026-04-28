/**
 * Phase 97 — Letter lifecycle baseline coverage
 *
 * End-to-end-shaped integration tests covering three behaviours that
 * shipped recently and weren't covered by the existing per-feature
 * test files:
 *
 *   1. Attorney `approve` mutation now AUTO-ADVANCES status from
 *      `approved` → `client_approval_pending` so the subscriber gets
 *      action buttons immediately. Without this, letters got stuck at
 *      `approved` and the subscriber had nothing to click. The
 *      existing `review-approval-flow.test.ts:508` test names this
 *      behaviour ("auto-forward to client_approval_pending") but only
 *      asserts the first `updateLetterStatus(42, "approved", ...)` call
 *      — the actual auto-advance was untested. We add real assertions.
 *
 *   2. New subscriber-callable `letters.generateOrFetchPdf` mutation
 *      lets the subscriber recover when upstream attorney-side PDF
 *      generation failed silently (or the presigned URL expired).
 *      Tested cases:
 *        - fast path: stored key already exists → re-presign
 *        - slow path: no stored key → render + upload
 *        - unauthorized: not the letter owner → NOT_FOUND
 *        - wrong status: still pending_review → BAD_REQUEST
 *        - missing final version: PRECONDITION_FAILED
 *
 *   3. `sendLetterToRecipientFlow` now attaches the PDF (was passing
 *      `pdfUrl: undefined` with a TODO comment). Tested cases:
 *        - happy path: stored key → mints fresh URL → email gets pdfUrl
 *        - missing key: lazy-generates → email gets pdfUrl
 *        - PDF generation fails entirely: falls back to htmlContent only
 *
 * Mock pattern mirrors `review-approval-flow.test.ts` and
 * `phase74-pipeline-sync.test.ts` for consistency. All external boundaries
 * (R2 storage, Anthropic, Resend, Stripe) are mocked at the module level.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Module mocks ──────────────────────────────────────────────────────────

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: "mock-email-id", error: null }),
    },
  })),
}));

vi.mock("./sentry", () => ({
  captureServerException: vi.fn(),
  initServerSentry: vi.fn(),
}));

const mockGetLetterRequestById = vi.fn();
const mockUpdateLetterStatus = vi.fn();
const mockUpdateLetterPdfUrl = vi.fn();
const mockUpdateLetterStoragePath = vi.fn();
const mockGetLetterVersionsByRequestId = vi.fn();
const mockGetReviewActions = vi.fn();
const mockLogReviewAction = vi.fn();
const mockCreateLetterVersion = vi.fn();
const mockUpdateLetterVersionPointers = vi.fn();
const mockCreateNotification = vi.fn();
const mockGetUserById = vi.fn();

vi.mock("./db", () => ({
  getLetterRequestById: (...args: unknown[]) =>
    mockGetLetterRequestById(...args),
  updateLetterStatus: (...args: unknown[]) => mockUpdateLetterStatus(...args),
  updateLetterPdfUrl: (...args: unknown[]) => mockUpdateLetterPdfUrl(...args),
  updateLetterStoragePath: (...args: unknown[]) =>
    mockUpdateLetterStoragePath(...args),
  getLetterVersionsByRequestId: (...args: unknown[]) =>
    mockGetLetterVersionsByRequestId(...args),
  getReviewActions: (...args: unknown[]) => mockGetReviewActions(...args),
  logReviewAction: (...args: unknown[]) => mockLogReviewAction(...args),
  createLetterVersion: (...args: unknown[]) => mockCreateLetterVersion(...args),
  updateLetterVersionPointers: (...args: unknown[]) =>
    mockUpdateLetterVersionPointers(...args),
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  // Other db exports — present so `import { ... } from "./db"` resolves.
  notifyAdmins: vi.fn(),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getAllLetterRequests: vi.fn().mockResolvedValue([]),
  getWorkflowJobsByLetterId: vi.fn().mockResolvedValue([]),
  getResearchRunsByLetterId: vi.fn().mockResolvedValue([]),
  getAttachmentsByLetterId: vi.fn().mockResolvedValue([]),
  getLetterRequestsByUserId: vi.fn().mockResolvedValue([]),
  getLetterRequestSafeForSubscriber: vi.fn(),
  archiveLetterRequest: vi.fn(),
  createDeliveryLogEntry: vi.fn(),
  getDeliveryLogByLetterId: vi.fn().mockResolvedValue([]),
  createAttachment: vi.fn(),
  createLetterRequest: vi.fn(),
  createClientPortalToken: vi.fn(),
  decrementLettersUsed: vi.fn(),
  refundFreeTrialSlot: vi.fn(),
  claimFreeTrialSlot: vi.fn(),
}));

vi.mock("./email", () => ({
  sendLetterApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendNeedsChangesEmail: vi.fn().mockResolvedValue(undefined),
  sendNewReviewNeededEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterToRecipient: vi.fn().mockResolvedValue(undefined),
  sendStatusUpdateEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterRejectedEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterSubmissionEmail: vi.fn().mockResolvedValue(undefined),
  sendClientRevisionRequestEmail: vi.fn().mockResolvedValue(undefined),
}));

const mockGenerateAndUploadApprovedPdf = vi.fn();
vi.mock("./pdfGenerator", () => ({
  generateAndUploadApprovedPdf: (...args: unknown[]) =>
    mockGenerateAndUploadApprovedPdf(...args),
}));

const mockStorageGet = vi.fn();
vi.mock("./storage", () => ({
  storageGet: (...args: unknown[]) => mockStorageGet(...args),
  storagePut: vi.fn(),
}));

vi.mock("./rateLimiter", () => ({
  checkTrpcRateLimit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("./pipeline/trainingCapture", () => ({
  captureTrainingSample: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./pipeline/embeddings", () => ({
  generateAndStoreEmbedding: vi.fn().mockResolvedValue(undefined),
  embedAndStoreLetterVersion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./learning", () => ({
  extractLessonFromApproval: vi.fn().mockResolvedValue(undefined),
  extractLessonFromRejection: vi.fn().mockResolvedValue(undefined),
  extractLessonFromChangesRequest: vi.fn().mockResolvedValue(undefined),
  extractLessonFromEdit: vi.fn().mockResolvedValue(undefined),
  extractLessonFromSubscriberFeedback: vi.fn().mockResolvedValue(undefined),
  computeAndStoreQualityScore: vi.fn().mockResolvedValue(undefined),
  consolidateLessonsForScope: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./queue", () => ({
  enqueuePipelineJob: vi.fn(),
  enqueueRetryFromStageJob: vi.fn(),
  enqueueDraftPreviewReleaseJob: vi.fn(),
}));

vi.mock("./stripe", () => ({
  checkLetterSubmissionAllowed: vi.fn().mockResolvedValue({ allowed: true }),
  incrementLettersUsed: vi.fn(),
  hasActiveRecurringSubscription: vi.fn().mockResolvedValue(false),
  createRevisionConsultationCheckout: vi
    .fn()
    .mockResolvedValue({ url: "https://stripe.test/revision-checkout" }),
}));

vi.mock("./supabaseAuth", () => ({
  invalidateUserCache: vi.fn(),
  getOriginUrl: vi.fn().mockReturnValue("https://www.talk-to-my-lawyer.com"),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

function createMockCtx(
  role: "attorney" | "admin" | "subscriber",
  userId = 1
): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      email: `user-${userId}@example.com`,
      name: `Test User ${userId}`,
      loginMethod: "email",
      role,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      emailVerified: true,
      freeReviewUsedAt: null,
      subscriberId: role === "subscriber" ? "SUB-0001" : null,
      employeeId: null,
      attorneyId: role === "attorney" ? "ATT-0001" : null,
    },
    req: {
      protocol: "https",
      headers: { host: "www.talk-to-my-lawyer.com" },
    } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createMockLetter(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    userId: 10,
    subject: "Demand for Payment",
    letterType: "demand-letter",
    status: "approved",
    assignedReviewerId: null,
    jurisdictionState: "CA",
    jurisdictionCountry: "US",
    jurisdictionCity: "Los Angeles",
    researchUnverified: false,
    pdfStoragePath: null,
    pdfUrl: null,
    intakeJson: {
      letterType: "demand-letter",
      sender: { name: "John Doe" },
      recipient: { name: "Jane Smith" },
      jurisdiction: { country: "US", state: "CA" },
      matter: {
        category: "debt",
        subject: "Demand for Payment",
        description: "Unpaid invoice",
      },
    },
    ...overrides,
  };
}

const APPROVED_VERSION = {
  id: 100,
  letterRequestId: 42,
  versionType: "final_approved" as const,
  content:
    "This is the final approved letter content. It is more than 50 characters long for validation.",
  metadataJson: {
    approvedBy: "Attorney One",
    approvedAt: "2026-04-27T10:00:00.000Z",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserById.mockResolvedValue({
    id: 10,
    email: "subscriber@example.com",
    name: "Subscriber One",
  });
});

// ─── 1. Attorney approve auto-advances to client_approval_pending ──────────

describe("Attorney approve → auto-advance to client_approval_pending", () => {
  it("calls updateLetterStatus(letterId, 'approved') THEN updateLetterStatus(letterId, 'client_approval_pending')", async () => {
    const { reviewRouter } = await import("./routers/review");
    const { router } = await import("./_core/trpc");
    const appRouter = router({ review: reviewRouter });
    const ctx = createMockCtx("attorney", 5);
    const caller = appRouter.createCaller(ctx);

    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({ status: "under_review", assignedReviewerId: 5 })
    );
    mockCreateLetterVersion.mockResolvedValue({ insertId: 100 });
    mockGenerateAndUploadApprovedPdf.mockResolvedValue({
      pdfKey: "approved-letters/42-test.pdf",
      pdfUrl: "https://r2.example.com/approved-letters/42-test.pdf",
    });

    await caller.review.approve({
      letterId: 42,
      finalContent:
        "This is the final approved content of the legal letter. It must be at least 50 characters long for validation.",
    });

    // Assert ordered status transitions: approved first, then client_approval_pending.
    const calls = mockUpdateLetterStatus.mock.calls;
    const statuses = calls.map(c => c[1]);
    expect(statuses).toContain("approved");
    expect(statuses).toContain("client_approval_pending");
    expect(statuses.indexOf("approved")).toBeLessThan(
      statuses.indexOf("client_approval_pending")
    );
  });

  it("does NOT auto-advance when attorney also sends directly to recipient (status goes to 'sent' instead)", async () => {
    const { reviewRouter } = await import("./routers/review");
    const { router } = await import("./_core/trpc");
    const appRouter = router({ review: reviewRouter });
    const ctx = createMockCtx("attorney", 5);
    const caller = appRouter.createCaller(ctx);

    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({ status: "under_review", assignedReviewerId: 5 })
    );
    mockCreateLetterVersion.mockResolvedValue({ insertId: 101 });
    mockGenerateAndUploadApprovedPdf.mockResolvedValue({
      pdfKey: "approved-letters/42-test.pdf",
      pdfUrl: "https://r2.example.com/approved-letters/42-test.pdf",
    });
    mockGetLetterVersionsByRequestId.mockResolvedValue([APPROVED_VERSION]);

    await caller.review.approve({
      letterId: 42,
      finalContent:
        "This is the final approved content of the legal letter. It must be at least 50 characters long for validation.",
      recipientEmail: "third-party@example.com",
    });

    const statuses = mockUpdateLetterStatus.mock.calls.map(c => c[1]);
    expect(statuses).toContain("approved");
    expect(statuses).toContain("sent");
    // Critical: when attorney sends directly, we do NOT auto-advance to
    // client_approval_pending. The flow goes approved → sent.
    expect(statuses).not.toContain("client_approval_pending");
  });
});

// ─── 2. Subscriber generateOrFetchPdf mutation ─────────────────────────────

describe("letters.generateOrFetchPdf — subscriber on-demand PDF", () => {
  async function getCaller() {
    const { lettersRouter } = await import("./routers/letters");
    const { router } = await import("./_core/trpc");
    const appRouter = router({ letters: lettersRouter });
    return appRouter.createCaller(createMockCtx("subscriber", 10));
  }

  it("fast path: stored key exists → storageGet, persists fresh URL, returns regenerated:false", async () => {
    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({
        status: "approved",
        userId: 10,
        pdfStoragePath: "approved-letters/42.pdf",
      })
    );
    mockStorageGet.mockResolvedValue({
      key: "approved-letters/42.pdf",
      url: "https://r2.example.com/fresh-presigned-url.pdf",
    });

    const caller = await getCaller();
    const result = await caller.letters.generateOrFetchPdf({ letterId: 42 });

    expect(result.pdfUrl).toBe("https://r2.example.com/fresh-presigned-url.pdf");
    expect(result.regenerated).toBe(false);
    expect(mockStorageGet).toHaveBeenCalledWith("approved-letters/42.pdf");
    expect(mockUpdateLetterPdfUrl).toHaveBeenCalledWith(
      42,
      "https://r2.example.com/fresh-presigned-url.pdf"
    );
    // Slow path NOT triggered.
    expect(mockGenerateAndUploadApprovedPdf).not.toHaveBeenCalled();
  });

  it("slow path: no stored key → renders + uploads + persists key+url, returns regenerated:true", async () => {
    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({
        status: "approved",
        userId: 10,
        pdfStoragePath: null,
      })
    );
    mockGetLetterVersionsByRequestId.mockResolvedValue([APPROVED_VERSION]);
    mockGenerateAndUploadApprovedPdf.mockResolvedValue({
      pdfKey: "approved-letters/42-new.pdf",
      pdfUrl: "https://r2.example.com/approved-letters/42-new.pdf",
    });

    const caller = await getCaller();
    const result = await caller.letters.generateOrFetchPdf({ letterId: 42 });

    expect(result.pdfUrl).toBe(
      "https://r2.example.com/approved-letters/42-new.pdf"
    );
    expect(result.regenerated).toBe(true);
    // Render path with metadata reused from final_approved version.
    expect(mockGenerateAndUploadApprovedPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        letterId: 42,
        content: APPROVED_VERSION.content,
        approvedBy: "Attorney One",
        approvedAt: "2026-04-27T10:00:00.000Z",
      })
    );
    expect(mockUpdateLetterStoragePath).toHaveBeenCalledWith(
      42,
      "approved-letters/42-new.pdf"
    );
    expect(mockUpdateLetterPdfUrl).toHaveBeenCalledWith(
      42,
      "https://r2.example.com/approved-letters/42-new.pdf"
    );
    expect(mockStorageGet).not.toHaveBeenCalled();
  });

  it("storageGet failure on existing key falls through to slow-path regeneration", async () => {
    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({
        status: "approved",
        userId: 10,
        pdfStoragePath: "approved-letters/42.pdf",
      })
    );
    mockStorageGet.mockRejectedValueOnce(new Error("R2 outage"));
    mockGetLetterVersionsByRequestId.mockResolvedValue([APPROVED_VERSION]);
    mockGenerateAndUploadApprovedPdf.mockResolvedValue({
      pdfKey: "approved-letters/42-recovered.pdf",
      pdfUrl: "https://r2.example.com/approved-letters/42-recovered.pdf",
    });

    const caller = await getCaller();
    const result = await caller.letters.generateOrFetchPdf({ letterId: 42 });

    expect(result.regenerated).toBe(true);
    expect(mockGenerateAndUploadApprovedPdf).toHaveBeenCalled();
  });

  it("unauthorized: throws NOT_FOUND when subscriber doesn't own the letter", async () => {
    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({ status: "approved", userId: 999 })
    );

    const caller = await getCaller();
    await expect(
      caller.letters.generateOrFetchPdf({ letterId: 42 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects with BAD_REQUEST when status is not in the allowed set (e.g. pending_review)", async () => {
    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({ status: "pending_review", userId: 10 })
    );

    const caller = await getCaller();
    await expect(
      caller.letters.generateOrFetchPdf({ letterId: 42 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects with PRECONDITION_FAILED when no final_approved version exists", async () => {
    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({
        status: "approved",
        userId: 10,
        pdfStoragePath: null,
      })
    );
    mockGetLetterVersionsByRequestId.mockResolvedValue([
      // Only an ai_draft, no final_approved.
      { id: 99, versionType: "ai_draft", content: "Draft text" },
    ]);

    const caller = await getCaller();
    await expect(
      caller.letters.generateOrFetchPdf({ letterId: 42 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("propagates INTERNAL_SERVER_ERROR when generateAndUploadApprovedPdf throws", async () => {
    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({
        status: "approved",
        userId: 10,
        pdfStoragePath: null,
      })
    );
    mockGetLetterVersionsByRequestId.mockResolvedValue([APPROVED_VERSION]);
    mockGenerateAndUploadApprovedPdf.mockRejectedValue(
      new Error("Puppeteer crashed")
    );

    const caller = await getCaller();
    await expect(
      caller.letters.generateOrFetchPdf({ letterId: 42 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ─── 3. sendLetterToRecipientFlow attaches PDF (vs old `pdfUrl: undefined`) ──

describe("sendLetterToRecipientFlow — PDF attach behaviour", () => {
  it("happy path: stored key → mints fresh URL → sendLetterToRecipient called with pdfUrl", async () => {
    const { sendLetterToRecipientFlow } = await import("./services/letters");
    const { sendLetterToRecipient } = await import("./email");

    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({
        userId: 10,
        status: "client_approved",
        pdfStoragePath: "approved-letters/42.pdf",
      })
    );
    mockGetLetterVersionsByRequestId.mockResolvedValue([APPROVED_VERSION]);
    mockStorageGet.mockResolvedValue({
      key: "approved-letters/42.pdf",
      url: "https://r2.example.com/fresh-url.pdf",
    });

    const result = await sendLetterToRecipientFlow(
      {
        letterId: 42,
        recipientEmail: "recipient@example.com",
        subjectOverride: "RE: Demand",
      },
      { userId: 10, appUrl: "https://www.talk-to-my-lawyer.com" }
    );

    expect(result).toMatchObject({ success: true, pdfAttached: true });
    expect(sendLetterToRecipient).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "recipient@example.com",
        pdfUrl: "https://r2.example.com/fresh-url.pdf",
        htmlContent: APPROVED_VERSION.content,
      })
    );
    expect(mockGenerateAndUploadApprovedPdf).not.toHaveBeenCalled();
  });

  it("missing key → lazy-generates PDF before sending", async () => {
    const { sendLetterToRecipientFlow } = await import("./services/letters");
    const { sendLetterToRecipient } = await import("./email");

    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({
        userId: 10,
        status: "client_approved",
        pdfStoragePath: null,
      })
    );
    mockGetLetterVersionsByRequestId.mockResolvedValue([APPROVED_VERSION]);
    mockGenerateAndUploadApprovedPdf.mockResolvedValue({
      pdfKey: "approved-letters/42-new.pdf",
      pdfUrl: "https://r2.example.com/approved-letters/42-new.pdf",
    });

    const result = await sendLetterToRecipientFlow(
      { letterId: 42, recipientEmail: "recipient@example.com" },
      { userId: 10, appUrl: "https://www.talk-to-my-lawyer.com" }
    );

    expect(result.pdfAttached).toBe(true);
    expect(mockGenerateAndUploadApprovedPdf).toHaveBeenCalled();
    expect(mockUpdateLetterStoragePath).toHaveBeenCalledWith(
      42,
      "approved-letters/42-new.pdf"
    );
    expect(sendLetterToRecipient).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfUrl: "https://r2.example.com/approved-letters/42-new.pdf",
      })
    );
  });

  it("PDF generation failure → falls back to htmlContent only, returns pdfAttached:false", async () => {
    const { sendLetterToRecipientFlow } = await import("./services/letters");
    const { sendLetterToRecipient } = await import("./email");

    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({
        userId: 10,
        status: "client_approved",
        pdfStoragePath: null,
      })
    );
    mockGetLetterVersionsByRequestId.mockResolvedValue([APPROVED_VERSION]);
    mockGenerateAndUploadApprovedPdf.mockRejectedValue(
      new Error("R2 outage during send")
    );

    const result = await sendLetterToRecipientFlow(
      { letterId: 42, recipientEmail: "recipient@example.com" },
      { userId: 10, appUrl: "https://www.talk-to-my-lawyer.com" }
    );

    // Send still succeeds — recipient gets the letter inline as htmlContent.
    expect(result.pdfAttached).toBe(false);
    expect(sendLetterToRecipient).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfUrl: undefined,
        htmlContent: APPROVED_VERSION.content,
      })
    );
    // Status still advances to `sent`.
    const statuses = mockUpdateLetterStatus.mock.calls.map(c => c[1]);
    expect(statuses).toContain("sent");
  });

  it("rejects with NOT_FOUND when caller is not the letter owner", async () => {
    const { sendLetterToRecipientFlow } = await import("./services/letters");

    mockGetLetterRequestById.mockResolvedValue(
      createMockLetter({ userId: 999 })
    );

    await expect(
      sendLetterToRecipientFlow(
        { letterId: 42, recipientEmail: "recipient@example.com" },
        { userId: 10, appUrl: "https://www.talk-to-my-lawyer.com" }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
