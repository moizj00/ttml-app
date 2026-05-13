import { Clock, Mail, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DraftPreviewWaitingProps {
  subject: string;
}

export function DraftPreviewWaiting({ subject }: DraftPreviewWaitingProps) {
  return (
    <Card
      className="border-blue-200 bg-blue-50/40"
      data-testid="draft-preview-waiting"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <Clock className="h-5 w-5 text-blue-600" />
          Your professional draft is being prepared
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-blue-900/90">
          Your preview for <span className="font-medium">{subject}</span> will
          be ready in about 24 hours. We&apos;ll email you when it&apos;s ready.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-white/70 p-3">
            <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
            <div className="text-xs text-blue-900/80">
              <div className="font-medium text-blue-900">
                Email notification
              </div>
              We&apos;ll send a link the moment your draft preview unlocks.
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-white/70 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
            <div className="text-xs text-blue-900/80">
              <div className="font-medium text-blue-900">
                Professional drafting
              </div>
              Our systems are researching and drafting your matter. After
              previewing the result, you can submit it for licensed attorney
              review.
            </div>
          </div>
        </div>

        <p className="text-xs text-blue-900/70">
          You can safely close this page — we&apos;ll email you within 24 hours
          to view your preview.
        </p>
      </CardContent>
    </Card>
  );
}
