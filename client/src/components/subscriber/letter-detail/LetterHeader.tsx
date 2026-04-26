import { FileText, Clock } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import { LETTER_TYPE_CONFIG } from "../../../../../shared/types";

interface LetterHeaderProps {
  subject: string;
  letterType: string;
  jurisdictionState?: string | null;
  status: string;
  approvedByRole?: string | null;
  createdAt: string | Date;
  isPolling: boolean;
}

export const LetterHeader = ({
  subject,
  letterType,
  jurisdictionState,
  status,
  approvedByRole,
  createdAt,
  isPolling,
}: LetterHeaderProps) => {
  return (
    <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground leading-tight">
            {subject}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {LETTER_TYPE_CONFIG[letterType]?.label ?? letterType}
            {jurisdictionState && ` · ${jurisdictionState}`}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={status} approvedByRole={approvedByRole} />
            <span className="text-xs text-muted-foreground">
              Submitted {new Date(createdAt).toLocaleDateString()}
            </span>
            {isPolling &&
              !["submitted", "researching", "drafting"].includes(status) && (
                <span className="text-xs text-blue-500 animate-pulse flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Updating...
                </span>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};
