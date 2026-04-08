/**
 * Affiliate Router — barrel
 *
 * Merges employee and admin sub-routers into the single affiliateRouter
 * that is registered in server/routers/index.ts.
 */

import { router } from "../../_core/trpc";
import { affiliateEmployeeRouter } from "./employee";
import { affiliateAdminRouter } from "./admin";

export const affiliateRouter = router({
  ...affiliateEmployeeRouter._def.procedures,
  ...affiliateAdminRouter._def.procedures,
});
