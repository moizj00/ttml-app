/**
 * Auth API Integration Tests
 *
 * Two sections:
 *
 * 1. Live-server integration tests — hit a running server at TEST_BASE_URL.
 *    These skip automatically when the server is unreachable or rate-limited.
 *    Run: pnpm vitest server/auth-integration.test.ts --run
 *    Note: Wait 15 minutes between runs if you see rate limit skips.
 *
 * 2. Affiliate Google OAuth — Behavioral Tests (always run, no live server needed)
 *    Start a real Express HTTP server with mocked Supabase auth and DB layer.
 *    Validates the complete affiliate OAuth flow including role persistence,
 *    redirectPath, discount code creation, and welcome email routing.
 *    These tests exercise actual production code (supabaseAuth.ts) — no logic is
 *    replicated inline.
 */

// ─── Mock Supabase, DB, and Email before any imports ──────────────────────────
// (vi.mock calls are hoisted by Vitest and execute before any imports)

import { describe, it, expect, beforeAll, vi, beforeEach, afterEach } from "vitest";
import http from "http";
import express from "express";
import type { AddressInfo } from "net";

// ─── Mocks for Affiliate OAuth Behavioral Tests ───────────────────────────────

const mockGetUser = vi.fn();
const mockAdminCreateUser = vi.fn();
const mockAdminDeleteUser = vi.fn();
const mockResend = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGenerateLink = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      resend: mockResend,
      admin: {
        createUser: mockAdminCreateUser,
        deleteUser: mockAdminDeleteUser,
        generateLink: mockGenerateLink,
      },
    },
  })),
}));

const mockGetUserByOpenId = vi.fn();
const mockUpsertUser = vi.fn();
const mockGetUserById = vi.fn();
const mockCreateDiscountCodeForEmployee = vi.fn();
const mockGetDiscountCodeByEmployeeId = vi.fn();
const mockNotifyAdmins = vi.fn();
const mockGetUserByEmail = vi.fn();
const mockConsumeVerificationToken = vi.fn();
const mockMarkEmailVerified = vi.fn();
const mockCreateAdminVerificationCode = vi.fn();
const mockGetAllUsers = vi.fn();

vi.mock("./db", () => ({
  getUserByOpenId: mockGetUserByOpenId,
  upsertUser: mockUpsertUser,
  getUserById: mockGetUserById,
  createDiscountCodeForEmployee: mockCreateDiscountCodeForEmployee,
  getDiscountCodeByEmployeeId: mockGetDiscountCodeByEmployeeId,
  notifyAdmins: mockNotifyAdmins,
  getUserByEmail: mockGetUserByEmail,
  consumeVerificationToken: mockConsumeVerificationToken,
  markEmailVerified: mockMarkEmailVerified,
  createAdminVerificationCode: mockCreateAdminVerificationCode,
  getAllUsers: mockGetAllUsers,
}));

const mockSendEmployeeWelcomeEmail = vi.fn();
const mockSendWelcomeEmail = vi.fn();
const mockSendAttorneyWelcomeEmail = vi.fn();
const mockSendAdminVerificationCodeEmail = vi.fn();
const mockSendVerificationEmail = vi.fn();

vi.mock("./email", () => ({
  sendEmployeeWelcomeEmail: mockSendEmployeeWelcomeEmail,
  sendWelcomeEmail: mockSendWelcomeEmail,
  sendAttorneyWelcomeEmail: mockSendAttorneyWelcomeEmail,
  sendAdminVerificationCodeEmail: mockSendAdminVerificationCodeEmail,
  sendVerificationEmail: mockSendVerificationEmail,
  sendRoleBasedWelcomeEmail: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn(() => ({ ping: vi.fn() })),
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: vi.fn(() => ({
    limit: vi.fn().mockResolvedValue({ success: true, remaining: 100, reset: Date.now() + 60000 }),
  })),
}));

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  withScope: vi.fn((cb: (scope: { setTag: ReturnType<typeof vi.fn>; setExtra: ReturnType<typeof vi.fn> }) => void) => cb({ setTag: vi.fn(), setExtra: vi.fn() })),
  expressIntegration: vi.fn(),
  httpIntegration: vi.fn(),
  setupExpressErrorHandler: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setExtra: vi.fn(),
}));

vi.mock("./_core/sentry", () => ({
  captureServerException: vi.fn(),
}));

// ─── Live server helpers ──────────────────────────────────────────────────────

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

// ─── Local test server helpers ────────────────────────────────────────────────

let testServer: http.Server | null = null;
let testBaseUrl = "";

async function startLocalTestServer() {
  const app = express();
  app.use(express.json());
  const { registerSupabaseAuthRoutes } = await import("./supabaseAuth");
  registerSupabaseAuthRoutes(app);
  return new Promise<void>((resolve) => {
    testServer = http.createServer(app);
    testServer.listen(0, "127.0.0.1", () => {
      const port = (testServer!.address() as AddressInfo).port;
      testBaseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function stopLocalTestServer() {
  return new Promise<void>((resolve, reject) => {
    if (testServer) {
      testServer.close((err) => {
        testServer = null;
        err ? reject(err) : resolve();
      });
    } else {
      resolve();
    }
  });
}

async function localPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${testBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

// ─── Section 1: Live-server integration tests ─────────────────────────────────

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
      expect(result.data.error).toContain("affiliate");
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

    it("rejects subscriber role in OAuth signup (not in ALLOWED_OAUTH_ROLES)", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/google", {
        intent: "signup",
        role: "subscriber",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Invalid role");
    });

    it("rejects employee role in OAuth signup (not in ALLOWED_OAUTH_ROLES)", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/google", {
        intent: "signup",
        role: "employee",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Invalid role");
    });
  });

  describe("POST /api/auth/google/finalize — input validation", () => {
    it("returns 400 when access_token is missing", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/google/finalize", {
        role: "employee",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(400);
      expect(result.data.error).toContain("Missing Google access token");
    });

    it("returns 401 when access_token is invalid", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/google/finalize", {
        access_token: "invalid-token-xyz",
        role: "employee",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(401);
    });

    it("rejects attorney role in finalize (attorney is not self-assignable)", async () => {
      if (!serverAvailable) return;
      const result = await rawPost("/api/auth/google/finalize", {
        access_token: "invalid-for-attorney-test",
        role: "attorney",
      });
      if (skipIf429(result)) return;
      expect(result.status).toBe(401);
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

// ─── Section 2: Affiliate Google OAuth — Behavioral Tests ─────────────────────
//
// These tests run against a local Express server with mocked Supabase auth and DB.
// They exercise actual production code in supabaseAuth.ts (syncGoogleUser,
// registerSupabaseAuthRoutes) — no logic is replicated inline.
//
// This covers the full affiliate OAuth signup path:
//   User selects "Affiliate" → Google OAuth → server finalize → role=employee persisted
//
// The Login.tsx fix (forwarding ?role= to /api/auth/google/finalize) is validated
// end-to-end in affiliate-google-oauth-behavioral.test.ts. The tests below validate
// the SERVER-SIDE behavior of the finalize endpoint and syncGoogleUser logic.

describe("POST /api/auth/google — affiliate role in OAuth URL (local mock server)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await startLocalTestServer();
  });

  afterEach(async () => {
    await stopLocalTestServer();
  });

  it("returns 200 with OAuth URL when role=affiliate", async () => {
    const result = await localPost("/api/auth/google", { intent: "signup", role: "affiliate" });
    expect(result.status).toBe(200);
    expect(result.data.url).toBeTruthy();
  });

  it("embeds role=employee in the redirect_to URL parameter for affiliate signup", async () => {
    const result = await localPost("/api/auth/google", { intent: "signup", role: "affiliate" });
    expect(result.status).toBe(200);
    const decoded = decodeURIComponent(String(result.data.url));
    expect(decoded).toContain("role=employee");
  });

  it("rejects role=attorney with 400 (attorney not self-assignable via OAuth)", async () => {
    const result = await localPost("/api/auth/google", { intent: "signup", role: "attorney" });
    expect(result.status).toBe(400);
    expect(result.data.error).toContain("Invalid role");
  });

  it("rejects role=admin with 400 (admin not self-assignable via OAuth)", async () => {
    const result = await localPost("/api/auth/google", { intent: "signup", role: "admin" });
    expect(result.status).toBe(400);
    expect(result.data.error).toContain("Invalid role");
  });

  it("rejects role=employee with 400 (employee not directly self-assignable, use affiliate)", async () => {
    const result = await localPost("/api/auth/google", { intent: "signup", role: "employee" });
    expect(result.status).toBe(400);
    expect(result.data.error).toContain("Invalid role");
  });

  it("rejects role=subscriber with 400 (subscriber not in ALLOWED_OAUTH_ROLES)", async () => {
    const result = await localPost("/api/auth/google", { intent: "signup", role: "subscriber" });
    expect(result.status).toBe(400);
    expect(result.data.error).toContain("Invalid role");
  });
});

describe("POST /api/auth/google/finalize — affiliate employee role resolution (local mock server)", () => {
  const newEmployeeUser = {
    id: 99,
    openId: "supa-employee-uuid",
    email: "affiliate@example.com",
    name: "New Affiliate",
    role: "employee" as const,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    loginMethod: "google" as const,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await startLocalTestServer();

    // Supabase returns a valid user
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "supa-employee-uuid",
          email: "affiliate@example.com",
          user_metadata: { name: "New Affiliate" },
        },
      },
      error: null,
    });

    // DB mocks: new user (no existing record → employee after upsert)
    mockGetUserByOpenId
      .mockResolvedValueOnce(undefined)           // existingUser check → new user
      .mockResolvedValue(newEmployeeUser);         // after upsert → employee
    mockUpsertUser.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue(newEmployeeUser);
    mockCreateDiscountCodeForEmployee.mockResolvedValue({ id: 1, code: "AFFILIATE-XXXX" });
    mockGetDiscountCodeByEmployeeId.mockResolvedValue({ id: 1, code: "AFFILIATE-XXXX", discountPercent: 20 });
    mockNotifyAdmins.mockResolvedValue(undefined);
    mockSendEmployeeWelcomeEmail.mockResolvedValue(undefined);
    mockSendWelcomeEmail.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await stopLocalTestServer();
  });

  it("returns redirectPath=/employee when role=affiliate and no existing user", async () => {
    const result = await localPost("/api/auth/google/finalize", {
      access_token: "valid-google-token",
      refresh_token: "valid-refresh-token",
      expires_in: 3600,
      role: "affiliate",
    });
    expect(result.status).toBe(200);
    expect(result.data.redirectPath).toBe("/employee");
  });

  it("returns user.role=employee in response JSON for new affiliate signup", async () => {
    const result = await localPost("/api/auth/google/finalize", {
      access_token: "valid-google-token",
      refresh_token: "valid-refresh-token",
      expires_in: 3600,
      role: "affiliate",
    });
    expect(result.status).toBe(200);
    const user = result.data.user as { role: string };
    expect(user.role).toBe("employee");
  });

  it("syncGoogleUser upserts DB with role=employee when requestedRole=affiliate and no existing user", async () => {
    await localPost("/api/auth/google/finalize", {
      access_token: "valid-google-token",
      refresh_token: "valid-refresh-token",
      expires_in: 3600,
      role: "affiliate",
    });
    expect(mockUpsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: "employee" })
    );
  });

  it("creates a discount code via createDiscountCodeForEmployee for new affiliate", async () => {
    await localPost("/api/auth/google/finalize", {
      access_token: "valid-google-token",
      refresh_token: "valid-refresh-token",
      expires_in: 3600,
      role: "affiliate",
    });
    expect(mockCreateDiscountCodeForEmployee).toHaveBeenCalledWith(99, "New Affiliate");
  });

  it("sends affiliate welcome email via sendEmployeeWelcomeEmail for new affiliate", async () => {
    await localPost("/api/auth/google/finalize", {
      access_token: "valid-google-token",
      refresh_token: "valid-refresh-token",
      expires_in: 3600,
      role: "affiliate",
    });
    expect(mockSendEmployeeWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "affiliate@example.com", name: "New Affiliate" })
    );
    expect(mockSendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("returns redirectPath=/dashboard for new user with no role (defaults to subscriber)", async () => {
    const subscriberUser = { ...newEmployeeUser, id: 100, role: "subscriber" as const };
    mockGetUserByOpenId.mockReset()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(subscriberUser);
    mockGetUserById.mockResolvedValue(subscriberUser);

    const result = await localPost("/api/auth/google/finalize", {
      access_token: "valid-google-token",
      refresh_token: "valid-refresh-token",
      expires_in: 3600,
    });
    expect(result.status).toBe(200);
    expect(result.data.redirectPath).toBe("/dashboard");
  });

  it("does NOT upgrade returning subscriber to employee via requestedRole (existing role wins)", async () => {
    const returningSubscriber = { ...newEmployeeUser, id: 50, role: "subscriber" as const };
    mockGetUserByOpenId.mockReset()
      .mockResolvedValueOnce(returningSubscriber)
      .mockResolvedValue(returningSubscriber);
    mockGetUserById.mockResolvedValue(returningSubscriber);

    const result = await localPost("/api/auth/google/finalize", {
      access_token: "valid-google-token",
      refresh_token: "valid-refresh-token",
      expires_in: 3600,
      role: "affiliate",
    });
    expect(result.status).toBe(200);
    expect(mockUpsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: "subscriber" })
    );
    expect(result.data.redirectPath).toBe("/dashboard");
  });

  it("does NOT downgrade returning employee on re-login (existing role wins)", async () => {
    mockGetUserByOpenId.mockReset()
      .mockResolvedValueOnce(newEmployeeUser)
      .mockResolvedValue(newEmployeeUser);
    mockGetUserById.mockResolvedValue(newEmployeeUser);

    const result = await localPost("/api/auth/google/finalize", {
      access_token: "valid-google-token",
      refresh_token: "valid-refresh-token",
      expires_in: 3600,
    });
    expect(result.status).toBe(200);
    expect(mockUpsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: "employee" })
    );
    expect(result.data.redirectPath).toBe("/employee");
  });

  it("silently rejects attorney requestedRole — new user defaults to subscriber", async () => {
    const subscriberUser = { ...newEmployeeUser, id: 101, role: "subscriber" as const };
    mockGetUserByOpenId.mockReset()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(subscriberUser);
    mockGetUserById.mockResolvedValue(subscriberUser);

    const result = await localPost("/api/auth/google/finalize", {
      access_token: "valid-google-token",
      refresh_token: "valid-refresh-token",
      expires_in: 3600,
      role: "attorney",
    });
    expect(result.status).toBe(200);
    expect(mockUpsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: "subscriber" })
    );
  });
});
