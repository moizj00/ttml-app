/**
 * migrate.ts — Run Drizzle ORM migrations against the production database.
 *
 * This script is executed as a Railway preDeployCommand (before the server starts)
 * to ensure the database schema is always up-to-date on every deployment.
 *
 * Usage:
 *   node dist/migrate.js          (production — compiled by esbuild)
 *   tsx server/migrate.ts         (development)
 *
 * Migration folder layout:
 *   drizzle/                      ← Drizzle-generated SQL files (0000_*.sql … 0036_*.sql)
 *   drizzle/meta/_journal.json    ← Drizzle migration journal (source of truth)
 *   drizzle/migrations/           ← Hand-written SQL files (NOT used by this runner)
 *
 * IMPORTANT: The Drizzle migrator must point at the drizzle/ root folder where
 * the journal lives, NOT at drizzle/migrations/ which contains hand-written SQL.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const connectionString =
    process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error(
      "[Migrate] ERROR: SUPABASE_DATABASE_URL or DATABASE_URL is required."
    );
    process.exit(1);
  }

  // Use the connection string as-is (pooler on port 6543 is fine for migrations
  // when using postgres-js with max:1 — Drizzle migrator does not require a
  // direct connection for this driver).
  console.log("[Migrate] Connecting to database...");

  const client = postgres(connectionString, {
    ssl: "require",
    max: 1,
    connect_timeout: 30,
    idle_timeout: 10,
  });

  const db = drizzle(client);

  // The Drizzle journal lives at drizzle/meta/_journal.json and references SQL
  // files in the drizzle/ root (e.g. drizzle/0000_nervous_james_howlett.sql).
  // In production the compiled bundle is at dist/migrate.js, so we go up one
  // level from __dirname (dist/) to reach the project root, then into drizzle/.
  const migrationsFolder = path.resolve(__dirname, "../drizzle");

  console.log(`[Migrate] Running migrations from: ${migrationsFolder}`);

  try {
    // Use migrationsSchema: "public" to avoid `CREATE SCHEMA IF NOT EXISTS "drizzle"`
    // which fails on Supabase pooler connections (no CREATE privilege on database).
    // The __drizzle_migrations tracking table lives in the public schema.
    await migrate(db, {
      migrationsFolder,
      migrationsSchema: "public",
      migrationsTable: "__drizzle_migrations",
    });
    console.log("[Migrate] All migrations applied successfully.");
  } catch (err) {
    console.error("[Migrate] Migration failed:", err);
    await client.end();
    process.exit(1);
  }

  await client.end();
  console.log("[Migrate] Done.");
  process.exit(0);
}

runMigrations();
