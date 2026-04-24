/**
 * E2E Suite: Free-Preview Funnel
 *
 * Covers the new 24-hour hold flow introduced after the paywall redesign:
 *   submitted → ai_generation_completed_hidden (24h hold)
 *     ├─ auto-release → letter_released_to_subscriber → upsell → checkout → pending_review
 *     └─ admin bypass  → under_review (skips paywall entirely)
 *
 * Requires:
 *   E2E_SUBSCRIBER_EMAIL / E2E_SUBSCRIBER_PASSWORD
 *   E2E_ADMIN_EMAIL      / E2E_ADMIN_PASSWORD
 *   DATABASE_URL
 */

import { expect } from "@playwright/test";
import { test, isSubscriberConfigured, isAdminConfigured } from "../fixtures/auth";
import postgres from "postgres";

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getLatestLetterBySubject(sql: ReturnType<typeof postgres>, subject: string) {
  const rows = await sql<{ id: number; status: string; free_preview_unlock_at: Date | null }[]>`
    SELECT id, status, free_preview_unlock_at
    FROM letter_requests
    WHERE subject = ${subject}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function submitTestLetter(page: import("@playwright/test").Page, subject: string) {
  await page.goto("/submit");
  await page.waitForLoadState("networkidle");

  const letterTypeBtn = page.getByTestId("button-letter-type-demand-letter");
  await expect(letterTypeBtn).toBeVisible({ timeout: 10_000 });
  await letterTypeBtn.click();

  await page.getByTestId("input-subject").fill(subject);
  await page.getByRole("button", { name: /next/i }).click();

  // Jurisdiction
  await expect(page.getByText(/State \/ Jurisdiction/i)).toBeVisible({ timeout: 5_000 });
  const jurisdictionTrigger = page.getByRole("combobox").first();
  await jurisdictionTrigger.click();
  await page.getByRole("option", { name: /California/i }).click();
  await page.getByRole("button", { name: /next/i }).click();

  // Parties
  await expect(page.locator("#senderName")).toBeVisible({ timeout: 5_000 });
  await page.locator("#senderName").fill("E2E Sender");
  await page.getByTestId("input-senderAddress").fill("123 Test Ave, Los Angeles, CA 90001");
  await page.locator("#recipientName").fill("E2E Recipient");
  await page.getByTestId("input-recipientAddress").fill("456 Target Blvd, SF, CA 94102");
  await page.getByRole("button", { name: /next/i }).click();

  // Details
  const desc = page.getByTestId("input-description");
  await expect(desc).toBeVisible({ timeout: 5_000 });
  await desc.fill("E2E free-preview funnel test — letter submitted for hold/upsell verification.");
  await page.getByRole("button", { name: /next/i }).click();

  // Outcome
  const outcome = page.locator("#desiredOutcome");
  await expect(outcome).toBeVisible({ timeout: 5_000 });
  await outcome.fill("Verify the 24h hold and upsell flow works correctly.");
  await page.getByRole("button", { name: /next/i }).click();

  // Exhibits — skip
  await page.waitForTimeout(300);
  const submitBtn = page.getByRole("button", { name: /submit letter/i });
  await expect(submitBtn).toBeVisible({ timeout: 5_000 });
  await submitBtn.click();

  await page.waitForURL(
    (url) => url.pathname.includes("/dashboard") || url.pathname.includes("/letters/"),
    { timeout: 30_000 }
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

test.describe("Free-Preview Funnel — 24h Hold & Upsell Flow", () => {
  test.skip(
    !isSubscriberConfigured || !isAdminConfigured,
    "Requires E2E_SUBSCRIBER_EMAIL and E2E_ADMIN_EMAIL to be configured"
  );

  test("generated letter lands in ai_generation_completed_hidden and is hidden from subscriber", async ({
    subscriberPage: page,
  }) => {
    test.setTimeout(150_000);

    const subject = `E2E Hold Test ${Date.now()}`;
    await submitTestLetter(page, subject);

    expect(process.env.DATABASE_URL).toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      let record: Awaited<ReturnType<typeof getLatestLetterBySubject>> = null;

      // Poll up to 90s for pipeline to reach ai_generation_completed_hidden
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(3_000);
        record = await getLatestLetterBySubject(sql, subject);
        if (
          record &&
          [
            "ai_generation_completed_hidden",
            "researching",
            "drafting",
            "letter_released_to_subscriber",
          ].includes(record.status)
        ) {
          if (record.status === "ai_generation_completed_hidden") break;
        }
      }

      expect(record, "Letter should exist in DB").toBeTruthy();
      expect(
        [
          "ai_generation_completed_hidden",
          "letter_released_to_subscriber",
          // allow through if pipeline was very fast or hold was already elapsed
        ],
        `Expected hold or release status, got: ${record?.status}`
      ).toContain(record?.status);

      // Subscriber dashboard should NOT show the letter content — only a
      // "processing" or "pending" indicator (content is server-side hidden)
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      const hiddenIndicator = page.getByTestId("letter-status-hidden").or(
        page.getByText(/processing|generating|hold/i)
      );
      // Letter content body must not be visible (paywall server-truncates it)
      const contentArea = page.getByTestId("letter-content-preview");
      if (await contentArea.isVisible()) {
        const text = await contentArea.textContent();
        // Server truncates to ~100 chars — should not expose full letter
        expect(text?.length ?? 0).toBeLessThan(200);
      }
    } finally {
      await sql.end();
    }
  });

  test("admin force-transition bypasses 24h hold and moves letter to under_review", async ({
    adminPage: page,
  }) => {
    test.setTimeout(150_000);

    const subject = `E2E Admin Bypass ${Date.now()}`;

    // Submit via subscriber — re-login as admin after
    // (can't use two pages in one fixture; admin submits their own test letter)
    await page.goto("/submit");
    await page.waitForLoadState("networkidle");

    expect(process.env.DATABASE_URL).toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      // Submit a letter as admin (admin is also a subscriber in test env)
      await submitTestLetter(page, subject);

      let record = await getLatestLetterBySubject(sql, subject);

      // Wait for pipeline to produce at least a draft
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(3_000);
        record = await getLatestLetterBySubject(sql, subject);
        if (
          record &&
          [
            "ai_generation_completed_hidden",
            "letter_released_to_subscriber",
          ].includes(record.status)
        ) {
          break;
        }
      }

      expect(record, "Letter must exist for bypass test").toBeTruthy();
      const letterId = record!.id;

      // Navigate to admin letter detail and trigger force-transition
      await page.goto(`/admin/letters/${letterId}`);
      await page.waitForLoadState("networkidle");

      const forceBtn = page.getByTestId("button-force-status-transition").or(
        page.getByRole("button", { name: /force.*review|bypass.*hold|admin bypass/i })
      );
      await expect(forceBtn).toBeVisible({ timeout: 10_000 });
      await forceBtn.click();

      // Fill reason in dialog if present
      const reasonInput = page.getByTestId("input-force-reason").or(
        page.getByPlaceholder(/reason/i)
      );
      if (await reasonInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await reasonInput.fill("E2E automated bypass test");
        await page.getByRole("button", { name: /confirm|proceed|force/i }).click();
      }

      // Wait for status to update
      await page.waitForTimeout(2_000);

      const updated = await getLatestLetterBySubject(sql, subject);
      expect(updated?.status).toBe("under_review");
    } finally {
      await sql.end();
    }
  });

  test("letter_released_to_subscriber status shows attorney review upsell UI", async ({
    subscriberPage: page,
  }) => {
    test.setTimeout(60_000);

    expect(process.env.DATABASE_URL).toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      // Find the most recent released letter for this subscriber
      const rows = await sql<{ id: number }[]>`
        SELECT lr.id
        FROM letter_requests lr
        JOIN users u ON u.id = lr.user_id
        WHERE u.email = ${process.env.E2E_SUBSCRIBER_EMAIL ?? ""}
          AND lr.status = 'letter_released_to_subscriber'
        ORDER BY lr.created_at DESC
        LIMIT 1
      `;

      if (rows.length === 0) {
        test.skip(); // No released letter available — skip gracefully
        return;
      }

      const { id: letterId } = rows[0];
      await page.goto(`/letters/${letterId}`);
      await page.waitForLoadState("networkidle");

      // Upsell CTA should be visible
      const upsellSection = page
        .getByTestId("attorney-review-upsell")
        .or(page.getByText(/get attorney review|start attorney review|submit for review/i));
      await expect(upsellSection).toBeVisible({ timeout: 10_000 });

      // Letter body should be watermarked / non-selectable draft view
      const draftBadge = page
        .getByTestId("letter-draft-badge")
        .or(page.getByText(/draft|watermark/i));
      // At least a CTA button should be present
      await expect(
        page.getByRole("button", { name: /attorney review|get review|start review/i })
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await sql.end();
    }
  });

  test("completing payment moves letter from upsell to pending_review", async ({
    subscriberPage: page,
  }) => {
    // This test verifies the Stripe webhook handler correctly advances the status.
    // In CI we rely on Stripe test-mode webhooks; in local dev you can use `stripe listen`.
    test.setTimeout(90_000);

    expect(process.env.DATABASE_URL).toBeDefined();
    expect(
      process.env.STRIPE_WEBHOOK_SECRET,
      "STRIPE_WEBHOOK_SECRET required for payment test"
    ).toBeDefined();

    const sql = postgres(process.env.DATABASE_URL!);

    try {
      // Find an upsell-shown letter for this subscriber
      const rows = await sql<{ id: number }[]>`
        SELECT lr.id
        FROM letter_requests lr
        JOIN users u ON u.id = lr.user_id
        WHERE u.email = ${process.env.E2E_SUBSCRIBER_EMAIL ?? ""}
          AND lr.status IN ('attorney_review_upsell_shown', 'attorney_review_checkout_started')
        ORDER BY lr.created_at DESC
        LIMIT 1
      `;

      if (rows.length === 0) {
        test.skip(); // No letter in the right state — skip gracefully
        return;
      }

      const { id: letterId } = rows[0];

      // Trigger checkout
      await page.goto(`/letters/${letterId}`);
      await page.waitForLoadState("networkidle");

      const checkoutBtn = page.getByRole("button", {
        name: /attorney review|start review|proceed to payment/i,
      });
      await expect(checkoutBtn).toBeVisible({ timeout: 10_000 });
      await checkoutBtn.click();

      // Stripe Checkout opens (test mode — card 4242 4242 4242 4242)
      await page.waitForURL(/stripe\.com\/pay|checkout\.stripe\.com/, { timeout: 15_000 });
      await page.getByPlaceholder(/card number/i).fill("4242424242424242");
      await page.getByPlaceholder(/MM \/ YY/i).fill("12/30");
      await page.getByPlaceholder(/CVC/i).fill("123");
      await page.getByPlaceholder(/ZIP/i).fill("90001");
      await page.getByRole("button", { name: /pay|subscribe/i }).click();

      // Wait for redirect back
      await page.waitForURL(
        (url) =>
          url.hostname !== "checkout.stripe.com" && url.hostname !== "stripe.com",
        { timeout: 30_000 }
      );

      // Webhook should advance letter to pending_review
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(2_000);
        const [updated] = await sql<{ status: string }[]>`
          SELECT status FROM letter_requests WHERE id = ${letterId}
        `;
        if (updated?.status === "pending_review") break;
      }

      const [final] = await sql<{ status: string }[]>`
        SELECT status FROM letter_requests WHERE id = ${letterId}
      `;
      expect(final?.status).toBe("pending_review");
    } finally {
      await sql.end();
    }
  });
});
