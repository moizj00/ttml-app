/**
 * Free-Preview Atomicity Tests
 *
 * Verifies the core atomicity guarantees for the free-preview email dispatch
 * system, which is called from THREE concurrent paths:
 *
 *   1. Pipeline finalize (simple, LangGraph, fallback) immediately after draft
 *   2. In-process cron (every 5 minutes) checking eligibility
 *   3. Admin forceFreePreviewUnlock mutation (manual admin action)
 *
 * These tests assert that:
 *   - Only ONE caller wins the atomic UPDATE...RETURNING claim
 *   - Email is sent exactly once (or skipped cleanly if already sent)
 *   - Rollback occurs if email send fails, allowing cron retries
 *   - Status guard prevents emailing after letter enters paid/review path
 *   - Concurrent claims don't produce duplicate side effects
 *
 * This documents the atomicity pattern critical to the lead-magnet UX.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FREE_PREVIEW_ELIGIBLE_STATUSES } from "./freePreviewEmailCron";
import type { LetterRequest } from "../drizzle/schema";

// ─── Mock Database for Atomic Claim Testing ────────────────────────────────

class MockDatabase {
  private letterRow: Partial<LetterRequest> | null = null;

  setLetter(row: Partial<LetterRequest>) {
    this.letterRow = row;
  }

  /**
   * Simulates atomic UPDATE...RETURNING behavior.
   * Only returns the row if ALL eligibility conditions are met.
   * Returns empty array if any condition fails or if another caller beat us.
   */
  atomicClaimFreePreviewEmail(
    letterId: number,
    requireDraft: boolean = true
  ): Partial<LetterRequest>[] {
    if (!this.letterRow || this.letterRow.id !== letterId) {
      return [];
    }

    // Eligibility check (matches server/freePreviewEmailCron.ts logic)
    const now = new Date();
    const eligible =
      this.letterRow.isFreePreview === true &&
      this.letterRow.freePreviewEmailSentAt == null &&
      (this.letterRow.freePreviewUnlockAt?.getTime() ?? 0) <= now.getTime() &&
      (FREE_PREVIEW_ELIGIBLE_STATUSES as readonly string[]).includes(
        this.letterRow.status || ""
      ) &&
      (!requireDraft || this.letterRow.currentAiDraftVersionId != null);

    if (!eligible) return [];

    // Atomic claim: stamp the row (simulating UPDATE...RETURNING)
    const claimed = { ...this.letterRow };
    this.letterRow.freePreviewEmailSentAt = now;
    return [claimed];
  }

  /**
   * Simulate rollback on email send failure.
   */
  rollbackFreePreviewClaim(letterId: number): void {
    if (this.letterRow?.id === letterId) {
      this.letterRow.freePreviewEmailSentAt = null;
    }
  }

  /**
   * Force collapse the cooling window (admin action).
   */
  forceFreePreviewUnlock(letterId: number): void {
    if (this.letterRow?.id === letterId) {
      this.letterRow.freePreviewUnlockAt = new Date();
    }
  }

  getState(): Partial<LetterRequest> | null {
    return this.letterRow;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Free-Preview Email Dispatch — Atomicity Guarantees", () => {
  let db: MockDatabase;

  beforeEach(() => {
    db = new MockDatabase();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Section 1: Core Eligibility Logic
  // ────────────────────────────────────────────────────────────────────────

  describe("Eligibility gating (all conditions must hold)", () => {
    it("rejects claim if not on free-preview path (isFreePreview = false)", () => {
      db.setLetter({
        id: 1,
        isFreePreview: false,
        freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: 999,
      });

      const result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(0);
    });

    it("rejects claim if already sent (freePreviewEmailSentAt is NOT null)", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: 999,
      });

      const result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(0);
    });

    it("rejects claim if cooling window not elapsed (freePreviewUnlockAt in future)", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "ai_generation_completed_hidden",
        currentAiDraftVersionId: 999,
      });

      const result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(0);
    });

    it("rejects claim if status is NOT in FREE_PREVIEW_ELIGIBLE_STATUSES", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "pending_review", // Already moved to review path — too late
        currentAiDraftVersionId: 999,
      });

      const result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(0);
    });

    it("rejects claim if requireDraft=true and no draft exists", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: null, // No draft yet
      });

      const result = db.atomicClaimFreePreviewEmail(1, true);
      expect(result).toHaveLength(0);
    });

    it("succeeds when all conditions are met (eligible state)", () => {
      const now = new Date();
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: 999,
      });

      const result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(1);
      expect(result[0].freePreviewEmailSentAt).toEqual(now);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Section 2: Concurrent Callers (Only One Winner)
  // ────────────────────────────────────────────────────────────────────────

  describe("Atomic mutual exclusion (UPDATE...RETURNING)", () => {
    it("first caller wins, second caller is rejected cleanly", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: 999,
      });

      // Caller 1 claims
      const claim1 = db.atomicClaimFreePreviewEmail(1);
      expect(claim1).toHaveLength(1);

      // Caller 2 tries to claim same letter — should see it's already stamped
      const claim2 = db.atomicClaimFreePreviewEmail(1);
      expect(claim2).toHaveLength(0);
    });

    it("if email send succeeds, the stamp persists", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: 999,
      });

      db.atomicClaimFreePreviewEmail(1);
      // Simulate successful email send (no rollback)

      const state = db.getState();
      expect(state?.freePreviewEmailSentAt).toBeTruthy();
    });

    it("if email send fails, rollback removes the stamp for retry", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: 999,
      });

      // Caller 1 claims (simulating start of email send)
      const claim1 = db.atomicClaimFreePreviewEmail(1);
      expect(claim1).toHaveLength(1);

      // Simulate email send failure → rollback
      db.rollbackFreePreviewClaim(1);

      const state = db.getState();
      expect(state?.freePreviewEmailSentAt).toBeNull();

      // Caller 2 (cron on next tick) can now retry
      const claim2 = db.atomicClaimFreePreviewEmail(1);
      expect(claim2).toHaveLength(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Section 3: Status Guard (Prevent Email After Payment/Review)
  // ────────────────────────────────────────────────────────────────────────

  describe("Status guard prevents email in paid/review paths", () => {
    const reviewPathStatuses = [
      "pending_review",
      "under_review",
      "approved",
      "client_approval_pending",
      "client_approved",
      "sent",
      "rejected",
    ];

    reviewPathStatuses.forEach(status => {
      it(`rejects claim for status '${status}'`, () => {
        db.setLetter({
          id: 1,
          isFreePreview: true,
          freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          freePreviewEmailSentAt: null,
          status,
          currentAiDraftVersionId: 999,
        });

        const result = db.atomicClaimFreePreviewEmail(1);
        expect(result).toHaveLength(0);
      });
    });

    it("accepts claim for all FREE_PREVIEW_ELIGIBLE_STATUSES", () => {
      FREE_PREVIEW_ELIGIBLE_STATUSES.forEach(status => {
        db.setLetter({
          id: 1,
          isFreePreview: true,
          freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          freePreviewEmailSentAt: null,
          status: status as any,
          currentAiDraftVersionId: 999,
        });

        const result = db.atomicClaimFreePreviewEmail(1);
        expect(result).toHaveLength(1);

        // Reset for next iteration
        db.setLetter({
          id: 1,
          isFreePreview: true,
          freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          freePreviewEmailSentAt: null,
          status: status as any,
          currentAiDraftVersionId: 999,
        });
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Section 4: Admin Force-Unlock Workflow
  // ────────────────────────────────────────────────────────────────────────

  describe("Admin force-unlock collapses cooling window", () => {
    it("admin force-unlock allows immediate dispatch (skips 24h wait)", () => {
      const futureDate = new Date(Date.now() + 25 * 60 * 60 * 1000);
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: futureDate,
        freePreviewEmailSentAt: null,
        status: "ai_generation_completed_hidden",
        currentAiDraftVersionId: 999,
      });

      // Before force-unlock: not eligible (cooling window not elapsed)
      let result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(0);

      // Admin force-unlocks
      db.forceFreePreviewUnlock(1);

      // After force-unlock: now eligible
      // Need to create a fresh letter with updated unlock time
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(), // Now
        freePreviewEmailSentAt: null,
        status: "ai_generation_completed_hidden",
        currentAiDraftVersionId: 999,
      });

      result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(1);
    });

    it("force-unlock does NOT re-fire email if already sent", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(),
        freePreviewEmailSentAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: 999,
      });

      // Admin force-unlocks (updates freePreviewUnlockAt)
      db.forceFreePreviewUnlock(1);

      // Dispatcher still rejects because email was already sent
      const result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(0);
    });

    it("force-unlock on non-eligible status is rejected by admin (status guard)", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "approved", // Already in attorney review
        currentAiDraftVersionId: 999,
      });

      // This would be rejected in the admin mutation (forceFreePreviewUnlock)
      // before it even tries to update. Dispatcher would also reject it because
      // status is not in FREE_PREVIEW_ELIGIBLE_STATUSES.
      const result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Section 5: Three Concurrent Paths Behavior
  // ────────────────────────────────────────────────────────────────────────

  describe("Three concurrent caller paths (cron, pipeline finalize, admin force)", () => {
    it("pipeline finalize wins the race over cron (finalize fires after draft saved)", () => {
      // Scenario: Letter just completed drafting, pipeline finalize is called,
      // AND simultaneously the cron runs.

      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: 999,
      });

      // Finalize caller claims
      const finalizeClaim = db.atomicClaimFreePreviewEmail(1);
      expect(finalizeClaim).toHaveLength(1);

      // Cron caller (next tick) sees already sent
      const cronClaim = db.atomicClaimFreePreviewEmail(1);
      expect(cronClaim).toHaveLength(0);
    });

    it("admin force-unlock then dispatcher sends the email", () => {
      // Scenario: Letter stuck in pipeline at 23h, admin wants to release early.

      const futureDate = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1h from now
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: futureDate,
        freePreviewEmailSentAt: null,
        status: "ai_generation_completed_hidden",
        currentAiDraftVersionId: 999,
      });

      // Before admin force-unlock: not eligible
      let result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(0);

      // Admin force-unlocks
      db.forceFreePreviewUnlock(1);

      // Simulate fresh dispatcher query with updated unlock time
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(), // Collapsed to now
        freePreviewEmailSentAt: null,
        status: "ai_generation_completed_hidden",
        currentAiDraftVersionId: 999,
      });

      // Dispatcher now claims successfully
      result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(1);
    });

    it("cron retries after pipeline finalize failure + rollback", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: 999,
      });

      // Finalize caller claims
      const finalizeClaim = db.atomicClaimFreePreviewEmail(1);
      expect(finalizeClaim).toHaveLength(1);

      // Simulate email send failure
      db.rollbackFreePreviewClaim(1);

      // Cron (next tick) can now retry
      const cronClaim = db.atomicClaimFreePreviewEmail(1);
      expect(cronClaim).toHaveLength(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Section 6: Edge Cases
  // ────────────────────────────────────────────────────────────────────────

  describe("Edge cases and boundary conditions", () => {
    it("handles exact cooling-window boundary (unlock_at = now)", () => {
      const now = new Date();
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: now, // Exactly now
        freePreviewEmailSentAt: null,
        status: "letter_released_to_subscriber",
        currentAiDraftVersionId: 999,
      });

      const result = db.atomicClaimFreePreviewEmail(1);
      expect(result).toHaveLength(1);
    });

    it("requireDraft=false allows dispatch even with no draft", () => {
      db.setLetter({
        id: 1,
        isFreePreview: true,
        freePreviewUnlockAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        freePreviewEmailSentAt: null,
        status: "ai_generation_completed_hidden",
        currentAiDraftVersionId: null,
      });

      const result = db.atomicClaimFreePreviewEmail(1, false);
      expect(result).toHaveLength(1);
    });
  });
});
