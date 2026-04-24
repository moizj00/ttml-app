/**
 * Phase 95 — Free-preview waiting screen (pre-unlock content gate)
 *
 * Rewritten alongside the phase-96 consolidation: the 24-hour cooling window
 * is now a SINGLE server-side visibility gate driven by
 * `isFreePreviewUnlocked(letter)` in `shared/utils/free-preview.ts`. All
 * server-side content fetch sites (version DAL, versions.get, draftPdfRoute)
 * call the helper. The frontend renders from the server's `freePreview` flag
 * on the ai_draft version — no client-side clocks.
 *
 * This suite pins down:
 *   1. server/db/letter-versions.ts — pre-unlock free-preview returns empty
 *      content + freePreviewWaiting:true; post-unlock returns full draft +
 *      freePreview:true. Uses the shared helper.
 *   2. server/routers/versions.ts — single-version `get` mirrors the gate.
 *   3. server/draftPdfRoute.ts — blocks pre-review free-preview PDF downloads.
 *   4. server/routers/letters/subscriber.ts — passes the letter object down
 *      to the DAL (no local timestamp math).
 *   5. client/src/pages/subscriber/LetterDetail.tsx — renders branches from
 *      `aiDraftVersion.freePreview` server flag, not statuses.
 *   6. client/src/components/LetterPaywall.tsx — defensive __isFreePreview
 *      guard.
 *   7. client/src/components/FreePreviewWaiting.tsx — exists with the
 *      required data-testid and no payment CTA. No countdown (the waiting
 *      state is driven by the server flag, not client clocks).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const SERVER = join(ROOT, "server");
const CLIENT = join(ROOT, "client", "src");

function readServer(...parts: string[]): string {
  return readFileSync(join(SERVER, ...parts), "utf-8");
}
function readClient(...parts: string[]): string {
  return readFileSync(join(CLIENT, ...parts), "utf-8");
}

// ─── 1. letter-versions DAL — helper-driven gate ──────────────────────────

describe("Phase 95 — getLetterVersionsByRequestId: pre-unlock content gate", () => {
  const source = readServer("db", "letter-versions.ts");

  it("imports the shared isFreePreviewUnlocked helper", () => {
    expect(source).toMatch(
      /import\s*\{\s*isFreePreviewUnlocked\s*\}\s*from\s*"[^"]*shared\/utils\/free-preview"/
    );
  });

  it("accepts the letter object as a parameter (no separate unlock booleans)", () => {
    expect(source).toMatch(
      /getLetterVersionsByRequestId\([\s\S]*?letter\?:\s*\{[\s\S]*?isFreePreview\?[\s\S]*?freePreviewUnlockAt\?[\s\S]*?\}[\s\S]*?\)/
    );
  });

  it("decides freePreviewUnlocked via the shared helper", () => {
    expect(source).toMatch(/isFreePreviewUnlocked\(letter!\)/);
  });

  it("returns empty content + freePreviewWaiting:true for pre-unlock free-preview", () => {
    expect(source).toMatch(
      /content:\s*""[\s\S]*?freePreviewWaiting:\s*true\s*as\s*const/
    );
  });

  it("returns full draft + freePreview:true for unlocked free-preview", () => {
    expect(source).toMatch(
      /freePreviewUnlocked[\s\S]*?freePreview:\s*true\s*as\s*const/
    );
  });

  it("preserves the standard 20% truncation fallback for non-free-preview", () => {
    expect(source).toMatch(/truncateContent\(v\.content\)/);
  });

  it("orders the branches so the free-preview gate runs BEFORE truncation", () => {
    const idxFreePreview = source.indexOf("freePreviewWaiting: true as const");
    const idxTruncate = source.indexOf("truncateContent(v.content)");
    expect(idxFreePreview).toBeGreaterThan(0);
    expect(idxTruncate).toBeGreaterThan(0);
    expect(idxFreePreview).toBeLessThan(idxTruncate);
  });
});

// ─── 2. subscriber router — passes letter object down ─────────────────────

describe("Phase 95 — subscriber.detail passes the letter object to the DAL", () => {
  const source = readServer("routers", "letters", "subscriber.ts");

  it("calls getLetterVersionsByRequestId(input.id, false, letter.status, letter)", () => {
    expect(source).toMatch(
      /getLetterVersionsByRequestId\(\s*input\.id,\s*false,\s*letter\.status,\s*letter\s*\)/
    );
  });

  it("does NOT inline freePreviewUnlockAt timestamp math in this router", () => {
    expect(source).not.toMatch(/freePreviewUnlockAt.*getTime\(\)/);
  });
});

// ─── 3. versions.get — duplicate truncation path mirrors the gate ─────────

describe("Phase 95 — versions.get mirrors the pre-unlock gate via helper", () => {
  const source = readServer("routers", "versions.ts");

  it("imports the shared isFreePreviewUnlocked helper", () => {
    expect(source).toMatch(
      /import\s*\{\s*isFreePreviewUnlocked\s*\}\s*from\s*"[^"]*shared\/utils\/free-preview"/
    );
  });

  it("calls the helper to decide freePreviewUnlocked", () => {
    expect(source).toMatch(/isFreePreviewUnlocked\(letter\)/);
  });

  it("returns empty content + freePreviewWaiting:true for pre-unlock free-preview", () => {
    expect(source).toMatch(
      /content:\s*""[\s\S]*?freePreviewWaiting:\s*true\s*as\s*const/
    );
  });

  it("orders the gate BEFORE the inline 20% truncation slice", () => {
    const idxFreePreview = source.indexOf("freePreviewWaiting: true as const");
    const idxSlice = source.indexOf("Math.floor(lines.length * 0.2)");
    expect(idxFreePreview).toBeGreaterThan(0);
    expect(idxSlice).toBeGreaterThan(0);
    expect(idxFreePreview).toBeLessThan(idxSlice);
  });

  it("recognizes every locked-preview status, not just generated_locked", () => {
    expect(source).toMatch(/LOCKED_PREVIEW_STATUSES[\s\S]*?ai_generation_completed_hidden/);
    expect(source).toMatch(/LOCKED_PREVIEW_STATUSES[\s\S]*?letter_released_to_subscriber/);
  });
});

// ─── 4. draftPdfRoute — blocks PDF for pre-review free-preview letters ────

describe("Phase 95 — draftPdfRoute blocks the PDF for free-preview letters", () => {
  const source = readServer("draftPdfRoute.ts");

  it("imports the shared isFreePreviewUnlocked helper", () => {
    expect(source).toMatch(
      /import\s*\{\s*isFreePreviewUnlocked\s*\}\s*from\s*"[^"]*shared\/utils\/free-preview"/
    );
  });

  it("rejects free-preview PDF requests outside the review pipeline", () => {
    expect(source).toMatch(/FREE_PREVIEW_PDF_ALLOWED_STATUSES/);
    expect(source).toMatch(
      /letter\.isFreePreview\s*===\s*true[\s\S]*?!FREE_PREVIEW_PDF_ALLOWED_STATUSES\.has\(letter\.status\)[\s\S]*?res\.status\(403\)/
    );
  });

  it("places the free-preview gate AFTER the status allow-list and BEFORE the version fetch", () => {
    const idxStatusGate = source.indexOf("Draft PDF is only available after");
    const idxFreePreview = source.indexOf(
      "Draft PDF is available after attorney review submission"
    );
    const idxVersionFetch = source.indexOf(
      "getLetterVersionsByRequestId(letterId)"
    );
    expect(idxStatusGate).toBeGreaterThan(0);
    expect(idxFreePreview).toBeGreaterThan(0);
    expect(idxVersionFetch).toBeGreaterThan(0);
    expect(idxStatusGate).toBeLessThan(idxFreePreview);
    expect(idxFreePreview).toBeLessThan(idxVersionFetch);
  });
});

// ─── 5. LetterDetail — server-flag driven branching ───────────────────────

describe("Phase 95 — LetterDetail renders from the server freePreview flag", () => {
  const source = readClient("pages", "subscriber", "LetterDetail.tsx");

  it("imports the new FreePreviewWaiting component", () => {
    expect(source).toMatch(
      /import\s*\{\s*FreePreviewWaiting\s*\}\s*from\s*"@\/components\/FreePreviewWaiting"/
    );
  });

  it("defines freePreviewUnlocked from letter.isFreePreview + aiDraftVersion.freePreview + content", () => {
    expect(source).toMatch(
      /const\s+freePreviewUnlocked\s*=\s*\n?\s*letter\.isFreePreview\s*===\s*true\s*&&\s*\n?\s*\(aiDraftVersion as any\)\?\.freePreview\s*===\s*true\s*&&\s*\n?\s*Boolean\(aiDraftVersion\?\.content\)/
    );
  });

  it("routes free-preview letters into the viewer-or-waiting branch", () => {
    expect(source).toMatch(
      /letter\.isFreePreview\s*===\s*true\s*\?\s*\(\s*\n?\s*freePreviewUnlocked\s*\?\s*\(\s*\n?\s*<FreePreviewViewer/
    );
    expect(source).toMatch(
      /\)\s*:\s*\(\s*\n?\s*<FreePreviewWaiting/
    );
  });

  it("popup effect requires freePreviewUnlocked AND content before opening", () => {
    expect(source).toMatch(/if\s*\(!freePreviewUnlocked\)\s*return/);
  });
});

// ─── 6. LetterPaywall — defensive guard returns null for free-preview ─────

describe("Phase 95 — LetterPaywall defensive __isFreePreview guard", () => {
  const source = readClient("components", "LetterPaywall.tsx");

  it("declares the __isFreePreview prop", () => {
    expect(source).toMatch(/__isFreePreview\?:\s*boolean/);
  });

  it("returns null when __isFreePreview is truthy", () => {
    expect(source).toMatch(/if\s*\(__isFreePreview\)\s*return\s*null/);
  });
});

// ─── 7. FreePreviewWaiting — component shape ──────────────────────────────

describe("Phase 95 — FreePreviewWaiting component", () => {
  const path = join(CLIENT, "components", "FreePreviewWaiting.tsx");

  it("file exists at client/src/components/FreePreviewWaiting.tsx", () => {
    expect(existsSync(path)).toBe(true);
  });

  const source = readClient("components", "FreePreviewWaiting.tsx");

  it("exports a named function FreePreviewWaiting", () => {
    expect(source).toMatch(/export function FreePreviewWaiting\s*\(/);
  });

  it("accepts subject prop only (no unlockAt — server owns the clock)", () => {
    expect(source).toMatch(/subject:\s*string/);
    expect(source).not.toMatch(/unlockAt:/);
  });

  it("uses data-testid=\"free-preview-waiting\"", () => {
    expect(source).toMatch(/data-testid="free-preview-waiting"/);
  });

  it("contains NO payment / CTA buttons (no Button import, no /pricing navigation)", () => {
    expect(source).not.toMatch(/from\s*"@\/components\/ui\/button"/);
    expect(source).not.toMatch(/\/pricing/);
    expect(source).not.toMatch(/checkout|stripe|payFirstLetterReview/i);
  });
});
