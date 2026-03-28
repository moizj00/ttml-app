#!/usr/bin/env node
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import pg from "pg";

const drizzleDir = join(process.cwd(), "drizzle");
const journalPath = join(drizzleDir, "meta", "_journal.json");

const journal = JSON.parse(readFileSync(journalPath, "utf-8"));
const journalEntries = journal.entries;

const sqlFiles = readdirSync(drizzleDir).filter(
  (f) => f.endsWith(".sql") && /^\d{4}_/.test(f)
);

const journalTags = new Set(journalEntries.map((e) => e.tag));
const fileTags = new Set(sqlFiles.map((f) => f.replace(".sql", "")));

const missingFromJournal = [...fileTags].filter((t) => !journalTags.has(t));
const missingFiles = [...journalTags].filter((t) => !fileTags.has(t));

console.log(`Journal entries: ${journalEntries.length}`);
console.log(`SQL migration files: ${sqlFiles.length}`);
console.log(`Journal tags matched to files: ${journalTags.size}`);

let exitCode = 0;

if (missingFromJournal.length > 0) {
  console.warn(
    `\n⚠ SQL files not tracked in journal: ${missingFromJournal.join(", ")}`
  );
}

if (missingFiles.length > 0) {
  console.error(
    `\n✗ Journal entries missing SQL files: ${missingFiles.join(", ")}`
  );
  exitCode = 1;
}

if (missingFromJournal.length === 0 && missingFiles.length === 0) {
  console.log("\n✓ Migration journal is consistent with SQL files.");
}

const connectionString =
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (connectionString) {
  console.log("\n--- DB state check ---");
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const { rows: dbRows } = await client.query(
      `SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at`
    );
    const dbHashes = new Set(dbRows.map((r) => r.hash));

    const expectedHashes = [];
    for (const entry of journalEntries) {
      const sqlPath = join(drizzleDir, `${entry.tag}.sql`);
      try {
        const content = readFileSync(sqlPath, "utf-8");
        expectedHashes.push({
          tag: entry.tag,
          hash: createHash("sha256").update(content).digest("hex"),
        });
      } catch {
        expectedHashes.push({ tag: entry.tag, hash: null });
      }
    }

    const missingFromDb = expectedHashes.filter(
      (e) => e.hash && !dbHashes.has(e.hash)
    );

    console.log(`DB migration entries: ${dbRows.length}`);
    console.log(`Expected (from journal): ${journalEntries.length}`);

    if (missingFromDb.length > 0) {
      console.error(
        `\n✗ Migrations missing from DB: ${missingFromDb.map((e) => e.tag).join(", ")}`
      );
      console.error(
        "  Run: node scripts/backfill-migrations.mjs to fix."
      );
      exitCode = 1;
    } else {
      console.log("✓ All journal migrations are recorded in the DB.");
    }
  } catch (err) {
    console.warn(`⚠ Could not check DB state: ${err.message}`);
  } finally {
    await client.end();
  }
} else {
  console.warn(
    "\n⚠ No DATABASE_URL set, skipping DB state verification."
  );
}

process.exit(exitCode);
