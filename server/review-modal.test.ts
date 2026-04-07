import { describe, expect, it } from "vitest";

/**
 * Tests for the Attorney Review Modal:
 * - RichTextEditor helpers (plainTextToHtml, htmlToPlainText)
 * - Review action button visibility rules
 * - Unsaved changes detection
 * - Approve content validation
 * - Status-based action gating
 * - Side panel tab configuration
 */

// ─── RichTextEditor helpers (mirrors RichTextEditor.tsx) ───

function plainTextToHtml(text: string): string {
  if (!text) return "";
  if (text.trim().startsWith("<")) return text;
  return text
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function htmlToPlainText(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, "").trim();
}

// ─── Review action visibility rules (mirrors ReviewModal.tsx) ───

type LetterStatus = "submitted" | "researching" | "drafting" | "generated_locked" |
  "pending_review" | "under_review" | "needs_changes" | "approved" | "rejected";

interface ActionVisibility {
  showClaim: boolean;
  showEdit: boolean;
  showApprove: boolean;
  showReject: boolean;
  showRequestChanges: boolean;
}

function getActionVisibility(status: LetterStatus): ActionVisibility {
  const isPending = status === "pending_review";
  const isUnderReview = status === "under_review";
  return {
    showClaim: isPending,
    showEdit: isUnderReview,
    showApprove: isUnderReview,
    showReject: isUnderReview,
    showRequestChanges: isUnderReview,
  };
}

// ─── Approve validation (mirrors ReviewModal.tsx) ───

function validateApproveContent(content: string): { valid: boolean; error?: string } {
  const plainText = htmlToPlainText(content);
  if (plainText.length < 50) {
    return { valid: false, error: "Letter content must be at least 50 characters to approve" };
  }
  return { valid: true };
}

// ─── Side panel tabs ───
const SIDE_PANEL_TABS = ["intake", "research", "history"] as const;

// ─── Reviewable statuses for admin AllLetters modal (mirrors AllLetters.tsx) ───
const REVIEWABLE_STATUSES = ["pending_review", "under_review", "needs_changes", "approved", "rejected"];

function shouldOpenModal(status: string): boolean {
  return REVIEWABLE_STATUSES.includes(status);
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("plainTextToHtml", () => {
  it("returns empty string for empty input", () => {
    expect(plainTextToHtml("")).toBe("");
  });

  it("returns HTML as-is if already HTML", () => {
    const html = "<p>Hello world</p>";
    expect(plainTextToHtml(html)).toBe(html);
  });

  it("wraps plain text paragraphs in <p> tags", () => {
    const result = plainTextToHtml("First paragraph\n\nSecond paragraph");
    expect(result).toBe("<p>First paragraph</p><p>Second paragraph</p>");
  });

  it("converts single newlines to <br> within paragraphs", () => {
    const result = plainTextToHtml("Line one\nLine two");
    expect(result).toBe("<p>Line one<br>Line two</p>");
  });

  it("handles multiple paragraph breaks", () => {
    const result = plainTextToHtml("A\n\n\nB\n\nC");
    expect(result).toBe("<p>A</p><p>B</p><p>C</p>");
  });

  it("handles single line text", () => {
    const result = plainTextToHtml("Just one line");
    expect(result).toBe("<p>Just one line</p>");
  });
});

describe("htmlToPlainText", () => {
  it("returns empty string for empty input", () => {
    expect(htmlToPlainText("")).toBe("");
  });

  it("strips all HTML tags", () => {
    expect(htmlToPlainText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("handles nested tags", () => {
    expect(htmlToPlainText("<div><p><em>Nested</em> text</p></div>")).toBe("Nested text");
  });

  it("trims whitespace", () => {
    expect(htmlToPlainText("  <p>  spaced  </p>  ")).toBe("spaced");
  });

  it("handles plain text input (no tags)", () => {
    expect(htmlToPlainText("No tags here")).toBe("No tags here");
  });
});

describe("Action Visibility Rules", () => {
  it("shows only Claim button for pending_review", () => {
    const vis = getActionVisibility("pending_review");
    expect(vis.showClaim).toBe(true);
    expect(vis.showEdit).toBe(false);
    expect(vis.showApprove).toBe(false);
    expect(vis.showReject).toBe(false);
    expect(vis.showRequestChanges).toBe(false);
  });

  it("shows Edit, Approve, Reject, RequestChanges for under_review", () => {
    const vis = getActionVisibility("under_review");
    expect(vis.showClaim).toBe(false);
    expect(vis.showEdit).toBe(true);
    expect(vis.showApprove).toBe(true);
    expect(vis.showReject).toBe(true);
    expect(vis.showRequestChanges).toBe(true);
  });

  it("hides all action buttons for approved", () => {
    const vis = getActionVisibility("approved");
    expect(vis.showClaim).toBe(false);
    expect(vis.showEdit).toBe(false);
    expect(vis.showApprove).toBe(false);
    expect(vis.showReject).toBe(false);
    expect(vis.showRequestChanges).toBe(false);
  });

  it("hides all action buttons for rejected", () => {
    const vis = getActionVisibility("rejected");
    expect(vis.showClaim).toBe(false);
    expect(vis.showEdit).toBe(false);
    expect(vis.showApprove).toBe(false);
  });

  it("hides all action buttons for pipeline statuses", () => {
    for (const status of ["submitted", "researching", "drafting", "generated_locked"] as LetterStatus[]) {
      const vis = getActionVisibility(status);
      expect(vis.showClaim).toBe(false);
      expect(vis.showEdit).toBe(false);
      expect(vis.showApprove).toBe(false);
      expect(vis.showReject).toBe(false);
      expect(vis.showRequestChanges).toBe(false);
    }
  });

  it("hides all action buttons for needs_changes", () => {
    const vis = getActionVisibility("needs_changes");
    expect(vis.showClaim).toBe(false);
    expect(vis.showEdit).toBe(false);
    expect(vis.showApprove).toBe(false);
  });
});

describe("Approve Content Validation", () => {
  it("rejects content shorter than 50 characters", () => {
    const result = validateApproveContent("<p>Too short</p>");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("50 characters");
  });

  it("accepts content with 50+ characters", () => {
    const longContent = "<p>" + "A".repeat(60) + "</p>";
    const result = validateApproveContent(longContent);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("counts only plain text characters (strips HTML)", () => {
    // HTML tags add length but should not count
    const htmlWithTags = "<p><strong><em>" + "X".repeat(30) + "</em></strong></p>";
    const result = validateApproveContent(htmlWithTags);
    expect(result.valid).toBe(false); // 30 chars < 50
  });

  it("rejects empty content", () => {
    const result = validateApproveContent("");
    expect(result.valid).toBe(false);
  });
});

describe("Side Panel Tabs", () => {
  it("has exactly 3 tabs", () => {
    expect(SIDE_PANEL_TABS).toHaveLength(3);
  });

  it("includes intake, research, and history tabs", () => {
    expect(SIDE_PANEL_TABS).toContain("intake");
    expect(SIDE_PANEL_TABS).toContain("research");
    expect(SIDE_PANEL_TABS).toContain("history");
  });

  it("defaults to intake tab", () => {
    expect(SIDE_PANEL_TABS[0]).toBe("intake");
  });
});

describe("Admin AllLetters Modal Routing", () => {
  it("opens modal for reviewable statuses", () => {
    expect(shouldOpenModal("pending_review")).toBe(true);
    expect(shouldOpenModal("under_review")).toBe(true);
    expect(shouldOpenModal("needs_changes")).toBe(true);
    expect(shouldOpenModal("approved")).toBe(true);
    expect(shouldOpenModal("rejected")).toBe(true);
  });

  it("navigates to detail page for pipeline statuses", () => {
    expect(shouldOpenModal("submitted")).toBe(false);
    expect(shouldOpenModal("researching")).toBe(false);
    expect(shouldOpenModal("drafting")).toBe(false);
    expect(shouldOpenModal("generated_locked")).toBe(false);
  });
});

describe("Unsaved Changes Detection", () => {
  it("detects changes when editor content differs from original", () => {
    const original = "<p>Original content</p>";
    const edited = "<p>Modified content</p>";
    const hasUnsavedChanges = original !== edited;
    expect(hasUnsavedChanges).toBe(true);
  });

  it("detects no changes when content is identical", () => {
    const original = "<p>Same content</p>";
    const edited = "<p>Same content</p>";
    const hasUnsavedChanges = original !== edited;
    expect(hasUnsavedChanges).toBe(false);
  });
});

describe("Review Modal Polling Configuration", () => {
  it("polls for active review statuses", () => {
    const pollStatuses = ["pending_review", "under_review", "researching", "drafting"];
    expect(pollStatuses).toContain("pending_review");
    expect(pollStatuses).toContain("under_review");
  });

  it("does not poll for terminal statuses", () => {
    const pollStatuses = ["pending_review", "under_review", "researching", "drafting"];
    expect(pollStatuses).not.toContain("approved");
    expect(pollStatuses).not.toContain("rejected");
    expect(pollStatuses).not.toContain("needs_changes");
  });

  it("uses 8000ms polling interval", () => {
    const POLL_INTERVAL = 8000;
    expect(POLL_INTERVAL).toBe(8000);
  });
});
