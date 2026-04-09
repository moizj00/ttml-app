import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  varchar,
  jsonb,
  bigint,
  boolean,
  serial,
  index,
} from "drizzle-orm/pg-core";
import {
  letterStatusEnum,
  letterTypeEnum,
  versionTypeEnum,
  actorTypeEnum,
  jobTypeEnum,
  jobStatusEnum,
  researchStatusEnum,
  priorityEnum,
  noteVisibilityEnum,
} from "./constants";
import { vector } from "./constants";
import { users } from "./users";

// ─── Forward declaration for letterTemplates (referenced by letterRequests) ───
// letterTemplates is defined below; letterRequests references it.
// Drizzle handles forward refs via a function callback.

// ═══════════════════════════════════════════════════════
// TABLE: letter_templates
// ═══════════════════════════════════════════════════════
export const letterTemplates = pgTable("letter_templates", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  scenarioDescription: text("scenario_description").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  tags: text("tags").array().default([]).notNull(),
  letterType: letterTypeEnum("letter_type").notNull(),
  prefillData: jsonb("prefill_data").notNull(),
  active: boolean("active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  contextualNotes: text("contextual_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_letter_templates_active").on(t.active),
  index("idx_letter_templates_letter_type").on(t.letterType),
  index("idx_letter_templates_sort_order").on(t.sortOrder),
]);

export type LetterTemplate = typeof letterTemplates.$inferSelect;
export type InsertLetterTemplate = typeof letterTemplates.$inferInsert;

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
  initialPaywallEmailSentAt: timestamp("initial_paywall_email_sent_at", { withTimezone: true }),
  researchUnverified: boolean("research_unverified").default(false).notNull(),
  qualityDegraded: boolean("quality_degraded").default(false).notNull(),
  pipelineLockedAt: timestamp("pipeline_locked_at", { withTimezone: true }),
  submittedByAdmin: boolean("submitted_by_admin").default(false).notNull(),
  templateId: integer("template_id").references(() => letterTemplates.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_letter_requests_user_id").on(t.userId),
  index("idx_letter_requests_status").on(t.status),
  index("idx_letter_requests_assigned_reviewer_id").on(t.assignedReviewerId),
  index("idx_letter_requests_created_at").on(t.createdAt),
  index("idx_letter_requests_status_reviewer").on(t.status, t.assignedReviewerId),
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
  embedding: vector("embedding"),
  ragSummary: text("rag_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_letter_versions_letter_request_id").on(t.letterRequestId),
  index("idx_letter_versions_created_by").on(t.createdByUserId),
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
  index("idx_workflow_jobs_created_at").on(t.createdAt),
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
  uploadedByUserId: integer("uploaded_by_user_id").notNull().references(() => users.id, { onDelete: "set null" }),
  storagePath: varchar("storage_path", { length: 1000 }).notNull(),
  storageUrl: varchar("storage_url", { length: 2000 }),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 200 }),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_attachments_letter_request_id").on(t.letterRequestId),
  index("idx_attachments_uploaded_by").on(t.uploadedByUserId),
]);

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: intake_form_templates
// ═══════════════════════════════════════════════════════
export const intakeFormTemplates = pgTable("intake_form_templates", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  baseLetterType: letterTypeEnum("base_letter_type").notNull(),
  fieldConfig: jsonb("field_config").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_intake_form_templates_owner").on(t.ownerUserId),
  index("idx_intake_form_templates_letter_type").on(t.baseLetterType),
]);

export type IntakeFormTemplate = typeof intakeFormTemplates.$inferSelect;
export type InsertIntakeFormTemplate = typeof intakeFormTemplates.$inferInsert;
