/**
 * Phase 79: Attorney Review Assigned Email
 * Tests that sendReviewAssignedEmail is called when an attorney claims a letter.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLetter = {
  id: 42,
  userId: 5,
  subject: "Breach of Contract — ACME Corp",
  letterType: "breach_of_contract",
  status: "pending_review",
  assignedReviewerId: null,
  jurisdictionCity: "New York",
  jurisdictionState: "NY",
  jurisdictionCountry: "US",
  priority: "normal",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastStatusChangedAt: new Date(),
  archivedAt: null,
  currentAiDraftVersionId: null,
  currentFinalVersionId: null,
  pdfUrl: null,
  intakeJson: null,
  issueSummary: null,
};

const mockAttorney = {
  id: 20,
  name: "Jane Smith",
  email: "jane.smith@lawfirm.com",
  role: "attorney" as const,
  openId: "attorney-20",
  loginMethod: "email" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const mockSubscriber = {
  id: 5,
  name: "John Doe",
  email: "john.doe@example.com",
  role: "subscriber" as const,
  openId: "subscriber-5",
  loginMethod: "email" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

// Mock db module
vi.mock("./db", async () => {
  const actual = await vi.importActual("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({}),
    getLetterRequestById: vi.fn().mockImplementation(async (id: number) => {
      if (id === 42) return { ...mockLetter };
      return undefined;
    }),
    claimLetterForReview: vi.fn().mockResolvedValue(undefined),
    logReviewAction: vi.fn().mockResolvedValue(undefined),
    getUserById: vi.fn().mockImplementation(async (id: number) => {
      if (id === 20) return { ...mockAttorney };
      if (id === 5) return { ...mockSubscriber };
      return undefined;
    }),
    createNotification: vi.fn().mockResolvedValue(undefined),
    getAllEmployeeEarnings: vi.fn().mockResolvedValue([]),
    getAllDiscountCodes: vi.fn().mockResolvedValue([]),
  };
});

// Mock email module — all functions mocked inline (no top-level vars to avoid hoisting issues)
vi.mock("./email", async () => {
  const actual = await vi.importActual("./email");
  return {
    ...actual,
    sendReviewAssignedEmail: vi.fn().mockResolvedValue(undefined),
    sendStatusUpdateEmail: vi.fn().mockResolvedValue(undefined),
    sendLetterApprovedEmail: vi.fn().mockResolvedValue(undefined),
    sendLetterRejectedEmail: vi.fn().mockResolvedValue(undefined),
    sendNeedsChangesEmail: vi.fn().mockResolvedValue(undefined),
    sendNewReviewNeededEmail: vi.fn().mockResolvedValue(undefined),
    sendLetterSubmissionEmail: vi.fn().mockResolvedValue(undefined),
    sendLetterReadyEmail: vi.fn().mockResolvedValue(undefined),
    sendLetterUnlockedEmail: vi.fn().mockResolvedValue(undefined),
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendJobFailedAlertEmail: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock pipeline and PDF modules
vi.mock("./pipeline", () => ({
  runFullPipeline: vi.fn().mockResolvedValue(undefined),
  retryPipelineFromStage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./pdfGenerator", () => ({
  generateAndUploadApprovedPdf: vi.fn().mockResolvedValue("https://example.com/letter.pdf"),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://example.com/file.pdf", key: "file.pdf" }),
}));

vi.mock("./stripe", () => ({
  hasActiveRecurringSubscription: vi.fn().mockResolvedValue(false),
  createCheckoutSession: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com" }),
}));

vi.mock("./rateLimiter", () => ({
  checkTrpcRateLimit: vi.fn().mockResolvedValue(undefined),
}));

// ─── Context Helper ───────────────────────────────────────────────────────────

function createAttorneyContext(userId = 20): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `attorney-${userId}`,
      email: mockAttorney.email,
      name: mockAttorney.name,
      loginMethod: "email",
      role: "attorney",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: { host: "www.talk-to-my-lawyer.com" },
    } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as any,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("letters.claim — attorney review assigned email", () => {
  let emailModule: typeof import("./email");

  beforeEach(async () => {
    vi.clearAllMocks();
    emailModule = await import("./email");
  });

  it("sends sendReviewAssignedEmail to the attorney after claiming a letter", async () => {
    const caller = appRouter.createCaller(createAttorneyContext());
    const result = await caller.review.claim({ letterId: 42 });

    expect(result.success).toBe(true);
    expect(vi.mocked(emailModule.sendReviewAssignedEmail)).toHaveBeenCalledOnce();
    expect(vi.mocked(emailModule.sendReviewAssignedEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: mockAttorney.email,
        name: mockAttorney.name,
        letterSubject: mockLetter.subject,
        letterId: 42,
        letterType: mockLetter.letterType,
        subscriberName: mockSubscriber.name,
      })
    );
  });

  it("includes correct jurisdiction in the email", async () => {
    const caller = appRouter.createCaller(createAttorneyContext());
    await caller.review.claim({ letterId: 42 });

    const callArgs = vi.mocked(emailModule.sendReviewAssignedEmail).mock.calls[0][0];
    expect(callArgs.jurisdiction).toContain("New York");
    expect(callArgs.jurisdiction).toContain("NY");
    expect(callArgs.jurisdiction).toContain("US");
  });

  it("also sends status update email to the subscriber", async () => {
    const caller = appRouter.createCaller(createAttorneyContext());
    await caller.review.claim({ letterId: 42 });

    expect(vi.mocked(emailModule.sendStatusUpdateEmail)).toHaveBeenCalled();
    expect(vi.mocked(emailModule.sendStatusUpdateEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: mockSubscriber.email,
        newStatus: "under_review",
      })
    );
  });

  it("does not throw if attorney has no email (graceful degradation)", async () => {
    const dbModule = await import("./db");
    vi.mocked(dbModule.getUserById).mockImplementation(async (id: number) => {
      if (id === 20) return { ...mockAttorney, email: null as any };
      if (id === 5) return { ...mockSubscriber };
      return undefined;
    });

    const caller = appRouter.createCaller(createAttorneyContext());
    // Should not throw even if attorney has no email
    const result = await caller.review.claim({ letterId: 42 });
    expect(result.success).toBe(true);
    // Email should NOT be called since there's no email address
    expect(vi.mocked(emailModule.sendReviewAssignedEmail)).not.toHaveBeenCalled();
  });

  it("rejects claim if letter is not in a reviewable state", async () => {
    const { getLetterRequestById } = await import("./db");
    vi.mocked(getLetterRequestById).mockResolvedValueOnce({
      ...mockLetter,
      status: "approved",
    } as any);

    const caller = appRouter.createCaller(createAttorneyContext());
    await expect(caller.review.claim({ letterId: 42 })).rejects.toThrow();
    expect(vi.mocked(emailModule.sendReviewAssignedEmail)).not.toHaveBeenCalled();
  });

  it("rejects claim if letter does not exist", async () => {
    const caller = appRouter.createCaller(createAttorneyContext());
    await expect(caller.review.claim({ letterId: 9999 })).rejects.toThrow();
    expect(vi.mocked(emailModule.sendReviewAssignedEmail)).not.toHaveBeenCalled();
  });
});
