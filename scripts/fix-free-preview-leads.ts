import { getDb } from "../server/db/core";
import { letterRequests } from "../drizzle/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createLogger } from "../server/logger";

const logger = createLogger({ module: "DataCleanup" });

async function fixFreePreviewLeads() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    logger.info("Starting cleanup of first-letter lead-magnet records...");

    // Identifies letters that:
    // 1. Should be free previews (isFreePreview = true)
    // 2. Are currently in 'generated_locked' (incorrect for free previews before release)
    // 3. Or are lead magnets that should have been marked as free preview
    // Note: We only target letters where isFreePreview is true but status is 'generated_locked'
    // and we also handle cases where they were newly submitted as lead magnets but missed the flag.

    const now = new Date();

    const results = await db
        .update(letterRequests)
        .set({
            isFreePreview: true,
            freePreviewUnlockAt: sql`COALESCE(free_preview_unlock_at, submitted_at + interval '24 hours')`,
            status: sql`CASE
        WHEN NOW() < COALESCE(free_preview_unlock_at, submitted_at + interval '24 hours') THEN 'ai_generation_completed_hidden'::letter_status
        ELSE 'letter_released_to_subscriber'::letter_status
      END`,
            updatedAt: now,
        } as any)
        .where(
            and(
                eq(letterRequests.isFreePreview, true),
                eq(letterRequests.status, "generated_locked")
            )
        )
        .returning({ id: letterRequests.id, status: letterRequests.status });

    logger.info({ count: results.length }, "Cleanup completed");
    for (const row of results) {
        logger.info({ id: row.id, newStatus: row.status }, "Updated letter");
    }
}

fixFreePreviewLeads()
    .then(() => process.exit(0))
    .catch((err) => {
        logger.error({ err }, "Cleanup failed");
        process.exit(1);
    });
