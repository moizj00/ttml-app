import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { captureServerException } from "../sentry";
import { discountCodes } from "../../drizzle/schema";

/**
 * Re-throws migration errors unless the failure is clearly idempotent
 * (i.e. the object or column already exists).  Any other error means
 * the schema is in an unexpected state and the app must not start.
 */
function throwIfUnexpectedMigrationError(label: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (/already exists/i.test(msg)) {
    console.log(`[Database] Migration: ${label} already applied — skipping`);
    return;
  }
  captureServerException(err, { tags: { component: "database", error_type: "migration_failed", migration: label } });
  throw new Error(`[Database] Fatal migration error (${label}): ${msg}`);
}

let _db: ReturnType<typeof drizzle> | null = null;
let _readDb: ReturnType<typeof drizzle> | null = null;
let _readDbFailed = false;
let _startupMigrationRan = false;

export async function getDb() {
  const dbUrl =
    process.env.SUPABASE_DIRECT_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL;
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
    // One-time migration: remove maxUses:1 limit from all existing discount codes
    try {
      await _db
        .update(discountCodes)
        .set({ maxUses: null })
        .where(eq(discountCodes.maxUses, 1));
      console.log("[Database] Migration: cleared maxUses:1 from discount codes");
    } catch (migErr) {
      throwIfUnexpectedMigrationError("maxUses cleanup", migErr);
    }
    // Add pipeline_locked_at column if it doesn't exist (session locking feature)
    try {
      await _db.execute(sql`
        ALTER TABLE letter_requests
        ADD COLUMN IF NOT EXISTS pipeline_locked_at TIMESTAMPTZ
      `);
      console.log("[Database] Migration: ensured pipeline_locked_at column exists");
    } catch (migErr) {
      throwIfUnexpectedMigrationError("pipeline_locked_at", migErr);
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
      throwIfUnexpectedMigrationError("pipeline_lessons hardening", migErr);
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
      throwIfUnexpectedMigrationError("consolidation enum", migErr);
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
      throwIfUnexpectedMigrationError("client approval statuses", migErr);
    }
    // Add 'assembly' to job_type enum if it doesn't exist (used by pipeline assembly stage logging)
    try {
      await _db.execute(sql`
        DO $$ BEGIN
          ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'assembly';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$
      `);
      console.log("[Database] Migration: ensured 'assembly' job_type enum value exists");
    } catch (migErr) {
      throwIfUnexpectedMigrationError("assembly job_type enum", migErr);
    }
    try {
      await _db.execute(sql`
        CREATE TABLE IF NOT EXISTS intake_form_templates (
          id SERIAL PRIMARY KEY,
          owner_user_id INTEGER NOT NULL,
          title VARCHAR(200) NOT NULL,
          base_letter_type letter_type NOT NULL,
          field_config JSONB NOT NULL,
          active BOOLEAN DEFAULT true NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
        )
      `);
      await _db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_intake_form_templates_owner ON intake_form_templates (owner_user_id)
      `);
      await _db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_intake_form_templates_letter_type ON intake_form_templates (base_letter_type)
      `);
      console.log("[Database] Migration: ensured intake_form_templates table exists");
    } catch (migErr) {
      throwIfUnexpectedMigrationError("intake_form_templates", migErr);
    }
    // Mark migrations complete only after all have succeeded
    _startupMigrationRan = true;
  }
  return _db;
}

export async function getReadDb() {
  if (_readDb) return _readDb;

  const replicaUrl = process.env.SUPABASE_READ_REPLICA_URL;
  if (!replicaUrl || _readDbFailed) {
    return getDb();
  }

  try {
    const client = postgres(replicaUrl, {
      ssl: "require",
      max: parseInt(process.env.DB_READ_POOL_MAX ?? "15", 10),
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _readDb = drizzle(client);
    await _readDb.execute(sql`SELECT 1`);
    console.log("[Database] Connected to read replica");
    return _readDb;
  } catch (error) {
    console.warn("[Database] Read replica connection failed, falling back to primary:", error);
    captureServerException(error, { tags: { component: "database", error_type: "read_replica_failed" } });
    _readDbFailed = true;
    _readDb = null;
    return getDb();
  }
}
