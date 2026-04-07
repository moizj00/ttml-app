/**
 * Deep tests: Intake Normalizer
 *
 * Exhaustive coverage of buildNormalizedPromptInput — field merging,
 * fallbacks, trimming, safe arrays, safe numbers, and edge cases.
 */
import { describe, it, expect } from "vitest";
import { buildNormalizedPromptInput } from "./intake-normalizer";
import type { IntakeJson } from "../shared/types";

function intakeWithOverride(base: IntakeJson, overrides: Record<string, unknown>): IntakeJson {
  return { ...base, ...overrides } as IntakeJson;
}

function intakeWithNestedOverride(
  base: IntakeJson,
  nestedKey: keyof IntakeJson,
  overrides: Record<string, unknown>
): IntakeJson {
  const nested = base[nestedKey];
  return {
    ...base,
    [nestedKey]: typeof nested === "object" && nested !== null
      ? { ...nested, ...overrides }
      : overrides,
  } as IntakeJson;
}

function intakeWithNestedOmit(
  base: IntakeJson,
  nestedKey: keyof IntakeJson,
  omitKey: string
): IntakeJson {
  const nested = base[nestedKey];
  if (typeof nested === "object" && nested !== null) {
    const copy = { ...(nested as Record<string, unknown>) };
    delete copy[omitKey];
    return { ...base, [nestedKey]: copy } as IntakeJson;
  }
  return base;
}

const minimalDbFields = () => ({
  subject: "Test Subject",
  letterType: "demand-letter",
});

const fullIntake = (): IntakeJson => ({
  schemaVersion: "1.0",
  letterType: "demand-letter",
  sender: { name: "Alice Sender", address: "123 Main St", email: "alice@test.com", phone: "555-1234" },
  recipient: { name: "Bob Recipient", address: "456 Oak Ave", email: "bob@test.com", phone: "555-5678" },
  jurisdiction: { country: "US", state: "CA", city: "Los Angeles" },
  matter: { category: "demand-letter", subject: "Payment Dispute", description: "Unpaid invoice", incidentDate: "2024-01-15" },
  financials: { amountOwed: 5000, currency: "USD" },
  desiredOutcome: "Full payment within 30 days",
  deadlineDate: "2024-03-15",
  additionalContext: "Multiple attempts to resolve",
  tonePreference: "firm",
  language: "english",
  priorCommunication: "Sent 3 emails",
  deliveryMethod: "certified_mail",
});

describe("buildNormalizedPromptInput", () => {
  describe("basic output shape", () => {
    it("returns all expected fields", () => {
      const result = buildNormalizedPromptInput(minimalDbFields(), fullIntake());
      expect(result).toHaveProperty("schemaVersion");
      expect(result).toHaveProperty("letterType");
      expect(result).toHaveProperty("matterCategory");
      expect(result).toHaveProperty("sender");
      expect(result).toHaveProperty("recipient");
      expect(result).toHaveProperty("jurisdiction");
      expect(result).toHaveProperty("matter");
      expect(result).toHaveProperty("financials");
      expect(result).toHaveProperty("desiredOutcome");
      expect(result).toHaveProperty("deadlineDate");
      expect(result).toHaveProperty("tonePreference");
      expect(result).toHaveProperty("language");
      expect(result).toHaveProperty("deliveryMethod");
      expect(result).toHaveProperty("timeline");
      expect(result).toHaveProperty("evidenceSummary");
      expect(result).toHaveProperty("userStatements");
    });
  });

  describe("null/undefined intake handling", () => {
    it("handles null intakeJson gracefully", () => {
      const result = buildNormalizedPromptInput(minimalDbFields(), null);
      expect(result.letterType).toBe("demand-letter");
      expect(result.sender.name).toBe("Unknown Sender");
      expect(result.recipient.name).toBe("Unknown Recipient");
      expect(result.jurisdiction.country).toBe("US");
      expect(result.matter.subject).toBe("Test Subject");
    });

    it("handles undefined intakeJson gracefully", () => {
      const result = buildNormalizedPromptInput(minimalDbFields(), undefined);
      expect(result.letterType).toBe("demand-letter");
      expect(result.sender.name).toBe("Unknown Sender");
    });
  });

  describe("DB field fallbacks", () => {
    it("falls back to dbFields.subject when intake.matter.subject is missing", () => {
      const intake = intakeWithNestedOmit(fullIntake(), "matter", "subject");
      const result = buildNormalizedPromptInput({ ...minimalDbFields(), subject: "DB Subject" }, intake);
      expect(result.matter.subject).toBe("DB Subject");
    });

    it("falls back to dbFields.issueSummary when intake.matter.description is missing", () => {
      const intake = intakeWithNestedOmit(fullIntake(), "matter", "description");
      const result = buildNormalizedPromptInput(
        { ...minimalDbFields(), issueSummary: "DB Summary" },
        intake
      );
      expect(result.matter.description).toBe("DB Summary");
    });

    it("falls back to dbFields.jurisdictionCountry when intake country is missing", () => {
      const intake = intakeWithNestedOmit(fullIntake(), "jurisdiction", "country");
      const result = buildNormalizedPromptInput(
        { ...minimalDbFields(), jurisdictionCountry: "GB" },
        intake
      );
      expect(result.jurisdiction.country).toBe("GB");
    });

    it("falls back to dbFields.jurisdictionState when intake state is missing", () => {
      const intake = intakeWithNestedOmit(fullIntake(), "jurisdiction", "state");
      const result = buildNormalizedPromptInput(
        { ...minimalDbFields(), jurisdictionState: "NY" },
        intake
      );
      expect(result.jurisdiction.state).toBe("NY");
    });

    it("falls back to dbFields.jurisdictionCity when intake city is missing", () => {
      const intake = fullIntake();
      delete intake.jurisdiction.city;
      const result = buildNormalizedPromptInput(
        { ...minimalDbFields(), jurisdictionCity: "Buffalo" },
        intake
      );
      expect(result.jurisdiction.city).toBe("Buffalo");
    });

    it("uses 'US' default when both intake and dbFields country are missing", () => {
      const result = buildNormalizedPromptInput(minimalDbFields(), null);
      expect(result.jurisdiction.country).toBe("US");
    });

    it("uses 'Unknown' default when both intake and dbFields state are missing", () => {
      const result = buildNormalizedPromptInput(minimalDbFields(), null);
      expect(result.jurisdiction.state).toBe("Unknown");
    });
  });

  describe("string trimming", () => {
    it("trims whitespace from sender name", () => {
      const intake = fullIntake();
      intake.sender.name = "  Alice  ";
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.sender.name).toBe("Alice");
    });

    it("trims whitespace from recipient address", () => {
      const intake = fullIntake();
      intake.recipient.address = "\n  456 Oak Ave  \n";
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.recipient.address).toBe("456 Oak Ave");
    });

    it("converts empty string to default", () => {
      const intake = fullIntake();
      intake.sender.name = "   ";
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.sender.name).toBe("Unknown Sender");
    });

    it("converts empty email to null", () => {
      const intake = fullIntake();
      intake.sender.email = "  ";
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.sender.email).toBeNull();
    });
  });

  describe("financials normalization", () => {
    it("preserves valid financial amounts", () => {
      const intake = fullIntake();
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.financials).not.toBeNull();
      expect(result.financials?.amountOwed).toBe(5000);
      expect(result.financials?.currency).toBe("USD");
    });

    it("returns null financials when amountOwed is undefined", () => {
      const intake = fullIntake();
      delete intake.financials;
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.financials).toBeNull();
    });

    it("returns null financials when amountOwed is null", () => {
      const intake = fullIntake();
      intake.financials = { amountOwed: undefined, currency: "USD" };
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.financials).toBeNull();
    });

    it("handles NaN amountOwed by returning null", () => {
      const intake = intakeWithOverride(fullIntake(), { financials: { amountOwed: "not a number", currency: "USD" } });
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.financials?.amountOwed).toBeNull();
    });

    it("defaults currency to USD when missing", () => {
      const intake = fullIntake();
      intake.financials = { amountOwed: 1000 };
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.financials?.currency).toBe("USD");
    });

    it("preserves zero as a valid amount", () => {
      const intake = fullIntake();
      intake.financials = { amountOwed: 0, currency: "EUR" };
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.financials?.amountOwed).toBe(0);
    });
  });

  describe("tone preference normalization", () => {
    it("uses intake tonePreference when valid", () => {
      const intake = fullIntake();
      intake.tonePreference = "aggressive";
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.tonePreference).toBe("aggressive");
    });

    it("prefers toneAndDelivery.tone over tonePreference", () => {
      const intake = fullIntake();
      intake.tonePreference = "firm";
      intake.toneAndDelivery = { tone: "moderate" };
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.tonePreference).toBe("moderate");
    });

    it("defaults to 'firm' when tone is invalid", () => {
      const intake = intakeWithOverride(fullIntake(), { tonePreference: "polite", toneAndDelivery: undefined });
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.tonePreference).toBe("firm");
    });

    it("defaults to 'firm' when tone is missing", () => {
      const intake = fullIntake();
      delete intake.tonePreference;
      delete intake.toneAndDelivery;
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.tonePreference).toBe("firm");
    });
  });

  describe("communications/prior communication merging", () => {
    it("prefers structured communications.summary over legacy priorCommunication", () => {
      const intake = fullIntake();
      intake.communications = { summary: "Structured summary" };
      intake.priorCommunication = "Legacy summary";
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.priorCommunication).toBe("Structured summary");
    });

    it("falls back to legacy priorCommunication", () => {
      const intake = fullIntake();
      delete intake.communications;
      intake.priorCommunication = "Legacy summary";
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.priorCommunication).toBe("Legacy summary");
    });

    it("returns null when neither is set", () => {
      const intake = fullIntake();
      delete intake.communications;
      delete intake.priorCommunication;
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.priorCommunication).toBeNull();
    });
  });

  describe("delivery method merging", () => {
    it("prefers toneAndDelivery.deliveryMethod over legacy field", () => {
      const intake = fullIntake();
      intake.toneAndDelivery = { tone: "firm", deliveryMethod: "email" };
      intake.deliveryMethod = "certified-mail";
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.deliveryMethod).toBe("email");
    });

    it("defaults to certified_mail when missing", () => {
      const intake = fullIntake();
      delete intake.toneAndDelivery;
      delete intake.deliveryMethod;
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.deliveryMethod).toBe("certified_mail");
    });
  });

  describe("safe arrays", () => {
    it("returns empty array for missing timeline", () => {
      const result = buildNormalizedPromptInput(minimalDbFields(), fullIntake());
      expect(result.timeline).toEqual([]);
    });

    it("filters empty strings from timeline", () => {
      const intake = intakeWithOverride(fullIntake(), { timeline: ["Event 1", "", "  ", "Event 2"] });
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.timeline).toEqual(["Event 1", "Event 2"]);
    });

    it("converts non-string timeline items to strings", () => {
      const intake = intakeWithOverride(fullIntake(), { timeline: [123, true] });
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.timeline).toEqual(["123", "true"]);
    });

    it("handles non-array timeline gracefully", () => {
      const intake = intakeWithOverride(fullIntake(), { timeline: "not an array" });
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.timeline).toEqual([]);
    });
  });

  describe("defaults and language", () => {
    it("defaults language to 'english'", () => {
      const intake = fullIntake();
      delete intake.language;
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.language).toBe("english");
    });

    it("preserves explicit language", () => {
      const intake = fullIntake();
      intake.language = "spanish";
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.language).toBe("spanish");
    });

    it("defaults desiredOutcome when missing", () => {
      const intake = intakeWithOverride(fullIntake(), { desiredOutcome: undefined });
      const result = buildNormalizedPromptInput(minimalDbFields(), intake);
      expect(result.desiredOutcome).toBe("Resolution of the matter");
    });
  });
});
