/**
 * Cloudflare Worker PDF Client
 *
 * Sends rendered HTML to the PDF generation Worker and receives a PDF buffer back.
 * Falls back to local Puppeteer if:
 *   - PDF_WORKER_URL is not configured
 *   - The Worker is unreachable (network error)
 *   - The Worker returns a non-200 response
 *   - The request times out
 *
 * The caller never needs to know which path was used — both return a Buffer.
 */

import { ENV } from "./_core/env";

interface WorkerPdfRequest {
  html: string;
  headerTemplate: string;
  footerTemplate: string;
  watermark: boolean;
  letterId: number;
}

interface WorkerPdfResult {
  buffer: Buffer;
  source: "worker" | "local";
}

const WORKER_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

export function isWorkerConfigured(): boolean {
  return !!(ENV.pdfWorkerUrl && ENV.pdfWorkerUrl.startsWith("http"));
}

export async function generatePdfViaWorker(
  req: WorkerPdfRequest,
  localFallback: () => Promise<Buffer>
): Promise<WorkerPdfResult> {
  if (!isWorkerConfigured()) {
    console.log("[PdfWorker] PDF_WORKER_URL not configured — using local Puppeteer");
    const buffer = await localFallback();
    return { buffer, source: "local" };
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const buffer = await callWorker(req, attempt);
      console.log(
        `[PdfWorker] Letter #${req.letterId} — generated via Worker (${buffer.length} bytes, attempt ${attempt + 1})`
      );
      return { buffer, source: "worker" };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[PdfWorker] Letter #${req.letterId} — Worker attempt ${attempt + 1} failed: ${lastError.message}`
      );
    }
  }

  console.warn(
    `[PdfWorker] Letter #${req.letterId} — all Worker attempts failed, falling back to local Puppeteer. Last error: ${lastError?.message}`
  );
  const buffer = await localFallback();
  return { buffer, source: "local" };
}

async function callWorker(req: WorkerPdfRequest, attempt: number): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (ENV.pdfWorkerSecret) {
      headers["Authorization"] = `Bearer ${ENV.pdfWorkerSecret}`;
    }

    const response = await fetch(ENV.pdfWorkerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        html: req.html,
        headerTemplate: req.headerTemplate,
        footerTemplate: req.footerTemplate,
        watermark: req.watermark,
        letterId: req.letterId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body && typeof body === "object" && "error" in body) {
          errorMsg += `: ${(body as { error: string }).error}`;
        }
      } catch {
        // ignore parse error
      }
      throw new Error(errorMsg);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/pdf")) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength < 100) {
      throw new Error(`Suspiciously small PDF response: ${arrayBuffer.byteLength} bytes`);
    }

    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}
