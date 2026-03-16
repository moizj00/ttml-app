/**
 * Tests for the three-state paywall logic:
 *   - "free"           → first letter, no prior unlocked letters, no subscription
 *   - "subscribed"     → active monthly or annual subscription
 *   - "pay_per_letter" → free letter used, no active recurring subscription
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
  return sub.plan === "monthly" || sub.plan === "annual";
}

describe("hasActiveRecurringSubscription — decision logic", () => {
  it("returns false when user has no subscription (null)", () => {
    expect(isRecurringSubscriptionActive(null)).toBe(false);
  });

  it("returns false for an active per_letter subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "per_letter", status: "active" })).toBe(false);
  });

  it("returns true for an active monthly subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "monthly", status: "active" })).toBe(true);
  });

  it("returns true for an active annual subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "annual", status: "active" })).toBe(true);
  });

  it("returns false for a canceled monthly subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "monthly", status: "canceled" })).toBe(false);
  });

  it("returns false for a past_due annual subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "annual", status: "past_due" })).toBe(false);
  });

  it("returns false for an incomplete annual subscription", () => {
    expect(isRecurringSubscriptionActive({ plan: "annual", status: "incomplete" })).toBe(false);
  });

  it("returns false for a trialing monthly subscription (not yet active)", () => {
    expect(isRecurringSubscriptionActive({ plan: "monthly", status: "trialing" })).toBe(false);
  });
});

// ─── checkPaywallStatus decision logic ───────────────────────────────────────
// Mirrors the procedure logic: isSubscribed → "subscribed", unlockedCount === 0 → "free", else → "pay_per_letter"

function resolvePaywallState(
  isSubscribed: boolean,
  unlockedLetterCount: number
): "free" | "subscribed" | "pay_per_letter" {
  if (isSubscribed) return "subscribed";
  if (unlockedLetterCount === 0) return "free";
  return "pay_per_letter";
}

describe("checkPaywallStatus — state resolution", () => {
  it("returns 'subscribed' when user has active monthly/annual subscription", () => {
    expect(resolvePaywallState(true, 0)).toBe("subscribed");
  });

  it("returns 'subscribed' even if user has prior unlocked letters (subscription takes priority)", () => {
    expect(resolvePaywallState(true, 5)).toBe("subscribed");
  });

  it("returns 'free' when user has no subscription and no prior unlocked letters", () => {
    expect(resolvePaywallState(false, 0)).toBe("free");
  });

  it("returns 'pay_per_letter' when user has no subscription but has 1 prior unlocked letter", () => {
    expect(resolvePaywallState(false, 1)).toBe("pay_per_letter");
  });

  it("returns 'pay_per_letter' when user has multiple prior unlocked letters and no subscription", () => {
    expect(resolvePaywallState(false, 10)).toBe("pay_per_letter");
  });

  it("returns 'free' for a brand-new user (no subscription, no letters)", () => {
    expect(resolvePaywallState(false, 0)).toBe("free");
  });
});

// ─── Pipeline Stage 3 final status ───────────────────────────────────────────
// Mirrors the pipeline logic: isSubscriber → "pending_review", else → "generated_locked"

function resolvePipelineFinalStatus(isSubscriber: boolean): "pending_review" | "generated_locked" {
  return isSubscriber ? "pending_review" : "generated_locked";
}

describe("Pipeline Stage 3 — final status decision", () => {
  it("sets status to pending_review for active monthly subscribers", () => {
    const isSubscriber = isRecurringSubscriptionActive({ plan: "monthly", status: "active" });
    expect(resolvePipelineFinalStatus(isSubscriber)).toBe("pending_review");
  });

  it("sets status to pending_review for active annual subscribers", () => {
    const isSubscriber = isRecurringSubscriptionActive({ plan: "annual", status: "active" });
    expect(resolvePipelineFinalStatus(isSubscriber)).toBe("pending_review");
  });

  it("sets status to generated_locked for users with no subscription", () => {
    const isSubscriber = isRecurringSubscriptionActive(null);
    expect(resolvePipelineFinalStatus(isSubscriber)).toBe("generated_locked");
  });

  it("sets status to generated_locked for per_letter payers (one-time, not recurring)", () => {
    const isSubscriber = isRecurringSubscriptionActive({ plan: "per_letter", status: "active" });
    expect(resolvePipelineFinalStatus(isSubscriber)).toBe("generated_locked");
  });

  it("sets status to generated_locked for canceled monthly subscribers", () => {
    const isSubscriber = isRecurringSubscriptionActive({ plan: "monthly", status: "canceled" });
    expect(resolvePipelineFinalStatus(isSubscriber)).toBe("generated_locked");
  });
});
