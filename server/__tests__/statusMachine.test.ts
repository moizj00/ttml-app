import { describe, it, expect } from "vitest";
import { ALLOWED_TRANSITIONS, isValidTransition } from "../../shared/types";
import { LETTER_STATUSES } from "../../drizzle/schema";

describe("Status Machine", () => {
  it("every status in LETTER_STATUSES has an entry in ALLOWED_TRANSITIONS", () => {
    for (const status of LETTER_STATUSES) {
      expect(
        ALLOWED_TRANSITIONS,
        `Missing transition entry for status: ${status}`
      ).toHaveProperty(status);
    }
  });

  it("every transition target is a valid status", () => {
    const validStatuses = new Set<string>([
      ...LETTER_STATUSES,
      // Legacy statuses kept for backward compatibility
      "generated_unlocked",
      "upsell_dismissed",
    ]);
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of targets) {
        expect(
          validStatuses.has(to),
          `Invalid target status "${to}" in transition from "${from}"`
        ).toBe(true);
      }
    }
  });

  it("terminal states have no outgoing transitions", () => {
    expect(ALLOWED_TRANSITIONS["sent"]).toEqual([]);
    expect(ALLOWED_TRANSITIONS["client_declined"]).toEqual([]);
  });

  it("isValidTransition returns true for valid transitions", () => {
    expect(isValidTransition("submitted", "researching")).toBe(true);
    expect(isValidTransition("researching", "drafting")).toBe(true);
    expect(isValidTransition("under_review", "approved")).toBe(true);
    expect(isValidTransition("client_approved", "sent")).toBe(true);
  });

  it("isValidTransition returns false for invalid transitions", () => {
    expect(isValidTransition("submitted", "sent")).toBe(false);
    expect(isValidTransition("sent", "submitted")).toBe(false);
    expect(isValidTransition("drafting", "sent")).toBe(false);
    expect(isValidTransition("nonexistent", "submitted")).toBe(false);
  });

  it("no status can transition to itself", () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(
        targets.includes(from),
        `Status "${from}" has a self-transition`
      ).toBe(false);
    }
  });

  it("every non-terminal status is reachable from submitted", () => {
    const reachable = new Set<string>();
    const queue = ["submitted"];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const next of ALLOWED_TRANSITIONS[current] ?? []) {
        if (!reachable.has(next)) queue.push(next);
      }
    }
    for (const status of LETTER_STATUSES) {
      expect(
        reachable.has(status),
        `Status "${status}" is not reachable from "submitted"`
      ).toBe(true);
    }
  });
});
