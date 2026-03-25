/**
 * Stripe Service — Talk-to-My-Lawyer
 * Handles checkout sessions, webhook processing, and subscription management
 */

import Stripe from "stripe";
import { ENV } from "./_core/env";
import { getDb, countCompletedLetters, getDiscountCodeByCode } from "./db";
import { subscriptions } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  PLANS,
  getPlanConfig,
  LETTER_UNLOCK_PRICE_CENTS,
  MONTHLY_PRICE_CENTS,
  YEARLY_PRICE_CENTS,
} from "./stripe-products";

/**
 * Resolves a discount code from our DB into a Stripe coupon ID.
 * Creates a Stripe coupon on-the-fly if the code is valid and active.
 * Returns the coupon ID + discount code details for metadata enrichment,
 * or null if the code is invalid/expired.
 */
interface ResolvedDiscount {
  stripeCouponId: string;
  discountCodeId: number;
  employeeId: number;
  discountPercent: number;
}

async function resolveStripeCoupon(
  discountCode: string | undefined
): Promise<ResolvedDiscount | null> {
  if (!discountCode) return null;
  try {
    const code = await getDiscountCodeByCode(discountCode);
    if (!code || !code.isActive) return null;
    if (code.maxUses && code.usageCount >= code.maxUses) return null;
    if (code.expiresAt && new Date(code.expiresAt) < new Date()) return null;

    const stripe = getStripe();
    // Use a deterministic coupon ID so we reuse the same Stripe coupon for the same discount %
    const couponId = `ttml_${code.discountPercent}pct`;
    try {
      await stripe.coupons.retrieve(couponId);
    } catch {
      // Coupon doesn't exist yet — create it
      // Business intent: "once" means the discount applies only to the first invoice
      // (i.e. the subscriber's first payment). This is a one-time introductory discount
      // for customer acquisition — subsequent renewals are charged at full price.
      await stripe.coupons.create({
        id: couponId,
        percent_off: code.discountPercent,
        duration: "once",
        name: `${code.discountPercent}% Off — Referral Discount`,
      });
    }
    return {
      stripeCouponId: couponId,
      discountCodeId: code.id,
      employeeId: code.employeeId,
      discountPercent: code.discountPercent,
    };
  } catch (err) {
    console.error("[Stripe] Failed to resolve discount coupon:", err);
    return null;
  }
}

// ─── Stripe Client ───────────────────────────────────────────────────────────
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(ENV.stripeSecretKey, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return _stripe;
}

// ─── Get or Create Stripe Customer ───────────────────────────────────────────
export async function getOrCreateStripeCustomer(
  userId: number,
  email: string,
  name?: string | null
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user already has a stripe customer ID
  const existing = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (existing.length > 0 && existing[0].stripeCustomerId) {
    return existing[0].stripeCustomerId;
  }

  // Create new Stripe customer
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { userId: userId.toString() },
  });

  return customer.id;
}

// ─── Create Checkout Session ──────────────────────────────────────────────────
export async function createCheckoutSession(params: {
  userId: number;
  email: string;
  name?: string | null;
  planId: string;
  origin: string;
  discountCode?: string;
}): Promise<{ url: string; sessionId: string }> {
  const { userId, email, name, planId, origin, discountCode } = params;
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
    success_url: `${origin}/subscriber/billing?success=true&plan=${planId}`,
    cancel_url: `${origin}/pricing?canceled=true`,
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

// ─── Create Billing Portal Session ───────────────────────────────────────────
export async function createBillingPortalSession(params: {
  userId: number;
  email: string;
  origin: string;
}): Promise<string> {
  const { userId, email, origin } = params;
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(userId, email);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/subscriber/billing`,
  });

  return session.url;
}

// ─── Get User Subscription ────────────────────────────────────────────────────
export async function getUserSubscription(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(subscriptions.createdAt)
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}

// ─── Activate/Update Subscription from Webhook ───────────────────────────────
export async function activateSubscription(params: {
  userId: number;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  stripePaymentIntentId: string | null;
  planId: string;
  status:
    | "active"
    | "canceled"
    | "past_due"
    | "trialing"
    | "incomplete"
    | "none";
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const plan = getPlanConfig(params.planId);
  if (!plan) throw new Error(`Unknown plan: ${params.planId}`);
  if (plan.lettersAllowed < 0) {
    throw new Error(
      `Plan "${params.planId}" has invalid lettersAllowed: ${plan.lettersAllowed}. Only non-negative values are permitted.`
    );
  }

  const lettersAllowed = plan.lettersAllowed;

  await db
    .insert(subscriptions)
    .values({
      userId: params.userId,
      stripeCustomerId: params.stripeCustomerId,
      stripeSubscriptionId: params.stripeSubscriptionId,
      stripePaymentIntentId: params.stripePaymentIntentId,
      plan: params.planId as any,
      status: params.status,
      lettersAllowed,
      lettersUsed: 0,
      currentPeriodStart: params.currentPeriodStart ?? null,
      currentPeriodEnd: params.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: params.cancelAtPeriodEnd ?? false,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        stripeCustomerId: params.stripeCustomerId,
        stripeSubscriptionId: params.stripeSubscriptionId,
        stripePaymentIntentId: params.stripePaymentIntentId,
        plan: params.planId as any,
        status: params.status,
        lettersAllowed,
        currentPeriodStart: params.currentPeriodStart ?? null,
        currentPeriodEnd: params.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: params.cancelAtPeriodEnd ?? false,
        updatedAt: new Date(),
      },
    });
}

// ─── Increment Letters Used (Atomic, Race-Safe) ─────────────────────────────
export async function incrementLettersUsed(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .update(subscriptions)
    .set({ lettersUsed: sql`${subscriptions.lettersUsed} + 1` })
    .where(
      and(
        eq(subscriptions.userId, userId),
        sql`${subscriptions.lettersUsed} < ${subscriptions.lettersAllowed}`
      )
    )
    .returning({ id: subscriptions.id });

  return result.length > 0;
}

// ─── Check if User Can Submit Letter ─────────────────────────────────────────
export async function checkLetterSubmissionAllowed(
  userId: number
): Promise<{
  allowed: boolean;
  reason?: string;
  subscription?: any;
  firstLetterFree?: boolean;
}> {
  const sub = await getUserSubscription(userId);

  if (!sub || sub.status !== "active") {
    // ── First-letter-free: allow users with 0 completed letters to submit ──
    const completedCount = await countCompletedLetters(userId);
    if (completedCount === 0) {
      return {
        allowed: true,
        firstLetterFree: true,
        reason: "Your first letter is free — no subscription required.",
      };
    }
    return {
      allowed: false,
      reason:
        "You need an active subscription to submit a letter. Please choose a plan.",
    };
  }

  if (sub.lettersUsed >= sub.lettersAllowed) {
    return {
      allowed: false,
      reason: `You have used all ${sub.lettersAllowed} letter(s) in your plan. Please upgrade to continue.`,
      subscription: sub,
    };
  }

  return { allowed: true, subscription: sub };
}

// ─── Check if User Has Active Recurring Subscription (monthly or annual) ────────
/**
 * Returns true only for users with an active monthly or annual subscription.
 * Per-letter (pay-as-you-go) payments do NOT count as a recurring subscription.
 * Used to determine whether to bypass the paywall at pipeline completion.
 */
export async function hasActiveRecurringSubscription(
  userId: number
): Promise<boolean> {
  const sub = await getUserSubscription(userId);
  if (!sub) return false;
  if (sub.status !== "active") return false;
  // single_letter is one-time, not a recurring subscription
  // Support both new plan IDs and legacy aliases
  return [
    "monthly",
    "yearly",
    "monthly_basic", // legacy
    "monthly_pro",   // legacy
    "starter",       // legacy
    "professional",  // legacy
    "annual",        // legacy
  ].includes(sub.plan);
}

// ─── Create Trial Review Checkout (DEPRECATED — first letter is now fully free) ────────
/**
 * @deprecated The first letter is now completely free (no $50 trial review fee).
 * This function is kept for backward compatibility with any existing webhook
 * events that may reference the old free_trial_review plan.
 * New code should NOT call this function.
 */
export async function createTrialReviewCheckout(params: {
  userId: number;
  email: string;
  name?: string | null;
  letterId: number;
  origin: string;
  discountCode?: string;
}): Promise<{ url: string; sessionId: string }> {
  console.warn(
    "[Stripe] createTrialReviewCheckout is deprecated — first letter is now free"
  );
  // Redirect to the letter unlock checkout instead (which handles free-trial letters)
  return createLetterUnlockCheckout({ ...params });
}

// ─── Create Letter Unlock Checkout (pay-to-unlock paywall) ───────────────────
/**
 * Creates a one-time $200 Stripe Checkout session for unlocking a specific
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
              "Unlock your AI-drafted letter and send it for licensed attorney review and approval.",
            metadata: { plan_id: "single_letter", letter_id: letterId.toString() },
          },
          unit_amount: LETTER_UNLOCK_PRICE_CENTS, // $200
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
    success_url: `${origin}/subscriber/letters/${letterId}?unlocked=true`,
    cancel_url: `${origin}/subscriber/letters/${letterId}?canceled=true`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id };
}
