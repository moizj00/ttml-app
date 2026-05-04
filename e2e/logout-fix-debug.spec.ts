import { test, expect } from "@playwright/test";

test("check sign out button visibility", async ({ page }) => {
  // Login first
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("input-email").fill("test.subscriber@e2e.ttml.test");
  await page.getByTestId("input-password").fill("TestSubscriber123!");
  await page.getByTestId("button-login").click();
  await page.waitForURL(/\/dashboard/);
  
  // Check for "Sign Out"
  const signOutBtn = page.getByRole("button", { name: /sign\s*out/i }).first();
  const isVisible = await signOutBtn.isVisible();
  console.log("Sign Out button visible:", isVisible);
  
  if (!isVisible) {
    // If not visible, maybe we need to open sidebar?
    console.log("Button not visible, taking screenshot...");
    await page.screenshot({ path: "logout-debug-hidden.png" });
  } else {
    console.log("Button is visible! Clicking...");
    await signOutBtn.click();
    await page.waitForURL(/\/login/);
    console.log("Logout successful!");
  }
});
