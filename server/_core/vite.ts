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

  app.use(express.static(distPath));

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
      const template = await fs.promises.readFile(
        path.resolve(distPath, "index.html"),
        "utf-8"
      );
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
