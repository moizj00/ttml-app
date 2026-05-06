import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, superAdminProcedure } from "../../_core/trpc";
import { getAppUrl } from "../_shared";
import {
  claimLetterForReview,
  getAllLetterRequests,
  getDb,
  getLetterRequestById,
  getLetterVersionsByRequestId,
  getReviewActions,
  getResearchRunsByLetterId,
  getWorkflowJobsByLetterId,
  logReviewAction,
  updateLetterStatus,
  getUserById,
} from "../../db";
import {
  sendNewReviewNeededEmail,
} from "../../email";
import { captureServerException } from "../../sentry";
import { forceStatusTransition, diagnoseAndRepairLetterState } from "../../services/admin";
import { logger } from "../../logger";
import { letterRequests } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  dispatchFreePreviewIfReady,
  FREE_PREVIEW_ELIGIBLE_STATUSES,
} from "../../freePreviewEmailCron";

export const adminLettersProcedures = {
  allLetters: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) =>
      getAllLetterRequests({ status: input?.status })
    ),

  getLetterDetail: adminProcedure
    .input(z.object({ letterId: z.number() }))
    .query(async ({ input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      const [versions, actions, jobs, researchRuns] = await Promise.all([
        getLetterVersionsByRequestId(input.letterId, true), // include internal
        getReviewActions(input.letterId, true), // include internal
        getWorkflowJobsByLetterId(input.letterId),
        getResearchRunsByLetterId(input.letterId),
      ]);
      const aiDraftVersion = versions.find(v => v.versionType === "ai_draft");

      // Aggregate token/cost across all jobs with tracked cost (includes failed jobs
      // that still incurred API charges), so pipelineCostSummary reflects true spend.
      const trackedJobs = jobs.filter(j => j.estimatedCostUsd != null);
      const pipelineCostSummary = {
        totalPromptTokens: trackedJobs.reduce((s, j) => s + (j.promptTokens ?? 0), 0),
        totalCompletionTokens: trackedJobs.reduce((s, j) => s + (j.completionTokens ?? 0), 0),
        totalTokens: trackedJobs.reduce((s, j) => s + (j.promptTokens ?? 0) + (j.completionTokens ?? 0), 0),
        totalCostUsd: trackedJobs
          .reduce((s, j) => s + parseFloat(j.estimatedCostUsd as string ?? "0"), 0)
          .toFixed(6),
        byStage: trackedJobs.map(j => ({
          jobId: j.id,
          jobType: j.jobType,
          provider: j.provider,
          promptTokens: j.promptTokens ?? 0,
          completionTokens: j.completionTokens ?? 0,
          totalTokens: (j.promptTokens ?? 0) + (j.completionTokens ?? 0),
          estimatedCostUsd: j.estimatedCostUsd,
        })),
      };

      return {
        ...letter,
        aiDraftContent: aiDraftVersion?.content ?? null,
        letterVersions: versions,
        reviewActions: actions,
        workflowJobs: jobs,
        researchRuns,
        pipelineCostSummary,
      };
    }),

  letterJobs: adminProcedure
    .input(z.object({ letterId: z.number() }))
    .query(async ({ input }) => getWorkflowJobsByLetterId(input.letterId)),

  forceStatusTransition: superAdminProcedure
    .input(
      z.object({
        letterId: z.number(),
        // v2.1: full canonical status enum so the admin force-status dropdown
        // can target every status the state machine recognises (including the
        // new attorney-review funnel statuses).
        newStatus: z.enum([
          "submitted",
          "researching",
          "drafting",
          "ai_generation_completed_hidden",
          "letter_released_to_subscriber",
          "attorney_review_upsell_shown",
          "attorney_review_checkout_started",
          "attorney_review_payment_confirmed",
          "generated_locked",
          "generated_unlocked",
          "pending_review",
          "under_review",
          "needs_changes",
          "approved",
          "client_approval_pending",
          "client_revision_requested",
          "client_declined",
          "client_approved",
          "sent",
          "rejected",
          "pipeline_failed",
        ]),
        reason: z.string().min(5).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) =>
      forceStatusTransition(input, { userId: ctx.user.id, appUrl: getAppUrl(ctx.req) })
    ),

  assignLetter: adminProcedure
    .input(z.object({ letterId: z.number(), employeeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      await updateLetterStatus(input.letterId, letter.status, {
        assignedReviewerId: input.employeeId,
      });
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: "admin",
        action: "assigned_reviewer",
        noteText: `Assigned to employee ID ${input.employeeId}`,
        noteVisibility: "internal",
      });
      try {
        const appUrl = getAppUrl(ctx.req);
        const employee = await getUserById(input.employeeId);
        if (employee?.email) {
          await sendNewReviewNeededEmail({
            to: employee.email,
            name: employee.name ?? "Attorney",
            letterSubject: letter.subject,
            letterId: input.letterId,
            letterType: letter.letterType,
            jurisdiction: `${letter.jurisdictionState ?? ""}, ${letter.jurisdictionCountry ?? "US"}`,
            appUrl,
          });
        }
      } catch (err) {
        logger.error({ err: err }, "[Notify] Failed:");
        captureServerException(err, { tags: { component: "review", error_type: "unlock_notification_failed" } });
      }
      return { success: true };
    }),

  claimLetterAsAttorney: adminProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["pending_review", "client_revision_requested"].includes(letter.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter must be in pending_review or client_revision_requested status to claim",
        });
      }
      if (letter.assignedReviewerId !== null && letter.assignedReviewerId !== undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter already has an assigned reviewer",
        });
      }
      await claimLetterForReview(input.letterId, ctx.user.id);
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: "admin",
        action: "admin_claimed_as_attorney",
        noteText: `Admin claimed letter for review as attorney`,
        noteVisibility: "internal",
        fromStatus: letter.status,
        toStatus: "under_review",
      });
      return { success: true };
    }),

  repairLetterState: adminProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async ({ ctx, input }) =>
      diagnoseAndRepairLetterState(input.letterId, ctx.user.id)
    ),

  /**
   * Force-unlock the first-letter free-preview flow for a specific letter.
   *
   * By default a free-preview letter waits 24 hours (`free_preview_unlock_at`)
   * before the "your draft is ready" email fires. This mutation collapses
   * that cooling window by setting `free_preview_unlock_at = NOW()`, and
   * then invokes the shared atomic dispatcher. If the pipeline has already
   * saved the ai_draft, the email fires immediately. If the pipeline is
   * still running, the dispatcher no-ops (no draft yet) — the pipeline
   * finalize hook in simple/graph/fallback.ts will call the dispatcher
   * again once the draft is saved, and the email fires at that moment.
   *
   * Guards:
   *   - Letter must be on the free-preview path (`is_free_preview = TRUE`).
   *     Non-free-preview letters would bypass the normal Stripe paywall
   *     invariant, so this path is not allowed for them.
   *   - Does NOT resend if `free_preview_email_sent_at` is already stamped;
   *     the dispatcher's atomic claim enforces this.
   *
   * Audit:
   *   Logs a `free_preview_force_unlock` review action with the previous
   *   unlockAt and the admin's reason so the full history is queryable
   *   from the admin letter detail view.
   */
  forceFreePreviewUnlock: adminProcedure
    .input(
      z.object({
        letterId: z.number(),
        reason: z.string().min(5).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.letterId);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });

      if (!letter.isFreePreview) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Letter is not on the free-preview path. This action is only available for letters flagged as first-letter free preview.",
        });
      }

      // Status guard: reject force-unlock on letters that have already
      // progressed to attorney review or beyond. Without this, an admin could
      // re-fire the "free preview is ready" email for a letter that's already
      // approved or delivered — confusing the subscriber and contradicting
      // the attorney-review UI they're already looking at.
      if (
        !(FREE_PREVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(
          letter.status
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `Letter is in '${letter.status}'; free-preview force-unlock is only valid in ` +
            `pre-review statuses (submitted, researching, drafting, generated_locked, ` +
            `pipeline_failed). This letter has already progressed to attorney review ` +
            `or delivery.`,
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });
      }

      const previousUnlockAt = letter.freePreviewUnlockAt;
      const alreadySent = letter.freePreviewEmailSentAt != null;
      const now = new Date();

      // Collapse the cooling window. We do NOT touch freePreviewEmailSentAt
      // here — the dispatcher's atomic UPDATE…RETURNING owns that stamp and
      // will skip cleanly if it was already sent.
      await db
        .update(letterRequests)
        .set({
          freePreviewUnlockAt: now,
          updatedAt: now,
        } as any)
        .where(eq(letterRequests.id, input.letterId));

      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: "admin",
        action: "free_preview_force_unlock",
        noteText: [
          `Admin force-unlocked free-preview window.`,
          `Previous unlockAt: ${previousUnlockAt?.toISOString() ?? "null"}.`,
          `emailAlreadySent: ${alreadySent}.`,
          `Reason: ${input.reason}`,
        ].join(" "),
        noteVisibility: "internal",
      });

      // Attempt immediate dispatch. If the draft is already saved the email
      // fires now; if the pipeline is still running this is a clean no-op
      // and the pipeline finalize hook will re-invoke the dispatcher once
      // the draft lands in letter_versions.
      const dispatchResult = await dispatchFreePreviewIfReady(input.letterId);

      logger.info(
        {
          letterId: input.letterId,
          adminId: ctx.user.id,
          previousUnlockAt: previousUnlockAt?.toISOString() ?? null,
          alreadySent,
          dispatchStatus: dispatchResult.status,
          dispatchReason: dispatchResult.reason ?? null,
        },
        "[Admin] Free-preview force-unlock"
      );

      return {
        success: true,
        dispatched: dispatchResult.status === "sent",
        dispatchStatus: dispatchResult.status,
        dispatchReason: dispatchResult.reason ?? null,
        previousUnlockAt: previousUnlockAt?.toISOString() ?? null,
        alreadySent,
      };
    }),
};
