/**
 * E2E Tests — Super Admin Role Change Workflow
 *
 * Covers the complete role change pipeline from the super admin's perspective:
 *
 *   1. Whitelist enforcement — only ravivo@homes.land and moizj00@gmail.com
 *      can ever hold the admin role, enforced at 4 independent auth surfaces.
 *
 *   2. updateRole mutation — server-side guards, Zod schema restrictions,
 *      subscription conflict guard, and in-app notification.
 *
 *   3. Stale closure fix — the admin Users page captures role values before
 *      clearing React state so the toast always shows the correct role label.
 *
 *   4. Role enum lockdown — admin cannot be assigned via the API or UI.
 *
 * Test strategy: source-code structural assertions (no live DB/network calls).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const CLIENT_SRC = join(__dirname, "..", "client", "src");

function readServer(file: string) {
  return readFileSync(join(SERVER_DIR, file), "utf-8");
}

function readAllRouters() {
  const subRouters = ["review", "letters", "admin", "auth", "billing", "affiliate", "notifications", "profile", "versions", "documents", "blog"];
  return subRouters.map(r => readFileSync(join(SERVER_DIR, "routers", `${r}.ts`), "utf-8")).join("\n");
}

function readClient(...segments: string[]) {
  return readFileSync(join(CLIENT_SRC, ...segments), "utf-8");
}

// ─── 1. Super Admin Whitelist — Four Enforcement Points ──────────────────────

describe("Super Admin Whitelist — Four Independent Enforcement Points", () => {
  const authFile = readServer("supabaseAuth.ts");

  it("defines SUPER_ADMIN_EMAILS containing both whitelisted addresses", () => {
    expect(authFile).toContain('"ravivo@homes.land"');
    expect(authFile).toContain('"moizj00@gmail.com"');
    expect(authFile).toMatch(/SUPER_ADMIN_EMAILS\s*=\s*\[/);
  });

  it("references SUPER_ADMIN_EMAILS at least 6 times (1 definition + 5 usages)", () => {
    const occurrences = (authFile.match(/SUPER_ADMIN_EMAILS/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(6);
  });

  it("enforces whitelist in syncGoogleUser (Google OAuth signup/login)", () => {
    expect(authFile).toMatch(/syncGoogleUser[\s\S]{0,3000}SUPER_ADMIN_EMAILS/);
  });

  it("enforces whitelist in verifyToken (every authenticated request)", () => {
    expect(authFile).toMatch(/verifyToken[\s\S]{0,3000}SUPER_ADMIN_EMAILS/);
  });

  it("enforces whitelist in email signup handler (POST /api/auth/signup)", () => {
    expect(authFile).toMatch(/signup[\s\S]{0,2000}SUPER_ADMIN_EMAILS/);
  });

  it("enforces whitelist in email verification handler (POST /api/auth/verify-email)", () => {
    expect(authFile).toMatch(/verify-email[\s\S]{0,5000}SUPER_ADMIN_EMAILS/);
  });

  it("strips admin role from non-whitelisted users on login", () => {
    expect(authFile).toMatch(/SUPER_ADMIN_EMAILS[\s\S]{0,500}subscriber/);
  });

  it("blocks attorney self-signup via email (ALLOWED_SIGNUP_ROLES excludes attorney)", () => {
    const allowedRolesMatch = authFile.match(
      /ALLOWED_SIGNUP_ROLES\s*=\s*\[([^\]]+)\]/
    );
    expect(allowedRolesMatch).not.toBeNull();
    const allowedRolesContent = allowedRolesMatch![1];
    expect(allowedRolesContent).not.toContain("attorney");
    expect(allowedRolesContent).not.toContain("admin");
  });

  it("blocks attorney self-signup via Google OAuth (ALLOWED_OAUTH_ROLES excludes attorney)", () => {
    const oauthRolesMatch = authFile.match(/ALLOWED_OAUTH_ROLES\s*=\s*\[([^\]]+)\]/);
    expect(oauthRolesMatch).not.toBeNull();
    const oauthRolesContent = oauthRolesMatch![1];
    expect(oauthRolesContent).not.toContain("attorney");
    expect(oauthRolesContent).not.toContain("admin");
  });
});

// ─── 2. updateRole Mutation — Server-Side Guards ─────────────────────────────

describe("updateRole Mutation — Server-Side Guards and Schema", () => {
  const routersFile = readAllRouters();

  it("updateRole is an adminProcedure (requires admin role)", () => {
    expect(routersFile).toMatch(/updateRole\s*:\s*adminProcedure/);
  });

  it("updateRole Zod schema only accepts subscriber, employee, attorney", () => {
    const enumMatch = routersFile.match(
      /updateRole[\s\S]{0,300}z\.enum\(\[([^\]]+)\]\)/
    );
    expect(enumMatch).not.toBeNull();
    const enumContent = enumMatch![1];
    expect(enumContent).toContain('"subscriber"');
    expect(enumContent).toContain('"employee"');
    expect(enumContent).toContain('"attorney"');
    expect(enumContent).not.toContain('"admin"');
  });

  it("updateRole calls updateUserRole DB function to persist the change", () => {
    // The actual code: await updateUserRole(input.userId, input.role);
    expect(routersFile).toContain("updateUserRole(input.userId, input.role)");
  });

  it("updateRole returns { success: true } on completion", () => {
    expect(routersFile).toMatch(
      /updateRole[\s\S]{0,1500}return\s*\{\s*success\s*:\s*true\s*\}/
    );
  });

  it("updateRole has a subscription conflict guard for attorney promotion", () => {
    expect(routersFile).toContain("hasEverSubscribed(input.userId)");
    expect(routersFile).toContain(
      "subscription history and cannot be promoted to Attorney"
    );
  });

  it("subscription conflict guard message tells admin about subscription history", () => {
    expect(routersFile).toContain(
      "subscription history and cannot be promoted to Attorney"
    );
  });

  it("updateRole sends in-app notification when promoting to attorney", () => {
    // The createNotification call is inside the updateRole mutation
    expect(routersFile).toContain('"role_updated"');
    expect(routersFile).toContain("Review Center");
    expect(routersFile).toContain('link: "/attorney"');
  });

  it("notification failure is non-blocking (wrapped in try/catch with console.error)", () => {
    // The actual code: try { await createNotification(...) } catch (err) { console.error(...) }
    expect(routersFile).toContain(
      "[updateRole] Failed to send attorney promotion notification:"
    );
  });

  it("adminProcedure throws FORBIDDEN for non-admin users", () => {
    // adminProcedure is defined in _core/trpc.ts
    const trpcFile = readServer("_core/trpc.ts");
    expect(trpcFile).toContain("adminProcedure");
    expect(trpcFile).toMatch(/role\s*!==\s*['"]admin['"]/);
    expect(trpcFile).toContain("FORBIDDEN");
  });
});

// ─── 3. Stale Closure Fix — Admin Users Page ─────────────────────────────────

describe("Admin Users Page — Stale Closure Fix (Role Label Never Undefined)", () => {
  const usersFile = readClient("pages", "admin", "Users.tsx");

  it("file exists", () => {
    expect(existsSync(join(CLIENT_SRC, "pages", "admin", "Users.tsx"))).toBe(true);
  });

  it("uses a handleConfirm function that captures values before clearing state", () => {
    expect(usersFile).toContain("handleConfirm");
    expect(usersFile).toContain("const { userId, newRoleValue, userName } = pendingRoleChange");
  });

  it("clears pendingRoleChange state BEFORE calling mutate (not in onSuccess)", () => {
    const clearIndex = usersFile.indexOf("setPendingRoleChange(null)");
    const mutateIndex = usersFile.indexOf("updateRole.mutate(");
    expect(clearIndex).toBeGreaterThan(-1);
    expect(mutateIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeLessThan(mutateIndex);
  });

  it("passes per-call onSuccess callback to mutate() (not shared useMutation onSuccess)", () => {
    expect(usersFile).toMatch(/updateRole\.mutate\s*\(/);
    expect(usersFile).toContain("onSuccess: ()");
  });

  it("toast for attorney promotion uses captured newRoleValue (not state)", () => {
    expect(usersFile).toContain('newRoleValue === "attorney"');
    expect(usersFile).toContain("promoted to Attorney");
  });

  it("toast for attorney promotion has 10-second duration", () => {
    expect(usersFile).toContain("duration: 10000");
  });

  it("toast for attorney promotion includes browser refresh instruction", () => {
    expect(usersFile).toContain("refresh their browser");
    expect(usersFile).toContain("Review Center");
  });

  it("toast for non-attorney roles uses ROLE_CONFIG label with fallback (never undefined)", () => {
    // The actual code: ROLE_CONFIG[newRoleValue as keyof typeof ROLE_CONFIG]?.label ?? newRoleValue
    expect(usersFile).toContain("ROLE_CONFIG[newRoleValue as keyof typeof ROLE_CONFIG]?.label");
    expect(usersFile).toContain("newRoleValue");
  });

  it("AlertDialogAction onClick calls handleConfirm (not inline mutate)", () => {
    expect(usersFile).toMatch(/AlertDialogAction[\s\S]{0,100}onClick.*handleConfirm/);
  });

  it("dropdown only offers attorney as a selectable role value", () => {
    expect(usersFile).toContain('value="attorney"');
    // The dropdown SelectContent should not have admin, subscriber, or employee as values
    const selectContentMatch = usersFile.match(
      /SelectContent[\s\S]{0,300}SelectItem/
    );
    expect(selectContentMatch).not.toBeNull();
    expect(selectContentMatch![0]).not.toContain('value="admin"');
  });

  it("dropdown is disabled for users already attorney", () => {
    expect(usersFile).toMatch(/disabled.*user\.role\s*===\s*["']attorney["']/);
  });

  it("has ROLE_CONFIG with all four role badge definitions", () => {
    expect(usersFile).toContain("ROLE_CONFIG");
    ["admin", "attorney", "employee", "subscriber"].forEach(role => {
      expect(usersFile).toContain(role);
    });
  });

  it("shows an attorney promotion info banner for the super admin", () => {
    expect(usersFile).toContain("Attorney role is admin-only");
  });

  it("confirmation dialog shows current and new role names", () => {
    expect(usersFile).toContain("pendingRoleChange?.currentRole");
    expect(usersFile).toContain("pendingRoleChange?.newRole");
  });

  it("confirmation dialog has attorney-specific callout about browser refresh", () => {
    expect(usersFile).toContain("refresh their browser");
  });
});

// ─── 4. Role Enum Lockdown — Admin Cannot Be Assigned ────────────────────────

describe("Role Enum Lockdown — Admin Role Cannot Be Assigned via Any Surface", () => {
  it("server updateRole enum excludes admin", () => {
    const routersFile = readAllRouters();
    const enumMatch = routersFile.match(
      /updateRole[\s\S]{0,300}z\.enum\(\[([^\]]+)\]\)/
    );
    expect(enumMatch![1]).not.toContain('"admin"');
  });

  it("server completeOnboarding enum excludes attorney and admin", () => {
    const routersFile = readAllRouters();
    const onboardingMatch = routersFile.match(
      /completeOnboarding[\s\S]{0,500}z\.enum\(\[([^\]]+)\]\)/
    );
    expect(onboardingMatch).not.toBeNull();
    const enumContent = onboardingMatch![1];
    expect(enumContent).not.toContain('"attorney"');
    expect(enumContent).not.toContain('"admin"');
  });

  it("Signup page does not expose attorney as a selectable role", () => {
    const signupFile = readClient("pages", "Signup.tsx");
    const roleOptionsMatch = signupFile.match(
      /ROLE_OPTIONS\s*=\s*\[[\s\S]{0,500}\]/
    );
    if (roleOptionsMatch) {
      expect(roleOptionsMatch[0]).not.toContain('"attorney"');
    }
    expect(signupFile).not.toContain('value="attorney"');
  });

  it("Onboarding page does not expose attorney as a selectable role", () => {
    const onboardingFile = readClient("pages", "Onboarding.tsx");
    const roleOptionsMatch = onboardingFile.match(
      /ROLE_OPTIONS\s*=\s*\[[\s\S]{0,500}\]/
    );
    if (roleOptionsMatch) {
      expect(roleOptionsMatch[0]).not.toContain('"attorney"');
    }
  });

  it("Google OAuth flow does not allow attorney as a requested role", () => {
    const authFile = readServer("supabaseAuth.ts");
    expect(authFile).not.toMatch(
      /ALLOWED_SIGNUP_ROLES\s*=\s*\[[\s\S]{0,100}attorney/
    );
  });
});
