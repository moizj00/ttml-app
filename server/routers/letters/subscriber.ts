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
  updateLetterPdfUrl,
  updateLetterStoragePath,
  getStreamChunksAfter,
} from "../../db";
import { storagePut, storageGet } from "../../storage";
import {
  processSubscriberFeedback,
  retryFromRejected,
  sendLetterToRecipientFlow,
  getSubscriberReleasedLetterProcedure,
} from "../../services/letters";
import { generateAndUploadApprovedPdf } from "../../pdfGenerator";
import { captureServerException } from "../../sentry";
import { logger } from "../../logger";

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

      const isFreePreviewWaiting =
        letter.isFreePreview === true && letter.visibilityStatus === "hidden";

      const subscriberDisplayStatus = isFreePreviewWaiting
        ? "free_preview_waiting"
        : letter.status;

      const versions = await getLetterVersionsByRequestId(
        input.id,
        false,
        letter.status,
        letter
      );
      const attachmentList = await getAttachmentsByLetterId(input.id);
      return {
        letter: { ...letter, subscriberDisplayStatus },
        actions,
        versions,
        attachments: attachmentList,
      };
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

  /**
   * Generate-on-demand or refresh-URL for an approved letter's PDF.
   *
   * The attorney `approve` mutation calls `generateAndUploadApprovedPdf`
   * inside a non-blocking try/catch — if R2 / Puppeteer hiccups there, the
   * letter still gets approved but `pdf_storage_path` / `pdf_url` stay NULL
   * forever. This mutation lets the subscriber recover from that state by
   * regenerating the PDF themselves. It also handles the "presigned URL
   * expired" case by re-presigning from the stored R2 key.
   *
   * Two paths:
   *   1. `pdf_storage_path` is set → `storageGet` to mint a fresh URL,
   *      persist it back to `pdf_url`, return.
   *   2. Not set → fetch the `final_approved` letter version, render and
   *      upload via the same `generateAndUploadApprovedPdf` the attorney
   *      flow uses, persist the new key + URL, return.
   *
   * Idempotent: re-running for the same letter overwrites the same R2 key
   * (the function builds the key from `letterId`).
   */
  generateOrFetchPdf: subscriberProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // PDF rendering is expensive (worker / Puppeteer). Reuse the existing
      // "payment" rate-limit bucket — same caller-frequency guard the
      // draft-pdf streaming endpoint uses.
      await checkTrpcRateLimit("payment", `generate-pdf:${ctx.user.id}`);

      const letter = await getLetterRequestById(input.letterId);
      if (!letter || letter.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const ALLOWED = new Set([
        "approved",
        "client_approval_pending",
        "client_approved",
        "sent",
      ]);
      if (!ALLOWED.has(letter.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "PDF is only available after attorney review. Your letter is not yet ready.",
        });
      }

      // Fast path — PDF already in R2, just mint a fresh URL.
      const existingKey = (letter as any).pdfStoragePath as
        | string
        | null
        | undefined;
      if (existingKey) {
        try {
          const { url } = await storageGet(existingKey);
          // Persist freshest URL so anywhere else in the app that reads
          // `letter.pdfUrl` keeps a valid link.
          await updateLetterPdfUrl(input.letterId, url);
          return { pdfUrl: url, regenerated: false };
        } catch (err) {
          logger.warn(
            { err, letterId: input.letterId, key: existingKey },
            "[generateOrFetchPdf] storageGet failed for stored key — falling through to regenerate"
          );
        }
      }

      // Slow path — render and upload from scratch.
      const versions = await getLetterVersionsByRequestId(input.letterId, false);
      const finalVer = versions.find(v => v.versionType === "final_approved");
      if (!finalVer?.content) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No approved letter content found for this letter. The attorney has not produced a final version yet.",
        });
      }

      const approvalMeta = (finalVer.metadataJson ?? {}) as {
        approvedBy?: string;
        approvedAt?: string;
      };

      try {
        const { pdfKey, pdfUrl } = await generateAndUploadApprovedPdf({
          letterId: input.letterId,
          letterType: letter.letterType,
          subject: letter.subject,
          content: finalVer.content,
          approvedBy: approvalMeta.approvedBy,
          approvedAt: approvalMeta.approvedAt ?? new Date().toISOString(),
          jurisdictionState: letter.jurisdictionState,
          jurisdictionCountry: letter.jurisdictionCountry,
          intakeJson: letter.intakeJson as Record<string, unknown> | null,
        });
        await updateLetterStoragePath(input.letterId, pdfKey);
        await updateLetterPdfUrl(input.letterId, pdfUrl);
        logger.info(
          { letterId: input.letterId, pdfKey, userId: ctx.user.id },
          "[generateOrFetchPdf] Subscriber-triggered PDF generation succeeded"
        );
        return { pdfUrl, regenerated: true };
      } catch (err) {
        captureServerException(err as Error, {
          tags: {
            component: "letters",
            error_type: "subscriber_pdf_generation_failed",
          },
          extra: { letterId: input.letterId },
        });
        logger.error(
          { err, letterId: input.letterId },
          "[generateOrFetchPdf] PDF generation failed"
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "PDF generation failed. Please try again in a moment, or contact support if the problem persists.",
        });
      }
    }),

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

  /**
   * Fetch pipeline_stream_chunks for a letter with sequence_number > afterSeq,
   * ordered ascending. Used by useLetterStream to backfill missed chunks after
   * a reconnect — routes through server auth so RLS-protected data is accessible
   * via the httpOnly sb_session cookie rather than the unauthenticated browser
   * Supabase client.
   */
  streamChunksAfter: subscriberProcedure
    .input(
      z.object({
        letterId: z.number().int().positive(),
        afterSeq: z.number().int().default(-1),
      })
    )
    .output(
      z.array(
        z.object({
          id: z.string(),
          letterId: z.number(),
          chunkText: z.string(),
          stage: z.string(),
          sequenceNumber: z.number(),
          createdAt: z.date(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const chunks = await getStreamChunksAfter(
        input.letterId,
        ctx.user.id,
        input.afterSeq
      );
      // Serialize bigint id as string to avoid JSON number precision loss
      // for values > Number.MAX_SAFE_INTEGER. sequence_number (used for
      // deduplication in the hook) is a plain integer and is unaffected.
      return chunks.map(c => ({
        id: c.id.toString(),
        letterId: c.letterId,
        chunkText: c.chunkText,
        stage: c.stage,
        sequenceNumber: c.sequenceNumber,
        createdAt: c.createdAt,
      }));
    }),
};
