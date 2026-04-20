/**
 * Stripe Webhook — checkout.session.completed dispatcher
 *
 * Routes on `session.mode` + `metadata.unlock_type`:
 *   - payment + letter_unlock           → handleLetterUnlock
 *   - payment + first_letter_review     → handleFirstLetterReview
 *   - payment + revision_consultation   → handleRevisionConsultation
 *   - payment (other)                   → activateSubscription (per-letter)
 *   - subscription (any)                → handleSubscriptionModeCommission
 *
 * The actual per-flow logic lives in `./checkout/*.ts`.
 */

import Stripe from "stripe";
import { activateSubscription } from "../../stripe";
import { parseCheckoutMetadata, getPaymentIntentId, getCustomerId } from "../_metadata";
import { stripeLogger } from "../_helpers";
import { handleLetterUnlock } from "./checkout/letterUnlock";
import { handleFirstLetterReview } from "./checkout/firstLetterReview";
import { handleRevisionConsultation } from "./checkout/revisionConsultation";
import { handleSubscriptionModeCommission } from "./checkout/subscriptionCommission";

export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const meta = parseCheckoutMetadata(session);

  if (!meta.userId) {
    stripeLogger.warn({}, "[StripeWebhook] checkout.session.completed: no userId in metadata");
    return;
  }

  if (session.mode === "payment") {
    // Per-letter subscription activation for sessions that aren't a special unlock type.
    if (meta.unlockType !== "first_letter_review" && meta.unlockType !== "revision_consultation") {
      await activateSubscription({
        userId: meta.userId,
        stripeCustomerId: getCustomerId(session.customer),
        stripeSubscriptionId: null,
        stripePaymentIntentId: getPaymentIntentId(session.payment_intent),
        planId: meta.planId,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
      });
      stripeLogger.info({ userId: meta.userId }, "[StripeWebhook] Per-letter payment activated");
    }

    if (meta.unlockType === "letter_unlock") {
      await handleLetterUnlock(session, meta);
    } else if (meta.unlockType === "first_letter_review") {
      await handleFirstLetterReview(session, meta);
    } else if (meta.unlockType === "revision_consultation") {
      await handleRevisionConsultation(session, meta);
    }
    return;
  }

  if (session.mode === "subscription") {
    await handleSubscriptionModeCommission(session, meta);
  }
}
