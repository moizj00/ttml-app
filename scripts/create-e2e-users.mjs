import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function createUser(email, password, role) {
  // 1. Create or update auth user
  const { data: listData } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  const existing = listData?.users?.find(u => u.email === email);

  let authUserId;
  if (existing) {
    console.log(`${email} already exists in auth, updating password...`);
    const { error: upErr } = await supabase.auth.admin.updateUserById(
      existing.id,
      {
        password,
        email_confirm: true,
      }
    );
    if (upErr) {
      console.error(`  Failed to update password:`, upErr.message);
      return;
    }
    authUserId = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `E2E ${role}` },
    });
    if (error) {
      console.error(`Error creating ${email}:`, error.message);
      return;
    }
    authUserId = data.user.id;
    console.log(`Created auth user: ${email} (${authUserId})`);
  }

  // 2. Upsert into public.users with the correct role
  const { error: dbErr } = await supabase.from("users").upsert(
    {
      open_id: authUserId,
      email,
      name: `E2E ${role}`,
      login_method: "email",
      role: role.toLowerCase(),
      is_active: true,
      email_verified: true,
    },
    { onConflict: "open_id" }
  );
  if (dbErr) {
    console.error(`  DB upsert failed for ${email}:`, dbErr.message);
  } else {
    console.log(`  ✓ public.users synced — role="${role.toLowerCase()}"`);
  }
}

await createUser(
  "test.subscriber@e2e.ttml.test",
  "TestSubscriber123!",
  "subscriber"
);
await createUser("test.attorney@e2e.ttml.test", "TestAttorney123!", "attorney");
await createUser("test.admin@e2e.ttml.test", "TestAdmin123!", "admin");
console.log("\nAll E2E users ready.");
