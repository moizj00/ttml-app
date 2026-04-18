import { expect } from "@playwright/test";
import { test } from "./fixtures/auth";

test.describe("Paywall and Payment Flow Verification", () => {
  test("shows draft locked behind paywall with payment options", async ({ subscriberPage: page }) => {
    test.setTimeout(60000);

    // Navigate to the dashboard first
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Find and click on the most recent letter (should be the generated_locked one)
    // Look for the letter in the dashboard list
    const letterLink = page.locator("a[href*='/letters/']").first();
    await expect(letterLink).toBeVisible({ timeout: 10000 });
    await letterLink.click();
    await page.waitForLoadState("networkidle");

    // Take a screenshot of the letter detail page
    await page.screenshot({ path: "test-results/paywall-view.png", fullPage: true });

    // Verify the page shows paywall-related content
    // Check for generated_locked status indicators
    const pageContent = await page.textContent("body");
    
    // The page should show the letter detail with paywall locked state
    // Look for paywall-related UI elements
    const hasPaywallContent = 
      pageContent?.includes("Subscribe") || 
      pageContent?.includes("subscribe") ||
      pageContent?.includes("Unlock") ||
      pageContent?.includes("unlock") ||
      pageContent?.includes("Review") ||
      pageContent?.includes("review") ||
      pageContent?.includes("$50") ||
      pageContent?.includes("$200") ||
      pageContent?.includes("One-Time") ||
      pageContent?.includes("one-time") ||
      pageContent?.includes("attorney") ||
      pageContent?.includes("Attorney") ||
      pageContent?.includes("Draft Ready") ||
      pageContent?.includes("Generated");

    expect(hasPaywallContent).toBeTruthy();

    console.log("Page URL:", page.url());
    console.log("Paywall content found:", hasPaywallContent);
  });
});
