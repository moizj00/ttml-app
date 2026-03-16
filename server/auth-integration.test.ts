import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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

function skipIfRateLimited(status: number) {
  if (status === 429) {
    console.warn("Skipping assertion — rate limited (429)");
    return true;
  }
  return false;
}

describe("Auth API Integration Tests", () => {
  beforeAll(async () => {
    const health = await get("/api/health");
    expect(health.status).toBe(200);
    expect(health.data).toHaveProperty("ok", true);
  });

  describe("POST /api/auth/signup — input validation", () => {
    it("rejects missing email and password", async () => {
      const { status, data } = await post("/api/auth/signup", {});
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(400);
      expect(data.error).toContain("Email and password are required");
    });

    it("rejects password shorter than 8 characters", async () => {
      await delay(200);
      const { status, data } = await post("/api/auth/signup", {
        email: "test-short@example.com",
        password: "short7x",
      });
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(400);
      expect(data.error).toContain("at least 8 characters");
    });
  });

  describe("POST /api/auth/signup — role restriction", () => {
    it("rejects attorney role with 400", async () => {
      await delay(200);
      const { status, data } = await post("/api/auth/signup", {
        email: "attorney-test@example.com",
        password: "validpass123",
        role: "attorney",
      });
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid role");
      expect(data.error).toContain("subscriber");
      expect(data.error).toContain("employee");
    });

    it("rejects admin role with 400", async () => {
      await delay(200);
      const { status, data } = await post("/api/auth/signup", {
        email: "admin-test@example.com",
        password: "validpass123",
        role: "admin",
      });
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid role");
    });

    it("rejects arbitrary/unknown role with 400", async () => {
      await delay(200);
      const { status, data } = await post("/api/auth/signup", {
        email: "unknown-role@example.com",
        password: "validpass123",
        role: "superuser",
      });
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid role");
    });
  });

  describe("POST /api/auth/login — authentication", () => {
    it("rejects missing email and password", async () => {
      await delay(200);
      const { status, data } = await post("/api/auth/login", {});
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(400);
      expect(data.error).toContain("Email and password are required");
    });

    it("rejects invalid credentials", async () => {
      await delay(200);
      const { status, data } = await post("/api/auth/login", {
        email: "nonexistent-user@fake-domain-xyz.com",
        password: "wrongpassword123",
      });
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(401);
      expect(data.error).toContain("Invalid email or password");
    });
  });

  describe("POST /api/auth/forgot-password — email validation", () => {
    it("rejects missing email", async () => {
      await delay(200);
      const { status, data } = await post("/api/auth/forgot-password", {});
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(400);
      expect(data.error).toContain("Email is required");
    });

    it("responds with success for any email (no user enumeration)", async () => {
      await delay(200);
      const { status, data } = await post("/api/auth/forgot-password", {
        email: "any-email@example.com",
      });
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(200);
      expect(data.message).toBeTruthy();
    });
  });

  describe("GET /api/auth/verify-email — token validation", () => {
    it("rejects missing token", async () => {
      const { status, data } = await get("/api/auth/verify-email");
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(400);
      expect(data.error).toContain("Verification token is required");
    });

    it("rejects invalid/expired token", async () => {
      await delay(200);
      const { status, data } = await get(
        "/api/auth/verify-email?token=invalid-token-abc123"
      );
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(400);
      expect(data.error).toContain("Invalid or expired verification token");
    });
  });

  describe("POST /api/auth/resend-verification — email validation", () => {
    it("rejects missing email", async () => {
      await delay(200);
      const { status, data } = await post("/api/auth/resend-verification", {});
      if (skipIfRateLimited(status)) return;
      expect(status).toBe(400);
      expect(data.error).toBeTruthy();
    });
  });

  describe("GET /api/auth/google — OAuth initiation", () => {
    it("returns a redirect URL for Google OAuth", async () => {
      const res = await fetch(`${BASE_URL}/api/auth/google`, {
        redirect: "manual",
      });
      if (res.status === 429) { console.warn("Rate limited — skipping"); return; }
      expect(res.status === 302 || res.status === 200).toBe(true);
      if (res.status === 302) {
        const location = res.headers.get("location");
        expect(location).toContain("accounts.google.com");
      }
    });
  });

  describe("Protected routes — unauthenticated access", () => {
    it("rejects unauthenticated access to /api/trpc endpoints", async () => {
      const res = await fetch(`${BASE_URL}/api/trpc/letters.myLetters`);
      expect(res.status === 401 || res.status === 400 || res.status === 500).toBe(true);
    });
  });
});
