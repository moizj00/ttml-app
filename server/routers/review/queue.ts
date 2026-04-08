/**
 * Review Queue Queries
 *
 * Read-only attorney procedures for fetching the review queue and letter details.
 *
 * Two distinct areas:
 *   - review.queue     → Review Queue: unclaimed letters (status = pending_review)
 *   - review.myClaimed → Review Centre: letters claimed by the current attorney/admin
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../../_core/trpc";
import { attorneyProcedure } from "../_shared";
import {
  getAllLetterRequests,
  getLetterRequestById,
  getLetterVersionsByRequestId,
  getReviewActions,
  getWorkflowJobsByLetterId,
  getResearchRunsByLetterId,
  getAttachmentsByLetterId,
} from "../../db";

export const reviewQueueRouter = router({
  /**
   * Review Queue — unclaimed letters awaiting assignment.
   *
   * Default (no input): returns only `pending_review` letters so the queue
   * shows exclusively unclaimed work. Callers can override with explicit
   * `status` or `unassigned` filters for admin/analytics use-cases.
   *
   * The deprecated `myAssigned` flag is kept for backward-compatibility with
   * the Dashboard component; new code should use `review.myClaimed` instead.
   */
  queue: attorneyProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          unassigned: z.boolean().optional(),
          /** @deprecated Use review.myClaimed instead */
          myAssigned: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      // Backward-compat: myAssigned still works
      if (input?.myAssigned)
        return getAllLetterRequests({ assignedReviewerId: ctx.user.id });

      // Default: only unclaimed (pending_review) letters
      if (!input?.status && !input?.unassigned)
        return getAllLetterRequests({ status: "pending_review" });

      return getAllLetterRequests({
        status: input?.status,
        unassigned: input?.unassigned,
      });
    }),

  /**
   * Review Centre — letters currently claimed by the requesting attorney/admin.
   *
   * Returns all letters where `assignedReviewerId = ctx.user.id`, covering
   * statuses: under_review, needs_changes, client_revision_requested, and any
   * other status that may be assigned to this reviewer.
   */
  myClaimed: attorneyProcedure.query(async ({ ctx }) => {
    return getAllLetterRequests({ assignedReviewerId: ctx.user.id });
  }),

  letterDetail: attorneyProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const letter = await getLetterRequestById(input.id);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND" });
      // Admins can always view.
      // Attorneys can view if:
      //   (a) they are the assigned reviewer, OR
      //   (b) the letter is pending_review (unassigned — available to claim)
      const canView =
        ctx.user.role === "admin" ||
        letter.assignedReviewerId === ctx.user.id ||
        letter.status === "pending_review";
      if (!canView)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not assigned to this letter",
        });
      const versions = await getLetterVersionsByRequestId(input.id, true);
      const actions = await getReviewActions(input.id, true);
      const jobs = await getWorkflowJobsByLetterId(input.id);
      const research = await getResearchRunsByLetterId(input.id);
      const attachmentList = await getAttachmentsByLetterId(input.id);
      return {
        letter,
        versions,
        actions,
        jobs,
        research,
        attachments: attachmentList,
      };
    }),
});
