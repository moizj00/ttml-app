/**
 * migrate.ts — Run Drizzle ORM migrations against the production database.
 *
 * This script is executed as a Railway deploy hook (before the server starts)
 * to ensure the database schema is always up-to-date on every deployment.
 *
 * Usage:
 *   node dist/migrate.js          (production — compiled by esbuild)
 *   tsx server/migrate.ts         (development)
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

  // Supabase uses port 6543 for pooled connections (PgBouncer).
  // Drizzle migrations require a direct connection on port 5432.
  const directUrl = connectionString.replace(/:6543\//, ":5432/");

  console.log("[Migrate] Connecting to database...");

  const client = postgres(directUrl, {
    ssl: "require",
    max: 1,
    connect_timeout: 30,
    idle_timeout: 10,
  });

  const db = drizzle(client);

  // Resolve migrations folder relative to this file.
  // In production (dist/migrate.js) we need to go up one level to find drizzle/migrations/.
  const migrationsFolder = path.resolve(__dirname, "../drizzle/migrations");

  console.log(`[Migrate] Running migrations from: ${migrationsFolder}`);

  try {
    await migrate(db, { migrationsFolder });
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
