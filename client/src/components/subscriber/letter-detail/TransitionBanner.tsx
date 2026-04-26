import { AlertCircle } from "lucide-react";

export const TransitionBanner = ({ status }: { status: string }) => {
  if (status === "client_approval_pending") {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3 w-full">
        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium">Action Required: Review Your Letter</h4>
          <p className="text-sm mt-1 opacity-90">
            An attorney has completed their review and your letter is ready for
            your final approval before it is sent.
          </p>
        </div>
      </div>
    );
  }
  if (status === "needs_changes") {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3 w-full">
        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-medium">
            Action Required: Attorney Requested Changes
          </h4>
          <p className="text-sm mt-1 opacity-90">
            Please provide the requested information below so our attorneys can
            finalize your letter.
          </p>
        </div>
      </div>
    );
  }
  return null;
};
