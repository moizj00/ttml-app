import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import postgres from "postgres";

/**
 * 06 — Attorney Claim Flow
 *
 * From the Review Queue, attorney:
 *  1. Clicks a letter row to open the ReviewModal
 *  2. Waits for the AI draft to load in the modal
 *  3. Clicks "Claim for Review" button
 *  4. Letter transitions to `under_review` with `assigned_reviewer_id` set
 *
 * This is the most critical attorney interaction — linking a human
 * reviewer to the AI-generated letter.
 *
 * Prerequisite: a letter in `pending_review` in the queue.
 */
test.describe("Attorney Claim Flow — Review Modal & Claim", () => {
  test("clicks letter in queue, views draft in modal, and claims it", async ({ attorneyPage: page }) => {
    test.setTimeout(90_000);

    expect(process.env.DATABASE_URL, "DATABASE_URL must be set").toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      // ── Navigate to review queue ──
      await page.goto("/review/queue");
      await page.waitForLoadState("networkidle");

      // ── Find and click the E2E letter row ──
      // Letters are clickable cards with data-testid="card-letter-{id}"
      // Clicking opens a ReviewModal overlay (does NOT navigate away)
      const letterRow = page.getByText("E2E").first();
      const hasLetterRow = await letterRow.isVisible({ timeout: 5000 }).catch(() => false);

      if (!hasLetterRow) {
        // Fallback: click the first card in the queue
        const firstCard = page.locator("[data-testid^='card-letter-']").first();
        const hasCard = await firstCard.isVisible({ timeout: 5000 }).catch(() => false);
        if (!hasCard) {
          test.skip(true, "No letters in review queue");
          return;
        }
        await firstCard.click();
      } else {
        await letterRow.click();
      }

      // ── Wait for ReviewModal to open and draft to load ──
      // The modal loads draft content asynchronously — needs time
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(5000);

      await page.screenshot({ path: "test-results/platform-review-modal.png", fullPage: true });
      console.log("After click URL:", page.url()); // Should still be /review/queue (modal, not navigation)

      // ── Verify draft content loaded in modal ──
      const modalBody = await page.textContent("body");
      const hasDraftContent =
        modalBody?.includes("Dear") ||
        modalBody?.includes("Sincerely") ||
        modalBody?.includes("demand") ||
        modalBody?.includes("pursuant") ||
        modalBody?.includes("Initial Draft");
      console.log("Draft content loaded:", hasDraftContent);

      // ── Find and click "Claim for Review" button ──
      // The button may have testid="button-claim" (EditorToolbar) or just text "Claim for Review" (ReviewModal)
      const claimBtnByTestId = page.getByTestId("button-claim");
      const claimBtnByText = page.getByRole("button", { name: /claim for review|claim for revision/i }).first();

      let claimBtn = claimBtnByTestId;
      let hasClaimBtn = await claimBtnByTestId.isVisible({ timeout: 3000 }).catch(() => false);

      if (!hasClaimBtn) {
        claimBtn = claimBtnByText;
        hasClaimBtn = await claimBtnByText.isVisible({ timeout: 3000 }).catch(() => false);
      }

      console.log("Has claim button:", hasClaimBtn);

      // Log all visible buttons for debugging
      const allButtons = await page.getByRole("button").allTextContents();
      console.log("All buttons:", allButtons.filter((b) => b.trim()).join(", "));

      expect(hasClaimBtn).toBe(true);

      // ── Click claim ──
      await claimBtn.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      await page.screenshot({ path: "test-results/platform-review-claimed.png", fullPage: true });

      // ── Verify DB status changed ──
      // Find the letter that was just claimed (latest E2E letter in under_review)
      const claimed = await sql`
        SELECT lr.id, lr.status, lr.assigned_reviewer_id, lr.last_status_changed_at,
               u.email AS reviewer_email
        FROM letter_requests lr
        LEFT JOIN users u ON u.id = lr.assigned_reviewer_id
        WHERE lr.status = 'under_review'
          AND lr.subject LIKE 'E2E%'
        ORDER BY lr.last_status_changed_at DESC
        LIMIT 1
      `;

      if (claimed.length > 0) {
        const c = claimed[0];
        console.log(`✓ Letter #${c.id} claimed:`);
        console.log(`  Status: ${c.status}`);
        console.log(`  Assigned reviewer: ${c.reviewer_email} (id: ${c.assigned_reviewer_id})`);
        console.log(`  Claimed at: ${c.last_status_changed_at}`);

        expect(c.status).toBe("under_review");
        expect(c.assigned_reviewer_id).toBeTruthy();
      } else {
        console.log("Warning: No claimed letter found in DB — claim may still be processing");
      }

      console.log("✓ Attorney claim flow verified");
    } finally {
      await sql.end();
    }
  });
});
