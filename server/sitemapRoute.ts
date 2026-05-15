import type { Express } from "express";
import { SERVICE_SLUGS } from "@shared/serviceSlugs";
import { getPublishedBlogSlugs } from "./db";
import { logger } from "./logger";

const BASE = "https://www.talk-to-my-lawyer.com";

const LAST_UPDATED = new Date().toISOString().split("T")[0];

const STATIC_URLS: { loc: string; changefreq: string; priority: string; lastmod: string }[] = [
  { loc: "/", changefreq: "weekly", priority: "1.0", lastmod: LAST_UPDATED },
  { loc: "/pricing", changefreq: "monthly", priority: "0.9", lastmod: LAST_UPDATED },
  { loc: "/analyze", changefreq: "monthly", priority: "0.8", lastmod: LAST_UPDATED },
  { loc: "/faq", changefreq: "monthly", priority: "0.8", lastmod: LAST_UPDATED },
  { loc: "/services", changefreq: "monthly", priority: "0.8", lastmod: LAST_UPDATED },
  { loc: "/blog", changefreq: "weekly", priority: "0.8", lastmod: LAST_UPDATED },
  { loc: "/terms", changefreq: "yearly", priority: "0.3", lastmod: LAST_UPDATED },
  { loc: "/privacy", changefreq: "yearly", priority: "0.3", lastmod: LAST_UPDATED },
];

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().split("T")[0];
}

function urlEntry(loc: string, changefreq: string, priority: string, lastmod?: string): string {
  let xml = `  <url>\n    <loc>${escapeXml(BASE + loc)}</loc>\n`;
  if (lastmod) xml += `    <lastmod>${lastmod}</lastmod>\n`;
  xml += `    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  return xml;
}

export function registerSitemapRoute(app: Express): void {
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const blogPosts = await getPublishedBlogSlugs();

      const urls: string[] = [];

      for (const s of STATIC_URLS) {
        urls.push(urlEntry(s.loc, s.changefreq, s.priority, s.lastmod));
      }

      for (const slug of SERVICE_SLUGS) {
        urls.push(urlEntry(`/services/${slug}`, "monthly", "0.7", LAST_UPDATED));
      }

      for (const post of blogPosts) {
        const lastmod = formatDate(post.updatedAt ?? post.publishedAt);
        urls.push(urlEntry(`/blog/${post.slug}`, "weekly", "0.6", lastmod || undefined));
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      res.send(xml);
    } catch (err) {
      logger.error({ err: err }, "[sitemap] Error generating sitemap:");
      res.status(500).setHeader("Content-Type", "text/plain").send("Error generating sitemap");
    }
  });
}
