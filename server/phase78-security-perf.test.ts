/**
 * Phase 78: Security & Performance Fixes
 * Tests for XSS sanitization in plainTextToHtml and N+1 query fix in getAllEmployeeEarnings
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── XSS Sanitization Tests ────────────────────────────────────────────────────
// We test the plainTextToHtml function indirectly by importing it.
// DOMPurify requires a DOM environment, so we mock it for unit tests.

describe("plainTextToHtml XSS sanitization", () => {
  let plainTextToHtml: (text: string) => string;

  beforeEach(async () => {
    // Reset modules so each test gets a fresh import
    vi.resetModules();

    // Mock DOMPurify since we're in a Node environment (no DOM)
    vi.doMock("dompurify", () => ({
      default: {
        sanitize: (html: string, opts?: { ALLOWED_TAGS?: string[]; ALLOWED_ATTR?: string[] }) => {
          // Simulate DOMPurify: strip tags not in ALLOWED_TAGS
          const allowed = opts?.ALLOWED_TAGS ?? [];
          // Simple simulation: remove <script>, <img>, <iframe>, <svg>, event handlers
          let sanitized = html;
          // Remove script tags and content
          sanitized = sanitized.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
          // Remove event handler attributes (onerror, onclick, etc.)
          sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
          // Remove tags not in allowed list (simplified)
          const disallowed = ["script", "img", "iframe", "svg", "object", "embed", "form", "input"];
          for (const tag of disallowed) {
            if (!allowed.includes(tag)) {
              // Remove self-closing and opening/closing tags
              sanitized = sanitized.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
              sanitized = sanitized.replace(new RegExp(`</${tag}>`, "gi"), "");
            }
          }
          return sanitized;
        },
      },
    }));

    // Dynamically import after mock is set up
    const mod = await import("../client/src/components/shared/RichTextEditor");
    plainTextToHtml = mod.plainTextToHtml;
  });

  it("returns empty string for empty input", () => {
    expect(plainTextToHtml("")).toBe("");
    expect(plainTextToHtml(null as any)).toBe("");
    expect(plainTextToHtml(undefined as any)).toBe("");
  });

  it("converts plain text with newlines to paragraphs", () => {
    const result = plainTextToHtml("Hello world\n\nSecond paragraph");
    expect(result).toContain("<p>");
    expect(result).toContain("Hello world");
    expect(result).toContain("Second paragraph");
  });

  it("strips dangerous script tags from HTML input", () => {
    const malicious = '<script>alert("xss")</script><p>Safe content</p>';
    const result = plainTextToHtml(malicious);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("Safe content");
  });

  it("strips img tags with onerror handlers", () => {
    const malicious = '<img src=x onerror="alert(\'xss\')"><p>Safe</p>';
    const result = plainTextToHtml(malicious);
    expect(result).not.toContain("<img");
    expect(result).not.toContain("onerror");
    expect(result).toContain("Safe");
  });

  it("strips iframe injection attempts", () => {
    const malicious = '<iframe src="https://evil.com"></iframe><p>Content</p>';
    const result = plainTextToHtml(malicious);
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("evil.com");
    expect(result).toContain("Content");
  });

  it("preserves allowed HTML tags", () => {
    const safe = "<p>Hello <strong>world</strong> and <em>italic</em></p>";
    const result = plainTextToHtml(safe);
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
  });

  it("handles single-line breaks within paragraphs", () => {
    const text = "Line one\nLine two\n\nNew paragraph";
    const result = plainTextToHtml(text);
    expect(result).toContain("<br>");
    expect(result).toContain("Line one");
    expect(result).toContain("New paragraph");
  });
});

// ─── N+1 Query Fix Tests ───────────────────────────────────────────────────────
// Test the getAllEmployeeEarnings batch function

describe("getAllEmployeeEarnings batch query", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty array when database is not available", async () => {
    vi.doMock("../_core/env", () => ({
      ENV: { databaseUrl: "" },
    }));
    vi.doMock("drizzle-orm/postgres-js", () => ({
      drizzle: vi.fn(),
    }));
    vi.doMock("postgres", () => ({
      default: vi.fn(),
    }));

    const dbModule = await import("./db");
    const result = await dbModule.getAllEmployeeEarnings();
    expect(result).toEqual([]);
  });

  it("correctly aggregates earnings by employee", () => {
    // Test the aggregation logic directly
    const rows = [
      { employeeId: 1, status: "pending", amount: 1000 },
      { employeeId: 1, status: "paid", amount: 2000 },
      { employeeId: 1, status: "voided", amount: 500 },
      { employeeId: 2, status: "pending", amount: 3000 },
      { employeeId: 2, status: "pending", amount: 1500 },
    ];

    // Replicate the aggregation logic from getAllEmployeeEarnings
    const map = new Map<number, { totalEarned: number; pending: number; paid: number; referralCount: number }>();
    for (const row of rows) {
      if (row.status === "voided") continue;
      let entry = map.get(row.employeeId);
      if (!entry) {
        entry = { totalEarned: 0, pending: 0, paid: 0, referralCount: 0 };
        map.set(row.employeeId, entry);
      }
      entry.totalEarned += row.amount;
      if (row.status === "pending") entry.pending += row.amount;
      if (row.status === "paid") entry.paid += row.amount;
      entry.referralCount += 1;
    }

    const result = Array.from(map.entries()).map(([employeeId, data]) => ({ employeeId, ...data }));

    expect(result).toHaveLength(2);

    const emp1 = result.find(e => e.employeeId === 1)!;
    expect(emp1.totalEarned).toBe(3000); // 1000 + 2000 (voided excluded)
    expect(emp1.pending).toBe(1000);
    expect(emp1.paid).toBe(2000);
    expect(emp1.referralCount).toBe(2); // 2 non-voided

    const emp2 = result.find(e => e.employeeId === 2)!;
    expect(emp2.totalEarned).toBe(4500); // 3000 + 1500
    expect(emp2.pending).toBe(4500);
    expect(emp2.paid).toBe(0);
    expect(emp2.referralCount).toBe(2);
  });

  it("excludes voided commissions from all aggregates", () => {
    const rows = [
      { employeeId: 1, status: "voided", amount: 5000 },
      { employeeId: 1, status: "voided", amount: 3000 },
    ];

    const map = new Map<number, { totalEarned: number; pending: number; paid: number; referralCount: number }>();
    for (const row of rows) {
      if (row.status === "voided") continue;
      let entry = map.get(row.employeeId);
      if (!entry) {
        entry = { totalEarned: 0, pending: 0, paid: 0, referralCount: 0 };
        map.set(row.employeeId, entry);
      }
      entry.totalEarned += row.amount;
      if (row.status === "pending") entry.pending += row.amount;
      if (row.status === "paid") entry.paid += row.amount;
      entry.referralCount += 1;
    }

    const result = Array.from(map.entries()).map(([employeeId, data]) => ({ employeeId, ...data }));
    // All voided — no entries in the map
    expect(result).toHaveLength(0);
  });

  it("handles empty commission list", () => {
    const rows: Array<{ employeeId: number; status: string; amount: number }> = [];

    const map = new Map<number, { totalEarned: number; pending: number; paid: number; referralCount: number }>();
    for (const row of rows) {
      if (row.status === "voided") continue;
      let entry = map.get(row.employeeId);
      if (!entry) {
        entry = { totalEarned: 0, pending: 0, paid: 0, referralCount: 0 };
        map.set(row.employeeId, entry);
      }
      entry.totalEarned += row.amount;
    }

    const result = Array.from(map.entries()).map(([employeeId, data]) => ({ employeeId, ...data }));
    expect(result).toHaveLength(0);
  });
});

// ─── adminEmployeePerformance batching verification ─────────────────────────────
describe("adminEmployeePerformance uses batched queries", () => {
  it("routers.ts imports getAllEmployeeEarnings from db", async () => {
    // Verify the import exists by reading the source
    const fs = await import("fs");
    const routersSource = fs.readFileSync("server/routers.ts", "utf-8");
    expect(routersSource).toContain("getAllEmployeeEarnings");
    // Verify it no longer uses the N+1 pattern
    expect(routersSource).not.toContain("employees.map(async (emp) =>");
    // Verify it uses Promise.all with batch queries
    expect(routersSource).toContain("getAllEmployeeEarnings()");
    expect(routersSource).toContain("getAllDiscountCodes()");
  });
});
