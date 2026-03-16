import postgres from "postgres";
const url = process.env.SUPABASE_DATABASE_URL;
if (!url) { console.error("SUPABASE_DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { ssl: "require", max: 1 });
try {
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
  console.log("Tables:", tables.map(t => t.table_name).join(", "));
  const enums = await sql`SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname`;
  console.log("Enums:", enums.map(e => e.typname).join(", "));
} catch (e) {
  console.error("Error:", e.message);
} finally {
  await sql.end();
}
