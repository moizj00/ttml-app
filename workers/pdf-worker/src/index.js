/**
 * Talk to My Lawyer — PDF Generation Cloudflare Worker
 *
 * Accepts POST requests with rendered HTML content and rendering options,
 * uses @cloudflare/puppeteer (Browser Rendering API) to generate a PDF,
 * and returns the PDF buffer as the response body.
 *
 * Request body (JSON):
 *   {
 *     html:           string  — fully rendered letter HTML
 *     headerTemplate: string  — Puppeteer header template HTML
 *     footerTemplate: string  — Puppeteer footer template HTML
 *     watermark:      boolean — true → draft watermark already in HTML; logged for audit
 *     letterId:       number  — for logging only
 *   }
 *
 * Response:
 *   200  application/pdf  — PDF binary
 *   400  application/json — { error: string }  — bad request
 *   401  application/json — { error: string }  — missing/invalid auth token
 *   500  application/json — { error: string }  — generation failure
 *
 * Environment bindings (set in wrangler.toml / Cloudflare dashboard):
 *   BROWSER          — Browser Rendering API binding (required)
 *   PDF_WORKER_SECRET — string — shared secret; must match PDF_WORKER_SECRET on the main server
 */

import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env, _ctx) {
    // ── CORS pre-flight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // ── Only accept POST ─────────────────────────────────────────────────────
    if (request.method !== "POST") {
      return jsonError(405, "Method not allowed — use POST");
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const workerSecret = env.PDF_WORKER_SECRET;
    if (workerSecret) {
      const authHeader = request.headers.get("Authorization") ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (token !== workerSecret) {
        console.warn("[PdfWorker] Unauthorized request — bad or missing token");
        return jsonError(401, "Unauthorized");
      }
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    const { html, headerTemplate, footerTemplate, watermark, letterId } = body;

    if (typeof html !== "string" || !html.trim()) {
      return jsonError(400, "Missing required field: html");
    }
    if (typeof headerTemplate !== "string") {
      return jsonError(400, "Missing required field: headerTemplate");
    }
    if (typeof footerTemplate !== "string") {
      return jsonError(400, "Missing required field: footerTemplate");
    }

    // ── Validate BROWSER binding ─────────────────────────────────────────────
    if (!env.BROWSER) {
      console.error("[PdfWorker] BROWSER binding is not configured");
      return jsonError(500, "Worker misconfigured: BROWSER binding missing");
    }

    // ── Generate PDF ─────────────────────────────────────────────────────────
    const logTag = `[PdfWorker] Letter #${letterId ?? "unknown"}${watermark ? " [DRAFT]" : ""}`;
    console.log(`${logTag} — generating PDF`);

    let browser;
    try {
      browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();

      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "Letter",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: headerTemplate,
        footerTemplate: footerTemplate,
        margin: { top: "72px", bottom: "48px", left: "0", right: "0" },
      });

      console.log(`${logTag} — generated ${pdfBuffer.byteLength} bytes`);

      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(pdfBuffer.byteLength),
          "Cache-Control": "no-store",
          "X-Generator": "ttml-pdf-worker",
          ...corsHeaders(),
        },
      });
    } catch (err) {
      console.error(`${logTag} — PDF generation failed:`, err?.message ?? err);
      return jsonError(500, `PDF generation failed: ${err?.message ?? "unknown error"}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // ignore close errors
        }
      }
    }
  },
};

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}
