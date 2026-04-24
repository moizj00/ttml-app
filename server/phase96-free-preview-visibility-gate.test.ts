/**
 * Phase 96 — Free-preview single server-side visibility gate
 *
 * Consolidates the 24-hour rule into ONE invariant:
 *
 *   The AI draft may be generated immediately, but subscriber-facing APIs
 *   must not return full content until free_preview_unlock_at <= NOW().
 *
 * This suite covers the 8 cases called out in the design spec:
 *
 *   1. Free preview before 24h:
 *        - full content is not returned
 *        - freePreviewWaiting is true
 *        - freePreview is NOT true
 *   2. Free preview after 24h but no draft:
 *        - full content is not returned
 *        - ready email is not sent (requireDraft: true)
 *   3. Free preview after 24h with draft:
 *        - full content is returned
 *        - freePreview is true
 *        - FreePreviewViewer renders
 *   4. Popup: does not render before unlock; renders after unlock + content
 *   5. PDF route: blocked for free-preview letters before paid/review state
 *   6. Non-free-preview generated_locked: still shows normal paywall,
 *      still returns truncated content
 *   7. Pipeline modes: simple, graph, and fallback all use lowercase
 *      canonical status (`ai_generation_completed_hidden`).
 *   8. Status: `attorney_review_upsell_shown` still displays unlocked
 *      free preview.
 *
 * Strategy mix: where possible we unit-test the pure helper and the gate
 * logic directly via module imports. Where logic lives inside Express
 * handlers or React render paths, we pin structural invariants with
 * source-level regex (same approach as phase-94 / phase-95).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { isFreePreviewUnlocked } from "../shared/utils/free-preview";
import { applyFreePreviewGate } from "./db/letter-versions";

const ROOT = join(__dirname, "..");
const SERVER = join(ROOT, "server");
const CLIENT = join(ROOT, "client", "src");
const SHARED = join(ROOT, "shared");

function readServer(...parts: string[]): string {
  return readFileSync(join(SERVER, ...parts), "utf-8");
}
function readClient(...parts: string[]): string {
  return readFileSync(join(CLIENT, ...parts), "utf-8");
}
function readShared(...parts: string[]): string {
  return readFileSync(join(SHARED, ...parts), "utf-8");
}

// ─── Shared helper — pure function, directly testable ─────────────────────

describe("Phase 96 — isFreePreviewUnlocked helper (single source of truth)", () => {
  it("returns false for non-free-preview letters", () => {
    expect(isFreePreviewUnlocked({ isFreePreview: false, freePreviewUnlockAt: new Date(0) })).toBe(false);
    expect(isFreePreviewUnlocked({ isFreePreview: null, freePreviewUnlockAt: new Date(0) })).toBe(false);
    expect(isFreePreviewUnlocked({})).toBe(false);
  });

  it("returns false when unlockAt is missing", () => {
    expect(isFreePreviewUnlocked({ isFreePreview: true })).toBe(false);
    expect(isFreePreviewUnlocked({ isFreePreview: true, freePreviewUnlockAt: null })).toBe(false);
  });

  it("returns false when unlockAt is in the future (pre-window)", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(isFreePreviewUnlocked({ isFreePreview: true, freePreviewUnlockAt: future })).toBe(false);
  });

  it("returns true when unlockAt is in the past (window elapsed)", () => {
    const past = new Date(Date.now() - 60 * 1000);
    expect(isFreePreviewUnlocked({ isFreePreview: true, freePreviewUnlockAt: past })).toBe(true);
  });

  it("accepts Date or ISO string for unlockAt", () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    expect(isFreePreviewUnlocked({ isFreePreview: true, freePreviewUnlockAt: past })).toBe(true);
  });

  it("treats unparseable strings as not-yet-unlocked", () => {
    expect(isFreePreviewUnlocked({ isFreePreview: true, freePreviewUnlockAt: "not-a-date" })).toBe(false);
  });

  it("is the only place the shared utils re-export is hooked up", () => {
    expect(readShared("utils", "index.ts")).toMatch(/export \* from "\.\/free-preview"/);
  });
});

// ─── Case 1 & 3 & 6 & 8 — applyFreePreviewGate pure transform ────────────

describe("Phase 96 — applyFreePreviewGate", () => {
  const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
  const PAST = new Date(Date.now() - 60 * 1000);

  it("Case 1 — pre-unlock free-preview: empty content + freePreviewWaiting:true, no freePreview flag", () => {
    const out = applyFreePreviewGate(
      [{ id: 1, versionType: "ai_draft", content: "SECRET DRAFT\nLine 2\nLine 3" }],
      "ai_generation_completed_hidden",
      { isFreePreview: true, freePreviewUnlockAt: FUTURE }
    );
    expect(out[0].content).toBe("");
    expect(out[0].freePreviewWaiting).toBe(true);
    expect(out[0].freePreview).toBeUndefined();
    expect(out[0].truncated).toBe(true);
  });

  it("Case 3 — post-unlock free-preview: full content + freePreview:true, isRedacted:false", () => {
    const out = applyFreePreviewGate(
      [
        {
          id: 2,
          versionType: "ai_draft",
          content: "FULL DRAFT CONTENT\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6",
        },
      ],
      "ai_generation_completed_hidden",
      { isFreePreview: true, freePreviewUnlockAt: PAST }
    );
    expect(out[0].content).toBe(
      "FULL DRAFT CONTENT\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6"
    );
    expect(out[0].freePreview).toBe(true);
    expect(out[0].isRedacted).toBe(false);
    expect(out[0].truncated).toBe(false);
  });

  it("Case 6 — non-free-preview generated_locked: truncated to 20% (paywall preview)", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join("\n");
    const out = applyFreePreviewGate(
      [{ id: 3, versionType: "ai_draft", content: lines }],
      "generated_locked",
      { isFreePreview: false, freePreviewUnlockAt: null }
    );
    expect(out[0].truncated).toBe(true);
    expect(out[0].content!.split("\n").length).toBe(10); // 20% of 50
    expect(out[0].freePreview).toBeUndefined();
    expect(out[0].freePreviewWaiting).toBeUndefined();
  });

  it("Case 8 — attorney_review_upsell_shown still shows unlocked free preview", () => {
    const out = applyFreePreviewGate(
      [{ id: 4, versionType: "ai_draft", content: "UNLOCKED DRAFT" }],
      "attorney_review_upsell_shown",
      { isFreePreview: true, freePreviewUnlockAt: PAST }
    );
    expect(out[0].content).toBe("UNLOCKED DRAFT");
    expect(out[0].freePreview).toBe(true);
  });

  it("Case 8b — letter_released_to_subscriber also shows unlocked free preview", () => {
    const out = applyFreePreviewGate(
      [{ id: 5, versionType: "ai_draft", content: "UNLOCKED DRAFT" }],
      "letter_released_to_subscriber",
      { isFreePreview: true, freePreviewUnlockAt: PAST }
    );
    expect(out[0].freePreview).toBe(true);
  });

  it("non-locked status returns raw rows without gating", () => {
    const out = applyFreePreviewGate(
      [{ id: 6, versionType: "final_approved", content: "FINAL" }],
      "sent",
      { isFreePreview: true, freePreviewUnlockAt: FUTURE }
    );
    expect(out[0].content).toBe("FINAL");
    expect(out[0].truncated).toBe(false);
  });

  it("pre-unlock free-preview leaks NOTHING even if the pipeline saves the draft early", () => {
    // Regression pin for the whole design: generate early, reveal late.
    const out = applyFreePreviewGate(
      [
        {
          id: 7,
          versionType: "ai_draft",
          content: "PRE-UNLOCK SECRET — must not leak",
        },
      ],
      "ai_generation_completed_hidden",
      { isFreePreview: true, freePreviewUnlockAt: FUTURE }
    );
    expect(out[0].content).not.toContain("SECRET");
    expect(out[0].content).toBe("");
  });
});

// ─── Case 2 — Cron requires a saved draft before emailing ─────────────────

describe("Phase 96 — cron requires a saved draft before sending preview email", () => {
  const cronSource = readServer("freePreviewEmailCron.ts");

  it("polling cron passes requireDraft: true into the dispatcher", () => {
    expect(cronSource).toMatch(
      /processFreePreviewEmails[\s\S]*?dispatchFreePreviewIfReady\([^)]*\{\s*requireDraft:\s*true\s*,?\s*\}\s*\)/
    );
  });

  it("dispatcher gates claim on currentAiDraftVersionId IS NOT NULL when requireDraft", () => {
    expect(cronSource).toMatch(
      /if\s*\(\s*requireDraft\s*\)\s*\{[\s\S]*?isNotNull\s*\(\s*letterRequests\.currentAiDraftVersionId\s*\)/
    );
  });

  it("dispatcher requireDraft default is true", () => {
    expect(cronSource).toMatch(/requireDraft\s*=\s*opts\.requireDraft\s*\?\?\s*true/);
  });
});

// ─── Case 4 — Popup only after server unlocked + content ──────────────────

describe("Phase 96 — LetterDetail popup requires server unlock + content", () => {
  const source = readClient("pages", "subscriber", "LetterDetail.tsx");

  it("popup effect early-exits when !freePreviewUnlocked", () => {
    expect(source).toMatch(/if\s*\(!freePreviewUnlocked\)\s*return/);
  });

  it("freePreviewUnlocked requires aiDraftVersion.content to be truthy", () => {
    expect(source).toMatch(
      /const\s+freePreviewUnlocked\s*=[\s\S]*?Boolean\(aiDraftVersion\?\.content\)/
    );
  });

  it("freePreviewUnlocked requires the server's freePreview flag on the ai_draft", () => {
    expect(source).toMatch(
      /freePreviewUnlocked\s*=[\s\S]*?\(aiDraftVersion as any\)\?\.freePreview\s*===\s*true/
    );
  });

  it("popup effect does NOT run on letter.status or freePreviewUnlockAt alone", () => {
    // The dependency array of the popup effect must NOT key off raw
    // unlockAt / status — it should only key off the server flag & content.
    const effectBlock = source.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?freePreviewUnlocked[\s\S]*?\},\s*\[[\s\S]*?\]\s*\)/);
    expect(effectBlock).toBeTruthy();
    expect(effectBlock![0]).not.toMatch(/data\?\.letter\?\.freePreviewUnlockAt/);
  });
});

// ─── Case 5 — draftPdfRoute blocks free-preview pre-review letters ────────

describe("Phase 96 — draftPdfRoute blocks free-preview PDFs before review", () => {
  const source = readServer("draftPdfRoute.ts");

  it("defines FREE_PREVIEW_PDF_ALLOWED_STATUSES (post-payment set)", () => {
    expect(source).toMatch(/FREE_PREVIEW_PDF_ALLOWED_STATUSES/);
    const match = source.match(
      /FREE_PREVIEW_PDF_ALLOWED_STATUSES\s*=\s*new Set\(\[([\s\S]*?)\]\)/
    );
    expect(match).toBeTruthy();
    const list = match![1];
    expect(list).toContain('"pending_review"');
    expect(list).toContain('"under_review"');
    expect(list).toContain('"approved"');
    expect(list).toContain('"client_approval_pending"');
    expect(list).toContain('"client_approved"');
    expect(list).toContain('"sent"');
    // Must NOT include any pre-review free-preview status
    expect(list).not.toContain('"submitted"');
    expect(list).not.toContain('"ai_generation_completed_hidden"');
    expect(list).not.toContain('"generated_locked"');
  });

  it("rejects with 403 when isFreePreview AND not in allowed set", () => {
    expect(source).toMatch(
      /letter\.isFreePreview\s*===\s*true[\s\S]*?!FREE_PREVIEW_PDF_ALLOWED_STATUSES\.has\(letter\.status\)[\s\S]*?res\.status\(403\)/
    );
    expect(source).toContain(
      "Draft PDF is available after attorney review submission"
    );
  });

  it("also runs the visibility-gate defense in depth (isFreePreviewUnlocked)", () => {
    expect(source).toMatch(/!isFreePreviewUnlocked\(letter\)[\s\S]*?res\.status\(403\)/);
  });
});

// ─── Case 6 (frontend side) — non-free-preview renders LetterPaywall ──────

describe("Phase 96 — LetterDetail still renders LetterPaywall for non-free-preview", () => {
  const source = readClient("pages", "subscriber", "LetterDetail.tsx");

  it("falls through to isGeneratedLocked → LetterPaywall when isFreePreview is false", () => {
    // There's one isGeneratedLocked branch left and it renders LetterPaywall.
    expect(source).toMatch(/\)\s*:\s*isGeneratedLocked\s*\?\s*\(\s*\n?\s*<LetterPaywall/);
  });
});

// ─── Case 7 — Pipeline modes use lowercase canonical status ───────────────

describe("Phase 96 — pipeline modes use lowercase ai_generation_completed_hidden", () => {
  const simple = readServer("services", "canonicalProcedures.ts");
  const graph = readServer("pipeline", "graph", "nodes", "finalize.ts");
  const vetting = readServer("pipeline", "vetting.ts");

  it("canonicalProcedures (simple pipeline Procedure 4) uses lowercase", () => {
    expect(simple).toMatch(/"ai_generation_completed_hidden"/);
    expect(simple).not.toMatch(/"AI_GENERATION_COMPLETED_HIDDEN"/);
  });

  it("graph finalize node uses lowercase", () => {
    expect(graph).toMatch(/"ai_generation_completed_hidden"/);
    expect(graph).not.toMatch(/"AI_GENERATION_COMPLETED_HIDDEN"/);
  });

  it("vetting node uses lowercase", () => {
    expect(vetting).toMatch(/"ai_generation_completed_hidden"/);
    expect(vetting).not.toMatch(/"AI_GENERATION_COMPLETED_HIDDEN"/);
  });
});

// ─── Additional — Pipeline job starts immediately (generate early) ────────

describe("Phase 96 — pipeline job is NOT delayed; generation starts immediately", () => {
  const source = readServer("services", "canonicalProcedures.ts");

  it("enqueueLetterGenerationProcedure does not pass a startAfter option", () => {
    // The function body must not delay the job — the 24h window is a
    // visibility gate, not a generation gate.
    const body = source.match(
      /export async function enqueueLetterGenerationProcedure[\s\S]*?\n\}/
    );
    expect(body).toBeTruthy();
    expect(body![0]).not.toMatch(/startAfter/);
  });

  it("submit flow calls enqueueLetterGenerationProcedure synchronously", () => {
    expect(source).toMatch(
      /enqueueLetterGenerationProcedure\(\s*requestId,\s*"INTAKE_AUTO_GENERATION"/
    );
  });
});

// ─── Additional — submitLetter returns the real isFreePreview flag ────────

describe("Phase 96 — submitLetter returns the real is_free_preview column", () => {
  const source = readServer("services", "letters.ts");

  it("reads the letter row instead of inferring from status", () => {
    // The buggy shape was `isFreePreview: result.status === "submitted"`
    expect(source).not.toMatch(/isFreePreview:\s*result\.status\s*===\s*"submitted"/);
    expect(source).toMatch(
      /const\s+letter\s*=\s*await\s+getLetterRequestById\(result\.requestId\)[\s\S]*?isFreePreview:\s*letter\?\.isFreePreview\s*===\s*true/
    );
  });
});
