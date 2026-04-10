import {
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { userRoleEnum } from "./constants";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: userRoleEnum("role").default("subscriber").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in", { withTimezone: true }).defaultNow().notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  freeReviewUsedAt: timestamp("free_review_used_at", { withTimezone: true }),
  consentToTraining: boolean("consent_to_training").default(false).notNull(),
  subscriberId: varchar("subscriber_id", { length: 16 }).unique(),
  employeeId: varchar("employee_id", { length: 16 }).unique(),
  attorneyId: varchar("attorney_id", { length: 16 }).unique(),
}, (t) => [
  index("idx_users_email").on(t.email),
  index("idx_users_role").on(t.role),
  index("idx_users_role_active").on(t.role, t.isActive),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
