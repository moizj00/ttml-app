import { sql } from "drizzle-orm";
import { getDb } from "./server/db/core";

async function runMigration() {
  const db = await getDb();
  if (!db) {
    console.error("Failed to connect to database");
    process.exit(1);
  }

  console.log("Applying manual enum migration...");

  try {
    // We run them individually to avoid partial failures if some exist
    const queries = [
      sql`ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'ai_generation_completed_hidden' BEFORE 'generated_locked'`,
      sql`ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'letter_released_to_subscriber' BEFORE 'generated_locked'`,
      sql`ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'attorney_review_upsell_shown' BEFORE 'generated_locked'`,
    ];

    for (const query of queries) {
      try {
        await db.execute(query);
        console.log("✅ Success: Transition added");
      } catch (err: any) {
        if (err.message.includes("already exists")) {
          console.log("ℹ️ Already exists: Transition already present");
        } else {
          throw err;
        }
      }
    }

    console.log("Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runMigration();
