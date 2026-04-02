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
 * Connection strategy:
 *   1. Prefer SUPABASE_DIRECT_URL (direct connection, port 5432) — best for migrations
 *   2. Fall back to SUPABASE_DATABASE_URL or DATABASE_URL (pooler, port 6543)
 *   Retries up to 3 times on transient pooler errors (circuit breaker, etc.)
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TRANSIENT_CODES = new Set([
  "XX000", // Circuit breaker / internal error
  "08000", // Connection exception
  "08003", // Connection does not exist
  "08006", // Connection failure
  "08001", // Unable to establish connection
  "57P03", // Cannot connect now
]);

function isTransient(err: unknown): boolean {
  if (err && typeof err === "object") {
    const cause = (err as any).cause;
    if (cause && TRANSIENT_CODES.has(cause.code)) return true;
    if (TRANSIENT_CODES.has((err as any).code)) return true;
  }
  return false;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMigrations() {
  // Prefer direct connection for migrations (bypasses pgBouncer, has full DDL privileges)
  const connectionString =
    process.env.SUPABASE_DIRECT_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    console.error(
      "[Migrate] ERROR: SUPABASE_DIRECT_URL, SUPABASE_DATABASE_URL, or DATABASE_URL is required."
    );
    process.exit(1);
  }

  // The Drizzle journal lives at drizzle/meta/_journal.json and references SQL
  // files in the drizzle/ root (e.g. drizzle/0000_nervous_james_howlett.sql).
  // In production the compiled bundle is at dist/migrate.js, so we go up one
  // level from __dirname (dist/) to reach the project root, then into drizzle/.
  const migrationsFolder = path.resolve(__dirname, "../drizzle");

  console.log(`[Migrate] Running migrations from: ${migrationsFolder}`);

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Migrate] Attempt ${attempt}/${MAX_RETRIES} — connecting to database...`);

    const client = postgres(connectionString, {
      ssl: "require",
      max: 1,
      connect_timeout: 10,
      idle_timeout: 5,
    });

    const db = drizzle(client);

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
      await client.end();
      process.exit(0);
    } catch (err) {
      await client.end();

      if (isTransient(err) && attempt < MAX_RETRIES) {
        const delay = attempt * 2000; // 2s, 4s backoff
        console.warn(
          `[Migrate] Transient error on attempt ${attempt}, retrying in ${delay / 1000}s...`,
          (err as any)?.cause?.message || (err as any)?.message
        );
        await sleep(delay);
        continue;
      }

      console.error("[Migrate] Migration failed:", err);
      process.exit(1);
    }
  }
}

runMigrations();
