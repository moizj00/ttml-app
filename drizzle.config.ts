import { defineConfig } from "drizzle-kit";

const connectionString =
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL or DATABASE_URL is required to run drizzle commands"
  );
}

const migrationUrl = connectionString.replace(/:6543\//, ":5432/");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
    ssl: "require",
  },
  migrations: {
    schema: "public",
  },
});
