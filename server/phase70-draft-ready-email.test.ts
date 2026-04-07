/**
 * Phase 70 — Draft Ready Email Tests
 *
 * Verifies the updated sendLetterReadyEmail:
 *  - Exported correctly from email.ts
 *  - Accepts the new optional letterType and jurisdictionState fields
 *  - Does not throw when called with minimal or full params
 *  - n8nCallback fallback paths now land at generated_locked (not pending_review)
 */

import { describe, it, expect } from "vitest";

// ─── sendLetterReadyEmail export & signature ──────────────────────────────────

describe("sendLetterReadyEmail — export and signature", () => {
  it("is exported from email.ts", async () => {
    const { sendLetterReadyEmail } = await import("./email");
    expect(typeof sendLetterReadyEmail).toBe("function");
  });

  it("accepts minimal params (no letterType / jurisdictionState) without throwing", async () => {
    const { sendLetterReadyEmail } = await import("./email");
    // Will fail silently (Resend key not set in test env) but must not throw synchronously
    const result = sendLetterReadyEmail({
      to: "test@example.com",
      name: "Test User",
      subject: "Demand Letter — Unpaid Invoice",
      letterId: 42,
      appUrl: "https://www.talk-to-my-lawyer.com",
    });
    await expect(result).resolves.toBeUndefined();
  });

  it("accepts full params including letterType and jurisdictionState without throwing", async () => {
    const { sendLetterReadyEmail } = await import("./email");
    const result = sendLetterReadyEmail({
      to: "test@example.com",
      name: "Test User",
      subject: "Cease and Desist — Trademark Infringement",
      letterId: 99,
      appUrl: "https://www.talk-to-my-lawyer.com",
      letterType: "cease-and-desist",
      jurisdictionState: "California",
    });
    await expect(result).resolves.toBeUndefined();
  });
});

// ─── n8n fallback status transitions ─────────────────────────────────────────

describe("n8nCallback fallback paths — generated_locked (not pending_review)", () => {
  it("ALLOWED_TRANSITIONS includes drafting → generated_locked (n8n fallback path)", async () => {
    const { ALLOWED_TRANSITIONS } = await import("../shared/types");
    expect(ALLOWED_TRANSITIONS["drafting"]).toContain("generated_locked");
  });

  it("ALLOWED_TRANSITIONS does NOT include drafting → pending_review (removed)", async () => {
    const { ALLOWED_TRANSITIONS } = await import("../shared/types");
    expect(ALLOWED_TRANSITIONS["drafting"] ?? []).not.toContain("pending_review");
  });
});

// ─── Email content expectations (structural) ─────────────────────────────────

describe("sendLetterReadyEmail — content expectations", () => {
  it("all other email exports remain intact after the update", async () => {
    const emailModule = await import("./email");
    const requiredExports = [
      "sendLetterApprovedEmail",
      "sendLetterRejectedEmail",
      "sendNeedsChangesEmail",
      "sendNewReviewNeededEmail",
      "sendJobFailedAlertEmail",
      "sendStatusUpdateEmail",
      "sendLetterSubmissionEmail",
      "sendLetterReadyEmail",
      "sendLetterUnlockedEmail",
      "sendVerificationEmail",
      "validateResendCredentials",
    ];
    for (const fn of requiredExports) {
      expect(typeof (emailModule as Record<string, unknown>)[fn], `${fn} should be a function`).toBe("function");
    }
  });

  it("sendLetterUnlockedEmail (payment confirmed) is still exported and callable", async () => {
    const emailModule = await import("./email");
    expect(typeof (emailModule as Record<string, unknown>)["sendLetterUnlockedEmail"]).toBe("function");
  });
});
