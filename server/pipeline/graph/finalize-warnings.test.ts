// ═══════════════════════════════════════════════════════
// Smoke tests for finalize-node warning content.
//
// We can't easily exercise finalizeNode end-to-end without a real DB,
// but we *can* assert that the file contains the warning markers the
// admin/attorney UIs grep for. These string-level checks are
// intentionally similar to the ones in phase92-langgraph-pipeline.test.ts
// so a refactor that drops the markers gets caught fast.
// ═══════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const FINALIZE_PATH = path.join(
  process.cwd(),
  "server/pipeline/graph/nodes/finalize.ts"
);

describe("finalizeNode — degraded visibility markers", () => {
  it("emits a [FINALIZED-DEGRADED] warning when qualityDegraded", async () => {
    const src = await fs.readFile(FINALIZE_PATH, "utf8");
    expect(src).toContain("[FINALIZED-DEGRADED]");
  });

  it("emits a [BEST-EFFORT-FINALIZE] warning on the error-budget-exhausted branch", async () => {
    const src = await fs.readFile(FINALIZE_PATH, "utf8");
    expect(src).toContain("[BEST-EFFORT-FINALIZE]");
  });

  it("includes vetting score / risk / lastErrorCode in degraded warning", async () => {
    const src = await fs.readFile(FINALIZE_PATH, "utf8");
    expect(src).toMatch(/vettingScore=/);
    expect(src).toMatch(/risk=/);
    expect(src).toMatch(/lastErrorCode=/);
  });
});

describe("finalizeNode — idempotency guard", () => {
  it("checks getLetterRequestById and short-circuits on generated_locked + draft pointer", async () => {
    const src = await fs.readFile(FINALIZE_PATH, "utf8");
    expect(src).toMatch(/getLetterRequestById/);
    expect(src).toMatch(/already finalized/);
    // generated_locked is the canonical post-finalize status, and the
    // free-preview variant lives under ai_generation_completed_hidden.
    expect(src).toMatch(/generated_locked/);
    expect(src).toMatch(/ai_generation_completed_hidden/);
  });

  it("wraps the version + flags writes in a db.transaction", async () => {
    const src = await fs.readFile(FINALIZE_PATH, "utf8");
    expect(src).toMatch(/db\.transaction\(/);
  });

  it("status transitions still go through updateLetterStatus (ALLOWED_TRANSITIONS)", async () => {
    const src = await fs.readFile(FINALIZE_PATH, "utf8");
    expect(src).toMatch(/updateLetterStatus\(letterId,\s*finalStatus\)/);
  });
});

describe("failNode — structured error context", () => {
  it("logs lastErrorCode and lastErrorStage to workflow_jobs.errorMessage", async () => {
    const src = await fs.readFile(FINALIZE_PATH, "utf8");
    expect(src).toMatch(/lastErrorCode/);
    expect(src).toMatch(/lastErrorStage/);
    expect(src).toMatch(/captureServerException/);
  });

  it("flags qualityDegraded=true on the letter so the UI can surface failure state", async () => {
    const src = await fs.readFile(FINALIZE_PATH, "utf8");
    expect(src).toMatch(/qualityDegraded:\s*true/);
  });
});
