/**
 * Seed Test Users Script
 *
 * Creates 4 test users — one per role — via the Supabase Admin API.
 * The script is fully idempotent:
 *   - Paginates listUsers to reliably find existing auth accounts regardless
 *     of how many users are in the tenant.
 *   - Resets the password on existing accounts to TestPass123! so credentials
 *     are always deterministic and usable after re-running.
 *   - Upserts the app-DB record with the correct role and emailVerified=true.
 *
 * Usage:
 *   npx tsx scripts/seed-test-users.ts
 *
 * Credentials:
 *   subscriber : test-subscriber@ttml.dev  / TestPass123!
 *   employee   : test-employee@ttml.dev    / TestPass123!
 *   attorney   : test-attorney@ttml.dev    / TestPass123!
 *   admin      : test-admin@ttml.dev       / TestPass123!
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";

config({ path: ".env.local" });
config(); // also load .env fallback

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DATABASE_URL =
  process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
  console.error(
    "Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL"
  );
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const client = postgres(DATABASE_URL, { ssl: "require", max: 3 });
const db = drizzle(client);

const TEST_PASSWORD = "TestPass123!";

const TEST_USERS: Array<{
  email: string;
  name: string;
  role: "subscriber" | "employee" | "attorney" | "admin";
}> = [
  { email: "test-subscriber@ttml.dev", name: "Test Subscriber", role: "subscriber" },
  { email: "test-employee@ttml.dev",   name: "Test Employee",   role: "employee" },
  { email: "test-attorney@ttml.dev",   name: "Test Attorney",   role: "attorney" },
  { email: "test-admin@ttml.dev",       name: "Test Admin",       role: "admin" },
];

/**
 * Find a Supabase auth user by email by paginating through all pages.
 * Returns the user object or null if not found.
 */
async function findSupabaseUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(`Failed to list users (page ${page}): ${error.message}`);

    const found = data.users.find((u) => u.email === email);
    if (found) return { id: found.id, email: found.email ?? email };

    // If we received fewer results than requested, we've exhausted all pages
    if (data.users.length < perPage) return null;

    page++;
  }
}

/**
 * Ensure a Supabase auth user exists for the given email.
 * - If the user already exists: resets their password to TEST_PASSWORD and
 *   ensures their email is confirmed so credentials stay deterministic.
 * - If not: creates the user with email_confirm=true.
 * Returns the Supabase UID in both cases.
 */
async function ensureSupabaseUser(
  email: string,
  name: string
): Promise<string> {
  const existing = await findSupabaseUserByEmail(email);

  if (existing) {
    // Reset password to guarantee deterministic credentials
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      existing.id,
      {
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { name },
      }
    );
    if (updateErr) {
      throw new Error(`Failed to reset password for ${email}: ${updateErr.message}`);
    }
    console.log(`  [Supabase] Existing user — password reset: ${email} (${existing.id})`);
    return existing.id;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error) throw new Error(`Failed to create Supabase user ${email}: ${error.message}`);
  if (!data.user) throw new Error(`No user returned for ${email}`);

  console.log(`  [Supabase] Created user: ${email} (${data.user.id})`);
  return data.user.id;
}

async function ensureAppUser(
  openId: string,
  email: string,
  name: string,
  role: "subscriber" | "employee" | "attorney" | "admin"
): Promise<void> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  if (existing.length > 0) {
    const appUser = existing[0];
    if (appUser.role === role && appUser.emailVerified) {
      console.log(`  [DB] App user already correct: ${email} (role: ${role})`);
      return;
    }
    await db
      .update(users)
      .set({ role, emailVerified: true, name, email, updatedAt: new Date() })
      .where(eq(users.openId, openId));
    console.log(
      `  [DB] Updated app user: ${email} (role: ${appUser.role} → ${role})`
    );
    return;
  }

  await db.insert(users).values({
    openId,
    email,
    name,
    role,
    loginMethod: "email",
    emailVerified: true,
    lastSignedIn: new Date(),
  });
  console.log(`  [DB] Created app user: ${email} (role: ${role})`);
}

async function main() {
  console.log("=== Seeding test users ===\n");
  console.log(`Password for all test users: ${TEST_PASSWORD}\n`);

  for (const testUser of TEST_USERS) {
    console.log(`\n→ ${testUser.role.toUpperCase()}: ${testUser.email}`);
    const openId = await ensureSupabaseUser(testUser.email, testUser.name);
    await ensureAppUser(openId, testUser.email, testUser.name, testUser.role);
    console.log(`  ✓ Done`);
  }

  console.log("\n=== All test users seeded ===\n");
  console.log("Credentials:");
  for (const u of TEST_USERS) {
    console.log(`  ${u.role.padEnd(12)} ${u.email}  /  ${TEST_PASSWORD}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
