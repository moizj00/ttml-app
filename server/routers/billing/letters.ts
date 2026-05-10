/**
 * Billing Router — Letter Unlock & Submission Procedures
 *
 * Covers: freeUnlock (deprecated),
 *         subscriptionSubmit, payToUnlock
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../../_core/trpc";
// Single-letter pay-as-you-go removed — subscription-only for attorney review
import {
  getLetterRequestSafeForSubscriber,
  updateLetterStatus,
  logReviewAction,
  notifyAdmins,
  notifyAllAttorneys,
} from "../../db";
import { sendLetterUnlockedEmail } from "../../email";
import { captureServerException } from "../../sentry";
import { hasActiveRecurringSubscription } from "../../stripe";
import { verifiedSubscriberProcedure, getAppUrl } from "../_shared";

// import { createAttorneyReviewCheckoutProcedure } from "../../services/canonicalProcedures";

export const billingLettersRouter = router({
  // DEPRECATED — always rejects. Kept for backward compatibility.
  freeUnlock: verifiedSubscriberProcedure
    .input(z.object({ letterId: z.number() }))
    .mutation(async () => {
      return {
        ok: false as const,
        nextState: "payment_required" as const,
        message:
          "The free first letter offer has ended. Please pay $100 for attorney review or subscribe to a plan.",
      };
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

      const letter = await getLetterRequestSafeForSubscriber(
        input.letterId,
        ctx.user.id
      );
      if (!letter)
        throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found" });

      const reviewSubmittableStatuses = [
        "generated_locked",
        "letter_released_to_subscriber",
        "attorney_review_upsell_shown",
      ];
      if (!reviewSubmittableStatuses.includes(letter.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Letter is not in a status that allows review submission",
        });
      }

      await updateLetterStatus(input.letterId, "pending_review");
      await logReviewAction({
        letterRequestId: input.letterId,
        reviewerId: ctx.user.id,
        actorType: "subscriber",
        action: "subscription_submit",
        noteText:
          "Subscriber submitted letter for attorney review via active subscription (paywall bypassed).",
        noteVisibility: "internal",
        fromStatus: letter.status as any,
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
        captureServerException(e, {
          tags: {
            component: "billing",
            error_type: "subscription_submit_email_failed",
          },
        });
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
        captureServerException(notifyErr, {
          tags: {
            component: "billing",
            error_type: "notify_attorneys_subscription_submit_failed",
          },
        });
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
        captureServerException(err, {
          tags: {
            component: "billing",
            error_type: "notify_admins_subscription_submit",
          },
        });
      }

      return { ok: true as const };
    }),

  // Subscription-only: no pay-to-unlock. Non-subscribers must subscribe.
  // (payToUnlock removed — see canonicalProcedures.ts for legacy reference)
});
