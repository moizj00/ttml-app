/**
 * Stripe Checkouts — all checkout session creation functions
 */
import Stripe from "stripe";
import { getStripe, getOrCreateStripeCustomer } from "./client";
import { resolveStripeCoupon } from "./coupons";
import { logger } from "../logger";
import { getPlanConfig } from "../stripe-products";

// ─── Create Checkout Session (subscription/one-time plans) ───────────────────
export async function createCheckoutSession(params: {
  userId: number;
  email: string;
  name?: string | null;
  planId: string;
  origin: string;
  discountCode?: string;
  returnTo?: string;
}): Promise<{ url: string; sessionId: string }> {
  const { userId, email, name, planId, origin, discountCode, returnTo } =
    params;
  const plan = getPlanConfig(planId);
  if (!plan) throw new Error(`Invalid plan: ${planId}`);
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(userId, email, name);
  // Resolve discount code to a Stripe coupon + metadata
  const resolved = await resolveStripeCoupon(discountCode);
  const originalPriceCents = plan.price;
  const finalPriceCents = resolved
    ? Math.round(originalPriceCents * (1 - resolved.discountPercent / 100))
    : originalPriceCents;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    client_reference_id: userId.toString(),
    payment_method_types: ["card"],
    // Only allow Stripe's built-in promo codes if no custom discount is applied
    ...(resolved
      ? { discounts: [{ coupon: resolved.stripeCouponId }] }
      : { allow_promotion_codes: true }),
    metadata: {
      user_id: userId.toString(),
      plan_id: planId,
      customer_email: email,
      customer_name: name ?? "",
      original_price: originalPriceCents.toString(),
      final_price: finalPriceCents.toString(),
      ...(discountCode ? { discount_code: discountCode } : {}),
      ...(resolved
        ? {
            discount_code_id: resolved.discountCodeId.toString(),
            employee_id: resolved.employeeId.toString(),
          }
        : {}),
    },
    success_url: returnTo
      ? `${origin}${returnTo}?success=true&plan=${planId}`
      : `${origin}/subscriber/billing?success=true&plan=${planId}`,
    cancel_url: returnTo
      ? `${origin}/pricing?returnTo=${encodeURIComponent(returnTo)}&canceled=true`
      : `${origin}/pricing?canceled=true`,
  };

  if (plan.interval === "one_time") {
    // One-time payment
    sessionParams.mode = "payment";
    sessionParams.line_items = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: plan.name,
            description: plan.description,
            metadata: { plan_id: planId },
          },
          unit_amount: plan.price,
        },
        quantity: 1,
      },
    ];
    sessionParams.payment_intent_data = {
      metadata: {
        user_id: userId.toString(),
        plan_id: planId,
      },
    };
  } else {
    // Recurring subscription
    sessionParams.mode = "subscription";
    sessionParams.line_items = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: plan.name,
            description: plan.description,
            metadata: { plan_id: planId },
          },
          unit_amount: plan.price,
          recurring: {
            interval: plan.interval as "month" | "year",
          },
        },
        quantity: 1,
      },
    ];
    sessionParams.subscription_data = {
      metadata: {
        user_id: userId.toString(),
        plan_id: planId,
        ...(discountCode ? { discount_code: discountCode } : {}),
        ...(resolved
          ? {
              employee_id: resolved.employeeId.toString(),
              discount_code_id: resolved.discountCodeId.toString(),
            }
          : {}),
      },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id };
}

// ─── Letter Unlock Checkout ($X per letter) ──────────────────────────────────
/**
 * Creates a one-time Stripe Checkout session for unlocking a specific
 * generated_locked letter. The letter_id is stored in session metadata so
 * the webhook can transition it to pending_review after payment.
 */
export async function createLetterUnlockCheckout(params: {
  userId: number;
  email: string;
  name?: string | null;
  letterId: number;
  origin: string;
  discountCode?: string;
}): Promise<{ url: string; sessionId: string }> {
  const { userId, email, name, letterId, origin, discountCode } = params;
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(userId, email, name);
  // Resolve discount code to a Stripe coupon + metadata
  const resolved = await resolveStripeCoupon(discountCode);
  const originalPriceCents = LETTER_UNLOCK_PRICE_CENTS;
  const finalPriceCents = resolved
    ? Math.round(originalPriceCents * (1 - resolved.discountPercent / 100))
    : originalPriceCents;
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: userId.toString(),
    mode: "payment",
    payment_method_types: ["card"],
    ...(resolved
      ? { discounts: [{ coupon: resolved.stripeCouponId }] }
      : { allow_promotion_codes: true }),
    metadata: {
      user_id: userId.toString(),
      plan_id: "single_letter",
      letter_id: letterId.toString(),
      unlock_type: "letter_unlock",
      customer_email: email,
      customer_name: name ?? "",
      original_price: originalPriceCents.toString(),
      final_price: finalPriceCents.toString(),
      ...(discountCode ? { discount_code: discountCode } : {}),
      ...(resolved
        ? {
            discount_code_id: resolved.discountCodeId.toString(),
            employee_id: resolved.employeeId.toString(),
          }
        : {}),
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Legal Letter — Attorney Review",
            description:
              "Unlock your attorney-reviewed letter and send it for licensed attorney review and approval.",
            metadata: {
              plan_id: "single_letter",
              letter_id: letterId.toString(),
            },
          },
          unit_amount: LETTER_UNLOCK_PRICE_CENTS,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      metadata: {
        user_id: userId.toString(),
        plan_id: "single_letter",
        letter_id: letterId.toString(),
        unlock_type: "letter_unlock",
      },
    },
    success_url: `${origin}/letters/${letterId}?unlocked=true`,
    cancel_url: `${origin}/letters/${letterId}?canceled=true`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id };
}

// ─── First Letter Review Checkout ($50 attorney review gate) ─────────────────
/**
 * Creates a one-time $50 Stripe Checkout session for attorney review of the user's
 * first letter. The letter_id is stored in session metadata so the webhook can
 * transition it from generated_locked → pending_review after payment.
 */
// ─── Revision Consultation Checkout ($20 per paid revision) ──────────────────
const REVISION_CONSULTATION_PRICE_CENTS = 2000; // $20.00

/**
 * Creates a $20 Stripe checkout session for a subscriber revision consultation.
 * The revision notes are stored in session metadata so the webhook can
 * execute the revision after payment is confirmed.
 */
export async function createRevisionConsultationCheckout(params: {
  userId: number;
  email: string;
  name?: string | null;
  letterId: number;
  revisionNotes: string;
  origin: string;
}): Promise<{ url: string; sessionId: string }> {
  const { userId, email, name, letterId, revisionNotes, origin } = params;
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(userId, email, name);
  // Truncate revision notes to fit Stripe metadata value limit (500 chars)
  const truncatedNotes =
    revisionNotes.length > 490
      ? revisionNotes.slice(0, 490) + "…"
      : revisionNotes;
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: userId.toString(),
    mode: "payment",
    payment_method_types: ["card"],
    metadata: {
      user_id: userId.toString(),
      plan_id: "revision_consultation",
      letter_id: letterId.toString(),
      unlock_type: "revision_consultation",
      revision_notes: truncatedNotes,
      customer_email: email,
      customer_name: name ?? "",
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Revision Consultation — $20",
            description:
              "Request attorney revisions on your approved letter draft. Each consultation covers one round of changes.",
            metadata: {
              plan_id: "revision_consultation",
              letter_id: letterId.toString(),
            },
          },
          unit_amount: REVISION_CONSULTATION_PRICE_CENTS,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      metadata: {
        user_id: userId.toString(),
        plan_id: "revision_consultation",
        letter_id: letterId.toString(),
        unlock_type: "revision_consultation",
      },
    },
    success_url: `${origin}/letters/${letterId}?revision_paid=true`,
    cancel_url: `${origin}/letters/${letterId}?revision_canceled=true`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id };
}

// ─── DEPRECATED: Trial Review Checkout ──────────────────────────────────────────────
/**
 * @deprecated First letter is now fully free. Redirects to createLetterUnlockCheckout.
 */
export async function createTrialReviewCheckout(params: {
  userId: number;
  email: string;
  name?: string | null;
  letterId: number;
  origin: string;
  discountCode?: string;
}): Promise<{ url: string; sessionId: string }> {
  logger.warn(
    "[Stripe] createTrialReviewCheckout is deprecated — first letter is now free"
  );
  return createLetterUnlockCheckout({ ...params });
}
