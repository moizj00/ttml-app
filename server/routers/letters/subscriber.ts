import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { checkTrpcRateLimit } from "../../rateLimiter";
import type { IntakeJson } from "../../../shared/types";
import { intakeJsonSchema, subscriberProcedure, getAppUrl } from "../_shared";
import {
  createAttachment,
  getLetterRequestById,
  getLetterRequestSafeForSubscriber,
  getLetterRequestsByUserId,
  getLetterVersionsByRequestId,
  getAttachmentsByLetterId,
  getReviewActions,
  archiveLetterRequest,
  getDeliveryLogByLetterId,
} from "../../db";
import { storagePut } from "../../storage";
import {
  processSubscriberFeedback,
  retryFromRejected,
  sendLetterToRecipientFlow,
  getSubscriberReleasedLetterProcedure,
} from "../../services/letters";
import { isFreePreviewUnlocked } from "../../../shared/utils/free-preview";

export const subscriberProcedures = {
  myLetters: subscriberProcedure.query(async ({ ctx }) => {
    return getLetterRequestsByUserId(ctx.user.id);
  }),

  detail: subscriberProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      // (PROCEDURE 6: getSubscriberReleasedLetterProcedure)
      // Check for 24h gate release before returning details
      const letter = await getSubscriberReleasedLetterProcedure(
        input.id,
        ctx.user.id
      );

      if (!letter)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Letter not found",
        });
      const actions = await getReviewActions(input.id, false);

      // Free-preview lead-magnet path: if this letter is on the first-letter
      // free-trial path AND the 24-hour cooling window has elapsed, tell the
      // versions query to skip ai_draft truncation.
      // Note: Procedurally we now use 'letter_released_to_subscriber' as the released state.
      const freePreviewUnlocked =
        letter.status === "letter_released_to_subscriber" ||
        isFreePreviewUnlocked(letter);

      const versions = await getLetterVersionsByRequestId(
        input.id,
        false,
        letter.status,
        freePreviewUnlocked,
        letter.isFreePreview === true
      );
      const attachmentList = await getAttachmentsByLetterId(input.id);
      return { letter, actions, versions, attachments: attachmentList };
    }),

  updateForChanges: subscriberProcedure
    .input(
      z.object({
        letterId: z.number(),
        additionalContext: z.string().min(10).max(5000),
        updatedIntakeJson: intakeJsonSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkTrpcRateLimit("letter", `user:${ctx.user.id}`, true);
      const letter = await getLetterRequestById(input.letterId);
      if (!letter || letter.userId !== ctx.user.id)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (letter.status !== "needs_changes")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter must be in needs_changes status",
        });
      return processSubscriberFeedback(input, {
        userId: ctx.user.id,
        req: ctx.req,
        letter: {
          userId: letter.userId,
          intakeJson: (letter.intakeJson as IntakeJson) ?? null,
          status: letter.status,
          subject: letter.subject,
          assignedReviewerId: letter.assignedReviewerId,
        },
      });
    }),

  retryFromRejected: subscriberProcedure
    .input(
      z.object({
        letterId: z.number(),
        additionalContext: z.string().min(10).max(5000).optional(),
        updatedIntakeJson: intakeJsonSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkTrpcRateLimit("letter", `user:${ctx.user.id}`, true);
      return retryFromRejected(input, {
        userId: ctx.user.id,
        userName: ctx.user.name,
        req: ctx.req,
      });
    }),

  archive: subscriberProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter || letter.userId !== ctx.user.id)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ![
          "approved",
          "client_approved",
          "rejected",
          "client_declined",
          "sent",
        ].includes(letter.status)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only completed letters can be archived",
        });
      await archiveLetterRequest(input.letterId, ctx.user.id);
      return { success: true };
    }),

  sendToRecipient: subscriberProcedure
    .input(
      z.object({
        letterId: z.number(),
        recipientEmail: z.string().email(),
        subjectOverride: z.string().max(500).optional(),
        note: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      sendLetterToRecipientFlow(input, {
        userId: ctx.user.id,
        appUrl: getAppUrl(ctx.req),
      })
    ),

  uploadAttachment: subscriberProcedure
    .input(
      z.object({
        letterId: z.number(),
        fileName: z.string(),
        mimeType: z.string(),
        base64Data: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter || letter.userId !== ctx.user.id)
        throw new TRPCError({ code: "NOT_FOUND" });
      const buffer = Buffer.from(input.base64Data, "base64");
      // Strip path separators and non-safe chars to prevent path traversal
      const safeName =
        input.fileName
          .replace(/[/\\]/g, "_")
          .replace(/[^a-zA-Z0-9._\-]/g, "_")
          .slice(0, 200) || "attachment";
      const key = `attachments/${ctx.user.id}/${input.letterId}/${Date.now()}-${safeName}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await createAttachment({
        letterRequestId: input.letterId,
        uploadedByUserId: ctx.user.id,
        storagePath: key,
        storageUrl: url,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: buffer.length,
      });
      return { url, key };
    }),

  /**
   * Fetch delivery log entries for a specific letter.
   * Only accessible by the owning subscriber. Surfaces in LetterDetail
   * as a delivery confirmation section.
   */
  deliveryLog: subscriberProcedure
    .input(z.object({ letterId: z.number() }))
    .query(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter || letter.userId !== ctx.user.id)
        throw new TRPCError({ code: "NOT_FOUND" });
      return getDeliveryLogByLetterId(input.letterId);
    }),
};
