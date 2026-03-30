import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { LETTER_TYPE_CONFIG } from "../../../../../shared/types";
import type { FormData } from "./types";

interface Props {
  form: FormData;
  stepErrors: Record<string, string>;
  update: (field: keyof FormData, value: string) => void;
  appendVoice: (field: keyof FormData) => (transcript: string) => void;
}

export function Step5Outcome({ form, stepErrors, update, appendVoice }: Props) {
  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label htmlFor="desiredOutcome" className="text-sm font-medium">
            What outcome do you want? *
          </Label>
          <VoiceInputButton
            fieldId="desiredOutcome"
            onTranscript={appendVoice("desiredOutcome")}
          />
        </div>
        <Textarea
          id="desiredOutcome"
          value={form.desiredOutcome}
          onChange={e => update("desiredOutcome", e.target.value)}
          placeholder="e.g., I want the recipient to pay the outstanding balance of $2,500 within 14 days, or I will pursue legal action..."
          rows={4}
          className="resize-none"
        />
        {stepErrors.desiredOutcome && (
          <p className="text-xs text-red-600 mt-1">{stepErrors.desiredOutcome}</p>
        )}
      </div>
      <div>
        <Label
          htmlFor="deadlineDate"
          className="text-sm font-medium mb-1.5 block"
        >
          Response Deadline (Optional)
        </Label>
        <Input
          id="deadlineDate"
          type="date"
          value={form.deadlineDate}
          onChange={e => update("deadlineDate", e.target.value)}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Date by which you expect a response or action.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label className="text-sm font-medium mb-1.5 block">
            Language Preference (Optional)
          </Label>
          <Select
            value={form.language}
            onValueChange={v => update("language", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="english">English</SelectItem>
              <SelectItem value="spanish">Spanish</SelectItem>
              <SelectItem value="french">French</SelectItem>
              <SelectItem value="portuguese">Portuguese</SelectItem>
              <SelectItem value="chinese">Chinese</SelectItem>
              <SelectItem value="arabic">Arabic</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm font-medium mb-1.5 block">
            Prior Communication? (Optional)
          </Label>
          <Select
            value={form.priorCommunication}
            onValueChange={v => update("priorCommunication", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No prior contact</SelectItem>
              <SelectItem value="verbal">Verbal only</SelectItem>
              <SelectItem value="written">Written (email/letter)</SelectItem>
              <SelectItem value="both">Both verbal and written</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm font-medium mb-1.5 block">
            Delivery Method (Optional)
          </Label>
          <Select
            value={form.deliveryMethod}
            onValueChange={v => update("deliveryMethod", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-muted/50 rounded-xl p-4 space-y-2">
        <h4 className="text-sm font-semibold text-foreground">
          Submission Summary
        </h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">Type:</span>
          <span className="text-foreground font-medium">
            {LETTER_TYPE_CONFIG[form.letterType]?.label}
          </span>
          <span className="text-muted-foreground">Jurisdiction:</span>
          <span className="text-foreground font-medium">
            {form.jurisdictionState}
            {form.jurisdictionCity ? `, ${form.jurisdictionCity}` : ""}
          </span>
          <span className="text-muted-foreground">Sender:</span>
          <span className="text-foreground font-medium">{form.senderName}</span>
          <span className="text-muted-foreground">Recipient:</span>
          <span className="text-foreground font-medium">{form.recipientName}</span>
          <span className="text-muted-foreground">Tone:</span>
          <span className="text-foreground font-medium capitalize">{form.tonePreference}</span>
          <span className="text-muted-foreground">Language:</span>
          <span className="text-foreground font-medium capitalize">{form.language}</span>
          <span className="text-muted-foreground">Delivery:</span>
          <span className="text-foreground font-medium capitalize">
            {form.deliveryMethod.replace(/_/g, " ")}
          </span>
        </div>
      </div>
    </>
  );
}
