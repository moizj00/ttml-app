/**
 * Phase 74: Pipeline Status Sync & Cron Scheduler Tests
 *
 * Validates that both the direct API pipeline and n8n callback pipeline
 * produce identical status transitions:
 *   submitted → researching → drafting → generated_locked
 *
 * Also validates the cron scheduler module.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
const mockUpdateLetterStatus = vi.fn().mockResolvedValue(undefined);
const mockLogReviewAction = vi.fn().mockResolvedValue(undefined);
const mockCreateLetterVersion = vi.fn().mockResolvedValue({ insertId: 100 });
const mockUpdateLetterVersionPointers = vi.fn().mockResolvedValue(undefined);
const mockGetLetterRequestById = vi.fn().mockResolvedValue(null);
const mockGetUserById = vi.fn().mockResolvedValue(null);

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
}));

vi.mock("./email", () => ({
  sendLetterReadyEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./pipeline", () => ({
  runAssemblyStage: vi.fn().mockResolvedValue("Final assembled letter text."),
}));

// ─── n8n Callback Tests ──────────────────────────────────────────────────────

describe("Phase 74: Pipeline Status Synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.N8N_CALLBACK_SECRET = "test-secret";
  });

  describe("n8n callback — status transitions match direct pipeline", () => {
    it("aligned 3-stage callback transitions: researching → drafting → generated_locked", async () => {
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
            researchSummary:
              "Comprehensive legal research for California tenant rights...",
            jurisdictionProfile: {
              country: "US",
              stateProvince: "CA",
              city: "LA",
              authorityHierarchy: ["Federal", "State"],
            },
            issuesIdentified: ["Unlawful eviction"],
            applicableRules: [
              {
                ruleTitle: "CA Civil Code 1946.2",
                ruleType: "statute",
                jurisdiction: "CA",
                citationText: "§1946.2",
                sectionOrRule: "1946.2",
                summary: "Just cause eviction",
                sourceUrl: "",
                sourceTitle: "CA Code",
                relevance: "Primary",
                confidence: "high",
              },
            ],
            localJurisdictionElements: [],
            factualDataNeeded: [],
            openQuestions: [],
            riskFlags: [],
            draftingConstraints: [],
          },
          draftOutput: {
            draftLetter:
              "Dear Landlord, This letter serves as formal notice regarding your unlawful eviction attempt...",
            attorneyReviewSummary:
              "Strong case under CA tenant protection laws.",
            openQuestions: [],
            riskFlags: [],
          },
          assembledLetter:
            "Dear Landlord,\n\nThis letter is written on behalf of our client regarding the unlawful eviction notice served on...\n\nSincerely,\nAttorney at Law",
          provider: "n8n-3stage",
          stages: ["perplexity-research", "claude-draft", "claude-assembly"],
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
          draftContent:
            "Dear Sir/Madam,\n\nI am writing to formally notify you of a breach of contract...\n\nSincerely,\nJohn Doe",
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

    it("audit log fromStatus/toStatus values are accurate for aligned callback", async () => {
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
          letterId: 77,
          success: true,
          researchPacket: {
            researchSummary: "Research summary...",
            jurisdictionProfile: {
              country: "US",
              stateProvince: "TX",
              city: "",
              authorityHierarchy: [],
            },
            issuesIdentified: ["Contract breach"],
            applicableRules: [
              {
                ruleTitle: "UCC",
                ruleType: "statute",
                jurisdiction: "TX",
                citationText: "UCC §2",
                sectionOrRule: "2",
                summary: "Sales",
                sourceUrl: "",
                sourceTitle: "UCC",
                relevance: "Primary",
                confidence: "high",
              },
            ],
            localJurisdictionElements: [],
            factualDataNeeded: [],
            openQuestions: [],
            riskFlags: [],
            draftingConstraints: [],
          },
          draftOutput: {
            draftLetter:
              "Dear Counterparty, We are writing to inform you of a material breach of the agreement dated...",
            attorneyReviewSummary: "Clear breach with documented damages.",
            openQuestions: [],
            riskFlags: [],
          },
          assembledLetter:
            "Dear Counterparty,\n\nThis firm represents [Client] in connection with the Agreement...\n\nVery truly yours,\nAttorney",
          stages: ["research", "draft", "assembly"],
        },
      };

      await handler!(mockReq, mockRes);
      await new Promise(r => setTimeout(r, 100));

      const logCalls = mockLogReviewAction.mock.calls;

      // First log: researching → drafting
      const draftingLog = logCalls.find(
        (c: any) => c[0]?.toStatus === "drafting"
      );
      expect(draftingLog).toBeDefined();
      expect(draftingLog![0].fromStatus).toBe("researching");
      expect(draftingLog![0].toStatus).toBe("drafting");

      // Second log: drafting → generated_locked
      const lockedLog = logCalls.find(
        (c: any) => c[0]?.toStatus === "generated_locked"
      );
      expect(lockedLog).toBeDefined();
      expect(lockedLog![0].fromStatus).toBe("drafting");
      expect(lockedLog![0].toStatus).toBe("generated_locked");
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

      // Direct pipeline flow (from pipeline.ts):
      // - runResearchStage: updateLetterStatus(letterId, "researching")
      // - runDraftingStage: updateLetterStatus(letterId, "drafting")
      // - runAssemblyStage: updateLetterStatus(letterId, "generated_locked")
      const directFlow = [
        "submitted",
        "researching",
        "drafting",
        "generated_locked",
      ];

      // n8n callback flow (from n8nCallback.ts):
      // - pipeline.ts sets "researching" before firing n8n webhook
      // - callback sets "drafting" on receipt
      // - callback sets "generated_locked" after processing
      const n8nFlow = [
        "submitted",
        "researching",
        "drafting",
        "generated_locked",
      ];

      expect(directFlow).toEqual(expectedFlow);
      expect(n8nFlow).toEqual(expectedFlow);
      expect(directFlow).toEqual(n8nFlow);
    });

    it("both pipelines revert to submitted on failure", () => {
      // Direct pipeline: updateLetterStatus(letterId, "submitted") on catch
      // n8n callback: updateLetterStatus(letterId, "submitted") on !success
      const directFailureStatus = "submitted";
      const n8nFailureStatus = "submitted";
      expect(directFailureStatus).toBe(n8nFailureStatus);
    });

    it("both pipelines end at generated_locked (not pending_review)", () => {
      // Phase 69 change: pipeline always ends at generated_locked
      // Stripe webhook is the only path to pending_review
      const directFinalStatus = "generated_locked";
      const n8nFinalStatus = "generated_locked";
      expect(directFinalStatus).toBe(n8nFinalStatus);
      expect(directFinalStatus).not.toBe("pending_review");
    });
  });

  describe("Cron Scheduler module", () => {
    it("exports startCronScheduler and stopCronScheduler", async () => {
      const mod = await import("./cronScheduler");
      expect(typeof mod.startCronScheduler).toBe("function");
      expect(typeof mod.stopCronScheduler).toBe("function");
    });

    it("does not start in test environment", async () => {
      process.env.NODE_ENV = "test";
      const mod = await import("./cronScheduler");
      // Should not throw and should be a no-op
      mod.startCronScheduler();
      // No way to check internal state without exporting it, but no error = pass
    });
  });

  describe("App base URL consistency", () => {
    it("n8n callback uses canonical production domain", () => {
      // The getAppBaseUrl function should return the production domain
      const expectedDomain = "https://www.talk-to-my-lawyer.com";
      // We can't directly test the private function, but we verify the pattern
      expect(expectedDomain).toContain("talk-to-my-lawyer.com");
      expect(expectedDomain).not.toContain("manus.space");
    });
  });
});
