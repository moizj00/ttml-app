/**
 * Server-side PDF generation for legal letters.
 *
 * Primary path:  Cloudflare Worker (Browser Rendering API) — offloads CPU from Express.
 * Fallback path: Local Puppeteer (headless Chrome) — used when Worker is not configured
 *                or unreachable, preserving full functionality without any code changes.
 *
 * Template 1 = Approved (blue stamp, uploaded to S3).
 * Template 2 = Draft (DRAFT watermark, returned as Buffer).
 */

import puppeteer from "puppeteer";
import { execSync } from "child_process";
import { storagePut } from "./storage";
import {
  buildApprovedLetterHtml,
  buildDraftLetterHtml,
  buildApprovedFooterHtml,
  buildDraftFooterHtml,
  buildApprovedHeaderHtml,
  buildDraftHeaderHtml,
  type LetterTemplateData,
} from "./letterTemplates";
import { generatePdfViaWorker } from "./workerPdfClient";

interface IntakeData {
  sender?: {
    name?: string;
    address?: string;
    email?: string;
    phone?: string;
  };
  recipient?: {
    name?: string;
    address?: string;
    email?: string;
  };
}

interface PdfGenerationOptions {
  letterId: number;
  letterType: string;
  subject: string;
  content: string;
  approvedBy?: string;
  approvedAt?: string;
  jurisdictionState?: string | null;
  jurisdictionCountry?: string | null;
  intakeJson?: IntakeData | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Puppeteer (legacy / fallback)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Chrome/Chromium executable path.
 *
 * Priority order:
 *  1. PUPPETEER_EXECUTABLE_PATH env var — set this in Railway/Render for a custom binary
 *  2. System `chromium` binary — installed via Nix on Replit and needed because the Nix
 *     environment links its own glibc, so the Puppeteer-bundled Chrome lacks the required
 *     shared libraries (libglib, libnss, etc.) that only exist within Nix's closure.
 *  3. Puppeteer's bundled Chrome — works in standard Linux environments where the
 *     postinstall successfully downloads Chrome and system libraries are compatible.
 */
function resolveChromiumPath(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    const sysChrm = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    if (sysChrm) return sysChrm;
  } catch {
    // fall through
  }
  return puppeteer.executablePath();
}

/**
 * Launch a Puppeteer browser configured for the server environment.
 * --no-sandbox and --disable-setuid-sandbox are required for container deployments.
 */
async function launchBrowser() {
  const executablePath = resolveChromiumPath();
  console.log(`[PDF] Launching local Chromium: ${executablePath}`);
  return puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

async function htmlToPdfBufferLocal(
  html: string,
  headerTemplate: string,
  footerTemplate: string
): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: { top: "72px", bottom: "48px", left: "0", right: "0" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Template data mapping
// ─────────────────────────────────────────────────────────────────────────────

function buildTemplateData(opts: PdfGenerationOptions): LetterTemplateData {
  const intake = opts.intakeJson ?? {};
  const dateSource = opts.approvedAt ? new Date(opts.approvedAt) : new Date();
  const date = dateSource.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return {
    senderName: intake.sender?.name ?? "",
    senderAddress: intake.sender?.address ?? "",
    senderEmail: intake.sender?.email ?? "",
    senderPhone: intake.sender?.phone ?? "",
    recipientName: intake.recipient?.name ?? "",
    recipientAddress: intake.recipient?.address ?? "",
    subject: opts.subject,
    letterId: opts.letterId,
    letterType: opts.letterType,
    jurisdictionState: opts.jurisdictionState,
    jurisdictionCountry: opts.jurisdictionCountry,
    date,
    approvedBy: opts.approvedBy,
    approvedAt: opts.approvedAt,
    bodyHtml: opts.content,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Approved PDFs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a professional PDF from the approved letter content,
 * upload it to S3, and return the public URL.
 */
export async function generateAndUploadApprovedPdf(
  opts: PdfGenerationOptions
): Promise<{ pdfUrl: string; pdfKey: string }> {
  const pdfBuffer = await generatePdfBuffer(opts);

  const timestamp = Date.now();
  const safeSubject = opts.subject
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .substring(0, 40)
    .trim()
    .replace(/\s+/g, "-");
  const fileKey = `approved-letters/${opts.letterId}-${safeSubject}-${timestamp}.pdf`;

  const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

  console.log(`[PDF] Generated and uploaded letter #${opts.letterId}: ${url}`);
  return { pdfUrl: url, pdfKey: fileKey };
}

/**
 * Generate the approved PDF buffer.
 * Tries the Cloudflare Worker first, falls back to local Puppeteer.
 */
async function generatePdfBuffer(opts: PdfGenerationOptions): Promise<Buffer> {
  const data = buildTemplateData(opts);
  const html = buildApprovedLetterHtml(data);
  const headerTemplate = buildApprovedHeaderHtml(data);
  const footerTemplate = buildApprovedFooterHtml(data);

  const { buffer } = await generatePdfViaWorker(
    {
      html,
      headerTemplate,
      footerTemplate,
      watermark: false,
      letterId: opts.letterId,
    },
    () => htmlToPdfBufferLocal(html, headerTemplate, footerTemplate)
  );
  return buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Draft PDFs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an Unreviewed (draft) PDF buffer.
 * Tries the Cloudflare Worker first, falls back to local Puppeteer.
 *
 * Used for the free draft download feature — letter must be in generated_locked status.
 * The PDF is returned as a Buffer so the server can stream it directly to the client.
 *
 * Footer has amber draft notice + DRAFT badge + dynamic page numbers.
 * Header has amber-bordered continuation bar visible on pages 2+ only.
 */
export async function generateDraftPdfBuffer(opts: {
  letterId: number;
  letterType: string;
  subject: string;
  content: string;
  jurisdictionState?: string | null;
  jurisdictionCountry?: string | null;
  intakeJson?: IntakeData | null;
}): Promise<Buffer> {
  const data = buildTemplateData(opts);
  const html = buildDraftLetterHtml(data);
  const headerTemplate = buildDraftHeaderHtml(data);
  const footerTemplate = buildDraftFooterHtml(data);

  const { buffer } = await generatePdfViaWorker(
    {
      html,
      headerTemplate,
      footerTemplate,
      watermark: true,
      letterId: opts.letterId,
    },
    () => htmlToPdfBufferLocal(html, headerTemplate, footerTemplate)
  );
  return buffer;
}
