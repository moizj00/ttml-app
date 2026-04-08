/**
 * Billing Router — Letter Unlock & Submission Procedures
 *
 * Covers: freeUnlock (deprecated), payFirstLetterReview,
 *         subscriptionSubmit, payToUnlock
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../../_core/trpc";
import { checkTrpcRateLimit } from "../../rateLimiter";
import {
  getLetterRequestSafeForSubscriber,
  updateLetterStatus,
  logReviewAction,
  notifyAdmins,
  notifyAllAttorneys,
} from "../../db";
import {
  sendLetterUnlockedEmail,
} from "../../email";
import { captureServerException } from "../../sentry";
import {
  hasActiveRecurringSubscription,
  createFirstLetterReviewCheckout,
  createLetterUnlockCheckout,
} from "../../stripe";
import { verifiedSubscriberProcedure, getAppUrl } from "../_shared";

export const billingLettersRouter = router({
  // DEPRECATED — always rejects. Kept for backward compatibility.
  freeUnlock: verifiedSubscriberProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async () => {
      return {
        ok: false as const,
        nextState: "payment_required" as const,
        message:
          "The free first letter offer has ended. Please pay $50 for attorney review or subscribe to a plan.",
      };
    }),

  // Pay $50 for first letter attorney review
  payFirstLetterReview: verifiedSubscriberProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await checkTrpcRateLimit("payment", `user:${ctx.user.id}`);

      const isSubscribed = await hasActiveRecurringSubscription(ctx.user.id);
      if (isSubscribed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You have an active subscription. Use the subscription submit flow instead.",
        });
      }

      // Enforce first-letter eligibility via letter history
      const db = await (await import("../../db")).getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { letterRequests } = await import("../../../drizzle/schema");
      const { eq: eqOp, and: andOp, notInArray: notInOp } = await import("drizzle-orm");
      const unlockedLetters = await db
        .select({ id: letterRequests.id })
        .from(letterRequests)
        .where(
          andOp(
            eqOp(letterRequests.userId, ctx.user.id),
            notInOp(letterRequests.status, [
              "submitted",
              "researching",
              "drafting",
              "generated_locked",
              "pipeline_failed",
            ])
          )
        );
      if (unlockedLetters.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The $50 first-letter offer is only available for your first letter. Please subscribe to continue.",
        });
      }

      const letter = await getLetterRequestSafeForSubscriber(input.letterId, ctx.user.id);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found" });
      if (letter.status !== "generated_locked") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter is not in generated_locked status",
        });
      }

      const origin = getAppUrl(ctx.req);
      const result = await createFirstLetterReviewCheckout({
        userId: ctx.user.id,
        email: ctx.user.email ?? "",
        name: ctx.user.name,
        letterId: input.letterId,
        origin,
      });
      return result;
    }),

  // Subscription Submit: active subscribers bypass paywall entirely
  subscriptionSubmit: verifiedSubscriberProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const isSubscribed = await hasActiveRecurringSubscription(ctx.user.id);
      if (!isSubscribed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "An active subscription is required to use this feature.",
        });
      }

      const letter = await getLetterRequestSafeForSubscriber(input.letterId, ctx.user.id);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found" });
      if (letter.status !== "generated_locked") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter is not in generated_locked status",
        });
      }

      await updateLetterStatus(input.letterId, "pending_review");
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: "subscriber",
        action: "subscription_submit",
        noteText: "Subscriber submitted letter for attorney review via active subscription (paywall bypassed).",
        noteVisibility: "internal",
        fromStatus: "generated_locked",
        toStatus: "pending_review",
      });

      try {
        await sendLetterUnlockedEmail({
          to: ctx.user.email ?? "",
          name: ctx.user.name ?? "Subscriber",
          subject: letter.subject,
          letterId: input.letterId,
          appUrl: getAppUrl(ctx.req),
        });
      } catch (e) {
        captureServerException(e, { tags: { component: "billing", error_type: "subscription_submit_email_failed" } });
      }

      try {
        await notifyAllAttorneys({
          letterId: input.letterId,
          letterSubject: letter.subject,
          letterType: letter.letterType,
          jurisdiction: letter.jurisdictionState ?? "Unknown",
          appUrl: getAppUrl(ctx.req),
        });
      } catch (notifyErr) {
        captureServerException(notifyErr, { tags: { component: "billing", error_type: "notify_attorneys_subscription_submit_failed" } });
      }

      try {
        await notifyAdmins({
          category: "letters",
          type: "subscription_submit",
          title: `Subscription submit — letter #${input.letterId} enters review queue`,
          body: `${ctx.user.name ?? "A subscriber"} submitted "${letter.subject}" via active subscription. Now pending review.`,
          link: `/admin/letters/${input.letterId}`,
        });
      } catch (err) {
        captureServerException(err, { tags: { component: "billing", error_type: "notify_admins_subscription_submit" } });
      }

      return { ok: true as const };
    }),

  // Pay-to-unlock: one-time $299 checkout for a specific locked letter
  payToUnlock: verifiedSubscriberProcedure
    .input(
      z.object({ letterId: z.number(), discountCode: z.string().optional() })
    )
    .mutation(async ({ ctx, input }) => {
      await checkTrpcRateLimit("payment", `user:${ctx.user.id}`);

      const letter = await getLetterRequestSafeForSubscriber(
        input.letterId,
        ctx.user.id
      );
      if (!letter) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found" });
      if (letter.status !== "generated_locked") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter is not in generated_locked status",
        });
      }

      const origin = getAppUrl(ctx.req);
      const result = await createLetterUnlockCheckout({
        userId: ctx.user.id,
        email: ctx.user.email ?? "",
        name: ctx.user.name,
        letterId: input.letterId,
        origin,
        discountCode: input.discountCode,
      });
      return result;
    }),
});
