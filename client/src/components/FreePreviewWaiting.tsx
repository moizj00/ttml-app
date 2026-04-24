import { Clock, Mail, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FreePreviewWaitingProps {
  subject: string;
}

export function FreePreviewWaiting({ subject }: FreePreviewWaitingProps) {
  return (
    <Card
      className="border-blue-200 bg-blue-50/40"
      data-testid="free-preview-waiting"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <Clock className="h-5 w-5 text-blue-600" />
          Your draft is being prepared
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-blue-900/90">
          We&apos;re working on <span className="font-medium">{subject}</span>.
          You&apos;ll receive an email as soon as your free preview is ready —
          please check your inbox (and spam folder).
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-white/70 p-3">
            <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
            <div className="text-xs text-blue-900/80">
              <div className="font-medium text-blue-900">
                Email notification
              </div>
              We&apos;ll send a link the moment your preview unlocks.
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-white/70 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
            <div className="text-xs text-blue-900/80">
              <div className="font-medium text-blue-900">
                Quality evaluation
              </div>
              Final research and citations are being verified for your professional draft.
            </div>
          </div>
        </div>

        <p className="text-xs text-blue-900/70">
          You can safely close this page — we&apos;ll email you when the preview
          is ready to view.
        </p>
      </CardContent>
    </Card>
  );
}
