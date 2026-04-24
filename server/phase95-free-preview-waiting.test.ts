/**
 * Phase 95 — Free-preview waiting screen (pre-unlock content gate)
 *
 * Closes the gap where free-preview subscribers could see the truncated 20%
 * draft preview before the 24h cooling window elapsed. Three layers must
 * agree on the new rule: when `letter.isFreePreview === true` AND
 * `freePreviewUnlockAt > NOW()`, no ai_draft content is exposed (not even
 * the 20% slice) and the response is tagged `freePreviewWaiting: true` so
 * the client routes to <FreePreviewWaiting/> instead of <LetterPaywall/>.
 *
 *   1. server/db/letter-versions.ts — getLetterVersionsByRequestId returns
 *      empty content + freePreviewWaiting flag for pre-unlock free-preview.
 *   2. server/routers/versions.ts — versions.get mirrors the same gate when
 *      a subscriber fetches an ai_draft version directly by id.
 *   3. server/routers/letters/subscriber.ts — passes letter.isFreePreview
 *      down to the versions DAL (otherwise the gate is dead code).
 *   4. server/draftPdfRoute.ts — 403s the watermarked PDF endpoint while
 *      the cooling window is still open, otherwise the in-app gate leaks
 *      via the PDF stream.
 *   5. client/src/pages/subscriber/LetterDetail.tsx — 3-way branching that
 *      renders FreePreviewWaiting before falling through to LetterPaywall.
 *   6. client/src/components/LetterPaywall.tsx — defensive __isFreePreview
 *      guard returns null after all hooks (rules-of-hooks compliant).
 *   7. client/src/components/FreePreviewWaiting.tsx — exists, has
 *      data-testid="free-preview-waiting", no payment CTA.
 *
 * Strategy: source-code structural assertions, matching phase94's pattern
 * (vitest.setup.ts stubs DB/env so live integration tests aren't viable).
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

// ─── 1. letter-versions DAL — new isFreePreview parameter + gate ──────────

describe("Phase 95 — getLetterVersionsByRequestId: pre-unlock content gate", () => {
  const source = readServer("db", "letter-versions.ts");

  it("declares the new isFreePreview parameter on getLetterVersionsByRequestId", () => {
    expect(source).toMatch(
      /export async function getLetterVersionsByRequestId\([\s\S]*?isFreePreview\s*=\s*false[\s\S]*?\)/
    );
  });

  it("returns empty content + freePreviewWaiting:true inside the generated_locked branch when isFreePreview && !freePreviewUnlocked", () => {
    expect(source).toMatch(
      /if\s*\(\s*isFreePreview\s*\)\s*\{[\s\S]*?content:\s*""[\s\S]*?freePreviewWaiting:\s*true\s*as\s*const[\s\S]*?\}/
    );
  });

  it("preserves the existing freePreviewUnlocked branch (full draft + freePreview:true)", () => {
    expect(source).toMatch(
      /if\s*\(\s*freePreviewUnlocked\s*\)[\s\S]*?freePreview:\s*true\s*as\s*const/
    );
  });

  it("preserves the standard 20% truncation fallback for non-free-preview", () => {
    expect(source).toMatch(/truncateContent\(v\.content\)/);
  });

  it("orders the branches so the pre-unlock free-preview gate runs BEFORE the truncation fallback", () => {
    const idxFreePreview = source.indexOf("freePreviewWaiting: true as const");
    const idxTruncate = source.indexOf("truncateContent(v.content)");
    expect(idxFreePreview).toBeGreaterThan(0);
    expect(idxTruncate).toBeGreaterThan(0);
    expect(idxFreePreview).toBeLessThan(idxTruncate);
  });
});

// ─── 2. subscriber router — passes letter.isFreePreview into the DAL ──────

describe("Phase 95 — subscriber.detail wires isFreePreview into the DAL", () => {
  const source = readServer("routers", "letters", "subscriber.ts");

  it("passes letter.isFreePreview === true as the 5th argument", () => {
    expect(source).toMatch(
      /getLetterVersionsByRequestId\(\s*input\.id,\s*false,\s*letter\.status,\s*freePreviewUnlocked,\s*letter\.isFreePreview\s*===\s*true\s*\)/
    );
  });
});

// ─── 3. versions.get — duplicate truncation path mirrors the gate ─────────

describe("Phase 95 — versions.get mirrors the pre-unlock gate", () => {
  const source = readServer("routers", "versions.ts");

  it("returns empty content + freePreviewWaiting:true for pre-unlock free-preview", () => {
    expect(source).toMatch(
      /letter\.isFreePreview\s*===\s*true[\s\S]*?content:\s*""[\s\S]*?freePreviewWaiting:\s*true\s*as\s*const/
    );
  });

  it("orders the gate BEFORE the inline 20% truncation slice", () => {
    const idxFreePreview = source.indexOf("freePreviewWaiting: true as const");
    const idxSlice = source.indexOf("Math.floor(lines.length * 0.2)");
    expect(idxFreePreview).toBeGreaterThan(0);
    expect(idxSlice).toBeGreaterThan(0);
    expect(idxFreePreview).toBeLessThan(idxSlice);
  });
});

// ─── 4. draftPdfRoute — free-preview PDF gate + helper defense ────────────

describe("Phase 95 — draftPdfRoute blocks free-preview PDF pre-review", () => {
  const source = readServer("draftPdfRoute.ts");

  it("declares the pre-review free-preview status allow-list", () => {
    expect(source).toMatch(/const\s+FREE_PREVIEW_PDF_ALLOWED_STATUSES\s*=\s*new\s+Set\s*\(/);
    expect(source).toContain('"pending_review"');
    expect(source).toContain('"under_review"');
    expect(source).toContain('"approved"');
  });

  it("blocks free-preview PDFs before attorney-review statuses", () => {
    expect(source).toMatch(
      /letter\.isFreePreview\s*===\s*true[\s\S]*?!FREE_PREVIEW_PDF_ALLOWED_STATUSES\.has\(letter\.status\)[\s\S]*?res\.status\(403\)/
    );
  });

  it("uses isFreePreviewUnlocked helper as defense-in-depth", () => {
    expect(source).toMatch(/import\s*\{\s*isFreePreviewUnlocked\s*\}\s*from\s*"\.\.\/shared\/utils\/free-preview"/);
    expect(source).toMatch(/letter\.isFreePreview\s*===\s*true\s*&&\s*!isFreePreviewUnlocked\(letter\)/);
    expect(source).toContain("Free preview is not yet available");
  });

  it("places free-preview gates AFTER status allow-list and BEFORE version fetch", () => {
    const idxStatusGate = source.indexOf("Draft PDF is only available after");
    const idxFreePreview = source.indexOf(
      "Draft PDF is available after attorney review submission."
    );
    const idxVersionFetch = source.indexOf("getLetterVersionsByRequestId(letterId)");
    expect(idxStatusGate).toBeGreaterThan(0);
    expect(idxFreePreview).toBeGreaterThan(0);
    expect(idxVersionFetch).toBeGreaterThan(0);
    expect(idxStatusGate).toBeLessThan(idxFreePreview);
    expect(idxFreePreview).toBeLessThan(idxVersionFetch);
  });
});

// ─── 5. LetterDetail — 3-way branching, hoisted out of isGeneratedLocked ──

describe("Phase 95 — LetterDetail renders FreePreviewWaiting outside isGeneratedLocked", () => {
  const source = readClient("pages", "subscriber", "LetterDetail.tsx");

  it("imports the new FreePreviewWaiting component", () => {
    expect(source).toMatch(
      /import\s*\{\s*FreePreviewWaiting\s*\}\s*from\s*"@\/components\/FreePreviewWaiting"/
    );
  });

  it("renders FreePreviewWaiting when free-preview AND not yet unlocked", () => {
    expect(source).toMatch(
      /letter\.isFreePreview\s*===\s*true\s*&&\s*\(aiDraftVersion as any\)\?\.freePreview\s*!==\s*true[\s\S]*?<FreePreviewWaiting/
    );
  });

  it("renders FreePreviewWaiting without unlockAt prop", () => {
    const waitingCall = source.match(/<FreePreviewWaiting[\s\S]*?\/>/);
    expect(waitingCall).toBeTruthy();
    expect(waitingCall![0]).toMatch(/subject=\{letter\.subject\}/);
    expect(waitingCall![0]).not.toMatch(/unlockAt=/);
  });

  it("forwards __isFreePreview to LetterPaywall as a defensive guard", () => {
    expect(source).toMatch(
      /<LetterPaywall[\s\S]*?__isFreePreview=\{letter\.isFreePreview\s*===\s*true\}/
    );
  });
});

// ─── 6. LetterPaywall — defensive guard returns null for free-preview ─────

describe("Phase 95 — LetterPaywall defensive __isFreePreview guard", () => {
  const source = readClient("components", "LetterPaywall.tsx");

  it("declares the __isFreePreview prop", () => {
    expect(source).toMatch(/__isFreePreview\?:\s*boolean/);
  });

  it("destructures __isFreePreview and returns null when truthy", () => {
    expect(source).toMatch(/__isFreePreview,?\s*\}:\s*LetterPaywallProps/);
    expect(source).toMatch(/if\s*\(__isFreePreview\)\s*return\s*null/);
  });

  it("places the guard AFTER hook calls (rules-of-hooks compliant)", () => {
    const idxFirstHook = source.search(/useMemo|useState|useLocation|useSearch|trpc\./);
    const idxGuard = source.indexOf("if (__isFreePreview) return null");
    expect(idxFirstHook).toBeGreaterThan(0);
    expect(idxGuard).toBeGreaterThan(0);
    expect(idxGuard).toBeGreaterThan(idxFirstHook);
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

  it("accepts subject prop", () => {
    expect(source).toMatch(/subject:\s*string/);
    expect(source).not.toMatch(/unlockAt:/);
  });

  it("uses data-testid=\"free-preview-waiting\"", () => {
    expect(source).toMatch(/data-testid="free-preview-waiting"/);
  });

  it("does not include countdown logic", () => {
    expect(source).not.toMatch(/hoursRemaining/);
    expect(source).not.toMatch(/~\{hoursRemaining\}h/);
  });

  it("contains NO payment / CTA buttons (no Button import, no /pricing navigation)", () => {
    expect(source).not.toMatch(/from\s*"@\/components\/ui\/button"/);
    expect(source).not.toMatch(/\/pricing/);
    expect(source).not.toMatch(/checkout|stripe|payFirstLetterReview/i);
  });
});
