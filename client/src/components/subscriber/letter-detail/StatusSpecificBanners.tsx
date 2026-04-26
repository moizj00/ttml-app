import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, RotateCcw } from "lucide-react";

interface StatusSpecificBannersProps {
  status: string;
  pdfUrl?: string | null;
}

export const StatusSpecificBanners = ({
  status,
  pdfUrl,
}: StatusSpecificBannersProps) => {
  if (status === "client_approved") {
    return (
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-800">
                You have approved this letter
              </p>
              {pdfUrl ? (
                <p className="text-sm text-emerald-700 mt-1">
                  Your PDF is ready. You can download it or send it to the
                  recipient below.
                </p>
              ) : (
                <p className="text-sm text-emerald-700 mt-1 flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  Your PDF is being generated and will be available for download
                  shortly.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "client_declined") {
    return (
      <Card className="border-red-200 bg-red-50/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                You Declined This Letter
              </p>
              <p className="text-sm text-red-700 mt-1">
                You chose not to proceed with this letter. If you need
                assistance with a similar matter, you can submit a new letter
                request.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "client_revision_requested") {
    return (
      <Card className="border-violet-200 bg-violet-50/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <RotateCcw className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-violet-800">
                Revision Requested
              </p>
              <p className="text-sm text-violet-700 mt-1">
                Your revision request has been sent to the attorney. The letter
                will be revised and returned for your approval.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
};
