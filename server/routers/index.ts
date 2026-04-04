import { systemRouter } from "../_core/systemRouter";
import { router } from "../_core/trpc";
import { authRouter } from "./auth";
import { lettersRouter } from "./letters";
import { reviewRouter } from "./review";
import { adminRouter } from "./admin";
import { notificationsRouter } from "./notifications";
import { versionsRouter } from "./versions";
import { billingRouter } from "./billing";
import { affiliateRouter } from "./affiliate";
import { profileRouter } from "./profile";
import { documentsRouter } from "./documents";
import { blogRouter } from "./blog";
import { templatesRouter } from "./templates";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  letters: lettersRouter,
  review: reviewRouter,
  admin: adminRouter,
  notifications: notificationsRouter,
  versions: versionsRouter,
  billing: billingRouter,
  affiliate: affiliateRouter,
  profile: profileRouter,
  documents: documentsRouter,
  blog: blogRouter,
  templates: templatesRouter,
});

export type AppRouter = typeof appRouter;
