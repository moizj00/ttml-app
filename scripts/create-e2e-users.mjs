import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function createUser(email, password, role) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `E2E ${role}` }
  });
  
  if (error) {
    if (error.message.includes('already registered')) {
        console.log(`${email} already registered, attempting password update`);
        const { data: users } = await supabase.auth.admin.listUsers();
        const user = users.users.find(u => u.email === email);
        if (user) {
            const { error: resetErr } = await supabase.auth.admin.updateUserById(user.id, { password });
            if (resetErr) console.error("Failed to update password:", resetErr);
            else console.log(`Updated password for ${email}`);
        }
    } else {
        console.error(`Error creating ${email}:`, error);
    }
  } else {
    console.log(`Created ${email}`);
  }
}

await createUser("test.subscriber@e2e.ttml.test", "TestPassword123!", "Subscriber");
await createUser("test.attorney@e2e.ttml.test", "TestAttorney123!", "Attorney");
await createUser("test.admin@e2e.ttml.test", "TestAdmin123!", "Admin");
