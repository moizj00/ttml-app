import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadPrerenderCache,
  prerenderFileToRoute,
} from "./prerenderCache";

describe("prerenderCache", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "prerender-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("prerenderFileToRoute", () => {
    it("maps index.html to /", () => {
      expect(prerenderFileToRoute("index.html")).toBe("/");
    });

    it("maps pricing.html to /pricing", () => {
      expect(prerenderFileToRoute("pricing.html")).toBe("/pricing");
    });

    it("maps services/demand-letter.html to /services/demand-letter", () => {
      expect(prerenderFileToRoute("services/demand-letter.html")).toBe(
        "/services/demand-letter"
      );
    });
  });

  describe("loadPrerenderCache", () => {
    it("returns an empty map when the directory does not exist", async () => {
      const cache = await loadPrerenderCache(
        path.join(tmpDir, "does-not-exist")
      );
      expect(cache.size).toBe(0);
    });

    it("returns an empty map when the directory is empty", async () => {
      const cache = await loadPrerenderCache(tmpDir);
      expect(cache.size).toBe(0);
    });

    it("loads top-level HTML files and maps them to routes", async () => {
      await fs.writeFile(
        path.join(tmpDir, "index.html"),
        "<html><body>Home</body></html>"
      );
      await fs.writeFile(
        path.join(tmpDir, "pricing.html"),
        "<html><body>Pricing</body></html>"
      );

      const cache = await loadPrerenderCache(tmpDir);

      expect(cache.size).toBe(2);
      expect(cache.get("/")).toContain("Home");
      expect(cache.get("/pricing")).toContain("Pricing");
    });

    it("recurses into subdirectories for nested routes", async () => {
      await fs.mkdir(path.join(tmpDir, "services"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "services", "demand-letter.html"),
        "<html><body>Demand Letter</body></html>"
      );
      await fs.writeFile(
        path.join(tmpDir, "services", "cease-and-desist.html"),
        "<html><body>Cease &amp; Desist</body></html>"
      );

      const cache = await loadPrerenderCache(tmpDir);

      expect(cache.size).toBe(2);
      expect(cache.get("/services/demand-letter")).toContain("Demand Letter");
      expect(cache.get("/services/cease-and-desist")).toContain(
        "Cease &amp; Desist"
      );
    });

    it("ignores non-HTML files", async () => {
      await fs.writeFile(path.join(tmpDir, "index.html"), "<html />");
      await fs.writeFile(
        path.join(tmpDir, "manifest.json"),
        '{"name":"junk"}'
      );
      await fs.writeFile(path.join(tmpDir, "robots.txt"), "User-agent: *");

      const cache = await loadPrerenderCache(tmpDir);

      expect(cache.size).toBe(1);
      expect(cache.has("/")).toBe(true);
      expect(cache.has("/manifest")).toBe(false);
      expect(cache.has("/robots")).toBe(false);
    });

    it("returns forward-slash routes on all platforms", async () => {
      await fs.mkdir(path.join(tmpDir, "services"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "services", "demand-letter.html"),
        "x"
      );

      const cache = await loadPrerenderCache(tmpDir);

      // Even on Windows, route keys use "/" separators.
      const routes = Array.from(cache.keys());
      for (const route of routes) {
        expect(route).not.toContain("\\");
      }
    });
  });
});
