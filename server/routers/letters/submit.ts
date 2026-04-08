import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { checkTrpcRateLimit } from "../../rateLimiter";
import { adminProcedure } from "../../_core/trpc";
import {
  intakeJsonSchema,
  verifiedSubscriberProcedure,
  getAppUrl,
} from "../_shared";
import {
  createLetterRequest,
  logReviewAction,
} from "../../db";
import { captureServerException } from "../../sentry";
import { enqueuePipelineJob } from "../../queue";
import { submitLetter } from "../../services/letters";
import { logger } from "../../logger";

export const submitProcedures = {
  submit: verifiedSubscriberProcedure
    .input(
      z.object({
        letterType: z.enum([
          "demand-letter",
          "cease-and-desist",
          "contract-breach",
          "eviction-notice",
          "employment-dispute",
          "consumer-complaint",
          "general-legal",
          "pre-litigation-settlement",
          "debt-collection",
          "estate-probate",
          "landlord-tenant",
          "insurance-dispute",
          "personal-injury-demand",
          "intellectual-property",
          "family-law",
          "neighbor-hoa",
        ]),
        subject: z.string().min(5).max(500),
        issueSummary: z.string().optional(),
        jurisdictionCountry: z.string().default("US"),
        jurisdictionState: z.string().min(2),
        jurisdictionCity: z.string().optional(),
        intakeJson: intakeJsonSchema,
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .default("normal"),
        templateId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkTrpcRateLimit("letter", `user:${ctx.user.id}`, true);
      return submitLetter(input, {
        userId: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        req: ctx.req,
      });
    }),

  adminSubmit: adminProcedure
    .input(
      z.object({
        letterType: z.enum([
          "demand-letter",
          "cease-and-desist",
          "contract-breach",
          "eviction-notice",
          "employment-dispute",
          "consumer-complaint",
          "general-legal",
          "pre-litigation-settlement",
          "debt-collection",
          "estate-probate",
          "landlord-tenant",
          "insurance-dispute",
          "personal-injury-demand",
          "intellectual-property",
          "family-law",
          "neighbor-hoa",
        ]),
        subject: z.string().min(5).max(500),
        issueSummary: z.string().optional(),
        jurisdictionCountry: z.string().default("US"),
        jurisdictionState: z.string().min(2),
        jurisdictionCity: z.string().optional(),
        intakeJson: intakeJsonSchema,
        priority: z
          .enum(["low", "normal", "high", "urgent"])
          .default("normal"),
        templateId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await checkTrpcRateLimit("letter", `admin:${ctx.user.id}`, true);

      let result: { insertId: number };
      try {
        result = await createLetterRequest({
          userId: ctx.user.id,
          letterType: input.letterType,
          subject: input.subject,
          issueSummary: input.issueSummary,
          jurisdictionCountry: input.jurisdictionCountry,
          jurisdictionState: input.jurisdictionState,
          jurisdictionCity: input.jurisdictionCity,
          intakeJson: input.intakeJson,
          priority: input.priority,
          templateId: input.templateId,
          submittedByAdmin: true,
        });
      } catch (createErr) {
        throw createErr;
      }
      const letterId = result.insertId;

      await logReviewAction({
        letterRequestId: letterId,
        reviewerId: ctx.user.id,
        actorType: "admin",
        action: "letter_submitted",
        fromStatus: undefined,
        toStatus: "submitted",
        noteText: "Letter submitted by admin (bypass billing).",
        noteVisibility: "internal",
      });

      const appUrl = getAppUrl(ctx.req);
      try {
        await enqueuePipelineJob({
          type: "runPipeline",
          letterId,
          intake: input.intakeJson,
          userId: ctx.user.id,
          appUrl,
          label: "admin_submit",
        });
      } catch (enqueueErr) {
        logger.error("[Queue] Failed to enqueue admin pipeline job:", enqueueErr);
        captureServerException(enqueueErr, { tags: { component: "queue", error_type: "admin_enqueue_failed" } });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to start letter processing. Please try again.",
        });
      }

      return { letterId, status: "submitted" };
    }),
};
