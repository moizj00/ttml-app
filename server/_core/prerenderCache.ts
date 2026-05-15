/**
 * Prerender cache for static HTML produced by `scripts/prerender.ts`.
 *
 * At server startup we walk `dist/public/_prerender/` and slurp every `.html`
 * into memory keyed by the URL path it represents. The catch-all in
 * `serveStatic` checks this cache first; on hit we ship the fully-rendered
 * DOM, on miss we fall through to `injectSeoIntoHtml` from spaRoutes.ts.
 *
 * The cache lives for the process lifetime — prerendered files are immutable
 * for a given deploy, so there is no need to re-read the filesystem on every
 * request.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { logger } from "../logger";

/**
 * Walk a directory recursively, returning every `.html` file path
 * relative to `root`. Uses forward slashes for cross-platform consistency.
 */
async function walkHtmlFiles(root: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Directory missing or unreadable — caller handles via empty result.
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        out.push(rel);
      }
    }
  }

  await walk(root, "");
  return out;
}

/**
 * Convert a relative file path inside `_prerender/` (forward-slash) into the
 * URL path it serves. The root `index.html` maps to `/`; everything else
 * maps to `/<file-without-.html>`.
 */
export function prerenderFileToRoute(relPath: string): string {
  const noExt = relPath.replace(/\.html$/, "");
  if (noExt === "index") return "/";
  return "/" + noExt;
}

/**
 * Load every prerendered HTML in `prerenderDir` into a Map<route, html>.
 * Returns an empty map (no error) if the directory does not exist.
 */
export async function loadPrerenderCache(
  prerenderDir: string
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const files = await walkHtmlFiles(prerenderDir);
  for (const rel of files) {
    try {
      const html = await fs.readFile(path.join(prerenderDir, rel), "utf-8");
      cache.set(prerenderFileToRoute(rel), html);
    } catch (err) {
      logger.warn(
        { err, file: rel },
        "[prerender] Failed to read prerendered file"
      );
    }
  }
  return cache;
}
