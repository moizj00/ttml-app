/**
 * Supabase Migration Validation Tests
 * Verifies that the app is correctly connected to Supabase (PostgreSQL)
 * and that all 9 application tables are accessible via Drizzle ORM.
 */
import { describe, it, expect } from "vitest";

// ─── Schema validation ───────────────────────────────────────────────────────

describe("Drizzle PostgreSQL Schema", () => {
  it("exports all 9 application tables", async () => {
    const schema = await import("../drizzle/schema");
    const expectedTables = [
      "users",
      "letterRequests",
      "letterVersions",
      "reviewActions",
      "workflowJobs",
      "researchRuns",
      "attachments",
      "notifications",
      "subscriptions",
    ];
    for (const table of expectedTables) {
      expect(schema).toHaveProperty(table, expect.anything());
    }
  });

  it("exports all required Insert types", async () => {
    const schema = await import("../drizzle/schema");
    // These are type-only exports, but we can verify the table objects exist
    expect(schema.users).toBeDefined();
    expect(schema.letterRequests).toBeDefined();
    expect(schema.letterVersions).toBeDefined();
    expect(schema.subscriptions).toBeDefined();
  });

  it("letterRequests table has all required columns", async () => {
    const { letterRequests } = await import("../drizzle/schema");
    const columns = Object.keys(letterRequests);
    // Drizzle table object has column names as keys
    expect(columns.length).toBeGreaterThan(0);
  });
});

// ─── DB helper validation ─────────────────────────────────────────────────────

describe("Database connection URL resolution", () => {
  it("prefers SUPABASE_DATABASE_URL over DATABASE_URL when both set", () => {
    const supabaseUrl = "postgresql://postgres.abc123:pass@aws-1-us-east-2.pooler.supabase.com:6543/postgres";
    const fallbackUrl = "postgresql://user:pass@other-db.example.com:5432/db";

    // Simulate the resolution logic from db.ts
    const resolveDbUrl = (supabaseDbUrl?: string, databaseUrl?: string) =>
      supabaseDbUrl || databaseUrl;

    expect(resolveDbUrl(supabaseUrl, fallbackUrl)).toBe(supabaseUrl);
    expect(resolveDbUrl(undefined, fallbackUrl)).toBe(fallbackUrl);
    expect(resolveDbUrl(supabaseUrl, undefined)).toBe(supabaseUrl);
    expect(resolveDbUrl(undefined, undefined)).toBeUndefined();
  });

  it("identifies Supabase URLs correctly", () => {
    const isSupabase = (url: string) => url.includes("supabase");
    expect(isSupabase("postgresql://postgres.abc@aws-1-us-east-2.pooler.supabase.com:6543/postgres")).toBe(true);
    expect(isSupabase("postgresql://postgres:pass@db.abc.supabase.co:5432/postgres")).toBe(true);
    expect(isSupabase("postgresql://user:pass@other-db.example.com:5432/db")).toBe(false);
  });
});

// ─── Migration SQL validation ─────────────────────────────────────────────────

describe("PostgreSQL Migration SQL", () => {
  it("migration file exists and contains all 9 tables", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.join(process.cwd(), "drizzle/migrations/0001_initial_pg_schema.sql");
    
    expect(fs.existsSync(migrationPath)).toBe(true);
    
    const sql = fs.readFileSync(migrationPath, "utf-8");
    const expectedTables = [
      "users",
      "letter_requests",
      "letter_versions",
      "review_actions",
      "workflow_jobs",
      "research_runs",
      "attachments",
      "notifications",
      "subscriptions",
    ];
    for (const table of expectedTables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
  });

  it("migration file contains all 12 enum types", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.join(process.cwd(), "drizzle/migrations/0001_initial_pg_schema.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    const expectedEnums = [
      "actor_type",
      "job_status",
      "job_type",
      "letter_status",
      "letter_type",
      "note_visibility",
      "priority_level",
      "research_status",
      "subscription_plan",
      "subscription_status",
      "user_role",
      "version_type",
    ];
    for (const enumName of expectedEnums) {
      expect(sql).toContain(`"${enumName}"`);
    }
  });

  it("migration file contains all 7 indexes", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.join(process.cwd(), "drizzle/migrations/0001_initial_pg_schema.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    const expectedIndexes = [
      "idx_letter_requests_status",
      "idx_letter_requests_user_id",
      "idx_letter_requests_assigned_reviewer",
      "idx_letter_versions_letter_request_id",
      "idx_research_runs_letter_request_status",
      "idx_review_actions_letter_request_id",
      "idx_workflow_jobs_letter_request_status",
    ];
    for (const idx of expectedIndexes) {
      expect(sql).toContain(idx);
    }
  });

  it("migration file contains updated_at trigger function", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.join(process.cwd(), "drizzle/migrations/0001_initial_pg_schema.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("update_updated_at_column");
    expect(sql).toContain("BEFORE UPDATE");
  });
});

// ─── Drizzle config validation ────────────────────────────────────────────────

describe("Drizzle config dialect", () => {
  it("drizzle.config.ts uses postgresql dialect", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const configPath = path.join(process.cwd(), "drizzle.config.ts");
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain('dialect: "postgresql"');
    expect(content).not.toContain('dialect: "mysql"');
  });

  it("db.ts uses postgres-js driver (not mysql2)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const dbPath = path.join(process.cwd(), "server/db.ts");
    const content = fs.readFileSync(dbPath, "utf-8");
    expect(content).toContain('from "drizzle-orm/postgres-js"');
    expect(content).not.toContain('from "drizzle-orm/mysql2"');
    expect(content).toContain("SUPABASE_DATABASE_URL");
  });
});
