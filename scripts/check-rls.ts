import postgres from "postgres";

const connectionString =
  process.env.SUPABASE_DIRECT_URL ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  console.error("No database URL found in environment");
  process.exit(1);
}

const client = postgres(connectionString, {
  ssl: "require",
  max: 1,
});

async function main() {
  try {
    const [rls] = await client`
      SELECT relrowsecurity AS rls_enabled
      FROM pg_class
      WHERE relname = '__drizzle_migrations'
    `;
    console.log("RLS enabled:", rls?.rls_enabled === true);

    const [migration] = await client`
      SELECT hash, created_at
      FROM "__drizzle_migrations"
      WHERE hash = '0053_rls_on_drizzle_migrations'
    `;
    console.log("Migration recorded:", migration ? { hash: migration.hash, created_at: migration.created_at } : false);

    await client.end();
  } catch (err: any) {
    console.error("❌ Error:", err.message);
    await client.end();
    process.exit(1);
  }
}

main();
