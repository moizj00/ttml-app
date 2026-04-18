import { expect, test as base, type Page } from "@playwright/test";
import postgres from "postgres";

/**
 * 07 — Full Lifecycle Integration Test
 *
 * Runs the ENTIRE letter lifecycle in one test:
 *   1. Subscriber submits letter via 6-step form
 *   2. AI pipeline generates draft (PIPELINE_MODE=simple)
 *   3. Verify AI content saved in letter_versions
 *   4. Verify draft is locked behind paywall
 *   5. Simulate payment (SQL transition to pending_review)
 *   6. Attorney logs in, sees letter in Review Queue
 *   7. Attorney opens modal, clicks "Claim for Review"
 *   8. Verify letter is now under_review with assigned reviewer
 *
 * This is the single most comprehensive test — run it when you
 * need to verify the entire platform works end-to-end.
 *
 * Required env vars:
 *   DATABASE_URL, PLAYWRIGHT_BASE_URL, ANTHROPIC_API_KEY (for pipeline),
 *   E2E_SUBSCRIBER_EMAIL/PASSWORD, E2E_ATTORNEY_EMAIL/PASSWORD
 *
 * Run with: PIPELINE_MODE=simple on the dev server
 */

const SUBSCRIBER_EMAIL = process.env.E2E_SUBSCRIBER_EMAIL || "test.subscriber@e2e.ttml.test";
const SUBSCRIBER_PASSWORD = process.env.E2E_SUBSCRIBER_PASSWORD || "TestPassword123!";
const ATTORNEY_EMAIL = process.env.E2E_ATTORNEY_EMAIL || "test.attorney@e2e.ttml.test";
const ATTORNEY_PASSWORD = process.env.E2E_ATTORNEY_PASSWORD || "TestPassword123!";

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login").click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
}

async function dismissOnboarding(page: Page): Promise<void> {
  const skipButton = page.getByRole("button", { name: /skip/i });
  if (await skipButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipButton.click();
    await page.waitForTimeout(500);
  }
}

base.describe("Full Lifecycle — Submission to Attorney Claim", () => {
  base("complete letter lifecycle end-to-end", async ({ page }) => {
    base.setTimeout(180_000); // 3 minutes for full lifecycle

    expect(process.env.DATABASE_URL, "DATABASE_URL must be set").toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);
    let letterId: number | undefined;

    try {
      // ════════════════════════════════════════════════════════
      // PHASE 1: SUBSCRIBER — Submit Letter
      // ════════════════════════════════════════════════════════
      console.log("\n═══ PHASE 1: Letter Submission ═══");

      await loginAs(page, SUBSCRIBER_EMAIL, SUBSCRIBER_PASSWORD);
      await dismissOnboarding(page);

      await page.goto("/submit");
      await page.waitForLoadState("networkidle");

      // Step 1: Letter Type
      const letterTypeBtn = page.getByTestId("button-letter-type-demand-letter");
      await expect(letterTypeBtn).toBeVisible({ timeout: 10_000 });
      await letterTypeBtn.click();

      const uniqueSubject = `E2E Full Lifecycle ${Date.now()}`;
      await page.getByTestId("input-subject").fill(uniqueSubject);
      await page.getByRole("button", { name: /next/i }).click();

      // Step 2: Jurisdiction
      await expect(page.getByText(/State \/ Jurisdiction/i)).toBeVisible({ timeout: 5000 });
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: /California/i }).click();
      await page.getByRole("button", { name: /next/i }).click();

      // Step 3: Parties
      await expect(page.locator("#senderName")).toBeVisible({ timeout: 5000 });
      await page.locator("#senderName").fill("Jane Doe");
      await page.getByTestId("input-senderAddress").fill("100 Main St, Los Angeles, CA 90001");
      await page.locator("#recipientName").fill("Acme Corp");
      await page.getByTestId("input-recipientAddress").fill("200 Business Ave, San Francisco, CA 94102");
      await page.getByRole("button", { name: /next/i }).click();

      // Step 4: Details
      const description = page.getByTestId("input-description");
      await expect(description).toBeVisible({ timeout: 5000 });
      await description.fill(
        "On January 15, 2026, the defendant failed to deliver contracted services worth $5,000. " +
          "Despite multiple written requests, no resolution has been provided. " +
          "This constitutes a breach of contract under California Civil Code."
      );
      await page.getByRole("button", { name: /next/i }).click();

      // Step 5: Outcome
      const desiredOutcome = page.locator("#desiredOutcome");
      await expect(desiredOutcome).toBeVisible({ timeout: 5000 });
      await desiredOutcome.fill(
        "Full refund of $5,000 plus reasonable attorney fees and costs within 30 days."
      );
      await page.getByRole("button", { name: /next/i }).click();

      // Step 6: Exhibits — skip, submit
      await page.waitForTimeout(500);
      const submitButton = page.getByRole("button", { name: /submit letter/i });
      await expect(submitButton).toBeVisible({ timeout: 5000 });
      await submitButton.click();

      await page.waitForURL(
        (url) => url.pathname.includes("/dashboard") || url.pathname.includes("/letters/"),
        { timeout: 30_000 }
      );
      console.log("✓ Letter submitted, redirected to:", page.url());

      // ════════════════════════════════════════════════════════
      // PHASE 2: AI PIPELINE — Wait for draft generation
      // ════════════════════════════════════════════════════════
      console.log("\n═══ PHASE 2: AI Pipeline ═══");

      let foundRecord: any;
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(3000);
        const records = await sql`
          SELECT id, status, subject, intake_json, current_ai_draft_version_id
          FROM letter_requests
          WHERE subject = ${uniqueSubject}
          ORDER BY created_at DESC LIMIT 1
        `;

        if (records.length > 0) {
          foundRecord = records[0];
          console.log(`  [Poll ${i + 1}] Letter #${foundRecord.id} → ${foundRecord.status}`);
          if (["generated_locked", "pending_review", "under_review", "approved"].includes(foundRecord.status)) {
            break;
          }
        }
      }

      expect(foundRecord).toBeDefined();
      expect(foundRecord.intake_json).toBeTruthy();
      letterId = foundRecord.id;
      console.log(`✓ Pipeline complete: Letter #${letterId}, status: ${foundRecord.status}`);

      // ════════════════════════════════════════════════════════
      // PHASE 3: VERIFY AI CONTENT — Check letter_versions
      // ════════════════════════════════════════════════════════
      console.log("\n═══ PHASE 3: AI Content Verification ═══");

      const versions = await sql`
        SELECT id, version_type, length(content_html) AS html_length, content_html
        FROM letter_versions
        WHERE letter_request_id = ${letterId} AND version_type = 'ai_draft'
        ORDER BY created_at DESC LIMIT 1
      `;

      expect(versions.length).toBeGreaterThan(0);
      const draft = versions[0];
      console.log(`  Draft version #${draft.id}: ${draft.html_length} chars`);
      expect(Number(draft.html_length)).toBeGreaterThan(100);

      const html = draft.content_html as string;
      const hasLegalContent =
        html.includes("Dear") || html.includes("Sincerely") || html.includes("demand") || html.includes("pursuant");
      expect(hasLegalContent).toBe(true);
      console.log("✓ AI-generated draft verified (legal content present)");

      // ════════════════════════════════════════════════════════
      // PHASE 4: PAYWALL — Verify draft is locked
      // ════════════════════════════════════════════════════════
      console.log("\n═══ PHASE 4: Paywall Verification ═══");

      await page.goto(`/letters/${letterId}`);
      await page.waitForLoadState("networkidle");
      await dismissOnboarding(page);
      await page.waitForTimeout(1000);

      await page.screenshot({ path: "test-results/lifecycle-paywall.png", fullPage: true });

      const body = await page.textContent("body");
      const hasPaywall =
        body?.includes("$50") ||
        body?.includes("Subscribe") ||
        body?.includes("Attorney Review") ||
        body?.includes("Unlock");
      console.log("  Paywall elements found:", hasPaywall);
      expect(hasPaywall).toBe(true);
      console.log("✓ Draft locked behind paywall");

      // ════════════════════════════════════════════════════════
      // PHASE 5: PAYMENT SIMULATION — Transition to pending_review
      // ════════════════════════════════════════════════════════
      console.log("\n═══ PHASE 5: Payment Simulation ═══");

      const currentStatus = foundRecord.status;
      if (currentStatus === "generated_locked") {
        await sql`
          UPDATE letter_requests
          SET status = 'pending_review',
              last_status_changed_at = NOW(),
              updated_at = NOW()
          WHERE id = ${letterId}
        `;
        console.log("✓ Simulated payment: generated_locked → pending_review");
      } else {
        console.log(`  Already past paywall (status: ${currentStatus})`);
      }

      // ════════════════════════════════════════════════════════
      // PHASE 6: ATTORNEY — Log in and check Review Queue
      // ════════════════════════════════════════════════════════
      console.log("\n═══ PHASE 6: Attorney Review Queue ═══");

      // Log out subscriber, log in as attorney
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await loginAs(page, ATTORNEY_EMAIL, ATTORNEY_PASSWORD);

      await page.goto("/review/queue");
      await page.waitForLoadState("networkidle");

      await page.screenshot({ path: "test-results/lifecycle-review-queue.png", fullPage: true });

      const queueBody = await page.textContent("body");
      expect(queueBody).toContain("Review Queue");

      // Find our letter in the queue
      const hasOurLetter = queueBody?.includes("E2E Full Lifecycle") || queueBody?.includes(uniqueSubject);
      console.log("  Our letter in queue:", hasOurLetter);

      // ════════════════════════════════════════════════════════
      // PHASE 7: ATTORNEY CLAIM — Open modal and claim
      // ════════════════════════════════════════════════════════
      console.log("\n═══ PHASE 7: Attorney Claim ═══");

      // Click the letter row (opens ReviewModal, stays on /review/queue)
      const letterText = page.getByText("E2E Full Lifecycle").first();
      const hasText = await letterText.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasText) {
        await letterText.click();
      } else {
        // Fallback: click first card
        await page.locator("[data-testid^='card-letter-']").first().click();
      }

      // Wait for modal draft to load
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(5000);

      await page.screenshot({ path: "test-results/lifecycle-review-modal.png", fullPage: true });

      // Find and click "Claim for Review"
      const claimBtn =
        (await page.getByTestId("button-claim").isVisible({ timeout: 2000 }).catch(() => false))
          ? page.getByTestId("button-claim")
          : page.getByRole("button", { name: /claim for review/i }).first();

      const hasClaimBtn = await claimBtn.isVisible({ timeout: 5000 }).catch(() => false);
      console.log("  Claim button visible:", hasClaimBtn);

      if (hasClaimBtn) {
        await claimBtn.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);
        await page.screenshot({ path: "test-results/lifecycle-claimed.png", fullPage: true });
      }

      // ════════════════════════════════════════════════════════
      // PHASE 8: DB VERIFICATION — Final status check
      // ════════════════════════════════════════════════════════
      console.log("\n═══ PHASE 8: Final DB Verification ═══");

      const finalState = await sql`
        SELECT lr.id, lr.status, lr.assigned_reviewer_id, lr.last_status_changed_at,
               u.email AS reviewer_email
        FROM letter_requests lr
        LEFT JOIN users u ON u.id = lr.assigned_reviewer_id
        WHERE lr.id = ${letterId}
      `;

      expect(finalState.length).toBe(1);
      const final = finalState[0];
      console.log(`  Letter #${final.id}:`);
      console.log(`    Status: ${final.status}`);
      console.log(`    Reviewer: ${final.reviewer_email} (id: ${final.assigned_reviewer_id})`);

      expect(final.status).toBe("under_review");
      expect(final.assigned_reviewer_id).toBeTruthy();

      console.log("\n✅ FULL LIFECYCLE VERIFIED — submission → AI → paywall → payment → attorney claim");
    } finally {
      await sql.end();
    }
  });
});
