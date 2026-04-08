import { expect } from "@playwright/test";
import {
  test,
  isSubscriberConfigured,
} from "./fixtures/auth";

test.describe("Letter intake form — 6-step flow", () => {
  test.beforeEach(() => {
    test.skip(!isSubscriberConfigured, "E2E subscriber credentials not configured");
  });

  test("renders the 6-step intake form with all step indicators visible", async ({ subscriberPage: page }) => {
    await page.goto("/submit");
    await page.waitForLoadState("networkidle");

    const stepLabels = ["Letter Type", "Jurisdiction", "Parties", "Details", "Outcome", "Exhibits"];
    for (const label of stepLabels) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("validates step 1 and blocks navigation when letter type is empty", async ({ subscriberPage: page }) => {
    await page.goto("/submit");
    await page.waitForLoadState("networkidle");

    const nextButton = page.getByRole("button", { name: /next|continue/i }).first();
    await expect(nextButton).toBeVisible({ timeout: 5000 });
    await nextButton.click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/letter type.*required|select.*letter type|required/i).first()).toBeVisible({ timeout: 3000 });
  });

  test("completes all 6 steps with valid data and reaches submit state", async ({ subscriberPage: page }) => {
    await page.goto("/submit");
    await page.waitForLoadState("networkidle");

    const letterTypeOption = page.getByText(/demand.*payment|demand letter/i).first();
    await expect(letterTypeOption).toBeVisible({ timeout: 5000 });
    await letterTypeOption.click();

    const subjectInput = page.getByLabel(/subject/i).first();
    await expect(subjectInput).toBeVisible();
    await subjectInput.fill("E2E Test: Unpaid invoice for web development services");

    const nextButton = page.getByRole("button", { name: /next|continue/i }).first();
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    await expect(page.getByText(/jurisdiction|state/i).first()).toBeVisible({ timeout: 5000 });

    const stateSelect = page.locator('select, [role="combobox"]').first();
    await expect(stateSelect).toBeVisible({ timeout: 5000 });
    await stateSelect.click();

    const californiaOption = page.getByText(/california/i).first();
    await expect(californiaOption).toBeVisible({ timeout: 3000 });
    await californiaOption.click();

    await page.getByRole("button", { name: /next|continue/i }).first().click();

    await page.waitForTimeout(500);
    const senderName = page.getByLabel(/sender.*name|your.*name/i).first();
    await expect(senderName).toBeVisible({ timeout: 5000 });
    await senderName.fill("John Doe");

    const senderAddress = page.getByLabel(/sender.*address|your.*address/i).first();
    await expect(senderAddress).toBeVisible();
    await senderAddress.fill("123 Main Street, Los Angeles, CA 90001");

    const recipientName = page.getByLabel(/recipient.*name/i).first();
    await expect(recipientName).toBeVisible();
    await recipientName.fill("Jane Smith");

    const recipientAddress = page.getByLabel(/recipient.*address/i).first();
    await expect(recipientAddress).toBeVisible();
    await recipientAddress.fill("456 Oak Avenue, San Francisco, CA 94102");

    await page.getByRole("button", { name: /next|continue/i }).first().click();

    await page.waitForTimeout(500);
    const description = page.getByLabel(/description|details|situation/i).first();
    await expect(description).toBeVisible({ timeout: 5000 });
    await description.fill(
      "The recipient contracted web development services on January 15, 2025 for a total of $5,000. " +
      "Work was completed and delivered on March 1, 2025. Despite multiple invoices and follow-ups, " +
      "the recipient has failed to make payment."
    );

    await page.getByRole("button", { name: /next|continue/i }).first().click();

    await page.waitForTimeout(500);
    const desiredOutcome = page.getByLabel(/desired outcome|outcome|resolution/i).first();
    await expect(desiredOutcome).toBeVisible({ timeout: 5000 });
    await desiredOutcome.fill(
      "Full payment of $5,000 within 15 business days of receiving this demand letter."
    );

    await page.getByRole("button", { name: /next|continue/i }).first().click();

    await page.waitForTimeout(500);
    await expect(page.getByText(/exhibit/i).first()).toBeVisible({ timeout: 5000 });

    const submitButton = page.getByRole("button", { name: /submit|send|finalize/i }).first();
    await expect(submitButton).toBeVisible({ timeout: 5000 });
  });

  test("back button on step 2+ returns to previous step preserving data", async ({ subscriberPage: page }) => {
    await page.goto("/submit");
    await page.waitForLoadState("networkidle");

    const letterTypeOption = page.getByText(/demand.*payment|demand letter/i).first();
    await expect(letterTypeOption).toBeVisible({ timeout: 5000 });
    await letterTypeOption.click();

    const subjectInput = page.getByLabel(/subject/i).first();
    await subjectInput.fill("Back button test subject");

    await page.getByRole("button", { name: /next|continue/i }).first().click();
    await page.waitForTimeout(500);

    const backButton = page.getByRole("button", { name: /back|previous/i }).first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    await expect(page.getByLabel(/subject/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/subject/i).first()).toHaveValue("Back button test subject");
  });

  test("draft is persisted and resume banner appears on revisit", async ({ subscriberPage: page }) => {
    await page.goto("/submit");
    await page.waitForLoadState("networkidle");

    const letterTypeOption = page.getByText(/demand.*payment|demand letter/i).first();
    await expect(letterTypeOption).toBeVisible({ timeout: 5000 });
    await letterTypeOption.click();

    const subjectInput = page.getByLabel(/subject/i).first();
    await subjectInput.fill("Draft persistence test");

    await page.waitForTimeout(2000);

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.goto("/submit");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/resume|saved|draft/i).first()).toBeVisible({ timeout: 5000 });
  });
});
