/**
 * migrate.ts — Run Drizzle ORM migrations against the production database.
 *
 * This script is executed by start.sh before the server starts to ensure
 * the database schema is always up-to-date on every deployment.
 *
 * KNOWN ISSUE: Drizzle's migrate() always runs `CREATE SCHEMA IF NOT EXISTS "public"`
 * which can fail on Supabase pooler connections. This script works around it by:
 *   1. Checking if all migrations are already applied (via __drizzle_migrations table)
 *   2. If yes → skip Drizzle's migrate() entirely and exit 0
 *   3. If no → attempt migrate(), and if it fails, log the full error but still exit 0
 *      if the schema appears correct (non-fatal for the server startup)
 *
 * Connection strategy (in priority order):
 *   1. SUPABASE_DIRECT_URL  — direct connection to db.*.supabase.co:5432 (IPv4, no pooler)
 *   2. SUPABASE_DATABASE_URL — fallback pooler URL
 *   3. DATABASE_URL          — last resort
 */
import "dotenv/config";

import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { logger } from "./logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Serialize any error into a loggable object with name, message, stack, code, cause */
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: (err as any).code,
      cause: err.cause ? serializeError(err.cause) : undefined,
      detail: (err as any).detail,
      hint: (err as any).hint,
      severity: (err as any).severity,
    };
  }
  return { raw: String(err) };
}

async function runMigrations() {
  const connectionString =
    process.env.SUPABASE_DIRECT_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!connectionString) {
    logger.error(
      "[Migrate] No database URL found. Set SUPABASE_DIRECT_URL. Skipping migrations (non-fatal)."
    );
    // Exit 0 so the server still starts — the DB might already be correct
    process.exit(0);
  }

  if (connectionString.includes("pooler.supabase.com")) {
    logger.warn(
      "[Migrate] Using pooler URL for migrations. Set SUPABASE_DIRECT_URL for reliability."
    );
  }

  const migrationsFolder = path.resolve(__dirname, "../drizzle");
  logger.info(`[Migrate] Migrations folder: ${migrationsFolder}`);

  const client = postgres(connectionString, {
    ssl: "require",
    max: 1,
    connect_timeout: 30,
    idle_timeout: 10,
  });

  try {
    // ── Step 1: Check if __drizzle_migrations table exists ──
    const tableCheck = await client`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '__drizzle_migrations'
      ) as exists;
    `;
    const trackingTableExists = tableCheck[0]?.exists === true;
    logger.info(`[Migrate] Tracking table exists: ${trackingTableExists}`);

    if (trackingTableExists) {
      // ── Step 2: Check how many migrations are already applied ──
      const applied = await client`
        SELECT hash FROM "__drizzle_migrations" ORDER BY created_at;
      `;
      const appliedCount = applied.length;

      // Count migration SQL files in the journal
      const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
      let totalMigrations = 0;
      if (fs.existsSync(journalPath)) {
        const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
        totalMigrations = journal.entries?.length || 0;
      }

      logger.info(`[Migrate] Applied: ${appliedCount} / Total: ${totalMigrations}`);

      if (appliedCount >= totalMigrations && totalMigrations > 0) {
        logger.info("[Migrate] All migrations already applied. Skipping Drizzle migrate().");
        await client.end();
        process.exit(0);
      }

      // Some migrations are pending — try to apply them
      logger.info(`[Migrate] ${totalMigrations - appliedCount} pending migrations. Attempting to apply...`);
    } else {
      logger.info("[Migrate] No tracking table found. Running full migration...");
    }

    // ── Step 3: Run Drizzle migrate() ──
    const db = drizzle(client);
    try {
      await migrate(db, {
        migrationsFolder,
        migrationsSchema: "public",
        migrationsTable: "__drizzle_migrations",
      });
      logger.info("[Migrate] All migrations applied successfully.");
    } catch (migrateErr: unknown) {
      const serialized = serializeError(migrateErr);
      logger.error(
        { error: serialized },
        `[Migrate] Drizzle migrate() failed: ${serialized.message}`
      );

      // Check if the schema is actually correct despite the error
      // (e.g., CREATE SCHEMA permission denied but tables exist)
      try {
        const criticalTables = await client`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name IN ('users', 'letter_requests', 'letter_versions', 'subscriptions')
          ORDER BY table_name;
        `;
        const foundTables = criticalTables.map((r: any) => r.table_name);
        logger.info(`[Migrate] Critical tables found: ${foundTables.join(", ")}`);

        if (foundTables.length >= 4) {
          logger.warn(
            "[Migrate] Migration failed but all critical tables exist. " +
            "Proceeding with server startup (non-fatal). " +
            "To fix: set SUPABASE_DIRECT_URL to the direct connection URL."
          );
          await client.end();
          process.exit(0); // Non-fatal — let the server start
        }
      } catch (checkErr) {
        logger.error({ error: serializeError(checkErr) }, "[Migrate] Failed to verify schema state.");
      }

      // If we get here, the schema is missing critical tables — fatal
      logger.error("[Migrate] Critical tables missing. Cannot start server.");
      await client.end();
      process.exit(1);
    }

    await client.end();
    process.exit(0);
  } catch (err: unknown) {
    const serialized = serializeError(err);
    logger.error(
      { error: serialized },
      `[Migrate] Fatal error: ${serialized.message}`
    );

    // Even on connection errors, try to exit 0 if we can't verify the schema
    // The server's own getDb() will fail at startup if the DB is truly unreachable
    logger.warn("[Migrate] Exiting with code 0 to allow server startup attempt.");
    try { await client.end(); } catch { /* ignore */ }
    process.exit(0);
  }
}

runMigrations();
