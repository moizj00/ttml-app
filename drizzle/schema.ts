import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  jsonb,
  bigint,
  boolean,
  serial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── User Roles ───
export const USER_ROLES = ["subscriber", "employee", "attorney", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ─── Letter Statuses (State Machine) ───
// Active statuses used by the application logic.
// NOTE: The pgEnum (letterStatusEnum) still includes legacy values
// (generated_unlocked, upsell_dismissed) for backwards compatibility with
// existing database rows, but they are NOT part of the active state machine.
export const LETTER_STATUSES = [
  "submitted",
  "researching",
  "drafting",
  "generated_locked",
  "pending_review",
  "under_review",
  "needs_changes",
  "approved",
  "client_approval_pending",
  "client_revision_requested",
  "client_declined",
  "client_approved",
  "sent",
  "rejected",
  "pipeline_failed",
] as const;
export type LetterStatus = (typeof LETTER_STATUSES)[number];

// ─── Letter Types ───
export const LETTER_TYPES = [
  "demand-letter",
  "cease-and-desist",
  "contract-breach",
  "eviction-notice",
  "employment-dispute",
  "consumer-complaint",
  "general-legal",
] as const;
export type LetterType = (typeof LETTER_TYPES)[number];

// ─── Version Types ───
export const VERSION_TYPES = ["ai_draft", "attorney_edit", "final_approved"] as const;
export type VersionType = (typeof VERSION_TYPES)[number];

// ─── Actor Types ───
export const ACTOR_TYPES = ["system", "subscriber", "employee", "attorney", "admin"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

// ─── Job Statuses ───
export const JOB_STATUSES = ["queued", "running", "completed", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// ─── Job Types ───
export const JOB_TYPES = ["research", "draft_generation", "generation_pipeline", "retry", "vetting"] as const;
export type JobType = (typeof JOB_TYPES)[number];

// ─── Research Statuses ───
export const RESEARCH_STATUSES = ["queued", "running", "completed", "failed", "invalid"] as const;
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

// ─── Priority Levels ───
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

// ─── PostgreSQL Enums ───
export const userRoleEnum = pgEnum("user_role", ["subscriber", "employee", "admin", "attorney"]);
export const letterStatusEnum = pgEnum("letter_status", [
  "submitted", "researching", "drafting", "generated_locked", "generated_unlocked",
  "upsell_dismissed", "pipeline_failed",
  "pending_review", "under_review", "needs_changes", "approved",
  "client_approval_pending", "client_revision_requested", "client_declined", "client_approved", "sent",
  "rejected",
]);
export const letterTypeEnum = pgEnum("letter_type", [
  "demand-letter", "cease-and-desist", "contract-breach", "eviction-notice",
  "employment-dispute", "consumer-complaint", "general-legal",
]);
export const versionTypeEnum = pgEnum("version_type", ["ai_draft", "attorney_edit", "final_approved"]);
export const actorTypeEnum = pgEnum("actor_type", ["system", "subscriber", "employee", "admin", "attorney"]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "completed", "failed"]);
export const jobTypeEnum = pgEnum("job_type", ["research", "draft_generation", "generation_pipeline", "retry", "vetting"]);
export const researchStatusEnum = pgEnum("research_status", ["queued", "running", "completed", "failed", "invalid"]);
export const priorityEnum = pgEnum("priority_level", ["low", "normal", "high", "urgent"]);
export const noteVisibilityEnum = pgEnum("note_visibility", ["internal", "user_visible"]);
export const subscriptionPlanEnum = pgEnum("subscription_plan", ["per_letter", "monthly", "monthly_basic", "annual", "free_trial_review", "starter", "professional", "single_letter", "yearly"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "canceled", "past_due", "trialing", "incomplete", "none"]);
export const commissionStatusEnum = pgEnum("commission_status", ["pending", "paid", "voided"]);
export const payoutStatusEnum = pgEnum("payout_status", ["pending", "processing", "completed", "rejected"]);

// ─── Pipeline Learning Enums ───
export const PIPELINE_STAGES = ["research", "drafting", "assembly", "vetting"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const LESSON_CATEGORIES = [
  "citation_error", "jurisdiction_error", "tone_issue", "structure_issue",
  "factual_error", "bloat_detected", "missing_section", "style_preference",
  "legal_accuracy", "general",
] as const;
export type LessonCategory = (typeof LESSON_CATEGORIES)[number];

export const LESSON_SOURCES = [
  "attorney_approval", "attorney_rejection", "attorney_changes", "attorney_edit", "manual",
  "subscriber_update", "subscriber_retry",
] as const;
export type LessonSource = (typeof LESSON_SOURCES)[number];

export const pipelineStageEnum = pgEnum("pipeline_stage", ["research", "drafting", "assembly", "vetting"]);
export const lessonCategoryEnum = pgEnum("lesson_category", [
  "citation_error", "jurisdiction_error", "tone_issue", "structure_issue",
  "factual_error", "bloat_detected", "missing_section", "style_preference",
  "legal_accuracy", "general",
]);
export const lessonSourceEnum = pgEnum("lesson_source", [
  "attorney_approval", "attorney_rejection", "attorney_changes", "attorney_edit", "manual",
  "subscriber_update", "subscriber_retry", "consolidation",
]);

// ═══════════════════════════════════════════════════════
// TABLE: users
// ═══════════════════════════════════════════════════════
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
  subscriberId: varchar("subscriber_id", { length: 16 }).unique(),
  employeeId: varchar("employee_id", { length: 16 }).unique(),
  attorneyId: varchar("attorney_id", { length: 16 }).unique(),
}, (t) => [
  index("idx_users_email").on(t.email),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: letter_requests
// ═══════════════════════════════════════════════════════
export const letterRequests = pgTable("letter_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  letterType: letterTypeEnum("letter_type").notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  issueSummary: text("issue_summary"),
  jurisdictionCountry: varchar("jurisdiction_country", { length: 100 }).default("US"),
  jurisdictionState: varchar("jurisdiction_state", { length: 100 }),
  jurisdictionCity: varchar("jurisdiction_city", { length: 200 }),
  intakeJson: jsonb("intake_json"),
  status: letterStatusEnum("status").default("submitted").notNull(),
  assignedReviewerId: integer("assigned_reviewer_id").references(() => users.id, { onDelete: "set null" }),
  submitterRoleId: varchar("submitter_role_id", { length: 16 }),
  reviewerRoleId: varchar("reviewer_role_id", { length: 16 }),
  currentAiDraftVersionId: integer("current_ai_draft_version_id"),
  currentFinalVersionId: integer("current_final_version_id"),
  pdfUrl: text("pdf_url"),
  pdfStoragePath: varchar("pdf_storage_path", { length: 1000 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  priority: priorityEnum("priority").default("normal").notNull(),
  lastStatusChangedAt: timestamp("last_status_changed_at", { withTimezone: true }).defaultNow(),
  draftReminderSentAt: timestamp("draft_reminder_sent_at", { withTimezone: true }),
  researchUnverified: boolean("research_unverified").default(false).notNull(),
  pipelineLockedAt: timestamp("pipeline_locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_letter_requests_user_id").on(t.userId),
  index("idx_letter_requests_status").on(t.status),
  index("idx_letter_requests_assigned_reviewer_id").on(t.assignedReviewerId),
  index("idx_letter_requests_created_at").on(t.createdAt),
]);

export type LetterRequest = typeof letterRequests.$inferSelect;
export type InsertLetterRequest = typeof letterRequests.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: letter_versions (immutable version history)
// ═══════════════════════════════════════════════════════
export const letterVersions = pgTable("letter_versions", {
  id: serial("id").primaryKey(),
  letterRequestId: integer("letter_request_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
  versionType: versionTypeEnum("version_type").notNull(),
  content: text("content").notNull(),
  createdByType: actorTypeEnum("created_by_type").notNull(),
  createdByUserId: integer("created_by_user_id"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_letter_versions_letter_request_id").on(t.letterRequestId),
]);

export type LetterVersion = typeof letterVersions.$inferSelect;
export type InsertLetterVersion = typeof letterVersions.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: review_actions (audit trail)
// ═══════════════════════════════════════════════════════
export const reviewActions = pgTable("review_actions", {
  id: serial("id").primaryKey(),
  letterRequestId: integer("letter_request_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
  reviewerId: integer("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  actorType: actorTypeEnum("actor_type").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  noteText: text("note_text"),
  noteVisibility: noteVisibilityEnum("note_visibility").default("internal"),
  fromStatus: varchar("from_status", { length: 50 }),
  toStatus: varchar("to_status", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_review_actions_letter_request_id").on(t.letterRequestId),
  index("idx_review_actions_reviewer_id").on(t.reviewerId),
]);

export type ReviewAction = typeof reviewActions.$inferSelect;
export type InsertReviewAction = typeof reviewActions.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: workflow_jobs (pipeline execution logging)
// ═══════════════════════════════════════════════════════
export const workflowJobs = pgTable("workflow_jobs", {
  id: serial("id").primaryKey(),
  letterRequestId: integer("letter_request_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
  jobType: jobTypeEnum("job_type").notNull(),
  provider: varchar("provider", { length: 50 }),
  status: jobStatusEnum("status").default("queued").notNull(),
  attemptCount: integer("attempt_count").default(0),
  errorMessage: text("error_message"),
  requestPayloadJson: jsonb("request_payload_json"),
  responsePayloadJson: jsonb("response_payload_json"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_workflow_jobs_letter_request_id").on(t.letterRequestId),
  index("idx_workflow_jobs_status").on(t.status),
]);

export type WorkflowJob = typeof workflowJobs.$inferSelect;
export type InsertWorkflowJob = typeof workflowJobs.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: research_runs
// ═══════════════════════════════════════════════════════
export const researchRuns = pgTable("research_runs", {
  id: serial("id").primaryKey(),
  letterRequestId: integer("letter_request_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
  workflowJobId: integer("workflow_job_id"),
  provider: varchar("provider", { length: 50 }).default("perplexity"),
  status: researchStatusEnum("status").default("queued").notNull(),
  queryPlanJson: jsonb("query_plan_json"),
  resultJson: jsonb("result_json"),
  validationResultJson: jsonb("validation_result_json"),
  errorMessage: text("error_message"),
  cacheHit: boolean("cache_hit").default(false).notNull(),
  cacheKey: varchar("cache_key", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_research_runs_letter_request_id").on(t.letterRequestId),
]);

export type ResearchRun = typeof researchRuns.$inferSelect;
export type InsertResearchRun = typeof researchRuns.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: attachments
// ═══════════════════════════════════════════════════════
export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  letterRequestId: integer("letter_request_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
  uploadedByUserId: integer("uploaded_by_user_id").notNull(),
  storagePath: varchar("storage_path", { length: 1000 }).notNull(),
  storageUrl: varchar("storage_url", { length: 2000 }),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 200 }),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_attachments_letter_request_id").on(t.letterRequestId),
]);

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

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
// TABLE: subscriptions (Stripe subscription tracking)
// ═══════════════════════════════════════════════════════
export const SUBSCRIPTION_PLANS = ["per_letter", "monthly", "annual", "free_trial_review", "starter", "professional", "single_letter", "yearly"] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = ["active", "canceled", "past_due", "trialing", "incomplete", "none"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

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
  letterRequestId: integer("letter_request_id"),
  subscriberId: integer("subscriber_id"),
  discountCodeId: integer("discount_code_id"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
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
  processedBy: integer("processed_by"),
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
// TABLE: pipeline_lessons (recursive learning)
// ═══════════════════════════════════════════════════════
export const pipelineLessons = pgTable("pipeline_lessons", {
  id: serial("id").primaryKey(),
  letterType: letterTypeEnum("letter_type"),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  pipelineStage: pipelineStageEnum("pipeline_stage"),
  category: lessonCategoryEnum("category").default("general").notNull(),
  lessonText: text("lesson_text").notNull(),
  sourceLetterRequestId: integer("source_letter_request_id"),
  sourceAction: lessonSourceEnum("source_action").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  weight: integer("weight").default(50).notNull(),
  createdByUserId: integer("created_by_user_id"),
  hitCount: integer("hit_count").default(1).notNull(),
  timesInjected: integer("times_injected").default(0).notNull(),
  consolidatedFromIds: integer("consolidated_from_ids").array(),
  lettersBeforeAvgScore: integer("letters_before_avg_score"),
  lettersAfterAvgScore: integer("letters_after_avg_score"),
  effectivenessSamples: integer("effectiveness_samples").default(0).notNull(),
  lastInjectedAt: timestamp("last_injected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  activeIdx: index("idx_pipeline_lessons_active").on(t.isActive),
  letterTypeIdx: index("idx_pipeline_lessons_letter_type").on(t.letterType),
  jurisdictionIdx: index("idx_pipeline_lessons_jurisdiction").on(t.jurisdiction),
  stageIdx: index("idx_pipeline_lessons_stage").on(t.pipelineStage),
  compositeIdx: index("idx_pipeline_lessons_type_jurisdiction_active").on(t.letterType, t.jurisdiction, t.isActive),
}));

export type PipelineLesson = typeof pipelineLessons.$inferSelect;
export type InsertPipelineLesson = typeof pipelineLessons.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: letter_quality_scores (per-letter metrics)
// ═══════════════════════════════════════════════════════
export const letterQualityScores = pgTable("letter_quality_scores", {
  id: serial("id").primaryKey(),
  letterRequestId: integer("letter_request_id").notNull(),
  firstPassApproved: boolean("first_pass_approved").notNull(),
  revisionCount: integer("revision_count").default(0).notNull(),
  vettingPassCount: integer("vetting_pass_count").default(0).notNull(),
  vettingFailCount: integer("vetting_fail_count").default(0).notNull(),
  attorneyEditDistance: integer("attorney_edit_distance"),
  timeToFirstReviewMs: bigint("time_to_first_review_ms", { mode: "number" }),
  timeToApprovalMs: bigint("time_to_approval_ms", { mode: "number" }),
  computedScore: integer("computed_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  letterIdx: uniqueIndex("uq_quality_scores_letter_request").on(t.letterRequestId),
}));

export type LetterQualityScore = typeof letterQualityScores.$inferSelect;
export type InsertLetterQualityScore = typeof letterQualityScores.$inferInsert;

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

// ═══════════════════════════════════════════════════════
// TABLE: processed_stripe_events (webhook idempotency)
// ═══════════════════════════════════════════════════════
export const processedStripeEvents = pgTable("processed_stripe_events", {
  eventId: varchar("event_id", { length: 255 }).primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
});

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
// TABLE: blog_posts (CMS for public blog)
// ═══════════════════════════════════════════════════════
export const BLOG_CATEGORIES = [
  "demand-letters",
  "cease-and-desist",
  "contract-disputes",
  "document-analysis",
  "pricing-and-roi",
  "general",
] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export const BLOG_STATUSES = ["draft", "published"] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];

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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusIdx: index("idx_blog_posts_status").on(t.status),
  publishedAtIdx: index("idx_blog_posts_published_at").on(t.publishedAt),
}));

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;
