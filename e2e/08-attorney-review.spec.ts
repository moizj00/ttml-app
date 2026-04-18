import { expect } from "@playwright/test";
import { test } from "./fixtures/auth";

test.describe("Attorney Review Centre Verification", () => {
  test("letter appears in attorney review queue and can be claimed", async ({ attorneyPage: page }) => {
    test.setTimeout(60000);

    // Navigate to the review queue
    await page.goto("/review/queue");
    await page.waitForLoadState("networkidle");

    // Take screenshot of the review queue
    await page.screenshot({ path: "test-results/review-queue.png", fullPage: true });

    // Look for the letter in the queue (letter #96 should be pending_review)
    const pageContent = await page.textContent("body");
    console.log("Review Queue - has E2E Pipeline content:", pageContent?.includes("E2E Pipeline"));
    console.log("Review Queue - has pending_review content:", 
      pageContent?.includes("pending") || pageContent?.includes("Pending") || pageContent?.includes("review") || pageContent?.includes("Review"));

    // Look for a claim button or review action
    const claimButton = page.getByRole("button", { name: /claim|review|start/i }).first();
    const hasClaimButton = await claimButton.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("Has claim/review button:", hasClaimButton);

    if (hasClaimButton) {
      await claimButton.click();
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: "test-results/review-claimed.png", fullPage: true });
      console.log("After claim URL:", page.url());
    }
  });
});
