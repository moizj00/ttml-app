/**
 * Stripe Subscriptions — subscription lifecycle management
 */
import { getDb, countCompletedLetters, getUserById } from "../db";
import { subscriptions } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { getPlanConfig } from "../stripe-products";
import { getStripe, getOrCreateStripeCustomer } from "./client";

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
  /** Pass true on billing period renewals (invoice.paid) to reset lettersUsed to 0 */
  resetLettersUsed?: boolean;
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
        // Reset usage counter at the start of each billing period
        ...(params.resetLettersUsed ? { lettersUsed: 0 } : {}),
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
    // ── First-letter-free: use freeReviewUsedAt as the authoritative gate ───
    // This is set atomically by claimFreeTrialSlot() before pipeline starts,
    // and cleared by refundFreeTrialSlot() if the pipeline fails — making it
    // the single source of truth for free-trial claim state.
    //
    // Backward-compat fallback: for users created before freeReviewUsedAt was
    // introduced, fall through to countCompletedLetters if the column is null.
    const user = await getUserById(userId);
    if (user?.freeReviewUsedAt) {
      // Slot is explicitly claimed (and not yet refunded) → not eligible
      return {
        allowed: false,
        reason:
          "You need an active subscription to submit a letter. Please choose a plan.",
      };
    }
    // freeReviewUsedAt is null — check completed letters for backward compat
    // (covers legacy users who had letters before this column was introduced)
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

// ─── Check if User Has Active Recurring Subscription ────────────────────────
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

// ─── Check if User Has Ever Had Any Subscription ────────────────────────────
/**
 * Returns true if the user has ANY subscription record, regardless of status or plan.
 * This is the permanent gate for attorney promotion:
 * once a user has subscribed (even if canceled), they can never become an attorney.
 * This prevents the billing/role conflict where a subscriber is promoted to attorney
 * while Stripe still has their payment history.
 */
export async function hasEverSubscribed(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return rows.length > 0;
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
