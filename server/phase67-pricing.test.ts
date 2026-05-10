/**
 * Pricing Model Tests
 * Verifies the current pricing structure:
 *  - monthly:       $299/month (4 letters, attorney review included)
 *  - yearly:        $2,400/year (8 letters, attorney review included)
 *
 * Legacy plan IDs (per_letter, monthly_basic, monthly_pro, starter, professional,
 * free_trial, free_trial_review, annual) are supported via LEGACY_PLAN_ALIASES.
 */

import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_LIST,
  getPlanConfig,
  MONTHLY_PRICE_CENTS,
  YEARLY_PRICE_CENTS,
  LEGACY_PLAN_ALIASES,
} from "./stripe-products";

describe("Pricing constants", () => {
  it("MONTHLY_PRICE_CENTS is $299 (29900 cents)", () => {
    expect(MONTHLY_PRICE_CENTS).toBe(29900);
  });

  it("YEARLY_PRICE_CENTS is $2,400 (240000 cents)", () => {
    expect(YEARLY_PRICE_CENTS).toBe(240000);
  });
});

describe("PLANS configuration", () => {
  it("has exactly 2 plans", () => {
    expect(Object.keys(PLANS)).toHaveLength(2);
    expect(Object.keys(PLANS)).toEqual(
      expect.arrayContaining(["monthly", "yearly"])
    );
  });

  describe("monthly plan", () => {
    const plan = PLANS.monthly;

    it("exists", () => expect(plan).toBeDefined());
    it("is $299/month (29900 cents)", () => expect(plan.price).toBe(29900));
    it("is monthly interval", () => expect(plan.interval).toBe("month"));
    it("allows 4 letters per month", () => expect(plan.lettersAllowed).toBe(4));
    it("has Most Popular badge", () => expect(plan.badge).toBe("Most Popular"));
  });

  describe("yearly plan", () => {
    const plan = PLANS.yearly;

    it("exists", () => expect(plan).toBeDefined());
    it("is $2,400/year (240000 cents)", () => expect(plan.price).toBe(240000));
    it("is yearly interval", () => expect(plan.interval).toBe("year"));
    it("allows 8 letters per year", () => expect(plan.lettersAllowed).toBe(8));
    it("has Best Value badge", () => expect(plan.badge).toBe("Best Value"));
  });
});

describe("getPlanConfig", () => {
  it("returns correct plan for monthly", () => {
    const plan = getPlanConfig("monthly");
    expect(plan?.price).toBe(29900);
    expect(plan?.lettersAllowed).toBe(4);
  });

  it("returns correct plan for yearly", () => {
    const plan = getPlanConfig("yearly");
    expect(plan?.price).toBe(240000);
    expect(plan?.lettersAllowed).toBe(8);
  });

  it("resolves legacy plan IDs via aliases", () => {
    const perLetter = getPlanConfig("per_letter");
    expect(perLetter?.id).toBe("monthly");
    expect(perLetter?.price).toBe(29900);

    const monthlyBasic = getPlanConfig("monthly_basic");
    expect(monthlyBasic?.id).toBe("monthly");
    expect(monthlyBasic?.price).toBe(29900);

    const monthlyPro = getPlanConfig("monthly_pro");
    expect(monthlyPro?.id).toBe("monthly");

    const starter = getPlanConfig("starter");
    expect(starter?.id).toBe("monthly");

    const professional = getPlanConfig("professional");
    expect(professional?.id).toBe("monthly");

    const freeTrial = getPlanConfig("free_trial");
    expect(freeTrial?.id).toBe("monthly");

    const trialReview = getPlanConfig("free_trial_review");
    expect(trialReview?.id).toBe("monthly");

    const annual = getPlanConfig("annual");
    expect(annual?.id).toBe("yearly");
  });

  it("returns undefined for truly unknown plan", () => {
    expect(getPlanConfig("invalid_plan")).toBeUndefined();
    expect(getPlanConfig("unknown_xyz")).toBeUndefined();
  });
});

describe("PLAN_LIST", () => {
  it("has 2 plans", () => expect(PLAN_LIST).toHaveLength(2));

  it("includes all 2 plan IDs", () => {
    const ids = PLAN_LIST.map((p) => p.id);
    expect(ids).toContain("monthly");
    expect(ids).toContain("yearly");
  });
});

describe("LEGACY_PLAN_ALIASES", () => {
  it("maps per_letter to monthly", () => {
    expect(LEGACY_PLAN_ALIASES.per_letter).toBe("monthly");
  });

  it("maps monthly_basic to monthly", () => {
    expect(LEGACY_PLAN_ALIASES.monthly_basic).toBe("monthly");
  });

  it("maps monthly_pro to monthly", () => {
    expect(LEGACY_PLAN_ALIASES.monthly_pro).toBe("monthly");
  });

  it("maps starter to monthly", () => {
    expect(LEGACY_PLAN_ALIASES.starter).toBe("monthly");
  });

  it("maps professional to monthly", () => {
    expect(LEGACY_PLAN_ALIASES.professional).toBe("monthly");
  });

  it("maps free_trial to monthly", () => {
    expect(LEGACY_PLAN_ALIASES.free_trial).toBe("monthly");
  });

  it("maps free_trial_review to monthly", () => {
    expect(LEGACY_PLAN_ALIASES.free_trial_review).toBe("monthly");
  });

  it("maps annual to yearly", () => {
    expect(LEGACY_PLAN_ALIASES.annual).toBe("yearly");
  });
});

describe("Subscription plan recurring check", () => {
  it("monthly and yearly are recurring", () => {
    expect(PLANS.monthly.interval).toBe("month");
    expect(PLANS.yearly.interval).toBe("year");
  });
});

describe("Email template pricing copy", () => {
  it("sendLetterReadyEmail is exported from email.ts", async () => {
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
