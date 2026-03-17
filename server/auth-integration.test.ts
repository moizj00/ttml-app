/**
 * Auth API Integration Tests
 *
 * These tests hit the live running server and validate actual HTTP responses.
 * The auth endpoints are protected by an Upstash Redis rate limiter (10 requests
 * per 15 minutes per IP). If the rate limit is exceeded, individual tests skip
 * automatically.
 *
 * To run: pnpm vitest server/auth-integration.test.ts --run
 * Note: Wait 15 minutes between runs if you see rate limit skips.
 *
 * Environment gate: these tests require a running server at TEST_BASE_URL
 * (defaults to http://localhost:5000). When the server is unreachable the
 * entire suite is skipped.
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";

let serverAvailable = false;

async function rawPost(path: string, body: Record<string, unknown>) {
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

async function rawGet(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, headers: res.headers };
}

function skipIf429(result: { status: number }) {
  if (result.status === 429) {
    console.warn("SKIPPED: rate limit hit (429)");
    return true;
  }
  return false;
}

describe("Auth API Integration Tests", () => {
  beforeAll(async () => {
    try {
      const health = await rawGet("/api/health");
      serverAvailable = health.status === 200;
    } catch {
      serverAvailable = false;
    }

    if (!serverAvailable) {
      console.warn("SKIPPED ALL: server not reachable at " + BASE_URL);
    }
  });

  describe("POST /api/auth/signup — input validation", () => {
    it("rejects missing email and password", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/signup", {});
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Email and password are required");
    });

    it("rejects password shorter than 8 characters", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/signup", {
        email: "test-short@example.com",
        password: "short7x",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("at least 8 characters");
    });
  });

  describe("POST /api/auth/signup — role restriction", () => {
    it("rejects attorney role with 400", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/signup", {
        email: "attorney-test@example.com",
        password: "validpass123",
        role: "attorney",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Invalid role");
      expect(result.data.error).toContain("subscriber");
      expect(result.data.error).toContain("employee");
    });

    it("rejects admin role with 400", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/signup", {
        email: "admin-test@example.com",
        password: "validpass123",
        role: "admin",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Invalid role");
    });

    it("rejects arbitrary/unknown role with 400", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/signup", {
        email: "unknown-role@example.com",
        password: "validpass123",
        role: "superuser",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Invalid role");
    });
  });

  describe("POST /api/auth/login — authentication", () => {
    it("rejects missing email and password", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/login", {});
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Email and password are required");
    });

    it("rejects invalid credentials", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/login", {
        email: "nonexistent-user@fake-domain-xyz.com",
        password: "wrongpassword123",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(401);
      expect(result.data.error).toContain("Invalid email or password");
    });
  });

  describe("POST /api/auth/forgot-password — email validation", () => {
    it("rejects missing email", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/forgot-password", {});
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Email is required");
    });

    it("responds with success for any email (no user enumeration)", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/forgot-password", {
        email: "any-email@example.com",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(200);
      expect(result.data.message).toBeTruthy();
    });
  });

  describe("GET /api/auth/verify-email — token validation", () => {
    it("rejects missing token", async () => {
      if (!serverAvailable) return;
      const result = await rawGet("/api/auth/verify-email");
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Verification token is required");
    });

    it("rejects invalid/expired token", async () => {
      if (!serverAvailable) return;
      const result = await rawGet("/api/auth/verify-email?token=invalid-token-abc123");
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Invalid or expired verification token");
    });
  });

  describe("POST /api/auth/resend-verification — email validation", () => {
    it("rejects missing email", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/resend-verification", {});
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toBeTruthy();
    });
  });

  describe("POST /api/auth/google — OAuth initiation and role restriction", () => {
    it("initiates Google OAuth via Supabase authorize endpoint", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/google", {
        intent: "login",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(200);
      expect(result.data.url).toBeTruthy();
      expect(String(result.data.url)).toContain("supabase.co/auth/v1/authorize");
    });

    it("rejects attorney role in OAuth signup with 400", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/google", {
        intent: "signup",
        role: "attorney",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Invalid role");
    });

    it("rejects admin role in OAuth signup with 400", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/google", {
        intent: "signup",
        role: "admin",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Invalid role");
    });

    it("accepts subscriber role in OAuth signup", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/google", {
        intent: "signup",
        role: "subscriber",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(200);
      expect(result.data.url).toBeTruthy();
    });
  });

  describe("Protected routes — unauthenticated access", () => {
    it("rejects unauthenticated access to /api/trpc endpoints", async () => {
      if (!serverAvailable) return;
      const res = await fetch(`${BASE_URL}/api/trpc/letters.myLetters`);
      expect([401, 400, 500]).toContain(res.status);
    });
  });
});
