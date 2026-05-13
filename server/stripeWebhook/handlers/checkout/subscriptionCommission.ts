/**
 * checkout.session.completed — session.mode === "subscription" commission tracking
 *
 * The subscription itself is activated by subscription lifecycle events.
 * Subscription commissions are intentionally created only from invoice.paid,
 * using the Stripe invoice ID as the idempotency key for both initial invoices
 * and renewals.
 */

import Stripe from "stripe";
import type { ParsedCheckoutMetadata } from "../../_metadata";
import { stripeLogger } from "../../_helpers";

export async function handleSubscriptionModeCommission(
  _session: Stripe.Checkout.Session,
  meta: ParsedCheckoutMetadata
): Promise<void> {
  if (!meta.discountCode) return;

  stripeLogger.info(
    { userId: meta.userId, planId: meta.planId },
    "[StripeWebhook] Subscription checkout commission deferred to invoice.paid"
  );
}
