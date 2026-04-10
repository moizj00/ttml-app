import {
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
  jsonb,
  boolean,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// ═══════════════════════════════════════════════════════
// TABLE: notifications
// ═══════════════════════════════════════════════════════
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 100 }).notNull(),
  category: varchar("category", { length: 50 }).default("general").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  body: text("body"),
  link: varchar("link", { length: 1000 }),
  readAt: timestamp("read_at", { withTimezone: true }),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_notifications_user_id").on(t.userId),
  index("idx_notifications_read_at").on(t.readAt),
]);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: email_verification_tokens
// ═══════════════════════════════════════════════════════
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tokenIdx: index("idx_email_verification_tokens_token").on(t.token),
  userIdx: index("idx_email_verification_tokens_user_id").on(t.userId),
}));

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: admin_verification_codes (admin 2FA via email)
// ═══════════════════════════════════════════════════════
export const adminVerificationCodes = pgTable("admin_verification_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  code: varchar("code", { length: 8 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index("idx_admin_verification_codes_user_id").on(t.userId),
}));

export type AdminVerificationCode = typeof adminVerificationCodes.$inferSelect;
export type InsertAdminVerificationCode = typeof adminVerificationCodes.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: newsletter_subscribers
// ═══════════════════════════════════════════════════════
export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  source: varchar("source", { length: 100 }).default("footer"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type InsertNewsletterSubscriber = typeof newsletterSubscribers.$inferInsert;
