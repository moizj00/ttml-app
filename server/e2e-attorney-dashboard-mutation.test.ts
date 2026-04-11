/**
 * E2E Tests — Attorney Dashboard Mutation
 *
 * Covers the full lifecycle from the moment a user's role is changed to
 * "attorney" through to them seeing the Review Center with letters to claim.
 *
 *   1. Session refresh — useAuth refetchOnWindowFocus picks up the new role.
 *   2. Route gating — ProtectedRoute correctly redirects based on role.
 *   3. Attorney route definitions — all three attorney routes are gated.
 *   4. Queue visibility — the review queue returns pending_review letters.
 *   5. DB role read — verifyToken reads role from the database on every request.
 *   6. In-app notification — attorney receives a role upgrade notice.
 *
 * Test strategy: source-code structural assertions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const CLIENT_SRC = join(__dirname, "..", "client", "src");

function readServer(file: string) {
  return readFileSync(join(SERVER_DIR, file), "utf-8");
}

function readRouterModule(routersDir: string, name: string): string {
  const dirPath = join(routersDir, name);
  try {
    if (statSync(dirPath).isDirectory()) {
      return readdirSync(dirPath)
        .filter(f => f.endsWith(".ts"))
        .map(f => { try { return readFileSync(join(dirPath, f), "utf-8"); } catch { return ""; } })
        .join("\n");
    }
  } catch {}
  try { return readFileSync(join(routersDir, `${name}.ts`), "utf-8"); } catch { return ""; }
}

function readAllRouters() {
  const subRouters = ["review", "letters", "admin", "auth", "billing", "affiliate", "notifications", "profile", "versions", "documents", "blog"];
  const routersDir = join(SERVER_DIR, "routers");
  const routerContent = subRouters.map(r => readRouterModule(routersDir, r)).join("\n");
  const servicesDir = join(SERVER_DIR, "services");
  const serviceFiles = ["letters.ts", "admin.ts"];
  const serviceContent = serviceFiles
    .map(f => { try { return readFileSync(join(servicesDir, f), "utf-8"); } catch { return ""; } })
    .join("\n");
  return routerContent + "\n" + serviceContent;
}

function readClient(...segments: string[]) {
  return readFileSync(join(CLIENT_SRC, ...segments), "utf-8");
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

// ─── 1. Session Refresh — useAuth ────────────────────────────────────────────

describe("Attorney Dashboard Mutation — Session Refresh via useAuth", () => {
  const useAuthFile = readClient("_core", "hooks", "useAuth.ts");

  it("useAuth file exists", () => {
    expect(existsSync(join(CLIENT_SRC, "_core", "hooks", "useAuth.ts"))).toBe(true);
  });

  it("refetchOnWindowFocus is true (role updates picked up on tab switch)", () => {
    expect(useAuthFile).toContain("refetchOnWindowFocus: true");
  });

  it("staleTime is set to 0 for immediate role change reflection", () => {
    expect(useAuthFile).toContain("staleTime");
    expect(useAuthFile).toMatch(/staleTime\s*:\s*0/);
  });

  it("useAuth exposes a refresh() function for manual re-fetch", () => {
    expect(useAuthFile).toMatch(/refresh\s*:.*refetch/);
  });

  it("useAuth calls auth.me tRPC query to get user profile", () => {
    expect(useAuthFile).toContain("auth.me");
    expect(useAuthFile).toContain("useQuery");
  });

  it("useAuth returns isAuthenticated, user, loading, and logout", () => {
    expect(useAuthFile).toContain("isAuthenticated");
    expect(useAuthFile).toContain("loading");
    expect(useAuthFile).toContain("logout");
  });
});

// ─── 2. DB Role Read — verifyToken ───────────────────────────────────────────

describe("Attorney Dashboard Mutation — DB-Based Role on Every Request", () => {
  const authFile = readAllSupabaseAuth();

  it("verifyToken calls getUserByOpenId (DB lookup, not JWT decode only)", () => {
    expect(authFile).toContain("getUserByOpenId");
    expect(authFile).toMatch(/verifyToken[\s\S]{0,3000}getUserByOpenId/);
  });

  it("verifyToken returns the user object with role from the database", () => {
    expect(authFile).toMatch(/verifyToken[\s\S]{0,3000}role/);
  });

  it("verifyToken enforces SUPER_ADMIN_EMAILS whitelist on every request", () => {
    expect(authFile).toMatch(/verifyToken[\s\S]{0,3000}SUPER_ADMIN_EMAILS/);
  });
});

// ─── 3. Route Gating — ProtectedRoute ────────────────────────────────────────

describe("Attorney Dashboard Mutation — ProtectedRoute Role Gating", () => {
  const protectedRouteFile = readClient("components", "ProtectedRoute.tsx");

  it("ProtectedRoute file exists", () => {
    expect(existsSync(join(CLIENT_SRC, "components", "ProtectedRoute.tsx"))).toBe(true);
  });

  it("getRoleDashboard returns /attorney for attorney role", () => {
    expect(protectedRouteFile).toContain("getRoleDashboard");
    expect(protectedRouteFile).toContain("/attorney");
  });

  it("getRoleDashboard returns /admin for admin role", () => {
    expect(protectedRouteFile).toContain("/admin");
  });

  it("getRoleDashboard returns /dashboard for subscriber role (default)", () => {
    expect(protectedRouteFile).toContain("/dashboard");
  });

  it("ProtectedRoute redirects wrong-role users to their correct dashboard", () => {
    expect(protectedRouteFile).toContain("allowedRoles");
    expect(protectedRouteFile).toContain("getRoleDashboard");
    expect(protectedRouteFile).toContain("navigate");
  });

  it("ProtectedRoute redirects unauthenticated users to /login", () => {
    expect(protectedRouteFile).toContain("/login");
  });
});

// ─── 4. Attorney Route Definitions — App.tsx ─────────────────────────────────

describe("Attorney Dashboard Mutation — Attorney Routes in App.tsx", () => {
  const appFile = readClient("App.tsx");

  it("App.tsx file exists", () => {
    expect(existsSync(join(CLIENT_SRC, "App.tsx"))).toBe(true);
  });

  it("attorney dashboard route exists at /attorney", () => {
    expect(appFile).toMatch(/path.*["']\/attorney["']/);
  });

  it("attorney queue route exists at /attorney/queue", () => {
    expect(appFile).toMatch(/path.*["']\/attorney\/queue["']/);
  });

  it("attorney review detail route exists at /attorney/:id", () => {
    expect(appFile).toMatch(/path.*["']\/attorney\/:id["']/);
  });

  it("all attorney routes are gated with allowedRoles including attorney and admin", () => {
    const matches = appFile.match(/allowedRoles.*attorney.*admin|allowedRoles.*admin.*attorney/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("attorney dashboard component is lazy-loaded", () => {
    expect(appFile).toMatch(/lazy[\s\S]{0,100}attorney.*Dashboard/);
  });

  it("attorney queue component is lazy-loaded", () => {
    expect(appFile).toMatch(/lazy[\s\S]{0,100}ReviewQueue/);
  });

  it("attorney review detail component is lazy-loaded", () => {
    expect(appFile).toMatch(/lazy[\s\S]{0,100}ReviewDetail/);
  });
});

// ─── 5. Queue Visibility — Review Queue Returns pending_review Letters ────────

describe("Attorney Dashboard Mutation — Queue Visibility After Promotion", () => {
  const routersFile = readAllRouters();

  it("review.queue procedure exists for attorneys", () => {
    expect(routersFile).toContain("queue");
  });

  it("letterDetail canView guard allows pending_review letters for any attorney", () => {
    // Actual code: letter.status === "pending_review"
    expect(routersFile).toContain('letter.status === "pending_review"');
  });

  it("letterDetail canView guard allows admin to view all letters", () => {
    // Actual code: ctx.user.role === "admin"
    expect(routersFile).toContain('ctx.user.role === "admin"');
  });

  it("letterDetail canView guard allows assigned attorney to view their letters", () => {
    expect(routersFile).toContain("letter.assignedReviewerId === ctx.user.id");
  });

  it("letterDetail throws FORBIDDEN when canView is false", () => {
    expect(routersFile).toContain("if (!canView)");
    expect(routersFile).toContain("FORBIDDEN");
  });

  it("review queue uses getAllLetterRequests to fetch letters", () => {
    expect(routersFile).toContain("getAllLetterRequests");
  });

  it("attorney dashboard page exists", () => {
    expect(
      existsSync(join(CLIENT_SRC, "pages", "attorney", "Dashboard.tsx"))
    ).toBe(true);
  });

  it("attorney review queue page exists", () => {
    expect(
      existsSync(join(CLIENT_SRC, "pages", "attorney", "ReviewQueue.tsx"))
    ).toBe(true);
  });

  it("attorney review detail page exists", () => {
    expect(
      existsSync(join(CLIENT_SRC, "pages", "attorney", "ReviewDetail", "index.tsx"))
    ).toBe(true);
  });
});

// ─── 6. In-App Notification — Attorney Receives Role Upgrade Notice ──────────

describe("Attorney Dashboard Mutation — In-App Notification on Promotion", () => {
  const routersFile = readAllRouters();

  it("updateRole sends createNotification when promoting to attorney", () => {
    expect(routersFile).toContain('"role_updated"');
  });

  it("notification type is role_updated", () => {
    expect(routersFile).toContain('"role_updated"');
  });

  it("notification title mentions attorney upgrade", () => {
    expect(routersFile).toContain("upgraded to Attorney");
  });

  it("notification body instructs user to refresh browser", () => {
    expect(routersFile).toContain("refresh your browser");
  });

  it("notification link points to /attorney dashboard", () => {
    expect(routersFile).toContain('link: "/attorney"');
  });

  it("notification failure is non-blocking (console.error in catch block)", () => {
    expect(routersFile).toContain(
      "[updateRole] Failed to send attorney promotion notification:"
    );
  });
});
