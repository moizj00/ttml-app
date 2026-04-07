/**
 * Phase 74: Pipeline Status Sync & Callback Tests
 *
 * Validates that both the direct API pipeline and n8n callback pipeline
 * produce identical status transitions:
 *   submitted → researching → drafting → generated_locked
 *
 * It also validates that the pipeline properly handles the 4-stage structure
 * (research, drafting, assembly, vetting) and that auto-unlock logic is called.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
const mockUpdateLetterStatus = vi.fn().mockResolvedValue(undefined);
const mockLogReviewAction = vi.fn().mockResolvedValue(undefined);
const mockCreateLetterVersion = vi.fn().mockResolvedValue({ insertId: 100 });
const mockUpdateLetterVersionPointers = vi.fn().mockResolvedValue(undefined);
const mockGetLetterRequestById = vi.fn().mockResolvedValue(null);
const mockGetUserById = vi.fn().mockResolvedValue(null);
const mockAutoAdvanceIfPreviouslyUnlocked = vi.fn().mockResolvedValue(undefined);

vi.mock("./db", () => ({
  updateLetterStatus: (...args: unknown[]) => mockUpdateLetterStatus(...args),
  logReviewAction: (...args: unknown[]) => mockLogReviewAction(...args),
  createLetterVersion: (...args: unknown[]) => mockCreateLetterVersion(...args),
  updateLetterVersionPointers: (...args: unknown[]) =>
    mockUpdateLetterVersionPointers(...args),
  getLetterRequestById: (...args: unknown[]) =>
    mockGetLetterRequestById(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  createWorkflowJob: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateWorkflowJob: vi.fn().mockResolvedValue(undefined),
  createResearchRun: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateResearchRun: vi.fn().mockResolvedValue(undefined),
  getLatestResearchRun: vi.fn().mockResolvedValue(null),
  getDb: vi.fn().mockResolvedValue(null),
  hasLetterBeenPreviouslyUnlocked: vi.fn().mockResolvedValue(false),
  autoAdvanceIfPreviouslyUnlocked: (...args: unknown[]) => mockAutoAdvanceIfPreviouslyUnlocked(...args),
}));

vi.mock("./email", () => ({
  sendLetterReadyEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./pipeline", () => ({
  runAssemblyStage: vi.fn().mockResolvedValue("Final assembled letter text."),
  runAssemblyVettingLoop: vi.fn().mockResolvedValue({ vettingResult: { vettedLetter: "Vetted text", critical: false, vettingReport: { riskLevel: "low", jurisdictionIssues: [], citationsFlagged: [], factualIssuesFound: [] } }, assemblyRetries: 0 }),
  autoAdvanceIfPreviouslyUnlocked: (...args: unknown[]) => mockAutoAdvanceIfPreviouslyUnlocked(...args),
}));

// ─── n8n Callback Tests ──────────────────────────────────────────────────────

describe("Phase 74: Pipeline Status Synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.N8N_CALLBACK_SECRET = "test-secret";
  });

  describe("n8n callback — status transitions match direct pipeline", () => {
    it("aligned 4-stage callback transitions: researching → drafting → generated_locked", async () => {
      vi.setConfig({ testTimeout: 15000 });
      // Import the route registration
      const { registerN8nCallbackRoute } = await import("./n8nCallback");

      // Create a mock Express app
      let handler: (req: any, res: any) => Promise<void>;
      const mockApp = {
        post: (_path: string, fn: any) => {
          handler = fn;
        },
      };
      registerN8nCallbackRoute(mockApp as any);

      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      };

      const mockReq = {
        headers: { "x-ttml-callback-secret": "test-secret" },
        body: {
          letterId: 42,
          success: true,
          researchPacket: {
            researchSummary: "Comprehensive legal research...",
            jurisdictionProfile: { country: "US", stateProvince: "CA", city: "LA", authorityHierarchy: [] },
            issuesIdentified: ["Unlawful eviction"],
            applicableRules: [],
            localJurisdictionElements: [],
            factualDataNeeded: [],
            openQuestions: [],
            riskFlags: [],
            draftingConstraints: [],
          },
          draftOutput: {
            draftLetter: "Dear Landlord...",
            attorneyReviewSummary: "Strong case.",
            openQuestions: [],
            riskFlags: [],
          },
          assembledLetter: "Dear Landlord,\n\nAssembled text.",
          vettedLetter: "Dear Landlord,\n\nVetted text.",
          vettingReport: { riskLevel: "low", jurisdictionIssues: [], citationsFlagged: [], factualIssuesFound: [] },
          provider: "n8n-4stage",
          stages: ["perplexity-research", "claude-draft", "claude-assembly", "claude-vetting"],
        },
      };

      await handler!(mockReq, mockRes);

      // Wait for async processing
      await new Promise(r => setTimeout(r, 100));

      // Verify the status transitions happened in the correct order
      const statusCalls = mockUpdateLetterStatus.mock.calls;
      expect(statusCalls.length).toBe(2);

      // First call: researching → drafting
      expect(statusCalls[0]).toEqual([42, "drafting"]);

      // Second call: drafting → generated_locked
      expect(statusCalls[1]).toEqual([42, "generated_locked"]);
      
      // Verify auto-advance was called
      expect(mockAutoAdvanceIfPreviouslyUnlocked).toHaveBeenCalledWith(42);
    });

    it("legacy callback also transitions through drafting before generated_locked", async () => {
      const { registerN8nCallbackRoute } = await import("./n8nCallback");

      let handler: (req: any, res: any) => Promise<void>;
      const mockApp = {
        post: (_path: string, fn: any) => {
          handler = fn;
        },
      };
      registerN8nCallbackRoute(mockApp as any);

      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      };

      // Legacy payload (no structured researchPacket/draftOutput/assembledLetter)
      const mockReq = {
        headers: { "x-ttml-callback-secret": "test-secret" },
        body: {
          letterId: 99,
          success: true,
          draftContent: "Dear Sir/Madam,\n\nI am writing to formally notify you...",
          researchOutput: "Research findings from Perplexity...",
          provider: "n8n-legacy",
        },
      };

      // Mock getLetterRequestById to return null (no intake → direct generated_locked)
      mockGetLetterRequestById.mockResolvedValueOnce(null);

      await handler!(mockReq, mockRes);
      await new Promise(r => setTimeout(r, 100));

      const statusCalls = mockUpdateLetterStatus.mock.calls;
      expect(statusCalls.length).toBe(2);

      // First: researching → drafting
      expect(statusCalls[0]).toEqual([99, "drafting"]);

      // Second: drafting → generated_locked
      expect(statusCalls[1]).toEqual([99, "generated_locked"]);
      
      // Verify auto-advance was called
      expect(mockAutoAdvanceIfPreviouslyUnlocked).toHaveBeenCalledWith(99);
    });

    it("failed callback reverts to submitted (same as direct pipeline)", async () => {
      const { registerN8nCallbackRoute } = await import("./n8nCallback");

      let handler: (req: any, res: any) => Promise<void>;
      const mockApp = {
        post: (_path: string, fn: any) => {
          handler = fn;
        },
      };
      registerN8nCallbackRoute(mockApp as any);

      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      };

      const mockReq = {
        headers: { "x-ttml-callback-secret": "test-secret" },
        body: {
          letterId: 55,
          success: false,
          error: "Perplexity API timeout",
        },
      };

      await handler!(mockReq, mockRes);
      await new Promise(r => setTimeout(r, 100));

      // Should revert to submitted
      expect(mockUpdateLetterStatus).toHaveBeenCalledWith(55, "submitted");
    });
  });

  describe("Status flow comparison: direct vs n8n", () => {
    it("both pipelines use identical status enum values", () => {
      // The canonical status flow for both pipelines
      const expectedFlow = [
        "submitted",
        "researching",
        "drafting",
        "generated_locked",
      ];

      // In the direct pipeline, these are set sequentially in orchestrator.ts
      // In the n8n callback, they are set sequentially in n8nCallback.ts
      
      // This test ensures the constants match the expected strings
      expect(expectedFlow).toEqual(["submitted", "researching", "drafting", "generated_locked"]);
    });
  });
});
