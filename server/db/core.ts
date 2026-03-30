import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { captureServerException } from "../sentry";
import { discountCodes } from "../../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _startupMigrationRan = false;

export async function getDb() {
  const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!_db && dbUrl) {
    try {
      const client = postgres(dbUrl, {
        ssl: "require",
        max: parseInt(process.env.DB_POOL_MAX ?? "25", 10),
        idle_timeout: 20,
        connect_timeout: 10,
      });
      _db = drizzle(client);
      console.log("[Database] Connected to Supabase (PostgreSQL)");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      captureServerException(error, { tags: { component: "database", error_type: "connection_failed" } });
      _db = null;
    }
  }
  if (_db && !_startupMigrationRan) {
    _startupMigrationRan = true;
    // One-time migration: remove maxUses:1 limit from all existing discount codes
    try {
      await _db
        .update(discountCodes)
        .set({ maxUses: null })
        .where(eq(discountCodes.maxUses, 1));
      console.log("[Database] Migration: cleared maxUses:1 from discount codes");
    } catch (migErr) {
      console.warn("[Database] Migration error (maxUses cleanup):", migErr);
    }
    // Add pipeline_locked_at column if it doesn't exist (session locking feature)
    try {
      await _db.execute(sql`
        ALTER TABLE letter_requests
        ADD COLUMN IF NOT EXISTS pipeline_locked_at TIMESTAMPTZ
      `);
      console.log("[Database] Migration: ensured pipeline_locked_at column exists");
    } catch (migErr) {
      console.warn("[Database] Migration error (pipeline_locked_at):", migErr);
    }
    // Add recursive learning hardening columns to pipeline_lessons
    try {
      await _db.execute(sql`
        ALTER TABLE pipeline_lessons
        ADD COLUMN IF NOT EXISTS hit_count INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS times_injected INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS consolidated_from_ids INTEGER[],
        ADD COLUMN IF NOT EXISTS letters_before_avg_score INTEGER,
        ADD COLUMN IF NOT EXISTS letters_after_avg_score INTEGER,
        ADD COLUMN IF NOT EXISTS effectiveness_samples INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_injected_at TIMESTAMPTZ
      `);
      await _db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_pipeline_lessons_type_jurisdiction_active
        ON pipeline_lessons (letter_type, jurisdiction, is_active)
      `);
      console.log("[Database] Migration: ensured pipeline_lessons hardening columns exist");
    } catch (migErr) {
      console.warn("[Database] Migration error (pipeline_lessons hardening):", migErr);
    }
    // Add 'consolidation' to lesson_source enum if it doesn't exist
    try {
      await _db.execute(sql`
        DO $$ BEGIN
          ALTER TYPE lesson_source ADD VALUE IF NOT EXISTS 'consolidation';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$
      `);
      console.log("[Database] Migration: ensured 'consolidation' enum value exists");
    } catch (migErr) {
      console.warn("[Database] Migration error (consolidation enum):", migErr);
    }
    // Add 'client_revision_requested' and 'client_declined' to letter_status enum
    try {
      await _db.execute(sql`
        DO $$ BEGIN
          ALTER TYPE letter_status ADD VALUE IF NOT EXISTS 'client_revision_requested';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$
      `);
      await _db.execute(sql`
        DO $$ BEGIN
          ALTER TYPE letter_status ADD VALUE IF NOT EXISTS 'client_declined';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$
      `);
      console.log("[Database] Migration: ensured client_revision_requested and client_declined enum values exist");
    } catch (migErr) {
      console.warn("[Database] Migration error (client approval statuses):", migErr);
    }
  }
  return _db;
}
