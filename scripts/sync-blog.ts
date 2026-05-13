/**
 * scripts/sync-blog.ts
 *
 * Reads every Markdown file in blog/ and upserts it into the blog_posts
 * Postgres table via Drizzle.  Run locally or in CI (see .github/workflows/sync-blog.yml).
 *
 *   pnpm tsx scripts/sync-blog.ts
 *
 * Requires DATABASE_URL env var (same one the server uses).
 */

import * as fs from "fs";
import * as path from "path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { blogPosts } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { BlogCategory } from "../drizzle/schema";

const BLOG_DIR = path.join(__dirname, "../blog");

// ─── Frontmatter Parser ───────────────────────────────────────────────────────
function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw.trim() };

  const yamlStr = match[1];
  const content = match[2].trim();
  const data: Record<string, unknown> = {};

  for (const line of yamlStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      data[key] = inner
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      data[key] = value;
    }
  }

  return { data, content };
}

// ─── Tag / Category Mapping ───────────────────────────────────────────────────
const VALID_CATEGORIES = new Set<BlogCategory>([
  "demand-letters", "cease-and-desist", "contract-disputes", "eviction-notices",
  "employment-disputes", "consumer-complaints", "pre-litigation-settlement",
  "debt-collection", "estate-probate", "landlord-tenant", "insurance-disputes",
  "personal-injury", "intellectual-property", "family-law", "neighbor-hoa",
  "document-analysis", "pricing-and-roi", "general",
]);

const TAG_TO_CATEGORY: Record<string, BlogCategory> = {
  "demand-letter": "demand-letters", "demand letter": "demand-letters",
  "demand letters": "demand-letters", "cease-and-desist": "cease-and-desist",
  "cease and desist": "cease-and-desist", contract: "contract-disputes",
  "contract-disputes": "contract-disputes", "breach of contract": "contract-disputes",
  landlord: "landlord-tenant", "landlord-tenant": "landlord-tenant",
  tenant: "landlord-tenant", rent: "landlord-tenant", "security deposit": "landlord-tenant",
  eviction: "eviction-notices", "eviction-notices": "eviction-notices",
  employment: "employment-disputes", "employment-disputes": "employment-disputes",
  "intellectual property": "intellectual-property", "intellectual-property": "intellectual-property",
  trademark: "intellectual-property", copyright: "intellectual-property",
  dmca: "intellectual-property", ip: "intellectual-property",
  ecommerce: "intellectual-property", counterfeit: "intellectual-property",
  knockoff: "intellectual-property", "personal-injury": "personal-injury",
  "personal injury": "personal-injury", "debt-collection": "debt-collection",
  "debt collection": "debt-collection", consumer: "consumer-complaints",
  "consumer-complaints": "consumer-complaints", "pricing-and-roi": "pricing-and-roi",
  pricing: "pricing-and-roi", "flat-fee": "pricing-and-roi",
  "document-analysis": "document-analysis", "family-law": "family-law",
  "family law": "family-law", divorce: "family-law", neighbor: "neighbor-hoa",
  "neighbor-hoa": "neighbor-hoa", hoa: "neighbor-hoa", insurance: "insurance-disputes",
  "insurance-disputes": "insurance-disputes", estate: "estate-probate",
  probate: "estate-probate", "pre-litigation": "pre-litigation-settlement",
  settlement: "pre-litigation-settlement", freelancer: "demand-letters",
  "unpaid invoice": "demand-letters", contractor: "contract-disputes",
};

function inferCategory(data: Record<string, unknown>): BlogCategory {
  if (typeof data.category === "string") {
    const cat = data.category.toLowerCase().trim() as BlogCategory;
    if (VALID_CATEGORIES.has(cat)) return cat;
  }
  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
  for (const tag of tags) {
    const mapped = TAG_TO_CATEGORY[tag.toLowerCase().trim()];
    if (mapped) return mapped;
  }
  return "general";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractExcerpt(content: string, maxLen = 220): string {
  const stripped = content
    .replace(/#{1,6}\s+[^\n]+\n?/g, "").replace(/\*\*/g, "").replace(/\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`[^`]+`/g, "").trim();
  const firstPara = (stripped.split(/\n\n+/)[0] ?? "").trim();
  if (firstPara.length <= maxLen) return firstPara;
  return firstPara.slice(0, maxLen).replace(/\s+\S*$/, "…");
}

function calcReadingTime(content: string): number {
  return Math.max(1, Math.round(content.trim().split(/\s+/).length / 200));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  if (!fs.existsSync(BLOG_DIR)) { console.error(`blog/ not found at ${BLOG_DIR}`); process.exit(1); }

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md")).sort();
  console.log(`Found ${files.length} markdown files in blog/\n`);

  let created = 0, updated = 0, skipped = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf-8");
    const { data, content } = parseFrontmatter(raw);

    if (!data.title || !data.slug) {
      console.warn(`  ⚠ SKIP ${file}: missing title or slug`); skipped++; continue;
    }

    const status = (data.status as string | undefined)?.trim() === "draft" ? "draft" : "published";
    const category = inferCategory(data);
    const excerpt = typeof data.excerpt === "string" && data.excerpt.trim()
      ? data.excerpt.trim() : extractExcerpt(content);
    const publishedAt = status === "published"
      ? new Date((data.date as string | undefined) ?? Date.now()) : null;

    const payload = {
      slug: data.slug as string, title: data.title as string, excerpt, content, category,
      metaDescription: typeof data.description === "string" ? data.description : null,
      authorName: typeof data.author === "string" ? data.author : "Talk to My Lawyer Team",
      readingTimeMinutes: calcReadingTime(content), status, publishedAt, updatedAt: new Date(),
    };

    const existing = await db.select({ id: blogPosts.id }).from(blogPosts)
      .where(eq(blogPosts.slug, payload.slug)).limit(1);

    if (existing.length > 0) {
      await db.update(blogPosts).set(payload).where(eq(blogPosts.slug, payload.slug));
      console.log(`  ↺ updated  ${payload.slug}  [${category}]`); updated++;
    } else {
      await db.insert(blogPosts).values(payload);
      console.log(`  ✓ created  ${payload.slug}  [${category}]`); created++;
    }
  }

  await pool.end();
  console.log(`\nDone. created=${created}  updated=${updated}  skipped=${skipped}`);
}

main().catch((err) => { console.error("\n✗ sync-blog failed:", err); process.exit(1); });
