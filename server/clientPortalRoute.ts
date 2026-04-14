/**
 * Client Portal Route — public, no auth required
 *
 * GET /portal/:token
 *
 * Validates the token, fetches the letter content, and returns the portal
 * HTML page (served by the Vite SPA). The React page at /portal/:token
 * calls this endpoint via tRPC or a plain GET to get the letter data.
 *
 * This is TTML's two-sided legal communications feature: recipients get a
 * read-only view of their letter with a "Respond via Talk To My Lawyer" CTA.
 */

import type { Express, Request, Response } from "express";
import { redeemClientPortalToken } from "./db";
import { getLetterVersionsByRequestId } from "./db";
import { storageGet } from "./storage";
import { logger } from "./logger";

/**
 * Register the public portal data API endpoint.
 * The React SPA handles the actual /portal/:token route via Wouter.
 * This Express endpoint at /api/portal/:token provides the JSON data.
 */
export function registerClientPortalRoute(app: Express): void {
  app.get("/api/portal/:token", async (req: Request, res: Response) => {
    const { token } = req.params;

    if (!token || typeof token !== "string" || token.length < 10) {
      return res.status(400).json({ error: "Invalid token" });
    }

    try {
      const record = await redeemClientPortalToken(token);

      if (!record) {
        return res.status(404).json({
          error: "This link is invalid or has expired.",
          expired: true,
        });
      }

      // Fetch the final approved letter version
      const versions = await getLetterVersionsByRequestId(
        record.letterRequestId,
        false // include all versions — we'll pick final_approved
      );
      const finalVersion =
        versions.find((v) => v.versionType === "final_approved") ??
        versions.find((v) => v.versionType === "attorney_edit") ??
        versions[0];

      if (!finalVersion) {
        return res.status(404).json({
          error: "Letter content is not available yet.",
        });
      }

      // Resolve a presigned PDF URL if available (via pdfStoragePath on letter_requests)
      // The portal only needs the letter content and metadata — pdfUrl is optional.

      return res.json({
        letterRequestId: record.letterRequestId,
        recipientName: record.recipientName ?? null,
        recipientEmail: record.recipientEmail ?? null,
        viewedAt: record.viewedAt?.toISOString() ?? null,
        expiresAt: record.expiresAt.toISOString(),
        content: finalVersion.content,
        versionType: finalVersion.versionType,
      });
    } catch (err) {
      logger.error({ err }, "[Portal] Error looking up token:");
      return res.status(500).json({ error: "An error occurred. Please try again." });
    }
  });
}
