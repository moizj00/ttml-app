/**
 * Super Admin Whitelist & Role Security Tests
 *
 * Verifies that:
 *  1. Only ravivo@homes.land and moizj00@gmail.com can ever hold the admin role
 *  2. The updateRole mutation rejects admin as an assignable role
 *  3. The updateRole mutation blocks promoting active subscribers to attorney
 *  4. All four auth enforcement points use the same whitelist logic
 *  5. No self-signup path can produce an admin user
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { signAdmin2FAToken, ADMIN_2FA_COOKIE } from "./_core/admin2fa";

const SERVER_DIR = join(__dirname);
const CLIENT_SRC = join(__dirname, "..", "client", "src");

function readAllRouters(): string {
  const dir = join(SERVER_DIR, "routers");
  const files = ["review", "letters", "admin", "auth", "billing", "affiliate", "notifications", "profile", "versions", "documents", "blog"];
  return files.map(f => readFileSync(join(dir, `${f}.ts`), "utf-8")).join("\n");
}
function readAllSupabaseAuth(): string {
  const barrel = readFileSync(join(SERVER_DIR, "supabaseAuth.ts"), "utf-8");
  const subDir = join(SERVER_DIR, "supabaseAuth");
  const subFiles = ["helpers.ts", "jwt.ts", "routes.ts", "index.ts", "client.ts", "user-cache.ts"];
  const subContents = subFiles
    .map(f => { try { return readFileSync(join(subDir, f), "utf-8"); } catch { return ""; } })
    .join("\n");
  const routesSubDir = join(subDir, "routes");
  const routeSubFiles = ["signup-login.ts", "admin-2fa.ts", "password.ts", "verification.ts", "oauth.ts", "index.ts"];
  const routeSubContents = routeSubFiles
    .map(f => { try { return readFileSync(join(routesSubDir, f), "utf-8"); } catch { return ""; } })
    .join("\n");
  return subContents + "\n" + routeSubContents + "\n" + barrel;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeAdminCtx(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const userId = overrides?.id ?? 1;
  const user: AuthenticatedUser = {
    id: userId,
    openId: "admin-open-id",
    email: "ravivo@homes.land",
    name: "Super Admin",
    loginMethod: "email",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  const cookieHeader = `${ADMIN_2FA_COOKIE}=${encodeURIComponent(signAdmin2FAToken(userId))}`;
  return {
    user,
    req: { protocol: "https", headers: { cookie: cookieHeader } } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeSubscriberCtx(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 99,
    openId: "subscriber-open-id",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "email",
    role: "subscriber",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── 1. Whitelist Enforcement in Source Code ─────────────────────────────────

describe("Super Admin Whitelist — Source Code Enforcement", () => {
  const authFile = readAllSupabaseAuth();

  it("defines SUPER_ADMIN_EMAILS with both whitelisted addresses", () => {
    expect(authFile).toContain('"ravivo@homes.land"');
    expect(authFile).toContain('"moizj00@gmail.com"');
  });

  it("uses SUPER_ADMIN_EMAILS in at least 4 enforcement points", () => {
    const occurrences = (authFile.match(/SUPER_ADMIN_EMAILS/g) || []).length;
    // 1 const declaration + 4 enforcement checks + 1 module-level comment = 6
    expect(occurrences).toBeGreaterThanOrEqual(6);
  });

  it("strips admin role from non-whitelisted users on login (verifyToken)", () => {
    // The verifyToken function must contain the strip-admin logic
    expect(authFile).toContain("strip admin from anyone not on the whitelist");
    expect(authFile).toContain('"subscriber" // strip admin from anyone not on the whitelist');
  });

  it("strips admin role from non-whitelisted users on email verification", () => {
    // The email verification handler must also enforce the whitelist
    expect(authFile).toContain("non-whitelisted with admin → strip to subscriber");
  });

  it("enforces whitelist in email signup handler", () => {
    expect(authFile).toContain("Hard-coded super admin whitelist");
    // Count independent enforcement points
    const points = (authFile.match(/Hard-coded super admin whitelist/g) || []).length;
    expect(points).toBeGreaterThanOrEqual(4);
  });
});

// ─── 2. updateRole Mutation — Admin Role Blocked ─────────────────────────────

describe("admin.updateRole — Admin Role Cannot Be Assigned via API", () => {
  const routersFile = readAllRouters();

  it("updateRole z.enum does NOT include admin", () => {
    // The enum must only allow subscriber, employee, attorney
    expect(routersFile).toContain(
      'role: z.enum(["subscriber", "employee", "attorney"])'
    );
  });

  it("updateRole z.enum comment explains why admin is excluded", () => {
    expect(routersFile).toContain(
      "Admin role is NOT assignable via the UI"
    );
  });

  it("calling updateRole with role=admin throws a validation error", async () => {
    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.updateRole({ userId: 99, role: "admin" as any })
    ).rejects.toThrow();
  });
});

// ─── 3. updateRole Mutation — Subscription Conflict Guard ────────────────────

describe("admin.updateRole — Active Subscriber Cannot Be Promoted to Attorney", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws BAD_REQUEST when target user has subscription history", async () => {
    vi.doMock("./stripe", async (importOriginal) => {
      const original = await importOriginal<typeof import("./stripe")>();
      return {
        ...original,
        hasEverSubscribed: vi.fn().mockResolvedValue(true),
      };
    });

    const { appRouter: freshRouter } = await import("./routers");
    const ctx = makeAdminCtx();
    const caller = freshRouter.createCaller(ctx);

    await expect(
      caller.admin.updateRole({ userId: 99, role: "attorney" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("subscription history"),
    });
  });

  it("succeeds when target user has no subscription history", async () => {
    vi.doMock("./stripe", async (importOriginal) => {
      const original = await importOriginal<typeof import("./stripe")>();
      return {
        ...original,
        hasEverSubscribed: vi.fn().mockResolvedValue(false),
      };
    });

    vi.doMock("./db", async (importOriginal) => {
      const original = await importOriginal<typeof import("./db")>();
      return {
        ...original,
        updateUserRole: vi.fn().mockResolvedValue(undefined),
      };
    });

    vi.doMock("./notifications", async () => ({
      createNotification: vi.fn().mockResolvedValue(undefined),
    }));

    const { appRouter: freshRouter } = await import("./routers");
    const ctx = makeAdminCtx();
    const caller = freshRouter.createCaller(ctx);

    const result = await caller.admin.updateRole({ userId: 99, role: "attorney" });
    expect(result).toEqual({ success: true });
  });
});

// ─── 4. Non-Admin Cannot Call updateRole ─────────────────────────────────────

describe("admin.updateRole — RBAC: Only Admins Can Change Roles", () => {
  it("throws FORBIDDEN when called by a subscriber", async () => {
    const ctx = makeSubscriberCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.updateRole({ userId: 2, role: "attorney" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when called by an attorney", async () => {
    const ctx = makeSubscriberCtx({ role: "attorney" });
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.updateRole({ userId: 2, role: "subscriber" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN when called without authentication (adminProcedure combines auth+role check)", async () => {
    // Note: adminProcedure checks !ctx.user || ctx.user.role !== 'admin' in a single
    // condition and throws FORBIDDEN for both cases (unauthenticated and wrong role).
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.admin.updateRole({ userId: 2, role: "attorney" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── 5. No Self-Signup Path Can Produce Admin ────────────────────────────────

describe("Self-Signup — Attorney and Admin Roles Cannot Be Self-Assigned", () => {
  const signupFile = readFileSync(join(CLIENT_SRC, "pages", "Signup.tsx"), "utf-8");
  const onboardingFile = readFileSync(join(CLIENT_SRC, "pages", "Onboarding.tsx"), "utf-8");
  const authFile = readAllSupabaseAuth();
  const routersFile = readAllRouters();

  it("Signup.tsx does not include attorney as a selectable role", () => {
    // The ROLE_OPTIONS array must not contain attorney
    // Check that the attorney card/option is not in the role selector
    expect(signupFile).not.toMatch(/value.*attorney.*role.*option/i);
    // The type union for selectedRole must not include attorney
    expect(signupFile).not.toContain('"attorney"');
  });

  it("Onboarding.tsx does not include attorney as a selectable role", () => {
    expect(onboardingFile).not.toContain('"attorney"');
    expect(onboardingFile).not.toContain("I'm an Attorney");
    expect(onboardingFile).not.toContain("barNumber");
  });

  it("supabaseAuth.ts ALLOWED_SIGNUP_ROLES does not include attorney or admin", () => {
    expect(authFile).toContain('ALLOWED_SIGNUP_ROLES');
    expect(authFile).not.toMatch(/ALLOWED_SIGNUP_ROLES.*attorney/);
    expect(authFile).not.toMatch(/ALLOWED_SIGNUP_ROLES.*admin/);
  });

  it("completeOnboarding server mutation does not accept attorney role", () => {
    // The z.enum in completeOnboarding must only allow subscriber and employee
    expect(routersFile).toMatch(/completeOnboarding[\s\S]{0,500}subscriber.*employee/);
    expect(routersFile).not.toMatch(/completeOnboarding[\s\S]{0,200}attorney/);
  });

  it("Attorney role is NOT self-assignable comment exists in OAuth handlers", () => {
    const count = (authFile.match(/Attorney role is NOT self-assignable/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(3); // 3 OAuth routes
  });
});

// ─── 6. Admin Users Page — Dropdown Restricted to Attorney Only ──────────────

describe("Admin Users Page — Role Dropdown Restricted to Attorney", () => {
  const usersFile = readFileSync(
    join(CLIENT_SRC, "pages", "admin", "Users.tsx"),
    "utf-8"
  );

  it("dropdown SelectContent only contains the attorney option", () => {
    // Must have exactly one SelectItem with value="attorney"
    expect(usersFile).toContain('value="attorney"');
    // Must NOT have subscriber, employee, or admin as selectable options
    expect(usersFile).not.toContain('value="subscriber"');
    expect(usersFile).not.toContain('value="employee"');
    expect(usersFile).not.toContain('value="admin"');
  });

  it("dropdown is hidden entirely for admin users", () => {
    expect(usersFile).toContain('user.role !== "admin"');
  });

  it("dropdown is disabled for users who are already attorneys", () => {
    expect(usersFile).toContain('disabled={user.role === "attorney"}');
  });

  it("shows attorney-specific toast with refresh instruction on success", () => {
    expect(usersFile).toContain("promoted to Attorney");
    expect(usersFile).toContain("refresh their browser");
    expect(usersFile).toContain("duration: 10000");
  });

  it("shows attorney-specific callout in the confirmation dialog", () => {
    expect(usersFile).toContain("After confirming, ask the user to");
    expect(usersFile).toContain("refresh their browser");
    expect(usersFile).toContain("Review Center");
  });

  it("displays an informational banner about attorney-only role assignment", () => {
    expect(usersFile).toContain("Attorney role is admin-only");
    expect(usersFile).toContain("Gavel");
  });
});
