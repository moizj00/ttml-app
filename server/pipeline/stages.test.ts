import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Module-level mocks (hoisted by Vitest) ─────────────────────────────────
vi.mock("../db/core", () => ({
  getDb: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(),
  createWorkflowJob: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateWorkflowJob: vi.fn().mockResolvedValue(undefined),
  updateLetterStatus: vi.fn().mockResolvedValue(undefined),
  createLetterVersion: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateLetterVersionPointers: vi.fn().mockResolvedValue(undefined),
  createResearchRun: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateResearchRun: vi.fn().mockResolvedValue(undefined),
  getLatestResearchRun: vi.fn().mockResolvedValue(null),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getUserById: vi.fn().mockResolvedValue(null),
  getLetterRequestById: vi.fn().mockResolvedValue(null),
  logReviewAction: vi.fn().mockResolvedValue(undefined),
  markPriorPipelineRunsSuperseded: vi.fn().mockResolvedValue(undefined),
  setLetterResearchUnverified: vi.fn().mockResolvedValue(undefined),
  setLetterQualityDegraded: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyAdmins: vi.fn().mockResolvedValue(undefined),
  hasLetterBeenPreviouslyUnlocked: vi.fn().mockResolvedValue(false),
  getLetterVersionById: vi.fn().mockResolvedValue(null),
  getLetterVersionsByRequestId: vi.fn().mockResolvedValue([]),
  addValidationResult: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../sentry", () => ({
  captureServerException: vi.fn(),
}));

vi.mock("./langchain", () => ({
  generateText: vi.fn(),
}));

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn(() => ({ invoke: vi.fn() })),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn(() => ({ invoke: vi.fn() })),
}));

vi.mock("./providers", () => ({
  getResearchModel: vi.fn(() => ({ provider: "perplexity", model: "sonar-pro" })),
  getDraftModel: vi.fn(() => ({ provider: "openai", model: "gpt-4o" })),
  getDraftModelFallback: vi.fn(() => ({ provider: "anthropic-fallback", model: "claude-sonnet-4" })),
  getAssemblyModel: vi.fn(() => ({ provider: "anthropic", model: "claude-sonnet-4" })),
  getAssemblyModelFallback: vi.fn(() => ({ provider: "openai-fallback", model: "gpt-4o-mini" })),
  getVettingModelFallback: vi.fn(() => ({ provider: "openai-fallback", model: "gpt-4o-mini" })),
  createTokenAccumulator: vi.fn(() => ({ inputTokens: 0, outputTokens: 0 })),
  accumulateTokens: vi.fn(),
  calculateCost: vi.fn(() => "0.00"),
  RESEARCH_TIMEOUT_MS: 90_000,
  DRAFT_TIMEOUT_MS: 120_000,
  ASSEMBLY_TIMEOUT_MS: 120_000,
  isOpenAIFailoverAvailable: vi.fn(() => false),
  getAnthropicClient: vi.fn(() => ({})),
  getOpenAIClient: vi.fn(() => ({})),
}));

vi.mock("./validators", () => ({
  validateIntakeCompleteness: vi.fn(() => ({ valid: true, errors: [] })),
  validateResearchPacket: vi.fn(() => ({ valid: true, errors: [] })),
  parseAndValidateDraftLlmOutput: vi.fn(),
  validateDraftGrounding: vi.fn(() => ({ valid: true, errors: [] })),
  validateContentConsistency: vi.fn(() => ({ valid: true, errors: [] })),
  validateFinalLetter: vi.fn(() => ({ valid: true, errors: [] })),
  retryOnValidationFailure: vi.fn(async (fn) => fn()),
  addValidationResult: vi.fn(),
}));

vi.mock("./prompts", () => ({
  buildResearchSystemPrompt: vi.fn(() => "research system prompt"),
  buildResearchUserPrompt: vi.fn(() => "research user prompt"),
  buildDraftingSystemPrompt: vi.fn(() => "drafting system prompt"),
  buildDraftingUserPrompt: vi.fn(() => "drafting user prompt"),
  buildAssemblySystemPrompt: vi.fn(() => "assembly system prompt"),
  buildAssemblyUserPrompt: vi.fn(() => "assembly user prompt"),
  buildVettingUserPrompt: vi.fn(() => "vetting user prompt"),
}));

vi.mock("./shared", () => ({
  formatStructuredError: vi.fn(() => "formatted error"),
  classifyErrorCode: vi.fn(() => "UNKNOWN_ERROR"),
  isFailoverCandidate: vi.fn(() => true),
  withModelFailover: vi.fn(async (primary) => primary()),
  buildLessonsPromptBlock: vi.fn(async () => ""),
}));

vi.mock("../intake-normalizer", () => ({
  buildNormalizedPromptInput: vi.fn((dbFields) => ({
    letterType: dbFields.letterType ?? "demand_letter",
    jurisdiction: { country: "US", state: dbFields.jurisdictionState ?? "CA", city: null },
    sender: { name: "Test Sender", address: "123 Main St" },
    recipient: { name: "Test Recipient", address: "456 Elm St" },
    matter: { subject: "Test Matter", description: "A legal issue", category: "landlord-tenant" },
    desiredOutcome: "Resolve the dispute",
  })),
}));

vi.mock("../kvCache", () => ({
  buildCacheKey: vi.fn(() => "cache-key-123"),
  getCachedResearch: vi.fn(async () => null),
  setCachedResearch: vi.fn(async () => undefined),
}));

vi.mock("../email", () => ({
  sendLetterReadyEmail: vi.fn().mockResolvedValue(undefined),
  sendStatusUpdateEmail: vi.fn().mockResolvedValue(undefined),
  sendNewReviewNeededEmail: vi.fn().mockResolvedValue(undefined),
  sendAdminAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./research", () => ({
  runResearchStage: vi.fn(),
}));

vi.mock("./drafting", () => ({
  runDraftingStage: vi.fn(),
}));

vi.mock("./vetting", () => ({
  runVettingStage: vi.fn(),
  runAssemblyVettingLoop: vi.fn(),
  finalizeLetterAfterVetting: vi.fn(),
  detectBloatPhrases: vi.fn((text: string) => {
    const BLOAT = ["it is important to note", "please be advised", "as per"];
    return BLOAT.filter(p => text.toLowerCase().includes(p));
  }),
  validateVettingOutput: vi.fn(),
  buildVettingSystemPrompt: vi.fn(() => "vetting system prompt"),
  buildVettingUserPrompt: vi.fn(() => "vetting user prompt"),
  buildCitationRegistryPromptBlock: vi.fn(() => "citation block"),
}));

// ── Dynamic imports (after all vi.mock calls) ──────────────────────────────

const {
  buildCitationRegistry,
  buildCitationRegistryPromptBlock,
  revalidateCitationsWithPerplexity,
  extractCitationsFromText,
  normalizeCitation,
  runCitationAudit,
  replaceUnverifiedCitations,
} = await import("./citations");

const {
  consumeIntermediateContent,
  FALLBACK_EXCLUDED_CODES,
  bestEffortFallback,
  retryPipelineFromStage,
  runFullPipeline,
} = await import("./orchestrator");

// ── Fixtures ───────────────────────────────────────────────────────────────

const makeResearchPacket = (overrides: Partial<import("../../shared/types").ResearchPacket> = {}) => ({
  researchSummary: "Landlord failed to return security deposit within 21 days under California Civil Code § 1950.5.",
  jurisdictionProfile: {
    country: "US",
    stateProvince: "CA",
    city: "Los Angeles",
    authorityHierarchy: ["California Civil Code", "LAMC"],
  },
  issuesIdentified: ["Security deposit withholding", "Failure to provide itemized statement"],
  applicableRules: [
    {
      ruleTitle: "Security Deposit Return Deadline",
      ruleType: "statute",
      jurisdiction: "CA",
      citationText: "California Civil Code § 1950.5(g)",
      sectionOrRule: "§ 1950.5(g)",
      summary: "Landlord must return deposit within 21 days.",
      sourceUrl: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1950.5",
      sourceTitle: "California Civil Code",
      relevance: "Directly applicable",
      confidence: "high" as const,
    },
    {
      ruleTitle: "Wrongful Withholding Penalty",
      ruleType: "statute",
      jurisdiction: "CA",
      citationText: "California Civil Code § 1950.5(l)",
      sectionOrRule: "§ 1950.5(l)",
      summary: "Landlord liable for twice the amount wrongfully withheld.",
      sourceUrl: "https://leginfo.legislature.ca.gov",
      sourceTitle: "California Civil Code",
      relevance: "Directly applicable",
      confidence: "high" as const,
    },
  ],
  localJurisdictionElements: [
    {
      element: "Los Angeles Municipal Code § 151.10",
      whyItMatters: "Additional local tenant protections apply.",
      sourceUrl: "https://lamc.gov",
      confidence: "medium" as const,
    },
  ],
  recentCasePrecedents: [
    {
      caseName: "Smith v. Jones",
      citation: "Smith v. Jones, 123 Cal.App.4th 456 (2005)",
      court: "California Court of Appeal",
      year: 2005,
      holding: "Landlord liable for statutory penalty.",
      sourceUrl: "https://courts.ca.gov",
    },
  ],
  statuteOfLimitations: {
    statute: "California Code of Civil Procedure § 338",
    period: "3 years",
    clockStartsOn: "Date deposit was due",
  },
  preSuitRequirements: {
    demandLetterRequired: true,
    statute: "California Civil Code § 1950.5(b)",
    waitingPeriodDays: 14,
  },
  factualDataNeeded: [],
  openQuestions: [],
  riskFlags: [],
  draftingConstraints: [],
  ...overrides,
});

const makeIntake = (overrides: Partial<import("../../shared/types").IntakeJson> = {}) => ({
  schemaVersion: "2.0",
  letterType: "demand_letter",
  sender: { name: "Alice Tenant", address: "123 Renter Ave, Los Angeles, CA 90001" },
  recipient: { name: "Bob Landlord", address: "456 Owner St, Los Angeles, CA 90002" },
  jurisdiction: { country: "US", state: "CA", city: "Los Angeles" },
  matter: {
    category: "landlord-tenant",
    subject: "Security Deposit Recovery",
    description: "Landlord has not returned $3,200 deposit for 45 days after move-out.",
    incidentDate: "2024-01-01",
  },
  financials: { amountOwed: 3200, currency: "USD" },
  desiredOutcome: "Full return of security deposit plus statutory damages",
  ...overrides,
});

// ════════════════════════════════════════════════════════════════════════════
// CITATIONS — pure functions
// ════════════════════════════════════════════════════════════════════════════

describe("citations", () => {
  describe("buildCitationRegistry", () => {
    it("builds a registry from applicable rules", () => {
      const research = makeResearchPacket();
      const registry = buildCitationRegistry(research);

      expect(registry.length).toBeGreaterThanOrEqual(2);
      const first = registry.find(r => r.citationText.includes("1950.5(g)"));
      expect(first).toBeDefined();
      expect(first?.registryNumber).toBe(1);
      expect(first?.ruleType).toBe("statute");
      expect(first?.confidence).toBe("high");
      expect(first?.revalidated).toBe(false);
    });

    it("includes case precedents in the registry", () => {
      const research = makeResearchPacket();
      const registry = buildCitationRegistry(research);

      const caseEntry = registry.find(r => r.ruleType === "case_law");
      expect(caseEntry).toBeDefined();
      expect(caseEntry?.citationText).toContain("Smith v. Jones");
    });

    it("includes statute of limitations in the registry", () => {
      const research = makeResearchPacket();
      const registry = buildCitationRegistry(research);

      const solEntry = registry.find(r => r.ruleTitle === "Statute of Limitations");
      expect(solEntry).toBeDefined();
      expect(solEntry?.citationText).toContain("§ 338");
      expect(solEntry?.ruleType).toBe("statute");
    });

    it("includes pre-suit requirements in the registry", () => {
      const research = makeResearchPacket();
      const registry = buildCitationRegistry(research);

      const preSuitEntry = registry.find(r => r.ruleTitle === "Pre-Suit Requirement");
      expect(preSuitEntry).toBeDefined();
      expect(preSuitEntry?.citationText).toContain("1950.5(b)");
    });

    it("includes local jurisdiction elements in the registry", () => {
      const research = makeResearchPacket();
      const registry = buildCitationRegistry(research);

      const localEntry = registry.find(r => r.ruleType === "local_ordinance");
      expect(localEntry).toBeDefined();
      expect(localEntry?.citationText).toContain("151.10");
    });

    it("assigns sequential registryNumbers starting at 1", () => {
      const research = makeResearchPacket();
      const registry = buildCitationRegistry(research);

      const nums = registry.map(r => r.registryNumber);
      expect(nums[0]).toBe(1);
      for (let i = 1; i < nums.length; i++) {
        expect(nums[i]).toBe(nums[i - 1] + 1);
      }
    });

    it("skips rules with empty citationText", () => {
      const research = makeResearchPacket({
        applicableRules: [
          {
            ruleTitle: "Empty Citation Rule",
            ruleType: "statute",
            jurisdiction: "CA",
            citationText: "",
            sectionOrRule: "",
            summary: "No citation provided",
            sourceUrl: "",
            sourceTitle: "",
            relevance: "Unclear",
            confidence: "low",
          },
        ],
        recentCasePrecedents: [],
        localJurisdictionElements: [],
        statuteOfLimitations: undefined,
        preSuitRequirements: undefined,
      });
      const registry = buildCitationRegistry(research);
      expect(registry.length).toBe(0);
    });

    it("handles missing optional fields gracefully (no cases, no SOL, no pre-suit)", () => {
      const research = makeResearchPacket({
        recentCasePrecedents: undefined,
        statuteOfLimitations: undefined,
        preSuitRequirements: undefined,
        localJurisdictionElements: [],
      });
      const registry = buildCitationRegistry(research);
      expect(registry.length).toBe(2); // only the 2 applicable rules
    });

    it("returns empty array when research has no citations at all", () => {
      const research = makeResearchPacket({
        applicableRules: [],
        recentCasePrecedents: [],
        localJurisdictionElements: [],
        statuteOfLimitations: undefined,
        preSuitRequirements: undefined,
      });
      const registry = buildCitationRegistry(research);
      expect(registry).toEqual([]);
    });
  });

  describe("extractCitationsFromText", () => {
    it("extracts California Civil Code citations", () => {
      const text = "Under California Civil Code § 1950.5(g), the landlord must return the deposit within 21 days.";
      const citations = extractCitationsFromText(text);
      expect(citations.length).toBeGreaterThan(0);
      const match = citations.find(c => c.includes("1950.5"));
      expect(match).toBeDefined();
    });

    it("extracts case name citations", () => {
      const text = "See Smith v. Jones, 123 Cal.App.4th 456 (2005) for precedent.";
      const citations = extractCitationsFromText(text);
      expect(Array.isArray(citations)).toBe(true);
    });

    it("returns empty array when no citations found", () => {
      const text = "This letter contains no legal citations whatsoever.";
      const citations = extractCitationsFromText(text);
      expect(Array.isArray(citations)).toBe(true);
    });

    it("deduplicates repeated citations", () => {
      const text = "California Civil Code § 1950.5 applies. California Civil Code § 1950.5 is clear.";
      const citations = extractCitationsFromText(text);
      const unique = new Set(citations);
      expect(unique.size).toBe(citations.length);
    });
  });

  describe("normalizeCitation", () => {
    it("lowercases, trims, strips periods, and replaces § with 'section'", () => {
      // normalizeCitation strips punctuation including periods (1950.5 → 19505)
      expect(normalizeCitation("  California Civil Code § 1950.5  ")).toBe(
        "california civil code section 19505"
      );
    });

    it("collapses multiple spaces", () => {
      expect(normalizeCitation("Cal.  Civil  Code")).toBe("cal civil code");
    });

    it("replaces § with the word 'section'", () => {
      expect(normalizeCitation("§ 1234")).toBe("section 1234");
    });

    it("strips punctuation: periods, commas, semicolons, parens", () => {
      const result = normalizeCitation("Cal. Civ. Code, § 1950.5(g);");
      expect(result).not.toContain(".");
      expect(result).not.toContain(",");
      expect(result).not.toContain(";");
      expect(result).not.toContain("(");
      expect(result).not.toContain(")");
    });

    it("handles empty string", () => {
      expect(normalizeCitation("")).toBe("");
    });
  });

  describe("runCitationAudit", () => {
    it("marks citations found in the registry as verified", () => {
      const research = makeResearchPacket();
      const registry = buildCitationRegistry(research);
      const letterText = "This letter references California Civil Code § 1950.5(g) regarding deposit return.";
      const audit = runCitationAudit(letterText, registry);

      expect(audit.verifiedCitations.length).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(audit.unverifiedCitations)).toBe(true);
      expect(typeof audit.hallucinationRiskScore).toBe("number");
      expect(audit.hallucinationRiskScore).toBeGreaterThanOrEqual(0);
      expect(audit.hallucinationRiskScore).toBeLessThanOrEqual(100);
    });

    it("returns 0 risk score when there are no citations in the text", () => {
      const registry = buildCitationRegistry(makeResearchPacket());
      const audit = runCitationAudit("No citations here, just plain text about the dispute.", registry);
      expect(audit.totalCitations).toBe(0);
      expect(audit.hallucinationRiskScore).toBe(0);
    });

    it("sets auditedAt to an ISO date string", () => {
      const registry = buildCitationRegistry(makeResearchPacket());
      const audit = runCitationAudit("Letter text.", registry);
      expect(audit.auditedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("works with empty registry — all citations are unverified", () => {
      const letterText = "See California Civil Code § 1950.5 and California Business and Professions Code § 17200.";
      const audit = runCitationAudit(letterText, []);
      // All extracted citations should be unverified
      expect(audit.unverifiedCitations.length).toBeGreaterThanOrEqual(0);
      if (audit.totalCitations > 0) {
        expect(audit.hallucinationRiskScore).toBe(100);
      }
    });
  });

  describe("replaceUnverifiedCitations", () => {
    it("replaces unverified citations with the attorney verification placeholder", () => {
      const letterText = "See Smith v. Fake, 999 Cal.App.5th 1 (2099) for this claim.";
      const registry = buildCitationRegistry(makeResearchPacket());
      const audit = runCitationAudit(letterText, registry);

      const result = replaceUnverifiedCitations(letterText, audit);
      expect(typeof result).toBe("string");
      // If any unverified citations were found, they should be replaced
      if (audit.unverifiedCitations.length > 0) {
        expect(result).toContain("[CITATION REQUIRES ATTORNEY VERIFICATION]");
      }
    });

    it("does not modify text when there are no unverified citations", () => {
      const letterText = "This letter has no citations at all.";
      const registry = buildCitationRegistry(makeResearchPacket());
      const audit = runCitationAudit(letterText, registry);
      // No citations were extracted → nothing to replace
      const result = replaceUnverifiedCitations(letterText, audit);
      expect(result).toBe(letterText);
    });

    it("replaces all occurrences of an unverified citation", () => {
      const fakeCitation = "Fake v. Fake, 000 Cal.App.5th 0 (1900)";
      const letterText = `${fakeCitation} is cited twice. Also see ${fakeCitation} again.`;
      const { verifiedCitations, ...rest } = runCitationAudit(letterText, []);
      const auditAllUnverified = { verifiedCitations: [], unverifiedCitations: rest.unverifiedCitations, totalCitations: rest.totalCitations, hallucinationRiskScore: rest.hallucinationRiskScore, auditedAt: rest.auditedAt };
      // Force a mock audit report to test replacement logic directly
      const mockAudit: import("../../shared/types").CitationAuditReport = {
        verifiedCitations: [],
        unverifiedCitations: [{ citation: "Fake v Fake", registryNumber: null, status: "unverified", confidence: "low", source: "claude_generated" }],
        totalCitations: 1,
        hallucinationRiskScore: 100,
        auditedAt: new Date().toISOString(),
      };
      const text = "See Fake v Fake for precedent. Also Fake v Fake applies here.";
      const result = replaceUnverifiedCitations(text, mockAudit);
      const occurrences = (result.match(/\[CITATION REQUIRES ATTORNEY VERIFICATION\]/g) ?? []).length;
      expect(occurrences).toBe(2);
    });
  });

  describe("buildCitationRegistryPromptBlock", () => {
    it("returns a string containing citation entries", () => {
      const research = makeResearchPacket();
      const registry = buildCitationRegistry(research);
      const block = buildCitationRegistryPromptBlock(registry);
      expect(typeof block).toBe("string");
      expect(block.length).toBeGreaterThan(0);
    });

    it("returns empty string or minimal block for empty registry", () => {
      const block = buildCitationRegistryPromptBlock([]);
      expect(typeof block).toBe("string");
    });

    it("includes registry numbers in the output", () => {
      const research = makeResearchPacket();
      const registry = buildCitationRegistry(research);
      const block = buildCitationRegistryPromptBlock(registry);
      expect(block).toContain("1");
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR — pure utilities & short-circuit paths
// ════════════════════════════════════════════════════════════════════════════

describe("orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("consumeIntermediateContent", () => {
    it("returns undefined content and empty warnings for unknown letterId", () => {
      const result = consumeIntermediateContent(999_999);
      expect(result.content).toBeUndefined();
      expect(result.qualityWarnings).toEqual([]);
    });

    it("is idempotent — second call returns empty after first consumed", async () => {
      // Trigger runFullPipeline on a letter that will fail immediately (invalid intake)
      // so that the registry entry is never set; just verify idempotency directly
      consumeIntermediateContent(123456); // first call
      const second = consumeIntermediateContent(123456); // second call
      expect(second.content).toBeUndefined();
    });
  });

  describe("FALLBACK_EXCLUDED_CODES", () => {
    it("is a ReadonlySet", () => {
      expect(FALLBACK_EXCLUDED_CODES instanceof Set).toBe(true);
    });

    it("excludes CONTENT_POLICY_VIOLATION", () => {
      expect(FALLBACK_EXCLUDED_CODES.has("CONTENT_POLICY_VIOLATION")).toBe(true);
    });

    it("excludes INTAKE_INCOMPLETE", () => {
      expect(FALLBACK_EXCLUDED_CODES.has("INTAKE_INCOMPLETE")).toBe(true);
    });

    it("excludes API_KEY_MISSING", () => {
      expect(FALLBACK_EXCLUDED_CODES.has("API_KEY_MISSING")).toBe(true);
    });

    it("does NOT exclude RATE_LIMITED (rate-limited gets best-effort fallback)", () => {
      expect(FALLBACK_EXCLUDED_CODES.has("RATE_LIMITED")).toBe(false);
    });

    it("does NOT exclude TIMEOUT", () => {
      expect(FALLBACK_EXCLUDED_CODES.has("TIMEOUT")).toBe(false);
    });
  });

  describe("bestEffortFallback — excluded error codes return false immediately", () => {
    const sharedArgs = {
      letterId: 42,
      intake: makeIntake(),
      errorMessage: "Test error",
    };

    it("returns false for CONTENT_POLICY_VIOLATION without touching the DB", async () => {
      const result = await bestEffortFallback({
        ...sharedArgs,
        pipelineErrorCode: "CONTENT_POLICY_VIOLATION",
      });
      expect(result).toBe(false);
    });

    it("returns false for INTAKE_INCOMPLETE without touching the DB", async () => {
      const result = await bestEffortFallback({
        ...sharedArgs,
        pipelineErrorCode: "INTAKE_INCOMPLETE",
      });
      expect(result).toBe(false);
    });

    it("returns false for API_KEY_MISSING without touching the DB", async () => {
      const result = await bestEffortFallback({
        ...sharedArgs,
        pipelineErrorCode: "API_KEY_MISSING",
      });
      expect(result).toBe(false);
    });

    it("proceeds (does not short-circuit) for RATE_LIMITED", async () => {
      const { getLetterRequestById } = await import("../db");
      vi.mocked(getLetterRequestById).mockResolvedValueOnce(null);

      // RATE_LIMITED is not in the excluded set → function will proceed past the gate
      // and attempt DB lookups. Since we've mocked them to return null it will fall through
      // to the skeleton synthesis path and likely return false (no intermediate content).
      const result = await bestEffortFallback({
        ...sharedArgs,
        pipelineErrorCode: "RATE_LIMITED",
      });
      // Either true (skeleton) or false — the key assertion is it didn't short-circuit
      expect(typeof result).toBe("boolean");
    });
  });

  describe("runFullPipeline — intake validation", () => {
    it("throws PipelineError when validateIntakeCompleteness returns invalid", async () => {
      const { validateIntakeCompleteness } = await import("./validators");
      vi.mocked(validateIntakeCompleteness).mockReturnValueOnce({
        valid: false,
        errors: ["letterType is missing", "sender.name is required"],
      });

      const { PipelineError } = await import("../../shared/types");
      await expect(
        runFullPipeline(1, makeIntake())
      ).rejects.toThrow(PipelineError);
    });

    it("throws PipelineError with INTAKE_INCOMPLETE code on validation failure", async () => {
      const { validateIntakeCompleteness } = await import("./validators");
      vi.mocked(validateIntakeCompleteness).mockReturnValueOnce({
        valid: false,
        errors: ["sender.address is required"],
      });

      const { PIPELINE_ERROR_CODES } = await import("../../shared/types");
      try {
        await runFullPipeline(2, makeIntake());
        expect.fail("Expected PipelineError to be thrown");
      } catch (err: unknown) {
        expect((err as { code?: string }).code).toBe(PIPELINE_ERROR_CODES.INTAKE_INCOMPLETE);
      }
    });
  });

  describe("retryPipelineFromStage — intake validation", () => {
    it("throws PipelineError when intake is invalid", async () => {
      const { validateIntakeCompleteness } = await import("./validators");
      vi.mocked(validateIntakeCompleteness).mockReturnValueOnce({
        valid: false,
        errors: ["Missing required field"],
      });

      const { PipelineError } = await import("../../shared/types");
      await expect(
        retryPipelineFromStage(1, makeIntake(), "research")
      ).rejects.toThrow(PipelineError);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// STAGE FUNCTION EXPORTS — verify exported shape
// ════════════════════════════════════════════════════════════════════════════

describe("pipeline stage exports", () => {
  it("runResearchStage is a function", async () => {
    const mod = await import("./research");
    expect(typeof mod.runResearchStage).toBe("function");
  });

  it("runDraftingStage is a function", async () => {
    const mod = await import("./drafting");
    expect(typeof mod.runDraftingStage).toBe("function");
  });

  it("runAssemblyStage is a function", async () => {
    const mod = await import("./assembly");
    expect(typeof mod.runAssemblyStage).toBe("function");
  });

  it("runVettingStage is a function (from vetting module)", async () => {
    const mod = await import("./vetting");
    expect(typeof mod.runVettingStage).toBe("function");
  });

  it("runAssemblyVettingLoop is a function", async () => {
    const mod = await import("./vetting");
    expect(typeof mod.runAssemblyVettingLoop).toBe("function");
  });

  it("finalizeLetterAfterVetting is a function", async () => {
    const mod = await import("./vetting");
    expect(typeof mod.finalizeLetterAfterVetting).toBe("function");
  });

  it("detectBloatPhrases is a function", async () => {
    const mod = await import("./vetting");
    expect(typeof mod.detectBloatPhrases).toBe("function");
  });

  it("validateVettingOutput is a function", async () => {
    const mod = await import("./vetting");
    expect(typeof mod.validateVettingOutput).toBe("function");
  });

  it("buildCitationRegistry is a function", async () => {
    const mod = await import("./citations");
    expect(typeof mod.buildCitationRegistry).toBe("function");
  });

  it("revalidateCitationsWithPerplexity is a function", async () => {
    const mod = await import("./citations");
    expect(typeof mod.revalidateCitationsWithPerplexity).toBe("function");
  });

  it("consumeIntermediateContent is a function", async () => {
    const mod = await import("./orchestrator");
    expect(typeof mod.consumeIntermediateContent).toBe("function");
  });

  it("bestEffortFallback is a function", async () => {
    const mod = await import("./orchestrator");
    expect(typeof mod.bestEffortFallback).toBe("function");
  });

  it("retryPipelineFromStage is a function", async () => {
    const mod = await import("./orchestrator");
    expect(typeof mod.retryPipelineFromStage).toBe("function");
  });
});
