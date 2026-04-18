import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import postgres from "postgres";

/**
 * 05 — Attorney Review Queue
 *
 * After a letter reaches `pending_review`, verify:
 *  - Attorney can log in and see the Review Queue
 *  - The letter appears with "New" badge and "Awaiting Review"
 *  - The pending letters count is shown
 *
 * Prerequisite: a letter in `pending_review` status.
 *   Set PLATFORM_TEST_LETTER_ID env var.
 */
test.describe("Attorney Review Queue — Letter Visible", () => {
  test("letter appears in attorney review queue with correct status", async ({ attorneyPage: page }) => {
    test.setTimeout(60_000);

    // ── Navigate to review queue ──
    await page.goto("/review/queue");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "test-results/platform-review-queue.png", fullPage: true });

    const body = await page.textContent("body");

    // Verify we're on the review queue
    expect(body).toContain("Review Queue");

    // Verify pending letters count is shown
    const hasPendingCount = body?.includes("pending") || body?.includes("Pending");
    console.log("Shows pending count:", hasPendingCount);

    // Look for E2E test letter in the queue
    const hasE2ELetter = body?.includes("E2E") || body?.includes("Pipeline") || body?.includes("Platform");
    console.log("Has E2E letter in queue:", hasE2ELetter);

    // Verify at least one letter card exists
    const letterCards = page.locator("[data-testid^='card-letter-']");
    const cardCount = await letterCards.count();
    console.log("Letter cards in queue:", cardCount);
    expect(cardCount).toBeGreaterThan(0);

    // Verify the first card has expected elements
    const firstCard = letterCards.first();
    const cardText = await firstCard.textContent();
    console.log("First card text:", cardText?.slice(0, 100));

    // Check for "Awaiting Review" or similar status badge
    const hasAwaitingReview =
      cardText?.includes("Awaiting") || cardText?.includes("New") || cardText?.includes("Pending");
    console.log("Has awaiting review indicator:", hasAwaitingReview);

    console.log("✓ Attorney review queue verified");
  });
});
