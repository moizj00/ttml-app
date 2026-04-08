import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Send } from "lucide-react";

interface NeedsChangesPanelProps {
  updateText: string;
  onUpdateTextChange: (v: string) => void;
  isPending: boolean;
  onSubmit: () => void;
}

export function NeedsChangesPanel({ updateText, onUpdateTextChange, isPending, onSubmit }: NeedsChangesPanelProps) {
  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
          <AlertCircle className="w-4 h-4" />
          Changes Requested — Your Response
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-amber-700">
          The reviewing attorney has requested changes. Please review the attorney notes above and provide additional context or corrections below. Our legal team will re-process your letter with this new information.
        </p>
        <Textarea
          value={updateText}
          onChange={(e) => onUpdateTextChange(e.target.value)}
          placeholder="Provide additional context, corrections, or clarifications here..."
          rows={4}
          className="bg-white border-amber-200"
        />
        <Button
          onClick={onSubmit}
          disabled={isPending || updateText.trim().length < 10}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {isPending ? (
            "Submitting..."
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Submit Response &amp; Re-Process
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
