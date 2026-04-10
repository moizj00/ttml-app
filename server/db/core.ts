import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { captureServerException } from "../sentry";
import { createLogger } from "../logger";

const dbLogger = createLogger({ module: "Database" });

let _db: ReturnType<typeof drizzle> | null = null;
let _readDb: ReturnType<typeof drizzle> | null = null;
let _readDbFailed = false;

function needsSsl(url: string): boolean {
  return (
    url.includes("supabase.co") ||
    url.includes("supabase.com") ||
    url.includes("amazonaws.com") ||
    url.includes("neon.tech") ||
    url.includes("sslmode=require")
  );
}

export async function getDb() {
  const dbUrl =
    process.env.SUPABASE_DIRECT_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL;
  if (!_db && dbUrl) {
    try {
      const client = postgres(dbUrl, {
        ssl: needsSsl(dbUrl) ? "require" : false,
        max: parseInt(process.env.DB_POOL_MAX ?? "25", 10),
        idle_timeout: 20,
        connect_timeout: 10,
      });
      _db = drizzle(client);
      dbLogger.info({}, "[Database] Connected to PostgreSQL");
    } catch (error) {
      dbLogger.warn({ error }, "[Database] Failed to connect");
      captureServerException(error, { tags: { component: "database", error_type: "connection_failed" } });
      _db = null;
    }
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
      ssl: needsSsl(replicaUrl) ? "require" : false,
      max: parseInt(process.env.DB_READ_POOL_MAX ?? "15", 10),
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _readDb = drizzle(client);
    await _readDb.execute(sql`SELECT 1`);
    dbLogger.info({}, "[Database] Connected to read replica");
    return _readDb;
  } catch (error) {
    dbLogger.warn({ error }, "[Database] Read replica connection failed, falling back to primary");
    captureServerException(error, { tags: { component: "database", error_type: "read_replica_failed" } });
    _readDbFailed = true;
    _readDb = null;
    return getDb();
  }
}
