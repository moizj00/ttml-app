import postgres, { type Sql } from "postgres";

/**
 * Shared database helpers for platform E2E tests.
 *
 * Usage:
 *   import { createSql, resetTestUser, findLatestE2ELetter } from "./helpers/db";
 */

/** Create a postgres connection from DATABASE_URL env var */
export function createSql(): Sql {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set for platform E2E tests");
  }
  return postgres(process.env.DATABASE_URL);
}

/** Reset a test user so they can submit new letters without rate-limit collisions */
export async function resetTestUser(sql: Sql, email: string): Promise<void> {
  await sql`
    UPDATE users SET free_review_used_at = NULL WHERE email = ${email}
  `;
}

/** Find the latest E2E letter in a given status */
export async function findLatestE2ELetter(
  sql: Sql,
  statuses: string[] = ["generated_locked", "pending_review", "under_review", "approved"]
): Promise<{ id: number; status: string; subject: string } | null> {
  const records = await sql`
    SELECT id, status, subject
    FROM letter_requests
    WHERE status = ANY(${statuses})
      AND (subject LIKE 'E2E%' OR subject LIKE 'E2E%')
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return records.length > 0 ? (records[0] as any) : null;
}

/** Simulate payment by transitioning from generated_locked → pending_review */
export async function simulatePayment(sql: Sql, letterId: number): Promise<void> {
  await sql`
    UPDATE letter_requests
    SET status = 'pending_review',
        last_status_changed_at = NOW(),
        updated_at = NOW()
    WHERE id = ${letterId}
      AND status = 'generated_locked'
  `;
}

/** Clean up test letters created during this run */
export async function cleanupTestLetters(sql: Sql, subjectPrefix: string): Promise<number> {
  const deleted = await sql`
    DELETE FROM letter_requests
    WHERE subject LIKE ${subjectPrefix + "%"}
    RETURNING id
  `;
  return deleted.length;
}
