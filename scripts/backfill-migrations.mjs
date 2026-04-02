#!/usr/bin/env node
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import pg from "pg";

const connectionString =
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "Error: SUPABASE_DATABASE_URL or DATABASE_URL must be set."
  );
  process.exit(1);
}

const drizzleDir = join(process.cwd(), "drizzle");
const journalPath = join(drizzleDir, "meta", "_journal.json");
const journal = JSON.parse(readFileSync(journalPath, "utf-8"));

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  const { rows: existing } = await client.query(
    `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`
  );
  const existingByTimestamp = new Map(
    existing.map((r) => [String(r.created_at), r])
  );
  const existingHashes = new Set(existing.map((r) => r.hash));

  let inserted = 0;
  let updated = 0;

  for (const entry of journal.entries) {
    const sqlPath = join(drizzleDir, `${entry.tag}.sql`);
    let content;
    try {
      content = readFileSync(sqlPath, "utf-8");
    } catch {
      console.error(`✗ Missing SQL file for journal entry: ${entry.tag}`);
      process.exit(1);
    }

    const hash = createHash("sha256").update(content).digest("hex");

    if (existingHashes.has(hash)) {
      continue;
    }

    const existingRow = existingByTimestamp.get(String(entry.when));
    if (existingRow) {
      await client.query(
        `UPDATE drizzle.__drizzle_migrations SET hash = $1 WHERE id = $2`,
        [hash, existingRow.id]
      );
      updated++;
      console.log(`  ~ Updated hash: ${entry.tag}`);
    } else {
      await client.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
        [hash, entry.when]
      );
      inserted++;
      console.log(`  + Inserted: ${entry.tag}`);
    }
  }

  if (inserted === 0 && updated === 0) {
    console.log("✓ All migration journal entries already present in DB.");
  } else {
    if (inserted > 0) console.log(`  Backfilled ${inserted} missing entries.`);
    if (updated > 0) console.log(`  Updated ${updated} stale hashes.`);
    console.log("✓ Migration backfill complete.");
  }

  const { rows: countRows } = await client.query(
    `SELECT COUNT(*) as total FROM drizzle.__drizzle_migrations`
  );
  const { rows: maxRows } = await client.query(
    `SELECT MAX(id) as max_id FROM drizzle.__drizzle_migrations`
  );
  const maxId = maxRows[0].max_id;
  if (maxId) {
    await client.query(
      `SELECT setval('drizzle.__drizzle_migrations_id_seq', $1)`,
      [maxId]
    );
  }

  console.log(
    `DB has ${countRows[0].total} entries, journal has ${journal.entries.length} entries.`
  );
} finally {
  await client.end();
}
