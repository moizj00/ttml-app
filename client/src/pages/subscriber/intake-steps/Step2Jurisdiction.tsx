import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import type { FormData } from "./types";

interface Props {
  form: FormData;
  stepErrors: Record<string, string>;
  update: (field: keyof FormData, value: string) => void;
  appendVoice: (field: keyof FormData) => (transcript: string) => void;
}

export function Step2Jurisdiction({ form, stepErrors, update, appendVoice }: Props) {
  return (
    <>
      <div>
        <Label className="text-sm font-medium mb-1.5 block">
          State / Jurisdiction *
        </Label>
        <Select
          value={form.jurisdictionState}
          onValueChange={v => update("jurisdictionState", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select state..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CA">California</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          This determines which laws and statutes apply to your letter.
        </p>
        {stepErrors.jurisdictionState && (
          <p className="text-xs text-red-600 mt-1">{stepErrors.jurisdictionState}</p>
        )}
      </div>
      <div>
        <Label
          htmlFor="city"
          className="text-sm font-medium mb-1.5 block"
        >
          City (Optional)
        </Label>
        <div className="flex gap-2 items-center">
          <Input
            id="city"
            value={form.jurisdictionCity}
            onChange={e => update("jurisdictionCity", e.target.value)}
            placeholder="e.g., Los Angeles"
            className="flex-1"
          />
          <VoiceInputButton
            fieldId="jurisdictionCity"
            onTranscript={appendVoice("jurisdictionCity")}
          />
        </div>
      </div>
    </>
  );
}
