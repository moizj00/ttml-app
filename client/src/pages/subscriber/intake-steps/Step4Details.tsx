import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormData } from "./types";

interface Props {
  form: FormData;
  stepErrors: Record<string, string>;
  update: (field: keyof FormData, value: string) => void;
}

export function Step4Details({ form, stepErrors, update }: Props) {
  return (
    <>
      <div>
        <Label htmlFor="description" className="text-sm font-medium mb-1.5 block">
          Describe Your Situation *
        </Label>
        <Textarea
          id="description"
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
            Amount Owed (USD) (Optional)
          </Label>
          <Input
            id="amountOwed"
            type="number"
            value={form.amountOwed}
            onChange={e => update("amountOwed", e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="additionalContext" className="text-sm font-medium mb-1.5 block">
          Additional Context (Optional)
        </Label>
        <Textarea
          id="additionalContext"
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
