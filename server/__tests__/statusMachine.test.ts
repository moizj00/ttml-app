import { describe, it, expect } from "vitest";
import { ALLOWED_TRANSITIONS, isValidTransition, STATUS_CONFIG } from "../../shared/types";
import {
  LETTER_STATUSES,
  JOB_TYPES,
  LESSON_SOURCES,
  jobTypeEnum,
  lessonSourceEnum,
  letterStatusEnum,
} from "../../drizzle/schema";
import { LETTER_STAGES, TERMINAL_ERROR_STATUSES } from "../../client/src/lib/letterStages";

const LEGACY_STATUSES = ["generated_unlocked", "upsell_dismissed"];

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
      ...LEGACY_STATUSES,
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

describe("Enum Drift Detection", () => {
  it("every key in ALLOWED_TRANSITIONS exists in LETTER_STATUSES or is explicitly legacy", () => {
    const validStatuses = new Set<string>([...LETTER_STATUSES, ...LEGACY_STATUSES]);
    for (const key of Object.keys(ALLOWED_TRANSITIONS)) {
      expect(
        validStatuses.has(key),
        `ALLOWED_TRANSITIONS key "${key}" is not in LETTER_STATUSES or LEGACY_STATUSES`
      ).toBe(true);
    }
  });

  it("every status in LETTER_STATUSES has an entry in STATUS_CONFIG", () => {
    for (const status of LETTER_STATUSES) {
      expect(
        STATUS_CONFIG,
        `Missing STATUS_CONFIG entry for status: ${status}`
      ).toHaveProperty(status);
    }
  });

  it("jobTypeEnum values match JOB_TYPES", () => {
    const pgValues = new Set<string>(jobTypeEnum.enumValues);
    const tsValues = new Set<string>(JOB_TYPES);
    for (const val of pgValues) {
      expect(
        tsValues.has(val),
        `jobTypeEnum value "${val}" is missing from JOB_TYPES`
      ).toBe(true);
    }
    for (const val of tsValues) {
      expect(
        pgValues.has(val),
        `JOB_TYPES value "${val}" is missing from jobTypeEnum`
      ).toBe(true);
    }
  });

  it("lessonSourceEnum values match LESSON_SOURCES", () => {
    const pgValues = new Set<string>(lessonSourceEnum.enumValues);
    const tsValues = new Set<string>(LESSON_SOURCES);
    for (const val of pgValues) {
      expect(
        tsValues.has(val),
        `lessonSourceEnum value "${val}" is missing from LESSON_SOURCES`
      ).toBe(true);
    }
    for (const val of tsValues) {
      expect(
        pgValues.has(val),
        `LESSON_SOURCES value "${val}" is missing from lessonSourceEnum`
      ).toBe(true);
    }
  });

  it("letterStatusEnum values match LETTER_STATUSES plus explicitly listed legacy values", () => {
    const expectedPgValues = new Set<string>([...LETTER_STATUSES, ...LEGACY_STATUSES]);
    const actualPgValues = new Set(letterStatusEnum.enumValues);
    for (const val of actualPgValues) {
      expect(
        expectedPgValues.has(val),
        `letterStatusEnum value "${val}" is not in LETTER_STATUSES or LEGACY_STATUSES`
      ).toBe(true);
    }
    for (const val of expectedPgValues) {
      expect(
        actualPgValues.has(val),
        `Expected pgEnum value "${val}" is missing from letterStatusEnum`
      ).toBe(true);
    }
  });

  it("letterStages stage mappings plus TERMINAL_ERROR_STATUSES cover every value in LETTER_STATUSES", () => {
    const coveredStatuses = new Set<string>();
    for (const stage of LETTER_STAGES) {
      for (const status of stage.statuses) {
        coveredStatuses.add(status);
      }
    }
    for (const status of TERMINAL_ERROR_STATUSES) {
      coveredStatuses.add(status);
    }
    for (const status of LETTER_STATUSES) {
      expect(
        coveredStatuses.has(status),
        `LETTER_STATUSES value "${status}" is not covered by any letterStage or TERMINAL_ERROR_STATUSES`
      ).toBe(true);
    }
  });
});
