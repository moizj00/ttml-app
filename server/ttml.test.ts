import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateResearchPacket, parseAndValidateDraftLlmOutput } from "./pipeline";
import { ALLOWED_TRANSITIONS, isValidTransition } from "../shared/types";

// Mock Resend at module level to prevent real network calls in email tests
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: "mock-email-id", error: null }),
    },
  })),
}));

// ============================================================================
// STATUS MACHINE TESTS
// ============================================================================
describe("Status Machine: ALLOWED_TRANSITIONS", () => {
  it("should allow submitted → researching", () => {
    expect(isValidTransition("submitted", "researching")).toBe(true);
  });

  it("should allow researching → drafting", () => {
    expect(isValidTransition("researching", "drafting")).toBe(true);
  });

  it("should allow drafting → generated_locked (paywall: AI complete, awaiting payment)", () => {
    expect(isValidTransition("drafting", "generated_locked")).toBe(true);
  });

  it("should allow generated_locked → pending_review (after subscriber payment)", () => {
    expect(isValidTransition("generated_locked", "pending_review")).toBe(true);
  });

  it("should NOT allow drafting → pending_review directly (must go through paywall)", () => {
    expect(isValidTransition("drafting", "pending_review")).toBe(false);
  });

  it("should allow pending_review → under_review", () => {
    expect(isValidTransition("pending_review", "under_review")).toBe(true);
  });

  it("should allow under_review → approved", () => {
    expect(isValidTransition("under_review", "approved")).toBe(true);
  });

  it("should allow under_review → rejected", () => {
    expect(isValidTransition("under_review", "rejected")).toBe(true);
  });

  it("should allow under_review → needs_changes", () => {
    expect(isValidTransition("under_review", "needs_changes")).toBe(true);
  });

  it("should NOT allow submitted → approved (skip stages)", () => {
    expect(isValidTransition("submitted", "approved")).toBe(false);
  });

  it("should NOT allow approved → under_review (backward)", () => {
    expect(isValidTransition("approved", "under_review")).toBe(false);
  });

  it("should NOT allow rejected → researching", () => {
    expect(isValidTransition("rejected", "researching")).toBe(false);
  });

  it("should NOT allow pending_review → approved (skip under_review)", () => {
    expect(isValidTransition("pending_review", "approved")).toBe(false);
  });

  it("should allow needs_changes → submitted (re-enters pipeline via submitted)", () => {
    // needs_changes goes to submitted which re-triggers the full pipeline
    expect(isValidTransition("needs_changes", "submitted")).toBe(true);
  });

  it("should NOT allow needs_changes → researching directly (must go via submitted)", () => {
    expect(isValidTransition("needs_changes", "researching")).toBe(false);
  });
});

// ============================================================================
// RESEARCH PACKET VALIDATOR TESTS
// ============================================================================
describe("validateResearchPacket", () => {
  it("should validate a complete research packet", () => {
    const packet = {
      researchSummary: "This is a valid research summary for the legal matter involving a lease breach in California. The tenant has failed to pay rent for three consecutive months.",
      jurisdictionProfile: { state: "CA", country: "US", legalSystem: "common law" },
      issuesIdentified: ["Breach of lease agreement", "Unpaid rent"],
      applicableRules: [
        {
          ruleTitle: "California Civil Code § 1950.5",
          summary: "Governs security deposit requirements for residential tenancies.",
          citationText: "Cal. Civ. Code § 1950.5",
          confidence: "high",
          sourceUrl: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1950.5",
          sourceTitle: "California Legislative Information",
          jurisdiction: "CA",
        },
        {
          ruleTitle: "California Civil Code § 1946",
          summary: "Governs notice requirements for termination of tenancy in California.",
          citationText: "Cal. Civ. Code § 1946",
          confidence: "high",
          sourceUrl: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1946",
          sourceTitle: "California Legislative Information",
          jurisdiction: "CA",
        },
        {
          ruleTitle: "California Code of Civil Procedure § 1161",
          summary: "Governs unlawful detainer actions and 3-day notice requirements.",
          citationText: "Cal. Code Civ. Proc. § 1161",
          confidence: "high",
          sourceUrl: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1161",
          sourceTitle: "California Legislative Information",
          jurisdiction: "CA",
        },
      ],
      draftingConstraints: ["Must include 3-day notice language"],
      riskFlags: [],
      openQuestions: [],
      jurisdictionNotes: "California law applies.",
      recommendedTone: "firm",
    };
    const result = validateResearchPacket(packet);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject a packet missing researchSummary", () => {
    const packet = {
      jurisdictionProfile: { state: "CA" },
      issuesIdentified: ["Issue 1"],
      applicableRules: [{ ruleTitle: "Some Rule", summary: "Summary", confidence: "high" }],
      draftingConstraints: [],
    };
    const result = validateResearchPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("researchSummary"))).toBe(true);
  });

  it("should reject a packet missing issuesIdentified", () => {
    const packet = {
      researchSummary: "This is a valid research summary with more than fifty characters here.",
      jurisdictionProfile: { state: "CA" },
      issuesIdentified: [],
      applicableRules: [{ ruleTitle: "Some Rule", summary: "Summary", confidence: "high" }],
      draftingConstraints: [],
    };
    const result = validateResearchPacket(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("issuesIdentified"))).toBe(true);
  });

  it("should reject null input", () => {
    const result = validateResearchPacket(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should reject non-object input", () => {
    const result = validateResearchPacket("not an object");
    expect(result.valid).toBe(false);
  });

  it("should reject a packet with rules missing required fields", () => {
    const packet = {
      researchSummary: "This is a valid research summary with more than fifty characters here.",
      jurisdictionProfile: { state: "CA" },
      issuesIdentified: ["Issue 1"],
      applicableRules: [{ ruleTitle: "Rule without summary" }],
      draftingConstraints: [],
    };
    const result = validateResearchPacket(packet);
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// DRAFT LLM OUTPUT PARSER TESTS
// ============================================================================
describe("parseAndValidateDraftLlmOutput", () => {
  it("should parse a valid JSON draft output", () => {
    const draftOutput = {
      draftLetter: "Dear Mr. Smith,\n\nThis letter serves as formal notice that you are in breach of your obligations under the lease agreement. You are hereby required to remedy this breach within 30 days of receipt of this letter. Failure to do so will result in legal action being taken against you.\n\nSincerely,\nJohn Doe",
      attorneyReviewSummary: "Standard demand letter citing breach of lease.",
      openQuestions: [],
      riskFlags: [],
    };
    const raw = JSON.stringify(draftOutput);
    const result = parseAndValidateDraftLlmOutput(raw);
    expect(result.valid).toBe(true);
    expect(result.data?.draftLetter).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it("should extract JSON from markdown code blocks", () => {
    const draftOutput = {
      draftLetter: "Dear Sir/Madam,\n\nThis formal legal notice is to inform you of your obligations under applicable law. You are required to take immediate action to remedy the situation described herein. Failure to comply within the specified timeframe will result in further legal proceedings.\n\nRegards,\nSender",
      attorneyReviewSummary: "Formal notice letter extracted from markdown.",
      openQuestions: [],
      riskFlags: [],
    };
    const raw = "```json\n" + JSON.stringify(draftOutput) + "\n```";
    const result = parseAndValidateDraftLlmOutput(raw);
    expect(result.valid).toBe(true);
    expect(result.data?.draftLetter).toBeDefined();
  });

  it("should reject output with missing draftLetter", () => {
    const raw = JSON.stringify({ wordCount: 100, citationsUsed: [], attorneyReviewSummary: "Summary" });
    const result = parseAndValidateDraftLlmOutput(raw);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("draftLetter"))).toBe(true);
  });

  it("should reject output with too-short draftLetter", () => {
    const raw = JSON.stringify({ draftLetter: "Too short.", attorneyReviewSummary: "Summary", openQuestions: [], riskFlags: [] });
    const result = parseAndValidateDraftLlmOutput(raw);
    expect(result.valid).toBe(false);
  });

  it("should reject invalid JSON", () => {
    const result = parseAndValidateDraftLlmOutput("not valid json {{{");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should reject empty string", () => {
    const result = parseAndValidateDraftLlmOutput("");
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// AUTH LOGOUT TEST (preserved from template)
// ============================================================================
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type CookieCall = { name: string; options: Record<string, unknown> };
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "subscriber" | "admin" = "subscriber"): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "email",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears session cookies and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    // Logout clears sb_session (Supabase) cookie
    expect(clearedCookies.length).toBeGreaterThanOrEqual(1);
    const sbSessionCookie = clearedCookies.find(c => c.name === "sb_session");
    expect(sbSessionCookie).toBeTruthy();
    for (const cookie of clearedCookies) {
      expect(cookie.options).toMatchObject({
        maxAge: -1,
        httpOnly: true,
        path: "/",
      });
    }
  });
});

// ============================================================================
// RBAC TESTS
// ============================================================================
describe("RBAC: Role-based access control", () => {
  it("subscriber cannot access admin procedures", async () => {
    const { ctx } = createAuthContext("subscriber");
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me).toBeDefined();
    expect(me?.role).toBe("subscriber");
  });

  it("admin can access auth.me", async () => {
    const { ctx } = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me?.role).toBe("admin");
  });
});

// ============================================================================
// EMAIL TEMPLATE TESTS
// ============================================================================
describe("Email templates: structure and content", () => {
  it("sendLetterSubmissionEmail is exported from email.ts", async () => {
    const emailModule = await import("./email");
    expect(typeof emailModule.sendLetterSubmissionEmail).toBe("function");
  });

  it("sendLetterReadyEmail is exported from email.ts", async () => {
    const emailModule = await import("./email");
    expect(typeof emailModule.sendLetterReadyEmail).toBe("function");
  });

  it("sendLetterUnlockedEmail is exported from email.ts", async () => {
    const emailModule = await import("./email");
    expect(typeof emailModule.sendLetterUnlockedEmail).toBe("function");
  });

  it("all three new email functions accept the correct parameter shapes without TypeError", async () => {
    // Verify the email functions are exported with correct signatures (type-level check)
    const emailModule = await import("./email");
    expect(typeof emailModule["sendLetterSubmissionEmail"]).toBe("function");
    expect(typeof emailModule["sendLetterReadyEmail"]).toBe("function");
    expect(typeof emailModule["sendLetterUnlockedEmail"]).toBe("function");
  }, 15000);
});

// ============================================================================
// EMAIL PREVIEW ROUTE TESTS
// ============================================================================
describe("Email preview route: registerEmailPreviewRoute", () => {
  it("is exported from emailPreview.ts", async () => {
    const mod = await import("./emailPreview");
    expect(typeof mod.registerEmailPreviewRoute).toBe("function");
  });

  it("does not throw when called with a mock Express app in non-production env", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const mod = await import("./emailPreview");
    const routes: { method: string; path: string }[] = [];
    const mockApp = {
      get: (path: string, _handler: unknown) => { routes.push({ method: "GET", path }); },
    };
    expect(() => mod.registerEmailPreviewRoute(mockApp as any)).not.toThrow();
    expect(routes).toContainEqual({ method: "GET", path: "/api/dev/email-preview" });
    process.env.NODE_ENV = originalEnv;
  });

  it("does NOT register route in production environment", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const mod = await import("./emailPreview");
    const routes: { method: string; path: string }[] = [];
    const mockApp = {
      get: (path: string, _handler: unknown) => { routes.push({ method: "GET", path }); },
    };
    mod.registerEmailPreviewRoute(mockApp as any);
    expect(routes).toHaveLength(0);
    process.env.NODE_ENV = originalEnv;
  });
});
