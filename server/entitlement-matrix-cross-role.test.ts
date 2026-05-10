import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "email-id", error: null }) },
  })),
}));

vi.mock("./sentry", () => ({
  captureServerException: vi.fn(),
  initServerSentry: vi.fn(),
}));

vi.mock("./rateLimiter", () => ({
  checkTrpcRateLimit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyAdmin2FAToken = vi.fn();
vi.mock("./_core/admin2fa", () => ({
  signAdmin2FAToken: vi.fn(),
  verifyAdmin2FAToken: (...args: unknown[]) => mockVerifyAdmin2FAToken(...args),
  ADMIN_2FA_COOKIE: "admin_2fa",
}));

const mockDbListActiveTemplates = vi.fn();
const mockGetDiscountCodeByEmployeeId = vi.fn();
const mockCreateDiscountCodeForEmployee = vi.fn();
const mockGetLetterRequestById = vi.fn();
const mockClaimLetterForReview = vi.fn();
const mockLogReviewAction = vi.fn();
const mockCreateNotification = vi.fn();
const mockNotifyAdmins = vi.fn();
const mockGetUserById = vi.fn();
const mockGetAllLetterRequests = vi.fn();
const mockGetLetterVersionsByRequestId = vi.fn();
const mockGetReviewActions = vi.fn();
const mockGetWorkflowJobsByLetterId = vi.fn();
const mockGetResearchRunsByLetterId = vi.fn();
const mockGetAttachmentsByLetterId = vi.fn();
const mockUpdateLetterStatus = vi.fn();
const mockUpdateLetterVersionPointers = vi.fn();
const mockUpdateLetterPdfUrl = vi.fn();
const mockUpdateLetterStoragePath = vi.fn();
const mockCreateClientPortalToken = vi.fn();
const mockCreateDeliveryLogEntry = vi.fn();
const mockGetLetterRequestSafeForSubscriber = vi.fn();

vi.mock("./db", () => ({
  dbListActiveTemplates: (...args: unknown[]) => mockDbListActiveTemplates(...args),
  dbGetTemplateById: vi.fn(),
  dbListAllTemplates: vi.fn().mockResolvedValue([]),
  dbCreateTemplate: vi.fn(),
  dbUpdateTemplate: vi.fn(),
  dbToggleTemplateActive: vi.fn(),
  dbDeleteTemplate: vi.fn(),
  dbListIntakeFormTemplates: vi.fn().mockResolvedValue([]),
  dbGetIntakeFormTemplateById: vi.fn(),
  dbCreateIntakeFormTemplate: vi.fn(),
  dbUpdateIntakeFormTemplate: vi.fn(),
  dbDeleteIntakeFormTemplate: vi.fn(),
  getDiscountCodeByEmployeeId: (...args: unknown[]) => mockGetDiscountCodeByEmployeeId(...args),
  createDiscountCodeForEmployee: (...args: unknown[]) => mockCreateDiscountCodeForEmployee(...args),
  rotateDiscountCode: vi.fn(),
  getDiscountCodeByCode: vi.fn(),
  getEmployeeEarningsSummary: vi.fn().mockResolvedValue({}),
  getCommissionsByEmployeeId: vi.fn().mockResolvedValue([]),
  createPayoutRequest: vi.fn(),
  getPayoutRequestsByEmployeeId: vi.fn().mockResolvedValue([]),
  getLetterRequestById: (...args: unknown[]) => mockGetLetterRequestById(...args),
  claimLetterForReview: (...args: unknown[]) => mockClaimLetterForReview(...args),
  logReviewAction: (...args: unknown[]) => mockLogReviewAction(...args),
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  notifyAdmins: (...args: unknown[]) => mockNotifyAdmins(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getAllLetterRequests: (...args: unknown[]) => mockGetAllLetterRequests(...args),
  getLetterVersionsByRequestId: (...args: unknown[]) => mockGetLetterVersionsByRequestId(...args),
  getReviewActions: (...args: unknown[]) => mockGetReviewActions(...args),
  getWorkflowJobsByLetterId: (...args: unknown[]) => mockGetWorkflowJobsByLetterId(...args),
  getResearchRunsByLetterId: (...args: unknown[]) => mockGetResearchRunsByLetterId(...args),
  getAttachmentsByLetterId: (...args: unknown[]) => mockGetAttachmentsByLetterId(...args),
  updateLetterStatus: (...args: unknown[]) => mockUpdateLetterStatus(...args),
  updateLetterVersionPointers: (...args: unknown[]) => mockUpdateLetterVersionPointers(...args),
  updateLetterPdfUrl: (...args: unknown[]) => mockUpdateLetterPdfUrl(...args),
  updateLetterStoragePath: (...args: unknown[]) => mockUpdateLetterStoragePath(...args),
  createClientPortalToken: (...args: unknown[]) => mockCreateClientPortalToken(...args),
  createDeliveryLogEntry: (...args: unknown[]) => mockCreateDeliveryLogEntry(...args),
  getLetterRequestSafeForSubscriber: (...args: unknown[]) => mockGetLetterRequestSafeForSubscriber(...args),
  getDb: vi.fn().mockResolvedValue(null),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getAllUsersWithSubscription: vi.fn().mockResolvedValue([]),
  getFailedJobs: vi.fn().mockResolvedValue([]),
  markAsPaidDb: vi.fn(),
  getEmployeesAndAdmins: vi.fn().mockResolvedValue([]),
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
  getAllDiscountCodes: vi.fn().mockResolvedValue([]),
  updateDiscountCode: vi.fn(),
  getAllCommissions: vi.fn().mockResolvedValue([]),
  getAdminReferralDetails: vi.fn().mockResolvedValue({}),
  markCommissionsPaid: vi.fn(),
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
  getLetterTemplateById: vi.fn(),
  decrementLettersUsed: vi.fn(),
  getLetterRequestsByUserId: vi.fn().mockResolvedValue([]),
  createLetterVersion: vi.fn(),
  createAttachment: vi.fn(),
  createLetterRequest: vi.fn(),
  insertDocumentAnalysis: vi.fn(),
  listDocumentAnalysesByUser: vi.fn().mockResolvedValue({ rows: [], nextCursor: undefined }),
  getDeliveryLogByLetterId: vi.fn().mockResolvedValue([]),
  getStreamChunksAfter: vi.fn().mockResolvedValue([]),
  setFreeReviewUsed: vi.fn(),
  upsertPipelineRecord: vi.fn(),
  countCompletedLetters: vi.fn(),
  getRAGAnalytics: vi.fn(),
  getFineTuneRuns: vi.fn(),
  getEditDistanceTrend: vi.fn(),
}));

vi.mock("./services/admin", () => ({
  forceStatusTransition: vi.fn().mockResolvedValue({ success: true }),
  diagnoseAndRepairLetterState: vi.fn().mockResolvedValue({ success: true, findings: [] }),
  changeUserRole: vi.fn(),
  inviteAttorney: vi.fn(),
  retryPipelineJob: vi.fn(),
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
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendEmployeeCommissionEmail: vi.fn().mockResolvedValue(undefined),
  sendFreePreviewReadyEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://r2.example.com/test.pdf" }),
  storageGet: vi.fn().mockResolvedValue({ url: "https://r2.example.com/test.pdf" }),
  getSignedUrl: vi.fn().mockResolvedValue("https://r2.example.com/signed-url.pdf"),
}));

vi.mock("./pdfGenerator", () => ({
  generateAndUploadApprovedPdf: vi.fn().mockResolvedValue({
    pdfUrl: "https://r2.example.com/approved-letters/42-test.pdf",
    pdfKey: "approved-letters/42-test.pdf",
  }),
}));

vi.mock("./queue", () => ({
  enqueuePipelineJob: vi.fn(),
  enqueueRetryFromStageJob: vi.fn(),
  enqueueDraftPreviewReleaseJob: vi.fn(),
  getPipelineQueue: vi.fn().mockReturnValue({
    getJobs: vi.fn().mockResolvedValue([]),
    getJobCounts: vi.fn().mockResolvedValue({}),
  }),
  cancelPipelineJobForLetter: vi.fn(),
  getBoss: vi.fn(),
  QUEUE_NAME: "multi-agent-pipeline",
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

vi.mock("./supabaseAuth", () => ({
  invalidateUserCache: vi.fn(),
  getOriginUrl: vi.fn().mockReturnValue("https://www.talk-to-my-lawyer.com"),
}));

vi.mock("./pipeline/trainingCapture", () => ({
  captureTrainingSample: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./pipeline/embeddings", () => ({
  generateAndStoreEmbedding: vi.fn().mockResolvedValue(undefined),
  embedAndStoreLetterVersion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./stripe", () => ({
  getStripe: vi.fn(() => ({
    invoices: { list: vi.fn().mockResolvedValue({ data: [] }) },
    paymentIntents: { list: vi.fn().mockResolvedValue({ data: [] }) },
    subscriptions: { retrieve: vi.fn().mockResolvedValue({}) },
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_test" }) },
    billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com" }) } },
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com" }) } },
  })),
  getOrCreateStripeCustomer: vi.fn().mockResolvedValue("cus_test"),
  checkLetterSubmissionAllowed: vi.fn().mockResolvedValue({ allowed: true }),
  incrementLettersUsed: vi.fn(),
  hasActiveRecurringSubscription: vi.fn().mockResolvedValue(false),
  hasEverSubscribed: vi.fn().mockResolvedValue(false),
  createBillingPortalSession: vi.fn(),
  activateSubscription: vi.fn(),
  createCheckoutSession: vi.fn(),
  createLetterUnlockCheckout: vi.fn(),
  createTrialReviewCheckout: vi.fn(),
  createRevisionConsultationCheckout: vi.fn(),
}));

vi.mock("./blogCacheInvalidation", () => ({
  invalidateBlogPostCache: vi.fn(),
}));

vi.mock("./blogCache", () => ({
  getCachedBlogPosts: vi.fn(),
  getCachedBlogPost: vi.fn(),
}));

vi.mock("./pipeline/circuitBreaker", () => ({
  getCircuitStatus: vi.fn(),
  resetCircuit: vi.fn(),
  resetAllCircuits: vi.fn(),
}));

vi.mock("./memoryMonitor", () => ({
  getMemoryHistory: vi.fn(),
}));

vi.mock("./pipeline/telemetry", () => ({
  getTelemetry: vi.fn(),
}));

function createMockCtx(
  role: "attorney" | "admin" | "subscriber" | "employee",
  userId = 1,
  emailVerified = true
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
      emailVerified,
      freeReviewUsedAt: null,
      subscriberId: role === "subscriber" ? `SUB-0001` : null,
      employeeId: role === "employee" ? `EMP-0001` : null,
      attorneyId: role === "attorney" ? `ATT-0001` : null,
    },
    req: { protocol: "https", headers: { host: "www.talk-to-my-lawyer.com" } } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createAdminCtx(
  userId = 1,
  email = "user-1@example.com",
  cookieValue = "valid-2fa-token"
): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}`,
      email,
      name: `Test User ${userId}`,
      loginMethod: "email",
      role: "admin",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      emailVerified: true,
      freeReviewUsedAt: null,
      subscriberId: null,
      employeeId: null,
      attorneyId: null,
    },
    req: {
      protocol: "https",
      headers: { host: "www.talk-to-my-lawyer.com", cookie: `admin_2fa=${cookieValue}` },
    } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("Entitlement Matrix — Cross-Role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdmin2FAToken.mockReturnValue(true);
    mockDbListActiveTemplates.mockResolvedValue([]);
    mockGetDiscountCodeByEmployeeId.mockResolvedValue(undefined);
    mockCreateDiscountCodeForEmployee.mockResolvedValue({ id: 1, code: "TTML-001" });
    mockGetLetterRequestById.mockResolvedValue({
      id: 42,
      userId: 10,
      status: "pending_review",
      assignedReviewerId: null,
      letterType: "demand-letter",
      subject: "Test",
      jurisdictionState: "CA",
      jurisdictionCountry: "US",
    });
    mockClaimLetterForReview.mockResolvedValue(undefined);
    mockLogReviewAction.mockResolvedValue(undefined);
    mockCreateNotification.mockResolvedValue(undefined);
    mockNotifyAdmins.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({ id: 10, name: "Subscriber", email: "sub@example.com" });
    mockGetAllLetterRequests.mockResolvedValue([]);
    mockGetLetterVersionsByRequestId.mockResolvedValue([]);
    mockGetReviewActions.mockResolvedValue([]);
    mockGetWorkflowJobsByLetterId.mockResolvedValue([]);
    mockGetResearchRunsByLetterId.mockResolvedValue([]);
    mockGetAttachmentsByLetterId.mockResolvedValue([]);
    mockUpdateLetterStatus.mockResolvedValue(undefined);
    mockUpdateLetterVersionPointers.mockResolvedValue(undefined);
    mockUpdateLetterPdfUrl.mockResolvedValue(undefined);
    mockUpdateLetterStoragePath.mockResolvedValue(undefined);
    mockCreateClientPortalToken.mockResolvedValue({ token: "tok", id: 1 });
    mockCreateDeliveryLogEntry.mockResolvedValue(undefined);
    mockGetLetterRequestSafeForSubscriber.mockResolvedValue(null);
  });

  // ═══════════════════════════════════════════════════════
  // subscriberProcedure (templates.listActive)
  // ═══════════════════════════════════════════════════════
  describe("subscriberProcedure", () => {
    it("allows subscriber", async () => {
      const { templatesRouter } = await import("./routers/templates");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ templates: templatesRouter });
      const ctx = createMockCtx("subscriber");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.templates.listActive();
      expect(result).toEqual([]);
    });

    it("allows admin", async () => {
      const { templatesRouter } = await import("./routers/templates");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ templates: templatesRouter });
      const ctx = createAdminCtx();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.templates.listActive();
      expect(result).toEqual([]);
    });

    it("rejects employee", async () => {
      const { templatesRouter } = await import("./routers/templates");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ templates: templatesRouter });
      const ctx = createMockCtx("employee");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.templates.listActive()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects attorney", async () => {
      const { templatesRouter } = await import("./routers/templates");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ templates: templatesRouter });
      const ctx = createMockCtx("attorney");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.templates.listActive()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ═══════════════════════════════════════════════════════
  // employeeProcedure (affiliate.myCode)
  // ═══════════════════════════════════════════════════════
  describe("employeeProcedure", () => {
    it("allows employee", async () => {
      const { affiliateEmployeeRouter } = await import("./routers/affiliate/employee");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ affiliate: router(affiliateEmployeeRouter._def.procedures) });
      const ctx = createMockCtx("employee");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.affiliate.myCode();
      expect(result).toEqual({ id: 1, code: "TTML-001" });
    });

    it("allows admin", async () => {
      const { affiliateEmployeeRouter } = await import("./routers/affiliate/employee");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ affiliate: router(affiliateEmployeeRouter._def.procedures) });
      const ctx = createAdminCtx();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.affiliate.myCode();
      expect(result).toEqual({ id: 1, code: "TTML-001" });
    });

    it("rejects subscriber", async () => {
      const { affiliateEmployeeRouter } = await import("./routers/affiliate/employee");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ affiliate: router(affiliateEmployeeRouter._def.procedures) });
      const ctx = createMockCtx("subscriber");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.affiliate.myCode()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects attorney", async () => {
      const { affiliateEmployeeRouter } = await import("./routers/affiliate/employee");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ affiliate: router(affiliateEmployeeRouter._def.procedures) });
      const ctx = createMockCtx("attorney");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.affiliate.myCode()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ═══════════════════════════════════════════════════════
  // attorneyProcedure (review.claim)
  // ═══════════════════════════════════════════════════════
  describe("attorneyProcedure", () => {
    it("allows attorney", async () => {
      const { reviewActionsRouter } = await import("./routers/review/actions");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: router(reviewActionsRouter._def.procedures) });
      const ctx = createMockCtx("attorney");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.review.claim({ letterId: 42 });
      expect(result).toEqual({ success: true });
    });

    it("allows admin", async () => {
      const { reviewActionsRouter } = await import("./routers/review/actions");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: router(reviewActionsRouter._def.procedures) });
      const ctx = createAdminCtx();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.review.claim({ letterId: 42 });
      expect(result).toEqual({ success: true });
    });

    it("rejects subscriber", async () => {
      const { reviewActionsRouter } = await import("./routers/review/actions");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: router(reviewActionsRouter._def.procedures) });
      const ctx = createMockCtx("subscriber");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.review.claim({ letterId: 42 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects employee", async () => {
      const { reviewActionsRouter } = await import("./routers/review/actions");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ review: router(reviewActionsRouter._def.procedures) });
      const ctx = createMockCtx("employee");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.review.claim({ letterId: 42 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ═══════════════════════════════════════════════════════
  // adminProcedure (admin.allLetters)
  // ═══════════════════════════════════════════════════════
  describe("adminProcedure", () => {
    it("allows admin with valid 2FA", async () => {
      const { adminLettersProcedures } = await import("./routers/admin/letters");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ admin: router(adminLettersProcedures) });
      const ctx = createAdminCtx();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.admin.allLetters();
      expect(result).toEqual([]);
    });

    it("rejects subscriber", async () => {
      const { adminLettersProcedures } = await import("./routers/admin/letters");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ admin: router(adminLettersProcedures) });
      const ctx = createMockCtx("subscriber");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.admin.allLetters()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects employee", async () => {
      const { adminLettersProcedures } = await import("./routers/admin/letters");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ admin: router(adminLettersProcedures) });
      const ctx = createMockCtx("employee");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.admin.allLetters()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects attorney", async () => {
      const { adminLettersProcedures } = await import("./routers/admin/letters");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ admin: router(adminLettersProcedures) });
      const ctx = createMockCtx("attorney");
      const caller = appRouter.createCaller(ctx);
      await expect(caller.admin.allLetters()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ═══════════════════════════════════════════════════════
  // superAdminProcedure (admin.forceStatusTransition)
  // ═══════════════════════════════════════════════════════
  describe("superAdminProcedure", () => {
    it("allows whitelisted admin email", async () => {
      const { adminLettersProcedures } = await import("./routers/admin/letters");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ admin: router(adminLettersProcedures) });
      const ctx = createAdminCtx(1, "moizj00@gmail.com");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.admin.forceStatusTransition({
        letterId: 42,
        newStatus: "submitted",
        reason: "Test transition",
      });
      expect(result.success).toBe(true);
    });

    it("allows whitelisted admin email (yahoo)", async () => {
      const { adminLettersProcedures } = await import("./routers/admin/letters");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ admin: router(adminLettersProcedures) });
      const ctx = createAdminCtx(1, "moizj00@yahoo.com");
      const caller = appRouter.createCaller(ctx);
      const result = await caller.admin.forceStatusTransition({
        letterId: 42,
        newStatus: "submitted",
        reason: "Test transition",
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-whitelisted admin email", async () => {
      const { adminLettersProcedures } = await import("./routers/admin/letters");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ admin: router(adminLettersProcedures) });
      const ctx = createAdminCtx(1, "other-admin@example.com");
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.forceStatusTransition({
          letterId: 42,
          newStatus: "submitted",
          reason: "Test transition",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects subscriber", async () => {
      const { adminLettersProcedures } = await import("./routers/admin/letters");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ admin: router(adminLettersProcedures) });
      const ctx = createMockCtx("subscriber");
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.forceStatusTransition({
          letterId: 42,
          newStatus: "submitted",
          reason: "Test transition",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects employee", async () => {
      const { adminLettersProcedures } = await import("./routers/admin/letters");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ admin: router(adminLettersProcedures) });
      const ctx = createMockCtx("employee");
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.forceStatusTransition({
          letterId: 42,
          newStatus: "submitted",
          reason: "Test transition",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects attorney", async () => {
      const { adminLettersProcedures } = await import("./routers/admin/letters");
      const { router } = await import("./_core/trpc");
      const appRouter = router({ admin: router(adminLettersProcedures) });
      const ctx = createMockCtx("attorney");
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.forceStatusTransition({
          letterId: 42,
          newStatus: "submitted",
          reason: "Test transition",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
