import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { getDb } from "./db";
import { newsletterSubscribers } from "../drizzle/schema";
import { logger } from "./logger";

const subscribeSchema = z.object({
  email: z.string().email().max(320),
  source: z.string().max(100).optional().default("footer"),
});

export function registerNewsletterRoute(app: Express) {
  const handler: RequestHandler = async (req, res) => {
    try {
      const parsed = subscribeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Please provide a valid email address." });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Database unavailable." });
        return;
      }
      await db
        .insert(newsletterSubscribers)
        .values({
          email: parsed.data.email.toLowerCase().trim(),
          source: parsed.data.source,
        })
        .onConflictDoNothing({ target: newsletterSubscribers.email });

      res.json({ success: true });
    } catch (err) {
      logger.error("[Newsletter] Subscribe error:", err);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  };

  app.post("/api/newsletter/subscribe", handler);
}
