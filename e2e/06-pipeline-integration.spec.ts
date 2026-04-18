import { expect } from "@playwright/test";
import { test, isSubscriberConfigured } from "./fixtures/auth";
import postgres from "postgres";

test.describe("E2E Pipeline Integration Test", () => {
  test.beforeEach(() => {
    // Skip if e2e subscriber doesn't exist
    test.skip(!isSubscriberConfigured, "E2E subscriber credentials not configured");
  });

  test("runs the AI pipeline after successful intake form submission", async ({ subscriberPage: page }) => {
    test.setTimeout(120000); // Pipeline can take a while

    // 1. Submit the Letter via UI
    await page.goto("/submit");
    await page.waitForLoadState("networkidle");

    // Wait for the form to appear
    await expect(page.getByText(/letter type/i).first()).toBeVisible({ timeout: 5000 });

    // Step 1: Letter Type
    const letterTypeOption = page.getByText(/demand.*payment|demand letter/i).first();
    await expect(letterTypeOption).toBeVisible({ timeout: 5000 });
    await letterTypeOption.click();
    
    // We use a unique subject so we can query it safely from the DB
    const uniqueTestSubject = `E2E Pipeline Run ${Date.now()}`;
    await page.getByLabel(/subject/i).first().fill(uniqueTestSubject);
    await page.getByRole("button", { name: /next|continue/i }).first().click();

    // Step 2: Jurisdiction
    await expect(page.getByText(/jurisdiction|state/i).first()).toBeVisible({ timeout: 5000 });
    const stateSelect = page.locator('select, [role="combobox"]').first();
    await expect(stateSelect).toBeVisible({ timeout: 5000 });
    await stateSelect.click();
    await page.getByText(/california/i).first().click();
    await page.getByRole("button", { name: /next|continue/i }).first().click();

    // Step 3: Parties
    await page.waitForTimeout(500);
    const senderName = page.getByLabel(/sender.*name|your.*name/i).first();
    await expect(senderName).toBeVisible({ timeout: 5000 });
    await senderName.fill("Test Sender");
    await page.getByLabel(/sender.*address|your.*address/i).first().fill("123 Test Ave, CA");
    await page.getByLabel(/recipient.*name/i).first().fill("Test Recipient");
    await page.getByLabel(/recipient.*address/i).first().fill("456 Target Blvd, CA");
    await page.getByRole("button", { name: /next|continue/i }).first().click();

    // Step 4: Details
    await page.waitForTimeout(500);
    const description = page.getByLabel(/description|details|situation/i).first();
    await expect(description).toBeVisible({ timeout: 5000 });
    await description.fill("E2E Test scenario describing the incident in detail.");
    await page.getByRole("button", { name: /next|continue/i }).first().click();

    // Step 5: Outcome
    await page.waitForTimeout(500);
    const desiredOutcome = page.getByLabel(/desired outcome|outcome|resolution/i).first();
    await expect(desiredOutcome).toBeVisible({ timeout: 5000 });
    await desiredOutcome.fill("To resolve the E2E test successfully by receiving $1000.");
    await page.getByRole("button", { name: /next|continue/i }).first().click();

    // Step 6: Finalize (Submit)
    await page.waitForTimeout(500);
    const submitButton = page.getByRole("button", { name: /submit|send|finalize/i }).first();
    await expect(submitButton).toBeVisible({ timeout: 5000 });
    await submitButton.click();

    // The app should redirect to dashboard/status page or similar
    await page.waitForURL((url) => url.pathname.includes("/dashboard") || url.pathname.includes("/letters/"), { timeout: 30000 });
    
    // To verify in DB, let's create a Postgres connection
    expect(process.env.DATABASE_URL, "DATABASE_URL environment variable must be provided").toBeDefined();
    
    const sql = postgres(process.env.DATABASE_URL!);
    
    try {
      // 2. Poll DB to check if intakeJson saved AND if pipeline transitioned it to researching/drafting
      let foundRecord;
      let isProcessing = false;
      
      for (let i = 0; i < 20; i++) {
        // Poll every 3 seconds
        await page.waitForTimeout(3000);
        
        // Find the record by exactly matching our unique test subject
        const records = await sql`
          SELECT id, status, "intakeJson"
          FROM letter_requests 
          WHERE "intakeJson"->>'subject' = ${uniqueTestSubject}
          ORDER BY "createdAt" DESC LIMIT 1;
        `;
        
        if (records.length > 0) {
          foundRecord = records[0];
          
          // Check if the pipeline has started processing
          if (["researching", "drafting", "generated_locked", "needs_changes", "rejected", "approved"].includes(foundRecord.status)) {
            isProcessing = true;
            break;
          }
        }
      }
      
      // Assertions
      expect(foundRecord).toBeDefined();
      expect(foundRecord.intakeJson).toBeTruthy();
      expect(foundRecord.intakeJson.parties.sender.name).toBe("Test Sender");
      expect(isProcessing).toBe(true);

    } finally {
      await sql.end();
    }
  });
});
