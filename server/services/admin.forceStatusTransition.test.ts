import { describe, expect, it, vi, beforeEach } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getLetterRequestById: vi.fn(),
  getDb: vi.fn(),
  updateLetterStatus: vi.fn(),
  logReviewAction: vi.fn(),
}));

const previewMocks = vi.hoisted(() => ({
  dispatchFreePreviewIfReady: vi.fn(),
}));

vi.mock("../db", () => ({
  updateUserRole: vi.fn(),
  assignRoleId: vi.fn(),
  getUserById: vi.fn(),
  createNotification: vi.fn(),
  notifyAdmins: vi.fn(),
  getAllLetterRequests: vi.fn(),
  getUserByEmail: vi.fn(),
  getLetterRequestById: dbMocks.getLetterRequestById,
  updateLetterStatus: dbMocks.updateLetterStatus,
  logReviewAction: dbMocks.logReviewAction,
  getLetterVersionsByRequestId: vi.fn(),
  getWorkflowJobsByLetterId: vi.fn(),
  getDb: dbMocks.getDb,
}));

vi.mock("../email", () => ({
  sendAttorneyInvitationEmail: vi.fn(),
  sendNewReviewNeededEmail: vi.fn(),
  sendStatusUpdateEmail: vi.fn(),
}));

vi.mock("../freePreviewEmailCron", () => ({
  dispatchFreePreviewIfReady: previewMocks.dispatchFreePreviewIfReady,
}));

vi.mock("../../drizzle/schema", () => ({
  letterRequests: {
    id: Symbol("letterRequests.id"),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("../sentry", () => ({
  captureServerException: vi.fn(),
}));

vi.mock("../supabaseAuth", () => ({
  invalidateUserCache: vi.fn(),
  getOriginUrl: vi.fn(),
}));

vi.mock("../stripe", () => ({
  hasEverSubscribed: vi.fn(),
}));

vi.mock("../queue", () => ({
  cancelPipelineJobForLetter: vi.fn(),
  enqueueRetryFromStageJob: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { forceStatusTransition } from "./admin";

function makeDb() {
  return {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

describe("forceStatusTransition free-preview release notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getDb.mockResolvedValue(makeDb());
    dbMocks.getLetterRequestById.mockResolvedValue({
      id: 101,
      userId: 42,
      status: "ai_generation_completed_hidden",
      subject: "Demand Letter",
      letterType: "demand",
      jurisdictionState: "CA",
      jurisdictionCountry: "US",
      isFreePreview: true,
      freePreviewUnlockAt: new Date(Date.now() + 60 * 60 * 1000),
      freePreviewEmailSentAt: null,
      intakeJson: { matter: { subject: "Demand Letter" } },
      pipelineLockedAt: null,
    });
    dbMocks.updateLetterStatus.mockResolvedValue(undefined);
    dbMocks.logReviewAction.mockResolvedValue(undefined);
    previewMocks.dispatchFreePreviewIfReady.mockResolvedValue({ status: "sent" });
  });

  it("reuses the normal preview dispatcher when admin force-releases a free-preview letter", async () => {
    await forceStatusTransition(
      {
        letterId: 101,
        newStatus: "letter_released_to_subscriber",
        reason: "Support verified the draft is ready",
      },
      { userId: 7, appUrl: "https://app.example.test" }
    );

    expect(dbMocks.updateLetterStatus).toHaveBeenCalledWith(
      101,
      "letter_released_to_subscriber",
      expect.objectContaining({ force: true })
    );
    expect(previewMocks.dispatchFreePreviewIfReady).toHaveBeenCalledWith(101);
  });
});
