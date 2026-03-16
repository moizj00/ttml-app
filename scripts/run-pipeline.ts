/**
 * Directly trigger the pipeline for a letter ID.
 * Run with: npx tsx scripts/run-pipeline.ts <letterId>
 */
import "dotenv/config";
import { runFullPipeline } from "../server/pipeline";
import { getLetterRequestById, updateLetterStatus } from "../server/db";

const letterId = parseInt(process.argv[2] ?? "1", 10);

async function main() {
  console.log(`[Script] Triggering pipeline for letter #${letterId}...`);

  const letter = await getLetterRequestById(letterId);
  if (!letter) {
    console.error(`Letter #${letterId} not found`);
    process.exit(1);
  }

  console.log(`[Script] Letter status: ${letter.status}`);

  if (!letter.intakeJson) {
    console.error("No intakeJson found on letter");
    process.exit(1);
  }

  // Reset to submitted if stuck
  if (!["submitted", "needs_changes"].includes(letter.status)) {
    console.log(`[Script] Resetting status from ${letter.status} to submitted...`);
    await updateLetterStatus(letterId, "submitted");
  }

  console.log(`[Script] Running full pipeline...`);
  await runFullPipeline(letterId, letter.intakeJson as any, {
    subject: letter.subject,
    issueSummary: letter.issueSummary,
    jurisdictionCountry: letter.jurisdictionCountry,
    jurisdictionState: letter.jurisdictionState,
    jurisdictionCity: letter.jurisdictionCity,
    letterType: letter.letterType,
  });

  console.log(`[Script] Pipeline complete for letter #${letterId}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[Script] Pipeline failed:", err);
  process.exit(1);
});
