import { describe, it, expect } from "vitest";
import { isValidTransition } from "../shared/types";
import { LETTER_UNLOCK_PRICE_CENTS, PLANS, canSubmitLetter } from "./stripe-products";

// ============================================================================
// Phase 26: Pricing — $200 per letter unlock
// ============================================================================
describe("Letter unlock pricing", () => {
  it("LETTER_UNLOCK_PRICE_CENTS is $200 (20000 cents)", () => {
    expect(LETTER_UNLOCK_PRICE_CENTS).toBe(20000);
  });

  it("per_letter plan price matches LETTER_UNLOCK_PRICE_CENTS", () => {
    expect(PLANS.per_letter.price).toBe(LETTER_UNLOCK_PRICE_CENTS);
  });

  it("per_letter plan allows exactly 1 letter", () => {
    expect(PLANS.per_letter.lettersAllowed).toBe(1);
  });

  it("per_letter plan is one_time interval", () => {
    expect(PLANS.per_letter.interval).toBe("one_time");
  });

  it("monthly_basic plan is $499/month with 4 letters", () => {
    expect(PLANS.monthly_basic.price).toBe(49900);
    expect(PLANS.monthly_basic.lettersAllowed).toBe(4);
    expect(PLANS.monthly_basic.interval).toBe("month");
  });
  it("monthly_pro plan is $699/month with 8 letters", () => {
    expect(PLANS.monthly_pro.price).toBe(69900);
    expect(PLANS.monthly_pro.lettersAllowed).toBe(8);
    expect(PLANS.monthly_pro.interval).toBe("month");
  });
});

// ============================================================================
// Phase 26: Status transitions for free unlock flow
// ============================================================================
describe("Free unlock: generated_locked → pending_review", () => {
  it("generated_locked → pending_review is a valid transition", () => {
    expect(isValidTransition("generated_locked", "pending_review")).toBe(true);
  });

  it("pending_review → under_review is valid (attorney picks it up)", () => {
    expect(isValidTransition("pending_review", "under_review")).toBe(true);
  });

  it("generated_locked → approved is NOT valid (must go through review)", () => {
    expect(isValidTransition("generated_locked", "approved")).toBe(false);
  });

  it("generated_locked → under_review is NOT valid (must go through pending_review first)", () => {
    expect(isValidTransition("generated_locked", "under_review")).toBe(false);
  });
});

// ============================================================================
// Phase 26: Plan configuration integrity
// ============================================================================
describe("Plan configuration integrity", () => {
  it("all plans have required fields", () => {
    for (const [key, plan] of Object.entries(PLANS)) {
      expect(plan.id).toBe(key);
      expect(plan.name).toBeTruthy();
      expect(plan.description).toBeTruthy();
      // free_trial is $0; all other plans must have a positive price
      expect(plan.price).toBeGreaterThanOrEqual(0);
      if (plan.id !== "free_trial") {
        expect(plan.price).toBeGreaterThan(0);
      }
      expect(plan.features.length).toBeGreaterThan(0);
      expect(["one_time", "month", "year"]).toContain(plan.interval);
    }
  });

  it("all plans include attorney review in features", () => {
    for (const plan of Object.values(PLANS)) {
      const hasAttorneyReview = plan.features.some(
        (f) => f.toLowerCase().includes("attorney review")
      );
      expect(hasAttorneyReview).toBe(true);
    }
  });
});

// ============================================================================
// Phase 26: canSubmitLetter logic
// ============================================================================
describe("canSubmitLetter", () => {

  it("returns allowed:false if subscription is not active", () => {
    const result = canSubmitLetter("per_letter", 1, 0, "canceled");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("subscription");
  });

  it("returns allowed:true when letters used < allowed (starter)", () => {
    const result = canSubmitLetter("starter", 4, 2, "active");
    expect(result.allowed).toBe(true);
  });

  it("returns allowed:false when letters used >= allowed", () => {
    const result = canSubmitLetter("per_letter", 1, 1, "active");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("used all");
  });

  it("returns allowed:true when letters used < allowed (professional)", () => {
    const result = canSubmitLetter("professional", 8, 3, "active");
    expect(result.allowed).toBe(true);
  });
});
