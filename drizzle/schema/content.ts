import {
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
  jsonb,
  serial,
  index,
} from "drizzle-orm/pg-core";

// ═══════════════════════════════════════════════════════
// TABLE: blog_posts (CMS for public blog)
// ═══════════════════════════════════════════════════════
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 300 }).notNull().unique(),
  title: varchar("title", { length: 300 }).notNull(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  metaDescription: text("meta_description"),
  ogImageUrl: varchar("og_image_url", { length: 2000 }),
  authorName: varchar("author_name", { length: 200 }).default("Talk to My Lawyer").notNull(),
  readingTimeMinutes: integer("reading_time_minutes").default(5).notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  reviewedBy: varchar("reviewed_by", { length: 200 }),   // admin who signed off before publish
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusIdx: index("idx_blog_posts_status").on(t.status),
  publishedAtIdx: index("idx_blog_posts_published_at").on(t.publishedAt),
}));

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: document_analyses (document analyzer tool)
// ═══════════════════════════════════════════════════════
export const documentAnalyses = pgTable("document_analyses", {
  id: serial("id").primaryKey(),
  documentName: varchar("document_name", { length: 500 }).notNull(),
  fileType: varchar("file_type", { length: 20 }).notNull(), // pdf, docx, txt
  analysisJson: jsonb("analysis_json").notNull(),
  userId: integer("user_id"), // null = unauthenticated
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index("idx_document_analyses_user_id").on(t.userId),
  createdAtIdx: index("idx_document_analyses_created_at").on(t.createdAt),
}));

export type DocumentAnalysis = typeof documentAnalyses.$inferSelect;
export type InsertDocumentAnalysis = typeof documentAnalyses.$inferInsert;
