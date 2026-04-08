/**
 * Billing Router — barrel
 *
 * Merges subscriptions and letters sub-routers into the single billingRouter
 * that is registered in server/routers/index.ts.
 */

import { router } from "../../_core/trpc";
import { billingSubscriptionsRouter } from "./subscriptions";
import { billingLettersRouter } from "./letters";

export const billingRouter = router({
  ...billingSubscriptionsRouter._def.procedures,
  ...billingLettersRouter._def.procedures,
});
