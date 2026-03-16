/**
 * Pricing Model Tests
 * Verifies the current pricing structure:
 *  - free_trial:    $0 (first letter completely free — research + draft + attorney review)
 *  - per_letter:    $200 one-time (pay-per-letter)
 *  - monthly_basic: $499/month (4 letters, attorney review included)
 *  - monthly_pro:   $699/month (8 letters, attorney review included)
 *
 * Legacy plan IDs (starter, professional, free_trial_review, monthly, annual)
 * are supported via LEGACY_PLAN_ALIASES for backward compatibility.
 */

import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_LIST,
  getPlanConfig,
  LETTER_UNLOCK_PRICE_CENTS,
  MONTHLY_BASIC_PRICE_CENTS,
  MONTHLY_PRO_PRICE_CENTS,
  LEGACY_PLAN_ALIASES,
} from "./stripe-products";

describe("Pricing constants", () => {
  it("LETTER_UNLOCK_PRICE_CENTS is $200 (20000 cents)", () => {
    expect(LETTER_UNLOCK_PRICE_CENTS).toBe(20000);
  });

  it("MONTHLY_BASIC_PRICE_CENTS is $499 (49900 cents)", () => {
    expect(MONTHLY_BASIC_PRICE_CENTS).toBe(49900);
  });

  it("MONTHLY_PRO_PRICE_CENTS is $699 (69900 cents)", () => {
    expect(MONTHLY_PRO_PRICE_CENTS).toBe(69900);
  });
});

describe("PLANS configuration", () => {
  it("has exactly 4 plans", () => {
    expect(Object.keys(PLANS)).toHaveLength(4);
    expect(Object.keys(PLANS)).toEqual(
      expect.arrayContaining(["free_trial", "per_letter", "monthly_basic", "monthly_pro"])
    );
  });

  describe("free_trial plan", () => {
    const plan = PLANS.free_trial;

    it("exists", () => expect(plan).toBeDefined());
    it("is $0 (free)", () => expect(plan.price).toBe(0));
    it("is one_time interval", () => expect(plan.interval).toBe("one_time"));
    it("is marked as trial", () => expect(plan.isTrial).toBe(true));
    it("allows 1 letter", () => expect(plan.lettersAllowed).toBe(1));
  });

  describe("per_letter plan", () => {
    const plan = PLANS.per_letter;

    it("exists", () => expect(plan).toBeDefined());
    it("is $200 (20000 cents)", () => expect(plan.price).toBe(20000));
    it("is one_time interval", () => expect(plan.interval).toBe("one_time"));
    it("allows 1 letter", () => expect(plan.lettersAllowed).toBe(1));
    it("is not a trial", () => expect(plan.isTrial).toBeFalsy());
  });

  describe("monthly_basic plan", () => {
    const plan = PLANS.monthly_basic;

    it("exists", () => expect(plan).toBeDefined());
    it("is $499/month (49900 cents)", () => expect(plan.price).toBe(49900));
    it("is monthly interval", () => expect(plan.interval).toBe("month"));
    it("allows 4 letters per month", () => expect(plan.lettersAllowed).toBe(4));
    it("has Most Popular badge", () => expect(plan.badge).toBe("Most Popular"));
  });

  describe("monthly_pro plan", () => {
    const plan = PLANS.monthly_pro;

    it("exists", () => expect(plan).toBeDefined());
    it("is $699/month (69900 cents)", () => expect(plan.price).toBe(69900));
    it("is monthly interval", () => expect(plan.interval).toBe("month"));
    it("allows 8 letters per month", () => expect(plan.lettersAllowed).toBe(8));
    it("has Best Value badge", () => expect(plan.badge).toBe("Best Value"));
  });
});

describe("getPlanConfig", () => {
  it("returns correct plan for free_trial", () => {
    const plan = getPlanConfig("free_trial");
    expect(plan?.price).toBe(0);
    expect(plan?.isTrial).toBe(true);
  });

  it("returns correct plan for per_letter", () => {
    const plan = getPlanConfig("per_letter");
    expect(plan?.price).toBe(20000);
    expect(plan?.lettersAllowed).toBe(1);
  });

  it("returns correct plan for monthly_basic", () => {
    const plan = getPlanConfig("monthly_basic");
    expect(plan?.price).toBe(49900);
    expect(plan?.lettersAllowed).toBe(4);
  });

  it("returns correct plan for monthly_pro", () => {
    const plan = getPlanConfig("monthly_pro");
    expect(plan?.price).toBe(69900);
    expect(plan?.lettersAllowed).toBe(8);
  });

  it("resolves legacy plan IDs via aliases", () => {
    // Legacy starter → monthly_basic
    const starter = getPlanConfig("starter");
    expect(starter?.id).toBe("monthly_basic");
    expect(starter?.price).toBe(49900);

    // Legacy professional → monthly_pro
    const professional = getPlanConfig("professional");
    expect(professional?.id).toBe("monthly_pro");
    expect(professional?.price).toBe(69900);

    // Legacy free_trial_review → free_trial
    const trialReview = getPlanConfig("free_trial_review");
    expect(trialReview?.id).toBe("free_trial");
    expect(trialReview?.isTrial).toBe(true);

    // Legacy monthly → monthly_basic
    const monthly = getPlanConfig("monthly");
    expect(monthly?.id).toBe("monthly_basic");

    // Legacy annual → monthly_pro
    const annual = getPlanConfig("annual");
    expect(annual?.id).toBe("monthly_pro");
  });

  it("returns undefined for truly unknown plan", () => {
    expect(getPlanConfig("invalid_plan")).toBeUndefined();
    expect(getPlanConfig("unknown_xyz")).toBeUndefined();
  });
});

describe("PLAN_LIST", () => {
  it("has 4 plans", () => expect(PLAN_LIST).toHaveLength(4));

  it("plans are sorted by price ascending", () => {
    const prices = PLAN_LIST.map((p) => p.price);
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });
});

describe("LEGACY_PLAN_ALIASES", () => {
  it("maps starter to monthly_basic", () => {
    expect(LEGACY_PLAN_ALIASES.starter).toBe("monthly_basic");
  });

  it("maps professional to monthly_pro", () => {
    expect(LEGACY_PLAN_ALIASES.professional).toBe("monthly_pro");
  });

  it("maps free_trial_review to free_trial", () => {
    expect(LEGACY_PLAN_ALIASES.free_trial_review).toBe("free_trial");
  });
});

describe("Subscription plan recurring check", () => {
  it("monthly_basic and monthly_pro are recurring (monthly)", () => {
    expect(PLANS.monthly_basic.interval).toBe("month");
    expect(PLANS.monthly_pro.interval).toBe("month");
  });

  it("free_trial and per_letter are one-time payments", () => {
    expect(PLANS.free_trial.interval).toBe("one_time");
    expect(PLANS.per_letter.interval).toBe("one_time");
  });
});

describe("Email template pricing copy", () => {
  it("sendLetterReadyEmail is exported from email.ts (Draft Ready — $200 CTA)", async () => {
    const { sendLetterReadyEmail } = await import("./email");
    expect(typeof sendLetterReadyEmail).toBe("function");
  });

  it("sendEmployeeWelcomeEmail is exported from email.ts", async () => {
    const { sendEmployeeWelcomeEmail } = await import("./email");
    expect(typeof sendEmployeeWelcomeEmail).toBe("function");
  });

  it("sendAttorneyWelcomeEmail is exported from email.ts", async () => {
    const { sendAttorneyWelcomeEmail } = await import("./email");
    expect(typeof sendAttorneyWelcomeEmail).toBe("function");
  });
});
