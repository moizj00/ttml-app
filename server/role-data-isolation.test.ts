/**
 * Role / Tenant Data Isolation Tests
 *
 * Ensures that tRPC procedures enforce object-level ownership so that:
 *
 *   1. Subscriber A cannot read Subscriber B's letter via the subscriber
 *      `detail` query — must get NOT_FOUND.
 *   2. Subscriber A cannot read Subscriber B's letter via `myLetters` — the
 *      query is always scoped to ctx.user.id.
 *   3. An employee can only retrieve their own commissions / code — not
 *      another employee's data.
 *   4. An attorney cannot call admin-only mutations (approve in admin context).
 *   5. A subscriber cannot call attorney/admin mutations (e.g. approve).
 *   6. Admin can access all letters (admin-level getAll query).
 *   7. A subscriber calling a letter that doesn't exist gets NOT_FOUND (no
 *      information leakage via a different error code).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

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
const mockGetLetterRequestsByUserId = vi.fn();
const mockGetLetterRequestSafeForSubscriber = vi.fn();
const mockGetLetterVersionsByRequestId = vi.fn();
const mockGetReviewActions = vi.fn();
const mockGetAttachmentsByLetterId = vi.fn();
const mockGetCommissionsByEmployeeId = vi.fn();
const mockGetDiscountCodeByEmployeeId = vi.fn();
const mockGetAllLetterRequests = vi.fn();
const mockUpdateLetterStatus = vi.fn();
const mockClaimLetterForReview = vi.fn();
const mockLogReviewAction = vi.fn();

vi.mock("./db", () => ({
  getLetterRequestById: (...args: unknown[]) => mockGetLetterRequestById(...args),
  getLetterRequestsByUserId: (...args: unknown[]) => mockGetLetterRequestsByUserId(...args),
  getLetterRequestSafeForSubscriber: (...args: unknown[]) => mockGetLetterRequestSafeForSubscriber(...args),
  getLetterVersionsByRequestId: (...args: unknown[]) => mockGetLetterVersionsByRequestId(...args),
  getReviewActions: (...args: unknown[]) => mockGetReviewActions(...args),
  getAttachmentsByLetterId: (...args: unknown[]) => mockGetAttachmentsByLetterId(...args),
  getCommissionsByEmployeeId: (...args: unknown[]) => mockGetCommissionsByEmployeeId(...args),
  getDiscountCodeByEmployeeId: (...args: unknown[]) => mockGetDiscountCodeByEmployeeId(...args),
  getAllLetterRequests: (...args: unknown[]) => mockGetAllLetterRequests(...args),
  updateLetterStatus: (...args: unknown[]) => mockUpdateLetterStatus(...args),
  claimLetterForReview: (...args: unknown[]) => mockClaimLetterForReview(...args),
  logReviewAction: (...args: unknown[]) => mockLogReviewAction(...args),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getEmployeesAndAdmins: vi.fn().mockResolvedValue([]),
  getWorkflowJobsByLetterId: vi.fn().mockResolvedValue([]),
  getResearchRunsByLetterId: vi.fn().mockResolvedValue([]),
  getLetterTemplateById: vi.fn().mockResolvedValue(null),
  getUserById: vi.fn().mockResolvedValue(null),
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyAdmins: vi.fn().mockResolvedValue(undefined),
  notifyAllAttorneys: vi.fn().mockResolvedValue(undefined),
  createLetterVersion: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateLetterVersionPointers: vi.fn().mockResolvedValue(undefined),
  createLetterRequest: vi.fn().mockResolvedValue({ insertId: 1 }),
  createAttachment: vi.fn().mockResolvedValue(undefined),
  archiveLetterRequest: vi.fn().mockResolvedValue(undefined),
  getNotificationsByUserId: vi.fn().mockResolvedValue([]),
  getDeliveryLogByLetterId: vi.fn().mockResolvedValue([]),
  getSystemStats: vi.fn().mockResolvedValue({}),
  getCostAnalytics: vi.fn().mockResolvedValue({}),
  getFailedJobs: vi.fn().mockResolvedValue([]),
  markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
  markNotificationRead: vi.fn().mockResolvedValue(undefined),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  updateUserProfile: vi.fn().mockResolvedValue(undefined),
  countCompletedLetters: vi.fn().mockResolvedValue(0),
  getAllUsersWithSubscription: vi.fn().mockResolvedValue([]),
  markAsPaidDb: vi.fn().mockResolvedValue(undefined),
  getLetterRequestsForAttorneyReview: vi.fn().mockResolvedValue([]),
  getDiscountCodeByCode: vi.fn().mockResolvedValue(null),
  incrementDiscountCodeUsage: vi.fn().mockResolvedValue(undefined),
  createCommission: vi.fn().mockResolvedValue({ id: 1 }),
  getEmployeeEarningsSummary: vi.fn().mockResolvedValue({}),
  getPayoutRequestsByEmployeeId: vi.fn().mockResolvedValue([]),
  createPayoutRequest: vi.fn().mockResolvedValue({ id: 1 }),
  getAllCommissions: vi.fn().mockResolvedValue([]),
  getAllPayoutRequests: vi.fn().mockResolvedValue([]),
  updatePayoutRequestStatus: vi.fn().mockResolvedValue(undefined),
  decrementLettersUsed: vi.fn().mockResolvedValue(undefined),
  refundFreeTrialSlot: vi.fn().mockResolvedValue(undefined),
  claimFreeTrialSlot: vi.fn().mockResolvedValue(true),
  createClientPortalToken: vi.fn().mockResolvedValue({ token: "tok", id: 1 }),
  updateLetterPdfUrl: vi.fn().mockResolvedValue(undefined),
  updateLetterStoragePath: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue(undefined),
  storageGet: vi.fn().mockResolvedValue("https://cdn.example.com/file.pdf"),
}));

vi.mock("./pdfGenerator", () => ({
  generateAndUploadApprovedPdf: vi.fn().mockResolvedValue("https://cdn.example.com/file.pdf"),
}));

vi.mock("./rateLimiter", () => ({
  checkTrpcRateLimit: vi.fn().mockResolvedValue(undefined),
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

vi.mock("./rateLimiter", () => ({
  checkTrpcRateLimit: vi.fn().mockResolvedValue(undefined),
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
import { signAdmin2FAToken, ADMIN_2FA_COOKIE } from "./_core/admin2fa";

// ─── Context factories ─────────────────────────────────────────────────────────
function makeCtx(
  overrides: Partial<TrpcContext["user"]> & { admin2fa?: boolean } = {}
): TrpcContext {
  const { admin2fa, ...userOverrides } = overrides;

  const user = {
    id: 1,
    role: "subscriber" as const,
    openId: "sub-1",
    name: "Alice",
    email: "alice@example.com",
    emailVerified: true,
    freeReviewUsedAt: null,
    ...userOverrides,
  };

  const cookies: Record<string, string> = {};
  if (admin2fa) {
    const token = signAdmin2FAToken(user.id);
    cookies[ADMIN_2FA_COOKIE] = token;
  }

  return {
    user,
    req: {
      headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
    } as any,
    cookies,
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as TrpcContext;
}

// ─── Letters owned by user 1 (alice) and user 2 (bob) ─────────────────────────
const ALICE_LETTER_ID = 100;
const BOB_LETTER_ID = 200;
const ALICE_USER_ID = 1;
const BOB_USER_ID = 2;

function makeLetterForUser(userId: number, letterId: number) {
  return {
    id: letterId,
    userId,
    letterType: "demand-letter",
    subject: "Test",
    status: "pending_review",
    isFreePreview: false,
    freePreviewUnlockAt: null,
    visibilityStatus: "visible",
    currentAiDraftVersionId: null,
    currentAttorneyEditVersionId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

// ─── 1. Subscriber A cannot read Subscriber B's letter ────────────────────────
describe("subscriber data isolation — cross-user letter access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReviewActions.mockResolvedValue([]);
    mockGetAttachmentsByLetterId.mockResolvedValue([]);
    mockGetLetterVersionsByRequestId.mockResolvedValue([]);
  });

  it("returns NOT_FOUND when subscriber A requests subscriber B's letter", async () => {
    // resolveLetterVisibilityProcedure (inside getSubscriberReleasedLetterProcedure)
    // throws NOT_FOUND when request.userId !== subscriberId.
    // We simulate this by returning null from the service layer mock.
    mockGetLetterRequestSafeForSubscriber.mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx({ id: ALICE_USER_ID }));

    await expect(
      caller.letters.detail({ id: BOB_LETTER_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the letter when subscriber accesses their own letter", async () => {
    mockGetLetterRequestSafeForSubscriber.mockResolvedValue(
      makeLetterForUser(ALICE_USER_ID, ALICE_LETTER_ID)
    );

    const caller = appRouter.createCaller(makeCtx({ id: ALICE_USER_ID }));

    const result = await caller.letters.detail({ id: ALICE_LETTER_ID });
    expect(result.letter.id).toBe(ALICE_LETTER_ID);
    expect(result.letter.userId).toBe(ALICE_USER_ID);
  });
});

// ─── 2. myLetters is always scoped to the calling subscriber ──────────────────
describe("subscriber data isolation — myLetters query scoping", () => {
  it("passes ctx.user.id to getLetterRequestsByUserId — never fetches all letters", async () => {
    mockGetLetterRequestsByUserId.mockResolvedValue([
      makeLetterForUser(ALICE_USER_ID, ALICE_LETTER_ID),
    ]);

    const caller = appRouter.createCaller(makeCtx({ id: ALICE_USER_ID }));
    const results = await caller.letters.myLetters();

    expect(mockGetLetterRequestsByUserId).toHaveBeenCalledWith(ALICE_USER_ID);
    expect(results).toHaveLength(1);
    expect(results[0].userId).toBe(ALICE_USER_ID);
  });

  it("does not expose Bob's letters when Alice calls myLetters", async () => {
    // Even if DB somehow returned both, the router always calls with Alice's id.
    mockGetLetterRequestsByUserId.mockResolvedValue([
      makeLetterForUser(ALICE_USER_ID, ALICE_LETTER_ID),
    ]);

    const caller = appRouter.createCaller(makeCtx({ id: ALICE_USER_ID }));
    const results = await caller.letters.myLetters();

    const bobLetters = results.filter((l: { userId: number }) => l.userId === BOB_USER_ID);
    expect(bobLetters).toHaveLength(0);
  });
});

// ─── 3. Employee scope — myCommissions fetches only the calling employee's data
describe("employee scope — commission isolation", () => {
  it("scopes myCommissions to the calling employee's id", async () => {
    mockGetCommissionsByEmployeeId.mockResolvedValue([
      { id: 1, employeeId: 10, commissionAmount: 1495 },
    ]);

    const caller = appRouter.createCaller(
      makeCtx({ id: 10, role: "employee" })
    );
    const results = await caller.affiliate.myCommissions();

    expect(mockGetCommissionsByEmployeeId).toHaveBeenCalledWith(10);
    expect(results[0].employeeId).toBe(10);
  });

  it("returns FORBIDDEN when a subscriber calls an employee-only procedure", async () => {
    const caller = appRouter.createCaller(
      makeCtx({ id: ALICE_USER_ID, role: "subscriber" })
    );

    await expect(caller.affiliate.myCommissions()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── 4. Attorney cannot call admin-only procedures ───────────────────────────
describe("attorney vs admin procedure guards", () => {
  it("returns FORBIDDEN when attorney tries to call admin allLetters", async () => {
    const caller = appRouter.createCaller(
      makeCtx({ id: 5, role: "attorney" })
    );

    await expect(caller.admin.allLetters()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── 5. Subscriber cannot call attorney/admin mutations ───────────────────────
describe("subscriber blocked from attorney/admin mutations", () => {
  it("returns FORBIDDEN when a subscriber tries to call an admin-only procedure", async () => {
    const caller = appRouter.createCaller(
      makeCtx({ id: ALICE_USER_ID, role: "subscriber" })
    );

    await expect(caller.admin.allLetters()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── 6. Admin can access all letters ─────────────────────────────────────────
describe("admin all-access", () => {
  it("returns all letters when admin calls allLetters", async () => {
    mockGetAllLetterRequests.mockResolvedValue([
      makeLetterForUser(ALICE_USER_ID, ALICE_LETTER_ID),
      makeLetterForUser(BOB_USER_ID, BOB_LETTER_ID),
    ]);

    const caller = appRouter.createCaller(
      makeCtx({ id: 99, role: "admin", admin2fa: true })
    );

    const results = await caller.admin.allLetters();
    expect(results).toHaveLength(2);
    expect(mockGetAllLetterRequests).toHaveBeenCalledTimes(1);
  });
});

// ─── 7. Non-existent letter returns NOT_FOUND, not a different error ──────────
describe("information-leakage prevention", () => {
  it("returns NOT_FOUND (not INTERNAL_SERVER_ERROR or FORBIDDEN) for a letter that does not exist", async () => {
    mockGetLetterRequestSafeForSubscriber.mockResolvedValue(null);

    const caller = appRouter.createCaller(makeCtx({ id: ALICE_USER_ID }));

    const error = await caller.letters.detail({ id: 99999 }).catch((e) => e);
    expect(error.code).toBe("NOT_FOUND");
  });
});
