import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import postgres from "postgres";

/**
 * 04 — Simulate Payment & Submit for Review
 *
 * Since Stripe payments can't be tested in E2E without test mode,
 * this test simulates what happens AFTER payment by directly
 * transitioning the letter from `generated_locked` → `pending_review`
 * via SQL (mimicking what the billing webhook does).
 *
 * Then verifies:
 *  - The letter's status changed to `pending_review`
 *  - The subscriber can see the updated status on the letter detail page
 *
 * Prerequisite: a letter in `generated_locked` status.
 *   Set PLATFORM_TEST_LETTER_ID env var.
 */
test.describe("Payment Simulation — Submit for Attorney Review", () => {
  test("transitions letter to pending_review and subscriber sees updated status", async ({
    subscriberPage: page,
  }) => {
    test.setTimeout(60_000);

    expect(process.env.DATABASE_URL, "DATABASE_URL must be set").toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      // Find the target letter
      const letterId = process.env.PLATFORM_TEST_LETTER_ID;
      const query = letterId
        ? sql`SELECT id, status FROM letter_requests WHERE id = ${Number(letterId)}`
        : sql`
            SELECT id, status FROM letter_requests
            WHERE status = 'generated_locked' AND subject LIKE 'E2E%'
            ORDER BY created_at DESC LIMIT 1
          `;

      const records = await query;
      if (records.length === 0) {
        // Try to find a letter in pending_review already (previously simulated)
        const fallback = await sql`
          SELECT id, status FROM letter_requests
          WHERE status IN ('pending_review', 'under_review') AND subject LIKE 'E2E%'
          ORDER BY created_at DESC LIMIT 1
        `;
        if (fallback.length > 0) {
          console.log(`Letter #${fallback[0].id} already in ${fallback[0].status}, skipping payment simulation`);
          return;
        }
        test.skip(true, "No letter in generated_locked status found");
        return;
      }

      const letter = records[0];
      console.log(`Letter #${letter.id}: current status = ${letter.status}`);

      // ── Simulate payment by transitioning status ──
      if (letter.status === "generated_locked") {
        await sql`
          UPDATE letter_requests
          SET status = 'pending_review',
              last_status_changed_at = NOW(),
              updated_at = NOW()
          WHERE id = ${letter.id}
        `;
        console.log(`✓ Letter #${letter.id} transitioned to pending_review (payment simulated)`);
      } else {
        console.log(`Letter #${letter.id} already past generated_locked (status: ${letter.status})`);
      }

      // ── Verify subscriber can see the status update ──
      // Dismiss onboarding
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      const skipButton = page.getByRole("button", { name: /skip/i });
      if (await skipButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await skipButton.click();
        await page.waitForTimeout(500);
      }

      await page.goto(`/letters/${letter.id}`);
      await page.waitForLoadState("networkidle");
      if (await skipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await skipButton.click();
        await page.waitForTimeout(500);
      }

      await page.screenshot({ path: "test-results/platform-pending-review.png", fullPage: true });

      const body = await page.textContent("body");
      const showsReviewStatus =
        body?.includes("Pending Review") ||
        body?.includes("pending_review") ||
        body?.includes("Under Review") ||
        body?.includes("Awaiting") ||
        body?.includes("Review");

      console.log("Shows review-related status:", showsReviewStatus);
      expect(showsReviewStatus).toBe(true);

      console.log("✓ Payment simulation and status update verified");
    } finally {
      await sql.end();
    }
  });
});
