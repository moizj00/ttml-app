/**
 * Deep tests: Pipeline deterministic validators
 *
 * Covers validateResearchPacket, parseAndValidateDraftLlmOutput, validateFinalLetter
 * with exhaustive edge cases, boundary conditions, and malformed input.
 */
import { describe, it, expect } from "vitest";
import {
  validateResearchPacket,
  parseAndValidateDraftLlmOutput,
  validateFinalLetter,
} from "./pipeline";

function omit<T extends Record<string, unknown>>(obj: T, key: string): Record<string, unknown> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

function withField<T extends Record<string, unknown>>(obj: T, key: string, value: unknown): Record<string, unknown> {
  return { ...obj, [key]: value };
}

// ═══════════════════════════════════════════════════════
// validateResearchPacket
// ═══════════════════════════════════════════════════════

describe("validateResearchPacket", () => {
  const validPacket = (): Record<string, unknown> => ({
    researchSummary: "A".repeat(60),
    jurisdictionProfile: { country: "US", stateProvince: "CA" },
    issuesIdentified: ["Issue one"],
    applicableRules: [
      { ruleTitle: "Rule 1", summary: "Summary of rule 1" },
    ],
    draftingConstraints: ["Constraint 1"],
  });

  it("accepts a fully valid research packet", () => {
    const result = validateResearchPacket(validPacket());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects null input", () => {
    const result = validateResearchPacket(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Research packet is not an object");
  });

  it("rejects undefined input", () => {
    const result = validateResearchPacket(undefined);
    expect(result.valid).toBe(false);
  });

  it("rejects a string input", () => {
    const result = validateResearchPacket("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejects an array input", () => {
    const result = validateResearchPacket([1, 2, 3]);
    expect(result.valid).toBe(false);
  });

  it("rejects empty object (missing all required fields)", () => {
    const result = validateResearchPacket({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  describe("researchSummary validation", () => {
    it("rejects missing researchSummary", () => {
      const result = validateResearchPacket(omit(validPacket(), "researchSummary"));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("researchSummary"))).toBe(true);
    });

    it("rejects researchSummary shorter than 50 chars", () => {
      const result = validateResearchPacket(withField(validPacket(), "researchSummary", "A".repeat(49)));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("researchSummary"))).toBe(true);
    });

    it("accepts researchSummary exactly 50 chars", () => {
      const result = validateResearchPacket(withField(validPacket(), "researchSummary", "A".repeat(50)));
      expect(result.valid).toBe(true);
    });

    it("rejects non-string researchSummary", () => {
      const result = validateResearchPacket(withField(validPacket(), "researchSummary", 12345));
      expect(result.valid).toBe(false);
    });

    it("rejects empty string researchSummary", () => {
      const result = validateResearchPacket(withField(validPacket(), "researchSummary", ""));
      expect(result.valid).toBe(false);
    });
  });

  describe("jurisdictionProfile validation", () => {
    it("rejects missing jurisdictionProfile", () => {
      const result = validateResearchPacket(omit(validPacket(), "jurisdictionProfile"));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("jurisdictionProfile"))).toBe(true);
    });

    it("rejects non-object jurisdictionProfile", () => {
      const result = validateResearchPacket(withField(validPacket(), "jurisdictionProfile", "California"));
      expect(result.valid).toBe(false);
    });

    it("accepts any object shape for jurisdictionProfile", () => {
      const result = validateResearchPacket(withField(validPacket(), "jurisdictionProfile", { country: "US" }));
      expect(result.valid).toBe(true);
    });
  });

  describe("issuesIdentified validation", () => {
    it("rejects missing issuesIdentified", () => {
      const result = validateResearchPacket(omit(validPacket(), "issuesIdentified"));
      expect(result.valid).toBe(false);
    });

    it("rejects empty issuesIdentified array", () => {
      const result = validateResearchPacket(withField(validPacket(), "issuesIdentified", []));
      expect(result.valid).toBe(false);
    });

    it("rejects non-array issuesIdentified", () => {
      const result = validateResearchPacket(withField(validPacket(), "issuesIdentified", "single issue"));
      expect(result.valid).toBe(false);
    });
  });

  describe("applicableRules validation", () => {
    it("rejects missing applicableRules", () => {
      const result = validateResearchPacket(omit(validPacket(), "applicableRules"));
      expect(result.valid).toBe(false);
    });

    it("rejects empty applicableRules array", () => {
      const result = validateResearchPacket(withField(validPacket(), "applicableRules", []));
      expect(result.valid).toBe(false);
    });

    it("rejects rule without ruleTitle", () => {
      const result = validateResearchPacket(withField(validPacket(), "applicableRules", [{ summary: "Summary" }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("ruleTitle"))).toBe(true);
    });

    it("rejects rule without summary", () => {
      const result = validateResearchPacket(withField(validPacket(), "applicableRules", [{ ruleTitle: "Rule" }]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("summary"))).toBe(true);
    });

    it("rejects non-object rule entry", () => {
      const result = validateResearchPacket(withField(validPacket(), "applicableRules", ["not an object"]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("not an object"))).toBe(true);
    });

    it("validates multiple rules individually", () => {
      const result = validateResearchPacket(withField(validPacket(), "applicableRules", [
        { ruleTitle: "Rule 1", summary: "OK" },
        { ruleTitle: "Rule 2" },
      ]));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("[1].summary"))).toBe(true);
    });

    it("rejects null rule entry", () => {
      const result = validateResearchPacket(withField(validPacket(), "applicableRules", [null]));
      expect(result.valid).toBe(false);
    });
  });

  describe("draftingConstraints validation", () => {
    it("rejects missing draftingConstraints", () => {
      const result = validateResearchPacket(omit(validPacket(), "draftingConstraints"));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("draftingConstraints"))).toBe(true);
    });

    it("accepts empty draftingConstraints array", () => {
      const result = validateResearchPacket(withField(validPacket(), "draftingConstraints", []));
      expect(result.valid).toBe(true);
    });
  });

  describe("soft warnings (non-blocking)", () => {
    it("warns when recentCasePrecedents is missing", () => {
      const p = validPacket();
      const result = validateResearchPacket(p);
      expect(result.warnings.some(w => w.includes("recentCasePrecedents"))).toBe(true);
    });

    it("warns when statuteOfLimitations is missing", () => {
      const p = validPacket();
      const result = validateResearchPacket(p);
      expect(result.warnings.some(w => w.includes("statuteOfLimitations"))).toBe(true);
    });

    it("warns when preSuitRequirements is missing", () => {
      const result = validateResearchPacket(validPacket());
      expect(result.warnings.some(w => w.includes("preSuitRequirements"))).toBe(true);
    });

    it("warns when availableRemedies is missing", () => {
      const result = validateResearchPacket(validPacket());
      expect(result.warnings.some(w => w.includes("availableRemedies"))).toBe(true);
    });

    it("warns when commonDefenses is missing", () => {
      const result = validateResearchPacket(validPacket());
      expect(result.warnings.some(w => w.includes("commonDefenses"))).toBe(true);
    });

    it("warns when enforcementClimate is missing", () => {
      const result = validateResearchPacket(validPacket());
      expect(result.warnings.some(w => w.includes("enforcementClimate"))).toBe(true);
    });

    it("does not warn when all optional fields are present", () => {
      const p = {
        ...validPacket(),
        recentCasePrecedents: [{ caseName: "Smith v. Jones" }],
        statuteOfLimitations: { years: 3 },
        preSuitRequirements: { required: true },
        availableRemedies: { damages: true },
        commonDefenses: ["Defense 1"],
        enforcementClimate: { active: true },
      };
      const result = validateResearchPacket(p);
      expect(result.warnings).toHaveLength(0);
    });

    it("warnings do not affect validity when core fields present", () => {
      const result = validateResearchPacket(validPacket());
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("accumulates multiple errors", () => {
    it("returns all errors at once for completely invalid input", () => {
      const result = validateResearchPacket({
        researchSummary: "short",
        issuesIdentified: [],
        applicableRules: "not array",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// ═══════════════════════════════════════════════════════
// parseAndValidateDraftLlmOutput
// ═══════════════════════════════════════════════════════

describe("parseAndValidateDraftLlmOutput", () => {
  const validDraftJson = () =>
    JSON.stringify({
      draftLetter: "D".repeat(150),
      attorneyReviewSummary: "Review summary text",
      openQuestions: ["Question 1"],
      riskFlags: ["Risk 1"],
    });

  it("parses valid JSON draft output", () => {
    const result = parseAndValidateDraftLlmOutput(validDraftJson());
    expect(result.valid).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.draftLetter.length).toBeGreaterThanOrEqual(100);
  });

  it("extracts JSON from markdown code fence", () => {
    const wrapped = "```json\n" + validDraftJson() + "\n```";
    const result = parseAndValidateDraftLlmOutput(wrapped);
    expect(result.valid).toBe(true);
    expect(result.data?.draftLetter).toBeTruthy();
  });

  it("extracts JSON from code fence without language hint", () => {
    const wrapped = "```\n" + validDraftJson() + "\n```";
    const result = parseAndValidateDraftLlmOutput(wrapped);
    expect(result.valid).toBe(true);
  });

  it("extracts JSON object from surrounding prose", () => {
    const prose = "Here is the draft:\n" + validDraftJson() + "\nEnd of response.";
    const result = parseAndValidateDraftLlmOutput(prose);
    expect(result.valid).toBe(true);
  });

  it("treats long non-JSON text as plain text draft (>100 chars)", () => {
    const plainText = "Dear Sir or Madam,\n\n" + "A".repeat(200) + "\n\nSincerely, Attorney";
    const result = parseAndValidateDraftLlmOutput(plainText);
    expect(result.valid).toBe(true);
    expect(result.data?.draftLetter).toBe(plainText.trim());
    expect(result.data?.attorneyReviewSummary).toContain("AI-generated draft");
  });

  it("rejects short non-JSON text (<=100 chars)", () => {
    const result = parseAndValidateDraftLlmOutput("Too short");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Could not parse"))).toBe(true);
  });

  it("rejects empty string", () => {
    const result = parseAndValidateDraftLlmOutput("");
    expect(result.valid).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    const result = parseAndValidateDraftLlmOutput("   \n\t  ");
    expect(result.valid).toBe(false);
  });

  describe("JSON field validation", () => {
    it("rejects missing draftLetter", () => {
      const obj = {
        attorneyReviewSummary: "Review",
        openQuestions: [],
        riskFlags: [],
      };
      const result = parseAndValidateDraftLlmOutput(JSON.stringify(obj));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("draftLetter"))).toBe(true);
    });

    it("rejects draftLetter shorter than 100 chars", () => {
      const obj = {
        draftLetter: "Short",
        attorneyReviewSummary: "Review",
        openQuestions: [],
        riskFlags: [],
      };
      const result = parseAndValidateDraftLlmOutput(JSON.stringify(obj));
      expect(result.valid).toBe(false);
    });

    it("rejects missing attorneyReviewSummary", () => {
      const obj = {
        draftLetter: "D".repeat(150),
        openQuestions: [],
        riskFlags: [],
      };
      const result = parseAndValidateDraftLlmOutput(JSON.stringify(obj));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("attorneyReviewSummary"))).toBe(true);
    });

    it("rejects non-array openQuestions", () => {
      const obj = {
        draftLetter: "D".repeat(150),
        attorneyReviewSummary: "Review",
        openQuestions: "not an array",
        riskFlags: [],
      };
      const result = parseAndValidateDraftLlmOutput(JSON.stringify(obj));
      expect(result.valid).toBe(false);
    });

    it("rejects non-array riskFlags", () => {
      const obj = {
        draftLetter: "D".repeat(150),
        attorneyReviewSummary: "Review",
        openQuestions: [],
        riskFlags: "not an array",
      };
      const result = parseAndValidateDraftLlmOutput(JSON.stringify(obj));
      expect(result.valid).toBe(false);
    });

    it("accepts empty openQuestions and riskFlags arrays", () => {
      const obj = {
        draftLetter: "D".repeat(150),
        attorneyReviewSummary: "Review",
        openQuestions: [],
        riskFlags: [],
      };
      const result = parseAndValidateDraftLlmOutput(JSON.stringify(obj));
      expect(result.valid).toBe(true);
    });

    it("rejects parsed non-object (e.g. array)", () => {
      const result = parseAndValidateDraftLlmOutput(JSON.stringify([1, 2, 3]));
      expect(result.valid).toBe(false);
    });

    it("rejects parsed null", () => {
      const result = parseAndValidateDraftLlmOutput("null");
      expect(result.valid).toBe(false);
    });
  });

  describe("accumulates multiple JSON validation errors", () => {
    it("reports all missing fields together", () => {
      const obj = {};
      const result = parseAndValidateDraftLlmOutput(JSON.stringify(obj));
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// ═══════════════════════════════════════════════════════
// validateFinalLetter
// ═══════════════════════════════════════════════════════

describe("validateFinalLetter", () => {
  const validLetter = () =>
    "Dear Mr. Smith,\n\n" +
    "A".repeat(200) +
    "\n\nSincerely,\nAttorney Name";

  it("accepts a valid formal letter", () => {
    const result = validateFinalLetter(validLetter());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty string", () => {
    const result = validateFinalLetter("");
    expect(result.valid).toBe(false);
  });

  it("rejects text shorter than 200 chars", () => {
    const result = validateFinalLetter("Dear Sir, short. Sincerely, Me");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("200 characters"))).toBe(true);
  });

  describe("salutation requirements", () => {
    it("accepts 'Dear' as salutation", () => {
      const letter = "Dear Recipient,\n" + "A".repeat(200) + "\nSincerely, Me";
      expect(validateFinalLetter(letter).valid).toBe(true);
    });

    it("accepts 'To Whom' as salutation", () => {
      const letter = "To Whom It May Concern,\n" + "A".repeat(200) + "\nSincerely, Me";
      expect(validateFinalLetter(letter).valid).toBe(true);
    });

    it("accepts 'RE:' as subject line", () => {
      const letter = "RE: Legal Matter\n" + "A".repeat(200) + "\nSincerely, Me";
      expect(validateFinalLetter(letter).valid).toBe(true);
    });

    it("accepts 'Re:' (lowercase) as subject line", () => {
      const letter = "Re: Legal Matter\n" + "A".repeat(200) + "\nSincerely, Me";
      expect(validateFinalLetter(letter).valid).toBe(true);
    });

    it("rejects letter without any recognized salutation", () => {
      const letter = "Hello there,\n" + "A".repeat(200) + "\nSincerely, Me";
      expect(validateFinalLetter(letter).valid).toBe(false);
      expect(validateFinalLetter(letter).errors.some(e => e.includes("salutation"))).toBe(true);
    });
  });

  describe("closing requirements", () => {
    it("accepts 'Sincerely' as closing", () => {
      const letter = "Dear Sir,\n" + "A".repeat(200) + "\nSincerely, Me";
      expect(validateFinalLetter(letter).valid).toBe(true);
    });

    it("accepts 'Respectfully' as closing", () => {
      const letter = "Dear Sir,\n" + "A".repeat(200) + "\nRespectfully, Me";
      expect(validateFinalLetter(letter).valid).toBe(true);
    });

    it("accepts 'Very truly yours' as closing", () => {
      const letter = "Dear Sir,\n" + "A".repeat(200) + "\nVery truly yours, Me";
      expect(validateFinalLetter(letter).valid).toBe(true);
    });

    it("accepts 'Regards' as closing", () => {
      const letter = "Dear Sir,\n" + "A".repeat(200) + "\nRegards, Me";
      expect(validateFinalLetter(letter).valid).toBe(true);
    });

    it("rejects letter without any recognized closing", () => {
      const letter = "Dear Sir,\n" + "A".repeat(200) + "\nBest, Me";
      expect(validateFinalLetter(letter).valid).toBe(false);
      expect(validateFinalLetter(letter).errors.some(e => e.includes("closing"))).toBe(true);
    });
  });

  it("accumulates errors for missing salutation AND closing", () => {
    const letter = "Hello,\n" + "A".repeat(200) + "\nCheers";
    const result = validateFinalLetter(letter);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  it("accumulates length error with format errors", () => {
    const letter = "Hello, Cheers";
    const result = validateFinalLetter(letter);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });
});
