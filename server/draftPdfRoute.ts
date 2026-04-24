/**
 * Draft PDF Download Route
 *
 * GET /api/letters/:letterId/draft-pdf
 *
 * Streams an Unreviewed PDF (AI draft, not attorney-reviewed) to the authenticated subscriber.
 * Only available for letters in `generated_locked` status.
 * The Unreviewed PDF is generated in-memory and NOT uploaded to S3 — it is streamed
 * directly to the client to avoid storing unreviewed drafts as permanent files.
 *
 * Security:
 *  - Requires a valid session cookie (verifyToken middleware)
 *  - Letter must belong to the requesting user
 *  - Letter must be in `generated_locked` status
 *  - Rate-limited to 10 downloads per hour per user
 */

import type { Express, Request, Response } from "express";
import { authenticateRequest } from "./supabaseAuth";
import { getLetterRequestSafeForSubscriber, getLetterVersionsByRequestId } from "./db";
import { generateDraftPdfBuffer } from "./pdfGenerator";
import { checkTrpcRateLimit } from "./rateLimiter";
import { logger } from "./logger";
import { isFreePreviewUnlocked } from "../shared/utils/free-preview";

// Letters past the pre-review band — once a subscriber has paid for attorney
// review and the letter is in the review pipeline, the draft PDF is allowed
// even on the free-preview path. Before that point, free-preview letters
// cannot download the PDF (the on-page watermarked viewer is the only reveal).
// Mirrors the downstream statuses in the route's main `allowedStatuses`
// list below so free-preview letters already in attorney review are not
// 403'd on a PDF download.
const FREE_PREVIEW_PDF_ALLOWED_STATUSES = new Set([
  "pending_review",
  "under_review",
  "needs_changes",
  "client_revision_requested",
  "client_approval_pending",
  "approved",
  "client_approved",
  "sent",
]);

export function registerDraftPdfRoute(app: Express) {
  app.get("/api/letters/:letterId/draft-pdf", async (req: Request, res: Response) => {
    try {
      // ── Auth ──────────────────────────────────────────────────────────────
      const user = await authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      // Only subscribers can download draft PDFs
      if (user.role !== "subscriber") {
        res.status(403).json({ error: "Subscriber access required" });
        return;
      }

      // ── Rate limit ────────────────────────────────────────────────────────
      try {
        await checkTrpcRateLimit("payment", `draft-pdf:${user.id}`);
      } catch {
        res.status(429).json({ error: "Too many requests. Please wait before downloading again." });
        return;
      }

      // ── Validate letterId ─────────────────────────────────────────────────
      const letterId = parseInt(req.params.letterId, 10);
      if (isNaN(letterId) || letterId <= 0) {
        res.status(400).json({ error: "Invalid letter ID" });
        return;
      }

      // ── Fetch letter (ownership check built in) ───────────────────────────
      const letter = await getLetterRequestSafeForSubscriber(letterId, user.id);
      if (!letter) {
        res.status(404).json({ error: "Letter not found" });
        return;
      }

      // ── Status gate: only allow after letter has been generated and locked ──
      // generated_locked = AI draft complete, subscriber has paid to unlock attorney review
      // All downstream statuses (pending_review → approved → sent) also grant access
      const allowedStatuses = [
        "generated_locked",
        "pending_review", "under_review", "needs_changes",
        "client_approval_pending", "client_revision_requested",
        "approved", "client_approved", "sent",
      ];
      if (!allowedStatuses.includes(letter.status)) {
        res.status(403).json({
          error: "Draft PDF is only available after the AI draft has been generated",
        });
        return;
      }

      // ── Free-preview gate ─────────────────────────────────────────────────
      // For the free-preview lead-magnet flow, the draft PDF is NOT a part of
      // the upsell — the on-page watermarked viewer is. Block PDF downloads
      // for free-preview letters until the subscriber pays for attorney
      // review and the letter is in the review pipeline (or beyond).
      if (
        letter.isFreePreview === true &&
        !FREE_PREVIEW_PDF_ALLOWED_STATUSES.has(letter.status)
      ) {
        res.status(403).json({
          error: "Draft PDF is available after attorney review submission.",
        });
        return;
      }
      // Also enforce the visibility gate itself (defense-in-depth). The
      // branch above should already have rejected pre-review free previews,
      // but if a letter somehow reached pending_review with unlockAt still
      // in the future, never stream full content.
      if (letter.isFreePreview === true && !isFreePreviewUnlocked(letter)) {
        res.status(403).json({ error: "Free preview is not yet available" });
        return;
      }

      // ── Fetch the AI draft version ────────────────────────────────────────
      const versions = await getLetterVersionsByRequestId(letterId);
      const aiDraftVersion = versions.find(v => v.versionType === "ai_draft");
      if (!aiDraftVersion?.content) {
        res.status(404).json({ error: "Draft content not available" });
        return;
      }

      // ── Generate watermarked PDF buffer ───────────────────────────────────
      const pdfBuffer = await generateDraftPdfBuffer({
        letterId,
        letterType: letter.letterType,
        subject: letter.subject,
        content: aiDraftVersion.content,
        jurisdictionState: letter.jurisdictionState,
        jurisdictionCountry: letter.jurisdictionCountry,
        intakeJson: letter.intakeJson as any,
      });

      // ── Stream PDF to client ──────────────────────────────────────────────
      const safeSubject = letter.subject
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .substring(0, 40)
        .trim()
        .replace(/\s+/g, "-");
      const filename = `unreviewed-pdf-${letterId}-${safeSubject}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.setHeader("Cache-Control", "no-store");
      res.send(pdfBuffer);

      logger.info(`[DraftPDF] User ${user.id} downloaded Unreviewed PDF for letter #${letterId}`);
    } catch (err) {
      logger.error({ err: err }, "[DraftPDF] Error generating draft PDF:");
      res.status(500).json({ error: "Failed to generate draft PDF" });
    }
  });
}
