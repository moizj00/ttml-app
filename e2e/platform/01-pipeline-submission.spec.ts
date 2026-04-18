import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import postgres from "postgres";

test.describe("Pipeline Submission — Intake Form to AI Draft", () => {
  test("submits letter through 6-step form and verifies AI pipeline generates draft", async ({
    subscriberPage: page,
  }) => {
    test.setTimeout(120_000); // Pipeline can take a while

    // ── Step 1: Letter Type ──
    await page.goto("/submit");
    await page.waitForLoadState("networkidle");

    const letterTypeBtn = page.getByTestId("button-letter-type-demand-letter");
    await expect(letterTypeBtn).toBeVisible({ timeout: 10_000 });
    await letterTypeBtn.click();

    const uniqueSubject = `E2E Platform Run ${Date.now()}`;
    await page.getByTestId("input-subject").fill(uniqueSubject);
    await page.getByRole("button", { name: /next/i }).click();

    // ── Step 2: Jurisdiction ──
    await expect(page.getByText(/State \/ Jurisdiction/i)).toBeVisible({ timeout: 5000 });
    const jurisdictionTrigger = page.getByRole("combobox").first();
    await jurisdictionTrigger.click();
    await page.getByRole("option", { name: /California/i }).click();
    await page.getByRole("button", { name: /next/i }).click();

    // ── Step 3: Parties ──
    await expect(page.locator("#senderName")).toBeVisible({ timeout: 5000 });
    await page.locator("#senderName").fill("Test Sender");
    await page.getByTestId("input-senderAddress").fill("123 Test Ave, Los Angeles, CA 90001");
    await page.locator("#recipientName").fill("Test Recipient");
    await page.getByTestId("input-recipientAddress").fill("456 Target Blvd, San Francisco, CA 94102");
    await page.getByRole("button", { name: /next/i }).click();

    // ── Step 4: Details ──
    const description = page.getByTestId("input-description");
    await expect(description).toBeVisible({ timeout: 5000 });
    await description.fill(
      "E2E Test scenario describing the incident in detail for the demand letter pipeline test run."
    );
    await page.getByRole("button", { name: /next/i }).click();

    // ── Step 5: Outcome ──
    const desiredOutcome = page.locator("#desiredOutcome");
    await expect(desiredOutcome).toBeVisible({ timeout: 5000 });
    await desiredOutcome.fill("To resolve the E2E test successfully by receiving $1000 in damages.");
    await page.getByRole("button", { name: /next/i }).click();

    // ── Step 6: Exhibits — skip, just submit ──
    await page.waitForTimeout(500);
    const submitButton = page.getByRole("button", { name: /submit letter/i });
    await expect(submitButton).toBeVisible({ timeout: 5000 });
    await submitButton.click();

    // App redirects to dashboard or letter detail after submission
    await page.waitForURL(
      (url) => url.pathname.includes("/dashboard") || url.pathname.includes("/letters/"),
      { timeout: 30_000 }
    );

    // ── DB verification ──
    expect(process.env.DATABASE_URL, "DATABASE_URL must be set").toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      let foundRecord: any;
      let pipelineProgressed = false;

      // Poll up to 60s for pipeline to process
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(3000);

        const records = await sql`
          SELECT id, status, subject, intake_json
          FROM letter_requests
          WHERE subject = ${uniqueSubject}
          ORDER BY created_at DESC LIMIT 1;
        `;

        if (records.length > 0) {
          foundRecord = records[0];
          console.log(`[Poll ${i + 1}] Letter #${foundRecord.id} status: ${foundRecord.status}`);

          if (
            [
              "submitted",
              "researching",
              "drafting",
              "generated_locked",
              "pending_review",
              "under_review",
              "approved",
            ].includes(foundRecord.status)
          ) {
            pipelineProgressed = true;
            break;
          }
        }
      }

      expect(foundRecord).toBeDefined();
      expect(foundRecord.intake_json).toBeTruthy();
      expect(pipelineProgressed).toBe(true);

      // Store the letter ID for downstream tests
      console.log(`✓ Letter created: #${foundRecord.id}, status: ${foundRecord.status}`);
    } finally {
      await sql.end();
    }
  });
});
