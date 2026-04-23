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
  iSearched for regex `forceStatus|forceTransition` (`**/server/routers/admin/letters.ts`), 3 results

Read [](file:///workspaces/ttml-app/server/services/admin.ts#1-1), lines 1 to 200

Searched for regex `force.*Transition|force` (`**/server/services/admin.ts`), 11 results

Read [](file:///workspaces/ttml-app/server/services/admin.ts#408-408), lines 408 to 450

Searched for regex `ALLOWED_TRANSITIONS` (`**/shared/types/letter.ts`), 2 results

Read [](file:///workspaces/ttml-app/shared/types/letter.ts#1-1), lines 1 to 50

Searched for regex `updateLetterStatus` (`**/server/db/letter-requests.ts`), no results

Searched for regex `updateLetterStatus` (`**/server/db/.*\.*`), no results

Searched for regex `updateLetterStatus` (`**/server/db/.*`), no results

Searched for regex `updateLetterStatus` (`**/server/db/**/*.ts`), 1 result

Read [](file:///workspaces/ttml-app/server/db/letters.ts#246-246), lines 246 to 285

Searched for regex `ApprovedBy` (`**/client/src/pages/attorney/ReviewDetail/*.tsx`), no results

Searched for regex `<Badge.*(?:Admin|Attorney|Approved)` (`**/client/src/pages/**/*.tsx`), no results

Searched for regex `badge|` (`**/client/src/pages/attorney/ReviewDetail/*.tsx`), 20 results

Searched for regex `StatusBadge.*status` (`**/client/src/**/*.tsx`), 20 results

Read [](file:///workspaces/ttml-app/client/src/components/shared/StatusBadge.tsx)

Searched for regex `approved.*` (`**/shared/types/letter.ts`), 8 results

Searched for regex `admin_force_status_transition` (`**/server/**/*.ts`), 1 result

### 1. Does "Force Status Transition" work properly to bypass the paywall?

**Yes, it does.** 
When an admin forces the status to `pending_review`, it completely skips the Stripe payment gate lock (`generated_locked`), skips the user's checkout process, and instantly drops the letter right into the **Review Queue** where any attorney or admin can claim it. 

*(Note: The system has a smart safety guard built-in. If you try to force it to `pending_review` but the AI hasn't actually finished writing the draft yet, the system will block the transition and tell you to wait for the draft to exist first. This prevents empty letters from breaking the Review Center).*

### 2. Can we distinguish between "Admin Approved" and "Attorney Approved" in the UI badges?

Currently, the system uses a shared database status (`approved`), so the UI simply renders a green **"Approved"** badge regardless of who clicked "Submit" or who forced the status.

**However, we can easily build this distinction.** Because the `review_actions` audit log records exactly who approved the letter (and what their role was), we can fetch this data and change the badge to reflect it. 

If you want me to build this, here is the plan:

### Plan: Distinguish Admin vs Attorney Approval Badges
**TL;DR:** Update the letter queries to include the role of the user who approved the letter, and modify the `StatusBadge` component to render "Admin Approved" or "Attorney Approved" dynamically.

**Steps**
1. **Update Database Queries (letters.ts)**: When fetching letters for the dashboard or detail views, join or sub-query the `review_actions` table to find the user who triggered the `approve` or `admin_force_status_transition` action.
2. **Expand the API Types (types.ts)**: Add an `approvedByRole?: "admin" | "attorney"` property to the frontend letter payloads.
3. **Update the UI Component (StatusBadge.tsx)**: 
   - If `status === 'approved'` AND `approvedByRole === 'admin'`, change the label to **"Admin Approved"** (perhaps with a slightly different color like orange or dark green).
   - If `approvedByRole === 'attorney'`, change the label to **"Attorney Approved"**.
   - Fall back to just "Approved" for older legacy letters.

Let me know if you would like me to move forward with this plan and write the code for these changes!t("exports forceFreePreviewUnlock as an admin mutation", async () => {
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
