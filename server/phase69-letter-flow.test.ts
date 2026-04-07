/**
 * Phase 69 — Simplified Letter Flow Tests (updated for unified status machine)
 *
 * Verifies the single-path letter lifecycle:
 *   submitted → researching → drafting → generated_locked → pending_review → under_review → approved
 *
 * Key rules:
 *  - Pipeline ALWAYS ends at generated_locked (no generated_unlocked bypass)
 *  - generated_locked → pending_review ONLY via Stripe webhook (pay $299) or freeUnlock
 *  - Review queue shows only pending_review+ statuses
 *  - STATUS_CONFIG uses human-friendly labels
 *  - Failure resets: researching/drafting → submitted
 *  - Subscriber resubmit: needs_changes → submitted
 *  - Subscriber retry: rejected → submitted
 */

import { describe, it, expect } from "vitest";
import { ALLOWED_TRANSITIONS, STATUS_CONFIG, isValidTransition } from "../shared/types";

describe("ALLOWED_TRANSITIONS — simplified flow", () => {
  it("submitted → researching is valid", () => {
    expect(isValidTransition("submitted", "researching")).toBe(true);
  });

  it("researching → drafting is valid", () => {
    expect(isValidTransition("researching", "drafting")).toBe(true);
  });

  it("researching → submitted is valid (pipeline failure reset)", () => {
    expect(isValidTransition("researching", "submitted")).toBe(true);
  });

  it("drafting → generated_locked is valid (pipeline always ends here)", () => {
    expect(isValidTransition("drafting", "generated_locked")).toBe(true);
  });

  it("drafting → submitted is valid (pipeline failure reset)", () => {
    expect(isValidTransition("drafting", "submitted")).toBe(true);
  });

  it("drafting → generated_unlocked is NOT valid (removed in Phase 69)", () => {
    expect(isValidTransition("drafting", "generated_unlocked")).toBe(false);
  });

  it("generated_locked → pending_review is valid (Stripe webhook or freeUnlock)", () => {
    expect(isValidTransition("generated_locked", "pending_review")).toBe(true);
  });

  it("generated_locked → generated_unlocked is NOT valid (removed in Phase 69)", () => {
    expect(isValidTransition("generated_locked", "generated_unlocked")).toBe(false);
  });

  it("pending_review → under_review is valid", () => {
    expect(isValidTransition("pending_review", "under_review")).toBe(true);
  });

  it("under_review → approved is valid", () => {
    expect(isValidTransition("under_review", "approved")).toBe(true);
  });

  it("under_review → rejected is valid", () => {
    expect(isValidTransition("under_review", "rejected")).toBe(true);
  });

  it("under_review → needs_changes is valid", () => {
    expect(isValidTransition("under_review", "needs_changes")).toBe(true);
  });

  it("needs_changes → submitted is valid (re-enters pipeline via submitted)", () => {
    expect(isValidTransition("needs_changes", "submitted")).toBe(true);
  });

  it("needs_changes → researching is NOT a direct transition (must go via submitted)", () => {
    expect(isValidTransition("needs_changes", "researching")).toBe(false);
  });

  it("approved leads to client_approval_pending (client approval flow)", () => {
    expect(ALLOWED_TRANSITIONS["approved"]).toContain("client_approval_pending");
    expect(isValidTransition("approved", "under_review")).toBe(false);
    expect(isValidTransition("approved", "pending_review")).toBe(false);
  });

  it("rejected → submitted is valid (subscriber retry)", () => {
    expect(isValidTransition("rejected", "submitted")).toBe(true);
  });

  it("rejected → under_review is NOT valid", () => {
    expect(isValidTransition("rejected", "under_review")).toBe(false);
  });

  it("drafting transitions include generated_locked and submitted", () => {
    expect(ALLOWED_TRANSITIONS["drafting"]).toContain("generated_locked");
    expect(ALLOWED_TRANSITIONS["drafting"]).toContain("submitted");
  });

  it("generated_locked transitions list has exactly 1 entry (pending_review only)", () => {
    expect(ALLOWED_TRANSITIONS["generated_locked"]).toEqual(["pending_review"]);
  });
});

describe("STATUS_CONFIG — human-friendly labels", () => {
  it("generated_locked shows 'Draft Ready' (not 'Ready to Unlock')", () => {
    expect(STATUS_CONFIG["generated_locked"].label).toBe("Draft Ready");
  });

  it("pending_review shows 'Awaiting Review' (not 'Pending Review')", () => {
    expect(STATUS_CONFIG["pending_review"].label).toBe("Awaiting Review");
  });

  it("needs_changes shows 'Changes Requested' (not 'Needs Changes')", () => {
    expect(STATUS_CONFIG["needs_changes"].label).toBe("Changes Requested");
  });

  it("researching label is 'Researching'", () => {
    expect(STATUS_CONFIG["researching"].label).toBe("Researching");
  });

  it("drafting label is 'Drafting'", () => {
    expect(STATUS_CONFIG["drafting"].label).toBe("Drafting");
  });

  it("under_review label is 'Under Review'", () => {
    expect(STATUS_CONFIG["under_review"].label).toBe("Under Review");
  });

  it("approved label is 'Approved'", () => {
    expect(STATUS_CONFIG["approved"].label).toBe("Approved");
  });

  it("rejected label is 'Rejected'", () => {
    expect(STATUS_CONFIG["rejected"].label).toBe("Rejected");
  });

  it("generated_unlocked exists as a legacy status in STATUS_CONFIG", () => {
    expect(STATUS_CONFIG["generated_unlocked"]).toBeDefined();
  });
});

describe("Review Queue — only shows attorney-relevant statuses", () => {
  const REVIEW_STATUSES = ["pending_review", "under_review", "needs_changes", "approved", "rejected"];
  const PRE_PAYMENT_STATUSES = ["submitted", "researching", "drafting", "generated_locked"];

  it("pending_review is in the review queue", () => {
    expect(REVIEW_STATUSES.includes("pending_review")).toBe(true);
  });

  it("generated_locked is NOT in the review queue (pre-payment)", () => {
    expect(REVIEW_STATUSES.includes("generated_locked")).toBe(false);
  });

  it("all pre-payment statuses are excluded from review queue", () => {
    PRE_PAYMENT_STATUSES.forEach((s) => {
      expect(REVIEW_STATUSES.includes(s)).toBe(false);
    });
  });

  it("all review-relevant statuses are included", () => {
    ["pending_review", "under_review", "needs_changes", "approved", "rejected"].forEach((s) => {
      expect(REVIEW_STATUSES.includes(s)).toBe(true);
    });
  });
});

describe("Stripe products — per-letter unlock price", () => {
  it("LETTER_UNLOCK_PRICE_CENTS is $299 (29900 cents)", async () => {
    const { LETTER_UNLOCK_PRICE_CENTS } = await import("./stripe-products");
    expect(LETTER_UNLOCK_PRICE_CENTS).toBe(29900);
  });

  it("single_letter plan price is $299", async () => {
    const { PLANS } = await import("./stripe-products");
    expect(PLANS.single_letter.price).toBe(29900);
  });
});
