import { describe, it, expect } from "vitest";

const SUPABASE_CONFIGURED = !!(
  (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe.skipIf(!SUPABASE_CONFIGURED)("Supabase Auth Configuration", () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  it("should have SUPABASE_URL configured", () => {
    expect(supabaseUrl).toBeDefined();
    expect(supabaseUrl).toContain("supabase.co");
  });

  it("should have SUPABASE_SERVICE_ROLE_KEY configured", () => {
    expect(serviceRoleKey).toBeDefined();
    expect(serviceRoleKey!.length).toBeGreaterThan(100);
    // Service role key is a JWT
    expect(serviceRoleKey).toMatch(/^eyJ/);
  });

  it("should have anon/publishable key configured for frontend", () => {
    expect(anonKey).toBeDefined();
    expect(anonKey!.length).toBeGreaterThan(10);
  });

  it("should validate service_role key against Supabase Auth API", async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey!,
      },
    });
    // 200 = valid service_role key with admin access
    expect(response.status).toBe(200);
    const data = await response.json();
    // Should return a users array (even if empty)
    expect(data).toHaveProperty("users");
    expect(Array.isArray(data.users)).toBe(true);
  });

  it("should decode service_role JWT and confirm role", () => {
    const parts = serviceRoleKey!.split(".");
    expect(parts.length).toBe(3);
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    expect(payload.role).toBe("service_role");
    expect(payload.iss).toBe("supabase");
  });
});
