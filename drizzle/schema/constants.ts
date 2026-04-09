import { pgEnum, customType } from "drizzle-orm/pg-core";

export const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === "string") return JSON.parse(value);
    if (Array.isArray(value)) return value as number[];
    return [];
  },
});

// ─── User Roles ───
export const USER_ROLES = ["subscriber", "employee", "attorney", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ─── Letter Statuses (State Machine) ───
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
  "pre-litigation-settlement",
  "debt-collection",
  "estate-probate",
  "landlord-tenant",
  "insurance-dispute",
  "personal-injury-demand",
  "intellectual-property",
  "family-law",
  "neighbor-hoa",
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
  "pre-litigation-settlement", "debt-collection", "estate-probate",
  "landlord-tenant", "insurance-dispute", "personal-injury-demand",
  "intellectual-property", "family-law", "neighbor-hoa",
]);
export const versionTypeEnum = pgEnum("version_type", ["ai_draft", "attorney_edit", "final_approved"]);
export const actorTypeEnum = pgEnum("actor_type", ["system", "subscriber", "employee", "admin", "attorney"]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "completed", "failed"]);
export const jobTypeEnum = pgEnum("job_type", ["research", "draft_generation", "generation_pipeline", "retry", "vetting", "assembly"]);
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

// ─── Blog Constants ───
export const BLOG_CATEGORIES = [
  "demand-letters",
  "cease-and-desist",
  "contract-disputes",
  "eviction-notices",
  "employment-disputes",
  "consumer-complaints",
  "pre-litigation-settlement",
  "debt-collection",
  "estate-probate",
  "landlord-tenant",
  "insurance-disputes",
  "personal-injury",
  "intellectual-property",
  "family-law",
  "neighbor-hoa",
  "document-analysis",
  "pricing-and-roi",
  "general",
] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export const BLOG_CATEGORY_MIGRATION: Record<string, BlogCategory> = {
  "demand-letters": "demand-letters",
  "cease-and-desist": "cease-and-desist",
  "contract-disputes": "contract-disputes",
  "document-analysis": "document-analysis",
  "pricing-and-roi": "pricing-and-roi",
  "general": "general",
};

export const BLOG_STATUSES = ["draft", "published"] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];
