import { describe, it, expect } from "vitest";

const SUPABASE_REALTIME_CONFIGURED = !!(
  process.env.VITE_SUPABASE_URL &&
  (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY) &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe.skipIf(!SUPABASE_REALTIME_CONFIGURED)("Supabase Realtime Configuration", () => {
  it("VITE_SUPABASE_URL is set and valid", () => {
    const url = process.env.VITE_SUPABASE_URL;
    expect(url).toBeDefined();
    expect(url).toMatch(/^https:\/\/.*\.supabase\.co$/);
  });

  it("VITE_SUPABASE_PUBLISHABLE_KEY (or anon key) is set and has correct format", () => {
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    expect(key).toBeDefined();
    // Accept both modern publishable key (sb_publishable_*) and legacy anon JWT key (eyJ*)
    const isPublishable = key!.startsWith("sb_publishable_");
    const isLegacyAnon = key!.startsWith("eyJ"); // JWT format
    expect(isPublishable || isLegacyAnon).toBe(true);
    expect(key!.length).toBeGreaterThan(20);
  });

  it("Supabase REST API is reachable with publishable key", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    // The publishable key should be able to reach the REST API
    // Note: /rest/v1/ root requires admin role — use a table query instead
    const response = await fetch(`${url}/rest/v1/users?select=id&limit=1`, {
      headers: {
        "apikey": key!,
        "Authorization": `Bearer ${key!}`,
      },
    });
    // 200 = key is valid and table exists, 401 = bad key
    expect(response.status).toBe(200);
  });

  it("Supabase Realtime endpoint is reachable", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    // Check that the realtime endpoint responds
    const realtimeUrl = `${url}/realtime/v1`;
    const response = await fetch(realtimeUrl, { method: "HEAD" }).catch(() => null);
    // Realtime uses WebSocket, so HTTP might return various codes, but should not be ECONNREFUSED
    expect(response).not.toBeNull();
  });

  describe("RLS Helper Functions", () => {
    it("app_user_id function exists in database", async () => {
      const url = process.env.VITE_SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      
      const response = await fetch(`${url}/rest/v1/rpc/app_user_id`, {
        method: "POST",
        headers: {
          "apikey": key!,
          "Authorization": `Bearer ${key!}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      // Should return 200 (null result) or 204, not 404
      expect([200, 204]).toContain(response.status);
    });

    it("is_app_admin function exists in database", async () => {
      const url = process.env.VITE_SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      
      const response = await fetch(`${url}/rest/v1/rpc/is_app_admin`, {
        method: "POST",
        headers: {
          "apikey": key!,
          "Authorization": `Bearer ${key!}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect([200, 204]).toContain(response.status);
    });

    it("safe_status_transition function exists in database", async () => {
      const url = process.env.VITE_SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      
      // Just check the function exists (will fail with bad params, but not 404)
      const response = await fetch(`${url}/rest/v1/rpc/safe_status_transition`, {
        method: "POST",
        headers: {
          "apikey": key!,
          "Authorization": `Bearer ${key!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_letter_id: 0, p_new_status: "submitted" }),
      });
      // 200 or error response (not 404 = function not found)
      expect(response.status).not.toBe(404);
    });

    it("check_and_deduct_allowance function exists in database", async () => {
      const url = process.env.VITE_SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      
      const response = await fetch(`${url}/rest/v1/rpc/check_and_deduct_allowance`, {
        method: "POST",
        headers: {
          "apikey": key!,
          "Authorization": `Bearer ${key!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_user_id: 0 }),
      });
      expect(response.status).not.toBe(404);
    });
  });

  describe("Database Tables via REST", () => {
    it("letter_requests table is accessible", async () => {
      const url = process.env.VITE_SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      
      const response = await fetch(`${url}/rest/v1/letter_requests?select=id&limit=1`, {
        headers: {
          "apikey": key!,
          "Authorization": `Bearer ${key!}`,
        },
      });
      // 200 = table exists (may return empty array due to RLS)
      expect(response.status).toBe(200);
    });

    it("audit_log table is accessible", async () => {
      const url = process.env.VITE_SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      
      const response = await fetch(`${url}/rest/v1/audit_log?select=id&limit=1`, {
        headers: {
          "apikey": key!,
          "Authorization": `Bearer ${key!}`,
        },
      });
      expect(response.status).toBe(200);
    });
  });
});
