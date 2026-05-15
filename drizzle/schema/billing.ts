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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  subscriptionPlanEnum,
  subscriptionStatusEnum,
  commissionStatusEnum,
  payoutStatusEnum,
} from "./constants";
import { users } from "./users";
import { letterRequests } from "./letters";

// ─── Subscription Plan / Status constants (re-exported for convenience) ───
export const SUBSCRIPTION_PLANS = ["per_letter", "monthly", "annual", "free_trial_review", "starter", "professional", "single_letter", "yearly"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = ["active", "canceled", "past_due", "trialing", "incomplete", "none"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

// ═══════════════════════════════════════════════════════
// TABLE: subscriptions (Stripe subscription tracking)
// ═══════════════════════════════════════════════════════
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").unique().references(() => users.id, { onDelete: "set null" }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  plan: subscriptionPlanEnum("plan").notNull(),
  status: subscriptionStatusEnum("status").default("none").notNull(),
  lettersAllowed: integer("letters_allowed").default(0).notNull(),
  lettersUsed: integer("letters_used").default(0).notNull(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_subscriptions_stripe_subscription_id").on(t.stripeSubscriptionId),
  index("idx_subscriptions_stripe_customer_id").on(t.stripeCustomerId),
  index("idx_subscriptions_status").on(t.status),
]);

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: discount_codes (employee referral codes)
// ═══════════════════════════════════════════════════════
export const discountCodes = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  discountPercent: integer("discount_percent").default(20).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
  maxUses: integer("max_uses"), // null = unlimited
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  codeIdx: index("idx_discount_codes_code").on(t.code),
  employeeIdx: index("idx_discount_codes_employee_id").on(t.employeeId),
}));

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: commission_ledger (employee earnings from referrals)
// ═══════════════════════════════════════════════════════
export const commissionLedger = pgTable("commission_ledger", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => users.id, { onDelete: "set null" }),
  letterRequestId: integer("letter_request_id").references(() => letterRequests.id, { onDelete: "set null" }),
  subscriberId: integer("subscriber_id").references(() => users.id, { onDelete: "set null" }),
  discountCodeId: integer("discount_code_id"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 }),
  saleAmount: integer("sale_amount").notNull(), // in cents
  commissionRate: integer("commission_rate").default(500).notNull(), // basis points (500 = 5%)
  commissionAmount: integer("commission_amount").notNull(), // in cents
  status: commissionStatusEnum("status").default("pending").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  employeeIdx: index("idx_commission_ledger_employee_id").on(t.employeeId),
  statusIdx: index("idx_commission_ledger_status").on(t.status),
  employeeStatusIdx: index("idx_commission_ledger_employee_status").on(t.employeeId, t.status),
  uniquePaymentIntentIdx: uniqueIndex("uq_commission_ledger_stripe_pi").on(t.stripePaymentIntentId),
  uniqueInvoiceIdx: uniqueIndex("uq_commission_ledger_stripe_invoice").on(t.stripeInvoiceId),
}));

export type CommissionLedgerEntry = typeof commissionLedger.$inferSelect;
export type InsertCommissionLedgerEntry = typeof commissionLedger.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: payout_requests (employee withdrawal requests)
// ═══════════════════════════════════════════════════════
export const payoutRequests = pgTable("payout_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  amount: integer("amount").notNull(), // in cents
  paymentMethod: varchar("payment_method", { length: 100 }).default("bank_transfer").notNull(),
  paymentDetails: jsonb("payment_details"),
  status: payoutStatusEnum("status").default("pending").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processedBy: integer("processed_by").references(() => users.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  employeeIdx: index("idx_payout_requests_employee_id").on(t.employeeId),
  statusIdx: index("idx_payout_requests_status").on(t.status),
}));

export type PayoutRequest = typeof payoutRequests.$inferSelect;
export type InsertPayoutRequest = typeof payoutRequests.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: commission_payout_allocations (reserved payout rows)
// ═══════════════════════════════════════════════════════
export const commissionPayoutAllocations = pgTable("commission_payout_allocations", {
  id: serial("id").primaryKey(),
  payoutRequestId: integer("payout_request_id").notNull().references(() => payoutRequests.id, { onDelete: "cascade" }),
  commissionId: integer("commission_id").notNull().references(() => commissionLedger.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  payoutIdx: index("idx_commission_payout_allocations_payout").on(t.payoutRequestId),
  commissionIdx: index("idx_commission_payout_allocations_commission").on(t.commissionId),
  uniqueCommissionIdx: uniqueIndex("uq_commission_payout_allocations_commission").on(t.commissionId),
}));

export type CommissionPayoutAllocation = typeof commissionPayoutAllocations.$inferSelect;
export type InsertCommissionPayoutAllocation = typeof commissionPayoutAllocations.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: processed_stripe_events (webhook idempotency)
// ═══════════════════════════════════════════════════════
export const processedStripeEvents = pgTable("processed_stripe_events", {
  eventId: varchar("event_id", { length: 255 }).primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
});
