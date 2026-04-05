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
import type { IntakeFormTemplateRecord } from "../../../../../shared/types";
import type { FormData } from "./types";
import { ClipboardCheck } from "lucide-react";

interface Props {
  form: FormData;
  stepErrors: Record<string, string>;
  update: (field: keyof FormData, value: string) => void;
  intakeTemplatesForType?: IntakeFormTemplateRecord[];
  activeIntakeFormTemplateId: number | null;
  onSelectIntakeTemplate: (id: number | null) => void;
}

export function Step1LetterType({ form, stepErrors, update, intakeTemplatesForType, activeIntakeFormTemplateId, onSelectIntakeTemplate }: Props) {
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
              data-testid={`button-letter-type-${key}`}
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

      {intakeTemplatesForType && intakeTemplatesForType.length > 0 && (
        <div data-testid="intake-template-picker">
          <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5 text-muted-foreground">
            <ClipboardCheck className="w-3.5 h-3.5" />
            Intake Form Template (optional)
          </Label>
          <p className="text-xs text-muted-foreground mb-2">
            Choose a custom intake template to control which situation fields appear in Step 4.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onSelectIntakeTemplate(null)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                !activeIntakeFormTemplateId
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
              data-testid="button-default-intake-template"
            >
              Default
            </button>
            {intakeTemplatesForType.map(t => (
              <button
                key={t.id}
                onClick={() => onSelectIntakeTemplate(t.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  activeIntakeFormTemplateId === t.id
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
                data-testid={`button-intake-template-${t.id}`}
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}

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
          data-testid="input-subject"
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
          <SelectTrigger data-testid="select-tone-preference">
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
