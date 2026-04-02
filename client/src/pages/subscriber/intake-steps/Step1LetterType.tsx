import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LETTER_TYPE_CONFIG } from "../../../../../shared/types";
import type { FormData } from "./types";

interface Props {
  form: FormData;
  stepErrors: Record<string, string>;
  update: (field: keyof FormData, value: string) => void;
}

export function Step1LetterType({ form, stepErrors, update }: Props) {
  return (
    <>
      <div>
        <Label className="text-sm font-medium mb-2 block">
          Letter Type *
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(LETTER_TYPE_CONFIG).map(([key, val]) => (
            <button
              key={key}
              onClick={() => update("letterType", key)}
              className={`text-left p-3 rounded-xl border-2 transition-all ${
                form.letterType === key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">
                {val.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {val.description}
              </p>
            </button>
          ))}
        </div>
        {stepErrors.letterType && (
          <p className="text-xs text-red-600 mt-1">{stepErrors.letterType}</p>
        )}
      </div>
      <div>
        <Label
          htmlFor="subject"
          className="text-sm font-medium mb-1.5 block"
        >
          Brief Subject Line *
        </Label>
        <Input
          id="subject"
          value={form.subject}
          onChange={e => update("subject", e.target.value)}
          placeholder="e.g., Demand for unpaid rent — 123 Main St"
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {form.subject.length}/500 characters
        </p>
        {stepErrors.subject && (
          <p className="text-xs text-red-600 mt-1">{stepErrors.subject}</p>
        )}
      </div>
      <div>
        <Label className="text-sm font-medium mb-1.5 block">
          Tone Preference (Optional)
        </Label>
        <Select
          value={form.tonePreference}
          onValueChange={v => update("tonePreference", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="firm">
              Firm (Professional &amp; Direct)
            </SelectItem>
            <SelectItem value="moderate">
              Moderate (Balanced)
            </SelectItem>
            <SelectItem value="aggressive">
              Aggressive (Strong Legal Language)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
