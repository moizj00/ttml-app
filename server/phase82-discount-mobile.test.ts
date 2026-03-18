/**
 * Phase 82 — Discount Code UI, Pricing Page, Stripe Coupon Integration,
 * First-Letter-Free Flow, and Mobile Responsiveness Tests
 *
 * Tests cover:
 * 1. resolveStripeCoupon decision logic (inline mirror)
 * 2. Discount price calculation logic (Pricing page)
 * 3. checkPaywallStatus three-state logic (free / subscribed / pay_per_letter)
 * 4. freeUnlock eligibility logic
 * 5. Checkout session discount/coupon parameter logic
 * 6. Pricing page PLANS data integrity
 * 7. DiscountCodeInput validation logic
 * 8. LetterPaywall state rendering logic
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRICING, ALL_PLANS, PAID_PLANS, AFFILIATE_DISCOUNT_PERCENT } from "../shared/pricing";
import { PLANS, getPlanConfig, PLAN_LIST, LEGACY_PLAN_ALIASES } from "./stripe-products";

// ─── 1. resolveStripeCoupon decision logic (mirrors server/stripe.ts) ────────
interface DiscountCode {
  id: number;
  code: string;
  discountPercent: number;
  isActive: boolean;
  maxUses: number | null;
  usageCount: number;
  expiresAt: Date | null;
}

function shouldApplyCoupon(code: DiscountCode | null): boolean {
  if (!code || !code.isActive) return false;
  if (code.maxUses && code.usageCount >= code.maxUses) return false;
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) return false;
  return true;
}

function getCouponId(discountPercent: number): string {
  return `ttml_${discountPercent}pct`;
}

describe("resolveStripeCoupon — decision logic", () => {
  it("returns false for null code", () => {
    expect(shouldApplyCoupon(null)).toBe(false);
  });

  it("returns false for inactive code", () => {
    expect(shouldApplyCoupon({
      id: 1, code: "TEST", discountPercent: 20, isActive: false,
      maxUses: null, usageCount: 0, expiresAt: null,
    })).toBe(false);
  });

  it("returns false when max uses reached", () => {
    expect(shouldApplyCoupon({
      id: 1, code: "TEST", discountPercent: 20, isActive: true,
      maxUses: 10, usageCount: 10, expiresAt: null,
    })).toBe(false);
  });

  it("returns false when expired", () => {
    expect(shouldApplyCoupon({
      id: 1, code: "TEST", discountPercent: 20, isActive: true,
      maxUses: null, usageCount: 0, expiresAt: new Date("2020-01-01"),
    })).toBe(false);
  });

  it("returns true for valid active code", () => {
    expect(shouldApplyCoupon({
      id: 1, code: "TEST", discountPercent: 20, isActive: true,
      maxUses: null, usageCount: 0, expiresAt: null,
    })).toBe(true);
  });

  it("returns true when usage is below max", () => {
    expect(shouldApplyCoupon({
      id: 1, code: "TEST", discountPercent: 20, isActive: true,
      maxUses: 100, usageCount: 50, expiresAt: null,
    })).toBe(true);
  });

  it("returns true when expiry is in the future", () => {
    expect(shouldApplyCoupon({
      id: 1, code: "TEST", discountPercent: 20, isActive: true,
      maxUses: null, usageCount: 0, expiresAt: new Date("2030-12-31"),
    })).toBe(true);
  });

  it("generates deterministic coupon ID from discount percent", () => {
    expect(getCouponId(20)).toBe("ttml_20pct");
    expect(getCouponId(15)).toBe("ttml_15pct");
    expect(getCouponId(50)).toBe("ttml_50pct");
  });
});

// ─── 2. Discount price calculation logic (mirrors Pricing page) ──────────────
function getDiscountedPrice(priceNumeric: number, discountPercent: number): number | null {
  if (priceNumeric === 0) return null;
  return Math.round(priceNumeric * (1 - discountPercent / 100));
}

describe("Discount price calculation", () => {
  it("returns null for free plan (price 0)", () => {
    expect(getDiscountedPrice(0, 20)).toBeNull();
  });

  it("calculates 20% off $200 = $160", () => {
    expect(getDiscountedPrice(200, 20)).toBe(160);
  });

  it("calculates 20% off $499 = $399", () => {
    expect(getDiscountedPrice(499, 20)).toBe(399);
  });

  it("calculates 20% off $699 = $559", () => {
    expect(getDiscountedPrice(699, 20)).toBe(559);
  });

  it("calculates 50% off $200 = $100", () => {
    expect(getDiscountedPrice(200, 50)).toBe(100);
  });

  it("calculates 100% off = $0", () => {
    expect(getDiscountedPrice(200, 100)).toBe(0);
  });

  it("handles fractional results by rounding", () => {
    // 15% off $499 = $424.15 → rounds to $424
    expect(getDiscountedPrice(499, 15)).toBe(424);
  });
});

// ─── 3. checkPaywallStatus three-state logic ─────────────────────────────────
function isRecurringSubscriptionActive(sub: { plan: string; status: string } | null): boolean {
  if (!sub) return false;
  if (sub.status !== "active") return false;
  return sub.plan === "monthly" || sub.plan === "annual";
}

type PaywallState = "free" | "subscribed" | "pay_per_letter";

function determinePaywallState(
  subscription: { plan: string; status: string } | null,
  unlockedLetterCount: number
): { state: PaywallState; eligible: boolean } {
  if (isRecurringSubscriptionActive(subscription)) {
    return { state: "subscribed", eligible: false };
  }
  if (unlockedLetterCount === 0) {
    return { state: "free", eligible: true };
  }
  return { state: "pay_per_letter", eligible: false };
}

describe("checkPaywallStatus — three-state logic", () => {
  it("returns 'subscribed' for active monthly subscription", () => {
    const result = determinePaywallState({ plan: "monthly", status: "active" }, 0);
    expect(result.state).toBe("subscribed");
    expect(result.eligible).toBe(false);
  });

  it("returns 'subscribed' for active annual subscription", () => {
    const result = determinePaywallState({ plan: "annual", status: "active" }, 0);
    expect(result.state).toBe("subscribed");
    expect(result.eligible).toBe(false);
  });

  it("returns 'free' for new user with no unlocked letters and no subscription", () => {
    const result = determinePaywallState(null, 0);
    expect(result.state).toBe("free");
    expect(result.eligible).toBe(true);
  });

  it("returns 'free' for user with per_letter subscription but no unlocked letters", () => {
    const result = determinePaywallState({ plan: "per_letter", status: "active" }, 0);
    expect(result.state).toBe("free");
    expect(result.eligible).toBe(true);
  });

  it("returns 'pay_per_letter' for user with unlocked letters but no subscription", () => {
    const result = determinePaywallState(null, 3);
    expect(result.state).toBe("pay_per_letter");
    expect(result.eligible).toBe(false);
  });

  it("returns 'pay_per_letter' for user with canceled subscription and unlocked letters", () => {
    const result = determinePaywallState({ plan: "monthly", status: "canceled" }, 1);
    expect(result.state).toBe("pay_per_letter");
    expect(result.eligible).toBe(false);
  });
});

// ─── 4. freeUnlock eligibility logic ─────────────────────────────────────────
function canFreeUnlock(letterStatus: string, paidLetterCount: number): { allowed: boolean; reason?: string } {
  if (letterStatus !== "generated_locked") {
    return { allowed: false, reason: "Letter is not in generated_locked status" };
  }
  if (paidLetterCount > 0) {
    return { allowed: false, reason: "Free first letter has already been used." };
  }
  return { allowed: true };
}

describe("freeUnlock eligibility", () => {
  it("allows free unlock for first letter in generated_locked status", () => {
    expect(canFreeUnlock("generated_locked", 0)).toEqual({ allowed: true });
  });

  it("rejects if letter is not generated_locked", () => {
    expect(canFreeUnlock("pending_review", 0).allowed).toBe(false);
    expect(canFreeUnlock("approved", 0).allowed).toBe(false);
    expect(canFreeUnlock("submitted", 0).allowed).toBe(false);
  });

  it("rejects if user already has paid/unlocked letters", () => {
    expect(canFreeUnlock("generated_locked", 1).allowed).toBe(false);
    expect(canFreeUnlock("generated_locked", 5).allowed).toBe(false);
  });
});

// ─── 5. Checkout session discount/coupon parameter logic ─────────────────────
interface CheckoutParams {
  discountCode?: string;
  stripeCouponId: string | null;
}

function buildDiscountParams(params: CheckoutParams) {
  if (params.stripeCouponId) {
    return { discounts: [{ coupon: params.stripeCouponId }] };
  }
  return { allow_promotion_codes: true };
}

describe("Checkout session discount parameter logic", () => {
  it("uses coupon discount when stripeCouponId is provided", () => {
    const result = buildDiscountParams({ discountCode: "JOHN-ABC123", stripeCouponId: "ttml_20pct" });
    expect(result).toEqual({ discounts: [{ coupon: "ttml_20pct" }] });
    expect((result as any).allow_promotion_codes).toBeUndefined();
  });

  it("falls back to allow_promotion_codes when no coupon", () => {
    const result = buildDiscountParams({ stripeCouponId: null });
    expect(result).toEqual({ allow_promotion_codes: true });
    expect((result as any).discounts).toBeUndefined();
  });

  it("uses allow_promotion_codes when discount code is invalid (null coupon)", () => {
    const result = buildDiscountParams({ discountCode: "INVALID", stripeCouponId: null });
    expect(result).toEqual({ allow_promotion_codes: true });
  });
});

// ─── 6. Pricing page PLANS data integrity ────────────────────────────────────
describe("Pricing page PLANS data integrity", () => {
  it("PRICING has all three plans", () => {
    expect(PRICING.singleLetter).toBeDefined();
    expect(PRICING.monthly).toBeDefined();
    expect(PRICING.yearly).toBeDefined();
  });

  it("ALL_PLANS has 3 entries in order", () => {
    expect(ALL_PLANS).toHaveLength(3);
    expect(ALL_PLANS[0].id).toBe("single_letter");
    expect(ALL_PLANS[1].id).toBe("monthly");
    expect(ALL_PLANS[2].id).toBe("yearly");
  });

  it("PAID_PLANS has 3 entries, all paid", () => {
    expect(PAID_PLANS).toHaveLength(3);
    expect(PAID_PLANS.every((p) => p.price > 0)).toBe(true);
  });

  it("AFFILIATE_DISCOUNT_PERCENT is 20", () => {
    expect(AFFILIATE_DISCOUNT_PERCENT).toBe(20);
  });

  it("single letter price is $200", () => {
    expect(PRICING.singleLetter.price).toBe(200);
    expect(PRICING.singleLetter.priceDisplay).toBe("$200");
  });

  it("monthly price is $200", () => {
    expect(PRICING.monthly.price).toBe(200);
    expect(PRICING.monthly.priceDisplay).toBe("$200");
  });

  it("yearly price is $2,000", () => {
    expect(PRICING.yearly.price).toBe(2000);
    expect(PRICING.yearly.priceDisplay).toBe("$2,000");
  });

  it("all plans have features array", () => {
    ALL_PLANS.forEach((plan) => {
      expect(Array.isArray(plan.features)).toBe(true);
      expect(plan.features.length).toBeGreaterThan(0);
    });
  });

  it("all plans have description", () => {
    ALL_PLANS.forEach((plan) => {
      expect(typeof plan.description).toBe("string");
      expect(plan.description.length).toBeGreaterThan(10);
    });
  });
});

// ─── 7. DiscountCodeInput validation logic ───────────────────────────────────
function validateDiscountCodeFormat(code: string): { valid: boolean; reason?: string } {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { valid: false, reason: "Code is required" };
  if (trimmed.length < 3) return { valid: false, reason: "Code too short" };
  if (trimmed.length > 30) return { valid: false, reason: "Code too long" };
  // Codes should be alphanumeric with hyphens
  if (!/^[A-Z0-9-]+$/.test(trimmed)) return { valid: false, reason: "Invalid characters" };
  return { valid: true };
}

describe("DiscountCodeInput — format validation", () => {
  it("rejects empty string", () => {
    expect(validateDiscountCodeFormat("").valid).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(validateDiscountCodeFormat("   ").valid).toBe(false);
  });

  it("rejects code shorter than 3 chars", () => {
    expect(validateDiscountCodeFormat("AB").valid).toBe(false);
  });

  it("accepts valid code format", () => {
    expect(validateDiscountCodeFormat("JOHN-A1B2C3").valid).toBe(true);
  });

  it("accepts simple alphanumeric code", () => {
    expect(validateDiscountCodeFormat("SAVE20").valid).toBe(true);
  });

  it("normalizes to uppercase", () => {
    const code = "john-a1b2c3";
    expect(validateDiscountCodeFormat(code).valid).toBe(true);
  });

  it("rejects codes with special characters", () => {
    expect(validateDiscountCodeFormat("CODE@123").valid).toBe(false);
    expect(validateDiscountCodeFormat("CODE 123").valid).toBe(false);
  });
});

// ─── 8. LetterPaywall state rendering logic ──────────────────────────────────
type PaywallUIState = "free_unlock" | "pay_per_letter" | "subscribed_auto";

function determinePaywallUI(
  paywallState: PaywallState,
  eligible: boolean
): PaywallUIState {
  if (paywallState === "free" && eligible) return "free_unlock";
  if (paywallState === "subscribed") return "subscribed_auto";
  return "pay_per_letter";
}

describe("LetterPaywall — UI state determination", () => {
  it("shows free_unlock for eligible first-letter users", () => {
    expect(determinePaywallUI("free", true)).toBe("free_unlock");
  });

  it("shows pay_per_letter for users who used their free letter", () => {
    expect(determinePaywallUI("pay_per_letter", false)).toBe("pay_per_letter");
  });

  it("shows subscribed_auto for subscribed users", () => {
    expect(determinePaywallUI("subscribed", false)).toBe("subscribed_auto");
  });

  it("shows pay_per_letter when free state but not eligible (edge case)", () => {
    expect(determinePaywallUI("free", false)).toBe("pay_per_letter");
  });
});

// ─── 9. Stripe products config integrity ─────────────────────────────────────
describe("Stripe products config (stripe-products.ts)", () => {
  it("has all 3 plans", () => {
    expect(PLANS.single_letter).toBeDefined();
    expect(PLANS.monthly).toBeDefined();
    expect(PLANS.yearly).toBeDefined();
  });

  it("single_letter is $200 (20000 cents)", () => {
    expect(PLANS.single_letter.price).toBe(20000);
    expect(PLANS.single_letter.interval).toBe("one_time");
    expect(PLANS.single_letter.lettersAllowed).toBe(1);
  });

  it("monthly is $200/month (20000 cents)", () => {
    expect(PLANS.monthly.price).toBe(20000);
    expect(PLANS.monthly.interval).toBe("month");
    expect(PLANS.monthly.lettersAllowed).toBe(4);
  });

  it("yearly is $2,000/year (200000 cents)", () => {
    expect(PLANS.yearly.price).toBe(200000);
    expect(PLANS.yearly.interval).toBe("year");
    expect(PLANS.yearly.lettersAllowed).toBe(4);
  });

  it("getPlanConfig resolves valid plan IDs", () => {
    expect(getPlanConfig("single_letter")?.price).toBe(20000);
    expect(getPlanConfig("monthly")?.lettersAllowed).toBe(4);
    expect(getPlanConfig("yearly")?.lettersAllowed).toBe(4);
  });

  it("getPlanConfig resolves legacy aliases", () => {
    expect(getPlanConfig("starter")?.id).toBe("monthly");
    expect(getPlanConfig("professional")?.id).toBe("monthly");
    expect(getPlanConfig("per_letter")?.id).toBe("single_letter");
    expect(getPlanConfig("annual")?.id).toBe("yearly");
  });

  it("getPlanConfig returns undefined for unknown plan", () => {
    expect(getPlanConfig("nonexistent")).toBeUndefined();
  });

  it("PLAN_LIST has 3 plans", () => {
    expect(PLAN_LIST).toHaveLength(3);
    const ids = PLAN_LIST.map((p) => p.id);
    expect(ids).toContain("single_letter");
    expect(ids).toContain("monthly");
    expect(ids).toContain("yearly");
  });
});

// ─── 10. Discount code + checkout metadata logic ─────────────────────────────
describe("Checkout metadata with discount codes", () => {
  function buildMetadata(params: {
    userId: number;
    planId: string;
    email: string;
    name?: string;
    discountCode?: string;
  }) {
    return {
      user_id: params.userId.toString(),
      plan_id: params.planId,
      customer_email: params.email,
      customer_name: params.name ?? "",
      ...(params.discountCode ? { discount_code: params.discountCode } : {}),
    };
  }

  it("includes discount_code in metadata when provided", () => {
    const meta = buildMetadata({
      userId: 1, planId: "per_letter", email: "test@example.com",
      discountCode: "JOHN-ABC123",
    });
    expect(meta.discount_code).toBe("JOHN-ABC123");
  });

  it("omits discount_code from metadata when not provided", () => {
    const meta = buildMetadata({
      userId: 1, planId: "per_letter", email: "test@example.com",
    });
    expect(meta).not.toHaveProperty("discount_code");
  });

  it("always includes user_id and plan_id", () => {
    const meta = buildMetadata({
      userId: 42, planId: "monthly_basic", email: "user@test.com",
    });
    expect(meta.user_id).toBe("42");
    expect(meta.plan_id).toBe("monthly_basic");
    expect(meta.customer_email).toBe("user@test.com");
  });
});

// ─── 11. URL parameter discount code extraction logic ────────────────────────
describe("URL parameter discount code extraction", () => {
  function extractCodeFromSearch(search: string): string | null {
    const params = new URLSearchParams(search);
    return params.get("code") || params.get("discount") || null;
  }

  it("extracts code from ?code=SAVE20", () => {
    expect(extractCodeFromSearch("?code=SAVE20")).toBe("SAVE20");
  });

  it("extracts code from ?discount=JOHN-ABC", () => {
    expect(extractCodeFromSearch("?discount=JOHN-ABC")).toBe("JOHN-ABC");
  });

  it("returns null when no code param", () => {
    expect(extractCodeFromSearch("?plan=monthly")).toBeNull();
  });

  it("returns null for empty search", () => {
    expect(extractCodeFromSearch("")).toBeNull();
  });

  it("prefers code over discount param", () => {
    expect(extractCodeFromSearch("?code=A&discount=B")).toBe("A");
  });
});
