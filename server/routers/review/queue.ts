/**
 * Review Queue Queries
 *
 * Read-only attorney procedures for fetching the review queue and letter details.
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
  queue: attorneyProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          unassigned: z.boolean().optional(),
          myAssigned: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      if (input?.myAssigned)
        return getAllLetterRequests({ assignedReviewerId: ctx.user.id });
      return getAllLetterRequests({
        status: input?.status,
        unassigned: input?.unassigned,
      });
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
