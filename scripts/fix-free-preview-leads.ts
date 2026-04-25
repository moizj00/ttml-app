import { getDb } from "../server/db/core";
import { letterRequests } from "../drizzle/schema";
import { and, eq, isNull, lt, sql } from "drizzle-orm";

async function fixLeads() {
  const db = await getDb();
  if (!db) {
    console.error("Database connection failed");
    return;
  }

  console.log("Starting cleanup of first-letter lead magnet records...");

  // Update records where isFreePreview = true but status is generated_locked
  // These should have been ai_generation_completed_hidden or letter_released_to_subscriber
  const result = await db
    .update(letterRequests)
    .set({
      status: sql`CASE 
        WHEN NOW() < free_preview_unlock_at THEN 'ai_generation_completed_hidden'::letter_status
        ELSE 'letter_released_to_subscriber'::letter_status
      END`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(letterRequests.isFreePreview, true),
        eq(letterRequests.status, "generated_locked")
      )
    )
    .returning({ id: letterRequests.id, status: letterRequests.status });

  console.log(`Updated ${result.length} records.`);
  result.forEach(r => console.log(`  Letter #${r.id} -> ${r.status}`));

  console.log("Cleanup complete.");
}

fixLeads().catch(console.error);
