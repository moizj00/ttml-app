import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getLetterRequestById, updateLetterStatus } from "../../db";
import { enqueuePipelineJob } from "../../queue";
import { logger } from "../../_core/logger";

export const submitLetter = protectedProcedure
  .input(z.object({
    letterId: z.number(),
    intake: z.any(), // TODO: refine intake schema
    label: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { letterId, intake, label } = input;
    const userId = ctx.session.user.id;

    const letter = await getLetterRequestById(letterId);

    if (!letter || letter.userId !== userId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Letter not found or not owned by user",
      });
    }

    if (letter.status !== "draft" && letter.status !== "submitted") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Letter is in status \'${letter.status}\' and cannot be submitted.`, // TODO: better error message
      });
    }

    // Update status to submitted
    await updateLetterStatus(letterId, "submitted");

    // Enqueue the pipeline job
    try {
      await enqueuePipelineJob({
        type: "pipeline:submit",
        letterId,
        intake,
        userId,
        appUrl: ctx.appUrl,
        label: label || `Letter #${letterId} submission`,
        usageContext: {
          shouldRefundOnFailure: true,
          isFreeTrialSubmission: letter.isFreeTrial,
        },
      });
      logger.info(`[SubmitLetter] Enqueued pipeline job for letter #${letterId}`);
    } catch (error) {
      logger.error({ error }, `[SubmitLetter] Failed to enqueue pipeline job for letter #${letterId}`);
      // If enqueuing fails, revert status to draft
      await updateLetterStatus(letterId, "draft");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to submit letter for processing. Please try again.",
      });
    }

    return { success: true };
  });
