import { getDb } from "./server/db";
import { letterRequests, pipelineRecords } from "./drizzle/schema";
import { desc, eq } from "drizzle-orm";

async function checkRecentFailures() {
  const db = await getDb();
  const recentLetters = await db.select()
    .from(letterRequests)
    .orderBy(desc(letterRequests.createdAt))
    .limit(5);

  console.log("Recent Letter Requests:");
  console.log(JSON.stringify(recentLetters, null, 2));

  for (const letter of recentLetters) {
    const records = await db.select()
      .from(pipelineRecords)
      .where(eq(pipelineRecords.letterId, letter.id))
      .orderBy(desc(pipelineRecords.startedAt));
    
    console.log(`Pipeline records for letter #${letter.id}:`);
    console.log(JSON.stringify(records, null, 2));
  }
}

checkRecentFailures().catch(console.error);
