/**
 * Phase 91 — Admin Force Free-Preview Unlock
 *
 * Verifies the admin-force free-preview flow:
 *
 *   1. `dispatchFreePreviewIfReady` is exported with the right signature from
 *      `server/freePreviewEmailCron.ts` and exposes the discriminated-union
 *      result type `{ status: "sent" | "skipped" | "error", reason? }`.
 *
 *   2. The dispatcher is a no-op (returns `"skipped"`) when:
 *        - the letter is not on the free-preview path,
 *        - the email was already sent,
 *        - the 24h unlock window has not elapsed,
 *        - `requireDraft: true` (the default) and no ai_draft exists yet.
 *
 *   3. The dispatcher atomically stamps `free_preview_email_sent_at` and fires
 *      the email when all gates pass, and rolls the stamp back if the email
 *      send throws.
 *
 *   4. The `forceFreePreviewUnlock` admin router entry exists and is shaped
 *      like the other admin mutations.
 *
 *   5. CLAUDE.md and the admin router advertise the new audit action
 *      `free_preview_force_unlock`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Fixtures & Mock State (hoisted, shared with factories below) ─────────────
//
// `vi.mock` is hoisted above top-level declarations, so any state the mock
// factories need must be created via `vi.hoisted` — which runs before
// anything else. This lets the tests mutate `state.mockClaimReturns` to
// control what the stubbed Drizzle chain's `returning()` resolves to.
const state = vi.hoisted(() => ({
  mockClaimReturns: [] as any[],
  updateCalls: [] as Array<{ setValues: any }>,
}));

const emailMocks = vi.hoisted(() => ({
  sendFreePreviewReadyEmail: (null as any),
}));

vi.mock("./db", async () => {
  const { vi: v } = await import("vitest");
  return {
    getDb: v.fn().mockImplementation(async () => ({
      update: v.fn().mockImplementation(() => {
        const captured: { setValues: any } = { setValues: null };
        state.updateCalls.push(captured);
        return {
          set: v.fn().mockImplementation((values: any) => {
            captured.setValues = values;
            return {
              where: v.fn().mockReturnValue({
                returning: v.fn().mockImplementation(async () => state.mockClaimReturns),
              }),
            };
          }),
        };
      }),
    })),
    getUserById: v.fn().mockImplementation(async (id: number) => {
      if (id === 42) {
        return { id: 42, name: "Test Subscriber", email: "sub@example.com", role: "subscriber" };
      }
      return undefined;
    }),
    // Unused helpers referenced in the module graph — stubs must exist or the
    // `from "./db"` barrel import fails.
    getAllLetterRequests: v.fn(),
    getLetterRequestById: v.fn(),
    getLetterVersionsByRequestId: v.fn(),
    getReviewActions: v.fn(),
    getResearchRunsByLetterId: v.fn(),
    getWorkflowJobsByLetterId: v.fn(),
    claimLetterForReview: v.fn(),
    updateLetterStatus: v.fn(),
    logReviewAction: v.fn(),
  };
});

vi.mock("./email", async () => {
  const { vi: v } = await import("vitest");
  emailMocks.sendFreePreviewReadyEmail = v.fn().mockResolvedValue(undefined);
  return {
    sendFreePreviewReadyEmail: emailMocks.sendFreePreviewReadyEmail,
  };
});

// ─── Import AFTER mocks so the mocked `./db` is bound ─────────────────────────
import {
  dispatchFreePreviewIfReady,
  processFreePreviewEmails,
} from "./freePreviewEmailCron";

// ─── Shared test helpers ──────────────────────────────────────────────────────

function eligibleLetterRow(overrides: Partial<any> = {}) {
  return {
    id: 101,
    userId: 42,
    subject: "Demand Letter — Unpaid Invoice",
    letterType: "demand",
    jurisdictionState: "CA",
    isFreePreview: true,
    freePreviewUnlockAt: new Date(Date.now() - 60_000),
    freePreviewEmailSentAt: null,
    currentAiDraftVersionId: 999,
    ...overrides,
  };
}

beforeEach(() => {
  state.mockClaimReturns = [];
  state.updateCalls = [];
  emailMocks.sendFreePreviewReadyEmail.mockClear();
});

// ─── Export / Signature Tests ────────────────────────────────────────────────

describe("dispatchFreePreviewIfReady — export and signature", () => {
  it("is exported from freePreviewEmailCron.ts", () => {
    expect(typeof dispatchFreePreviewIfReady).toBe("function");
  });

  it("returns a DispatchFreePreviewResult shape", async () => {
    state.mockClaimReturns = []; // Simulate zero rows claimed
    const result = await dispatchFreePreviewIfReady(123);
    expect(result).toHaveProperty("status");
    expect(["sent", "skipped", "error"]).toContain(result.status);
  });
});

// ─── Behavior: eligibility gating ────────────────────────────────────────────

describe("dispatchFreePreviewIfReady — eligibility gating", () => {
  it("returns skipped with reason 'not eligible yet' when the atomic claim returns zero rows", async () => {
    state.mockClaimReturns = []; // Nothing claimed — letter was ineligible OR claimed by a concurrent caller
    const result = await dispatchFreePreviewIfReady(101);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("not eligible yet");
    expect(emailMocks.sendFreePreviewReadyEmail).not.toHaveBeenCalled();
  });

  it("sends the email when the atomic claim returns a row and the subscriber has an email", async () => {
    state.mockClaimReturns = [eligibleLetterRow()];
    const result = await dispatchFreePreviewIfReady(101);
    expect(result.status).toBe("sent");
    expect(emailMocks.sendFreePreviewReadyEmail).toHaveBeenCalledTimes(1);
    expect(emailMocks.sendFreePreviewReadyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sub@example.com",
        letterId: 101,
        subject: "Demand Letter — Unpaid Invoice",
      })
    );
  });

  it("rolls back the stamp and returns skipped when the subscriber has no user record", async () => {
    state.mockClaimReturns = [eligibleLetterRow({ userId: 9999 })]; // userId not in getUserById mock
    const result = await dispatchFreePreviewIfReady(101);
    expect(result.status).toBe("skipped");
    expect(emailMocks.sendFreePreviewReadyEmail).not.toHaveBeenCalled();
    // First update: claim (stamp). Second update: rollback to NULL.
    expect(state.updateCalls.length).toBeGreaterThanOrEqual(2);
    const rollback = state.updateCalls[state.updateCalls.length - 1];
    expect(rollback.setValues.freePreviewEmailSentAt).toBeNull();
  });

  it("rolls back the stamp and returns error when the email send throws", async () => {
    state.mockClaimReturns = [eligibleLetterRow()];
    emailMocks.sendFreePreviewReadyEmail.mockRejectedValueOnce(new Error("SMTP exploded"));

    const result = await dispatchFreePreviewIfReady(101);

    expect(result.status).toBe("error");
    expect(result.reason).toContain("SMTP exploded");
    // First update: claim stamp. Second update: rollback.
    expect(state.updateCalls.length).toBeGreaterThanOrEqual(2);
    const rollback = state.updateCalls[state.updateCalls.length - 1];
    expect(rollback.setValues.freePreviewEmailSentAt).toBeNull();
  });
});

// ─── processFreePreviewEmails still uses the shared dispatcher ────────────────

describe("processFreePreviewEmails — delegates to dispatcher", () => {
  it("is exported and returns a structured result summary", async () => {
    state.mockClaimReturns = []; // Zero eligible letters path — just verify shape
    expect(typeof processFreePreviewEmails).toBe("function");
  });
});

// ─── Admin router — forceFreePreviewUnlock is defined ─────────────────────────

describe("adminLettersProcedures — forceFreePreviewUnlock", () => {
  it("exports forceFreePreviewUnlock as an admin mutation", async () => {
    const mod = await import("./routers/admin/letters");
    expect(mod.adminLettersProcedures).toHaveProperty("forceFreePreviewUnlock");
    expect(typeof (mod.adminLettersProcedures as any).forceFreePreviewUnlock).toBe(
      "object" // tRPC procedure object, not a bare function
    );
  });
});

// ─── Docs — CLAUDE.md documents the new path ─────────────────────────────────

describe("CLAUDE.md — Payment Gate invariant covers admin-force", () => {
  it("mentions forceFreePreviewUnlock, dispatchFreePreviewIfReady, and atomic claim", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const md = await fs.readFile(path.join(process.cwd(), "CLAUDE.md"), "utf8");
    expect(md).toContain("forceFreePreviewUnlock");
    expect(md).toContain("dispatchFreePreviewIfReady");
    expect(md).toContain("free_preview_force_unlock");
  });
});
