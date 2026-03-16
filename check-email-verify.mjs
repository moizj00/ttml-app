import postgres from "postgres";
const url = process.env.SUPABASE_DATABASE_URL;
if (!url) { console.error("SUPABASE_DATABASE_URL not set"); process.exit(1); }
const sql = postgres(url, { ssl: "require", max: 1 });
try {
  // Check email_verification_tokens columns
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_verification_tokens'
    ORDER BY ordinal_position
  `;
  console.log("email_verification_tokens columns:");
  cols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

  // Check users.email_verified column
  const userCols = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('email_verified', 'email', 'role')
    ORDER BY column_name
  `;
  console.log("\nusers relevant columns:");
  userCols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (default: ${c.column_default})`));

  // Count tokens
  const count = await sql`SELECT COUNT(*) as cnt FROM email_verification_tokens`;
  console.log("\nTotal verification tokens in DB:", count[0].cnt);

  // Count unverified users
  const unverified = await sql`SELECT COUNT(*) as cnt FROM users WHERE email_verified = false`;
  console.log("Unverified users:", unverified[0].cnt);

} catch (e) {
  console.error("Error:", e.message);
} finally {
  await sql.end();
}
