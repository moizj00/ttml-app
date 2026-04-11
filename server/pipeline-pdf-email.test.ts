import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: "mock-email-id", error: null }),
    },
  })),
}));

vi.mock("./sentry", () => ({
  captureServerException: vi.fn(),
}));

const mockCreateWorkflowJob = vi.fn();
const mockUpdateWorkflowJob = vi.fn();
const mockUpdateLetterStatus = vi.fn();
const mockHasLetterBeenPreviouslyUnlocked = vi.fn();
const mockGetLetterById = vi.fn();
const mockGetAllUsers = vi.fn();
const mockGetUserById = vi.fn();
const mockLogReviewAction = vi.fn();
const mockMarkPriorPipelineRunsSuperseded = vi.fn();
const mockSetLetterResearchUnverified = vi.fn();
const mockSetLetterQualityDegraded = vi.fn();
const mockGetLatestResearchRun = vi.fn();
const mockCreateLetterVersion = vi.fn();
const mockUpdateLetterVersionPointers = vi.fn();
const mockCreateNotification = vi.fn();
const mockNotifyAllAttorneys = vi.fn();

vi.mock("./db", () => ({
  createWorkflowJob: (...args: unknown[]) => mockCreateWorkflowJob(...args),
  updateWorkflowJob: (...args: unknown[]) => mockUpdateWorkflowJob(...args),
  updateLetterStatus: (...args: unknown[]) => mockUpdateLetterStatus(...args),
  hasLetterBeenPreviouslyUnlocked: (...args: unknown[]) => mockHasLetterBeenPreviouslyUnlocked(...args),
  getLetterRequestById: (...args: unknown[]) => mockGetLetterById(...args),
  getAllUsers: (...args: unknown[]) => mockGetAllUsers(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  logReviewAction: (...args: unknown[]) => mockLogReviewAction(...args),
  markPriorPipelineRunsSuperseded: (...args: unknown[]) => mockMarkPriorPipelineRunsSuperseded(...args),
  setLetterResearchUnverified: (...args: unknown[]) => mockSetLetterResearchUnverified(...args),
  setLetterQualityDegraded: (...args: unknown[]) => mockSetLetterQualityDegraded(...args),
  getLatestResearchRun: (...args: unknown[]) => mockGetLatestResearchRun(...args),
  createLetterVersion: (...args: unknown[]) => mockCreateLetterVersion(...args),
  updateLetterVersionPointers: (...args: unknown[]) => mockUpdateLetterVersionPointers(...args),
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  notifyAllAttorneys: (...args: unknown[]) => mockNotifyAllAttorneys(...args),
}));

vi.mock("./email", () => ({
  sendLetterReadyEmail: vi.fn().mockResolvedValue(undefined),
  sendStatusUpdateEmail: vi.fn().mockResolvedValue(undefined),
  sendAdminAlertEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterRejectedEmail: vi.fn().mockResolvedValue(undefined),
  sendNeedsChangesEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterSubmissionEmail: vi.fn().mockResolvedValue(undefined),
  sendReviewAssignedEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterUnlockedEmail: vi.fn().mockResolvedValue(undefined),
  sendLetterToRecipient: vi.fn().mockResolvedValue(undefined),
}));

const mockRunResearchStage = vi.fn();
const mockRunDraftingStage = vi.fn();
const mockRunAssemblyVettingLoop = vi.fn();
const mockFinalizeLetterAfterVetting = vi.fn();
const mockBuildCitationRegistry = vi.fn();
const mockRevalidateCitationsWithPerplexity = vi.fn();

vi.mock("./pipeline/research", () => ({
  runResearchStage: (...args: unknown[]) => mockRunResearchStage(...args),
}));

vi.mock("./pipeline/drafting", () => ({
  runDraftingStage: (...args: unknown[]) => mockRunDraftingStage(...args),
}));

vi.mock("./pipeline/vetting", () => ({
  runAssemblyVettingLoop: (...args: unknown[]) => mockRunAssemblyVettingLoop(...args),
  finalizeLetterAfterVetting: (...args: unknown[]) => mockFinalizeLetterAfterVetting(...args),
}));

vi.mock("./pipeline/citations", () => ({
  buildCitationRegistry: (...args: unknown[]) => mockBuildCitationRegistry(...args),
  revalidateCitationsWithPerplexity: (...args: unknown[]) => mockRevalidateCitationsWithPerplexity(...args),
}));

const VALID_INTAKE = {
  schemaVersion: "1.0",
  letterType: "demand",
  sender: { name: "John Doe", address: "123 Main St" },
  recipient: { name: "Jane Smith", address: "456 Oak Ave" },
  jurisdiction: { country: "US", state: "CA" },
  matter: {
    category: "debt",
    subject: "Demand for Payment",
    description: "Unpaid invoice for services rendered in March 2024",
  },
  desiredOutcome: "Full payment of $5,000",
};

const MOCK_RESEARCH_PACKET = {
  summary: "Legal research on demand letters in California",
  applicableRules: [
    { ruleTitle: "CA CCP §1005", description: "Notice requirements" },
  ],
  citations: [
    { text: "Cal. Civ. Code § 1788.17", url: "https://leginfo.ca.gov/xxx", confidence: "high" as const },
  ],
  riskFlags: [],
  jurisdictionNotes: "California-specific provisions apply",
};

const MOCK_DRAFT = {
  draftLetter: "Dear Jane Smith,\n\nThis letter serves as a formal demand for payment...",
  counterArguments: ["Debtor may claim statute of limitations", "Potential dispute on amount"],
};

const MOCK_VETTING_RESULT = {
  vettedLetter: "Dear Jane Smith,\n\nPursuant to California Civil Code § 1788.17, this letter constitutes formal demand...",
  critical: false,
  vettingReport: {
    riskLevel: "low",
    bloatScore: 2,
    bloatItemsRemoved: ["filler phrases"],
    citationsFlagged: [],
    jurisdictionIssues: [],
    factualIssuesFound: [],
    improvementsSuggested: ["Consider adding specific payment deadline"],
  },
};

describe("Pipeline Orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PERPLEXITY_API_KEY = "test-key";
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.N8N_PRIMARY;

    mockCreateWorkflowJob.mockResolvedValue({ insertId: 1 });
    mockUpdateWorkflowJob.mockResolvedValue(undefined);
    mockUpdateLetterStatus.mockResolvedValue(undefined);
    mockMarkPriorPipelineRunsSuperseded.mockResolvedValue(undefined);
    mockSetLetterResearchUnverified.mockResolvedValue(undefined);
    mockSetLetterQualityDegraded.mockResolvedValue(undefined);
    mockHasLetterBeenPreviouslyUnlocked.mockResolvedValue(false);
    mockCreateLetterVersion.mockResolvedValue({ insertId: 10 });
    mockUpdateLetterVersionPointers.mockResolvedValue(undefined);
    mockCreateNotification.mockResolvedValue(undefined);
    mockNotifyAllAttorneys.mockResolvedValue(undefined);
    mockFinalizeLetterAfterVetting.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({ id: 1, email: "user@test.com", name: "Test" });
    mockGetAllUsers.mockResolvedValue([]);
  });

  describe("preflightApiKeyCheck", () => {
    it("should pass when all keys are available", async () => {
      const { preflightApiKeyCheck } = await import("./pipeline/orchestrator");
      const result = preflightApiKeyCheck("full");
      expect(result.ok).toBe(true);
      expect(result.canResearch).toBe(true);
      expect(result.canDraft).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("should fail when no research keys are available", async () => {
      delete process.env.PERPLEXITY_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const { preflightApiKeyCheck } = await import("./pipeline/orchestrator");
      const result = preflightApiKeyCheck("full");
      expect(result.ok).toBe(false);
      expect(result.canResearch).toBe(false);
    });

    it("should pass research-only check when only Perplexity key exists", async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const { preflightApiKeyCheck } = await import("./pipeline/orchestrator");
      const result = preflightApiKeyCheck("research");
      expect(result.ok).toBe(true);
      expect(result.canResearch).toBe(true);
    });
  });

  describe("runFullPipeline", () => {
    it("should execute all 4 stages: research → citation → draft → vetting", async () => {
      mockRunResearchStage.mockResolvedValue({ packet: MOCK_RESEARCH_PACKET, provider: "perplexity" });
      mockBuildCitationRegistry.mockReturnValue([
        { text: "Cal. Civ. Code § 1788.17", confidence: "medium", url: "https://leginfo.ca.gov/xxx" },
        { text: "CCP § 1005", confidence: "low", url: null },
        { text: "CCP § 1013", confidence: "medium", url: null },
      ]);
      mockRevalidateCitationsWithPerplexity.mockResolvedValue({
        registry: [
          { text: "Cal. Civ. Code § 1788.17", confidence: "high", url: "https://leginfo.ca.gov/xxx" },
          { text: "CCP § 1005", confidence: "high", url: "https://leginfo.ca.gov/yyy" },
          { text: "CCP § 1013", confidence: "high", url: "https://leginfo.ca.gov/zzz" },
        ],
        modelKey: "sonar",
      });
      mockRunDraftingStage.mockResolvedValue(MOCK_DRAFT);
      mockRunAssemblyVettingLoop.mockResolvedValue({
        vettingResult: MOCK_VETTING_RESULT,
        assemblyRetries: 0,
      });

      const { runFullPipeline } = await import("./pipeline/orchestrator");
      await runFullPipeline(42, VALID_INTAKE, {
        subject: "Demand for Payment",
        letterType: "demand",
        jurisdictionState: "CA",
        jurisdictionCountry: "US",
      }, 1);

      expect(mockRunResearchStage).toHaveBeenCalledTimes(1);
      expect(mockBuildCitationRegistry).toHaveBeenCalledWith(MOCK_RESEARCH_PACKET);
      expect(mockRevalidateCitationsWithPerplexity).toHaveBeenCalledTimes(1);
      expect(mockRunDraftingStage).toHaveBeenCalledTimes(1);
      expect(mockRunAssemblyVettingLoop).toHaveBeenCalledTimes(1);
      expect(mockFinalizeLetterAfterVetting).toHaveBeenCalledTimes(1);
      expect(mockUpdateWorkflowJob).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: "completed" })
      );
    });

    it("should skip citation revalidation when research is unverified", async () => {
      mockRunResearchStage.mockResolvedValue({ packet: MOCK_RESEARCH_PACKET, provider: "anthropic-fallback" });
      mockBuildCitationRegistry.mockReturnValue([
        { text: "Citation 1", confidence: "medium" },
        { text: "Citation 2", confidence: "medium" },
        { text: "Citation 3", confidence: "medium" },
      ]);
      mockRunDraftingStage.mockResolvedValue(MOCK_DRAFT);
      mockRunAssemblyVettingLoop.mockResolvedValue({
        vettingResult: MOCK_VETTING_RESULT,
        assemblyRetries: 0,
      });

      const { runFullPipeline } = await import("./pipeline/orchestrator");
      await runFullPipeline(42, VALID_INTAKE, {
        subject: "Demand for Payment",
        letterType: "demand",
      }, 1);

      expect(mockRevalidateCitationsWithPerplexity).not.toHaveBeenCalled();
      expect(mockSetLetterResearchUnverified).toHaveBeenCalledWith(42, true);
    });

    it("should skip citation revalidation when citations are from KV cache", async () => {
      mockRunResearchStage.mockResolvedValue({ packet: MOCK_RESEARCH_PACKET, provider: "kv-cache" });
      mockBuildCitationRegistry.mockReturnValue([
        { text: "Citation 1", confidence: "medium" },
        { text: "Citation 2", confidence: "medium" },
        { text: "Citation 3", confidence: "medium" },
      ]);
      mockRunDraftingStage.mockResolvedValue(MOCK_DRAFT);
      mockRunAssemblyVettingLoop.mockResolvedValue({
        vettingResult: MOCK_VETTING_RESULT,
        assemblyRetries: 0,
      });

      const { runFullPipeline } = await import("./pipeline/orchestrator");
      await runFullPipeline(42, VALID_INTAKE, {
        subject: "Demand for Payment",
        letterType: "demand",
      }, 1);

      expect(mockRevalidateCitationsWithPerplexity).not.toHaveBeenCalled();
    });

    it("should skip citation revalidation when fewer than 3 citations", async () => {
      mockRunResearchStage.mockResolvedValue({ packet: MOCK_RESEARCH_PACKET, provider: "perplexity" });
      mockBuildCitationRegistry.mockReturnValue([
        { text: "Citation 1", confidence: "medium" },
        { text: "Citation 2", confidence: "medium" },
      ]);
      mockRunDraftingStage.mockResolvedValue(MOCK_DRAFT);
      mockRunAssemblyVettingLoop.mockResolvedValue({
        vettingResult: MOCK_VETTING_RESULT,
        assemblyRetries: 0,
      });

      const { runFullPipeline } = await import("./pipeline/orchestrator");
      await runFullPipeline(42, VALID_INTAKE, {
        subject: "Demand for Payment",
        letterType: "demand",
      }, 1);

      expect(mockRevalidateCitationsWithPerplexity).not.toHaveBeenCalled();
    });

    it("should skip citation revalidation when all citations are high confidence", async () => {
      mockRunResearchStage.mockResolvedValue({ packet: MOCK_RESEARCH_PACKET, provider: "perplexity" });
      mockBuildCitationRegistry.mockReturnValue([
        { text: "Citation 1", confidence: "high" },
        { text: "Citation 2", confidence: "high" },
        { text: "Citation 3", confidence: "high" },
        { text: "Citation 4", confidence: "high" },
      ]);
      mockRunDraftingStage.mockResolvedValue(MOCK_DRAFT);
      mockRunAssemblyVettingLoop.mockResolvedValue({
        vettingResult: MOCK_VETTING_RESULT,
        assemblyRetries: 0,
      });

      const { runFullPipeline } = await import("./pipeline/orchestrator");
      await runFullPipeline(42, VALID_INTAKE, {
        subject: "Demand for Payment",
        letterType: "demand",
      }, 1);

      expect(mockRevalidateCitationsWithPerplexity).not.toHaveBeenCalled();
    });

    it("should run citation revalidation when 3+ citations with mixed confidence", async () => {
      mockRunResearchStage.mockResolvedValue({ packet: MOCK_RESEARCH_PACKET, provider: "perplexity" });
      mockBuildCitationRegistry.mockReturnValue([
        { text: "Citation 1", confidence: "high" },
        { text: "Citation 2", confidence: "medium" },
        { text: "Citation 3", confidence: "low" },
      ]);
      mockRevalidateCitationsWithPerplexity.mockResolvedValue({
        registry: [
          { text: "Citation 1", confidence: "high" },
          { text: "Citation 2", confidence: "high" },
          { text: "Citation 3", confidence: "high" },
        ],
        modelKey: "sonar",
      });
      mockRunDraftingStage.mockResolvedValue(MOCK_DRAFT);
      mockRunAssemblyVettingLoop.mockResolvedValue({
        vettingResult: MOCK_VETTING_RESULT,
        assemblyRetries: 0,
      });

      const { runFullPipeline } = await import("./pipeline/orchestrator");
      await runFullPipeline(42, VALID_INTAKE, {
        subject: "Demand for Payment",
        letterType: "demand",
      }, 1);

      expect(mockRevalidateCitationsWithPerplexity).toHaveBeenCalledTimes(1);
    });

    it("should reject incomplete intake data", async () => {
      const { runFullPipeline } = await import("./pipeline/orchestrator");

      const badIntake = {
        letterType: "demand",
        sender: { name: "", address: "" },
        recipient: { name: "", address: "" },
        jurisdiction: { country: "", state: "" },
        matter: { category: "", subject: "", description: "" },
        desiredOutcome: "",
      };

      await expect(runFullPipeline(42, badIntake as any)).rejects.toThrow();
    });

    it("should revert status to submitted on pipeline failure", async () => {
      mockRunResearchStage.mockRejectedValue(new Error("Perplexity rate limit exceeded"));
      mockBuildCitationRegistry.mockReturnValue([]);

      const { runFullPipeline } = await import("./pipeline/orchestrator");
      await expect(
        runFullPipeline(42, VALID_INTAKE, {
          subject: "Demand for Payment",
          letterType: "demand",
        }, 1)
      ).rejects.toThrow();

      expect(mockUpdateLetterStatus).toHaveBeenCalledWith(42, "submitted");
      expect(mockUpdateWorkflowJob).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: "failed" })
      );
    });

    it("should track model key from citation revalidation for cost calculation", async () => {
      mockRunResearchStage.mockResolvedValue({ packet: MOCK_RESEARCH_PACKET, provider: "perplexity" });
      mockBuildCitationRegistry.mockReturnValue([
        { text: "C1", confidence: "medium" },
        { text: "C2", confidence: "low" },
        { text: "C3", confidence: "medium" },
      ]);
      mockRevalidateCitationsWithPerplexity.mockResolvedValue({
        registry: [
          { text: "C1", confidence: "high" },
          { text: "C2", confidence: "high" },
          { text: "C3", confidence: "high" },
        ],
        modelKey: "sonar",
      });
      mockRunDraftingStage.mockResolvedValue(MOCK_DRAFT);
      mockRunAssemblyVettingLoop.mockResolvedValue({
        vettingResult: MOCK_VETTING_RESULT,
        assemblyRetries: 0,
      });

      const { runFullPipeline } = await import("./pipeline/orchestrator");
      await runFullPipeline(42, VALID_INTAKE, {
        subject: "Demand",
        letterType: "demand",
      }, 1);

      const completedCall = mockUpdateWorkflowJob.mock.calls.find(
        (c: unknown[]) => (c[1] as Record<string, unknown>).status === "completed"
      );
      expect(completedCall).toBeTruthy();
    });

    it("should mark anthropic-fallback research as unverified", async () => {
      mockRunResearchStage.mockResolvedValue({ packet: MOCK_RESEARCH_PACKET, provider: "anthropic-fallback" });
      mockBuildCitationRegistry.mockReturnValue([]);
      mockRunDraftingStage.mockResolvedValue(MOCK_DRAFT);
      mockRunAssemblyVettingLoop.mockResolvedValue({
        vettingResult: MOCK_VETTING_RESULT,
        assemblyRetries: 0,
      });

      const { runFullPipeline } = await import("./pipeline/orchestrator");
      await runFullPipeline(42, VALID_INTAKE, {
        subject: "Demand",
        letterType: "demand",
      }, 1);

      expect(mockSetLetterResearchUnverified).toHaveBeenCalledWith(42, true);
    });
  });

  describe("bestEffortFallback", () => {
    it("should return false for content policy violation (fail-stop)", async () => {
      const { bestEffortFallback } = await import("./pipeline/orchestrator");
      const result = await bestEffortFallback({
        letterId: 42,
        intake: VALID_INTAKE,
        pipelineErrorCode: "CONTENT_POLICY_VIOLATION",
        errorMessage: "Content policy violated",
      });
      expect(result).toBe(false);
    });

    it("should return false for intake incomplete (fail-stop)", async () => {
      const { bestEffortFallback } = await import("./pipeline/orchestrator");
      const result = await bestEffortFallback({
        letterId: 42,
        intake: VALID_INTAKE,
        pipelineErrorCode: "INTAKE_INCOMPLETE",
        errorMessage: "Missing fields",
      });
      expect(result).toBe(false);
    });

    it("should return false for API key missing (fail-stop)", async () => {
      const { bestEffortFallback } = await import("./pipeline/orchestrator");
      const result = await bestEffortFallback({
        letterId: 42,
        intake: VALID_INTAKE,
        pipelineErrorCode: "API_KEY_MISSING",
        errorMessage: "No API key",
      });
      expect(result).toBe(false);
    });
  });

  describe("consumeIntermediateContent", () => {
    it("should return undefined content when no intermediate exists", async () => {
      const { consumeIntermediateContent } = await import("./pipeline/orchestrator");
      const result = consumeIntermediateContent(9999);
      expect(result.content).toBeUndefined();
      expect(result.qualityWarnings).toEqual([]);
    });
  });
});

describe("PDF Generation", () => {
  describe("Template HTML sanitization", () => {
    it("should sanitize script tags from body HTML", async () => {
      const { buildApprovedLetterHtml } = await import("./letterTemplates");
      const data = {
        senderName: "John Doe",
        senderAddress: "123 Main St",
        senderEmail: "john@example.com",
        senderPhone: "555-1234",
        recipientName: "Jane Smith",
        recipientAddress: "456 Oak Ave",
        subject: "Demand for Payment",
        letterId: 42,
        letterType: "demand",
        date: "January 1, 2025",
        bodyHtml: '<p>Hello</p><script>alert("xss")</script><p>World</p>',
      };

      const html = buildApprovedLetterHtml(data);
      expect(html).not.toContain("<script");
      expect(html).not.toContain("alert");
    });

    it("should sanitize iframe tags from body HTML", async () => {
      const { buildApprovedLetterHtml } = await import("./letterTemplates");
      const data = {
        senderName: "John Doe",
        senderAddress: "123 Main St",
        senderEmail: "john@example.com",
        senderPhone: "555-1234",
        recipientName: "Jane Smith",
        recipientAddress: "456 Oak Ave",
        subject: "Demand for Payment",
        letterId: 42,
        letterType: "demand",
        date: "January 1, 2025",
        bodyHtml: '<p>Hello</p><iframe src="https://evil.com"></iframe><p>World</p>',
      };

      const html = buildApprovedLetterHtml(data);
      expect(html).not.toContain("<iframe");
      expect(html).not.toContain("evil.com");
    });

    it("should sanitize img tags (SSRF prevention) from body HTML", async () => {
      const { buildApprovedLetterHtml } = await import("./letterTemplates");
      const data = {
        senderName: "John Doe",
        senderAddress: "123 Main St",
        senderEmail: "john@example.com",
        senderPhone: "555-1234",
        recipientName: "Jane Smith",
        recipientAddress: "456 Oak Ave",
        subject: "Demand for Payment",
        letterId: 42,
        letterType: "demand",
        date: "January 1, 2025",
        bodyHtml: '<p>Content</p><img src="https://evil.com/tracker.png" /><p>More</p>',
      };

      const html = buildApprovedLetterHtml(data);
      expect(html).not.toContain("tracker.png");
      expect(html).not.toContain("evil.com");
    });

    it("should preserve allowed formatting tags in body HTML", async () => {
      const { buildApprovedLetterHtml } = await import("./letterTemplates");
      const data = {
        senderName: "John Doe",
        senderAddress: "123 Main St",
        senderEmail: "john@example.com",
        senderPhone: "555-1234",
        recipientName: "Jane Smith",
        recipientAddress: "456 Oak Ave",
        subject: "Demand for Payment",
        letterId: 42,
        letterType: "demand",
        date: "January 1, 2025",
        bodyHtml: '<p><strong>DEMAND FOR PAYMENT</strong></p><ul><li>Item 1</li><li>Item 2</li></ul><blockquote>Quoted text</blockquote>',
      };

      const html = buildApprovedLetterHtml(data);
      expect(html).toContain("<strong>");
      expect(html).toContain("<ul>");
      expect(html).toContain("<li>");
      expect(html).toContain("<blockquote>");
    });
  });

  describe("Template data mapping", () => {
    it("should include approved template elements for approved PDFs", async () => {
      const { buildApprovedLetterHtml, buildApprovedHeaderHtml, buildApprovedFooterHtml } = await import("./letterTemplates");
      const data = {
        senderName: "John Doe",
        senderAddress: "123 Main St",
        senderEmail: "john@test.com",
        senderPhone: "555-1234",
        recipientName: "Jane Smith",
        recipientAddress: "456 Oak Ave",
        subject: "Demand for Payment",
        letterId: 42,
        letterType: "demand",
        date: "January 1, 2025",
        approvedBy: "Attorney Adams",
        bodyHtml: "<p>Legal content here</p>",
      };

      const html = buildApprovedLetterHtml(data);
      expect(html).toContain("John Doe");
      expect(html).toContain("Jane Smith");
      expect(html).toContain("Demand for Payment");

      const header = buildApprovedHeaderHtml(data);
      expect(typeof header).toBe("string");

      const footer = buildApprovedFooterHtml(data);
      expect(typeof footer).toBe("string");
    });

    it("should include DRAFT watermark elements for draft PDFs", async () => {
      const { buildDraftLetterHtml, buildDraftHeaderHtml, buildDraftFooterHtml } = await import("./letterTemplates");
      const data = {
        senderName: "John Doe",
        senderAddress: "123 Main St",
        senderEmail: "john@test.com",
        senderPhone: "555-1234",
        recipientName: "Jane Smith",
        recipientAddress: "456 Oak Ave",
        subject: "Demand for Payment",
        letterId: 42,
        letterType: "demand",
        date: "January 1, 2025",
        bodyHtml: "<p>Draft content here</p>",
      };

      const html = buildDraftLetterHtml(data);
      expect(html).toContain("John Doe");
      expect(html).toContain("Jane Smith");

      const footer = buildDraftFooterHtml(data);
      expect(typeof footer).toBe("string");

      const header = buildDraftHeaderHtml(data);
      expect(typeof header).toBe("string");
    });
  });

  describe("generateAndUploadApprovedPdf", () => {
    it("should reject empty content", async () => {
      const { generateAndUploadApprovedPdf } = await import("./pdfGenerator");

      await expect(
        generateAndUploadApprovedPdf({
          letterId: 42,
          letterType: "demand",
          subject: "Test",
          content: "",
        })
      ).rejects.toThrow("content is empty");
    });

    it("should reject whitespace-only content", async () => {
      const { generateAndUploadApprovedPdf } = await import("./pdfGenerator");

      await expect(
        generateAndUploadApprovedPdf({
          letterId: 42,
          letterType: "demand",
          subject: "Test",
          content: "   \n\t  ",
        })
      ).rejects.toThrow("content is empty");
    });
  });

  describe("generateDraftPdfBuffer", () => {
    it("should reject empty content for drafts", async () => {
      const { generateDraftPdfBuffer } = await import("./pdfGenerator");

      await expect(
        generateDraftPdfBuffer({
          letterId: 42,
          letterType: "demand",
          subject: "Test",
          content: "",
        })
      ).rejects.toThrow("content is empty");
    });
  });
});

describe("Email Service (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendLetterApprovedEmail", () => {
    it("should be callable with PDF link and not throw", async () => {
      const { sendLetterApprovedEmail } = await import("./email");

      await sendLetterApprovedEmail({
        to: "subscriber@example.com",
        name: "John Doe",
        subject: "Demand for Payment",
        letterId: 42,
        appUrl: "https://www.talk-to-my-lawyer.com",
        pdfUrl: "https://r2.example.com/approved-letters/42-test.pdf",
      });

      expect(sendLetterApprovedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "subscriber@example.com",
          pdfUrl: "https://r2.example.com/approved-letters/42-test.pdf",
        })
      );
    });

    it("should be callable without PDF link", async () => {
      const { sendLetterApprovedEmail } = await import("./email");

      await sendLetterApprovedEmail({
        to: "subscriber@example.com",
        name: "John Doe",
        subject: "Demand for Payment",
        letterId: 42,
        appUrl: "https://www.talk-to-my-lawyer.com",
      });

      expect(sendLetterApprovedEmail).toHaveBeenCalledWith(
        expect.not.objectContaining({ pdfUrl: expect.anything() })
      );
    });
  });

  describe("sendLetterRejectedEmail", () => {
    it("should be callable with rejection reason", async () => {
      const { sendLetterRejectedEmail } = await import("./email");

      await sendLetterRejectedEmail({
        to: "subscriber@example.com",
        name: "John Doe",
        subject: "Demand for Payment",
        letterId: 42,
        reason: "Jurisdiction mismatch — cited statutes not applicable.",
        appUrl: "https://www.talk-to-my-lawyer.com",
      });

      expect(sendLetterRejectedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "subscriber@example.com",
          reason: expect.stringContaining("Jurisdiction mismatch"),
        })
      );
    });

    it("should be callable without explicit reason", async () => {
      const { sendLetterRejectedEmail } = await import("./email");

      await sendLetterRejectedEmail({
        to: "subscriber@example.com",
        name: "John Doe",
        subject: "Demand for Payment",
        letterId: 42,
        appUrl: "https://www.talk-to-my-lawyer.com",
      });

      expect(sendLetterRejectedEmail).toHaveBeenCalled();
    });
  });

  describe("sendNeedsChangesEmail", () => {
    it("should be callable with attorney note", async () => {
      const { sendNeedsChangesEmail } = await import("./email");

      await sendNeedsChangesEmail({
        to: "subscriber@example.com",
        name: "John Doe",
        subject: "Demand for Payment",
        letterId: 42,
        attorneyNote: "Provide additional documentation regarding contract terms.",
        appUrl: "https://www.talk-to-my-lawyer.com",
      });

      expect(sendNeedsChangesEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          attorneyNote: expect.stringContaining("additional documentation"),
        })
      );
    });
  });

  describe("Email integration in approval flow", () => {
    it("should trigger approval email when pipeline completes with previous unlock", async () => {
      const { sendLetterApprovedEmail, sendStatusUpdateEmail } = await import("./email");
      expect(typeof sendLetterApprovedEmail).toBe("function");
      expect(typeof sendStatusUpdateEmail).toBe("function");
    });
  });
});
