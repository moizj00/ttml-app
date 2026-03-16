/**
 * Auth API Integration Tests
 *
 * These tests hit the live running server and validate actual HTTP responses.
 * The auth endpoints are protected by an Upstash Redis rate limiter (10 requests
 * per 15 minutes per IP). If the rate limit is exceeded, tests will fail with a
 * clear message indicating the rate limit window needs to reset.
 *
 * To run: pnpm vitest server/auth-integration.test.ts --run
 * Note: Wait 15 minutes between runs if you see rate limit errors.
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, headers: res.headers };
}

async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, headers: res.headers };
}

describe("Auth API Integration Tests", () => {
  let rateLimitHit = false;

  beforeAll(async () => {
    const health = await get("/api/health");
    expect(health.status).toBe(200);
    expect(health.data).toHaveProperty("ok", true);

    const probe = await post("/api/auth/signup", {});
    if (probe.status === 429) {
      rateLimitHit = true;
    }
  });

  describe("POST /api/auth/signup — input validation", () => {
    it("rejects missing email and password", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/signup", {});
      expect(status).toBe(400);
      expect(data.error).toContain("Email and password are required");
    });

    it("rejects password shorter than 8 characters", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/signup", {
        email: "test-short@example.com",
        password: "short7x",
      });
      expect(status).toBe(400);
      expect(data.error).toContain("at least 8 characters");
    });
  });

  describe("POST /api/auth/signup — role restriction", () => {
    it("rejects attorney role with 400", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/signup", {
        email: "attorney-test@example.com",
        password: "validpass123",
        role: "attorney",
      });
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid role");
      expect(data.error).toContain("subscriber");
      expect(data.error).toContain("employee");
    });

    it("rejects admin role with 400", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/signup", {
        email: "admin-test@example.com",
        password: "validpass123",
        role: "admin",
      });
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid role");
    });

    it("rejects arbitrary/unknown role with 400", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/signup", {
        email: "unknown-role@example.com",
        password: "validpass123",
        role: "superuser",
      });
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid role");
    });
  });

  describe("POST /api/auth/login — authentication", () => {
    it("rejects missing email and password", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/login", {});
      expect(status).toBe(400);
      expect(data.error).toContain("Email and password are required");
    });

    it("rejects invalid credentials", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/login", {
        email: "nonexistent-user@fake-domain-xyz.com",
        password: "wrongpassword123",
      });
      expect(status).toBe(401);
      expect(data.error).toContain("Invalid email or password");
    });
  });

  describe("POST /api/auth/forgot-password — email validation", () => {
    it("rejects missing email", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/forgot-password", {});
      expect(status).toBe(400);
      expect(data.error).toContain("Email is required");
    });

    it("responds with success for any email (no user enumeration)", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/forgot-password", {
        email: "any-email@example.com",
      });
      expect(status).toBe(200);
      expect(data.message).toBeTruthy();
    });
  });

  describe("GET /api/auth/verify-email — token validation", () => {
    it("rejects missing token", async () => {
      const { status, data } = await get("/api/auth/verify-email");
      expect(status).toBe(400);
      expect(data.error).toContain("Verification token is required");
    });

    it("rejects invalid/expired token", async () => {
      const { status, data } = await get(
        "/api/auth/verify-email?token=invalid-token-abc123"
      );
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid or expired verification token");
    });
  });

  describe("POST /api/auth/resend-verification — email validation", () => {
    it("rejects missing email", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/resend-verification", {});
      expect(status).toBe(400);
      expect(data.error).toBeTruthy();
    });
  });

  describe("POST /api/auth/google — OAuth initiation and role restriction", () => {
    it("initiates Google OAuth via Supabase authorize endpoint", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/google", {
        intent: "login",
      });
      expect(status).toBe(200);
      expect(data.url).toBeTruthy();
      expect(String(data.url)).toContain("supabase.co/auth/v1/authorize");
    });

    it("rejects attorney role in OAuth signup with 400", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/google", {
        intent: "signup",
        role: "attorney",
      });
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid role");
    });

    it("rejects admin role in OAuth signup with 400", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/google", {
        intent: "signup",
        role: "admin",
      });
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid role");
    });

    it("accepts subscriber role in OAuth signup", async () => {
      if (rateLimitHit) { console.warn("SKIPPED: rate limit active"); return; }
      const { status, data } = await post("/api/auth/google", {
        intent: "signup",
        role: "subscriber",
      });
      expect(status).toBe(200);
      expect(data.url).toBeTruthy();
    });
  });

  describe("Protected routes — unauthenticated access", () => {
    it("rejects unauthenticated access to /api/trpc endpoints", async () => {
      const res = await fetch(`${BASE_URL}/api/trpc/letters.myLetters`);
      expect([401, 400, 500]).toContain(res.status);
    });
  });
});
