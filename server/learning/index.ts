/**
 * Learning Service — Talk-to-My-Lawyer
 * Directory module index — re-exports all public APIs for backward compatibility.
 *
 * Internal structure:
 *   categories.ts  — Category definitions and AI/keyword classification
 *   dedup.ts       — Lesson deduplication and creation helpers
 *   extraction.ts  — Lesson extraction from attorney actions
 *   quality.ts     — Quality score computation and consolidation
 */
export {
  extractLessonFromApproval,
  extractLessonFromRejection,
  extractLessonFromChangesRequest,
  extractLessonFromEdit,
  extractLessonFromSubscriberFeedback,
} from "./extraction";
export {
  computeAndStoreQualityScore,
  consolidateLessonsForScope,
  runAutomatedConsolidation,
  archiveIneffectiveLessons,
} from "./quality";
