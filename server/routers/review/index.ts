/**
 * Review Router — Directory Module
 *
 * Merges all attorney review sub-routers into a single `reviewRouter` export.
 * This replaces the monolithic server/routers/review.ts (863 lines).
 *
 * Sub-modules:
 *   queue.ts    — read-only queue and letter detail queries
 *   actions.ts  — claim, unclaim, approve, reject, requestChanges, saveEdit mutations
 */
import { router } from "../../_core/trpc";
import { reviewQueueRouter } from "./queue";
import { reviewActionsRouter } from "./actions";

export const reviewRouter = router({
  ...reviewQueueRouter._def.procedures,
  ...reviewActionsRouter._def.procedures,
});
