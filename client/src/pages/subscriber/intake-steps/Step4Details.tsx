import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LETTER_TYPE_CONFIG } from "../../../../../shared/types";
import type { SituationFieldDef } from "../../../../../shared/types";
import type { FormData } from "./types";

interface Props {
  form: FormData;
  stepErrors: Record<string, string>;
  update: (field: keyof FormData, value: string) => void;
  updateSituationField: (key: string, value: string) => void;
  enabledSituationFields?: string[];
  customSituationFields?: SituationFieldDef[];
}

export function Step4Details({ form, stepErrors, update, updateSituationField, enabledSituationFields, customSituationFields }: Props) {
  const config = LETTER_TYPE_CONFIG[form.letterType];
  const defaultFields = config?.situationFields ?? [];

  const visibleDefaultFields = enabledSituationFields
    ? defaultFields.filter(f => enabledSituationFields.includes(f.key))
    : defaultFields.filter(f => f.defaultEnabled);

  const allSituationFields = [...visibleDefaultFields, ...(customSituationFields ?? [])];

  return (
    <>
      <div>
        <Label htmlFor="description" className="text-sm font-medium mb-1.5 block">
          Describe Your Situation *
        </Label>
        <Textarea
          id="description"
          data-testid="input-description"
          value={form.description}
          onChange={e => update("description", e.target.value)}
          placeholder="Provide a detailed description of the issue, what happened, when it happened, and any relevant background information..."
          rows={5}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {form.description.length} characters (minimum 20)
        </p>
        {stepErrors.description && (
          <p className="text-xs text-red-600 mt-1">{stepErrors.description}</p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label
            htmlFor="incidentDate"
            className="text-sm font-medium mb-1.5 block"
          >
            Incident Date (Optional)
          </Label>
          <Input
            id="incidentDate"
            data-testid="input-incident-date"
            type="date"
            value={form.incidentDate}
            onChange={e => update("incidentDate", e.target.value)}
          />
        </div>
        <div>
          <Label
            htmlFor="amountOwed"
            className="text-sm font-medium mb-1.5 block"
          >
            {config?.intakeHints?.amountOwedLabel ?? "Amount Owed (USD)"} (Optional)
          </Label>
          <Input
            id="amountOwed"
            data-testid="input-amount-owed"
            type="number"
            value={form.amountOwed}
            onChange={e => update("amountOwed", e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>
      </div>

      {allSituationFields.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {config?.label ?? "Situation"} Details
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allSituationFields.map(field => {
              const value = form.situationFields[field.key] ?? "";
              const isFullWidth = field.type === "textarea";
              return (
                <div key={field.key} className={isFullWidth ? "sm:col-span-2" : ""}>
                  <Label htmlFor={`sf-${field.key}`} className="text-sm font-medium mb-1.5 block">
                    {field.label} (Optional)
                  </Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={`sf-${field.key}`}
                      data-testid={`input-sf-${field.key}`}
                      value={value}
                      onChange={e => updateSituationField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className="resize-none"
                    />
                  ) : field.type === "select" && field.options ? (
                    <Select
                      value={value}
                      onValueChange={v => updateSituationField(field.key, v)}
                    >
                      <SelectTrigger id={`sf-${field.key}`} data-testid={`input-sf-${field.key}`}>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`sf-${field.key}`}
                      data-testid={`input-sf-${field.key}`}
                      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                      value={value}
                      onChange={e => updateSituationField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      {...(field.type === "number" ? { min: "0", step: "0.01" } : {})}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="additionalContext" className="text-sm font-medium mb-1.5 block">
          Additional Context (Optional)
        </Label>
        <Textarea
          id="additionalContext"
          data-testid="input-additional-context"
          value={form.additionalContext}
          onChange={e => update("additionalContext", e.target.value)}
          placeholder="Any other relevant information, prior communications, agreements, etc."
          rows={3}
          className="resize-none"
        />
      </div>
    </>
  );
}
