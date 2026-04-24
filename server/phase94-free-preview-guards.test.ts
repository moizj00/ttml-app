/**
 * Phase 94 — Free-preview collision guards
 *
 * Prevents the four confirmed cron/admin bugs found in post-merge review of
 * the free-preview lead-magnet feature (PR #67):
 *
 *   1. Free-preview cron fires "preview ready" email after the subscriber
 *      paid early — letter had already moved to pending_review.
 *   2. Admin forceFreePreviewUnlock mutation lacked a status guard — could
 *      re-fire the email on a letter that was already approved/delivered.
 *   3. sendLetterReadyEmail fired "$50 attorney review" for free-preview
 *      letters on pipeline completion, contradicting the waiting-card UI.
 *   4. paywallEmailCron matched free-preview letters, sending a collision
 *      "$50 unlock" email alongside the dedicated free-preview email.
 *
 * Strategy: source-code structural assertions. Matches the pattern in
 * server/e2e-letter-claiming-flow.test.ts — vitest.setup.ts stubs DB/env
 * so live integration tests aren't viable in this suite.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const SERVER = join(ROOT, "server");

function readServer(...parts: string[]): string {
  return readFileSync(join(SERVER, ...parts), "utf-8");
}

// ─── 1. freePreviewEmailCron — exported status allow-list ─────────────────

describe("Phase 94 — freePreviewEmailCron: status allow-list", () => {
  const source = readServer("freePreviewEmailCron.ts");

  it("exports FREE_PREVIEW_ELIGIBLE_STATUSES as a const assertion", () => {
    expect(source).toMatch(
      /export const FREE_PREVIEW_ELIGIBLE_STATUSES\s*=\s*\[/
    );
    expect(source).toMatch(
      /FREE_PREVIEW_ELIGIBLE_STATUSES[\s\S]*?\]\s*as\s*const/
    );
  });

  it("includes all pre-review statuses: pipeline, 24h hold, upsell funnel, legacy, and failure", () => {
    const match = source.match(
      /FREE_PREVIEW_ELIGIBLE_STATUSES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/
    );
    expect(match).toBeTruthy();
    const list = match![1];
    // Pipeline-running statuses
    expect(list).toContain('"submitted"');
    expect(list).toContain('"researching"');
    expect(list).toContain('"drafting"');
    // 24h hold — the primary state when cron fires after generation completes
    expect(list).toContain('"ai_generation_completed_hidden"');
    // Upsell funnel — subscriber can see draft but hasn't paid yet
    expect(list).toContain('"letter_released_to_subscriber"');
    expect(list).toContain('"attorney_review_upsell_shown"');
    expect(list).toContain('"attorney_review_checkout_started"');
    // Legacy (pre-redesign) and failure states
    expect(list).toContain('"generated_locked"');
    expect(list).toContain('"pipeline_failed"');
    // must NOT include post-payment / post-review statuses
    expect(list).not.toContain('"pending_review"');
    expect(list).not.toContain('"under_review"');
    expect(list).not.toContain('"approved"');
    expect(list).not.toContain('"client_approval_pending"');
    expect(list).not.toContain('"sent"');
    expect(list).not.toContain('"rejected"');
  });

  it("imports inArray from drizzle-orm", () => {
    expect(source).toMatch(
      /import\s*{[^}]*\binArray\b[^}]*}\s*from\s*"drizzle-orm"/
    );
  });
});

// ─── 2. dispatchFreePreviewIfReady — status filter in atomic claim ────────

describe("Phase 94 — dispatchFreePreviewIfReady: status filter", () => {
  const source = readServer("freePreviewEmailCron.ts");

  it("uses inArray(letterRequests.status, FREE_PREVIEW_ELIGIBLE_STATUSES) in claim", () => {
    // Find the claimFilters block
    const claimBlock = source.match(/const claimFilters\s*=\s*\[([\s\S]*?)\];/);
    expect(claimBlock).toBeTruthy();
    expect(claimBlock![1]).toMatch(/inArray\(\s*letterRequests\.status/);
    expect(claimBlock![1]).toContain("FREE_PREVIEW_ELIGIBLE_STATUSES");
  });
});

// ─── 3. processFreePreviewEmails — status filter in eligibility query ─────

describe("Phase 94 — processFreePreviewEmails: status filter", () => {
  const source = readServer("freePreviewEmailCron.ts");

  it("the polling cron eligibility query includes the status filter", () => {
    // Everything between `eligibleLetters = await db` and the matching ");"
    const match = source.match(
      /const\s+eligibleLetters\s*=\s*await\s+db[\s\S]*?\);\s*\n/
    );
    expect(match).toBeTruthy();
    expect(match![0]).toMatch(/inArray\(\s*letterRequests\.status/);
    expect(match![0]).toContain("FREE_PREVIEW_ELIGIBLE_STATUSES");
  });
});

// ─── 4. forceFreePreviewUnlock — imports + status guard ───────────────────

describe("Phase 94 — forceFreePreviewUnlock: status guard", () => {
  const source = readServer("routers", "admin", "letters.ts");

  it("imports FREE_PREVIEW_ELIGIBLE_STATUSES from freePreviewEmailCron", () => {
    expect(source).toMatch(
      /import[\s\S]*?FREE_PREVIEW_ELIGIBLE_STATUSES[\s\S]*?from\s*"[^"]*freePreviewEmailCron"/
    );
  });

  it("rejects force-unlock with BAD_REQUEST when status is out of band", () => {
    // Scope to the forceFreePreviewUnlock mutation body.
    const mutationBody = source.match(
      /forceFreePreviewUnlock:\s*adminProcedure[\s\S]*?\}\),/
    );
    expect(mutationBody).toBeTruthy();
    const body = mutationBody![0];
    expect(body).toContain("FREE_PREVIEW_ELIGIBLE_STATUSES");
    expect(body).toMatch(/\.includes\(\s*letter\.status\s*\)/);
    expect(body).toContain("BAD_REQUEST");
    expect(body).toContain("pre-review");
  });

  it("preserves the existing isFreePreview guard before the status guard", () => {
    expect(source).toContain("Letter is not on the free-preview path");
  });
});

// ─── 5. vetting.ts — skip letter-ready email for free-preview ────────────

describe("Phase 94 — vetting.ts: skip letter-ready email for free-preview", () => {
  const source = readServer("pipeline", "vetting.ts");

  it("guards sendLetterReadyEmail on !letterForPaywall.isFreePreview", () => {
    expect(source).toMatch(/!letterForPaywall\.isFreePreview/);
  });

  it("logs an info message when skipping the email", () => {
    expect(source).toMatch(
      /Skipping letter-ready email[\s\S]*?free-preview path owns this/
    );
  });
});

// ─── 6. fallback.ts — skip letter-ready email for free-preview ───────────

describe("Phase 94 — fallback.ts: skip letter-ready email for free-preview", () => {
  const source = readServer("pipeline", "fallback.ts");

  it("guards sendLetterReadyEmail on !letterRecord.isFreePreview", () => {
    expect(source).toMatch(/!letterRecord\.isFreePreview/);
  });

  it("logs an info message when skipping the email", () => {
    expect(source).toMatch(
      /Skipping letter-ready email[\s\S]*?free-preview path owns this/
    );
  });
});

// ─── 7. paywallEmailCron — exclude free-preview letters ──────────────────

describe("Phase 94 — paywallEmailCron: exclude free-preview letters", () => {
  const source = readServer("paywallEmailCron.ts");

  it("eligibility query filters on isFreePreview = false", () => {
    // Scope to the select...where block
    const whereBlock = source.match(
      /const\s+eligibleLetters\s*=\s*await\s+db[\s\S]*?\);\s*\n/
    );
    expect(whereBlock).toBeTruthy();
    expect(whereBlock![0]).toMatch(
      /eq\(\s*letterRequests\.isFreePreview\s*,\s*false\s*\)/
    );
  });

  it("explanatory comment mentions free-preview ownership", () => {
    expect(source.toLowerCase()).toContain("free-preview");
    expect(source).toMatch(/owned\s+by\s+freePreviewEmailCron/i);
  });
});

// ─── 8. Sanity — no test file lookups fail ───────────────────────────────

describe("Phase 94 — test-suite sanity", () => {
  it("all referenced server files exist", () => {
    expect(existsSync(join(SERVER, "freePreviewEmailCron.ts"))).toBe(true);
    expect(existsSync(join(SERVER, "paywallEmailCron.ts"))).toBe(true);
    expect(existsSync(join(SERVER, "pipeline", "vetting.ts"))).toBe(true);
    expect(existsSync(join(SERVER, "pipeline", "fallback.ts"))).toBe(true);
    expect(existsSync(join(SERVER, "routers", "admin", "letters.ts"))).toBe(
      true
    );
  });
});
