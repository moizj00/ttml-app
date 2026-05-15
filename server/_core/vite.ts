import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { getCachedBlogPost, getCachedBlogPosts } from "../blogCache";
import { logger } from "../logger";
import {
  injectSeoIntoHtml,
  resolveSpaRoute,
  shouldReturnAsset404,
} from "../spaRoutes";
import { loadPrerenderCache } from "./prerenderCache";

export async function setupVite(app: Express, server: Server) {
  // Dynamic import: vite and vite.config are only loaded in development mode.
  // This prevents the vite.config.ts (which reads package.json via fs.readFileSync
  // at module-evaluation time) from being executed inside the esbuild production bundle,
  // which would crash because import.meta.dirname resolves to /app/dist where
  // package.json does not exist.
  const { createServer: createViteServer } = await import("vite");
  // We use a dynamic import with a variable to prevent esbuild from
  // statically resolving and bundling the vite config file.
  const configPath = "../../vite.config.js";
  const { default: viteConfig } = await import(configPath);

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      if (shouldReturnAsset404(url)) {
        res.sendStatus(404);
        return;
      }

      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      const route = await resolveSpaRoute(url, {
        getBlogPost: getCachedBlogPost,
        getBlogPosts: () => getCachedBlogPosts({ limit: 12 }),
      });
      const html = injectSeoIntoHtml(page, route);
      res
        .status(route.statusCode)
        .set({
          "Content-Type": "text/html",
          "X-Robots-Tag": route.seo.robots,
        })
        .end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In production, dist/index.js lives at /app/dist/index.js
  // import.meta.dirname = /app/dist
  // Vite builds the client to dist/public (outDir in vite.config.ts)
  // So the correct path is: /app/dist/public
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    logger.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // { index: false } prevents express.static from serving index.html directly
  // for requests to "/" so that every HTML response goes through the
  // prerender cache + injectSeoIntoHtml pipeline.
  app.use(express.static(distPath, { index: false }));

  // Cache index.html in memory — it is immutable for the lifetime of the process
  // in production, so there is no need to hit the filesystem on every request.
  const indexHtmlPath = path.resolve(distPath, "index.html");
  let cachedTemplate: string | null = null;
  const loadTemplate = async (): Promise<string> => {
    if (cachedTemplate === null) {
      cachedTemplate = await fs.promises.readFile(indexHtmlPath, "utf-8");
    }
    return cachedTemplate;
  };

  // Prerender cache — populated at startup from dist/_prerender/ (sibling of
  // dist/public/, so the prerendered HTML is NOT directly addressable via the
  // express.static middleware at e.g. /_prerender/pricing.html). Empty map if
  // the prerender step was skipped (e.g. build env without Chromium); the
  // server then falls through to injectSeoIntoHtml.
  const prerenderDir = path.resolve(distPath, "..", "_prerender");
  let prerenderCache = new Map<string, string>();
  loadPrerenderCache(prerenderDir)
    .then((cache) => {
      prerenderCache = cache;
      if (cache.size > 0) {
        logger.info(
          `[prerender] Loaded ${cache.size} prerendered routes from ${prerenderDir}`
        );
      }
    })
    .catch((err) => {
      logger.warn({ err }, "[prerender] Failed to load prerender cache");
    });

  // Fall through to index.html only for known SPA routes. Unknown paths get a
  // real 404 status while still hydrating the styled NotFound page.
  app.use("*", async (req, res, next) => {
    try {
      if (shouldReturnAsset404(req.originalUrl)) {
        res.sendStatus(404);
        return;
      }

      const route = await resolveSpaRoute(req.originalUrl, {
        getBlogPost: getCachedBlogPost,
        getBlogPosts: () => getCachedBlogPosts({ limit: 12 }),
      });

      // Use the normalized pathname from resolveSpaRoute so trailing slashes
      // (e.g. "/pricing/") hit the cache the same way "/pricing" does.
      const prerendered = prerenderCache.get(route.pathname);
      if (prerendered) {
        res
          .status(route.statusCode)
          .set({
            "Content-Type": "text/html",
            "X-Robots-Tag": route.seo.robots,
            "X-Prerender": "1",
          })
          .end(prerendered);
        return;
      }

      const template = await loadTemplate();
      const html = injectSeoIntoHtml(template, route);
      res
        .status(route.statusCode)
        .set({
          "Content-Type": "text/html",
          "X-Robots-Tag": route.seo.robots,
        })
        .end(html);
    } catch (err) {
      next(err);
    }
  });
}
