/**
 * End-to-end smoke test — Talk-to-My-Lawyer pipeline
 *
 * Verifies the complete letter lifecycle on the live deployment:
 *   1. Create test letter in DB
 *   2. Run 4-stage AI pipeline (research → draft → assembly → vetting)
 *   3. Verify research_runs row saved to Supabase
 *   4. Verify letter_versions ai_draft row saved with content
 *   5. Verify server-side paywall truncation at generated_locked
 *   6. Simulate payment → generated_locked → pending_review
 *   7. Verify letter appears in attorney review queue
 *
 * Usage:
 *   npx tsx scripts/smoke-test.ts --user-id=<id> [--skip-pipeline] [--cleanup]
 *
 *   --user-id=<id>     Required. The user ID to own the test letter (any subscriber).
 *   --skip-pipeline    Skip AI calls (DB & state-machine logic only). Fast + free.
 *   --cleanup          Delete the test letter and all related rows after the test.
 *
 * WARNING: Without --skip-pipeline this makes real AI API calls (~$0.20–0.50 per run).
 *
 * Example (no AI spend, just verify DB/state logic):
 *   DATABASE_URL="..." npx tsx scripts/smoke-test.ts --user-id=1612 --skip-pipeline --cleanup
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import {
  createLetterRequest,
  getLetterRequestById,
  updateLetterStatus,
  getAllLetterRequests,
  getLetterVersionsByRequestId,
  getResearchRunsByLetterId,
  logReviewAction,
  createLetterVersion,
  updateLetterVersionPointers,
} from "../server/db";
import { runFullPipeline } from "../server/pipeline";
import { getDb } from "../server/db/core";
import {
  letterRequests,
  letterVersions,
  reviewActions,
  workflowJobs,
  researchRuns,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { IntakeJson } from "../shared/types";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const userIdArg = args.find((a) => a.startsWith("--user-id="))?.split("=")[1];
const skipPipeline = args.includes("--skip-pipeline");
const doCleanup = args.includes("--cleanup");

if (!userIdArg) {
  console.error(
    "Usage: npx tsx scripts/smoke-test.ts --user-id=<id> [--skip-pipeline] [--cleanup]"
  );
  process.exit(1);
}

const USER_ID = parseInt(userIdArg, 10);
if (isNaN(USER_ID)) {
  console.error(`Invalid --user-id: "${userIdArg}"`);
  process.exit(1);
}

// ─── Test intake ──────────────────────────────────────────────────────────────

const TEST_INTAKE: IntakeJson = {
  schemaVersion: "1.0",
  letterType: "demand-letter",
  sender: {
    name: "Smoke Test Sender",
    address: "123 Test Street, San Francisco, CA 94102",
    email: "smoke@test.example",
  },
  recipient: {
    name: "ACME Test Corp",
    address: "456 Oak Avenue, Los Angeles, CA 90001",
  },
  jurisdiction: { country: "US", state: "CA", city: "San Francisco" },
  matter: {
    category: "contract",
    subject: "Unpaid web development invoice",
    description:
      "Web development services rendered over 3 months ($5,000 total). Invoice #STE-001 issued 90 days ago, remains unpaid despite two email reminders sent on day 30 and day 60. No dispute raised by recipient.",
    incidentDate: "2026-01-10",
  },
  financials: { amountOwed: 5000, currency: "USD" },
  desiredOutcome: "Full payment of $5,000 within 14 days of receipt of this letter.",
  deadlineDate: "2026-05-01",
  tonePreference: "firm",
};

// ─── Assertion helper ─────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passCount++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failCount++;
  }
}

// ─── Cleanup helper ───────────────────────────────────────────────────────────

async function cleanup(letterId: number): Promise<void> {
  console.log(`\n[Cleanup] Deleting test letter #${letterId} and related rows...`);
  const db = await getDb();
  if (!db) {
    console.error("[Cleanup] DB not available — skipping");
    return;
  }
  // Delete child rows first (FK constraints), then the parent
  await db.delete(reviewActions).where(eq(reviewActions.letterRequestId, letterId));
  await db.delete(letterVersions).where(eq(letterVersions.letterRequestId, letterId));
  await db.delete(researchRuns).where(eq(researchRuns.letterRequestId, letterId));
  await db.delete(workflowJobs).where(eq(workflowJobs.letterRequestId, letterId));
  await db.delete(letterRequests).where(eq(letterRequests.id, letterId));
  console.log("[Cleanup] Done.");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  TTML End-to-End Smoke Test");
  console.log(`  user_id=${USER_ID}  skip-pipeline=${skipPipeline}  cleanup=${doCleanup}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Step 1: Create test letter ─────────────────────────────────────────────
  console.log("[Step 1] Creating test letter...");
  const created = await createLetterRequest({
    userId: USER_ID,
    letterType: "demand-letter",
    subject: "[SMOKE TEST] Unpaid Invoice — CA Demand Letter",
    issueSummary: TEST_INTAKE.matter.description.slice(0, 500),
    jurisdictionCountry: "US",
    jurisdictionState: "CA",
    jurisdictionCity: "San Francisco",
    intakeJson: TEST_INTAKE,
    priority: "normal",
    submittedByAdmin: false,
  });

  const letterId = created?.insertId;
  if (!letterId) {
    console.error("[Step 1] FATAL: createLetterRequest returned no ID");
    process.exit(1);
  }
  console.log(`[Step 1] Created letter #${letterId}`);

  const initialLetter = await getLetterRequestById(letterId);
  check("Step 1: letter_requests row exists", !!initialLetter);
  check("Step 1: status is 'submitted'", initialLetter?.status === "submitted", `got: ${initialLetter?.status}`);
  check("Step 1: intakeJson stored", !!initialLetter?.intakeJson);

  // ── Step 2: Run pipeline (or inject a fake draft for --skip-pipeline) ───────
  if (skipPipeline) {
    console.log("\n[Step 2] --skip-pipeline: injecting synthetic draft directly...");
    await updateLetterStatus(letterId, "researching");

    // Synthetic research run
    const db = await getDb();
    if (db) {
      await db.insert(researchRuns as any).values({
        letterRequestId: letterId,
        provider: "smoke-test-synthetic",
        status: "completed",
        resultJson: {
          legalClaims: ["Breach of contract (Cal. Civil Code § 1550)"],
          applicableStatutes: ["California Commercial Code § 2607"],
          citations: [],
          summary: "Synthetic research packet for smoke test.",
        },
        cacheHit: false,
        cacheKey: `smoke-test-${letterId}`,
      });
    }

    await updateLetterStatus(letterId, "drafting");

    const syntheticDraft = `[SMOKE TEST DRAFT — ${new Date().toISOString()}]

LETTER OF DEMAND

Re: Unpaid Web Development Invoice #STE-001 — $5,000.00

Dear ACME Test Corp,

This letter constitutes formal notice that the sum of $5,000.00 remains outstanding under Invoice #STE-001 for web development services rendered between October and December 2025.

Despite two prior written reminders, payment has not been received. Pursuant to the terms of our agreement and California Commercial Code § 2607, you are hereby demanded to remit full payment within fourteen (14) days of receipt of this letter.

Failure to comply may result in legal action to recover the outstanding balance, plus interest, attorney's fees, and costs.

Sincerely,
Smoke Test Sender

---
[Sections 2–5 are behind the paywall — unlock by completing payment]
${Array.from({ length: 30 }, (_, i) => `Lorem ipsum line ${i + 1} — additional letter content that is behind the paywall.`).join("\n")}`;

    const versionResult = await createLetterVersion({
      letterRequestId: letterId,
      versionType: "ai_draft",
      content: syntheticDraft,
      createdByType: "system",
      metadataJson: {
        provider: "smoke-test-synthetic",
        stage: "vetted_final",
        synthetic: true,
      },
    });
    const versionId = (versionResult as any)?.insertId ?? 0;
    if (versionId) {
      await updateLetterVersionPointers(letterId, { currentAiDraftVersionId: versionId });
    }
    await updateLetterStatus(letterId, "generated_locked");
    console.log("[Step 2] Synthetic draft injected. Status → generated_locked");
  } else {
    console.log("\n[Step 2] Running full 4-stage AI pipeline (this takes ~3–5 min)...");
    console.log("         Watch Railway logs for [Pipeline] entries.\n");
    try {
      await runFullPipeline(letterId, TEST_INTAKE, {
        subject: "[SMOKE TEST] Unpaid Invoice — CA Demand Letter",
        issueSummary: TEST_INTAKE.matter.description.slice(0, 500),
        jurisdictionCountry: "US",
        jurisdictionState: "CA",
        jurisdictionCity: "San Francisco",
        letterType: "demand-letter",
      });
      console.log("[Step 2] Pipeline complete.");
    } catch (pipelineErr) {
      console.error("[Step 2] Pipeline threw:", pipelineErr);
      if (doCleanup) await cleanup(letterId);
      process.exit(1);
    }
  }

  // ── Step 3: Verify research_runs saved ────────────────────────────────────
  console.log("\n[Step 3] Verifying research_runs...");
  const runs = await getResearchRunsByLetterId(letterId);
  check("Step 3: research_runs row exists", runs.length > 0, `got ${runs.length} rows`);
  const completedRun = runs.find((r) => r.status === "completed");
  check("Step 3: status=completed run found", !!completedRun);
  check(
    "Step 3: resultJson populated",
    !!(completedRun as any)?.resultJson,
    completedRun ? "resultJson is null" : "no completed run"
  );

  // ── Step 4: Verify letter_versions saved ─────────────────────────────────
  console.log("\n[Step 4] Verifying letter_versions...");
  const versions = await getLetterVersionsByRequestId(letterId, true); // internal = see full content
  const aiDraft = versions.find((v) => v.versionType === "ai_draft");
  check("Step 4: ai_draft version exists", !!aiDraft);
  check(
    "Step 4: content length > 500 chars",
    (aiDraft?.content?.length ?? 0) > 500,
    `got ${aiDraft?.content?.length ?? 0} chars`
  );

  // ── Step 5: Verify paywall truncation ─────────────────────────────────────
  console.log("\n[Step 5] Verifying paywall truncation at generated_locked...");
  const lockedLetter = await getLetterRequestById(letterId);
  check("Step 5: status is 'generated_locked'", lockedLetter?.status === "generated_locked", `got: ${lockedLetter?.status}`);

  // Re-fetch versions via subscriber path (no internal access) with status hint
  const subscriberVersions = await getLetterVersionsByRequestId(letterId, false, "generated_locked");
  const truncatedDraft = subscriberVersions.find((v) => v.versionType === "ai_draft");
  check("Step 5: subscriber sees ai_draft version", !!truncatedDraft);
  check("Step 5: version is marked truncated", !!(truncatedDraft as any)?.truncated);
  const fullLength = aiDraft?.content?.length ?? 0;
  const truncatedLength = truncatedDraft?.content?.length ?? 0;
  check(
    "Step 5: truncated content is shorter than full content",
    truncatedLength < fullLength,
    `truncated=${truncatedLength} full=${fullLength}`
  );

  // ── Step 6: Simulate payment ──────────────────────────────────────────────
  console.log("\n[Step 6] Simulating payment (generated_locked → pending_review)...");
  await updateLetterStatus(letterId, "pending_review");
  await logReviewAction({
    letterRequestId: letterId,
    actorType: "system",
    action: "payment_received",
    noteText:
      "[SMOKE TEST] Simulated payment. In production this fires via POST /api/stripe/webhook with checkout.session.completed.",
    noteVisibility: "internal",
    fromStatus: "generated_locked",
    toStatus: "pending_review",
  });
  console.log("[Step 6] Status updated → pending_review");

  // ── Step 7: Verify attorney review queue ─────────────────────────────────
  console.log("\n[Step 7] Verifying letter appears in attorney review queue...");
  const reviewLetter = await getLetterRequestById(letterId);
  check("Step 7: status is 'pending_review'", reviewLetter?.status === "pending_review", `got: ${reviewLetter?.status}`);
  check("Step 7: not yet claimed (assignedReviewerId is null)", reviewLetter?.assignedReviewerId == null);

  const queue = await getAllLetterRequests({ status: "pending_review" });
  const inQueue = queue.some((l) => l.id === letterId);
  check("Step 7: letter appears in pending_review queue", inQueue);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  Results: ${passCount} passed, ${failCount} failed`);
  if (failCount === 0) {
    console.log("  ✓ ALL CHECKS PASSED — pipeline is end-to-end healthy");
  } else {
    console.log("  ✗ SOME CHECKS FAILED — see above for details");
  }
  console.log(`  Test letter ID: #${letterId} (subject: "[SMOKE TEST]...")`);
  if (!doCleanup) {
    console.log("  Tip: re-run with --cleanup to remove the test letter from the DB.");
  }
  console.log("═══════════════════════════════════════════════════════════");

  if (doCleanup) {
    await cleanup(letterId);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
