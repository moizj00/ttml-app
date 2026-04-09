// ─── Schema Barrel ───────────────────────────────────────────────────────────
// This file is the single entry point for all Drizzle schema definitions.
// The monolithic schema has been split into domain-focused modules under
// ./schema/ for maintainability. Import from here or from the sub-modules
// directly — both work identically.
//
// Module layout:
//   ./schema/constants.ts   — pgEnums, TypeScript const arrays, custom types
//   ./schema/users.ts       — users table
//   ./schema/letters.ts     — letterRequests, letterVersions, reviewActions,
//                             workflowJobs, researchRuns, attachments,
//                             letterTemplates, intakeFormTemplates
//   ./schema/billing.ts     — subscriptions, discountCodes, commissionLedger,
//                             payoutRequests, processedStripeEvents
//   ./schema/notifications.ts — notifications, emailVerificationTokens,
//                               adminVerificationCodes, newsletterSubscribers
//   ./schema/pipeline.ts    — pipelineLessons, letterQualityScores,
//                             trainingLog, fineTuneRuns
//   ./schema/content.ts     — blogPosts, documentAnalyses
// ─────────────────────────────────────────────────────────────────────────────

export * from "./schema/index";
