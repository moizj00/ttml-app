import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  injectSeoIntoHtml,
  resolveSpaRoute,
  shouldReturnAsset404,
} from "./spaRoutes";

const repoRoot = path.resolve(import.meta.dirname, "..");

function parseRobotsGroups(robots: string) {
  return robots
    .split(/\n\s*\n/g)
    .map(group => {
      const userAgents: string[] = [];
      const directives: string[] = [];

      for (const line of group.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const userAgent = trimmed.match(/^User-agent:\s*(.+)$/i)?.[1];
        if (userAgent) {
          userAgents.push(userAgent);
          continue;
        }

        directives.push(trimmed);
      }

      return { userAgents, directives };
    })
    .filter(group => group.userAgents.length > 0);
}

function getRobotsDirectivesFor(robots: string, userAgent: string) {
  const groups = parseRobotsGroups(robots);
  return (
    groups.find(group =>
      group.userAgents.some(agent => agent.toLowerCase() === userAgent.toLowerCase())
    )?.directives ?? []
  );
}

describe("crawler-facing static files", () => {
  it("removes the obsolete meta keywords tag from the raw HTML shell", async () => {
    const html = await fs.readFile(
      path.join(repoRoot, "client", "index.html"),
      "utf8"
    );

    expect(html).not.toMatch(/<meta\s+name=["']keywords["']/i);
  });

  it("publishes an llms.txt guide at the public root", async () => {
    const llms = await fs.readFile(
      path.join(repoRoot, "client", "public", "llms.txt"),
      "utf8"
    );

    expect(llms).toContain("# Talk to My Lawyer");
    expect(llms).toContain("[Pricing](https://talk-to-my-lawyer.com/pricing)");
    expect(llms).toContain(
      "[Demand letter](https://talk-to-my-lawyer.com/services/demand-letter)"
    );
  });

  it("aligns robots.txt to search=yes and ai-train=no", async () => {
    const robots = await fs.readFile(
      path.join(repoRoot, "client", "public", "robots.txt"),
      "utf8"
    );

    expect(robots).toMatch(/User-agent:\s*OAI-SearchBot[\s\S]*?Allow:\s*\//);
    expect(robots).toMatch(/User-agent:\s*ChatGPT-User[\s\S]*?Allow:\s*\//);
    expect(robots).toMatch(/User-agent:\s*PerplexityBot[\s\S]*?Allow:\s*\//);
    expect(robots).toMatch(/User-agent:\s*ClaudeBot[\s\S]*?Allow:\s*\//);

    expect(robots).toMatch(/User-agent:\s*GPTBot[\s\S]*?Disallow:\s*\//);
    expect(robots).toMatch(
      /User-agent:\s*Google-Extended[\s\S]*?Disallow:\s*\//
    );
    expect(robots).toMatch(
      /User-agent:\s*Applebot-Extended[\s\S]*?Disallow:\s*\//
    );
    expect(robots).toMatch(/User-agent:\s*anthropic-ai[\s\S]*?Disallow:\s*\//);
    expect(robots).toMatch(/User-agent:\s*CCBot[\s\S]*?Disallow:\s*\//);
    expect(robots).toMatch(/User-agent:\s*Bytespider[\s\S]*?Disallow:\s*\//);
  });

  it("keeps named retrieval crawlers in a group with private-path disallows", async () => {
    const robots = await fs.readFile(
      path.join(repoRoot, "client", "public", "robots.txt"),
      "utf8"
    );

    for (const userAgent of [
      "OAI-SearchBot",
      "ChatGPT-User",
      "PerplexityBot",
      "ClaudeBot",
      "Claude-Web",
    ]) {
      const directives = getRobotsDirectivesFor(robots, userAgent);
      expect(directives).toContain("Allow: /");
      expect(directives).toContain("Disallow: /admin");
      expect(directives).toContain("Disallow: /api/");
    }
  });
});

describe("SPA route metadata and 404 handling", () => {
  const template = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Attorney-Drafted Legal Letters - Demand Letters &amp; Cease and Desist | Talk to My Lawyer</title>
    <meta name="description" content="Generic description" />
    <meta name="keywords" content="old seo keywords" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="Generic OG" />
    <meta property="og:description" content="Generic OG description" />
    <meta property="og:url" content="https://www.talk-to-my-lawyer.com" />
    <meta name="twitter:title" content="Generic Twitter" />
    <meta name="twitter:description" content="Generic Twitter description" />
  </head>
  <body><div id="root"></div></body>
</html>`;

  it("injects pricing-specific title, description, robots, and canonical tags", async () => {
    const route = await resolveSpaRoute("/pricing");
    const html = injectSeoIntoHtml(template, route);

    expect(route.statusCode).toBe(200);
    expect(html).toContain(
      "<title>Legal Letter Pricing - Single, Monthly &amp; Yearly Plans | Talk to My Lawyer</title>"
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://www.talk-to-my-lawyer.com/pricing" />'
    );
    expect(html).toContain('<meta name="robots" content="index, follow');
    expect(html).not.toMatch(/<meta\s+name=["']keywords["']/i);
    expect(html).not.toContain("Generic description");
  });

  it("uses published blog post metadata when the slug exists", async () => {
    const route = await resolveSpaRoute("/blog/test-post", {
      getBlogPost: async slug => ({
        slug,
        title: "What should I do if a competitor sells knockoffs?",
        excerpt: "A practical guide to stopping infringing knockoffs.",
        content:
          "The short answer is to combine platform reports with a formal legal letter.\n\n## What are my legal options?\n\nStart with marketplace reporting, then escalate with an attorney-reviewed demand letter.",
        metaDescription:
          "Learn how legal letters, platform reports, and IP rights can stop knockoff sellers.",
        ogImageUrl: "https://cdn.example.com/knockoffs.png",
        publishedAt: new Date("2026-05-14T12:00:00.000Z"),
        updatedAt: new Date("2026-05-15T12:00:00.000Z"),
      }),
    });
    const html = injectSeoIntoHtml(template, route);

    expect(route.statusCode).toBe(200);
    expect(html).toContain(
      "<title>What should I do if a competitor sells knockoffs? - Talk to My Lawyer Blog</title>"
    );
    expect(html).toContain(
      'content="Learn how legal letters, platform reports, and IP rights can stop knockoff sellers."'
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://www.talk-to-my-lawyer.com/blog/test-post" />'
    );
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain("https://cdn.example.com/knockoffs.png");
    expect(html).toContain('data-prerender-route="/blog/test-post"');
    expect(html).toContain(
      "<h1>What should I do if a competitor sells knockoffs?</h1>"
    );
    expect(html).toContain("<h2>What are my legal options?</h2>");
    expect(html).toContain("attorney-reviewed demand letter");
  });

  it("returns 404 (not 500) for malformed percent-encoded blog slugs", async () => {
    let getBlogPostCalled = false;
    const route = await resolveSpaRoute("/blog/%E0%A4%A", {
      getBlogPost: async () => {
        getBlogPostCalled = true;
        return null;
      },
    });

    expect(route.statusCode).toBe(404);
    expect(route.knownRoute).toBe(false);
    // The decode should fail before getBlogPost is ever called — a malformed
    // URL must not reach the database layer.
    expect(getBlogPostCalled).toBe(false);
  });

  it("injects service page fallback content for JS-blind crawlers", async () => {
    const route = await resolveSpaRoute("/services/demand-letter");
    const html = injectSeoIntoHtml(template, route);

    expect(route.statusCode).toBe(200);
    expect(html).toContain('data-prerender-route="/services/demand-letter"');
    expect(html).toContain("<h1>Demand Letter Service</h1>");
    expect(html).toContain("Get a professional demand letter");
  });

  it("injects service links into the services index fallback", async () => {
    const route = await resolveSpaRoute("/services");
    const html = injectSeoIntoHtml(template, route);

    expect(route.statusCode).toBe(200);
    expect(html).toContain('data-prerender-route="/services"');
    expect(html).toContain('<a href="/services/demand-letter">');
    expect(html).toContain('<a href="/services/cease-and-desist">');
    expect(html).toContain(
      '<a href="/services/intellectual-property-infringement-letter">'
    );
  });

  it("returns a real 404 shell for unknown routes and noindexes it", async () => {
    const route = await resolveSpaRoute("/this-route-does-not-exist");
    const html = injectSeoIntoHtml(template, route);

    expect(route.statusCode).toBe(404);
    expect(route.knownRoute).toBe(false);
    expect(html).toContain("<title>Page Not Found | Talk to My Lawyer</title>");
    expect(html).toContain(
      '<meta name="robots" content="noindex, nofollow" />'
    );
  });

  it("does not serve the SPA shell for missing asset URLs", () => {
    expect(shouldReturnAsset404("/assets/missing-script.js")).toBe(true);
    expect(shouldReturnAsset404("/favicon-32.png")).toBe(true);
    expect(shouldReturnAsset404("/pricing")).toBe(false);
  });
});
