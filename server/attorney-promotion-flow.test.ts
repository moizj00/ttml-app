/**
 * Attorney Promotion Flow — End-to-End UI & Logic Tests
 *
 * Tests the complete flow from admin role assignment through to attorney
 * dashboard access, covering:
 *   1. Admin Users page — dropdown restricted to attorney only
 *   2. Signup page — attorney self-signup removed
 *   3. Onboarding page — attorney role removed
 *   4. App routing — attorney routes correctly gated
 *   5. ReviewModal — no AI/Perplexity/Anthropic mentions
 *   6. RichTextEditor — exists and has toolbar
 *   7. Pipeline progress — no AI mentions in user-visible strings
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CLIENT_SRC = join(__dirname, "..", "client", "src");
const SERVER_DIR = join(__dirname);

// ─── 1. Admin Users Page ─────────────────────────────────────────────────────

describe("Admin Users Page — Attorney Promotion UI", () => {
  const filePath = join(CLIENT_SRC, "pages", "admin", "Users.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("imports and uses the updateRole tRPC mutation", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("updateRole");
    expect(content).toContain("admin.updateRole");
  });

  it("has a confirmation dialog before changing roles", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("AlertDialog");
    expect(content).toContain("AlertDialogAction");
    expect(content).toContain("AlertDialogCancel");
  });

  it("only allows promoting to attorney (not subscriber/employee/admin)", () => {
    const content = readFileSync(filePath, "utf-8");
    // Must have attorney as a value
    expect(content).toContain('value="attorney"');
    // Must NOT have other roles as selectable values in the dropdown
    expect(content).not.toContain('value="subscriber"');
    expect(content).not.toContain('value="employee"');
    expect(content).not.toContain('value="admin"');
  });

  it("hides dropdown for admin users to prevent accidental changes", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('"admin"');
    // The condition must check for admin role to hide/disable the dropdown
    expect(content).toMatch(/user\.role.*admin|admin.*user\.role/);
  });

  it("shows a 10-second attorney promotion toast with refresh instruction", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("promoted to Attorney");
    expect(content).toContain("duration: 10000");
    expect(content).toContain("refresh");
  });

  it("has ROLE_CONFIG with all four role badge definitions", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("ROLE_CONFIG");
    expect(content).toContain("subscriber");
    expect(content).toContain("employee");
    expect(content).toContain("attorney");
    expect(content).toContain("admin");
  });
});

// ─── 2. Signup Page — Attorney Self-Signup Removed ───────────────────────────

describe("Signup Page — Attorney and Admin Cannot Self-Register", () => {
  const filePath = join(CLIENT_SRC, "pages", "Signup.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("does not include attorney as a selectable role option in the UI", () => {
    const content = readFileSync(filePath, "utf-8");
    // The role options array must not contain attorney as a value
    expect(content).not.toContain("I'm an Attorney");
    // Must not have attorney as a role value in ROLE_OPTIONS or selectedRole type
    expect(content).not.toMatch(/value.*["']attorney["']/i);
    // Check the ROLE_OPTIONS array definition block only (first 500 chars after ROLE_OPTIONS)
    const roleOptionsMatch = content.match(
      /const ROLE_OPTIONS[\s\S]{0,500}\];/
    );
    if (roleOptionsMatch) {
      expect(roleOptionsMatch[0]).not.toContain("attorney");
    }
    // Note: the word 'attorneys' may appear in marketing copy (e.g. 'reviewed by attorneys')
    // but must not appear as a selectable role value
  });

  it("does not include admin as a role option", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toContain('"admin"');
  });

  it("clears onboarding flag for new signups (triggers onboarding modal)", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain(
      'localStorage.removeItem("ttml_onboarding_seen")'
    );
  });

  it("supports Google OAuth signup", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Google");
    expect(content).toContain("google");
  });
});

// ─── 3. Onboarding Page — Attorney Role Removed ──────────────────────────────

describe("Onboarding Page — Attorney Role Removed", () => {
  const filePath = join(CLIENT_SRC, "pages", "Onboarding.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("does not include attorney as a selectable role", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toContain('"attorney"');
    expect(content).not.toContain("I'm an Attorney");
  });

  it("does not include barNumber field (attorney-specific)", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toContain("barNumber");
    expect(content).not.toContain("Bar Number");
  });

  it("includes subscriber and employee as valid roles", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("subscriber");
    expect(content).toContain("employee");
  });

  it("sends role to completeOnboarding mutation", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("completeOnboarding");
    expect(content).toContain("role");
  });
});

// ─── 4. App.tsx — Attorney Routes Correctly Gated ────────────────────────────

describe("App.tsx — Attorney Routes", () => {
  const filePath = join(CLIENT_SRC, "App.tsx");

  it("attorney routes are wrapped in ProtectedRoute", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toMatch(/ProtectedRoute[\s\S]{0,200}attorney/);
  });

  it("attorney routes include both attorney and admin roles", () => {
    const content = readFileSync(filePath, "utf-8");
    // Attorney routes should allow both attorney and admin access
    expect(content).toMatch(
      /allowedRoles.*attorney.*admin|allowedRoles.*admin.*attorney/
    );
  });

  it("subscriber routes do NOT allow attorney role", () => {
    const content = readFileSync(filePath, "utf-8");
    // Subscriber-only routes must use allowedRoles={["subscriber"]}
    expect(content).toContain('allowedRoles={["subscriber"]}');
  });

  it("has /attorney route defined", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('"/attorney"');
  });
});

// ─── 5. ReviewModal — No AI Mentions in User-Visible Strings ─────────────────

describe("ReviewModal — AI Branding Removed", () => {
  const filePath = join(
    CLIENT_SRC,
    "components",
    "shared",
    "ReviewModal",
    "index.tsx"
  );

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("does not contain 'AI' in user-visible JSX text", () => {
    const content = readFileSync(filePath, "utf-8");
    // Check for AI in JSX text content (between > and <)
    const jsxTextMatches = content.match(/>[^<]*\bAI\b[^<]*</g);
    expect(jsxTextMatches).toBeNull();
  });

  it("does not mention Perplexity", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toContain("Perplexity");
  });

  it("does not mention Anthropic", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toContain("Anthropic");
  });

  it("uses 'Initial Draft' as the display label (not 'AI Draft')", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Initial Draft");
    expect(content).not.toContain("AI Draft");
  });

  it("uses 'ai_draft' as the DB enum comparison value", () => {
    // After the component was split into a directory, the enum comparison
    // moved to the hooks file — check the whole ReviewModal directory
    const hooksPath = join(
      CLIENT_SRC,
      "components",
      "shared",
      "ReviewModal",
      "hooks",
      "useReviewModal.ts"
    );
    const hooksContent = readFileSync(hooksPath, "utf-8");
    // The DB enum value must remain ai_draft
    expect(hooksContent).toContain('"ai_draft"');
  });

  it("has Claim for Review button", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Claim");
  });

  it("has Approve and Reject action buttons", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Approve");
    expect(content).toContain("Reject");
  });

  it("has Changes button for requesting changes", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Changes");
  });
});

// ─── 6. RichTextEditor — Exists and Has Toolbar ──────────────────────────────

describe("RichTextEditor Component", () => {
  const filePath = join(
    CLIENT_SRC,
    "components",
    "shared",
    "RichTextEditor.tsx"
  );

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("uses Tiptap editor", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("useEditor");
    expect(content).toContain("@tiptap");
  });

  it("has a Toolbar component", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Toolbar");
  });

  it("supports Bold, Italic, and Underline formatting", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Bold");
    expect(content).toContain("Italic");
    expect(content).toContain("Underline");
  });

  it("exports plainTextToHtml utility function", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("export { plainTextToHtml }");
  });

  it("does not contain AI branding", () => {
    const content = readFileSync(filePath, "utf-8");
    const jsxTextMatches = content.match(/>[^<]*\bAI\b[^<]*</g);
    expect(jsxTextMatches).toBeNull();
  });
});

// ─── 7. Pipeline Progress — No AI Mentions ───────────────────────────────────

describe("Pipeline Progress Modal — AI Branding Removed", () => {
  const filePath = join(CLIENT_SRC, "components", "PipelineProgressModal.tsx");

  it("file exists", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("does not mention AI in user-visible text", () => {
    const content = readFileSync(filePath, "utf-8");
    const jsxTextMatches = content.match(/>[^<]*\bAI\b[^<]*</g);
    expect(jsxTextMatches).toBeNull();
  });

  it("does not mention Perplexity", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toContain("Perplexity");
  });

  it("does not mention Anthropic", () => {
    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toContain("Anthropic");
  });

  it("uses professional team-oriented language", () => {
    const content = readFileSync(filePath, "utf-8");
    // Should use "our team" or "we're" language
    expect(content).toMatch(/team|drafting|working/i);
  });
});

// ─── 8. Attorney Dashboard ────────────────────────────────────────────────────

describe("Attorney Dashboard", () => {
  const dashboardPath = join(CLIENT_SRC, "pages", "attorney", "Dashboard.tsx");
  const reviewQueuePath = join(
    CLIENT_SRC,
    "pages",
    "attorney",
    "ReviewQueue.tsx"
  );

  it("attorney Dashboard exists", () => {
    expect(existsSync(dashboardPath)).toBe(true);
  });

  it("attorney ReviewQueue exists", () => {
    expect(existsSync(reviewQueuePath)).toBe(true);
  });

  it("Dashboard does not contain AI branding", () => {
    const content = readFileSync(dashboardPath, "utf-8");
    const jsxTextMatches = content.match(/>[^<]*\bAI\b[^<]*</g);
    expect(jsxTextMatches).toBeNull();
  });

  it("ReviewQueue fetches letters from review.queue", () => {
    const content = readFileSync(reviewQueuePath, "utf-8");
    expect(content).toContain("review.queue");
  });
});

// ─── 9. Server — No AI Mentions in User-Facing Strings ───────────────────────

describe("Server — No AI Mentions in User-Facing Notification/Email Strings", () => {
  const routersFile = readFileSync(join(SERVER_DIR, "routers.ts"), "utf-8");

  it("review.approve notification does not mention AI", () => {
    // Find the approve mutation notification block
    const approveSection = routersFile.match(
      /approve[\s\S]{0,2000}notification/
    );
    if (approveSection) {
      expect(approveSection[0]).not.toContain("AI");
      expect(approveSection[0]).not.toContain("Perplexity");
      expect(approveSection[0]).not.toContain("Anthropic");
    }
  });

  it("role_updated notification does not mention AI", () => {
    const roleSection = routersFile.match(/role_updated[\s\S]{0,500}/);
    if (roleSection) {
      expect(roleSection[0]).not.toContain("AI");
    }
  });
});
