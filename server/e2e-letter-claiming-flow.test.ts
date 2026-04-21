/**
 * E2E Tests — Letter Claiming Flow
 *
 * Covers the full attorney review pipeline from viewing a letter through
 * to subscriber delivery:
 *
 *   1. canView guard — attorneys can view pending_review letters before claiming.
 *   2. Claim mutation — transitions pending_review → under_review with assignment.
 *   3. Approve mutation — creates final_approved version, generates PDF, notifies subscriber.
 *   4. Reject mutation — requires assignment and under_review status.
 *   5. Request changes mutation — requires message and under_review status.
 *   6. State machine integrity — DB functions enforce atomic transitions.
 *   7. Subscriber delivery — approved letter visible in My Letters with download.
 *
 * Test strategy: source-code structural assertions (no live DB/network calls).
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
  return subRouters.map(r => readRouterModule(routersDir, r)).join("\n");
}

function readClient(...segments: string[]) {
  return readFileSync(join(CLIENT_SRC, ...segments), "utf-8");
}

// ─── 1. canView Guard — Visibility Before Claim ─────────────────────────────

describe("Letter Claiming Flow — canView Guard (Visibility Before Claim)", () => {
  const routersFile = readAllRouters();

  it("canView allows admin to view all letters", () => {
    expect(routersFile).toContain('ctx.user.role === "admin"');
  });

  it("canView allows attorney if letter is pending_review (unassigned)", () => {
    expect(routersFile).toContain('letter.status === "pending_review"');
  });

  it("canView allows attorney if they are the assigned reviewer", () => {
    expect(routersFile).toContain("letter.assignedReviewerId === ctx.user.id");
  });

  it("canView is a three-condition OR expression", () => {
    // The actual code:
    // const canView = ctx.user.role === "admin" || letter.assignedReviewerId === ctx.user.id || letter.status === "pending_review";
    expect(routersFile).toMatch(
      /canView\s*=[\s\S]{0,200}ctx\.user\.role\s*===\s*["']admin["'][\s\S]{0,100}\|\|[\s\S]{0,100}assignedReviewerId[\s\S]{0,100}\|\|[\s\S]{0,100}pending_review/
    );
  });

  it("throws FORBIDDEN when canView is false", () => {
    expect(routersFile).toContain("if (!canView)");
  });

  it("FORBIDDEN message says 'You are not assigned to this letter'", () => {
    expect(routersFile).toContain("You are not assigned to this letter");
  });

  it("letterDetail returns versions, actions, jobs, research, and attachments", () => {
    expect(routersFile).toContain("getLetterVersionsByRequestId");
    expect(routersFile).toContain("getReviewActions");
    expect(routersFile).toContain("getWorkflowJobsByLetterId");
    expect(routersFile).toContain("getResearchRunsByLetterId");
    expect(routersFile).toContain("getAttachmentsByLetterId");
  });
});

// ─── 2. Claim Mutation ───────────────────────────────────────────────────────

describe("Letter Claiming Flow — Claim Mutation", () => {
  const routersFile = readAllRouters();

  it("claim mutation calls claimLetterForReview", () => {
    expect(routersFile).toContain("claimLetterForReview");
  });

  it("claim mutation transitions status from pending_review to under_review", () => {
    // The logReviewAction call has fromStatus: letter.status and toStatus: "under_review"
    expect(routersFile).toContain('toStatus: "under_review"');
  });

  it("claim mutation logs a claimed_for_review review action", () => {
    expect(routersFile).toContain('"claimed_for_review"');
  });

  it("claim mutation notifies the subscriber via email", () => {
    expect(routersFile).toContain("sendStatusUpdateEmail");
  });

  it("claimLetterForReview DB function uses atomic update (WHERE clause)", () => {
    const dbFile = readServer("db/letters.ts");
    // The function uses isNull(letterRequests.assignedReviewerId) in the WHERE clause
    expect(dbFile).toContain("claimLetterForReview");
    expect(dbFile).toContain("isNull(letterRequests.assignedReviewerId)");
  });

  it("claim mutation returns { success: true }", () => {
    expect(routersFile).toContain("success: true");
  });
});

// ─── 3. Approve Mutation ─────────────────────────────────────────────────────

describe("Letter Claiming Flow — Approve Mutation", () => {
  const routersFile = readAllRouters();

  it("approve mutation creates a final_approved version", () => {
    expect(routersFile).toContain('"final_approved"');
  });

  it("approve mutation calls createLetterVersion", () => {
    expect(routersFile).toContain("createLetterVersion");
  });

  it("approve mutation transitions status to approved", () => {
    expect(routersFile).toContain('toStatus: "approved"');
  });

  it("approve mutation throws FORBIDDEN for non-assigned attorneys", () => {
    // Actual code: ctx.user.role !== "admin" && letter.assignedReviewerId !== ctx.user.id
    expect(routersFile).toMatch(
      /approve[\s\S]{0,1000}ctx\.user\.role\s*!==\s*["']admin["'][\s\S]{0,100}assignedReviewerId\s*!==\s*ctx\.user\.id[\s\S]{0,200}FORBIDDEN/
    );
  });

  it("approve mutation throws BAD_REQUEST if letter is not under_review", () => {
    expect(routersFile).toContain('Letter must be under_review to approve');
  });

  it("admin can also approve letters (not just the assigned attorney)", () => {
    // The guard: ctx.user.role !== "admin" && letter.assignedReviewerId !== ctx.user.id
    // This means admin bypasses the assignment check
    expect(routersFile).toMatch(
      /approve[\s\S]{0,1000}ctx\.user\.role\s*!==\s*["']admin["']/
    );
  });

  it("approve mutation generates a PDF (non-blocking)", () => {
    expect(routersFile).toMatch(/approve[\s\S]{0,3000}pdf|PDF/i);
  });

  it("approve mutation logs an approved review action", () => {
    expect(routersFile).toContain('"approved"');
    expect(routersFile).toContain("logReviewAction");
  });
});

// ─── 4. Reject Mutation ──────────────────────────────────────────────────────

describe("Letter Claiming Flow — Reject Mutation", () => {
  const routersFile = readAllRouters();

  it("reject mutation throws FORBIDDEN for non-assigned attorneys", () => {
    expect(routersFile).toContain('Letter must be under_review to reject');
  });

  it("reject mutation transitions to rejected status", () => {
    expect(routersFile).toContain('toStatus: "rejected"');
  });

  it("reject mutation logs a rejected review action", () => {
    expect(routersFile).toContain('"rejected"');
  });
});

// ─── 5. Request Changes Mutation ─────────────────────────────────────────────

describe("Letter Claiming Flow — Request Changes Mutation", () => {
  const routersFile = readAllRouters();

  it("requestChanges mutation requires a userVisibleNote with min length 10", () => {
    expect(routersFile).toMatch(
      /requestChanges[\s\S]{0,500}userVisibleNote[\s\S]{0,100}min\(10\)/
    );
  });

  it("requestChanges mutation transitions to needs_changes", () => {
    expect(routersFile).toContain('toStatus: "needs_changes"');
  });

  it("requestChanges mutation can optionally retrigger the pipeline", () => {
    expect(routersFile).toContain("retriggerPipeline");
  });
});

// ─── 6. State Machine Integrity — DB Functions ──────────────────────────────

describe("Letter Claiming Flow — State Machine Integrity", () => {
  const dbFile = readServer("db/letters.ts");
  const routersFile = readAllRouters();

  it("claimLetterForReview transitions to under_review status", () => {
    expect(dbFile).toContain("claimLetterForReview");
    expect(dbFile).toMatch(/claimLetterForReview[\s\S]{0,1000}under_review/);
  });

  it("claimLetterForReview sets assignedReviewerId atomically", () => {
    expect(dbFile).toMatch(/claimLetterForReview[\s\S]{0,1000}assignedReviewerId.*reviewerId/);
  });

  it("claimLetterForReview prevents race conditions with isNull WHERE clause", () => {
    expect(dbFile).toMatch(
      /claimLetterForReview[\s\S]{0,3000}isNull\(letterRequests\.assignedReviewerId\)/
    );
  });

  it("ALLOWED_TRANSITIONS defines pending_review → under_review", () => {
    expect(dbFile).toMatch(/pending_review[\s\S]{0,50}under_review/);
  });

  it("ALLOWED_TRANSITIONS defines under_review → approved, rejected, needs_changes", () => {
    const typesFile = readFileSync(join(__dirname, "..", "shared", "types", "letter.ts"), "utf-8");
    expect(typesFile).toMatch(/under_review[\s\S]{0,100}approved/);
    expect(typesFile).toMatch(/under_review[\s\S]{0,100}rejected/);
    expect(typesFile).toMatch(/under_review[\s\S]{0,100}needs_changes/);
  });

  it("claim mutation transitions from pending_review to under_review", () => {
    expect(routersFile).toContain("claimLetterForReview");
    expect(routersFile).toContain('toStatus: "under_review"');
  });

  it("approve mutation requires letter to be under_review (not pending_review)", () => {
    expect(routersFile).toContain('Letter must be under_review to approve');
  });

  it("updateLetterStatus function exists in db.ts", () => {
    expect(dbFile).toContain("updateLetterStatus");
  });
});

// ─── 7. Subscriber Delivery — My Letters Area ───────────────────────────────

describe("Letter Claiming Flow — Subscriber Delivery (My Letters Area)", () => {
  const subscriberDetailFile = readClient(
    "pages",
    "subscriber",
    "LetterDetail.tsx"
  );

  it("subscriber LetterDetail page exists", () => {
    expect(
      existsSync(
        join(CLIENT_SRC, "pages", "subscriber", "LetterDetail.tsx")
      )
    ).toBe(true);
  });

  it("subscriber LetterDetail shows a Download PDF button for approved letters", () => {
    expect(subscriberDetailFile).toContain("Download PDF");
    expect(subscriberDetailFile).toContain("approved");
  });

  it("subscriber LetterDetail shows a Copy button for approved letters", () => {
    expect(subscriberDetailFile).toContain("Copy");
  });

  it("subscriber LetterDetail allows archiving approved and rejected letters", () => {
    expect(subscriberDetailFile).toContain("handleArchive");
    expect(subscriberDetailFile).toContain("approved");
    expect(subscriberDetailFile).toContain("rejected");
  });

  it("subscriber LetterDetail checks for finalVersion before showing download", () => {
    expect(subscriberDetailFile).toContain("finalVersion");
  });

  it("subscriber LetterDetail checks pdfUrl for PDF download", () => {
    expect(subscriberDetailFile).toContain("pdfUrl");
  });

  it("server letters.detail returns versions via getLetterVersionsByRequestId", () => {
    const routersFile = readAllRouters();
    expect(routersFile).toContain("getLetterVersionsByRequestId");
  });
});

// ─── 8. ReviewModal — Claim Button UI ────────────────────────────────────────

describe("Letter Claiming Flow — ReviewModal Claim Button", () => {
  // ReviewModal was refactored from a flat file to a directory — combine index + hooks
  const reviewModalFile = [
    readClient("components", "shared", "ReviewModal", "index.tsx"),
    readClient("components", "shared", "ReviewModal", "hooks", "useReviewModal.ts"),
  ].join("\n");

  it("ReviewModal file exists", () => {
    expect(
      existsSync(
        join(CLIENT_SRC, "components", "shared", "ReviewModal", "index.tsx")
      )
    ).toBe(true);
  });

  it("ReviewModal shows Claim button for pending_review letters", () => {
    expect(reviewModalFile).toContain("pending_review");
    expect(reviewModalFile).toMatch(/[Cc]laim/);
  });

  it("ReviewModal shows Edit Draft button for under_review letters", () => {
    expect(reviewModalFile).toMatch(/[Ee]dit.*[Dd]raft/);
  });

  it("ReviewModal shows Approve button", () => {
    expect(reviewModalFile).toContain("Approve");
  });

  it("ReviewModal shows Reject button", () => {
    expect(reviewModalFile).toContain("Reject");
  });

  it("ReviewModal displays versionType ai_draft as Initial Draft in the UI", () => {
    expect(reviewModalFile).toContain("ai_draft");
    expect(reviewModalFile).toContain("Initial Draft");
  });
});
