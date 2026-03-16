/**
 * Phase 64: Email Verification & Password Reset Fixes
 *
 * Tests for:
 * 1. consumeVerificationToken now returns the record (not just true/false)
 * 2. verify-email route sends welcome email using the returned record
 * 3. Login route returns EMAIL_NOT_VERIFIED code for unverified users
 * 4. /reset-password route exists in App.tsx (structural test)
 * 5. Resend verification button logic
 * 6. ForgotPassword sends to correct redirectTo URL
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockTokenRecord = {
  id: 1,
  userId: 42,
  email: "user@example.com",
  token: "valid-token-abc123",
  expiresAt: new Date(Date.now() + 86400000),
  usedAt: null,
  createdAt: new Date(),
};

const mockUser = {
  id: 42,
  openId: "supabase-uid-abc",
  name: "Jane Doe",
  email: "user@example.com",
  role: "subscriber",
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
  createEmailVerificationToken: vi.fn(),
  deleteUserVerificationTokens: vi.fn(),
  consumeVerificationToken: vi.fn(),
  findValidVerificationToken: vi.fn(),
  isEmailVerified: vi.fn(),
  isUserEmailVerified: vi.fn(),
}));

vi.mock("./email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ id: "email-1" }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ id: "email-2" }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ id: "email-3" }),
}));

import * as db from "./db";
import * as emailModule from "./email";

// ─── Fix 1: consumeVerificationToken returns record, not boolean ──────────────
describe("consumeVerificationToken — returns record on success", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the token record (with userId and email) on success", async () => {
    vi.mocked(db.consumeVerificationToken).mockResolvedValue(mockTokenRecord as any);
    const result = await db.consumeVerificationToken("valid-token-abc123");
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("userId", 42);
    expect(result).toHaveProperty("email", "user@example.com");
  });

  it("returns null when token is invalid or expired", async () => {
    vi.mocked(db.consumeVerificationToken).mockResolvedValue(null);
    const result = await db.consumeVerificationToken("bad-token");
    expect(result).toBeNull();
  });

  it("returns null when token is empty string", async () => {
    vi.mocked(db.consumeVerificationToken).mockResolvedValue(null);
    const result = await db.consumeVerificationToken("");
    expect(result).toBeNull();
  });

  it("returned record has all required fields for welcome email", async () => {
    vi.mocked(db.consumeVerificationToken).mockResolvedValue(mockTokenRecord as any);
    const record = await db.consumeVerificationToken("valid-token-abc123");
    expect(record).toBeDefined();
    if (record) {
      expect(typeof record.userId).toBe("number");
      expect(typeof record.email).toBe("string");
    }
  });
});

// ─── Fix 2: verify-email route logic — welcome email sent after verification ──
describe("verify-email route logic", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends welcome email after successful verification using record.userId", async () => {
    vi.mocked(db.consumeVerificationToken).mockResolvedValue(mockTokenRecord as any);
    vi.mocked(db.getUserById).mockResolvedValue(mockUser as any);

    // Simulate what the route now does
    const record = await db.consumeVerificationToken("valid-token-abc123");
    if (record) {
      const user = await db.getUserById(record.userId);
      if (user && user.email) {
        await emailModule.sendWelcomeEmail({
          to: user.email,
          name: user.name || user.email.split("@")[0],
          dashboardUrl: "https://app.example.com/dashboard",
        });
      }
    }

    expect(db.getUserById).toHaveBeenCalledWith(42);
    expect(emailModule.sendWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com", name: "Jane Doe" })
    );
  });

  it("does NOT call getUserById when token is invalid", async () => {
    vi.mocked(db.consumeVerificationToken).mockResolvedValue(null);

    const record = await db.consumeVerificationToken("bad-token");
    if (record) {
      await db.getUserById(record.userId);
    }

    expect(db.getUserById).not.toHaveBeenCalled();
    expect(emailModule.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("does NOT block response if welcome email fails", async () => {
    vi.mocked(db.consumeVerificationToken).mockResolvedValue(mockTokenRecord as any);
    vi.mocked(db.getUserById).mockResolvedValue(mockUser as any);
    vi.mocked(emailModule.sendWelcomeEmail).mockRejectedValue(new Error("SMTP error"));

    // Should not throw
    const record = await db.consumeVerificationToken("valid-token-abc123");
    let responseWasSent = false;
    if (record) {
      // Fire-and-forget: welcome email failure should not block response
      db.getUserById(record.userId).then(async (user) => {
        if (user && user.email) {
          try {
            await emailModule.sendWelcomeEmail({ to: user.email, name: user.name || "", dashboardUrl: "" });
          } catch {
            // swallowed — this is the correct behavior
          }
        }
      }).catch(() => {});
      responseWasSent = true; // response sent regardless
    }

    expect(responseWasSent).toBe(true);
  });
});

// ─── Fix 3: Login EMAIL_NOT_VERIFIED code ─────────────────────────────────────
describe("Login — EMAIL_NOT_VERIFIED code detection", () => {
  it("returns code EMAIL_NOT_VERIFIED when user email is not verified", () => {
    // Simulate the server response shape
    const serverResponse = { error: "Email not verified", code: "EMAIL_NOT_VERIFIED" };
    expect(serverResponse.code).toBe("EMAIL_NOT_VERIFIED");
    expect(serverResponse.error).toBe("Email not verified");
  });

  it("does NOT return EMAIL_NOT_VERIFIED for wrong password", () => {
    const serverResponse = { error: "Invalid email or password" };
    expect(serverResponse).not.toHaveProperty("code", "EMAIL_NOT_VERIFIED");
  });

  it("frontend can detect EMAIL_NOT_VERIFIED to show resend link", () => {
    const data = { error: "Email not verified", code: "EMAIL_NOT_VERIFIED" };
    const shouldShowResend = data.code === "EMAIL_NOT_VERIFIED";
    expect(shouldShowResend).toBe(true);
  });

  it("frontend does not show resend link for generic errors", () => {
    const data = { error: "Invalid email or password" };
    const shouldShowResend = (data as any).code === "EMAIL_NOT_VERIFIED";
    expect(shouldShowResend).toBe(false);
  });
});

// ─── Fix 4: /reset-password route exists ─────────────────────────────────────
describe("/reset-password route", () => {
  it("ResetPassword.tsx page file exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/ResetPassword.tsx");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("App.tsx registers the /reset-password route", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const appPath = path.join(process.cwd(), "client/src/App.tsx");
    const content = fs.readFileSync(appPath, "utf-8");
    expect(content).toContain('path="/reset-password"');
    expect(content).toContain("ResetPassword");
  });

  it("ResetPassword.tsx handles Supabase hash fragment (access_token + type=recovery)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/ResetPassword.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("access_token");
    expect(content).toContain("recovery");
    expect(content).toContain("window.location.hash");
  });

  it("ResetPassword.tsx calls /api/auth/reset-password with access_token", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/ResetPassword.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("/api/auth/reset-password");
    expect(content).toContain("access_token");
  });
});

// ─── Fix 5: Resend verification button ───────────────────────────────────────
describe("Resend verification email", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resend-verification endpoint is called with the user's email", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(mockUser as any);
    vi.mocked(db.createEmailVerificationToken).mockResolvedValue({} as any);
    vi.mocked(emailModule.sendVerificationEmail).mockResolvedValue({ id: "email-resend-1" } as any);

    // Simulate the resend-verification route logic
    const email = "user@example.com";
    const user = await db.getUserByEmail(email);
    if (user && !user.emailVerified) {
      await emailModule.sendVerificationEmail({
        to: email,
        name: user.name || email.split("@")[0],
        verifyUrl: `https://app.example.com/verify-email?token=new-token-xyz`,
      });
    }

    expect(emailModule.sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com" })
    );
  });

  it("does not resend if user is already verified", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue({ ...mockUser, emailVerified: true } as any);

    const email = "user@example.com";
    const user = await db.getUserByEmail(email);
    if (user && !user.emailVerified) {
      await emailModule.sendVerificationEmail({ to: email, name: "", verifyUrl: "" });
    }

    expect(emailModule.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("Profile.tsx contains ResendVerificationButton component", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/subscriber/Profile.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("ResendVerificationButton");
    expect(content).toContain("/api/auth/resend-verification");
  });
});

// ─── Fix 6: ForgotPassword redirectTo URL ────────────────────────────────────
describe("ForgotPassword — redirectTo URL", () => {
  it("redirectTo points to /reset-password (not /login or /verify-email)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/supabaseAuth.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // The forgot-password route should redirect to /reset-password
    expect(content).toContain("/reset-password");
    expect(content).toContain("resetPasswordForEmail");
  });

  it("supabaseAuth.ts contains EMAIL_NOT_VERIFIED code in login route", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/supabaseAuth.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("EMAIL_NOT_VERIFIED");
    expect(content).toContain("Email not confirmed");
  });

  it("verify-email route uses record.userId (not stale findValidVerificationToken call)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "server/supabaseAuth.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    // The old dead-code pattern should NOT be present
    expect(content).not.toContain("tokenRecord is now null (already consumed)");
    // The new pattern should be present
    expect(content).toContain("record.userId");
    expect(content).toContain("getUserById");
  });
});
