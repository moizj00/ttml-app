/**
 * End-to-end pipeline test — creates a real letter request in the DB
 * and runs the full 3-stage pipeline (Perplexity → Anthropic → Anthropic).
 *
 * Usage: node scripts/test-pipeline-e2e.mjs
 */

import "dotenv/config";

// Dynamic imports for ESM compatibility
const db = await import("../server/db.ts");
const { runFullPipeline } = await import("../server/pipeline.ts");
const { createLetterRequest, getLetterRequestById, updateLetterStatus } = db;

const TEST_INTAKE = {
  schemaVersion: "1.0",
  letterType: "demand-letter",
  sender: {
    name: "John Smith",
    address: "123 Main Street, Austin, TX 78701",
    email: "john.smith@example.com",
    phone: "512-555-0100",
  },
  recipient: {
    name: "ABC Property Management LLC",
    address: "456 Commerce Drive, Suite 200, Austin, TX 78702",
    email: "info@abcproperty.example.com",
  },
  jurisdiction: {
    country: "US",
    state: "Texas",
    city: "Austin",
  },
  matter: {
    category: "landlord-tenant",
    subject: "Return of Security Deposit",
    description:
      "I vacated my apartment at 789 Oak Lane, Unit 4B, Austin, TX on January 15, 2026 after providing proper 30-day written notice. The apartment was left in good condition with normal wear and tear. My security deposit of $2,500 has not been returned within the 30-day period required by Texas Property Code Section 92.103. The landlord has not provided an itemized list of deductions. I am demanding the full return of my security deposit plus any applicable penalties.",
    incidentDate: "2026-01-15",
  },
  financials: {
    amountOwed: 2500,
    currency: "USD",
  },
  desiredOutcome:
    "Full return of the $2,500 security deposit within 14 days, or I will pursue legal action including statutory penalties under Texas Property Code.",
  deadlineDate: "2026-03-15",
  additionalContext:
    "I have photos of the apartment condition at move-out and a copy of the signed lease agreement. The landlord has been unresponsive to my previous email and phone requests.",
  tonePreference: "firm",
};

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TALK-TO-MY-LAWYER — FULL PIPELINE E2E TEST");
  console.log("═══════════════════════════════════════════════════════");
  console.log();

  // Step 1: Create a letter request in the DB
  console.log("[1/5] Creating letter request in database...");
  const result = await createLetterRequest({
    userId: 1, // Moiz (admin user)
    letterType: "demand-letter",
    subject: "Return of Security Deposit — E2E Pipeline Test",
    issueSummary: "Security deposit not returned within 30 days per Texas Property Code",
    jurisdictionCountry: "US",
    jurisdictionState: "Texas",
    jurisdictionCity: "Austin",
    intakeJson: TEST_INTAKE,
    priority: "normal",
  });
  // Drizzle PostgreSQL returns different shapes — handle both
  const letterId = result?.insertId ?? result?.id ?? result?.[0]?.id;
  if (!letterId) {
    console.error("createLetterRequest returned:", JSON.stringify(result));
    throw new Error("Failed to create letter request — no ID returned");
  }
  console.log(`   ✓ Letter #${letterId} created with status 'submitted'`);
  console.log();

  // Step 2: Run the full pipeline
  console.log("[2/5] Running full 3-stage pipeline...");
  console.log("   Stage 1: Perplexity sonar-pro (legal research, 90s timeout)");
  console.log("   Stage 2: Anthropic claude-opus-4-5 (draft generation, 120s timeout)");
  console.log("   Stage 3: Anthropic claude-opus-4-5 (final assembly, 120s timeout)");
  console.log();

  const startTime = Date.now();
  try {
    await runFullPipeline(letterId, TEST_INTAKE, {
      subject: "Return of Security Deposit — E2E Pipeline Test",
      issueSummary: "Security deposit not returned within 30 days per Texas Property Code",
      jurisdictionCountry: "US",
      jurisdictionState: "Texas",
      jurisdictionCity: "Austin",
      letterType: "demand-letter",
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   ✓ Pipeline completed in ${elapsed}s`);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`   ✗ Pipeline FAILED after ${elapsed}s:`, err.message);
    process.exit(1);
  }
  console.log();

  // Step 3: Verify the letter status
  console.log("[3/5] Verifying letter status in database...");
  const letter = await getLetterRequestById(letterId);
  if (!letter) {
    console.error("   ✗ Letter not found in database!");
    process.exit(1);
  }
  console.log(`   Status: ${letter.status}`);
  console.log(`   Expected: generated_locked`);
  if (letter.status === "generated_locked") {
    console.log("   ✓ Status is correct — letter is locked awaiting payment");
  } else {
    console.error(`   ✗ UNEXPECTED STATUS: ${letter.status}`);
  }
  console.log();

  // Step 4: Check letter versions were created
  console.log("[4/5] Checking letter versions...");
  const { getDb } = db;
  const { letterVersions, workflowJobs, researchRuns } = await import("../drizzle/schema.ts");
  const { eq } = await import("drizzle-orm");
  const dbConn = await getDb();
  
  const versions = await dbConn.select().from(letterVersions).where(eq(letterVersions.letterRequestId, letterId));
  console.log(`   Found ${versions.length} version(s):`);
  versions.forEach((v, i) => {
    console.log(`   [${i + 1}] Type: ${v.versionType}, Created: ${v.createdAt}, Content length: ${v.content?.length ?? 0} chars`);
  });
  if (versions.length >= 2) {
    console.log("   ✓ At least 2 versions created (Stage 2 draft + Stage 3 final)");
  } else {
    console.warn("   ⚠ Expected at least 2 versions");
  }
  console.log();

  // Step 5: Check workflow jobs
  console.log("[5/5] Checking workflow jobs...");
  const jobs = await dbConn.select().from(workflowJobs).where(eq(workflowJobs.letterRequestId, letterId));
  console.log(`   Found ${jobs.length} job(s):`);
  jobs.forEach((j, i) => {
    console.log(`   [${i + 1}] Type: ${j.jobType}, Provider: ${j.provider}, Status: ${j.status}`);
  });
  const failedJobs = jobs.filter(j => j.status === "failed");
  if (failedJobs.length > 0) {
    console.error(`   ✗ ${failedJobs.length} job(s) failed!`);
    failedJobs.forEach(j => console.error(`     - ${j.jobType}: ${j.errorMessage}`));
  } else {
    console.log("   ✓ All jobs completed successfully");
  }

  // Check research runs
  const research = await dbConn.select().from(researchRuns).where(eq(researchRuns.letterRequestId, letterId));
  console.log(`   Research runs: ${research.length}`);
  if (research.length > 0 && research[0].status === "completed") {
    console.log("   ✓ Research run completed with results");
  }

  console.log();
  console.log("═══════════════════════════════════════════════════════");
  console.log("  E2E PIPELINE TEST COMPLETE");
  console.log(`  Letter ID: ${letterId}`);
  console.log(`  Final Status: ${letter.status}`);
  console.log(`  Versions: ${versions.length}`);
  console.log(`  Jobs: ${jobs.length} (${failedJobs.length} failed)`);
  console.log("═══════════════════════════════════════════════════════");

  // Print a snippet of the final letter
  const finalVersion = versions.find(v => v.versionType === "ai_draft" && v.content?.length > 500);
  if (finalVersion) {
    console.log();
    console.log("── FINAL LETTER PREVIEW (first 500 chars) ──");
    console.log(finalVersion.content.substring(0, 500));
    console.log("...");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
