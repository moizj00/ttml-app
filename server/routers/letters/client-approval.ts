import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  subscriberProcedure,
  attorneyProcedure,
  getAppUrl,
} from "../_shared";
import {
  createNotification,
  notifyAdmins,
  getLetterRequestById,
  getLetterVersionById,
  getLetterVersionsByRequestId,
  getReviewActions,
  logReviewAction,
  updateLetterStatus,
  updateLetterPdfUrl,
  getUserById,
} from "../../db";
import {
  sendLetterApprovedEmail,
  sendStatusUpdateEmail,
  sendLetterToRecipient,
  sendClientRevisionRequestEmail,
} from "../../email";
import { captureServerException } from "../../sentry";
import { generateAndUploadApprovedPdf } from "../../pdfGenerator";
import { getOriginUrl } from "../../supabaseAuth";
import { createRevisionConsultationCheckout } from "../../stripe";
import { clientDeclineLetter } from "../../services/letters";
import { logger } from "../../logger";

export const clientApprovalProcedures = {
  requestClientApproval: attorneyProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "admin" && letter.assignedReviewerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the assigned reviewer or an admin can request client approval",
        });
      }
      if (letter.status !== "approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter must be in approved status to request client approval",
        });
      }
      await updateLetterStatus(input.letterId, "client_approval_pending");
      const actorType = ctx.user.role === "admin" ? "admin" as const : "attorney" as const;
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType,
        action: "requested_client_approval",
        noteText: "Attorney requested client approval before final delivery",
        noteVisibility: "user_visible",
        fromStatus: "approved",
        toStatus: "client_approval_pending",
      });
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
              newStatus: "client_approval_pending",
              appUrl,
            });
          }
          await createNotification({
            userId: letter.userId,
            type: "client_approval_pending",
            title: "Your letter is ready for final approval",
            body: "Please review your attorney-approved letter and click Approve & Proceed to confirm delivery.",
            link: `/letters/${input.letterId}`,
          });
        }
      } catch (err) {
        logger.error({ err: err }, "[requestClientApproval] Notification error:");
        captureServerException(err, { tags: { component: "letters", error_type: "client_approval_notification_failed" } });
      }
      try {
        await notifyAdmins({
          category: "letters",
          type: "letter_pending_client_approval",
          title: `Letter #${input.letterId} sent for client approval`,
          body: `Letter "${letter.subject}" is now pending client approval.`,
          link: `/admin/letters/${input.letterId}`,
        });
      } catch (err) {
        logger.error({ err: err }, "[notifyAdmins] letter_pending_client_approval:");
        captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_pending_approval" } });
      }
      return { success: true };
    }),

  clientApprove: subscriberProcedure
    .input(z.object({
      letterId: z.number(),
      recipientEmail: z.string().email().optional(),
      subjectOverride: z.string().max(200).optional(),
      note: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter || letter.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (letter.status !== "client_approval_pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter is not awaiting client approval",
        });
      }

      // Get the final_approved version content for PDF generation
      let finalContent: string | undefined;
      if (letter.currentFinalVersionId) {
        const finalVersion = await getLetterVersionById(letter.currentFinalVersionId);
        finalContent = finalVersion?.content ?? undefined;
      }

      // Transition to client_approved
      await updateLetterStatus(input.letterId, "client_approved");
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: "subscriber",
        action: "client_approved",
        noteText: input.note ?? "Subscriber approved the letter",
        noteVisibility: "user_visible",
        fromStatus: "client_approval_pending",
        toStatus: "client_approved",
      });

      // Generate PDF now that subscriber has approved
      let pdfUrl: string | undefined;
      if (finalContent) {
        try {
          const pdfResult = await generateAndUploadApprovedPdf({
            letterId: input.letterId,
            letterType: letter.letterType,
            subject: input.subjectOverride ?? letter.subject,
            content: finalContent,
            approvedBy: ctx.user.name ?? undefined,
            approvedAt: new Date().toISOString(),
            jurisdictionState: letter.jurisdictionState,
            jurisdictionCountry: letter.jurisdictionCountry,
            intakeJson: letter.intakeJson as Record<string, unknown> | null,
          });
          pdfUrl = pdfResult.pdfUrl;
          await updateLetterPdfUrl(input.letterId, pdfUrl);
          logger.info(`[ClientApprove] PDF generated for letter #${input.letterId}: ${pdfUrl}`);
        } catch (pdfErr) {
          captureServerException(pdfErr, { tags: { component: "letters", error_type: "pdf_generation_failed" }, extra: { letterId: input.letterId } });
          logger.error({ err: pdfErr }, `[ClientApprove] PDF generation failed for letter #${input.letterId}:`);
          // Non-blocking: approval still succeeds even if PDF fails
        }
      }

      // If recipientEmail was provided, send the letter to the recipient in one step
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
            note: input.note?.trim() || undefined,
            pdfUrl: pdfUrl ?? letter.pdfUrl ?? undefined,
            htmlContent: finalVer?.content ?? finalContent ?? "",
          });
          recipientSent = true;
          logger.info(`[ClientApprove] Letter #${input.letterId} sent to ${input.recipientEmail}`);
        } catch (sendErr) {
          recipientSendError = sendErr instanceof Error ? sendErr.message : "Failed to send";
          captureServerException(sendErr, { tags: { component: "letters", error_type: "client_approve_send_failed" }, extra: { letterId: input.letterId, recipientEmail: input.recipientEmail } });
          logger.error({ err: sendErr }, `[ClientApprove] Failed to send letter #${input.letterId} to recipient:`);
        }
      }

      // Transition to sent only if recipient delivery succeeded
      // Approve Only (no recipient) stays at client_approved for download/manual send
      // Approve & Send with failed delivery also stays at client_approved for retry
      if (recipientSent) {
        await updateLetterStatus(input.letterId, "sent", { force: true });
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: recipientSent ? "letter_sent_to_recipient" : "letter_sent",
          noteText: recipientSent
            ? `Letter approved, PDF generated, and delivered to ${input.recipientEmail}.`
            : `Letter approved and PDF generated${pdfUrl ? " — PDF available" : ""}.`,
          noteVisibility: "user_visible",
          fromStatus: "client_approved",
          toStatus: "sent",
        });
      } else {
        await logReviewAction({
          letterRequestId: input.letterId,
          reviewerId: ctx.user.id,
          actorType: "subscriber",
          action: "pdf_generated",
          noteText: recipientSendError
            ? `PDF generated${pdfUrl ? " — available for download" : ""}. Sending to recipient failed — you can retry from the letter page.`
            : `PDF generated${pdfUrl ? " — available for download" : ""}.`,
          noteVisibility: "user_visible",
          fromStatus: "client_approved",
          toStatus: "client_approved",
        });
      }

      // Notify subscriber with PDF link
      try {
        const appUrl = getAppUrl(ctx.req);
        const subscriber = await getUserById(ctx.user.id);
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
          userId: ctx.user.id,
          type: "letter_sent",
          title: "Your letter is ready!",
          body: `Your letter "${letter.subject}" has been approved and your PDF is ready to download.${pdfUrl ? " A PDF copy is available." : ""}`,
          link: `/letters/${input.letterId}`,
        });
      } catch (notifyErr) {
        logger.error({ err: notifyErr }, "[ClientApprove] Subscriber notification failed:");
        captureServerException(notifyErr, { tags: { component: "letters", error_type: "client_approve_notify_failed" } });
      }

      try {
        await notifyAdmins({
          category: "letters",
          type: "client_approved",
          title: `Client approved letter #${input.letterId}`,
          body: `${ctx.user.name ?? "A subscriber"} approved "${letter.subject}" — PDF generated.${recipientSent ? ` Letter sent to ${input.recipientEmail}.` : ""}${pdfUrl ? " PDF available." : ""}`,
          link: `/admin/letters/${input.letterId}`,
          emailOpts: {
            subject: `Client Approved Letter #${input.letterId}`,
            preheader: `Client approved letter "${letter.subject}"`,
            bodyHtml: `<p>Hello,</p><p><strong>${ctx.user.name ?? "A subscriber"}</strong> has approved letter <strong>#${input.letterId}</strong> — "${letter.subject}". PDF has been generated.${recipientSent ? ` Letter was sent to ${input.recipientEmail}.` : ""}</p>`,
            ctaText: "View Letter",
            ctaUrl: `${getAppUrl(ctx.req)}/admin/letters/${input.letterId}`,
          },
        });
      } catch (err) {
        logger.error({ err: err }, "[notifyAdmins] client_approved:");
        captureServerException(err, { tags: { component: "letters", error_type: "notify_admins_client_approved" } });
      }
      return { success: true, pdfUrl, recipientSent, recipientSendError };
    }),

  clientRequestRevision: subscriberProcedure
    .input(z.object({
      letterId: z.number(),
      revisionNotes: z.string().min(10, "Please provide at least 10 characters of feedback").max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter || letter.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const allowedStatuses = ["client_approval_pending", "approved", "client_approved", "sent"];
      if (!allowedStatuses.includes(letter.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter is not in a state that allows revision requests",
        });
      }

      const isPostApproval = letter.status === "approved" || letter.status === "client_approved" || letter.status === "sent";

      // Revision limit guardrail
      const allActions = await getReviewActions(input.letterId);
      const revisionCount = allActions.filter(a => a.action === "client_revision_requested").length;
      if (revisionCount >= 5) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximum revision limit reached (5 revisions). Please contact support if you need further changes.",
        });
      }
      // Warn at 3+ but allow
      const revisionWarning = revisionCount >= 3
        ? `This is revision ${revisionCount + 1} of 5. You have ${5 - revisionCount - 1} revision(s) remaining.`
        : undefined;

      // ─── Paid revision gate ─────────────────────────────────────────────
      // Pre-approval: first revision (revisionCount === 0) is free, subsequent cost $20.
      // Post-approval: first post-approval edit is free, second+ cost $20.
      // We count post-approval edits separately for the fee trigger.
      const postApprovalEditCount = isPostApproval
        ? allActions.filter(a => a.action === "client_revision_requested" && (a.fromStatus === "approved" || a.fromStatus === "client_approved" || a.fromStatus === "sent")).length
        : 0;
      const requiresPayment = isPostApproval ? postApprovalEditCount >= 1 : revisionCount >= 1;
      if (requiresPayment) {
        const origin = getOriginUrl(ctx.req);
        const checkout = await createRevisionConsultationCheckout({
          userId: ctx.user.id,
          email: ctx.user.email ?? "",
          name: ctx.user.name,
          letterId: input.letterId,
          revisionNotes: input.revisionNotes,
          origin,
        });
        // Return checkout URL — client will redirect to Stripe
        return {
          success: false,
          requiresPayment: true,
          checkoutUrl: checkout.url,
          revisionCount,
          revisionWarning,
        };
      }

      await updateLetterStatus(input.letterId, "client_revision_requested");
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: "subscriber",
        action: "client_revision_requested",
        noteText: input.revisionNotes,
        noteVisibility: "user_visible",
        fromStatus: letter.status,
        toStatus: "client_revision_requested",
      });

      try {
        const appUrl = getAppUrl(ctx.req);
        if (letter.assignedReviewerId) {
          const attorney = await getUserById(letter.assignedReviewerId);
          if (attorney?.email) {
            await sendClientRevisionRequestEmail({
              to: attorney.email,
              name: attorney.name ?? "Attorney",
              letterSubject: letter.subject,
              letterId: input.letterId,
              subscriberNotes: input.revisionNotes,
              appUrl,
            });
          }
          await createNotification({
            userId: letter.assignedReviewerId,
            type: "client_revision_requested",
            title: isPostApproval ? "Client requested post-approval edits" : "Client requested revisions",
            body: `A subscriber requested ${isPostApproval ? "post-approval edits" : "revisions"} on "${letter.subject}". Please review their notes and update the letter.`,
            link: `/review/${input.letterId}`,
          });
        }
        await notifyAdmins({
          category: "letters",
          type: "client_revision_requested",
          title: `Client requested revisions on letter #${input.letterId}`,
          body: `${ctx.user.name ?? "A subscriber"} requested revisions on "${letter.subject}".`,
          link: `/admin/letters/${input.letterId}`,
        });
      } catch (err) {
        logger.error({ err: err }, "[clientRequestRevision] Notification error:");
        captureServerException(err, { tags: { component: "letters", error_type: "client_revision_notification_failed" } });
      }
      return { success: true, revisionCount: revisionCount + 1, revisionWarning };
    }),

  clientDecline: subscriberProcedure
    .input(z.object({
      letterId: z.number(),
      reason: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) =>
      clientDeclineLetter(input, {
        userId: ctx.user.id,
        userName: ctx.user.name,
        req: ctx.req,
      })
    ),
};
