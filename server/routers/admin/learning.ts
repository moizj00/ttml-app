import { z } from "zod";
import { adminProcedure } from "../../_core/trpc";
import {
  getAllLessons,
  createPipelineLesson,
  updatePipelineLesson,
  getQualityScoreStats,
  getQualityScoreTrend,
  getQualityScoresByLetterType,
  getLessonImpactSummary,
  getRAGAnalytics,
  getFineTuneRuns,
  getEditDistanceTrend,
  getPipelineAnalytics,
} from "../../db";
import { consolidateLessonsForScope } from "../../learning";
import type { InsertPipelineLesson } from "../../../drizzle/schema";

export const learningProcedures = {
  lessons: adminProcedure.query(async () => getAllLessons()),

  lessonsFiltered: adminProcedure
    .input(z.object({
      letterType: z.string().optional(),
      jurisdiction: z.string().optional(),
      pipelineStage: z.string().optional(),
      isActive: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => getAllLessons(input ?? undefined)),

  createLesson: adminProcedure
    .input(z.object({
      letterType: z.string().optional(),
      jurisdiction: z.string().optional(),
      pipelineStage: z.enum(["research", "drafting", "assembly", "vetting"]).optional(),
      category: z.enum(["citation_error", "jurisdiction_error", "tone_issue", "structure_issue", "factual_error", "bloat_detected", "missing_section", "style_preference", "legal_accuracy", "general"]).default("general"),
      lessonText: z.string().min(10).max(5000),
      sourceAction: z.enum(["attorney_approval", "attorney_rejection", "attorney_changes", "attorney_edit", "manual"]).default("manual"),
      weight: z.number().min(0).max(100).default(50),
    }))
    .mutation(async ({ ctx, input }) => {
      await createPipelineLesson({
        letterType: input.letterType as InsertPipelineLesson["letterType"],
        jurisdiction: input.jurisdiction,
        pipelineStage: input.pipelineStage as InsertPipelineLesson["pipelineStage"],
        category: input.category as InsertPipelineLesson["category"],
        lessonText: input.lessonText,
        sourceAction: input.sourceAction as InsertPipelineLesson["sourceAction"],
        createdByUserId: ctx.user.id,
        weight: input.weight,
      });
      return { success: true };
    }),

  updateLesson: adminProcedure
    .input(z.object({
      id: z.number(),
      isActive: z.boolean().optional(),
      weight: z.number().min(0).max(100).optional(),
      lessonText: z.string().min(10).max(5000).optional(),
      category: z.enum(["citation_error", "jurisdiction_error", "tone_issue", "structure_issue", "factual_error", "bloat_detected", "missing_section", "style_preference", "legal_accuracy", "general"]).optional(),
    }))
    .mutation(async ({ input }) => {
      await updatePipelineLesson(input.id, {
        isActive: input.isActive,
        weight: input.weight,
        lessonText: input.lessonText,
        category: input.category as InsertPipelineLesson["category"],
      });
      return { success: true };
    }),

  qualityStats: adminProcedure.query(async () => getQualityScoreStats()),

  qualityTrend: adminProcedure
    .input(z.object({ days: z.number().default(30) }).optional())
    .query(async ({ input }) => getQualityScoreTrend(input?.days ?? 30)),

  qualityByLetterType: adminProcedure.query(async () => getQualityScoresByLetterType()),

  consolidateLessons: adminProcedure
    .input(z.object({
      letterType: z.string(),
      jurisdiction: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      const result = await consolidateLessonsForScope(input.letterType, input.jurisdiction);
      return { success: true, ...result };
    }),

  lessonImpact: adminProcedure.query(async () => getLessonImpactSummary()),

  pipelineAnalytics: adminProcedure
    .input(z.object({ dateRange: z.enum(["7d", "30d", "90d", "all"]).default("30d") }).optional())
    .query(async ({ input }) => getPipelineAnalytics(input?.dateRange ?? "30d")),

  ragAnalytics: adminProcedure
    .input(z.object({ days: z.number().default(30) }).optional())
    .query(async ({ input }) => getRAGAnalytics(input?.days ?? 30)),

  fineTuneRuns: adminProcedure.query(async () => getFineTuneRuns()),

  editDistanceTrend: adminProcedure
    .input(z.object({ days: z.number().default(30) }).optional())
    .query(async ({ input }) => getEditDistanceTrend(input?.days ?? 30)),
};
