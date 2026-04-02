import { and, desc, eq, sql } from "drizzle-orm";
import { blogPosts } from "../../drizzle/schema";
import { getDb } from "./core";

export async function getPublishedBlogPosts(options: { category?: string; limit?: number; offset?: number } = {}) {
  const db = await getDb();
  if (!db) return { posts: [], total: 0 };
  const { category, limit = 12, offset = 0 } = options;

  const conditions = category
    ? and(eq(blogPosts.status, "published"), eq(blogPosts.category, category))
    : eq(blogPosts.status, "published");

  const [posts, countResult] = await Promise.all([
    db.select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      category: blogPosts.category,
      authorName: blogPosts.authorName,
      readingTimeMinutes: blogPosts.readingTimeMinutes,
      publishedAt: blogPosts.publishedAt,
      ogImageUrl: blogPosts.ogImageUrl,
    })
      .from(blogPosts)
      .where(conditions)
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(blogPosts)
      .where(conditions),
  ]);
  return { posts, total: countResult[0]?.count ?? 0 };
}

export async function getBlogPostBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")))
    .limit(1);
  return result[0] ?? null;
}

export async function getBlogPostBySlugAnyStatus(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.slug, slug))
    .limit(1);
  return result[0] ?? null;
}

export async function getBlogPostSlugById(id: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ slug: blogPosts.slug })
    .from(blogPosts)
    .where(eq(blogPosts.id, id))
    .limit(1);
  return result[0]?.slug ?? null;
}

export async function getAllBlogPosts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blogPosts).orderBy(desc(blogPosts.updatedAt));
}

export async function createBlogPost(data: {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  metaDescription?: string;
  ogImageUrl?: string;
  authorName?: string;
  status?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const wordCount = data.content.split(/\s+/).length;
  const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));
  const now = new Date();
  const [result] = await db.insert(blogPosts).values({
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt,
    content: data.content,
    category: data.category,
    metaDescription: data.metaDescription ?? null,
    ogImageUrl: data.ogImageUrl ?? null,
    authorName: data.authorName ?? "Talk to My Lawyer",
    readingTimeMinutes,
    status: data.status ?? "draft",
    publishedAt: data.status === "published" ? now : null,
    createdAt: now,
    updatedAt: now,
  }).returning({ id: blogPosts.id });
  return result;
}

export async function updateBlogPost(id: number, data: Partial<{
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  metaDescription: string | null;
  ogImageUrl: string | null;
  authorName: string;
  status: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updates: Record<string, string | number | Date | null | undefined> = { ...data, updatedAt: new Date() };
  if (data.content) {
    const wordCount = data.content.split(/\s+/).length;
    updates.readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));
  }
  if (data.status === "published") {
    const existing = await db.select({ publishedAt: blogPosts.publishedAt }).from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
    if (!existing[0]?.publishedAt) {
      updates.publishedAt = new Date();
    }
  }
  await db.update(blogPosts).set(updates).where(eq(blogPosts.id, id));
}

export async function deleteBlogPost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}
