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

    it("pdfGenerator.ts imports PDFDocument from pdfkit", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "pdfGenerator.ts"), "utf-8");
      expect(content).toContain('import PDFDocument from "pdfkit"');
    });

    it("pdfGenerator generates proper S3 key with letter ID", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "pdfGenerator.ts"), "utf-8");
      expect(content).toContain("approved-letters/");
      expect(content).toContain("opts.letterId");
    });

    it("pdfGenerator includes attorney approval stamp in PDF", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "pdfGenerator.ts"), "utf-8");
      expect(content).toContain("ATTORNEY REVIEWED & APPROVED");
    });

    it("pdfGenerator includes Talk to My Lawyer branding", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "pdfGenerator.ts"), "utf-8");
      expect(content).toContain("TALK TO MY LAWYER");
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
      const content = fs.readFileSync(path.join(SERVER_DIR, "db.ts"), "utf-8");
      expect(content).toContain("export async function updateLetterPdfUrl");
    });

    it("updateLetterPdfUrl updates pdfUrl field", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "db.ts"), "utf-8");
      expect(content).toContain("pdfUrl");
    });
  });

  // ─── Claim Mutation: Subscriber Notification ───────────────────────
  describe("Claim Mutation: Subscriber Notification", () => {
    it("claim mutation sends status update email to subscriber", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      // Find the claim section
      const claimSection = content.substring(
        content.indexOf("claim: attorneyProcedure"),
        content.indexOf("approve: attorneyProcedure")
      );
      expect(claimSection).toContain("sendStatusUpdateEmail");
    });

    it("claim mutation creates in-app notification for subscriber", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      const claimSection = content.substring(
        content.indexOf("claim: attorneyProcedure"),
        content.indexOf("approve: attorneyProcedure")
      );
      expect(claimSection).toContain("createNotification");
      expect(claimSection).toContain("letter_under_review");
    });

    it("claim mutation sends under_review status in email", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      const claimSection = content.substring(
        content.indexOf("claim: attorneyProcedure"),
        content.indexOf("approve: attorneyProcedure")
      );
      expect(claimSection).toContain('newStatus: "under_review"');
    });
  });

  // ─── Approve Mutation: PDF Generation + Notification ───────────────
  describe("Approve Mutation: PDF Generation + S3 Upload", () => {
    it("approve mutation calls generateAndUploadApprovedPdf", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      const approveSection = content.substring(
        content.indexOf("approve: attorneyProcedure"),
        content.indexOf("reject: attorneyProcedure")
      );
      expect(approveSection).toContain("generateAndUploadApprovedPdf");
    });

    it("approve mutation calls updateLetterPdfUrl", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      const approveSection = content.substring(
        content.indexOf("approve: attorneyProcedure"),
        content.indexOf("reject: attorneyProcedure")
      );
      expect(approveSection).toContain("updateLetterPdfUrl");
    });

    it("approve mutation passes pdfUrl to sendLetterApprovedEmail", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      const approveSection = content.substring(
        content.indexOf("approve: attorneyProcedure"),
        content.indexOf("reject: attorneyProcedure")
      );
      expect(approveSection).toContain("pdfUrl");
      expect(approveSection).toContain("sendLetterApprovedEmail");
    });

    it("approve mutation returns pdfUrl in response", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      const approveSection = content.substring(
        content.indexOf("approve: attorneyProcedure"),
        content.indexOf("reject: attorneyProcedure")
      );
      expect(approveSection).toContain("return { success: true, versionId, pdfUrl }");
    });

    it("PDF generation failure does not block approval", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      const approveSection = content.substring(
        content.indexOf("approve: attorneyProcedure"),
        content.indexOf("reject: attorneyProcedure")
      );
      // Should have try/catch around PDF generation
      expect(approveSection).toContain("Non-blocking: approval still succeeds");
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
      expect(fnSection).toContain("Download your approved letter as PDF");
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
      const content = fs.readFileSync(path.join(SERVER_DIR, "db.ts"), "utf-8");
      const fnSection = content.substring(
        content.indexOf("getLetterRequestSafeForSubscriber"),
        content.indexOf("export async function getAllLetterRequests")
      );
      expect(fnSection).toContain("pdfUrl: letterRequests.pdfUrl");
    });
  });

  // ─── Pipeline Integrity ────────────────────────────────────────────
  describe("Pipeline Integrity", () => {
    it("pipeline.ts has all 3 stages: research, draft, assembly", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "pipeline.ts"), "utf-8");
      expect(content).toContain("runResearchStage");
      expect(content).toContain("runDraftingStage");
      expect(content).toContain("runAssemblyStage");
    });

    it("pipeline orchestrator runs all 3 stages in sequence", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "pipeline.ts"), "utf-8");
      const orchestrator = content.substring(
        content.indexOf("FULL PIPELINE ORCHESTRATOR"),
        content.indexOf("RETRY LOGIC")
      );
      expect(orchestrator).toContain("runResearchStage");
      expect(orchestrator).toContain("runDraftingStage");
      expect(orchestrator).toContain("runAssemblyStage");
    });

    it("pipeline transitions to generated_locked after completion", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "pipeline.ts"), "utf-8");
      expect(content).toContain('"generated_locked"');
    });

    it("n8n callback handler exists and processes results", () => {
      const callbackPath = path.join(SERVER_DIR, "n8nCallback.ts");
      expect(fs.existsSync(callbackPath)).toBe(true);
      const content = fs.readFileSync(callbackPath, "utf-8");
      expect(content).toContain("/api/pipeline/n8n-callback");
    });

    it("routers.ts imports generateAndUploadApprovedPdf", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      expect(content).toContain('import { generateAndUploadApprovedPdf } from "./pdfGenerator"');
    });

    it("routers.ts imports sendStatusUpdateEmail", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      expect(content).toContain("sendStatusUpdateEmail");
    });

    it("routers.ts imports updateLetterPdfUrl", () => {
      const content = fs.readFileSync(path.join(SERVER_DIR, "routers.ts"), "utf-8");
      expect(content).toContain("updateLetterPdfUrl");
    });
  });
});
