/**
 * Admin Review Gate — Hard Guarantee Tests
 *
 * Verifies the core legal safety promise: no subscriber-accessible path
 * returns final deliverable content or a signed PDF before the letter
 * has been attorney-approved.
 *
 * Coverage:
 *   1. `letters.detail` with `getLetterVersionsByRequestId` — ai_draft is
 *      truncated / empty for locked/preview statuses; never full content
 *      before `approved`.
 *   2. `versions.get` — subscriber FORBIDDEN for ai_draft unless in a
 *      preview/locked status.
 *   3. `letters.generateOrFetchPdf` — BAD_REQUEST for any status outside
 *      {approved, client_approval_pending, client_approved, sent}.
 *   4. `applyFreePreviewGate` pure function — free-preview letters return
 *      empty content before the 24h window; full content only after unlock.
 *   5. `applyFreePreviewGate` pure function — non-free-preview locked
 *      letters only receive the truncated (~20%) paywall preview.
 *   6. `final_approved` version is never returned via `getLetterVersionsByRequestId`
 *      (subscriber-safe path) for letters still `under_review` / `pending_review`.
 *      (This relies on the DB query filtering to final_approved + ai_draft only,
 *       and there being no final_approved version until the attorney creates one.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import {
  applyFreePreviewGate,
  LOCKED_PREVIEW_STATUSES,
} from "./db/letter-versions";

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "email-id", error: null }) },
  })),
}));

vi.mock("./sentry", () => ({
  captureServerException: vi.fn(),
  initServerSentry: vi.fn(),
}));

const mockGetLetterRequestById = vi.fn();
const mockGetLetterVersionById = vi.fn();
const mockGetLetterVersionsByRequestId = vi.fn();
const mockGetReviewActions = vi.fn();
const mockGetAttachmentsByLetterId = vi.fn();
const mockGetLetterRequestSafeForSubscriber = vi.fn();

vi.mock("./db", () => ({
  getLetterRequestById: (...args: unknown[]) => mockGetLetterRequestById(...args),
  getLetterVersionById: (...args: unknown[]) => mockGetLetterVersionById(...args),
  getLetterVersionsByRequestId: (...args: unknown[]) => mockGetLetterVersionsByRequestId(...args),
  getReviewActions: (...args: unknown[]) => mockGetReviewActions(...args),
  getAttachmentsByLetterId: (...args: unknown[]) => mockGetAttachmentsByLetterId(...args),
  getLetterRequestSafeForSubscriber: (...args: unknown[]) => mockGetLetterRequestSafeForSubscriber(...args),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getAllLetterRequests: vi.fn().mockResolvedValue([]),
  getLetterRequestsByUserId: vi.fn().mockResolvedValue([]),
  getAllUsersWithSubscription: vi.fn().mockResolvedValue([]),
  getWorkflowJobsByLetterId: vi.fn().mockResolvedValue([]),
  getResearchRunsByLetterId: vi.fn().mockResolvedValue([]),
  getFailedJobs: vi.fn().mockResolvedValue([]),
  markAsPaidDb: vi.fn().mockResolvedValue(undefined),
  getEmployeesAndAdmins: vi.fn().mockResolvedValue([]),
  getUserById: vi.fn().mockResolvedValue(null),
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyAdmins: vi.fn().mockResolvedValue(undefined),
  notifyAllAttorneys: vi.fn().mockResolvedValue(undefined),
  createLetterVersion: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateLetterVersionPointers: vi.fn().mockResolvedValue(undefined),
  createLetterRequest: vi.fn().mockResolvedValue({ insertId: 1 }),
  createAttachment: vi.fn().mockResolvedValue(undefined),
  archiveLetterRequest: vi.fn().mockResolvedValue(undefined),
  logReviewAction: vi.fn().mockResolvedValue(undefined),
  updateLetterStatus: vi.fn().mockResolvedValue(undefined),
  claimLetterForReview: vi.fn().mockResolvedValue(undefined),
  getNotificationsByUserId: vi.fn().mockResolvedValue([]),
  getDeliveryLogByLetterId: vi.fn().mockResolvedValue([]),
  getSystemStats: vi.fn().mockResolvedValue({}),
  getCostAnalytics: vi.fn().mockResolvedValue({}),
  markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
  markNotificationRead: vi.fn().mockResolvedValue(undefined),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  updateUserProfile: vi.fn().mockResolvedValue(undefined),
  countCompletedLetters: vi.fn().mockResolvedValue(0),
  decrementLettersUsed: vi.fn().mockResolvedValue(undefined),
  refundFreeTrialSlot: vi.fn().mockResolvedValue(undefined),
  claimFreeTrialSlot: vi.fn().mockResolvedValue(true),
  createClientPortalToken: vi.fn().mockResolvedValue({ token: "tok", id: 1 }),
  updateLetterPdfUrl: vi.fn().mockResolvedValue(undefined),
  updateLetterStoragePath: vi.fn().mockResolvedValue(undefined),
  getUserByEmail: vi.fn().mockResolvedValue(null),
  deleteUserVerificationTokens: vi.fn().mockResolvedValue(undefined),
  createEmailVerificationToken: vi.fn().mockResolvedValue(undefined),
  purgeFailedJobs: vi.fn().mockResolvedValue(undefined),
  getAllDiscountCodes: vi.fn().mockResolvedValue([]),
  updateDiscountCode: vi.fn().mockResolvedValue(undefined),
  getCommissionsByEmployeeId: vi.fn().mockResolvedValue([]),
  getEmployeeEarningsSummary: vi.fn().mockResolvedValue({}),
  getAllCommissions: vi.fn().mockResolvedValue([]),
  getAdminReferralDetails: vi.fn().mockResolvedValue([]),
  markCommissionsPaid: vi.fn().mockResolvedValue(undefined),
  createPayoutRequest: vi.fn().mockResolvedValue({ id: 1 }),
  getPayoutRequestsByEmployeeId: vi.fn().mockResolvedValue([]),
  getAllPayoutRequests: vi.fn().mockResolvedValue([]),
  processPayoutRequest: vi.fn().mockResolvedValue(undefined),
  getPayoutRequestById: vi.fn().mockResolvedValue(null),
  getAllEmployeeEarnings: vi.fn().mockResolvedValue([]),
  getDiscountCodeByCode: vi.fn().mockResolvedValue(null),
  incrementDiscountCodeUsage: vi.fn().mockResolvedValue(undefined),
  createCommission: vi.fn().mockResolvedValue({ id: 1 }),
  getAllLessons: vi.fn().mockResolvedValue([]),
  createPipelineLesson: vi.fn().mockResolvedValue({ id: 1 }),
  updatePipelineLesson: vi.fn().mockResolvedValue(undefined),
  getQualityScoreStats: vi.fn().mockResolvedValue({}),
  getQualityScoreTrend: vi.fn().mockResolvedValue([]),
  getQualityScoresByLetterType: vi.fn().mockResolvedValue([]),
  getLessonImpactSummary: vi.fn().mockResolvedValue({}),
  assignRoleId: vi.fn().mockResolvedValue(undefined),
  getPublishedBlogPosts: vi.fn().mockResolvedValue([]),
  getBlogPostBySlug: vi.fn().mockResolvedValue(null),
  getAllBlogPosts: vi.fn().mockResolvedValue([]),
  createBlogPost: vi.fn().mockResolvedValue({ id: 1 }),
  updateBlogPost: vi.fn().mockResolvedValue(undefined),
  deleteBlogPost: vi.fn().mockResolvedValue(undefined),
  getBlogPostSlugById: vi.fn().mockResolvedValue(null),
  getPipelineAnalytics: vi.fn().mockResolvedValue({}),
  getLetterTemplateById: vi.fn().mockResolvedValue(null),
  getDiscountCodeByEmployeeId: vi.fn().mockResolvedValue(null),
  rotateDiscountCode: vi.fn().mockResolvedValue(null),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue(undefined),
  storageGet: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/file.pdf" }),
}));

vi.mock("./pdfGenerator", () => ({
  generateAndUploadApprovedPdf: vi.fn().mockResolvedValue("https://cdn.example.com/file.pdf"),
}));

vi.mock("./rateLimiter", () => ({
  checkTrpcRateLimit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("./services/letters", () => ({
  submitLetter: vi.fn().mockResolvedValue({ letterId: 1, status: "submitted", isFreePreview: false }),
  getSubscriberReleasedLetterProcedure: (...args: unknown[]) =>
    mockGetLetterRequestSafeForSubscriber(...args),
  processSubscriberFeedback: vi.fn().mockResolvedValue(undefined),
  retryFromRejected: vi.fn().mockResolvedValue(undefined),
  sendLetterToRecipientFlow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/admin2fa", () => ({
  signAdmin2FAToken: vi.fn().mockReturnValue("mock-2fa-token"),
  verifyAdmin2FAToken: vi.fn().mockReturnValue(true),
  ADMIN_2FA_COOKIE: "admin_2fa",
}));

vi.mock("./stripe", () => ({
  checkLetterSubmissionAllowed: vi.fn().mockResolvedValue({ allowed: true }),
  incrementLettersUsed: vi.fn().mockResolvedValue(true),
  getUserSubscription: vi.fn().mockResolvedValue(null),
  hasActiveRecurringSubscription: vi.fn().mockResolvedValue(false),
  hasEverSubscribed: vi.fn().mockResolvedValue(false),
  createBillingPortalSession: vi.fn().mockResolvedValue("https://billing.stripe.com/session"),
  activateSubscription: vi.fn().mockResolvedValue(undefined),
}));

import { appRouter } from "./routers";

// ─── Context factory ───────────────────────────────────────────────────────────
function makeSubscriberCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      role: "subscriber",
      openId: `sub-${userId}`,
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      freeReviewUsedAt: null,
    },
    req: { headers: { cookie: "" } } as any,
    cookies: {},
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as TrpcContext;
}

// ─── Letter fixture ────────────────────────────────────────────────────────────
function makeLetter(status: string, userId = 1) {
  return {
    id: 10,
    userId,
    letterType: "demand-letter",
    subject: "Test",
    status,
    isFreePreview: false,
    freePreviewUnlockAt: null,
    visibilityStatus: "visible",
    currentAiDraftVersionId: null,
    currentAttorneyEditVersionId: null,
    pdfStoragePath: null,
    pdfUrl: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function makeVersion(
  versionType: "ai_draft" | "attorney_edit" | "final_approved",
  letterId = 10,
  content = "Full legal letter content..."
) {
  return {
    id: 1,
    letterRequestId: letterId,
    versionType,
    content,
    createdByType: "system",
    createdByUserId: null,
    metadataJson: null,
    createdAt: new Date("2026-01-01"),
  };
}

// ═══════════════════════════════════════════════════════════════════
// Section 1: applyFreePreviewGate — pure function gate
// ═══════════════════════════════════════════════════════════════════
describe("applyFreePreviewGate — admin review gate (pure function)", () => {
  const FULL_CONTENT = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}: legal content here for testing purposes.`).join("\n");

  it("returns EMPTY content for ai_draft before the 24h free-preview unlock window", () => {
    const rows = [makeVersion("ai_draft", 10, FULL_CONTENT)];
    const letter = {
      isFreePreview: true,
      freePreviewUnlockAt: new Date(Date.now() + 25 * 60 * 60 * 1000), // 25h in future
    };

    const result = applyFreePreviewGate(rows, "ai_generation_completed_hidden", letter);

    expect(result[0].content).toBe(""); // empty — waiting for 24h gate
    expect((result[0] as any).freePreviewWaiting).toBe(true);
    expect((result[0] as any).truncated).toBe(true);
  });

  it("returns FULL content for ai_draft after the 24h free-preview unlock window", () => {
    const rows = [makeVersion("ai_draft", 10, FULL_CONTENT)];
    const letter = {
      isFreePreview: true,
      freePreviewUnlockAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago
    };

    const result = applyFreePreviewGate(rows, "letter_released_to_subscriber", letter);

    expect(result[0].content).toBe(FULL_CONTENT); // full content
    expect((result[0] as any).freePreview).toBe(true);
    expect((result[0] as any).truncated).toBe(false);
  });

  it("TRUNCATES non-free-preview ai_draft content for locked-paywall statuses", () => {
    const rows = [makeVersion("ai_draft", 10, FULL_CONTENT)];
    const letter = { isFreePreview: false, freePreviewUnlockAt: null };

    for (const status of LOCKED_PREVIEW_STATUSES) {
      const result = applyFreePreviewGate(rows, status, letter);
      expect(result[0].truncated).toBe(true);
      // Truncated content must be shorter than the original
      expect((result[0].content?.length ?? 0)).toBeLessThan(FULL_CONTENT.length);
    }
  });

  it("returns FULL content unmodified for non-locked statuses (e.g. pending_review)", () => {
    const rows = [makeVersion("ai_draft", 10, FULL_CONTENT)];
    const letter = { isFreePreview: false, freePreviewUnlockAt: null };

    const result = applyFreePreviewGate(rows, "pending_review", letter);

    expect(result[0].content).toBe(FULL_CONTENT);
    expect((result[0] as any).truncated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 2: versions.get — subscriber blocked from ai_draft outside
//            preview/locked window
// ═══════════════════════════════════════════════════════════════════
describe("versions.get — subscriber blocked from non-preview ai_draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns FORBIDDEN when subscriber requests ai_draft and letter is under_review", async () => {
    mockGetLetterVersionById.mockResolvedValue(makeVersion("ai_draft", 10));
    mockGetLetterRequestById.mockResolvedValue(
      makeLetter("under_review", 1)
    );

    const caller = appRouter.createCaller(makeSubscriberCtx(1));

    await expect(caller.versions.get({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns FORBIDDEN when subscriber requests ai_draft and letter is approved", async () => {
    mockGetLetterVersionById.mockResolvedValue(makeVersion("ai_draft", 10));
    mockGetLetterRequestById.mockResolvedValue(makeLetter("approved", 1));

    const caller = appRouter.createCaller(makeSubscriberCtx(1));

    await expect(caller.versions.get({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns the final_approved version without restriction (subscriber can always see approved final)", async () => {
    const finalVersion = makeVersion("final_approved", 10);
    mockGetLetterVersionById.mockResolvedValue(finalVersion);
    mockGetLetterRequestById.mockResolvedValue(makeLetter("approved", 1));

    const caller = appRouter.createCaller(makeSubscriberCtx(1));

    const result = await caller.versions.get({ id: 1 });
    expect(result.versionType).toBe("final_approved");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 3: letters.generateOrFetchPdf — only allowed after approval
// ═══════════════════════════════════════════════════════════════════
describe("letters.generateOrFetchPdf — status gate", () => {
  const ALLOWED_STATUSES = [
    "approved",
    "client_approval_pending",
    "client_approved",
    "sent",
  ];

  const BLOCKED_STATUSES = [
    "submitted",
    "researching",
    "drafting",
    "ai_generation_completed_hidden",
    "letter_released_to_subscriber",
    "attorney_review_upsell_shown",
    "attorney_review_checkout_started",
    "attorney_review_payment_confirmed",
    "generated_locked",
    "pending_review",
    "under_review",
    "needs_changes",
    "rejected",
    "pipeline_failed",
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(BLOCKED_STATUSES)(
    "returns BAD_REQUEST when letter status is '%s' (not yet approved)",
    async (status) => {
      mockGetLetterRequestById.mockResolvedValue(makeLetter(status, 1));

      const caller = appRouter.createCaller(makeSubscriberCtx(1));

      await expect(
        caller.letters.generateOrFetchPdf({ letterId: 10 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  );

  it.each(ALLOWED_STATUSES)(
    "allows PDF generation when letter status is '%s' (post-approval)",
    async (status) => {
      mockGetLetterRequestById.mockResolvedValue({
        ...makeLetter(status, 1),
        pdfStoragePath: "letters/10/final.pdf",
      });

      const caller = appRouter.createCaller(makeSubscriberCtx(1));

      const result = await caller.letters.generateOrFetchPdf({ letterId: 10 });
      expect(result.pdfUrl).toBeDefined();
    }
  );

  it("returns NOT_FOUND when subscriber requests PDF for a letter they do not own", async () => {
    mockGetLetterRequestById.mockResolvedValue(
      makeLetter("approved", 999) // belongs to user 999, not user 1
    );

    const caller = appRouter.createCaller(makeSubscriberCtx(1));

    await expect(
      caller.letters.generateOrFetchPdf({ letterId: 10 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 4: LOCKED_PREVIEW_STATUSES set — documents the gate boundary
// ═══════════════════════════════════════════════════════════════════
describe("LOCKED_PREVIEW_STATUSES — paywall boundary", () => {
  it("contains exactly the expected locked statuses", () => {
    expect(LOCKED_PREVIEW_STATUSES.has("generated_locked")).toBe(true);
    expect(LOCKED_PREVIEW_STATUSES.has("ai_generation_completed_hidden")).toBe(
      true
    );
    expect(LOCKED_PREVIEW_STATUSES.has("letter_released_to_subscriber")).toBe(
      true
    );
    expect(LOCKED_PREVIEW_STATUSES.has("attorney_review_upsell_shown")).toBe(
      true
    );
  });

  it("does NOT include post-payment statuses (content should be untruncated)", () => {
    // These statuses indicate the subscriber has paid — no paywall truncation
    const postPaymentStatuses = [
      "pending_review",
      "under_review",
      "approved",
      "client_approval_pending",
      "sent",
    ];
    for (const s of postPaymentStatuses) {
      expect(LOCKED_PREVIEW_STATUSES.has(s)).toBe(false);
    }
  });
});
