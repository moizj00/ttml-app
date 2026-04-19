import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: "mock-email-id", error: null }),
    },
  })),
}));

vi.mock("./sentry", () => ({
  captureServerException: vi.fn(),
}));

const mockGetLetterRequestById = vi.fn();
const mockClaimLetterForReview = vi.fn();
const mockLogReviewAction = vi.fn();
const mockUpdateLetterStatus = vi.fn();
const mockCreateLetterVersion = vi.fn();
const mockUpdateLetterVersionPointers = vi.fn();
const mockGetUserById = vi.fn();
const mockCreateNotification = vi.fn();
const mockNotifyAdmins = vi.fn();
const mockGetLetterVersionsByRequestId = vi.fn();
const mockGetReviewActions = vi.fn();
const mockGetWorkflowJobsByLetterId = vi.fn();
const mockGetResearchRunsByLetterId = vi.fn();
const mockGetAttachmentsByLetterId = vi.fn();
const mockGetAllLetterRequests = vi.fn();
const mockUpdateLetterStoragePath = vi.fn();
const mockDecrementLettersUsed = vi.fn();
const mockEnqueueRetryFromStageJob = vi.fn();

vi.mock("./db", () => ({
  getLetterRequestById: (...args: unknown[]) =>
    mockGetLetterRequestById(...args),
  claimLetterForReview: (...args: unknown[]) =>
    mockClaimLetterForReview(...args),
  logReviewAction: (...args: unknown[]) => mockLogReviewAction(...args),
  updateLetterStatus: (...args: unknown[]) => mockUpdateLetterStatus(...args),
  createLetterVersion: (...args: unknown[]) => mockCreateLetterVersion(...args),
  updateLetterVersionPointers: (...args: unknown[]) =>
    mockUpdateLetterVersionPointers(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  notifyAdmins: (...args: unknown[]) => mockNotifyAdmins(...args),
  getAllLetterRequests: (...args: unknown[]) =>
    mockGetAllLetterRequests(...args),
  getLetterVersionsByRequestId: (...args: unknown[]) =>
    mockGetLetterVersionsByRequestId(...args),
  getReviewActions: (...args: unknown[]) => mockGetReviewActions(...args),
  getWorkflowJobsByLetterId: (...args: unknown[]) =>
    mockGetWorkflowJobsByLetterId(...args),
  getResearchRunsByLetterId: (...args: unknown[]) =>
    mockGetResearchRunsByLetterId(...args),
  getAttachmentsByLetterId: (...args: unknown[]) =>
    mockGetAttachmentsByLetterId(...args),
  updateLetterStoragePath: (...args: unknown[]) =>
    mockUpdateLetterStoragePath(...args),
  decrementLettersUsed: (...args: unknown[]) =>
    mockDecrementLettersUsed(...args),
  createLetterRequest: vi.fn(),
  createAttachment: vi.fn(),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getAllUsersWithSubscription: vi.fn().mockResolvedValue([]),
  markAsPaidDb: vi.fn(),
  getEmployeesAndAdmins: vi.fn().mockResolvedValue([]),
  getFailedJobs: vi.fn().mockResolvedValue([]),
  getLetterRequestsByUserId: vi.fn().mockResolvedValue([]),
  getLetterRequestSafeForSubscriber: vi.fn(),
  getNotificationsByUserId: vi.fn().mockResolvedValue([]),
  getCostAnalytics: vi.fn().mockResolvedValue({}),
  getSystemStats: vi.fn().mockResolvedValue({}),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  updateUserRole: vi.fn(),
  updateUserProfile: vi.fn(),
  getUserByEmail: vi.fn(),
  deleteUserVerificationTokens: vi.fn(),
  createEmailVerificationToken: vi.fn(),
  purgeFailedJobs: vi.fn(),
  archiveLetterRequest: vi.fn(),
  createDiscountCodeForEmployee: vi.fn(),
  getDiscountCodeByEmployeeId: vi.fn(),
  rotateDiscountCode: vi.fn(),
  getDiscountCodeByCode: vi.fn(),
  getAllDiscountCodes: vi.fn().mockResolvedValue([]),
  updateDiscountCode: vi.fn(),
  getCommissionsByEmployeeId: vi.fn().mockResolvedValue([]),
  getEmployeeEarningsSummary: vi.fn().mockResolvedValue({}),
  getAllCommissions: vi.fn().mockResolvedValue([]),
  getAdminReferralDetails: vi.fn().mockResolvedValue({}),
  markCommissionsPaid: vi.fn(),
  createPayoutRequest: vi.fn(),
  getPayoutRequestsByEmployeeId: vi.fn().mockResolvedValue([]),
  getAllPayoutRequests: vi.fn().mockResolvedValue([]),
  processPayoutRequest: vi.fn(),
  getPayoutRequestById: vi.fn(),
  getAllEmployeeEarnings: vi.fn().mockResolvedValue([]),
  claimFreeTrialSlot: vi.fn(),
  refundFreeTrialSlot: vi.fn(),
  getAllLessons: vi.fn().mockResolvedValue([]),
  createPipelineLesson: vi.fn(),
  updatePipelineLesson: vi.fn(),
  getQualityScoreStats: vi.fn().mockResolvedValue({}),
  getQualityScoreTrend: vi.fn().mockResolvedValue([]),
  getQualityScoresByLetterType: vi.fn().mockResolvedValue([]),
  getLessonImpactSummary: vi.fn().mockResolvedValue({}),
  assignRoleId: vi.fn(),
  getPublishedBlogPosts: vi.fn().mockResolvedValue([]),
  getBlogPostBySlug: vi.fn(),
  getAllBlogPosts: vi.fn().mockResolvedValue([]),
  createBlogPost: vi.fn(),
  updateBlogPost: vi.fn(),
  deleteBlogPost: vi.fn(),
  getBlogPostSlugById: vi.fn(),
  getPipelineAnalytics: vi.fn().mockResolvedValue({}),
  hasLetterBeenPreviouslyUnlocked: vi.fn().mockResolvedValue(false),
}));

vi.mock("./email", () => ({
  sendLetterApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterRejectedEmail: vi.fn().mockResolvedValue(undefined),
  sendNeedsChangesEmail: vi.fn().mockResolvedValue(undefined),
  sendNewReviewNeededEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterSubmissionEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterUnlockedEmail: vi.fn().mockResolvedValue(undefined),
  sendStatusUpdateEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendReviewAssignedEmail: vi.fn().mockResolvedValue(undefined),
  sendPayoutCompletedEmail: vi.fn().mockResolvedValue(undefined),
  sendPayoutRejectedEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterToRecipient: vi.fn().mockResolvedValue(undefined),
  sendAttorneyInvitationEmail: vi.fn().mockResolvedValue(undefined),
  sendAttorneyWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendClientRevisionRequestEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./pdfGenerator", () => ({
  generateAndUploadApprovedPdf: vi.fn().mockResolvedValue({
    pdfUrl: "https://r2.example.com/approved-letters/42-test.pdf",
    pdfKey: "approved-letters/42-test.pdf",
  }),
}));

vi.mock("./storage", () => ({
  storagePut: vi
    .fn()
    .mockResolvedValue({ url: "https://r2.example.com/test.pdf" }),
}));

vi.mock("./supabaseAuth", () => ({
  invalidateUserCache: vi.fn(),
  getOriginUrl: vi.fn().mockReturnValue("https://www.talk-to-my-lawyer.com"),
}));

vi.mock("./stripe", () => ({
  createCheckoutSession: vi.fn(),
  createBillingPortalSession: vi.fn(),
  createLetterUnlockCheckout: vi.fn(),
  createTrialReviewCheckout: vi.fn(),
  getUserSubscription: vi.fn().mockResolvedValue(null),
  checkLetterSubmissionAllowed: vi.fn().mockResolvedValue({ allowed: true }),
  incrementLettersUsed: vi.fn(),
  hasActiveRecurringSubscription: vi.fn().mockResolvedValue(false),
}));

vi.mock("./queue", () => ({
  enqueuePipelineJob: vi.fn(),
  enqueueRetryFromStageJob: (...args: unknown[]) =>
    mockEnqueueRetryFromStageJob(...args),
  getPipelineQueue: vi.fn().mockReturnValue({
    getJobs: vi.fn().mockResolvedValue([]),
    getJobCounts: vi.fn().mockResolvedValue({}),
  }),
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

vi.mock("./blogCacheInvalidation", () => ({
  invalidateBlogPostCache: vi.fn(),
}));

vi.mock("./blogCache", () => ({
  getCachedBlogPosts: vi.fn(),
  getCachedBlogPost: vi.fn(),
}));

vi.mock("./rateLimiter", () => ({
  checkTrpcRateLimit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

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
      subscriberId: role === "subscriber" ? `SUB-0001` : null,
      employeeId: null,
      attorneyId: role === "attorney" ? `ATT-0001` : null,
    },
    req: {
      protocol: "https",
      headers: { host: "www.talk-to-my-lawyer.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createMockLetter(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    userId: 10,
    subject: "Demand for Payment",
    letterType: "demand",
    status: "pending_review",
    assignedReviewerId: null,
    jurisdictionState: "CA",
    jurisdictionCountry: "US",
    jurisdictionCity: "Los Angeles",
    researchUnverified: false,
    intakeJson: {
      letterType: "demand",
      sender: { name: "John Doe", address: "123 Main St, LA, CA" },
      recipient: { name: "Jane Smith", address: "456 Oak Ave, LA, CA" },
      jurisdiction: { country: "US", state: "CA" },
      matter: {
        category: "debt",
        subject: "Demand for Payment",
        description: "Unpaid invoice",
      },
      desiredOutcome: "Full payment",
    },
    ...overrides,
  };
}

describe("Review & Approval Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserById.mockResolvedValue({
      id: 10,
      name: "Test Subscriber",
      email: "subscriber@example.com",
      role: "subscriber",
    });
    mockLogReviewAction.mockResolvedValue(undefined);
    mockCreateNotification.mockResolvedValue(undefined);
    mockNotifyAdmins.mockResolvedValue(undefined);
    mockUpdateLetterStoragePath.mockResolvedValue(undefined);
  });

  describe("Claim letter for review", () => {
    it("should allow attorney to claim a pending_review letter", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "pending_review",
        assignedReviewerId: null,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockClaimLetterForReview.mockResolvedValue(undefined);

      const result = await caller.review.claim({ letterId: 42 });
      expect(result).toEqual({ success: true });
      expect(mockClaimLetterForReview).toHaveBeenCalledWith(42, 5);
      expect(mockLogReviewAction).toHaveBeenCalledWith(
        expect.objectContaining({
          letterRequestId: 42,
          reviewerId: 5,
          action: "claimed_for_review",
          fromStatus: "pending_review",
          toStatus: "under_review",
        })
      );
    });

    it("should allow attorney to claim a client_revision_requested letter", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({ status: "client_revision_requested" });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockClaimLetterForReview.mockResolvedValue(undefined);

      const result = await caller.review.claim({ letterId: 42 });
      expect(result).toEqual({ success: true });
    });

    it("should reject claim on a letter that is not in reviewable state", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({ status: "drafting" });
      mockGetLetterRequestById.mockResolvedValue(letter);

      await expect(caller.review.claim({ letterId: 42 })).rejects.toThrow(
        "Letter is not in a reviewable state"
      );
    });

    it("should reject claim when letter does not exist", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      mockGetLetterRequestById.mockResolvedValue(null);

      await expect(caller.review.claim({ letterId: 999 })).rejects.toThrow();
    });

    it("should reject claim from subscriber role", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("subscriber", 10);
      const caller = appRouter.createCaller(ctx);

      await expect(caller.review.claim({ letterId: 42 })).rejects.toThrow(
        "Attorney or Admin access required"
      );
    });

    it("should send subscriber notification on claim", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({ status: "pending_review", userId: 10 });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockClaimLetterForReview.mockResolvedValue(undefined);

      await caller.review.claim({ letterId: 42 });

      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 10,
          type: "letter_under_review",
        })
      );
    });

    it("should notify admins when letter is claimed", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({ status: "pending_review" });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockClaimLetterForReview.mockResolvedValue(undefined);

      await caller.review.claim({ letterId: 42 });

      expect(mockNotifyAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "letter_claimed",
        })
      );
    });
  });

  describe("Unclaim / Release letter", () => {
    it("should allow assigned attorney to unclaim a letter under review", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      const result = await caller.review.unclaim({ letterId: 42 });
      expect(result).toEqual({ success: true });
      expect(mockUpdateLetterStatus).toHaveBeenCalledWith(
        42,
        "pending_review",
        { assignedReviewerId: null }
      );
      expect(mockLogReviewAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "released_back_to_queue",
          fromStatus: "under_review",
          toStatus: "pending_review",
        })
      );
    });

    it("should reject unclaim from a different attorney", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 99);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);

      await expect(caller.review.unclaim({ letterId: 42 })).rejects.toThrow(
        "You are not assigned to this letter"
      );
    });

    it("should allow admin to unclaim any letter", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("admin", 1);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      const result = await caller.review.unclaim({ letterId: 42 });
      expect(result).toEqual({ success: true });
    });

    it("should reject unclaim when letter is not under review", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "pending_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);

      await expect(caller.review.unclaim({ letterId: 42 })).rejects.toThrow(
        "Letter is not under review"
      );
    });
  });

  describe("Approve letter", () => {
    it("should approve letter, create final version, and auto-forward to client_approval_pending", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockCreateLetterVersion.mockResolvedValue({ insertId: 100 });
      mockUpdateLetterVersionPointers.mockResolvedValue(undefined);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      const result = await caller.review.approve({
        letterId: 42,
        finalContent:
          "This is the final approved content of the legal letter. It must be at least 50 characters long for validation.",
      });

      expect(result.success).toBe(true);
      expect(result.versionId).toBe(100);

      expect(mockCreateLetterVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          letterRequestId: 42,
          versionType: "final_approved",
        })
      );
      expect(mockUpdateLetterStatus).toHaveBeenCalledWith(42, "approved");
    });

    it("should require acknowledgedUnverifiedResearch when research is unverified", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
        researchUnverified: true,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);

      await expect(
        caller.review.approve({
          letterId: 42,
          finalContent:
            "This is the final approved content of the legal letter with enough characters to pass validation.",
        })
      ).rejects.toThrow(
        "You must acknowledge that research citations are unverified"
      );
    });

    it("should allow approval of unverified research when acknowledged", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
        researchUnverified: true,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockCreateLetterVersion.mockResolvedValue({ insertId: 101 });
      mockUpdateLetterVersionPointers.mockResolvedValue(undefined);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      const result = await caller.review.approve({
        letterId: 42,
        finalContent:
          "This is the final approved content of the legal letter with enough characters to pass validation.",
        acknowledgedUnverifiedResearch: true,
      });

      expect(result.success).toBe(true);
    });

    it("should reject approval from unassigned attorney", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 99);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);

      await expect(
        caller.review.approve({
          letterId: 42,
          finalContent:
            "This is the final approved content of the legal letter with enough characters to pass validation.",
        })
      ).rejects.toThrow("You are not assigned to this letter");
    });

    it("should reject approval when letter is not under_review", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "pending_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);

      await expect(
        caller.review.approve({
          letterId: 42,
          finalContent:
            "This is the final approved content of the legal letter with enough characters to pass validation.",
        })
      ).rejects.toThrow("Letter must be under_review to approve");
    });

    it("should allow admin to approve any letter under review", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("admin", 1);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockCreateLetterVersion.mockResolvedValue({ insertId: 102 });
      mockUpdateLetterVersionPointers.mockResolvedValue(undefined);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      const result = await caller.review.approve({
        letterId: 42,
        finalContent:
          "This is the final approved content of the legal letter with enough characters to pass validation.",
      });

      expect(result.success).toBe(true);
    });

    it("should log internal and user-visible notes on approval", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockCreateLetterVersion.mockResolvedValue({ insertId: 103 });
      mockUpdateLetterVersionPointers.mockResolvedValue(undefined);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      await caller.review.approve({
        letterId: 42,
        finalContent:
          "This is the final approved content of the legal letter with enough characters to pass validation.",
        internalNote: "Good letter, minor edits made",
        userVisibleNote:
          "Your letter has been reviewed and approved with minor adjustments.",
      });

      const logCalls = mockLogReviewAction.mock.calls;
      expect(logCalls.length).toBeGreaterThanOrEqual(2);

      const approvedLog = logCalls.find(
        (c: unknown[]) =>
          (c[0] as Record<string, unknown>).action === "approved"
      );
      expect(approvedLog).toBeTruthy();
      expect((approvedLog![0] as Record<string, unknown>).noteVisibility).toBe(
        "internal"
      );

      const userNoteLog = logCalls.find(
        (c: unknown[]) =>
          (c[0] as Record<string, unknown>).action === "attorney_note"
      );
      expect(userNoteLog).toBeTruthy();
      expect((userNoteLog![0] as Record<string, unknown>).noteVisibility).toBe(
        "user_visible"
      );
    });

    it("should reject finalContent shorter than 50 characters", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.review.approve({
          letterId: 42,
          finalContent: "Too short",
        })
      ).rejects.toThrow();
    });

    it("should generate PDF on attorney approval", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockCreateLetterVersion.mockResolvedValue({ insertId: 104 });
      mockUpdateLetterVersionPointers.mockResolvedValue(undefined);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      const result = await caller.review.approve({
        letterId: 42,
        finalContent:
          "This is the final approved content of the legal letter with enough characters to pass validation.",
      });

      expect(result.success).toBe(true);
      expect(result.pdfUrl).toBeDefined();
    });
  });

  describe("Reject letter", () => {
    it("should reject a letter with reason and notify subscriber", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      const result = await caller.review.reject({
        letterId: 42,
        reason:
          "This letter contains factual errors and cannot proceed as drafted.",
      });

      expect(result).toEqual({ success: true });
      expect(mockUpdateLetterStatus).toHaveBeenCalledWith(42, "rejected");

      const logCalls = mockLogReviewAction.mock.calls;
      const rejectedLog = logCalls.find(
        (c: unknown[]) =>
          (c[0] as Record<string, unknown>).action === "rejected"
      );
      expect(rejectedLog).toBeTruthy();
      expect((rejectedLog![0] as Record<string, unknown>).fromStatus).toBe(
        "under_review"
      );
      expect((rejectedLog![0] as Record<string, unknown>).toStatus).toBe(
        "rejected"
      );
    });

    it("should require rejection reason of at least 10 characters", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.review.reject({
          letterId: 42,
          reason: "Short",
        })
      ).rejects.toThrow();
    });

    it("should reject from unassigned attorney", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 99);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);

      await expect(
        caller.review.reject({
          letterId: 42,
          reason: "This letter contains multiple factual errors.",
        })
      ).rejects.toThrow("You are not assigned to this letter");
    });

    it("should log both internal and user-visible rejection notices", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      await caller.review.reject({
        letterId: 42,
        reason: "Internal: multiple citation errors and jurisdiction mismatch",
        userVisibleReason:
          "We were unable to proceed with this letter due to jurisdiction limitations.",
      });

      const logCalls = mockLogReviewAction.mock.calls;
      const internalLog = logCalls.find(
        (c: unknown[]) =>
          (c[0] as Record<string, unknown>).action === "rejected" &&
          (c[0] as Record<string, unknown>).noteVisibility === "internal"
      );
      expect(internalLog).toBeTruthy();

      const visibleLog = logCalls.find(
        (c: unknown[]) =>
          (c[0] as Record<string, unknown>).action === "rejection_notice" &&
          (c[0] as Record<string, unknown>).noteVisibility === "user_visible"
      );
      expect(visibleLog).toBeTruthy();
    });
  });

  describe("Request Changes", () => {
    it("should request changes and release letter back to queue", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      const result = await caller.review.requestChanges({
        letterId: 42,
        userVisibleNote:
          "The tone needs to be more formal. Please also add the specific contract clause numbers.",
      });

      expect(result).toEqual({ success: true });
      expect(mockUpdateLetterStatus).toHaveBeenCalledWith(42, "needs_changes", {
        assignedReviewerId: null,
      });
    });

    it("should store pipeline retrigger preference when requested", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      await caller.review.requestChanges({
        letterId: 42,
        userVisibleNote:
          "Please regenerate the draft with a more aggressive tone and updated citations.",
        retriggerPipeline: true,
      });

      const logCalls = mockLogReviewAction.mock.calls;
      const internalLog = logCalls.find(
        (c: unknown[]) =>
          (c[0] as Record<string, unknown>).action === "requested_changes"
      );
      expect(internalLog).toBeTruthy();
      const noteText = (internalLog![0] as Record<string, unknown>)
        .noteText as string;
      const parsed = JSON.parse(noteText);
      expect(parsed.retriggerPipeline).toBe(true);
    });

    it("should not trigger pipeline retrigger when not requested", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockUpdateLetterStatus.mockResolvedValue(undefined);

      await caller.review.requestChanges({
        letterId: 42,
        userVisibleNote:
          "Minor formatting issues that can be fixed without regeneration of the letter.",
      });

      expect(mockEnqueueRetryFromStageJob).not.toHaveBeenCalled();
    });

    it("should require userVisibleNote of at least 10 characters", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.review.requestChanges({
          letterId: 42,
          userVisibleNote: "Short",
        })
      ).rejects.toThrow();
    });
  });

  describe("Save Edit", () => {
    it("should save attorney edit and log the action", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockCreateLetterVersion.mockResolvedValue({ insertId: 200 });

      const result = await caller.review.saveEdit({
        letterId: 42,
        content:
          "This is the edited content of the legal letter. It replaces the AI-generated draft with attorney revisions.",
        note: "Fixed citation format",
      });

      expect(result.versionId).toBe(200);
      expect(mockCreateLetterVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          versionType: "attorney_edit",
          letterRequestId: 42,
        })
      );
      expect(mockLogReviewAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "attorney_edit_saved",
          noteText: "Fixed citation format",
        })
      );
    });

    it("should reject edit from unassigned attorney", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 99);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);

      await expect(
        caller.review.saveEdit({
          letterId: 42,
          content:
            "This is the edited content of the legal letter with enough characters to pass validation.",
        })
      ).rejects.toThrow("You are not assigned to this letter");
    });

    it("should reject edit when letter is not under_review", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "approved",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);

      await expect(
        caller.review.saveEdit({
          letterId: 42,
          content:
            "This is the edited content of the legal letter with enough characters to pass validation.",
        })
      ).rejects.toThrow("Letter must be under_review to edit");
    });
  });

  describe("Letter Detail access control", () => {
    it("should allow assigned attorney to view letter detail", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockGetLetterVersionsByRequestId.mockResolvedValue([]);
      mockGetReviewActions.mockResolvedValue([]);
      mockGetWorkflowJobsByLetterId.mockResolvedValue([]);
      mockGetResearchRunsByLetterId.mockResolvedValue([]);
      mockGetAttachmentsByLetterId.mockResolvedValue([]);

      const result = await caller.review.letterDetail({ id: 42 });
      expect(result.letter).toBeDefined();
      expect(result.versions).toBeDefined();
      expect(result.actions).toBeDefined();
    });

    it("should allow any attorney to view pending_review letters (available to claim)", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 99);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "pending_review",
        assignedReviewerId: null,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockGetLetterVersionsByRequestId.mockResolvedValue([]);
      mockGetReviewActions.mockResolvedValue([]);
      mockGetWorkflowJobsByLetterId.mockResolvedValue([]);
      mockGetResearchRunsByLetterId.mockResolvedValue([]);
      mockGetAttachmentsByLetterId.mockResolvedValue([]);

      const result = await caller.review.letterDetail({ id: 42 });
      expect(result.letter).toBeDefined();
    });

    it("should deny access to attorney not assigned to under_review letter", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 99);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);

      await expect(caller.review.letterDetail({ id: 42 })).rejects.toThrow(
        "You are not assigned to this letter"
      );
    });

    it("should allow admin to view any letter regardless of assignment", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("admin", 1);
      const caller = appRouter.createCaller(ctx);

      const letter = createMockLetter({
        status: "under_review",
        assignedReviewerId: 5,
      });
      mockGetLetterRequestById.mockResolvedValue(letter);
      mockGetLetterVersionsByRequestId.mockResolvedValue([]);
      mockGetReviewActions.mockResolvedValue([]);
      mockGetWorkflowJobsByLetterId.mockResolvedValue([]);
      mockGetResearchRunsByLetterId.mockResolvedValue([]);
      mockGetAttachmentsByLetterId.mockResolvedValue([]);

      const result = await caller.review.letterDetail({ id: 42 });
      expect(result.letter).toBeDefined();
    });
  });

  describe("Review Queue", () => {
    it("should return review queue for attorney", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      mockGetAllLetterRequests.mockResolvedValue([
        createMockLetter({ status: "pending_review" }),
        createMockLetter({
          id: 43,
          status: "under_review",
          assignedReviewerId: 5,
        }),
      ]);

      const result = await caller.review.queue();
      expect(result).toHaveLength(2);
    });

    it("should filter by myAssigned", async () => {
      const { reviewRouter } = await import("./routers/review");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: reviewRouter });
      const ctx = createMockCtx("attorney", 5);
      const caller = appRouter.createCaller(ctx);

      mockGetAllLetterRequests.mockResolvedValue([
        createMockLetter({
          id: 43,
          status: "under_review",
          assignedReviewerId: 5,
        }),
      ]);

      await caller.review.queue({ myAssigned: true });

      expect(mockGetAllLetterRequests).toHaveBeenCalledWith({
        assignedReviewerId: 5,
      });
    });
  });
});
