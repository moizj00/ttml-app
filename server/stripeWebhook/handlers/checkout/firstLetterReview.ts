/**
 * checkout.session.completed — `unlock_type = "first_letter_review"` ($50 gate)
 *
 * Same transition + notifications as `letter_unlock`, plus marks the free
 * review as used on the subscriber's user row.
 */

import Stripe from "stripe";
import type { ParsedCheckoutMetadata } from "../../_metadata";
import { setFreeReviewUsed } from "../../../db";
import { fulfillLetterUnlock } from "../../../services/billing";
import { stripeLogger } from "../../_helpers";

export async function handleFirstLetterReview(
  session: Stripe.Checkout.Session,
  meta: ParsedCheckoutMetadata
): Promise<void> {
  if (meta.letterId === null) return;

  try {
    await fulfillLetterUnlock({
      letterId: meta.letterId,
      userId: meta.userId,
      sessionId: session.id,
      source: "first_letter_offer",
      appUrl: meta.appUrl,
      noteText: `$50 first-letter review payment received. Letter queued for attorney review. Stripe session: ${session.id}`,
    });

    try {
      await setFreeReviewUsed(meta.userId);
    } catch (dbErr) {
      stripeLogger.error({ err: dbErr, userId: meta.userId }, "[StripeWebhook] Failed to mark free review as used");
    }

    stripeLogger.info({ letterId: meta.letterId }, "[StripeWebhook] Letter first_letter_review → pending_review via $50 payment");
  } catch (flErr) {
    stripeLogger.error({ err: flErr, letterId: meta.letterId }, "[StripeWebhook] Failed to process first_letter_review");
  }
}
