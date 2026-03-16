/**
 * Phase 71 — Draft Reminder Cron Tests
 *
 * Verifies:
 *  - sendDraftReminderEmail is exported and callable
 *  - processDraftReminders is exported and returns the correct shape
 *  - registerDraftRemindersRoute is exported
 *  - REMINDER_THRESHOLD_HOURS is 48
 *  - DB schema has draftReminderSentAt column
 *  - Route is wired in the server
 */

import { describe, it, expect } from "vitest";

// ─── Email template export ────────────────────────────────────────────────────

describe("sendDraftReminderEmail — export and signature", () => {
  it("is exported from email.ts", async () => {
    const { sendDraftReminderEmail } = await import("./email");
    expect(typeof sendDraftReminderEmail).toBe("function");
  });

  it("accepts minimal params without throwing", async () => {
    const { sendDraftReminderEmail } = await import("./email");
    const result = sendDraftReminderEmail({
      to: "test@example.com",
      name: "Test User",
      subject: "Demand Letter — Unpaid Invoice",
      letterId: 42,
      appUrl: "https://www.talk-to-my-lawyer.com",
    });
    await expect(result).resolves.toBeUndefined();
  }, 15000);

  it("accepts full params including letterType, jurisdictionState, hoursWaiting", async () => {
    const { sendDraftReminderEmail } = await import("./email");
    const result = sendDraftReminderEmail({
      to: "test@example.com",
      name: "Test User",
      subject: "Cease and Desist",
      letterId: 99,
      appUrl: "https://www.talk-to-my-lawyer.com",
      letterType: "cease-and-desist",
      jurisdictionState: "Texas",
      hoursWaiting: 72,
    });
    await expect(result).resolves.toBeUndefined();
  });
});

// ─── Cron handler module ──────────────────────────────────────────────────────

describe("draftReminders module — exports and configuration", () => {
  it("exports processDraftReminders as a function", async () => {
    const { processDraftReminders } = await import("./draftReminders");
    expect(typeof processDraftReminders).toBe("function");
  });

  it("exports registerDraftRemindersRoute as a function", async () => {
    const { registerDraftRemindersRoute } = await import("./draftReminders");
    expect(typeof registerDraftRemindersRoute).toBe("function");
  });

  it("REMINDER_THRESHOLD_HOURS is exactly 48", async () => {
    const { REMINDER_THRESHOLD_HOURS } = await import("./draftReminders");
    expect(REMINDER_THRESHOLD_HOURS).toBe(48);
  });

  it("processDraftReminders returns a ReminderResult-shaped object when DB is unavailable", async () => {
    // DB will not be available in test env — function should return gracefully
    const { processDraftReminders } = await import("./draftReminders");
    const result = await processDraftReminders();
    expect(result).toMatchObject({
      processed: expect.any(Number),
      sent: expect.any(Number),
      skipped: expect.any(Number),
      errors: expect.any(Number),
      details: expect.any(Array),
    });
  });
});

// ─── DB schema ────────────────────────────────────────────────────────────────

describe("letter_requests schema — draftReminderSentAt column", () => {
  it("letterRequests table has draftReminderSentAt field in schema", async () => {
    const { letterRequests } = await import("../drizzle/schema");
    const columns = Object.keys(letterRequests);
    expect(columns).toContain("draftReminderSentAt");
  });
});

// ─── Route registration ───────────────────────────────────────────────────────

describe("server route registration", () => {
  it("registerDraftRemindersRoute does not throw when called with a mock Express app", async () => {
    const { registerDraftRemindersRoute } = await import("./draftReminders");
    // Minimal mock Express app
    const routes: Array<{ method: string; path: string }> = [];
    const mockApp = {
      post: (path: string, _handler: unknown) => {
        routes.push({ method: "POST", path });
      },
    };
    expect(() => registerDraftRemindersRoute(mockApp as any)).not.toThrow();
    expect(routes.some((r) => r.path === "/api/cron/draft-reminders")).toBe(true);
  });
});

// ─── Email exports integrity ──────────────────────────────────────────────────

describe("email.ts — all exports intact after Phase 71", () => {
  it("all required email functions are still exported", async () => {
    const emailModule = await import("./email");
    const required = [
      "sendLetterReadyEmail",
      "sendDraftReminderEmail",
      "sendLetterUnlockedEmail",
      "sendLetterApprovedEmail",
      "sendLetterRejectedEmail",
      "sendNeedsChangesEmail",
      "sendNewReviewNeededEmail",
      "sendJobFailedAlertEmail",
      "sendStatusUpdateEmail",
      "sendLetterSubmissionEmail",
      "sendVerificationEmail",
      "validateResendCredentials",
    ];
    for (const fn of required) {
      expect(typeof (emailModule as Record<string, unknown>)[fn], `${fn} should be a function`).toBe("function");
    }
  });
});
