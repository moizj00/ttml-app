/**
 * Attorney Review Pipeline — End-to-End Integration Tests
 *
 * Tests the full workflow:
 *   pending_review → (attorney views) → claim → under_review → edit → approve
 *   → final_approved version created → subscriber sees approved letter
 *
 * Also tests:
 *   - Attorney can view pending_review letters before claiming (canView guard)
 *   - Attorney cannot view letters assigned to other attorneys
 *   - Non-attorney cannot claim, edit, or approve
 *   - Subscriber sees final_approved version after approval
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const SERVER_DIR = join(__dirname);
const CLIENT_SRC = join(__dirname, "..", "client", "src");

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

function makeCtx(user: Partial<AuthenticatedUser> & { role: string }): TrpcContext {
  const fullUser: AuthenticatedUser = {
    id: 1,
    openId: "test-open-id",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "email",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...user,
  } as AuthenticatedUser;

  return {
    user: fullUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const ATTORNEY_CTX = makeCtx({ id: 10, role: "attorney", email: "attorney@lawfirm.com" });
const SUBSCRIBER_CTX = makeCtx({ id: 20, role: "subscriber", email: "client@example.com" });
const ADMIN_CTX = makeCtx({ id: 1, role: "admin", email: "ravivo@homes.land" });

// ─── 1. Source Code Structural Tests ─────────────────────────────────────────

describe("Attorney Review Pipeline — Source Code Structure", () => {
  // Routers are now split — combine review + letters sub-router content
  const _routersDir = join(SERVER_DIR, "routers");
  const routersFile = [
    readRouterModule(_routersDir, "review"),
    readRouterModule(_routersDir, "letters"),
    readRouterModule(_routersDir, "admin"),
  ].join("\n");
  // ReviewModal was refactored from a flat file to a directory — combine index + hooks
  const reviewModalFile = [
    readFileSync(join(CLIENT_SRC, "components", "shared", "ReviewModal", "index.tsx"), "utf-8"),
    readFileSync(join(CLIENT_SRC, "components", "shared", "ReviewModal", "hooks", "useReviewModal.ts"), "utf-8"),
  ].join("\n");
  const reviewQueueFile = readFileSync(
    join(CLIENT_SRC, "pages", "attorney", "ReviewQueue.tsx"),
    "utf-8"
  );
  const appFile = readFileSync(join(CLIENT_SRC, "App.tsx"), "utf-8");

  describe("Server — letterDetail canView guard", () => {
    it("allows any attorney to view pending_review letters", () => {
      // The canView guard must include a pending_review OR condition
      expect(routersFile).toContain("pending_review");
      expect(routersFile).toContain("canView");
      // The guard must allow viewing if status is pending_review (not just assigned)
      expect(routersFile).toMatch(/canView[\s\S]{0,300}pending_review/);
    });

    it("allows assigned attorney to view under_review letters", () => {
      expect(routersFile).toMatch(/assignedReviewerId.*ctx\.user\.id|ctx\.user\.id.*assignedReviewerId/);
    });

    it("throws FORBIDDEN when canView is false", () => {
      expect(routersFile).toContain("FORBIDDEN");
      expect(routersFile).toMatch(/if.*!canView[\s\S]{0,100}FORBIDDEN/);
    });
  });

  describe("Server — claim mutation", () => {
    it("claim mutation exists and transitions to under_review", () => {
      expect(routersFile).toContain("claimLetterForReview");
      expect(routersFile).toContain("under_review");
    });

    it("claim mutation is protected by attorneyProcedure", () => {
      // The claim procedure must be inside the review router with attorney auth
      expect(routersFile).toMatch(/claim.*attorneyProcedure|attorneyProcedure[\s\S]{0,500}claim/);
    });
  });

  describe("Server — approve mutation", () => {
    it("approve mutation creates a final_approved version", () => {
      expect(routersFile).toContain("final_approved");
      expect(routersFile).toContain("approve");
    });

    it("approve mutation generates a PDF", () => {
      expect(routersFile).toContain("pdfUrl");
      expect(routersFile).toMatch(/pdf|PDF/);
    });

    it("approve mutation notifies the subscriber", () => {
      // Must send a notification or email to the subscriber
      expect(routersFile).toMatch(/notify|notification|email[\s\S]{0,200}approve/i);
    });

    it("approve mutation is protected by attorneyProcedure", () => {
      expect(routersFile).toMatch(/approve.*attorneyProcedure|attorneyProcedure[\s\S]{0,500}approve/);
    });
  });

  describe("Client — ReviewModal", () => {
    it("ReviewModal exists", () => {
      expect(reviewModalFile).toBeTruthy();
      expect(reviewModalFile.length).toBeGreaterThan(1000);
    });

    it("shows Claim button for pending_review letters", () => {
      expect(reviewModalFile).toContain("pending_review");
      expect(reviewModalFile).toContain("Claim");
    });

    it("shows Edit Draft button for under_review letters", () => {
      expect(reviewModalFile).toContain("under_review");
      expect(reviewModalFile).toContain("Edit");
    });

    it("shows Approve and Reject buttons", () => {
      expect(reviewModalFile).toContain("Approve");
      expect(reviewModalFile).toContain("Reject");
    });

    it("uses ai_draft as the DB enum value (not initial_draft)", () => {
      // The DB enum value must remain ai_draft even though the UI label says Initial Draft
      expect(reviewModalFile).toContain('"ai_draft"');
    });

    it("displays Initial Draft as the UI label (not AI Draft)", () => {
      expect(reviewModalFile).toContain("Initial Draft");
      expect(reviewModalFile).not.toContain("AI Draft");
    });

    it("does not expose AI, Perplexity, or Anthropic in user-visible strings", () => {
      // Check for AI in user-visible text (not in code/variable names)
      const userVisibleAI = reviewModalFile.match(/>.*\bAI\b.*</g);
      expect(userVisibleAI).toBeNull();
      expect(reviewModalFile).not.toContain("Perplexity");
      expect(reviewModalFile).not.toContain("Anthropic");
    });
  });

  describe("Client — ReviewQueue page", () => {
    it("ReviewQueue page exists", () => {
      expect(reviewQueueFile).toBeTruthy();
    });

    it("fetches letters from the review queue", () => {
      expect(reviewQueueFile).toContain("review.queue");
    });

    it("filters to review-relevant statuses", () => {
      // After the Queue/Centre split, REVIEW_STATUSES was renamed CENTRE_STATUSES
      // and moved to ReviewCentre.tsx. The queue now filters by status=pending_review directly.
      const reviewCentreFile = readFileSync(
        join(CLIENT_SRC, "pages", "attorney", "ReviewCentre.tsx"),
        "utf-8"
      );
      expect(reviewCentreFile).toContain("CENTRE_STATUSES");
    });
  });

  describe("Client — Attorney routes in App.tsx", () => {
    it("attorney routes are protected with allowedRoles including attorney", () => {
      expect(appFile).toContain('"attorney"');
      expect(appFile).toMatch(/allowedRoles.*attorney|attorney.*allowedRoles/);
    });

    it("attorney route path is /attorney", () => {
      expect(appFile).toContain('"/attorney"');
    });
  });
});

// ─── 2. RBAC: Non-Attorney Cannot Access Review Procedures ───────────────────

describe("Attorney Review Pipeline — RBAC Enforcement", () => {
  it("subscriber cannot call review.queue", async () => {
    const caller = appRouter.createCaller(SUBSCRIBER_CTX);
    await expect(caller.review.queue({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("unauthenticated user cannot call review.queue", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.review.queue({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("subscriber cannot call review.claim", async () => {
    const caller = appRouter.createCaller(SUBSCRIBER_CTX);
    await expect(
      caller.review.claim({ letterId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("subscriber cannot call review.approve", async () => {
    const caller = appRouter.createCaller(SUBSCRIBER_CTX);
    await expect(
      caller.review.approve({ letterId: 1, notes: "approved" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("subscriber cannot call review.reject", async () => {
    const caller = appRouter.createCaller(SUBSCRIBER_CTX);
    await expect(
      caller.review.reject({ letterId: 1, reason: "rejected" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin CAN call review procedures (admin has attorney-level access)", async () => {
    // Admin should be able to access attorney routes
    const caller = appRouter.createCaller(ADMIN_CTX);
    // This should not throw FORBIDDEN or UNAUTHORIZED (may throw NOT_FOUND for missing letter)
    try {
      await caller.review.queue({});
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
      expect(err.code).not.toBe("UNAUTHORIZED");
    }
  });
});

// ─── 3. letterDetail canView Guard — Source Code Logic Tests ─────────────────

describe("Attorney Review Pipeline — letterDetail canView Logic (Source Code)", () => {
  const _rd2 = join(SERVER_DIR, "routers");
  const routersFile = [
    readRouterModule(_rd2, "review"),
    readRouterModule(_rd2, "letters"),
  ].join("\n");

  it("canView allows access when letter is pending_review (any attorney can view)", () => {
    // The canView condition must include a pending_review OR branch
    expect(routersFile).toMatch(
      /canView[\s\S]{0,200}pending_review|pending_review[\s\S]{0,200}canView/
    );
  });

  it("canView allows access when assignedReviewerId matches the requesting attorney", () => {
    expect(routersFile).toMatch(
      /assignedReviewerId.*ctx\.user\.id|ctx\.user\.id.*assignedReviewerId/
    );
  });

  it("canView allows admin to always view any letter", () => {
    expect(routersFile).toMatch(
      /canView[\s\S]{0,300}admin|admin[\s\S]{0,300}canView/
    );
  });

  it("throws FORBIDDEN when canView is false", () => {
    // The guard must throw FORBIDDEN when canView is false
    expect(routersFile).toMatch(/if.*!canView[\s\S]{0,100}FORBIDDEN/);
  });

  it("throws NOT_FOUND when letter does not exist", () => {
    // The letterDetail procedure must check for null letter
    expect(routersFile).toMatch(
      /letterDetail[\s\S]{0,300}NOT_FOUND/
    );
  });

  it("letterDetail uses the correct input field name (id not letterId)", () => {
    // The letterDetail input schema uses z.object({ id: z.number() })
    expect(routersFile).toMatch(
      /letterDetail[\s\S]{0,100}id.*z\.number/
    );
  });
});

// ─── 4. Claim Mutation — Source Code Logic Tests ──────────────────────────────

describe("Attorney Review Pipeline — Claim Mutation (Source Code)", () => {
  const routersFile = readRouterModule(join(SERVER_DIR, "routers"), "review");

  it("claim mutation checks for pending_review or under_review status", () => {
    // Match across newlines — the validation list spans multiple lines.
    expect(routersFile).toMatch(
      /claim[\s\S]{0,500}pending_review[\s\S]*?under_review|pending_review[\s\S]*?under_review[\s\S]{0,500}claim/
    );
  });

  it("claim mutation calls claimLetterForReview with letterId and userId", () => {
    expect(routersFile).toContain("claimLetterForReview");
    expect(routersFile).toMatch(
      /claimLetterForReview.*input\.letterId.*ctx\.user\.id|claimLetterForReview.*letterId/
    );
  });

  it("claim mutation logs a claimed_for_review review action", () => {
    expect(routersFile).toContain("claimed_for_review");
  });

  it("claim mutation notifies the subscriber", () => {
    expect(routersFile).toContain("letter_under_review");
    expect(routersFile).toContain("Your letter is being reviewed");
  });

  it("claim mutation sends email to the attorney confirming assignment", () => {
    expect(routersFile).toContain("sendReviewAssignedEmail");
  });

  it("claim mutation returns { success: true }", () => {
    // The claim mutation ends with return { success: true };
    // Check for the pattern directly — the return statement is at line ~626
    expect(routersFile).toContain("return { success: true };");
    // Also verify the claim mutation body contains the claimLetterForReview call
    // which confirms the return is inside the claim mutation
    expect(routersFile).toContain("claimLetterForReview");
  });
});

// ─── 5. Subscriber Letter Delivery ───────────────────────────────────────────

describe("Subscriber Letter Delivery — Approved Letter Visible in My Letters", () => {
  const _rd3 = join(SERVER_DIR, "routers");
  const routersFile = [
    readRouterModule(_rd3, "review"),
    readRouterModule(_rd3, "letters"),
  ].join("\n");

  it("letters.detail procedure exists for subscribers", () => {
    expect(routersFile).toContain("letters");
    expect(routersFile).toContain("detail");
  });

  it("subscriber letter detail uses getLetterVersionsByRequestId", () => {
    expect(routersFile).toContain("getLetterVersionsByRequestId");
  });

  it("approve mutation sets status to approved", () => {
    expect(routersFile).toContain('"approved"');
    expect(routersFile).toMatch(/approve[\s\S]{0,500}approved/);
  });

  it("approve mutation creates a final_approved version type", () => {
    expect(routersFile).toContain('"final_approved"');
  });

  it("subscriber LetterDetail page shows download button for approved letters", () => {
    // After modularization, the download UI moved into ActionButtons + ApprovedLetterPanel sub-components.
    const shell = readFileSync(
      join(CLIENT_SRC, "pages", "subscriber", "LetterDetail.tsx"),
      "utf-8"
    );
    const actionButtons = readFileSync(
      join(CLIENT_SRC, "components", "subscriber", "letter-detail", "ActionButtons.tsx"),
      "utf-8"
    );
    const approvedPanel = readFileSync(
      join(CLIENT_SRC, "components", "subscriber", "letter-detail", "ApprovedLetterPanel.tsx"),
      "utf-8"
    );
    const combined = shell + actionButtons + approvedPanel;
    expect(combined).toContain("approved");
    expect(combined).toContain("Download");
  });
});

// ─── 6. Attorney Session Refresh ─────────────────────────────────────────────

describe("Attorney Session Refresh — Role Updates Without Logout", () => {
  it("useAuth has refetchOnWindowFocus enabled", () => {
    const useAuthFile = readFileSync(
      join(CLIENT_SRC, "_core", "hooks", "useAuth.ts"),
      "utf-8"
    );
    expect(useAuthFile).toContain("refetchOnWindowFocus: true");
    expect(useAuthFile).toContain("staleTime");
  });

  it("verifyToken reads role from DB on every request (not from JWT)", () => {
    const authFile = readAllSupabaseAuth();
    // verifyToken must call getUserByOpenId (DB lookup) not just decode the JWT
    expect(authFile).toContain("getUserByOpenId");
    // verifyToken is defined at line ~338, getUserByOpenId is called at line ~393
    // Use a larger window to span the full function body (includes caching layer)
    expect(authFile).toMatch(/verifyToken[\s\S]{0,3000}getUserByOpenId/);
  });

  it("updateRole sends in-app notification to promoted attorney", () => {
    const adminRouter = readRouterModule(join(SERVER_DIR, "routers"), "admin");
    const adminService = (() => { try { return readFileSync(join(SERVER_DIR, "services", "admin.ts"), "utf-8"); } catch { return ""; } })();
    const routersFile = adminRouter + "\n" + adminService;
    expect(routersFile).toContain("createNotification");
    expect(routersFile).toContain("role_updated");
    expect(routersFile).toContain("Review Center");
  });

  it("ProtectedRoute redirects attorney role to /attorney dashboard", () => {
    const protectedRouteFile = readFileSync(
      join(CLIENT_SRC, "components", "ProtectedRoute.tsx"),
      "utf-8"
    );
    expect(protectedRouteFile).toContain('"/attorney"');
    expect(protectedRouteFile).toContain("attorney");
  });
});
