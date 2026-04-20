/**
 * checkout.session.completed — `unlock_type = "first_letter_review"` ($50 gate)
 *
 * Same transition + notifications as `letter_unlock`, plus marks the free
 * review as used on the subscriber's user row.
 */

import Stripe from "stripe";
import type { ParsedCheckoutMetadata } from "../../_metadata";
import { setFreeReviewUsed } from "../../../db";
import { unlockLetterForReview } from "../../_letterUnlock";
import { stripeLogger } from "../../_helpers";

export async function handleFirstLetterReview(
  session: Stripe.Checkout.Session,
  meta: ParsedCheckoutMetadata
): Promise<void> {
  if (meta.letterId === null) return;

  try {
    await unlockLetterForReview({
      letterId: meta.letterId,
      userId: meta.userId,
      sessionId: session.id,
      noteText: `$50 first-letter review payment received. Letter queued for attorney review. Stripe session: ${session.id}`,
      appUrl: meta.appUrl,
      adminNotifTitle: `$50 first-letter review payment — letter #${meta.letterId} unlocked`,
      adminEmailSubject: `$50 First-Letter Review Payment — Letter #${meta.letterId}`,
      adminEmailBodyHtml: `<p>Hello,</p><p>A $50 first-letter review payment has been received for letter <strong>#${meta.letterId}</strong>. The letter is now in the attorney review queue.</p>`,
      afterTransition: () => setFreeReviewUsed(meta.userId),
    });
    stripeLogger.info({ letterId: meta.letterId }, "[StripeWebhook] Letter first_letter_review → pending_review via $50 payment");
  } catch (flErr) {
    stripeLogger.error({ err: flErr, letterId: meta.letterId }, "[StripeWebhook] Failed to process first_letter_review");
  }
}
