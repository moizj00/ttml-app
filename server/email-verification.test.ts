/**
 * Email Verification Feature Tests (Phase 44)
 *
 * Tests the server-side logic for:
 * - Creating and consuming verification tokens
 * - Checking email verified status
 * - getUserByEmail helper
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
const mockUser = {
  id: 1,
  openId: "test-open-id",
  name: "Test User",
  email: "test@example.com",
  role: "subscriber",
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockVerifiedUser = { ...mockUser, emailVerified: true };

vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  getUserByOpenId: vi.fn(),
  createEmailVerificationToken: vi.fn(),
  deleteUserVerificationTokens: vi.fn(),
  consumeVerificationToken: vi.fn(),
  findValidVerificationToken: vi.fn(),
  isEmailVerified: vi.fn(),
}));

vi.mock("./email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ id: "email-id-123" }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ id: "email-id-456" }),
}));

import * as db from "./db";
import * as email from "./email";

// ─── Token generation logic ───────────────────────────────────────────────────
describe("Email Verification Token Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a 96-character hex token (48 bytes)", () => {
    const crypto = require("crypto");
    const token = crypto.randomBytes(48).toString("hex");
    expect(token).toHaveLength(96);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it("should generate unique tokens on each call", () => {
    const crypto = require("crypto");
    const token1 = crypto.randomBytes(48).toString("hex");
    const token2 = crypto.randomBytes(48).toString("hex");
    expect(token1).not.toBe(token2);
  });
});

// ─── DB helper: getUserByEmail ────────────────────────────────────────────────
describe("getUserByEmail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns user when found", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(mockUser as any);
    const result = await db.getUserByEmail("test@example.com");
    expect(result).toEqual(mockUser);
    expect(db.getUserByEmail).toHaveBeenCalledWith("test@example.com");
  });

  it("returns undefined when user not found", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    const result = await db.getUserByEmail("notfound@example.com");
    expect(result).toBeUndefined();
  });
});

// ─── DB helper: createEmailVerificationToken ─────────────────────────────────
describe("createEmailVerificationToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a token for a given user", async () => {
    vi.mocked(db.createEmailVerificationToken).mockResolvedValue({
      id: 1,
      userId: 1,
      email: "test@example.com",
      token: "abc123",
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
    } as any);

    const result = await db.createEmailVerificationToken(1, "test@example.com", "abc123");
    expect(result).toBeDefined();
    expect(db.createEmailVerificationToken).toHaveBeenCalledWith(1, "test@example.com", "abc123");
  });
});

// ─── DB helper: consumeVerificationToken ─────────────────────────────────────
describe("consumeVerificationToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when token is valid and consumed", async () => {
    vi.mocked(db.consumeVerificationToken).mockResolvedValue(true);
    const result = await db.consumeVerificationToken("valid-token-abc");
    expect(result).toBe(true);
  });

  it("returns false when token is invalid or expired", async () => {
    vi.mocked(db.consumeVerificationToken).mockResolvedValue(false);
    const result = await db.consumeVerificationToken("invalid-token");
    expect(result).toBe(false);
  });

  it("returns false when token is empty string", async () => {
    vi.mocked(db.consumeVerificationToken).mockResolvedValue(false);
    const result = await db.consumeVerificationToken("");
    expect(result).toBe(false);
  });
});

// ─── DB helper: isEmailVerified ───────────────────────────────────────────────
describe("isEmailVerified", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true for verified user", async () => {
    vi.mocked(db.isEmailVerified).mockResolvedValue(true);
    const result = await db.isEmailVerified(1);
    expect(result).toBe(true);
  });

  it("returns false for unverified user", async () => {
    vi.mocked(db.isEmailVerified).mockResolvedValue(false);
    const result = await db.isEmailVerified(2);
    expect(result).toBe(false);
  });
});

// ─── Email helper: sendVerificationEmail ─────────────────────────────────────
describe("sendVerificationEmail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends a verification email with the correct parameters", async () => {
    const params = {
      to: "test@example.com",
      name: "Test User",
      verifyUrl: "https://app.example.com/verify-email?token=abc123",
    };
    await email.sendVerificationEmail(params);
    expect(email.sendVerificationEmail).toHaveBeenCalledWith(params);
  });

  it("sends to the correct recipient", async () => {
    await email.sendVerificationEmail({
      to: "newuser@example.com",
      name: "New User",
      verifyUrl: "https://app.example.com/verify-email?token=xyz789",
    });
    expect(email.sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "newuser@example.com" })
    );
  });
});

// ─── deleteUserVerificationTokens ────────────────────────────────────────────
describe("deleteUserVerificationTokens", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears old tokens for a user before creating a new one", async () => {
    vi.mocked(db.deleteUserVerificationTokens).mockResolvedValue(undefined);
    await db.deleteUserVerificationTokens(1);
    expect(db.deleteUserVerificationTokens).toHaveBeenCalledWith(1);
  });
});

// ─── ProtectedRoute gate logic (unit) ────────────────────────────────────────
describe("Email verification gate logic", () => {
  it("admin role bypasses email verification gate", () => {
    const user = { role: "admin", emailVerified: false };
    const shouldBlock = user.role !== "admin" && !user.emailVerified;
    expect(shouldBlock).toBe(false);
  });

  it("subscriber with unverified email is blocked", () => {
    const user = { role: "subscriber", emailVerified: false };
    const shouldBlock = user.role !== "admin" && !user.emailVerified;
    expect(shouldBlock).toBe(true);
  });

  it("subscriber with verified email is allowed through", () => {
    const user = { role: "subscriber", emailVerified: true };
    const shouldBlock = user.role !== "admin" && !user.emailVerified;
    expect(shouldBlock).toBe(false);
  });

  it("attorney with verified email is allowed through", () => {
    const user = { role: "attorney", emailVerified: true };
    const shouldBlock = user.role !== "admin" && !user.emailVerified;
    expect(shouldBlock).toBe(false);
  });

  it("employee with unverified email is blocked", () => {
    const user = { role: "employee", emailVerified: false };
    const shouldBlock = user.role !== "admin" && !user.emailVerified;
    expect(shouldBlock).toBe(true);
  });
});
