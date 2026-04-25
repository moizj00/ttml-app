import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyFreePreviewGate } from "./db/letter-versions";

vi.mock("./db", () => ({
  createLetterRequest: vi.fn(),
  updateLetterStatus: vi.fn(),
  createLetterVersion: vi.fn(),
  updateLetterVersionPointers: vi.fn(),
  getLetterRequestById: vi.fn(),
  logReviewAction: vi.fn(),
  claimFreeTrialSlot: vi.fn(),
  getDb: vi.fn(),
  getUserById: vi.fn(),
  notifyAdmins: vi.fn(),
}));

vi.mock("./stripe", () => ({
  checkLetterSubmissionAllowed: vi.fn(),
  incrementLettersUsed: vi.fn(),
}));

vi.mock("./queue", () => ({
  enqueuePipelineJob: vi.fn(),
  enqueueDraftPreviewReleaseJob: vi.fn().mockResolvedValue("release-job-id"),
}));

const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

describe("free preview 24-hour delay UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first free-preview submission creates free preview + ~24h unlock and enqueues free-trial usageContext", async () => {
    const { submitSubscriberIntakeProcedure } =
      await import("./services/canonicalProcedures");
    const db = await import("./db");
    const stripe = await import("./stripe");
    const queue = await import("./queue");

    vi.mocked(stripe.checkLetterSubmissionAllowed).mockResolvedValue({
      allowed: true,
      firstLetterFree: true,
      subscription: false,
    } as never);
    vi.mocked(db.claimFreeTrialSlot).mockResolvedValue(true as never);
    vi.mocked(db.createLetterRequest).mockResolvedValue({
      insertId: 321,
    } as never);
    vi.mocked(db.logReviewAction).mockResolvedValue(undefined as never);

    const intake = {
      matter: { subject: "Demand for payment" },
    } as any;

    const now = Date.now();
    const result = await submitSubscriberIntakeProcedure(
      11,
      intake,
      "demand-letter"
    );

    expect(result.isFreePreview).toBe(true);
    expect(result.status).toBe("submitted");
    const unlockDiff = result.subscriberVisibleAt.getTime() - now;
    expect(unlockDiff).toBeGreaterThanOrEqual(23.9 * 60 * 60 * 1000);
    expect(unlockDiff).toBeLessThanOrEqual(24.1 * 60 * 60 * 1000);

    expect(queue.enqueuePipelineJob).toHaveBeenCalledWith(
      expect.objectContaining({
        usageContext: {
          shouldRefundOnFailure: true,
          isPreviewGatedSubmission: true,
          isFreeTrialSubmission: true,
        },
      })
    );
    expect(queue.enqueueDraftPreviewReleaseJob).toHaveBeenCalledWith(
      321,
      result.subscriberVisibleAt
    );
  });

  it("pre-unlock free preview returns no ai draft content and waiting marker", () => {
    const rows = [
      { versionType: "ai_draft", content: "secret draft content" },
      { versionType: "final_approved", content: "approved" },
    ];

    const out = applyFreePreviewGate(rows, "ai_generation_completed_hidden", {
      isFreePreview: true,
      freePreviewUnlockAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const draft = out.find(v => v.versionType === "ai_draft") as any;
    expect(draft.content).toBe("");
    expect(draft.freePreviewWaiting).toBe(true);
    expect(draft.freePreview).not.toBe(true);
  });

  it("post-unlock free preview returns full ai draft + freePreview flag", () => {
    const rows = [{ versionType: "ai_draft", content: "full draft" }];
    const out = applyFreePreviewGate(rows, "letter_released_to_subscriber", {
      isFreePreview: true,
      freePreviewUnlockAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const draft = out[0] as any;
    expect(draft.content).toBe("full draft");
    expect(draft.freePreview).toBe(true);
    expect(draft.truncated).toBe(false);
  });

  it("subscriber router computes subscriberDisplayStatus=free_preview_waiting while locked", () => {
    const source = read("server", "routers", "letters", "subscriber.ts");
    expect(source).toContain("const isFreePreviewWaiting =");
    expect(source).toContain('? "free_preview_waiting"');
    expect(source).toContain("letter: { ...letter, subscriberDisplayStatus }");
  });

  it("worker forwards the broader preview-gate flag into runFullPipeline", () => {
    const source = read("server", "worker.ts");
    expect(source).toContain("const isPreviewGatedSubmission =");
    expect(source).toMatch(
      /runFullPipeline\([\s\S]*isPreviewGatedSubmission[\s\S]*\)/
    );
  });

  it("pipeline finalizers use canonical lowercase ai_generation_completed_hidden", () => {
    const simple = read("server", "pipeline", "simple.ts");
    const vetting = read("server", "pipeline", "vetting.ts");
    const graphFinalize = read(
      "server",
      "pipeline",
      "graph",
      "nodes",
      "finalize.ts"
    );
    const previewGate = read("server", "pipeline", "preview-gate.ts");

    expect(previewGate).toContain('"ai_generation_completed_hidden"');
    expect(simple).toContain("finalizeDraftPreviewStatus");
    expect(vetting).toContain("resolveDraftPreviewFinalStatus");
    expect(graphFinalize).toContain("resolveDraftPreviewFinalStatus");

    expect(simple).not.toContain('"AI_GENERATION_COMPLETED_HIDDEN"');
    expect(vetting).not.toContain('"AI_GENERATION_COMPLETED_HIDDEN"');
    expect(graphFinalize).not.toContain('"AI_GENERATION_COMPLETED_HIDDEN"');
  });

  it("LetterDetail routes free-preview waiting before paywall and uses displayStatus", () => {
    const source = read(
      "client",
      "src",
      "pages",
      "subscriber",
      "LetterDetail.tsx"
    );
    expect(source).toContain(
      "const displayStatus = (letter as any).subscriberDisplayStatus ?? letter.status;"
    );
    expect(source).toMatch(
      /letter\.isFreePreview === true[\s\S]*aiDraftVersion as any\)\?\.freePreview !== true[\s\S]*<FreePreviewWaiting/
    );
    expect(source).toMatch(
      /\(aiDraftVersion as any\)\?\.freePreview === true[\s\S]*<FreePreviewViewer/
    );
    expect(source).toMatch(/: isGeneratedLocked \? \([\s\S]*<LetterPaywall/);
  });

  it("non-free-preview locked drafts still use standard paywall truncation", () => {
    const rows = [
      {
        versionType: "ai_draft",
        content: Array.from({ length: 20 }, (_, i) => `line-${i + 1}`).join(
          "\n"
        ),
      },
    ];
    const out = applyFreePreviewGate(rows, "generated_locked", {
      isFreePreview: false,
      freePreviewUnlockAt: null,
    });
    const draft = out[0] as any;
    expect(draft.truncated).toBe(true);
    expect(draft.content.length).toBeLessThan(rows[0].content.length);
  });
});
