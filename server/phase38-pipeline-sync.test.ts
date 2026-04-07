/**
 * Phase 38: Admin Review Modal — Pipeline Sync + PDF Generation Tests
 *
 * Tests:
 * 1. PDF generator module exports and structure
 * 2. Claim mutation wires subscriber notification
 * 3. Approve mutation wires PDF generation + S3 upload + notification
 * 4. pdfUrl column exists in schema
 * 5. updateLetterPdfUrl function exists in db.ts
 * 6. sendLetterApprovedEmail accepts pdfUrl parameter
 * 7. Subscriber LetterDetail shows PDF download when pdfUrl available
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SERVER_DIR = path.resolve(__dirname);
const CLIENT_DIR = path.resolve(__dirname, "../client/src");

function readAllRouters() {
  const subRouters = ["review", "letters", "admin", "auth", "billing", "affiliate", "notifications", "profile", "versions", "documents", "blog"];
  return subRouters.map(r => {
    const p = path.join(SERVER_DIR, "routers", `${r}.ts`);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
  }).join("\n");
}
function readAllDb() {
  const files = ["core", "letters", "letter-versions", "users", "admin", "affiliates", "analytics", "auth-tokens", "lessons", "notifications", "pipeline-records", "quality", "review-actions"];
  return files.map(f => {
    const p = path.join(SERVER_DIR, "db", `${f}.ts`);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
  }).join("\n");
}
function readAllPipeline() {
  const files = ["shared", "research", "drafting", "assembly", "vetting", "citations", "validators", "providers", "prompts", "orchestrator"];
  return files.map(f => {
    const p = path.join(SERVER_DIR, "pipeline", `${f}.ts`);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
  }).join("\n");
}

describe("Phase 38: Pipeline Sync + PDF Generation", () => {
  // ─── PDF Generator Module ──────────────────────────────────────────
  describe("PDF Generator", () => {
    it("pdfGenerator.ts exists and exports generateAndUploadApprovedPdf", () => {
      const filePath = path.join(SERVER_DIR, "pdfGenerator.ts");
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("export async function generateAndUploadApprovedPdf");
    });

    it("pdfGenerator.ts imports storagePut for S3 upload", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "pdfGenerator.ts"), "utf-8");
      expect(content).toContain('import { storagePut } from "./storage"');
    });

    it("pdfGenerator.ts uses a headless browser or worker for rendering", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "pdfGenerator.ts"), "utf-8");
      // Implementation uses puppeteer/Chromium or a CF Worker, not pdfkit
      const usesPdfRendering = content.includes("puppeteer") || content.includes("generatePdfViaWorker") || content.includes("PDFDocument");
      expect(usesPdfRendering).toBe(true);
    });

    it("pdfGenerator generates proper S3 key with letter ID", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "pdfGenerator.ts"), "utf-8");
      expect(content).toContain("approved-letters/");
      expect(content).toContain("opts.letterId");
    });

    it("pdfGenerator includes attorney approval stamp in PDF template", () => {
      const templateContent = fs.readFileSync(path.join(SERVER_DIR, "letterTemplates.ts"), "utf-8");
      const hasstamp = templateContent.includes("stamp") || templateContent.includes("approved") || templateContent.includes("APPROVED");
      expect(hasstamp).toBe(true);
    });

    it("pdfGenerator includes Talk to My Lawyer branding in templates", () => {
      const templateContent = fs.readFileSync(path.join(SERVER_DIR, "letterTemplates.ts"), "utf-8");
      expect(templateContent).toContain("TALK TO MY LAWYER");
    });
  });

  // ─── Schema: pdfUrl column ─────────────────────────────────────────
  describe("Schema: pdfUrl column", () => {
    it("letter_requests table has pdfUrl column in schema", () => {
      const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
      const content = fs.readFileSync(schemaPath, "utf-8");
      expect(content).toContain('pdfUrl: text("pdf_url")');
    });
  });

  // ─── DB Helper: updateLetterPdfUrl ─────────────────────────────────
  describe("DB Helper: updateLetterPdfUrl", () => {
    it("updateLetterPdfUrl function exists in db.ts", () => {
      const content = readAllDb();
      expect(content).toContain("export async function updateLetterPdfUrl");
    });

    it("updateLetterPdfUrl updates pdfUrl field", () => {
      const content = readAllDb();
      expect(content).toContain("pdfUrl");
    });
  });

  // ─── Claim Mutation: Subscriber Notification ───────────────────────
  describe("Claim Mutation: Subscriber Notification", () => {
    it("claim mutation sends status update email to subscriber", () => {
      const content = readAllRouters();
      // Find the claim section
      const claimSection = content.substring(
        content.indexOf("claim: attorneyProcedure"),
        content.indexOf("approve: attorneyProcedure")
      );
      expect(claimSection).toContain("sendStatusUpdateEmail");
    });

    it("claim mutation creates in-app notification for subscriber", () => {
      const content = readAllRouters();
      const claimSection = content.substring(
        content.indexOf("claim: attorneyProcedure"),
        content.indexOf("approve: attorneyProcedure")
      );
      expect(claimSection).toContain("createNotification");
      expect(claimSection).toContain("letter_under_review");
    });

    it("claim mutation sends under_review status in email", () => {
      const content = readAllRouters();
      const claimSection = content.substring(
        content.indexOf("claim: attorneyProcedure"),
        content.indexOf("approve: attorneyProcedure")
      );
      expect(claimSection).toContain('newStatus: "under_review"');
    });
  });

  describe("Approve Mutation: Auto-forward to client_approval_pending", () => {
    it("approve mutation creates final_approved version", () => {
      const content = readAllRouters();
      const approveSection = content.substring(
        content.indexOf("approve: attorneyProcedure"),
        content.indexOf("reject: attorneyProcedure")
      );
      expect(approveSection).toContain("final_approved");
      expect(approveSection).toContain("createLetterVersion");
    });

    it("approve mutation transitions through approved to client_approval_pending", () => {
      const content = readAllRouters();
      const approveSection = content.substring(
        content.indexOf("approve: attorneyProcedure"),
        content.indexOf("reject: attorneyProcedure")
      );
      expect(approveSection).toContain('"approved"');
      expect(approveSection).toContain('"client_approval_pending"');
    });

    it("approve mutation does NOT generate PDF (deferred to clientApprove)", () => {
      const content = readAllRouters();
      const approveSection = content.substring(
        content.indexOf("approve: attorneyProcedure"),
        content.indexOf("reject: attorneyProcedure")
      );
      expect(approveSection).not.toContain("generateAndUploadApprovedPdf");
      expect(approveSection).toContain("PDF is NOT generated here");
    });

    it("clientApprove mutation in letters.ts handles PDF generation", () => {
      const content = readAllRouters();
      const clientApproveSection = content.substring(
        content.indexOf("clientApprove: subscriberProcedure") || content.indexOf("clientApprove:"),
        content.indexOf("clientRequestRevision:") || content.length
      );
      expect(clientApproveSection).toContain("generateAndUploadApprovedPdf");
      expect(clientApproveSection).toContain("updateLetterPdfUrl");
    });

    it("clientApprove handles Approve & Send with recipientEmail", () => {
      const content = readAllRouters();
      expect(content).toContain("recipientEmail");
      expect(content).toContain("sendLetterToRecipient");
    });
  });

  // ─── Email: pdfUrl parameter ───────────────────────────────────────
  describe("Email: sendLetterApprovedEmail with pdfUrl", () => {
    it("sendLetterApprovedEmail accepts optional pdfUrl parameter", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "email.ts"), "utf-8");
      const fnSection = content.substring(
        content.indexOf("export async function sendLetterApprovedEmail"),
        content.indexOf("export async function sendNeedsChangesEmail")
      );
      expect(fnSection).toContain("pdfUrl?: string");
    });

    it("email includes PDF download link when pdfUrl provided", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "email.ts"), "utf-8");
      const fnSection = content.substring(
        content.indexOf("export async function sendLetterApprovedEmail"),
        content.indexOf("export async function sendNeedsChangesEmail")
      );
      expect(fnSection).toContain("Download your Reviewed PDF");
    });
  });

  // ─── Subscriber LetterDetail: PDF Download ─────────────────────────
  describe("Subscriber LetterDetail: PDF Download", () => {
    it("LetterDetail has handleDownloadPdf function", () => {
      const content = fs.readFileSync(
        path.join(CLIENT_DIR, "pages/subscriber/LetterDetail.tsx"),
        "utf-8"
      );
      expect(content).toContain("handleDownloadPdf");
    });

    it("LetterDetail checks for pdfUrl before falling back to print", () => {
      const content = fs.readFileSync(
        path.join(CLIENT_DIR, "pages/subscriber/LetterDetail.tsx"),
        "utf-8"
      );
      expect(content).toContain("data?.letter?.pdfUrl");
    });

    it("LetterDetail shows 'Download PDF' label when pdfUrl exists", () => {
      const content = fs.readFileSync(
        path.join(CLIENT_DIR, "pages/subscriber/LetterDetail.tsx"),
        "utf-8"
      );
      expect(content).toContain("Download PDF");
    });

    it("getLetterRequestSafeForSubscriber returns pdfUrl field", () => {
      const content = readAllDb();
      const fnSection = content.substring(
        content.indexOf("getLetterRequestSafeForSubscriber"),
        content.indexOf("export async function getAllLetterRequests")
      );
      expect(fnSection).toContain("pdfUrl: letterRequests.pdfUrl");
    });
  });

  // ─── Pipeline Integrity ────────────────────────────────────────────
  describe("Pipeline Integrity", () => {
    it("pipeline has all 4 stages: research, draft, assembly, vetting", () => {
      const content = readAllPipeline();
      expect(content).toContain("runResearchStage");
      expect(content).toContain("runDraftingStage");
      expect(content).toContain("runAssemblyVettingLoop");
    });

    it("pipeline orchestrator runs all stages in sequence", () => {
      const content = readAllPipeline();
      const orchestrator = content.substring(
        content.indexOf("FULL PIPELINE ORCHESTRATOR"),
        content.indexOf("RETRY LOGIC")
      );
      expect(orchestrator).toContain("runResearchStage");
      expect(orchestrator).toContain("runDraftingStage");
      // Assembly is run via runAssemblyVettingLoop in the orchestrator
      const hasAssembly = orchestrator.includes("runAssemblyStage") || orchestrator.includes("runAssemblyVettingLoop") || orchestrator.includes("assembly");
      expect(hasAssembly).toBe(true);
    });

    it("pipeline transitions to generated_locked after completion", () => {
      const content = readAllPipeline();
      expect(content).toContain('"generated_locked"');
    });

    it("n8n callback handler exists and processes results", () => {
      const callbackPath = path.join(SERVER_DIR, "n8nCallback.ts");
      expect(fs.existsSync(callbackPath)).toBe(true);
      const content = fs.readFileSync(callbackPath, "utf-8");
      expect(content).toContain("/api/pipeline/n8n-callback");
    });

    it("routers.ts imports generateAndUploadApprovedPdf", () => {
      const content = readAllRouters();
      // Sub-routers import with relative path from routers/ subdirectory
      expect(content).toContain("generateAndUploadApprovedPdf");
      expect(content).toContain("pdfGenerator");
    });

    it("routers.ts imports sendStatusUpdateEmail", () => {
      const content = readAllRouters();
      expect(content).toContain("sendStatusUpdateEmail");
    });

    it("routers.ts imports updateLetterPdfUrl", () => {
      const content = readAllRouters();
      expect(content).toContain("updateLetterPdfUrl");
    });
  });
});
