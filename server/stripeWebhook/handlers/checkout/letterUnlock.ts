/**
 * checkout.session.completed — `unlock_type = "letter_unlock"` (standard paid unlock)
 *
 * Transitions `generated_locked → pending_review` and, if a `discount_code`
 * is present on the session metadata, writes a commission_ledger row.
 */

import Stripe from "stripe";
import { SINGLE_LETTER_PRICE_CENTS } from "../../../../shared/pricing";
import type { ParsedCheckoutMetadata } from "../../_metadata";
import { getPaymentIntentId } from "../../_metadata";
import { fulfillLetterUnlock } from "../../../services/billing";
import { trackCheckoutCommission } from "../../_commission";
import { stripeLogger } from "../../_helpers";

export async function handleLetterUnlock(
  session: Stripe.Checkout.Session,
  meta: ParsedCheckoutMetadata
): Promise<void> {
  if (meta.letterId === null) return;

  const paymentIntentId = getPaymentIntentId(session.payment_intent);

  try {
    await fulfillLetterUnlock({
      letterId: meta.letterId,
      userId: meta.userId,
      sessionId: session.id,
      source: "direct_unlock",
      appUrl: meta.appUrl,
      noteText: `Payment received. Letter unlocked and queued for attorney review. Stripe session: ${session.id}`,
    });

    if (meta.discountCode) {
      await trackCheckoutCommission({
        discountCode: meta.discountCode,
        metadataEmployeeId: meta.employeeId,
        metadataDiscountCodeId: meta.discountCodeId,
        paymentIntentId,
        saleAmountCents: session.amount_total ?? SINGLE_LETTER_PRICE_CENTS,
        subscriberId: meta.userId,
        letterRequestId: meta.letterId,
        appUrl: meta.appUrl,
        planId: meta.planId,
      }).catch((commErr) =>
        stripeLogger.error({ err: commErr }, "[StripeWebhook] Commission tracking error")
      );
    }
  } catch (unlockErr) {
    stripeLogger.error({ err: unlockErr, letterId: meta.letterId }, "[StripeWebhook] Failed to unlock letter");
  }
}
