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
 *
 * Connection strategy (in priority order):
 *   1. SUPABASE_DIRECT_URL  — direct connection to db.*.supabase.co:5432 (IPv4, no pooler)
 *   2. SUPABASE_DATABASE_URL — fallback pooler URL
 *   3. DATABASE_URL          — last resort
 *
 * IMPORTANT: Railway build containers do NOT have IPv6 connectivity.
 * The Supabase session pooler (pooler.supabase.com) resolves to IPv6 addresses
 * and will fail with ENETUNREACH. Always use SUPABASE_DIRECT_URL for migrations.
 *
 * Retries up to 3 times on transient errors (circuit breaker, connection reset, etc.)
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TRANSIENT_CODES = new Set([
  "XX000", // Circuit breaker / internal error
  "08000", // Connection exception
  "08003", // Connection does not exist
  "08006", // Connection failure
  "08001", // Unable to establish connection
  "57P03", // Cannot connect now
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
]);

function isTransient(err: unknown): boolean {
  if (err && typeof err === "object") {
    const cause = (err as any).cause;
    // ENETUNREACH = IPv6 not reachable — this is a hard config error, not transient
    if (cause?.code === "ENETUNREACH") return false;
    if ((err as any).code === "ENETUNREACH") return false;
    if (cause && TRANSIENT_CODES.has(cause.code)) return true;
    if (TRANSIENT_CODES.has((err as any).code)) return true;
  }
  return false;
}

function isIPv6Unreachable(err: unknown): boolean {
  if (err && typeof err === "object") {
    const cause = (err as any).cause;
    if (cause?.code === "ENETUNREACH") return true;
    if ((err as any).code === "ENETUNREACH") return true;
    const msg = (err as any)?.message || "";
    if (msg.includes("ENETUNREACH")) return true;
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
    logger.error(
      "[Migrate] ERROR: No database URL found. Set SUPABASE_DIRECT_URL to:\n" +
      "  postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres?sslmode=require"
    );
    process.exit(1);
  }

  // Warn if using a pooler URL that may resolve to IPv6 on Railway
  if (connectionString.includes("pooler.supabase.com")) {
    logger.warn(
      "[Migrate] WARNING: Using pooler URL for migrations. " +
      "Set SUPABASE_DIRECT_URL to db.*.supabase.co:5432 to avoid IPv6/pgBouncer issues on Railway."
    );
  }

  // The Drizzle journal lives at drizzle/meta/_journal.json and references SQL
  // files in the drizzle/ root (e.g. drizzle/0000_nervous_james_howlett.sql).
  // In production the compiled bundle is at dist/migrate.js, so we go up one
  // level from __dirname (dist/) to reach the project root, then into drizzle/.
  const migrationsFolder = path.resolve(__dirname, "../drizzle");

  logger.info(`[Migrate] Running migrations from: ${migrationsFolder}`);

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    logger.info(`[Migrate] Attempt ${attempt}/${MAX_RETRIES} — connecting to database...`);

    const client = postgres(connectionString, {
      ssl: "require",
      max: 1,
      connect_timeout: 15,
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

      logger.info("[Migrate] All migrations applied successfully.");
      await client.end();
      process.exit(0);
    } catch (err) {
      await client.end();

      // Hard fail immediately for IPv6 unreachable — retrying won't help
      if (isIPv6Unreachable(err)) {
        logger.error({ err }, "FATAL: IPv6 network unreachable (ENETUNREACH). Railway does not support IPv6. The pooler URL resolves to an IPv6 address. Fix: Set SUPABASE_DIRECT_URL to the direct connection URL: postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require");
      }

      if (isTransient(err) && attempt < MAX_RETRIES) {
        const delay = attempt * 2000; // 2s, 4s backoff
        logger.warn({ err }, `[Migrate] Transient error on attempt ${attempt}, retrying in ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }

      logger.error({ err: err }, "[Migrate] Migration failed:");
      process.exit(1);
    }
  }
}

runMigrations();
