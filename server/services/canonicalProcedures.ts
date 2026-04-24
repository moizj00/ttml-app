import { TRPCError } from "@trpc/server";
import {
  createLetterRequest,
  updateLetterStatus,
  createLetterVersion,
  updateLetterVersionPointers,
  getLetterRequestById,
  logReviewAction,
  claimFreeTrialSlot,
  getDb,
  getUserById,
  notifyAdmins,
} from "../db";
import { enqueuePipelineJob } from "../queue";
import { letterRequests } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";
import { Anthropic } from "@anthropic-ai/sdk";
import type { IntakeJson } from "../../shared/types";
import { checkLetterSubmissionAllowed, incrementLettersUsed } from "../stripe";
import {
  createCheckoutSession,
  createLetterUnlockCheckout,
} from "../stripe/checkouts";
import { FIRST_LETTER_REVIEW_PLAN_ID } from "../stripe-products";

// ─── Constants and Types ───────────────────────────────────────────────────

const LETTER_HOLD_HOURS = 24;
const DEFAULT_MODEL = "claude-3-5-sonnet-20240620"; // Swappable to any Claude variant

export type LetterGenerationMethod =
  | "INTAKE_AUTO_GENERATION"
  | "ADMIN_MANUAL_GENERATION";
export type LetterGenerationPipeline =
  | "SIMPLE_CLAUDE_PIPELINE"
  | "STANDARD_INTAKE_PIPELINE";
export type LetterArtifactType =
  | "FULL_UNREDACTED_AI_LETTER"
  | "ATTORNEY_REVIEWED_FINAL_LETTER";

// ─── Procedures ────────────────────────────────────────────────────────────

/**
 * PROCEDURE 1: submitSubscriberIntakeProcedure
 * Inputs: subscriberId, intakePayload, letterType.
 */
export async function submitSubscriberIntakeProcedure(
  subscriberId: number,
  intakePayload: IntakeJson,
  letterType: string
) {
  const entitlement = await checkLetterSubmissionAllowed(subscriberId);
  if (!entitlement.allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: entitlement.reason ?? "Submission not allowed",
    });
  }

  // Claim usage
  if (entitlement.firstLetterFree) {
    const claimed = await claimFreeTrialSlot(subscriberId);
    if (!claimed)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Free slot already used",
      });
  } else if (entitlement.subscription) {
    const incremented = await incrementLettersUsed(subscriberId);
    if (!incremented)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No letters remaining in plan",
      });
  }

  const submittedAt = new Date();
  const subscriberVisibleAt = new Date(
    submittedAt.getTime() + LETTER_HOLD_HOURS * 60 * 60 * 1000
  );

  const result = await createLetterRequest({
    userId: subscriberId,
    letterType: letterType as any,
    subject: intakePayload.matter?.subject || "Legal Matter",
    intakeJson: intakePayload,
    isFreePreview: entitlement.firstLetterFree,
    freePreviewUnlockAt: subscriberVisibleAt,
  });

  const requestId = result.insertId;

  await logReviewAction({
    letterRequestId: requestId,
    reviewerId: subscriberId,
    actorType: "subscriber",
    action: "letter_submitted",
    toStatus: "submitted",
  });

  // Start generation immediately (24h delay is now only a visibility gate)
  enqueueLetterGenerationProcedure(
    requestId,
    "INTAKE_AUTO_GENERATION",
    "STANDARD_INTAKE_PIPELINE"
  );

  return { requestId, status: "submitted", subscriberVisibleAt };
}

/**
 * PROCEDURE 2: enqueueLetterGenerationProcedure
 * Inputs: requestId, method, pipeline.
 */
export async function enqueueLetterGenerationProcedure(
  requestId: number,
  method: LetterGenerationMethod,
  pipeline: LetterGenerationPipeline
) {
  // Generation should run immediately; the 24h free-preview behavior is a
  // visibility gate enforced by freePreviewUnlockAt, not a queue delay.

  const request = await getLetterRequestById(requestId);
  if (!request) throw new Error("Request not found");

  await enqueuePipelineJob(
    {
      type: "runPipeline",
      letterId: requestId,
      intake: request.intakeJson,
      userId: request.userId ?? undefined,
      appUrl: process.env.APP_URL ?? "",
      label: `Simple Draft for #${requestId}`,
      usageContext: {
        shouldRefundOnFailure: true,
        isFreeTrialSubmission: request.isFreePreview === true,
      },
    },
    { startAfter: new Date() }
  );

  return { status: "AI_GENERATION_QUEUED" };
}

/**
 * PROCEDURE 3: executeLetterGenerationProcedure
 * Inputs: requestId, method, pipeline.
 */
export async function executeLetterGenerationProcedure(
  requestId: number,
  method: LetterGenerationMethod,
  pipeline: LetterGenerationPipeline
) {
  const request = await getLetterRequestById(requestId);
  if (!request) throw new Error("Request not found");

  await updateLetterStatus(requestId, "researching");
  await updateLetterStatus(requestId, "drafting");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = _buildClaudePrompt(request.intakeJson as IntakeJson);

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const fullLetter =
    message.content[0]?.type === "text" ? message.content[0].text : "";

  await persistGeneratedLetterProcedure(
    requestId,
    fullLetter,
    "FULL_UNREDACTED_AI_LETTER",
    method,
    pipeline,
    DEFAULT_MODEL,
    { tokenUsage: message.usage }
  );
}

/**
 * PROCEDURE 4: persistGeneratedLetterProcedure
 * Inputs: requestId, fullLetter, artifactType, method, pipeline, modelName, generationMetadata.
 */
export async function persistGeneratedLetterProcedure(
  requestId: number,
  fullLetter: string,
  artifactType: LetterArtifactType,
  method: LetterGenerationMethod,
  pipeline: LetterGenerationPipeline,
  modelName: string,
  generationMetadata: any
) {
  const version = await createLetterVersion({
    letterRequestId: requestId,
    versionType: "ai_draft",
    content: fullLetter,
    createdByType: "system",
    metadataJson: {
      artifactType,
      method,
      pipeline,
      modelName,
      ...generationMetadata,
    },
  });

  await updateLetterVersionPointers(requestId, {
    currentAiDraftVersionId: version.insertId,
  });

  await updateLetterStatus(requestId, "ai_generation_completed_hidden");
}

/**
 * PROCEDURE 5: resolveLetterVisibilityProcedure
 * Inputs: requestId, subscriberId.
 */
export async function resolveLetterVisibilityProcedure(
  requestId: number,
  subscriberId: number
) {
  const request = await getLetterRequestById(requestId);
  if (!request || request.userId !== subscriberId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found" });
  }

  const now = new Date();
  const visibleAt = request.freePreviewUnlockAt
    ? new Date(request.freePreviewUnlockAt)
    : null;

  if (request.status === "pipeline_failed")
    return { status: "locked_generation_failed" };

  // If the letter's status is no longer ai_generation_completed_hidden (meaning admin already bypassed it),
  // return visible immediately without checking the clock.
  if (request.status !== "ai_generation_completed_hidden") {
    return { status: "visible_after_24_hours" };
  }

  if (!request.currentAiDraftVersionId)
    return { status: "locked_generation_pending" };

  // Rule: release at unlock time OR if it's already released/further along
  if (
    visibleAt &&
    now < visibleAt &&
    request.status === "ai_generation_completed_hidden"
  ) {
    return { status: "hidden_before_24_hours" };
  }

  return { status: "visible_after_24_hours" };
}

/**
 * PROCEDURE 6: getSubscriberReleasedLetterProcedure
 * Inputs: requestId, subscriberId.
 */
export async function getSubscriberReleasedLetterProcedure(
  requestId: number,
  subscriberId: number
) {
  const visibility = await resolveLetterVisibilityProcedure(
    requestId,
    subscriberId
  );

  if (visibility.status === "visible_after_24_hours") {
    const request = await getLetterRequestById(requestId);
    if (request?.status === "ai_generation_completed_hidden") {
      await updateLetterStatus(requestId, "letter_released_to_subscriber");
    }

    await markAttorneyReviewUpsellShownProcedure(requestId, subscriberId);
    return { status: "visible", visibility };
  }

  return { status: "hidden", visibility };
}

/**
 * PROCEDURE 7: markAttorneyReviewUpsellShownProcedure
 * Inputs: requestId, subscriberId.
 */
export async function markAttorneyReviewUpsellShownProcedure(
  requestId: number,
  subscriberId: number
) {
  const request = await getLetterRequestById(requestId);
  if (request?.status === "letter_released_to_subscriber") {
    await updateLetterStatus(requestId, "attorney_review_upsell_shown");
  }
}

/**
 * PROCEDURE 9: createAttorneyReviewCheckoutProcedure
 * Inputs: requestId, subscriberId, packageType.
 */
export async function createAttorneyReviewCheckoutProcedure(
  requestId: number,
  subscriberId: number,
  packageType: "ATTORNEY_REVIEW_SUBSCRIPTION" | "ONE_TIME_ATTORNEY_REVIEW",
  origin: string
) {
  const user = await getUserById(subscriberId);
  const email = user?.email;
  if (!email)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "User email not found",
    });

  let checkout;
  if (packageType === "ATTORNEY_REVIEW_SUBSCRIPTION") {
    checkout = await createCheckoutSession({
      userId: subscriberId,
      email,
      planId: "monthly_subscription", // Example default
      origin,
      returnTo: `/letters/${requestId}`,
    });
  } else {
    // Check if they are eligible for the $50 first letter review
    const entitlement = await checkLetterSubmissionAllowed(subscriberId);
    if (entitlement.firstLetterFree) {
      // Actually they would use createFirstLetterReviewCheckout in the real codebase
      // but for simplicity we'll use a standard unlock pattern or existing checkout helper
      checkout = await createLetterUnlockCheckout({
        userId: subscriberId,
        email,
        letterId: requestId,
        origin,
      });
    } else {
      checkout = await createLetterUnlockCheckout({
        userId: subscriberId,
        email,
        letterId: requestId,
        origin,
      });
    }
  }

  await updateLetterStatus(requestId, "attorney_review_checkout_started");
  return { checkoutUrl: checkout.url };
}

/**
 * PROCEDURE 10: confirmAttorneyReviewPaymentProcedure
 * Inputs: requestId, subscriberId.
 */
export async function confirmAttorneyReviewPaymentProcedure(
  requestId: number,
  subscriberId: number
) {
  const request = await getLetterRequestById(requestId);
  if (!request)
    throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

  await updateLetterStatus(requestId, "attorney_review_payment_confirmed");

  await logReviewAction({
    letterRequestId: requestId,
    actorType: "system",
    action: "payment_received",
    noteText: "Payment verified via procedural flow.",
    fromStatus: request.status,
    toStatus: "attorney_review_payment_confirmed",
  });

  if (request.currentAiDraftVersionId) {
    await postLetterToReviewCenterProcedure(
      requestId,
      subscriberId,
      request.currentAiDraftVersionId
    );
  }
}

/**
 * PROCEDURE 11: postLetterToReviewCenterProcedure
 * Inputs: requestId, subscriberId, generatedLetterId.
 */
export async function postLetterToReviewCenterProcedure(
  requestId: number,
  subscriberId: number,
  generatedLetterId: number
) {
  await updateLetterStatus(requestId, "pending_review");

  await logReviewAction({
    letterRequestId: requestId,
    actorType: "system",
    action: "review_queued",
    noteText: "Letter posted to review centre.",
    fromStatus: "attorney_review_payment_confirmed",
    toStatus: "pending_review",
  });

  notifyAdmins({
    category: "letters",
    type: "letter_submitted",
    title: "New review request",
    body: `Letter #${requestId} is ready for attorney review.`,
    link: `/admin/letters/${requestId}`,
  }).catch((err: any) =>
    logger.error(
      { err },
      "Admin notification failed after postLetterToReviewCenter"
    )
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function _buildClaudePrompt(intake: IntakeJson): string {
  const {
    matter,
    jurisdiction,
    recipient,
    sender,
    tonePreference,
    desiredOutcome,
    additionalContext,
  } = intake;
  // Build jurisdiction string from intake — never hardcode a state
  const jurisdictionStr =
    [jurisdiction?.city, jurisdiction?.state, jurisdiction?.country]
      .filter(Boolean)
      .join(", ") || "the applicable jurisdiction";
  return `Act as an expert legal drafting system. Draft a formal legal letter for ${jurisdictionStr}.
  Matter: ${matter?.subject ?? "Legal Matter"} (${matter?.category ?? "General"})
  Facts: ${matter?.description ?? "N/A"}
  Jurisdiction: ${jurisdictionStr}
  Tone: ${tonePreference ?? "Firm and professional"}
  Desired Outcome: ${desiredOutcome ?? "N/A"}
  Sender: ${sender?.name ?? "N/A"}
  Recipient: ${recipient?.name ?? "N/A"}
  Context: ${additionalContext ?? "None"}
  Exclude mention of AI. Focus on professional legal structure.`;
}
