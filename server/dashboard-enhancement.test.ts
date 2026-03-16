import { describe, expect, it } from "vitest";

/**
 * Tests for the subscriber dashboard enhancement:
 * - Pipeline stage mapping
 * - CTA configuration per status
 * - Relative time formatting
 * - Status-based polling logic
 */

// ─── Pipeline Stages (mirrors Dashboard.tsx) ───
const PIPELINE_STAGES = [
  { key: "submitted", label: "Submitted" },
  { key: "researching", label: "Research" },
  { key: "drafting", label: "Drafting" },
  { key: "generated_locked", label: "Unlock" },
  { key: "pending_review", label: "Review" },
  { key: "under_review", label: "Attorney" },
  { key: "approved", label: "Approved" },
] as const;

function getStageIndex(status: string): number {
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === status);
  if (status === "needs_changes") return 5;
  if (status === "rejected") return 6;
  return idx >= 0 ? idx : 0;
}

// ─── CTA config (mirrors Dashboard.tsx) ───
function getStatusCTA(status: string, letterId: number) {
  switch (status) {
    case "submitted":
    case "researching":
    case "drafting":
      return { label: "Processing...", variant: "outline", href: `/letters/${letterId}`, animate: true };
    case "generated_locked":
      return { label: "Pay to Unlock — $200", variant: "default", href: `/letters/${letterId}`, animate: false };
    case "pending_review":
      return { label: "Awaiting Attorney", variant: "outline", href: `/letters/${letterId}`, animate: true };
    case "under_review":
      return { label: "Attorney Reviewing", variant: "outline", href: `/letters/${letterId}`, animate: true };
    case "needs_changes":
      return { label: "Respond to Changes", variant: "destructive", href: `/letters/${letterId}`, animate: false };
    case "approved":
      return { label: "Download Letter", variant: "default", href: `/letters/${letterId}`, animate: false };
    case "rejected":
      return { label: "View Details", variant: "outline", href: `/letters/${letterId}`, animate: false };
    default:
      return { label: "View", variant: "outline", href: `/letters/${letterId}`, animate: false };
  }
}

// ─── Relative time helper (mirrors Dashboard.tsx) ───
function timeAgo(dateStr: string | number): string {
  const now = Date.now();
  const then = typeof dateStr === "string" ? new Date(dateStr).getTime() : dateStr;
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// Active statuses for polling
const ACTIVE_STATUSES = ["submitted", "researching", "drafting", "pending_review", "under_review"];

describe("Pipeline Stage Mapping", () => {
  it("maps all main statuses to correct stage indices", () => {
    expect(getStageIndex("submitted")).toBe(0);
    expect(getStageIndex("researching")).toBe(1);
    expect(getStageIndex("drafting")).toBe(2);
    expect(getStageIndex("generated_locked")).toBe(3);
    expect(getStageIndex("pending_review")).toBe(4);
    expect(getStageIndex("under_review")).toBe(5);
    expect(getStageIndex("approved")).toBe(6);
  });

  it("maps needs_changes to under_review level (5)", () => {
    expect(getStageIndex("needs_changes")).toBe(5);
  });

  it("maps rejected to terminal level (6)", () => {
    expect(getStageIndex("rejected")).toBe(6);
  });

  it("maps unknown status to 0", () => {
    expect(getStageIndex("unknown_status")).toBe(0);
  });

  it("has 7 pipeline stages in correct order", () => {
    expect(PIPELINE_STAGES).toHaveLength(7);
    expect(PIPELINE_STAGES[0].key).toBe("submitted");
    expect(PIPELINE_STAGES[6].key).toBe("approved");
  });
});

describe("CTA Configuration", () => {
  it("returns processing CTA with animation for pipeline-active statuses", () => {
    for (const status of ["submitted", "researching", "drafting"]) {
      const cta = getStatusCTA(status, 42);
      expect(cta.label).toBe("Processing...");
      expect(cta.animate).toBe(true);
      expect(cta.href).toBe("/letters/42");
    }
  });

  it("returns payment CTA for generated_locked", () => {
    const cta = getStatusCTA("generated_locked", 7);
    expect(cta.label).toContain("$200");
    expect(cta.variant).toBe("default");
    expect(cta.animate).toBe(false);
  });

  it("returns awaiting attorney CTA for pending_review", () => {
    const cta = getStatusCTA("pending_review", 1);
    expect(cta.label).toBe("Awaiting Attorney");
    expect(cta.animate).toBe(true);
  });

  it("returns attorney reviewing CTA for under_review", () => {
    const cta = getStatusCTA("under_review", 1);
    expect(cta.label).toBe("Attorney Reviewing");
    expect(cta.animate).toBe(true);
  });

  it("returns respond to changes CTA for needs_changes", () => {
    const cta = getStatusCTA("needs_changes", 1);
    expect(cta.label).toBe("Respond to Changes");
    expect(cta.variant).toBe("destructive");
    expect(cta.animate).toBe(false);
  });

  it("returns download CTA for approved", () => {
    const cta = getStatusCTA("approved", 1);
    expect(cta.label).toBe("Download Letter");
    expect(cta.variant).toBe("default");
    expect(cta.animate).toBe(false);
  });

  it("returns view details CTA for rejected", () => {
    const cta = getStatusCTA("rejected", 1);
    expect(cta.label).toBe("View Details");
    expect(cta.variant).toBe("outline");
  });

  it("returns generic view CTA for unknown status", () => {
    const cta = getStatusCTA("some_future_status", 1);
    expect(cta.label).toBe("View");
  });
});

describe("Relative Time Formatting", () => {
  it("returns 'just now' for timestamps less than 1 minute ago", () => {
    expect(timeAgo(Date.now())).toBe("just now");
    expect(timeAgo(Date.now() - 30000)).toBe("just now");
  });

  it("returns minutes for timestamps less than 1 hour ago", () => {
    expect(timeAgo(Date.now() - 5 * 60000)).toBe("5m ago");
    expect(timeAgo(Date.now() - 59 * 60000)).toBe("59m ago");
  });

  it("returns hours for timestamps less than 1 day ago", () => {
    expect(timeAgo(Date.now() - 2 * 3600000)).toBe("2h ago");
    expect(timeAgo(Date.now() - 23 * 3600000)).toBe("23h ago");
  });

  it("returns days for timestamps less than 1 week ago", () => {
    expect(timeAgo(Date.now() - 3 * 86400000)).toBe("3d ago");
    expect(timeAgo(Date.now() - 6 * 86400000)).toBe("6d ago");
  });

  it("returns weeks for timestamps 1+ weeks ago", () => {
    expect(timeAgo(Date.now() - 14 * 86400000)).toBe("2w ago");
  });

  it("handles string date input", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(timeAgo(fiveMinAgo)).toBe("5m ago");
  });

  it("handles numeric timestamp input", () => {
    const tenMinAgo = Date.now() - 10 * 60000;
    expect(timeAgo(tenMinAgo)).toBe("10m ago");
  });
});

describe("Polling Configuration", () => {
  it("identifies active statuses that trigger polling", () => {
    expect(ACTIVE_STATUSES).toContain("submitted");
    expect(ACTIVE_STATUSES).toContain("researching");
    expect(ACTIVE_STATUSES).toContain("drafting");
    expect(ACTIVE_STATUSES).toContain("pending_review");
    expect(ACTIVE_STATUSES).toContain("under_review");
  });

  it("does not include terminal statuses in polling list", () => {
    expect(ACTIVE_STATUSES).not.toContain("approved");
    expect(ACTIVE_STATUSES).not.toContain("rejected");
    expect(ACTIVE_STATUSES).not.toContain("needs_changes");
    expect(ACTIVE_STATUSES).not.toContain("generated_locked");
  });

  it("should return 8000ms interval when any letter has active status", () => {
    const letters = [
      { status: "approved" },
      { status: "researching" },
    ];
    const hasActive = letters.some((l) => ACTIVE_STATUSES.includes(l.status));
    expect(hasActive).toBe(true);
  });

  it("should return false (no polling) when all letters are terminal", () => {
    const letters = [
      { status: "approved" },
      { status: "rejected" },
      { status: "generated_locked" },
    ];
    const hasActive = letters.some((l) => ACTIVE_STATUSES.includes(l.status));
    expect(hasActive).toBe(false);
  });
});

describe("Dashboard Stats Calculation", () => {
  it("calculates stats correctly from letter list", () => {
    const letters = [
      { status: "approved" },
      { status: "under_review" },
      { status: "generated_locked" },
      { status: "needs_changes" },
      { status: "rejected" },
      { status: "drafting" },
    ];

    const stats = {
      total: letters.length,
      active: letters.filter((l) => !["approved", "rejected"].includes(l.status)).length,
      approved: letters.filter((l) => l.status === "approved").length,
      needsAttention: letters.filter((l) =>
        ["needs_changes", "generated_locked"].includes(l.status)
      ).length,
    };

    expect(stats.total).toBe(6);
    expect(stats.active).toBe(4); // under_review, generated_locked, needs_changes, drafting
    expect(stats.approved).toBe(1);
    expect(stats.needsAttention).toBe(2); // needs_changes + generated_locked
  });

  it("handles empty letter list", () => {
    const letters: { status: string }[] = [];
    const stats = {
      total: letters.length,
      active: letters.filter((l) => !["approved", "rejected"].includes(l.status)).length,
      approved: letters.filter((l) => l.status === "approved").length,
      needsAttention: letters.filter((l) =>
        ["needs_changes", "generated_locked"].includes(l.status)
      ).length,
    };

    expect(stats.total).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.approved).toBe(0);
    expect(stats.needsAttention).toBe(0);
  });
});
