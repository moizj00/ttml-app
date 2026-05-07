import {
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  jsonb,
  serial,
  index,
  uniqueIndex,
  bigint,
} from "drizzle-orm/pg-core";
import {
  letterTypeEnum,
  pipelineStageEnum,
  lessonCategoryEnum,
  lessonSourceEnum,
  vector,
} from "./constants";
import { users } from "./users";
import { letterRequests } from "./letters";

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
  embedding: vector("embedding"),
  sourceLetterRequestId: integer("source_letter_request_id"),
  sourceAction: lessonSourceEnum("source_action").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  weight: integer("weight").default(50).notNull(),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
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
  letterRequestId: integer("letter_request_id").notNull().references(() => letterRequests.id, { onDelete: "cascade" }),
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
// TABLE: training_log (RAG training example capture)
// ═══════════════════════════════════════════════════════
export const trainingLog = pgTable("training_log", {
  id: serial("id").primaryKey(),
  letterRequestId: integer("letter_request_id").notNull(),
  letterType: varchar("letter_type", { length: 50 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 100 }),
  gcsPath: varchar("gcs_path", { length: 1000 }),
  tokenCount: integer("token_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  letterIdx: index("idx_training_log_letter_request_id").on(t.letterRequestId),
  createdAtIdx: index("idx_training_log_created_at").on(t.createdAt),
}));

export type TrainingLogEntry = typeof trainingLog.$inferSelect;
export type InsertTrainingLogEntry = typeof trainingLog.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: fine_tune_runs (Vertex AI fine-tuning job tracking)
// ═══════════════════════════════════════════════════════
export const fineTuneRuns = pgTable("fine_tune_runs", {
  id: serial("id").primaryKey(),
  vertexJobId: varchar("vertex_job_id", { length: 500 }),
  baseModel: varchar("base_model", { length: 200 }).notNull(),
  trainingExampleCount: integer("training_example_count").notNull(),
  status: varchar("status", { length: 50 }).default("submitted").notNull(),
  gcsTrainingFile: varchar("gcs_training_file", { length: 1000 }),
  resultModelId: varchar("result_model_id", { length: 500 }),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  statusIdx: index("idx_fine_tune_runs_status").on(t.status),
  startedAtIdx: index("idx_fine_tune_runs_started_at").on(t.startedAt),
}));

export type FineTuneRun = typeof fineTuneRuns.$inferSelect;
export type InsertFineTuneRun = typeof fineTuneRuns.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: pipeline_records
// Durable progress record for the background multi-agent pipeline.
//
// The frontend subscribes to this table over Supabase Realtime using
// pipeline_id. The current pipeline_id is the letter_requests.id returned by
// the submit API, which keeps the public API stable while still isolating
// pipeline progress from letter status transitions.
// ═══════════════════════════════════════════════════════
export const pipelineRecords = pgTable(
  "pipeline_records",
  {
    id: serial("id").primaryKey(),
    pipelineId: integer("pipeline_id")
      .notNull()
      .references(() => letterRequests.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 50 }).default("pending").notNull(),
    currentStep: varchar("current_step", { length: 50 }).default("pending").notNull(),
    progress: integer("progress").default(0).notNull(),
    finalLetter: text("final_letter"),
    errorMessage: text("error_message"),
    payloadJson: jsonb("payload_json"),
    stateJson: jsonb("state_json"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  t => ({
    pipelineIdIdx: uniqueIndex("uq_pipeline_records_pipeline_id").on(t.pipelineId),
    statusIdx: index("idx_pipeline_records_status").on(t.status),
    currentStepIdx: index("idx_pipeline_records_current_step").on(t.currentStep),
  })
);

export type PipelineRecord = typeof pipelineRecords.$inferSelect;
export type InsertPipelineRecord = typeof pipelineRecords.$inferInsert;

// ═══════════════════════════════════════════════════════
// TABLE: pipeline_stream_chunks
// Ephemeral token-by-token stream from the LangGraph draft node
// to the frontend (Supabase Realtime postgres_changes).
//
// Retention is 1 hour, enforced by cleanup_old_stream_chunks()
// (see supabase/migrations/20260502000001_pipeline_stream_chunks_retention.sql).
//
// Schema mirrors supabase/migrations/20260414000001_pipeline_stream_chunks.sql.
// Added to Drizzle so server-side queries can be type-safe.
// ═══════════════════════════════════════════════════════
export const pipelineStreamChunks = pgTable(
  "pipeline_stream_chunks",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey(),
    letterId: integer("letter_id")
      .notNull()
      .references(() => letterRequests.id, { onDelete: "cascade" }),
    chunkText: text("chunk_text").notNull(),
    stage: varchar("stage", { length: 50 }).default("draft").notNull(),
    sequenceNumber: integer("sequence_number").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => ({
    letterIdx: index("idx_pipeline_stream_chunks_letter_id").on(t.letterId),
    letterSeqIdx: index("idx_pipeline_stream_chunks_letter_sequence").on(
      t.letterId,
      t.sequenceNumber
    ),
  })
);

export type PipelineStreamChunk = typeof pipelineStreamChunks.$inferSelect;
export type InsertPipelineStreamChunk = typeof pipelineStreamChunks.$inferInsert;
