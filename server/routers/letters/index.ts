import { router } from "../../_core/trpc";
import { submitProcedures } from "./submit";
import { subscriberProcedures } from "./subscriber";
import { clientApprovalProcedures } from "./client-approval";

export const lettersRouter = router({
  ...submitProcedures,
  ...subscriberProcedures,
  ...clientApprovalProcedures,
});
