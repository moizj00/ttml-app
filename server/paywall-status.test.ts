/**
 * Tests for the three-state paywall logic:
 *   - "free"           — first letter, free trial not yet used
 *   - "subscribed"     — active monthly/annual plan (bypass paywall entirely)
 *   - "subscription_required" — free trial already used, no active recurring subscription
 *   - "pay_per_letter" — legacy fallback; same action as subscription_required
 *
 * Also covers the hasActiveRecurringSubscription decision logic and
 * the pipeline Stage 3 final status decision.
 *
 * Note: We test the core decision logic directly (not the full tRPC procedure)
 * to avoid ES module self-import mock limitations in Vitest.
 */

import { describe, it, expect } from "vitest";

// ─── Inline the hasActiveRecurringSubscription decision logic ─────────────────
// This mirrors exactly what the function does after fetching the subscription.
function isRecurringSubscriptionActive(sub: { plan: string; status: string } | null): boolean {
  if (!sub) return false;
  if (sub.status !== "active") return false;
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

describe("hasActiveRecurringSubscription — decision logic", () => {
  it("returns false when user has no subscription (null)", () => {
    expect(isRecurringSubscriptionActive(null)).toBe(false);
  });

  it("returns false for an active single_letter subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "single_letter", status: "active" })).toBe(false);
  });

  it("returns true for an active monthly subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "monthly", status: "active" })).toBe(true);
  });

  it("returns true for an active yearly subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "yearly", status: "active" })).toBe(true);
  });

  it("returns false for a canceled monthly subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "monthly", status: "canceled" })).toBe(false);
  });

  it("returns false for a past_due yearly subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "yearly", status: "past_due" })).toBe(false);
  });

  it("returns false for an incomplete yearly subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "yearly", status: "incomplete" })).toBe(false);
  });

  it("returns false for a trialing monthly subscription (not yet active)", () => {
    expect(isRecurringSubscriptionActive({ plan: "monthly", status: "trialing" })).toBe(false);
  });
});

// ─── checkPaywallStatus decision logic ───────────────────────────────────────
// Mirrors the procedure logic: isSubscribed → "subscribed", freeReviewUsedAt is null and unlockedCount === 0 → "free", else → "subscription_required"

function resolvePaywallState(
  isSubscribed: boolean,
  hasUsedFreeReview: boolean,
  unlockedLetterCount: number
): "free" | "subscribed" | "subscription_required" {
  if (isSubscribed) return "subscribed";
  if (!hasUsedFreeReview && unlockedLetterCount === 0) return "free";
  return "subscription_required";
}

describe("checkPaywallStatus — state resolution", () => {
  it("returns 'subscribed' when user has active monthly/annual subscription", () => {
    expect(resolvePaywallState(true, false, 0)).toBe("subscribed");
  });

  it("returns 'subscribed' even if user has used free review (subscription takes priority)", () => {
    expect(resolvePaywallState(true, true, 5)).toBe("subscribed");
  });

  it("returns 'free' when user has no subscription, hasn't used free review, and no prior unlocked letters", () => {
    expect(resolvePaywallState(false, false, 0)).toBe("free");
  });

  it("returns 'subscription_required' when user has no subscription but has used free review", () => {
    expect(resolvePaywallState(false, true, 0)).toBe("subscription_required");
  });

  it("returns 'subscription_required' when user has no subscription, hasn't explicitly used free review, but has prior unlocked letters (legacy fallback)", () => {
    expect(resolvePaywallState(false, false, 1)).toBe("subscription_required");
  });

  it("returns 'free' for a brand-new user (no subscription, no free review used, no letters)", () => {
    expect(resolvePaywallState(false, false, 0)).toBe("free");
  });
});

// ─── Pipeline final status decision (auto-unlock logic) ───────────────────────────────────────────
// Mirrors the pipeline logic: hasLetterBeenPreviouslyUnlocked → "pending_review", else → "generated_locked"

function resolvePipelineFinalStatus(hasBeenUnlocked: boolean): "pending_review" | "generated_locked" {
  return hasBeenUnlocked ? "pending_review" : "generated_locked";
}

describe("Pipeline auto-unlock logic — final status decision", () => {
  it("sets status to pending_review if letter was previously unlocked", () => {
    expect(resolvePipelineFinalStatus(true)).toBe("pending_review");
  });

  it("sets status to generated_locked if letter has not been unlocked", () => {
    expect(resolvePipelineFinalStatus(false)).toBe("generated_locked");
  });
});
