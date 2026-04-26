import { Button } from "@/components/ui/button";
import { Eye, Copy, Download, Trash2 } from "lucide-react";

interface ActionButtonsProps {
  status: string;
  previewModalDismissed: boolean;
  onOpenPreview: () => void;
  isApproved: boolean;
  hasFinalVersion: boolean;
  pdfUrl?: string | null;
  onCopy: () => void;
  onArchive: () => void;
  archivePending: boolean;
}

export const ActionButtons = ({
  status,
  previewModalDismissed,
  onOpenPreview,
  isApproved,
  hasFinalVersion,
  pdfUrl,
  onCopy,
  onArchive,
  archivePending,
}: ActionButtonsProps) => {
  return (
    <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
      {status === "client_approval_pending" && previewModalDismissed && (
        <Button
          onClick={onOpenPreview}
          size="sm"
          variant="outline"
          className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 flex-1 sm:flex-initial"
          data-testid="button-reopen-preview-modal"
        >
          <Eye className="w-4 h-4 mr-1" />
          Review Letter
        </Button>
      )}
      {isApproved && hasFinalVersion && (
        <>
          <Button
            onClick={onCopy}
            size="sm"
            variant="outline"
            className="bg-background flex-1 sm:flex-initial"
          >
            <Copy className="w-4 h-4 mr-1" />
            Copy
          </Button>
          <Button
            onClick={() => pdfUrl && window.open(pdfUrl, "_blank")}
            size="sm"
            className="flex-1 sm:flex-initial"
            disabled={!pdfUrl}
          >
            <Download className="w-4 h-4 mr-1" />
            {pdfUrl ? "Download PDF" : "Generating..."}
          </Button>
        </>
      )}
      {[
        "approved",
        "client_approved",
        "sent",
        "rejected",
        "client_declined",
      ].includes(status) && (
        <Button
          onClick={onArchive}
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={archivePending}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};
