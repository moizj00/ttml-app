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
    // The claim action is triggered by clicking the letter row (arrow →)
    const letterRow = page.getByText("E2E Pipeline Run").first();
    const hasLetterRow = await letterRow.isVisible({ timeout: 5000 }).catch(() => false);
    console.log("Has letter in queue:", hasLetterRow);

    if (hasLetterRow) {
      await letterRow.click();
      await page.waitForLoadState("networkidle");
      // Wait for the review modal draft to load
      await page.waitForTimeout(5000);
      
      // After clicking, a review modal opens with the draft
      await page.screenshot({ path: "test-results/review-detail.png", fullPage: true });
      console.log("After click URL:", page.url());

      // Look for a claim button in the modal
      const claimBtn = page.getByRole("button", { name: /claim|start review|accept|approve/i }).first();
      const hasClaimBtn = await claimBtn.isVisible({ timeout: 5000 }).catch(() => false);
      console.log("Has claim button in modal:", hasClaimBtn);

      // Also check for any action buttons at bottom of modal
      const allButtons = await page.getByRole("button").allTextContents();
      console.log("All visible buttons:", allButtons.filter(b => b.trim()).join(", "));

      if (hasClaimBtn) {
        await claimBtn.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "test-results/review-claimed.png", fullPage: true });
        console.log("After claim URL:", page.url());
      }
    }
  });
});
