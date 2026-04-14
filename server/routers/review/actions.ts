/**
 * Review Action Mutations
 *
 * Attorney mutations for the full review workflow:
 * claim → (saveEdit) → approve | reject | requestChanges | unclaim
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../../_core/trpc";
import { attorneyProcedure, getAppUrl } from "../_shared";
import {
  claimLetterForReview,
  createLetterVersion,
  createNotification,
  notifyAdmins,
  getLetterRequestById,
  getLetterVersionsByRequestId,
  getUserById,
  logReviewAction,
  updateLetterStatus,
  updateLetterStoragePath,
  updateLetterVersionPointers,
  createClientPortalToken,
  createDeliveryLogEntry,
} from "../../db";
import { storageGet } from "../../storage";
import {
  sendLetterRejectedEmail,
  sendLetterApprovedEmail,
  sendNeedsChangesEmail,
  sendStatusUpdateEmail,
  sendReviewAssignedEmail,
  sendLetterToRecipient,
} from "../../email";
import { generateAndUploadApprovedPdf } from "../../pdfGenerator";
import { captureServerException } from "../../sentry";
import {
  extractLessonFromApproval,
  extractLessonFromRejection,
  extractLessonFromChangesRequest,
  extractLessonFromEdit,
} from "../../learning";
import { computeAndStoreQualityScore } from "../../learning";
import type { IntakeJson } from "../../../shared/types";
import { logger } from "../../logger";

export const reviewActionsRouter = router({
  claim: attorneyProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["pending_review", "under_review", "client_revision_requested"].includes(letter.status))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter is not in a reviewable state",
        });
      await claimLetterForReview(input.letterId, ctx.user.id);
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: ctx.user.role as any,
        action: "claimed_for_review",
        fromStatus: letter.status,
        toStatus: "under_review",
      });
      // ── Notify subscriber: letter is now under attorney review ──
      try {
        if (letter.userId != null) {
          const subscriber = await getUserById(letter.userId);
          const appUrl = getAppUrl(ctx.req);
          if (subscriber?.email) {
            await sendStatusUpdateEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: input.letterId,
              newStatus: "under_review",
              appUrl,
            });
          }
          await createNotification({
            userId: letter.userId,
            type: "letter_under_review",
            title: "Your letter is being reviewed",
            body: `An attorney has claimed your letter "${letter.subject}" and is currently reviewing it.`,
            link: `/letters/${input.letterId}`,
          });
        }
      } catch (err) {
        logger.error({ err: err }, "[Notify] Claim subscriber notification failed:");
        captureServerException(err, { tags: { component: "review", error_type: "claim_notification_failed" } });
      }
      // ── Notify attorney: review assignment confirmation ──
      try {
        const attorney = await getUserById(ctx.user.id);
        const appUrl = getAppUrl(ctx.req);
        const subscriber = letter.userId != null ? await getUserById(letter.userId) : null;
        if (attorney?.email) {
          const jurisdiction =
            [
              letter.jurisdictionCity,
              letter.jurisdictionState,
              letter.jurisdictionCountry,
            ]
              .filter(Boolean)
              .join(", ") || "Not specified";
          await sendReviewAssignedEmail({
            to: attorney.email,
            name: attorney.name ?? "Attorney",
            letterSubject: letter.subject,
            letterId: input.letterId,
            letterType: letter.letterType,
            jurisdiction,
            subscriberName: subscriber?.name ?? "Subscriber",
            appUrl,
          });
        }
      } catch (err) {
        logger.error({ err: err }, "[Notify] Claim attorney notification failed:");
        captureServerException(err, { tags: { component: "review", error_type: "attorney_notification_failed" } });
      }
      try {
        await notifyAdmins({
          category: "letters",
          type: "letter_claimed",
          title: `Attorney claimed letter #${input.letterId}`,
          body: `${ctx.user.name ?? "An attorney"} claimed "${letter.subject}" for review.`,
          link: `/admin/letters/${input.letterId}`,
        });
      } catch (err) {
        logger.error({ err: err }, "[notifyAdmins] letter_claimed:");
        captureServerException(err, { tags: { component: "review", error_type: "notify_admins_claimed" } });
      }
      return { success: true };
    }),

  unclaim: attorneyProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      if (letter.status !== "under_review")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter is not under review",
        });
      if (ctx.user.role !== "admin" && letter.assignedReviewerId !== ctx.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not assigned to this letter",
        });
      await updateLetterStatus(input.letterId, "pending_review", { assignedReviewerId: null });
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: ctx.user.role as any,
        action: "released_back_to_queue",
        noteText: "Attorney released letter back to the review queue",
        noteVisibility: "internal",
        fromStatus: "under_review",
        toStatus: "pending_review",
      });
      // ── Notify subscriber ──
      try {
        const subscriber = letter.userId ? await getUserById(letter.userId) : null;
        const appUrl = getAppUrl(ctx.req);
        if (subscriber?.email) {
          await sendStatusUpdateEmail({
            to: subscriber.email,
            name: subscriber.name ?? "Subscriber",
            subject: letter.subject,
            letterId: input.letterId,
            newStatus: "pending_review",
            appUrl,
          });
        }
      } catch (err) {
        logger.error({ err: err }, "[Notify] Unclaim subscriber notification failed:");
        captureServerException(err, { tags: { component: "review", error_type: "unclaim_notification_failed" } });
      }
      try {
        await notifyAdmins({
          category: "letters",
          type: "letter_released",
          title: `Letter #${input.letterId} released back to queue`,
          body: `${ctx.user.name ?? "An attorney"} released "${letter.subject}" back to the review queue.`,
          link: `/admin/letters/${input.letterId}`,
        });
      } catch (err) {
        logger.error({ err: err }, "[notifyAdmins] letter_released:");
        captureServerException(err, { tags: { component: "review", error_type: "notify_admins_released" } });
      }
      return { success: true };
    }),

  approve: attorneyProcedure
    .input(
      z.object({
        letterId: z.number(),
        finalContent: z.string().min(50).max(50000),
        internalNote: z.string().optional(),
        userVisibleNote: z.string().optional(),
        acknowledgedUnverifiedResearch: z.boolean().optional(),
        // Optional: send letter directly to recipient in one step
        recipientEmail: z.string().email().optional(),
        subjectOverride: z.string().max(500).optional(),
        deliveryNote: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "admin" &&
        letter.assignedReviewerId !== ctx.user.id
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not assigned to this letter",
        });
      if (letter.status !== "under_review")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter must be under_review to approve",
        });
      if (letter.researchUnverified && !input.acknowledgedUnverifiedResearch)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You must acknowledge that research citations are unverified before approving this letter.",
        });
      const version = await createLetterVersion({
        letterRequestId: input.letterId,
        versionType: "final_approved",
        content: input.finalContent,
        createdByType: ctx.user.role as any,
        createdByUserId: ctx.user.id,
        metadataJson: {
          approvedBy: ctx.user.name,
          approvedAt: new Date().toISOString(),
        },
      });
      const versionId = (version as any)?.insertId;
      if (typeof versionId !== "number" || isNaN(versionId)) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create final approved version — version ID was not returned. Approval aborted.",
        });
      }
      await updateLetterVersionPointers(input.letterId, {
        currentFinalVersionId: versionId,
      });
      // Transition to approved (now the final attorney-approved state)
      await updateLetterStatus(input.letterId, "approved");
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: ctx.user.role as any,
        action: "approved",
        noteText: input.internalNote,
        noteVisibility: "internal",
        fromStatus: "under_review",
        toStatus: "approved",
      });
      if (input.userVisibleNote) {
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: ctx.user.role as any,
          action: "attorney_note",
          noteText: input.userVisibleNote,
          noteVisibility: "user_visible",
        });
      }
      // ── Generate PDF immediately upon attorney approval ──
      // Security: store only the R2 key in DB — never a permanent public URL.
      // Presigned URLs are generated on-demand when serving to the client.
      let pdfKey: string | undefined;
      let pdfUrl: string | undefined;
      try {
        const pdfResult = await generateAndUploadApprovedPdf({
          letterId: input.letterId,
          letterType: letter.letterType,
          subject: input.subjectOverride ?? letter.subject,
          content: input.finalContent,
          approvedBy: ctx.user.name ?? undefined,
          approvedAt: new Date().toISOString(),
          jurisdictionState: letter.jurisdictionState,
          jurisdictionCountry: letter.jurisdictionCountry,
          intakeJson: letter.intakeJson as Record<string, unknown> | null,
        });
        pdfKey = pdfResult.pdfKey;
        await updateLetterStoragePath(input.letterId, pdfKey);
        // Resolve a short-lived URL for immediate use in this response only
        const resolved = await storageGet(pdfKey);
        pdfUrl = resolved.url;
        logger.info(`[Approve] PDF generated for letter #${input.letterId}: key=${pdfKey}`);
      } catch (pdfErr) {
        captureServerException(pdfErr, { tags: { component: "review", error_type: "pdf_generation_failed" }, extra: { letterId: input.letterId } });
        logger.error({ err: pdfErr }, `[Approve] PDF generation failed for letter #${input.letterId} (non-blocking):`);
        // Non-blocking: approval still succeeds even if PDF generation fails
      }
      // ── Optionally send letter directly to recipient in one step ──
      let recipientSent = false;
      let recipientSendError: string | undefined;
      if (input.recipientEmail) {
        try {
          const versions = await getLetterVersionsByRequestId(input.letterId, false);
          const finalVer = versions.find((v) => v.versionType === "final_approved");
          await sendLetterToRecipient({
            recipientEmail: input.recipientEmail,
            letterSubject: letter.subject,
            subjectOverride: input.subjectOverride?.trim() || undefined,
            note: input.deliveryNote?.trim() || undefined,
            pdfUrl: pdfUrl ?? undefined,
            htmlContent: finalVer?.content ?? input.finalContent,
          });
          recipientSent = true;
          await updateLetterStatus(input.letterId, "sent", { force: true });
          await logReviewAction({
            letterRequestId: input.letterId,
            reviewerId: ctx.user.id,
            actorType: ctx.user.role as any,
            action: "letter_sent_to_recipient",
            noteText: `Letter approved and delivered to ${input.recipientEmail}.`,
            noteVisibility: "user_visible",
            fromStatus: "approved",
            toStatus: "sent",
          });
          logger.info(`[Approve] Letter #${input.letterId} sent to ${input.recipientEmail}`);
          // Write delivery log entry
          createDeliveryLogEntry({
            letterRequestId: input.letterId,
            recipientEmail: input.recipientEmail,
            deliveryMethod: "email",
          }).catch((e) => logger.error({ err: e }, "[DeliveryLog] Failed to write log:"));
          // Issue a portal token so the recipient can view/respond online
          createClientPortalToken(input.letterId, {
            recipientEmail: input.recipientEmail,
          }).catch((e) => logger.error({ err: e }, "[PortalToken] Failed to create:"));
        } catch (sendErr) {
          recipientSendError = sendErr instanceof Error ? sendErr.message : "Failed to send";
          captureServerException(sendErr, { tags: { component: "review", error_type: "approve_send_failed" }, extra: { letterId: input.letterId, recipientEmail: input.recipientEmail } });
          logger.error({ err: sendErr }, `[Approve] Failed to send letter #${input.letterId} to recipient:`);
        }
      }
      // ── Notify subscriber: letter has been approved ──
      try {
        if (letter.userId != null) {
          const appUrl = getAppUrl(ctx.req);
          const subscriber = await getUserById(letter.userId);
          if (subscriber?.email) {
            await sendLetterApprovedEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: input.letterId,
              appUrl,
              pdfUrl,
            });
          }
          await createNotification({
            userId: letter.userId,
            type: "approved",
            title: "Your letter has been approved!",
            body: `Your letter "${letter.subject}" has been reviewed and approved by an attorney. Your PDF is ready.${recipientSent ? ` It has been sent to ${input.recipientEmail}.` : ""}`,
            link: `/letters/${input.letterId}`,
          });
        }
      } catch (err) {
        logger.error({ err: err }, "[Notify] Failed:");
        captureServerException(err, { tags: { component: "review", error_type: "approval_notification_failed" } });
      }
      extractLessonFromApproval(input.letterId, input.internalNote, ctx.user.id).catch((e) => logger.error({ err: e }, "fire-and-forget error"));
      computeAndStoreQualityScore(input.letterId, "approved", input.finalContent).catch((e) => logger.error({ err: e }, "fire-and-forget error"));
      // ── RAG embedding + training capture (fire-and-forget) ──
      (async () => {
        try {
          const { embedAndStoreLetterVersion } = await import("../../pipeline/embeddings");
          await embedAndStoreLetterVersion(versionId, input.finalContent);
        } catch (embErr) {
          logger.error({ err: embErr }, `[Approve] Embedding failed for letter #${input.letterId}:`);
        }
      })();
      (async () => {
        try {
          const { captureTrainingExample } = await import("../../pipeline/training-capture");
          await captureTrainingExample(
            input.letterId,
            letter.letterType,
            letter.jurisdictionState ?? null,
            letter.intakeJson as IntakeJson,
            input.finalContent,
          );
        } catch (trainErr) {
          logger.error({ err: trainErr }, `[Approve] Training capture failed for letter #${input.letterId}:`);
        }
      })();
      (async () => {
        try {
          const { checkAndTriggerFineTune } = await import("../../pipeline/fine-tune");
          await checkAndTriggerFineTune();
        } catch (ftErr) {
          logger.error({ err: ftErr }, `[Approve] Fine-tune check failed:`);
        }
      })();
      try {
        const appUrl2 = getAppUrl(ctx.req);
        await notifyAdmins({
          category: "letters",
          type: "letter_approved",
          title: `Letter #${input.letterId} approved by attorney`,
          body: `${ctx.user.name ?? "An attorney"} approved "${letter.subject}".${recipientSent ? ` Letter sent to ${input.recipientEmail}.` : ""}${pdfUrl ? " PDF generated." : ""}`,
          link: `/admin/letters/${input.letterId}`,
          emailOpts: {
            subject: `Letter #${input.letterId} Approved`,
            preheader: `Attorney approved letter "${letter.subject}"`,
            bodyHtml: `<p>Hello,</p><p><strong>${ctx.user.name ?? "An attorney"}</strong> has approved letter <strong>#${input.letterId}</strong> — "${letter.subject}".${recipientSent ? ` Letter was sent to ${input.recipientEmail}.` : ""}</p>`,
            ctaText: "View Letter",
            ctaUrl: `${appUrl2}/admin/letters/${input.letterId}`,
          },
        });
      } catch (err) {
        logger.error({ err: err }, "[notifyAdmins] letter_approved:");
        captureServerException(err, { tags: { component: "review", error_type: "notify_admins_approved" } });
      }
      return { success: true, versionId, pdfUrl, recipientSent, recipientSendError };
    }),

  reject: attorneyProcedure
    .input(
      z.object({
        letterId: z.number(),
        reason: z.string().min(10).max(5000),
        userVisibleReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "admin" &&
        letter.assignedReviewerId !== ctx.user.id
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not assigned to this letter",
        });
      if (letter.status !== "under_review")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter must be under_review to reject",
        });
      await updateLetterStatus(input.letterId, "rejected");
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: ctx.user.role as any,
        action: "rejected",
        noteText: input.reason,
        noteVisibility: "internal",
        fromStatus: "under_review",
        toStatus: "rejected",
      });
      const visibleReason = input.userVisibleReason ?? input.reason;
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: ctx.user.role as any,
        action: "rejection_notice",
        noteText: visibleReason,
        noteVisibility: "user_visible",
      });
      try {
        if (letter.userId != null) {
          const appUrl = getAppUrl(ctx.req);
          const subscriber = await getUserById(letter.userId);
          if (subscriber?.email) {
            await sendLetterRejectedEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: input.letterId,
              reason: visibleReason,
              appUrl,
            });
          }
          await createNotification({
            userId: letter.userId,
            type: "letter_rejected",
            title: "Update on your letter request",
            body: visibleReason,
            link: `/letters/${input.letterId}`,
          });
        }
      } catch (err) {
        logger.error({ err: err }, "[Notify] Failed:");
        captureServerException(err, { tags: { component: "review", error_type: "rejection_notification_failed" } });
      }
      extractLessonFromRejection(input.letterId, input.reason, ctx.user.id).catch((e) => logger.error({ err: e }, "fire-and-forget error"));
      computeAndStoreQualityScore(input.letterId, "rejected").catch((e) => logger.error({ err: e }, "fire-and-forget error"));
      try {
        await notifyAdmins({
          category: "letters",
          type: "letter_rejected",
          title: `Letter #${input.letterId} rejected`,
          body: `${ctx.user.name ?? "An attorney"} rejected "${letter.subject}". Reason: ${input.reason.slice(0, 200)}`,
          link: `/admin/letters/${input.letterId}`,
        });
      } catch (err) {
        logger.error({ err: err }, "[notifyAdmins] letter_rejected:");
        captureServerException(err, { tags: { component: "review", error_type: "notify_admins_rejected" } });
      }
      return { success: true };
    }),

  requestChanges: attorneyProcedure
    .input(
      z.object({
        letterId: z.number(),
        internalNote: z.string().optional(),
        userVisibleNote: z.string().min(10).max(5000),
        retriggerPipeline: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "admin" &&
        letter.assignedReviewerId !== ctx.user.id
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not assigned to this letter",
        });
      if (letter.status !== "under_review")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter must be under_review",
        });
      await updateLetterStatus(input.letterId, "needs_changes", { assignedReviewerId: null });
      // Encode retriggerPipeline preference in the internal action noteText
      // so updateForChanges can read it without a schema migration.
      const internalNoteWithRetrigger = JSON.stringify({
        retriggerPipeline: input.retriggerPipeline,
        note: input.internalNote ?? null,
      });
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: ctx.user.role as any,
        action: "requested_changes",
        noteText: internalNoteWithRetrigger,
        noteVisibility: "internal",
        fromStatus: "under_review",
        toStatus: "needs_changes",
      });
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: ctx.user.role as any,
        action: "changes_requested",
        noteText: input.userVisibleNote,
        noteVisibility: "user_visible",
      });
      try {
        if (letter.userId != null) {
          const appUrl = getAppUrl(ctx.req);
          const subscriber = await getUserById(letter.userId);
          if (subscriber?.email) {
            await sendNeedsChangesEmail({
              to: subscriber.email,
              name: subscriber.name ?? "Subscriber",
              subject: letter.subject,
              letterId: input.letterId,
              attorneyNote: input.userVisibleNote,
              appUrl,
            });
          }
          await createNotification({
            userId: letter.userId,
            type: "needs_changes",
            title: "Changes requested for your letter",
            body: input.userVisibleNote,
            link: `/letters/${input.letterId}`,
          });
        }
      } catch (err) {
        logger.error({ err: err }, "[Notify] Failed:");
        captureServerException(err, { tags: { component: "review", error_type: "changes_notification_failed" } });
      }
      extractLessonFromChangesRequest(input.letterId, input.internalNote, input.userVisibleNote, ctx.user.id).catch((e) => logger.error({ err: e }, "fire-and-forget error"));
      try {
        await notifyAdmins({
          category: "letters",
          type: "letter_changes_requested",
          title: `Changes requested for letter #${input.letterId}`,
          body: `${ctx.user.name ?? "An attorney"} requested changes on "${letter.subject}".`,
          link: `/admin/letters/${input.letterId}`,
        });
      } catch (err) {
        logger.error({ err: err }, "[notifyAdmins] letter_changes_requested:");
        captureServerException(err, { tags: { component: "review", error_type: "notify_admins_changes_requested" } });
      }
      // Pipeline re-trigger (if requested) is deferred to when subscriber responds via updateForChanges.
      // The retriggerPipeline preference is stored in the internal review action above.
      return { success: true };
    }),

  saveEdit: attorneyProcedure
    .input(
      z.object({
        letterId: z.number(),
        content: z.string().min(50).max(50000),
        note: z.string().max(5000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        ctx.user.role !== "admin" &&
        letter.assignedReviewerId !== ctx.user.id
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not assigned to this letter",
        });
      if (letter.status !== "under_review")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter must be under_review to edit",
        });
      const version = await createLetterVersion({
        letterRequestId: input.letterId,
        versionType: "attorney_edit",
        content: input.content,
        createdByType: ctx.user.role as any,
        createdByUserId: ctx.user.id,
        metadataJson: { note: input.note },
      });
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: ctx.user.role as any,
        action: "attorney_edit_saved",
        noteText: input.note,
        noteVisibility: "internal",
      });
      extractLessonFromEdit(input.letterId, input.content, input.note, ctx.user.id).catch((e) => logger.error({ err: e }, "fire-and-forget error"));
      return { versionId: (version as any)?.insertId };
    }),
});
