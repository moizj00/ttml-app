import { router } from "../../_core/trpc";
import { usersProcedures } from "./users";
import { adminLettersProcedures } from "./letters";
import { jobsProcedures } from "./jobs";
import { learningProcedures } from "./learning";

export const adminRouter = router({
  ...usersProcedures,
  ...adminLettersProcedures,
  ...jobsProcedures,
  ...learningProcedures,
});
