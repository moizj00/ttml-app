import type { Express, RequestHandler } from "express";

export function registerConfigRoute(app: Express) {
  const handler: RequestHandler = (_req, res) => {
    const key = process.env.VITE_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? "";
    if (!key) {
      res.status(503).json({ error: "Maps API key not configured" });
      return;
    }
    res.json({ key });
  };

  app.get("/api/config/maps-key", handler);
}
