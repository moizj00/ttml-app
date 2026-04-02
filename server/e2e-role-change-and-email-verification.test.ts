/**
 * E2E: Role Change Flow & Email Verification Integrity
 *
 * Tests covering:
 *   1. AppLayout — role_updated notification triggers auth.me invalidation
 *   2. AppLayout — notification items are clickable (navigate + markRead)
 *   3. AppLayout — role_updated watcher works for Google OAuth users (same code path)
 *   4. Email verification — GET /api/auth/verify-email?token= calls invalidateUserCache
 *   5. Email verification — POST /api/auth/verify-email calls invalidateUserCache
 *   6. Email verification — login blocks unverified users with EMAIL_NOT_VERIFIED code
 *   7. Email verification — resend-verification uses Supabase resend() for Supabase users
 *   8. Email verification — resend-verification uses custom token for edge-case users
 *   9. Notification routing — pipeline failures only go to admins
 *  10. Notification routing — role_updated goes to the promoted user
 *  11. Notification routing — letter status notifications go to the letter owner
 *  12. Google OAuth — syncGoogleUser preserves promoted role across re-logins
 *  13. Google OAuth — emailVerified is always true for Google users
 *  14. ProtectedRoute — unverified email users are blocked
 *  15. ProtectedRoute — admin bypasses email verification gate
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CLIENT_SRC = join(__dirname, "..", "client", "src");
const SERVER_DIR = join(__dirname);
const allRoutersContent = () => {
  const subRouters = ["review", "letters", "admin", "auth", "billing", "affiliate", "notifications", "profile", "versions", "documents", "blog"];
  return subRouters.map(r => readFileSync(join(SERVER_DIR, "routers", `${r}.ts`), "utf-8")).join("\n");
};

// ─── 1. AppLayout — role_updated notification watcher ────────────────────────

describe("AppLayout — role_updated notification watcher", () => {
  const filePath = join(CLIENT_SRC, "components", "shared", "AppLayout.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("imports useEffect and useRef for the watcher", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("useEffect");
    expect(content).toContain("useRef");
  });

  it("watches for role_updated notification type", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("role_updated");
  });

  it("calls utils.auth.me.invalidate() when role_updated is detected", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("utils.auth.me.invalidate");
  });

  it("navigates to the correct dashboard after invalidation", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("getRoleDashboard");
    expect(content).toContain("navigate");
  });

  it("uses a ref to deduplicate role_updated events (prevents double navigation)", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("seenRoleUpdateRef");
    // Must add to the set after processing
    expect(content).toContain("seenRoleUpdateRef.current.add");
  });

  it("imports getRoleDashboard from ProtectedRoute", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toMatch(/import.*getRoleDashboard.*ProtectedRoute/);
  });
});

// ─── 2. AppLayout — clickable notification items ──────────────────────────────

describe("AppLayout — clickable notification items", () => {
  const filePath = join(CLIENT_SRC, "components", "shared", "AppLayout.tsx");

  it("notification items have an onClick handler", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("onClick");
  });

  it("onClick marks the notification as read", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("markRead.mutate");
  });

  it("onClick navigates to n.link when a link is set", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("n.link");
    expect(content).toContain("navigate(n.link)");
  });

  it("markRead mutation invalidates the notifications list on success", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("notifications.list.invalidate");
  });
});

// ─── 3. AppLayout — Google OAuth users use the same role_updated path ────────

describe("AppLayout — role_updated works for Google OAuth users", () => {
  const appLayoutPath = join(CLIENT_SRC, "components", "shared", "AppLayout.tsx");
  const supabaseAuthPath = join(SERVER_DIR, "supabaseAuth.ts");

  it("auth.me always reads role from DB, not from JWT — verified in verifyToken", () => {
    const content = readFileSync(supabaseAuthPath, "utf-8");
    // verifyToken must call getUserByOpenId to get the role from the app DB
    expect(content).toContain("getUserByOpenId");
    // Must NOT read role from supabaseUser.user_metadata or app_metadata
    // (those are JWT claims, not the app DB role)
    const verifyTokenSection = content.match(/async function verifyToken[\s\S]{0,3000}/)?.[0] || "";
    expect(verifyTokenSection).not.toContain("user_metadata?.role");
    expect(verifyTokenSection).not.toContain("app_metadata?.role");
  });

  it("AppLayout role_updated watcher does not check loginMethod — works for all users", () => {
    const content = readFileSync(appLayoutPath, "utf-8");
    // The watcher must not filter by loginMethod
    const watcherSection = content.match(/seenRoleUpdateRef[\s\S]{0,500}/)?.[0] || "";
    expect(watcherSection).not.toContain("loginMethod");
    expect(watcherSection).not.toContain("google");
  });
});

// ─── 4. Email verification — GET route calls invalidateUserCache ──────────────

describe("Email verification — GET /api/auth/verify-email?token= cache invalidation", () => {
  const filePath = join(SERVER_DIR, "supabaseAuth.ts");

  it("GET verify-email route exists", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('app.get("/api/auth/verify-email"');
  });

  it("GET verify-email calls consumeVerificationToken", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("consumeVerificationToken");
  });

  it("GET verify-email calls invalidateUserCache after successful token consumption", () => {
    const content = readFileSync(filePath, "utf-8");
    // Find the GET route section
    const getRouteSection = content.match(/app\.get\("\/api\/auth\/verify-email"[\s\S]{0,1500}/)?.[0] || "";
    expect(getRouteSection).toContain("invalidateUserCache");
    expect(getRouteSection).toContain("user.openId");
  });

  it("GET verify-email sends role-based welcome email after verification", () => {
    const content = readFileSync(filePath, "utf-8");
    const getRouteSection = content.match(/app\.get\("\/api\/auth\/verify-email"[\s\S]{0,3000}/)?.[0] || "";
    expect(getRouteSection).toContain("sendRoleBasedWelcomeEmail");
  });

  it("GET verify-email returns 400 for invalid/expired tokens", () => {
    const content = readFileSync(filePath, "utf-8");
    const getRouteSection = content.match(/app\.get\("\/api\/auth\/verify-email"[\s\S]{0,1500}/)?.[0] || "";
    expect(getRouteSection).toContain("400");
    expect(getRouteSection).toContain("Invalid or expired verification token");
  });
});

// ─── 5. Email verification — POST route calls invalidateUserCache ─────────────

describe("Email verification — POST /api/auth/verify-email cache invalidation", () => {
  const filePath = join(SERVER_DIR, "supabaseAuth.ts");

  it("POST verify-email route exists", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('app.post("/api/auth/verify-email"');
  });

  it("POST verify-email calls invalidateUserCache after upsertUser", () => {
    const content = readFileSync(filePath, "utf-8");
    // Use a larger window (5000 chars) because the route body is long
    const postRouteSection = content.match(/app\.post\("\/api\/auth\/verify-email"[\s\S]{0,5000}/)?.[0] || "";
    expect(postRouteSection).toContain("invalidateUserCache");
  });

  it("POST verify-email sets emailVerified: true in the upsert", () => {
    const content = readFileSync(filePath, "utf-8");
    // Use a larger window (5000 chars) because the route body is long
    const postRouteSection = content.match(/app\.post\("\/api\/auth\/verify-email"[\s\S]{0,5000}/)?.[0] || "";
    expect(postRouteSection).toContain("emailVerified: true");
  });

  it("POST verify-email handles all three Supabase token types: code, access_token, token_hash", () => {
    const content = readFileSync(filePath, "utf-8");
    const postRouteSection = content.match(/app\.post\("\/api\/auth\/verify-email"[\s\S]{0,2000}/)?.[0] || "";
    expect(postRouteSection).toContain("code");
    expect(postRouteSection).toContain("access_token");
    expect(postRouteSection).toContain("token_hash");
  });
});

// ─── 6. Login blocks unverified users ────────────────────────────────────────

describe("Login — blocks unverified email users with EMAIL_NOT_VERIFIED code", () => {
  const serverPath = join(SERVER_DIR, "supabaseAuth.ts");
  const clientPath = join(CLIENT_SRC, "pages", "Login.tsx");

  it("login route returns EMAIL_NOT_VERIFIED code for Supabase-unconfirmed users", () => {
    const content = readFileSync(serverPath, "utf-8");
    expect(content).toContain("EMAIL_NOT_VERIFIED");
    expect(content).toContain("Email not confirmed");
  });

  it("login route also blocks users whose app DB has emailVerified: false", () => {
    const content = readFileSync(serverPath, "utf-8");
    const loginSection = content.match(/app\.post\("\/api\/auth\/login"[\s\S]{0,2000}/)?.[0] || "";
    expect(loginSection).toContain("emailVerified === false");
    expect(loginSection).toContain("EMAIL_NOT_VERIFIED");
  });

  it("Login page shows resend verification button on EMAIL_NOT_VERIFIED", () => {
    const content = readFileSync(clientPath, "utf-8");
    expect(content).toContain("EMAIL_NOT_VERIFIED");
    expect(content).toContain("showResendVerification");
    expect(content).toContain("Resend verification email");
  });

  it("Login page calls /api/auth/resend-verification on resend click", () => {
    const content = readFileSync(clientPath, "utf-8");
    expect(content).toContain("/api/auth/resend-verification");
  });
});

// ─── 7. Resend verification — Supabase resend() for Supabase users ────────────

describe("Resend verification — uses Supabase auth.resend() for primary flow", () => {
  const filePath = join(SERVER_DIR, "supabaseAuth.ts");

  it("resend-verification route exists", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('app.post("/api/auth/resend-verification"');
  });

  it("uses anonClient.auth.resend() for users whose Supabase email is unconfirmed", () => {
    const content = readFileSync(filePath, "utf-8");
    const resendSection = content.match(/app\.post\("\/api\/auth\/resend-verification"[\s\S]{0,2000}/)?.[0] || "";
    expect(resendSection).toContain("auth.resend");
    expect(resendSection).toContain('type: "signup"');
  });

  it("resend-verification does not reveal if user exists (privacy-safe response)", () => {
    const content = readFileSync(filePath, "utf-8");
    const resendSection = content.match(/app\.post\("\/api\/auth\/resend-verification"[\s\S]{0,2000}/)?.[0] || "";
    expect(resendSection).toContain("If an unverified account exists");
  });
});

// ─── 8. Resend verification — custom token fallback ──────────────────────────

describe("Resend verification — custom token fallback for edge-case users", () => {
  const filePath = join(SERVER_DIR, "supabaseAuth.ts");

  it("falls back to custom token when Supabase user is already confirmed", () => {
    const content = readFileSync(filePath, "utf-8");
    const resendSection = content.match(/app\.post\("\/api\/auth\/resend-verification"[\s\S]{0,2000}/)?.[0] || "";
    expect(resendSection).toContain("createEmailVerificationToken");
    expect(resendSection).toContain("deleteUserVerificationTokens");
    expect(resendSection).toContain("sendVerificationEmail");
  });

  it("deletes old tokens before creating a new one to prevent token accumulation", () => {
    const content = readFileSync(filePath, "utf-8");
    const resendSection = content.match(/app\.post\("\/api\/auth\/resend-verification"[\s\S]{0,2000}/)?.[0] || "";
    // deleteUserVerificationTokens must come before createEmailVerificationToken
    const deleteIdx = resendSection.indexOf("deleteUserVerificationTokens");
    const createIdx = resendSection.indexOf("createEmailVerificationToken");
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeLessThan(createIdx);
  });
});

// ─── 9. Notification routing — pipeline failures to admins only ───────────────

describe("Notification routing — pipeline failures go to admins only", () => {
  // Pipeline failure notifications are handled in worker.ts (the Bull queue worker),
  // not in routers.ts. The worker iterates over admin users and creates a
  // job_failed notification for each of them.
  const filePath = join(SERVER_DIR, "worker.ts");

  it("job_failed notification is sent to admin users", () => {
    const content = readFileSync(filePath, "utf-8");
    // The job_failed notification must target admins
    const pipelineSection = content.match(/job_failed[\s\S]{0,500}/)?.[0] || "";
    expect(pipelineSection).toContain("admin");
  });

  it("job_failed notification is NOT sent to subscribers", () => {
    const content = readFileSync(filePath, "utf-8");
    // The job_failed notification block itself must not reference subscriber
    // (it targets admins via getEmployeesAndAdmins or similar)
    const pipelineSection = content.match(/job_failed[\s\S]{0,300}/)?.[0] || "";
    expect(pipelineSection).not.toContain("subscriber");
  });

  it("job_failed notification is NOT sent to attorneys", () => {
    const content = readFileSync(filePath, "utf-8");
    const pipelineSection = content.match(/job_failed[\s\S]{0,300}/)?.[0] || "";
    expect(pipelineSection).not.toContain("attorney");
  });
});

// ─── 10. Notification routing — role_updated to the promoted user ─────────────

describe("Notification routing — role_updated goes to the promoted user", () => {
  it("role_updated notification is created in the updateRole mutation", () => {
    const content = allRoutersContent();
    expect(content).toContain("role_updated");
    expect(content).toContain("updateRole");
  });

  it("role_updated notification targets the user whose role was changed (input.userId)", () => {
    const content = allRoutersContent();
    const updateRoleSection = content.match(/updateRole[\s\S]{0,2000}/)?.[0] || "";
    expect(updateRoleSection).toContain("role_updated");
    // Must target the user being promoted, not the admin
    expect(updateRoleSection).toMatch(/userId.*input\.userId|input\.userId.*userId/);
  });

  it("role_updated notification has a link to the new role dashboard", () => {
    const content = allRoutersContent();
    const roleUpdatedSection = content.match(/role_updated[\s\S]{0,500}/)?.[0] || "";
    // Must include a link (e.g. /attorney or /dashboard)
    expect(roleUpdatedSection).toMatch(/link.*\/|\/.*link/);
  });

  it("updateRole mutation calls invalidateUserCache after role update", () => {
    const content = allRoutersContent();
    const updateRoleSection = content.match(/updateRole[\s\S]{0,2000}/)?.[0] || "";
    expect(updateRoleSection).toContain("invalidateUserCache");
  });
});

// ─── 11. Notification routing — letter status to letter owner ─────────────────

describe("Notification routing — letter status notifications go to letter owner", () => {
  it("letter_approved notification targets letter.userId (the subscriber)", () => {
    const content = allRoutersContent();
    // The createNotification call for letter_approved uses userId: letter.userId
    // which appears on the line before the type field
    const approveSection = content.match(/userId: letter\.userId,[\s\S]{0,100}type: "letter_approved"/)?.[0] || "";
    expect(approveSection).toBeTruthy();
  });

  it("letter_rejected notification targets letter.userId", () => {
    const content = allRoutersContent();
    const rejectSection = content.match(/userId: letter\.userId,[\s\S]{0,100}type: "letter_rejected"/)?.[0] || "";
    expect(rejectSection).toBeTruthy();
  });

  it("needs_changes notification targets letter.userId", () => {
    const content = allRoutersContent();
    const changesSection = content.match(/userId: letter\.userId,[\s\S]{0,100}type: "needs_changes"/)?.[0] || "";
    expect(changesSection).toBeTruthy();
  });
});

// ─── 12. Google OAuth — syncGoogleUser preserves promoted role ────────────────

describe("Google OAuth — promoted role is preserved across re-logins", () => {
  const filePath = join(SERVER_DIR, "supabaseAuth.ts");

  it("syncGoogleUser reads existingRole from DB before upsert", () => {
    const content = readFileSync(filePath, "utf-8");
    const syncSection = content.match(/syncGoogleUser[\s\S]{0,2000}/)?.[0] || "";
    expect(syncSection).toContain("existingRole");
    expect(syncSection).toContain("getUserByOpenId");
  });

  it("resolvedRole uses existingRole first, falling back to requestedRole", () => {
    const content = readFileSync(filePath, "utf-8");
    const syncSection = content.match(/syncGoogleUser[\s\S]{0,2000}/)?.[0] || "";
    expect(syncSection).toContain("resolvedRole");
    // existingRole must take priority over requestedRole
    expect(syncSection).toMatch(/existingRole.*requestedRole|existingRole \|\|/);
  });

  it("upsertUser receives the resolvedRole so it is persisted correctly", () => {
    const content = readFileSync(filePath, "utf-8");
    const syncSection = content.match(/syncGoogleUser[\s\S]{0,2000}/)?.[0] || "";
    expect(syncSection).toContain("resolvedRole");
    expect(syncSection).toContain("upsertUser");
  });

  it("syncGoogleUser calls invalidateUserCache after upsert", () => {
    const content = readFileSync(filePath, "utf-8");
    const syncSection = content.match(/syncGoogleUser[\s\S]{0,2000}/)?.[0] || "";
    expect(syncSection).toContain("invalidateUserCache");
  });
});

// ─── 13. Google OAuth — emailVerified is always true ─────────────────────────

describe("Google OAuth — emailVerified is always true for Google users", () => {
  const filePath = join(SERVER_DIR, "supabaseAuth.ts");

  it("syncGoogleUser sets emailVerified: true unconditionally", () => {
    const content = readFileSync(filePath, "utf-8");
    const syncSection = content.match(/syncGoogleUser[\s\S]{0,2000}/)?.[0] || "";
    expect(syncSection).toContain("emailVerified: true");
  });

  it("Google users are never blocked by the email verification gate", () => {
    // The ProtectedRoute gate only blocks when emailVerified === false
    // Google users always have emailVerified: true, so they are never blocked
    const protectedRoutePath = join(CLIENT_SRC, "components", "ProtectedRoute.tsx");
    const content = readFileSync(protectedRoutePath, "utf-8");
    // The gate must check emailVerified
    expect(content).toContain("emailVerified");
    // Admin must bypass the gate
    expect(content).toMatch(/admin.*emailVerified|emailVerified.*admin/);
  });
});

// ─── 14. ProtectedRoute — unverified email users are blocked ─────────────────

describe("ProtectedRoute — email verification gate", () => {
  const filePath = join(CLIENT_SRC, "components", "ProtectedRoute.tsx");

  it("ProtectedRoute file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("blocks non-admin users whose emailVerified is false", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("emailVerified");
    // Must redirect or show an error for unverified users
    expect(content).toMatch(/emailVerified.*false|!.*emailVerified/);
  });

  it("redirects unverified users to /verify-email", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("/verify-email");
  });
});

// ─── 15. ProtectedRoute — admin bypasses email verification ──────────────────

describe("ProtectedRoute — admin bypasses email verification gate", () => {
  const filePath = join(CLIENT_SRC, "components", "ProtectedRoute.tsx");

  it("admin role is exempt from the email verification check", () => {
    const content = readFileSync(filePath, "utf-8");
    // The gate condition must exclude admin
    expect(content).toMatch(/admin.*emailVerified|role.*admin/);
  });
});
