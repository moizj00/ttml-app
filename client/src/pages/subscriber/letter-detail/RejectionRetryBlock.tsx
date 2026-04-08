import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface RejectionRetryBlockProps {
  letterId: number;
  onRetry: () => void;
}

export function RejectionRetryBlock({ letterId, onRetry }: RejectionRetryBlockProps) {
  const [showRetryForm, setShowRetryForm] = useState(false);
  const [retryContext, setRetryContext] = useState("");

  const retryFromRejected = trpc.letters.retryFromRejected.useMutation({
    onSuccess: () => {
      toast.success("Letter resubmitted", { description: "Your letter is being re-processed with the updated information. You'll be notified when it's ready." });
      setShowRetryForm(false);
      setRetryContext("");
      onRetry();
    },
    onError: (err) => toast.error("Retry failed", { description: err.message }),
  });

  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-sm font-semibold text-red-800">Letter Request Rejected</p>
              <p className="text-sm text-red-700 mt-1">
                The reviewing attorney has rejected this letter request. Please review the attorney notes above for details on why the request could not be processed.
              </p>
            </div>

            {!showRetryForm ? (
              <Button
                data-testid="button-retry-from-rejected"
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => setShowRetryForm(true)}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry with Updated Information
              </Button>
            ) : (
              <div className="bg-white border border-red-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-red-800">Provide additional context or corrections</p>
                <p className="text-xs text-red-600">Address the attorney's feedback in your response. Your letter will be re-processed through the entire pipeline with this new information.</p>
                <Textarea
                  data-testid="input-retry-context"
                  value={retryContext}
                  onChange={(e) => setRetryContext(e.target.value)}
                  placeholder="Explain what has changed, provide missing details, or clarify any misunderstandings (at least 10 characters)..."
                  rows={4}
                  className="border-red-200"
                />
                <div className="flex gap-2">
                  <Button
                    data-testid="button-submit-retry"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => retryFromRejected.mutate({ letterId, additionalContext: retryContext.trim() || undefined })}
                    disabled={retryFromRejected.isPending || retryContext.trim().length < 10}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {retryFromRejected.isPending ? "Resubmitting..." : "Resubmit Letter"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowRetryForm(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
