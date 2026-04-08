/**
 * E2E Tests — User Cache Layer in supabaseAuth.ts
 *
 * Validates that the in-memory cache for verifyToken() is correctly
 * implemented with proper invalidation at all write points.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SERVER_DIR = join(__dirname);
const readServer = (name: string) =>
  readFileSync(join(SERVER_DIR, name), "utf-8");
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
const readAllRouters = () => {
  const subRouters = ["review", "letters", "admin", "auth", "billing", "affiliate", "notifications", "profile", "versions", "documents", "blog"];
  const routersDir = join(SERVER_DIR, "routers");
  return subRouters.map(r => readRouterModule(routersDir, r)).join("\n");
};
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

describe("User Cache Layer — supabaseAuth.ts", () => {
  const authFile = readAllSupabaseAuth();

  // ── Cache infrastructure ────────────────────────────────────────────────

  it("defines USER_CACHE_TTL_MS constant (30 seconds)", () => {
    expect(authFile).toMatch(/USER_CACHE_TTL_MS\s*=\s*30[_]?000/);
  });

  it("defines LAST_SIGNED_IN_WRITE_INTERVAL_MS constant (5 minutes)", () => {
    expect(authFile).toMatch(/LAST_SIGNED_IN_WRITE_INTERVAL_MS\s*=\s*5\s*\*\s*60[_]?000/);
  });

  it("uses a Map for the user cache", () => {
    expect(authFile).toMatch(/_userCache\s*=\s*new\s+Map/);
  });

  it("defines UserCacheEntry interface with user, expiresAt, and lastSignedInWrittenAt", () => {
    expect(authFile).toContain("interface UserCacheEntry");
    expect(authFile).toContain("expiresAt: number");
    expect(authFile).toContain("lastSignedInWrittenAt: number");
  });

  it("exports invalidateUserCache function", () => {
    expect(authFile).toMatch(/export\s+function\s+invalidateUserCache/);
  });

  it("exports invalidateAllUserCache function", () => {
    expect(authFile).toMatch(/export\s+function\s+invalidateAllUserCache/);
  });

  // ── Cache fast-path in verifyToken ──────────────────────────────────────

  it("verifyToken checks cache before DB read (_cacheGet)", () => {
    // _cacheGet must appear inside verifyToken
    expect(authFile).toMatch(/verifyToken[\s\S]{0,3000}_cacheGet/);
  });

  it("verifyToken populates cache after DB read (_cacheSet)", () => {
    expect(authFile).toMatch(/verifyToken[\s\S]{0,5000}_cacheSet/);
  });

  it("verifyToken checks for illegal admin in cached entry", () => {
    // The cache fast-path must detect a cached admin who is NOT on the whitelist
    expect(authFile).toMatch(/cached[\s\S]{0,200}illegalAdmin/);
  });

  it("verifyToken throttles lastSignedIn writes on cache hit", () => {
    // On a cache hit, lastSignedIn is only written if > LAST_SIGNED_IN_WRITE_INTERVAL_MS
    expect(authFile).toMatch(/LAST_SIGNED_IN_WRITE_INTERVAL_MS/);
    expect(authFile).toMatch(/cached\.lastSignedInWrittenAt/);
  });

  // ── Cache invalidation at all write points ─────────────────────────────

  it("syncGoogleUser invalidates cache after upsertUser", () => {
    // syncGoogleUser must call invalidateUserCache after upsert
    const syncFnStart = authFile.indexOf("async function syncGoogleUser");
    const syncFnEnd = authFile.indexOf("return { dbUser, resolvedRole }", syncFnStart);
    const syncFnBody = authFile.slice(syncFnStart, syncFnEnd);
    expect(syncFnBody).toContain("invalidateUserCache");
  });

  it("login route invalidates cache after upsertUser", () => {
    // POST /api/auth/login must call invalidateUserCache after upsert
    const loginStart = authFile.indexOf('"/api/auth/login"');
    const loginEnd = authFile.indexOf('"/api/auth/logout"', loginStart);
    const loginBody = authFile.slice(loginStart, loginEnd);
    expect(loginBody).toContain("invalidateUserCache");
  });

  it("signup route invalidates cache after upsertUser", () => {
    // POST /api/auth/signup must call invalidateUserCache after upsert
    const signupStart = authFile.indexOf('"/api/auth/signup"');
    const signupEnd = authFile.indexOf('"/api/auth/login"', signupStart);
    const signupBody = authFile.slice(signupStart, signupEnd);
    expect(signupBody).toContain("invalidateUserCache");
  });

  it("email verification route invalidates cache after upsertUser", () => {
    // POST /api/auth/verify-email must call invalidateUserCache after upsert
    const verifyStart = authFile.indexOf("POST /api/auth/verify-email");
    const verifyEnd = authFile.indexOf("GET /api/auth/verify-email", verifyStart);
    const verifyBody = authFile.slice(verifyStart, verifyEnd);
    expect(verifyBody).toContain("invalidateUserCache");
  });

  // ── Cache invalidation in updateRole mutation ──────────────────────────

  it("updateRole mutation invalidates cache after role change", () => {
    const routersFile = readAllRouters();
    // The updateRole mutation must import and call invalidateUserCache
    // Sub-routers use "../supabaseAuth" since they live in server/routers/
    expect(routersFile).toContain("invalidateUserCache");
    // It must call invalidateUserCache after updateUserRole
    const updateRoleStart = routersFile.indexOf("updateRole: adminProcedure");
    const updateRoleEnd = routersFile.indexOf("allLetters: adminProcedure", updateRoleStart);
    const updateRoleBody = routersFile.slice(updateRoleStart, updateRoleEnd);
    expect(updateRoleBody).toContain("invalidateUserCache");
  });

  // ── Security invariant: super admin whitelist still enforced ───────────

  it("verifyToken enforces SUPER_ADMIN_EMAILS on cache miss (full DB sync path)", () => {
    // The full DB sync path must check isOwner and strip admin from non-whitelisted users
    expect(authFile).toMatch(/verifyToken[\s\S]{0,4000}SUPER_ADMIN_EMAILS/);
    expect(authFile).toMatch(/verifyToken[\s\S]{0,5000}strip admin/);
  });

  it("cache hit still checks for illegal admin before returning cached user", () => {
    // On a cache hit, the code must verify the cached user isn't an illegal admin
    const cacheHitSection = authFile.slice(
      authFile.indexOf("Cache fast-path"),
      authFile.indexOf("Full DB sync path")
    );
    expect(cacheHitSection).toContain("illegalAdmin");
    expect(cacheHitSection).toContain("invalidateUserCache");
  });
});
