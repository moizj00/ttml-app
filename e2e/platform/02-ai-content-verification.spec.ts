import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import postgres from "postgres";

/**
 * 02 — Verify AI-Generated Content in Database
 *
 * After a letter reaches `generated_locked`, check that:
 *  - A `letter_versions` row with `version_type = 'ai_draft'` exists
 *  - The version has non-empty `content_html` (the AI-generated letter)
 *  - The `letter_requests.current_ai_draft_version_id` points to it
 *
 * Prerequisite: run 01-pipeline-submission first, or have a letter in
 *   `generated_locked` / `pending_review` / `under_review` status.
 *   Set PLATFORM_TEST_LETTER_ID env var, or it finds the latest one.
 */
test.describe("AI Content Verification — Draft in Database", () => {
  test("letter_versions has ai_draft with generated content", async ({ subscriberPage: page }) => {
    test.setTimeout(30_000);

    expect(process.env.DATABASE_URL, "DATABASE_URL must be set").toBeDefined();
    const sql = postgres(process.env.DATABASE_URL!);

    try {
      // Find the latest letter that went through the pipeline
      const letterId = process.env.PLATFORM_TEST_LETTER_ID;
      const query = letterId
        ? sql`
            SELECT lr.id, lr.status, lr.subject, lr.current_ai_draft_version_id,
                   lv.id AS version_id, lv.version_type, lv.content_html,
                   length(lv.content_html) AS html_length
            FROM letter_requests lr
            LEFT JOIN letter_versions lv ON lv.id = lr.current_ai_draft_version_id
            WHERE lr.id = ${Number(letterId)}
          `
        : sql`
            SELECT lr.id, lr.status, lr.subject, lr.current_ai_draft_version_id,
                   lv.id AS version_id, lv.version_type, lv.content_html,
                   length(lv.content_html) AS html_length
            FROM letter_requests lr
            LEFT JOIN letter_versions lv ON lv.id = lr.current_ai_draft_version_id
            WHERE lr.status IN ('generated_locked', 'pending_review', 'under_review', 'approved')
              AND lr.subject LIKE 'E2E%'
            ORDER BY lr.created_at DESC
            LIMIT 1
          `;

      const records = await query;
      expect(records.length).toBeGreaterThan(0);

      const letter = records[0];
      console.log(`Letter #${letter.id}: status=${letter.status}, subject="${letter.subject}"`);
      console.log(`  AI draft version: #${letter.version_id}, type=${letter.version_type}`);
      console.log(`  Content HTML length: ${letter.html_length} chars`);

      // Verify AI draft version exists and is linked
      expect(letter.current_ai_draft_version_id).toBeTruthy();
      expect(letter.version_id).toBeTruthy();
      expect(letter.version_type).toBe("ai_draft");

      // Verify content is non-empty (AI actually generated something)
      expect(letter.content_html).toBeTruthy();
      expect(Number(letter.html_length)).toBeGreaterThan(100); // Real letters are 1000+ chars

      // Check the content looks like a real legal letter
      const html = letter.content_html as string;
      const hasLegalContent =
        html.includes("Dear") || html.includes("Sincerely") || html.includes("demand") || html.includes("pursuant");
      console.log(`  Has legal letter markers: ${hasLegalContent}`);
      expect(hasLegalContent).toBe(true);

      console.log("✓ AI-generated draft verified in database");
    } finally {
      await sql.end();
    }
  });
});
