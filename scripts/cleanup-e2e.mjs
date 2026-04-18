import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const sql = postgres(process.env.SUPABASE_DATABASE_URL);

async function main() {
    console.log("Cleaning up E2E users...");
    await sql`DELETE FROM public.users WHERE email LIKE '%@e2e.ttml.test'`;
    await sql`DELETE FROM auth.users WHERE email LIKE '%@e2e.ttml.test'`;
    console.log("Done!");
    process.exit(0);
}
main().catch(console.error);
