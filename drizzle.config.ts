import { defineConfig } from "drizzle-kit";

const connectionString =
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL or DATABASE_URL is required to run drizzle commands"
  );
}

const migrationUrl = connectionString.replace(/:6543\//, ":5432/");

const needsSsl =
  migrationUrl.includes("supabase.co") ||
  migrationUrl.includes("supabase.com") ||
  migrationUrl.includes("amazonaws.com") ||
  migrationUrl.includes("neon.tech") ||
  migrationUrl.includes("sslmode=require");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
    ssl: needsSsl ? "require" : false,
  },
  migrations: {
    schema: "public",
  },
});
