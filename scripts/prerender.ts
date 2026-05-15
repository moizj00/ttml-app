#!/usr/bin/env tsx
/**
 * Build-time static prerender of data-free public routes.
 *
 * After `vite build` produces dist/public/, this script:
 *   1. Spins up an Express server serving dist/public/ on an ephemeral port
 *   2. Uses puppeteer (already a dep) to navigate to each public route
 *   3. Waits for React + Helmet to settle, captures the rendered DOM
 *   4. Writes the HTML to dist/public/_prerender/<route>.html
 *
 * The server-side handler in server/_core/vite.ts checks for these files
 * first and serves them with HTTP 200 if present (giving non-JS crawlers
 * fully-rendered content). Routes that aren't prerendered fall through to
 * the SEO-injected SPA shell from spaRoutes.ts.
 *
 * Scope: only data-free routes. Blog routes (/blog, /blog/:slug) are
 * intentionally skipped — they require tRPC + DB, and spaRoutes.ts already
 * injects the full article body for crawlers via markdownToFallbackHtml.
 *
 * Graceful degradation: if puppeteer fails to launch (no Chromium, sandbox
 * issues), the script logs a warning and exits 0 so the build still
 * succeeds. The server then falls through to injectSeoIntoHtml for those
 * routes — Phase 1 behavior is the floor.
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import puppeteer, { type Browser } from "puppeteer";
import { SERVICE_SLUGS } from "@shared/serviceSlugs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist", "public");
// _prerender lives at dist/_prerender/ (sibling of dist/public/) so the
// generated HTML is NOT directly served by express.static at /_prerender/...
const OUTPUT_DIR = path.join(ROOT, "dist", "_prerender");

const NAVIGATE_TIMEOUT_MS = 30_000;
const HELMET_TIMEOUT_MS = 5_000;

/**
 * Resolve a working Chromium binary. Mirrors server/pdfGenerator.ts so the
 * prerender step uses the same lookup the runtime PDF generator uses.
 *
 * Priority:
 *   1. PUPPETEER_EXECUTABLE_PATH env var — set in the Dockerfile builder stage
 *      so the alpine-installed chromium is picked up instead of puppeteer's
 *      glibc-only bundled download.
 *   2. System `chromium` / `chromium-browser` binary (via `which`).
 *   3. Puppeteer's bundled Chrome — works on dev machines where the install
 *      postinstall succeeded.
 */
function resolveChromiumPath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    const sysChrm = execSync(
      "which chromium 2>/dev/null || which chromium-browser 2>/dev/null",
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    if (sysChrm) return sysChrm;
  } catch {
    // fall through to puppeteer's bundled binary
  }
  try {
    return puppeteer.executablePath();
  } catch {
    return undefined;
  }
}

const STATIC_ROUTES = [
  "/",
  "/pricing",
  "/faq",
  "/terms",
  "/privacy",
  "/analyze",
  "/services",
];

const ROUTES: string[] = [
  ...STATIC_ROUTES,
  ...SERVICE_SLUGS.map((slug) => `/services/${slug}`),
];

function routeToFilePath(route: string): string {
  if (route === "/") return path.join(OUTPUT_DIR, "index.html");
  // "/services/demand-letter" → "<OUTPUT_DIR>/services/demand-letter.html"
  return path.join(OUTPUT_DIR, route.replace(/^\//, "") + ".html");
}

async function distExists(): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(DIST, "index.html"));
    return stat.isFile();
  } catch {
    return false;
  }
}

async function bootStaticServer(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const app = express();
  app.use(express.static(DIST, { index: "index.html" }));
  // SPA fallback — any unmatched path returns the shell so wouter can route
  app.get("*", (_req, res) => {
    res.sendFile(path.join(DIST, "index.html"));
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to get server address"));
        return;
      }
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res2) => {
            server.close(() => res2());
          }),
      });
    });
    server.on("error", reject);
  });
}

async function prerenderOne(
  browser: Browser,
  port: number,
  route: string
): Promise<{ route: string; ok: boolean; error?: string }> {
  const page = await browser.newPage();
  try {
    const url = `http://127.0.0.1:${port}${route}`;
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: NAVIGATE_TIMEOUT_MS,
    });

    // Wait for Helmet to flush a non-default title. The shell's default is
    // generic — once Helmet has run, per-route title appears.
    await page
      .waitForFunction(
        () => {
          const t = document.title;
          return Boolean(t) && !t.startsWith("Loading");
        },
        { timeout: HELMET_TIMEOUT_MS }
      )
      .catch(() => {
        // Non-fatal — capture whatever we have.
      });

    const html = await page.content();
    const outPath = routeToFilePath(route);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, html, "utf-8");
    return { route, ok: true };
  } catch (err) {
    return { route, ok: false, error: (err as Error).message };
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  if (!(await distExists())) {
    console.warn(
      `[prerender] dist/public/index.html not found at ${DIST} — run \`vite build\` first. Skipping.`
    );
    return;
  }

  console.log(`[prerender] Starting prerender for ${ROUTES.length} routes`);

  const server = await bootStaticServer();
  console.log(`[prerender] Static server listening on port ${server.port}`);

  let browser: Browser | undefined;
  try {
    const executablePath = resolveChromiumPath();
    try {
      browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    } catch (err) {
      // Graceful degradation: log loudly, but don't fail the build. The
      // server falls through to Phase 1's injectSeoIntoHtml for these
      // routes, which is the SEO floor for non-JS crawlers.
      console.warn(
        "[prerender] puppeteer.launch failed — Phase 1 SSR-lite still serves these routes."
      );
      console.warn(
        `[prerender]   executablePath tried: ${executablePath ?? "<bundled>"}`
      );
      console.warn(
        `[prerender]   error: ${(err as Error).message}`
      );
      console.warn(
        "[prerender]   To enable prerender in this environment, install chromium and set PUPPETEER_EXECUTABLE_PATH."
      );
      return;
    }

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    let okCount = 0;
    let failCount = 0;
    for (const route of ROUTES) {
      const result = await prerenderOne(browser, server.port, route);
      if (result.ok) {
        console.log(`[prerender] ✓ ${result.route}`);
        okCount++;
      } else {
        console.warn(`[prerender] ✗ ${result.route} — ${result.error}`);
        failCount++;
      }
    }
    console.log(
      `[prerender] Done: ${okCount} ok, ${failCount} failed, output → ${OUTPUT_DIR}`
    );
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error("[prerender] Fatal:", err);
  process.exit(1);
});
