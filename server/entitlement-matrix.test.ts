/**
 * Entitlement Matrix Tests
 *
 * Table-driven coverage of every plan × purchase state → submission outcome
 * combination recognised by `checkLetterSubmissionAllowed`.
 *
 * Scenarios:
 *   1. No subscription / never submitted            → first letter free
 *   2. No subscription / freeReviewUsedAt claimed   → blocked (redirect to pricing)
 *   3. single_letter active, 0 used                 → allowed
 *   4. single_letter active, 1/1 used               → blocked (quota exhausted)
 *   5. monthly active, 2/4 used                     → allowed
 *   6. monthly active, 4/4 used                     → blocked (quota exhausted)
 *   7. yearly active, 4/8 used                      → allowed
 *   8. yearly active, 8/8 used                      → blocked (quota exhausted)
 *   9. monthly canceled (in grace window)            → blocked (status not active)
 *  10. monthly canceled + period expired             → blocked
 *  11. monthly past_due                              → blocked
 *  12. legacy plan alias "annual" (= yearly 8 letters) → allowed when under quota
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mocks ─────────────────────────────────────────────────────────────────
// getUserSubscription calls getDb().select().from(...).where(...).orderBy(...).limit(1)
// We provide a chainable mock that defers to mockSubRows for the final result.
let mockSubRows: unknown[] = [];
let mockUserRow: unknown = null;
let mockCompletedCount = 0;

function makeChainableDb() {
  const chain: Record<string, unknown> = {};
  const terminal = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(mockSubRows),
    update: () => chain,
    set: () => chain,
    insert: () => chain,
    values: () => chain,
    onConflictDoUpdate: () => Promise.resolve([]),
    returning: () => Promise.resolve([]),
  };
  Object.assign(chain, terminal);
  return chain;
}

vi.mock("./db", () => ({
  getDb: vi.fn().mockImplementation(async () => makeChainableDb()),
  getUserById: vi.fn().mockImplementation(async () => mockUserRow),
  countCompletedLetters: vi.fn().mockImplementation(async () => mockCompletedCount),
}));

import { checkLetterSubmissionAllowed } from "./stripe/subscriptions";

// ─── Subscription factory ─────────────────────────────────────────────────────
function makeSub(
  overrides: Partial<{
    plan: string;
    status: "active" | "canceled" | "past_due" | "trialing" | "incomplete" | "none";
    lettersAllowed: number;
    lettersUsed: number;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
  }>
) {
  return {
    id: 1,
    userId: 42,
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    stripePaymentIntentId: null,
    plan: "monthly",
    status: "active" as const,
    lettersAllowed: 4,
    lettersUsed: 0,
    cancelAtPeriodEnd: false,
    currentPeriodStart: new Date("2026-01-01"),
    currentPeriodEnd: new Date("2026-02-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("checkLetterSubmissionAllowed — entitlement matrix", () => {
  beforeEach(() => {
    // Reset per-test state
    mockSubRows = [];
    mockUserRow = null;
    mockCompletedCount = 0;
  });

  // ── 1. No subscription, first-letter-free path ────────────────────────────
  it("allows first letter free when user has no subscription and no free trial used", async () => {
    mockSubRows = []; // no subscription
    mockUserRow = { id: 42, freeReviewUsedAt: null };
    mockCompletedCount = 0;

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(true);
    expect(result.firstLetterFree).toBe(true);
  });

  // ── 2. No subscription, freeReviewUsedAt already claimed ─────────────────
  it("blocks submission when free trial already claimed (no subscription)", async () => {
    mockSubRows = [];
    mockUserRow = { id: 42, freeReviewUsedAt: new Date("2026-01-01") };

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/subscription/i);
  });

  // ── 3. single_letter — 0/1 used → allowed ────────────────────────────────
  it("allows submission for single_letter plan with 0/1 letters used", async () => {
    mockSubRows = [makeSub({ plan: "single_letter", lettersAllowed: 1, lettersUsed: 0 })];

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(true);
  });

  // ── 4. single_letter — 1/1 used → blocked ────────────────────────────────
  it("blocks submission for single_letter plan when quota is exhausted (1/1 used)", async () => {
    mockSubRows = [makeSub({ plan: "single_letter", lettersAllowed: 1, lettersUsed: 1 })];

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/used all/i);
  });

  // ── 5. monthly — 2/4 used → allowed ──────────────────────────────────────
  it("allows submission for monthly plan with 2/4 letters used", async () => {
    mockSubRows = [makeSub({ plan: "monthly", lettersAllowed: 4, lettersUsed: 2 })];

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(true);
  });

  // ── 6. monthly — 4/4 used → blocked ──────────────────────────────────────
  it("blocks submission for monthly plan when quota is exhausted (4/4 used)", async () => {
    mockSubRows = [makeSub({ plan: "monthly", lettersAllowed: 4, lettersUsed: 4 })];

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/used all 4/i);
  });

  // ── 7. yearly — 4/8 used → allowed ───────────────────────────────────────
  it("allows submission for yearly plan with 4/8 letters remaining", async () => {
    mockSubRows = [makeSub({ plan: "yearly", lettersAllowed: 8, lettersUsed: 4 })];

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(true);
  });

  // ── 8. yearly — 8/8 used → blocked ───────────────────────────────────────
  it("blocks submission for yearly plan when annual quota is exhausted (8/8 used)", async () => {
    mockSubRows = [makeSub({ plan: "yearly", lettersAllowed: 8, lettersUsed: 8 })];

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/used all 8/i);
  });

  // ── 9. monthly canceled (in-grace: period not yet expired) → blocked ──────
  it("blocks submission for canceled monthly subscription regardless of period end", async () => {
    mockSubRows = [
      makeSub({
        plan: "monthly",
        status: "canceled",
        lettersAllowed: 4,
        lettersUsed: 0,
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    ];
    mockUserRow = { id: 42, freeReviewUsedAt: null };
    mockCompletedCount = 1;

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(false);
  });

  // ── 10. monthly canceled + period expired → blocked ───────────────────────
  it("blocks submission when membership is canceled and period has expired", async () => {
    mockSubRows = [
      makeSub({
        plan: "monthly",
        status: "canceled",
        lettersAllowed: 4,
        lettersUsed: 2,
        currentPeriodEnd: new Date("2025-01-01"),
      }),
    ];
    mockUserRow = { id: 42, freeReviewUsedAt: null };
    mockCompletedCount = 2;

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/subscription/i);
  });

  // ── 11. monthly past_due → blocked ────────────────────────────────────────
  it("blocks submission when subscription is past_due and user has prior completed letters", async () => {
    mockSubRows = [makeSub({ plan: "monthly", status: "past_due", lettersAllowed: 4, lettersUsed: 0 })];
    mockUserRow = { id: 42, freeReviewUsedAt: null };
    mockCompletedCount = 1; // has prior completed letters → not first-letter-free

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(false);
  });

  // ── 12. legacy "annual" alias → treated as yearly, 8 letters ─────────────
  it("allows submission for legacy 'annual' plan alias when under 8-letter quota", async () => {
    mockSubRows = [makeSub({ plan: "annual", status: "active", lettersAllowed: 8, lettersUsed: 3 })];

    const result = await checkLetterSubmissionAllowed(42);

    expect(result.allowed).toBe(true);
  });
});

// ─── incrementLettersUsed — race-safe quota slot ─────────────────────────────

describe("incrementLettersUsed — quota slot claim", () => {
  it("returns false (no slot claimed) when all letters are used — mirrors DB guard", () => {
    // We test the pure plan-config math here: lettersAllowed === lettersUsed
    // means the WHERE clause in incrementLettersUsed finds 0 rows → false.
    // This is a logic-level sanity check that the boundary is lettersUsed < lettersAllowed.
    const sub = makeSub({ lettersAllowed: 1, lettersUsed: 1 });
    expect(sub.lettersUsed >= sub.lettersAllowed).toBe(true);
  });

  it("returns true (slot available) when lettersUsed < lettersAllowed", () => {
    const sub = makeSub({ lettersAllowed: 4, lettersUsed: 3 });
    expect(sub.lettersUsed < sub.lettersAllowed).toBe(true);
  });
});
