import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/shared/AddressAutocomplete";
import type { FormData } from "./types";

interface Props {
  form: FormData;
  stepErrors: Record<string, string>;
  update: (field: keyof FormData, value: string) => void;
}

export function Step3Parties({ form, stepErrors, update }: Props) {
  return (
    <>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Your Information (Sender)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="senderName" className="text-xs mb-1 block">
              Full Name *
            </Label>
            <Input
              id="senderName"
              value={form.senderName}
              onChange={e => update("senderName", e.target.value)}
              placeholder="John Smith"
            />
            {stepErrors.senderName && (
              <p className="text-xs text-red-600 mt-1">{stepErrors.senderName}</p>
            )}
          </div>
          <div>
            <Label htmlFor="senderEmail" className="text-xs mb-1 block">
              Email (Optional)
            </Label>
            <Input
              id="senderEmail"
              type="email"
              value={form.senderEmail}
              onChange={e => update("senderEmail", e.target.value)}
              placeholder="john@example.com"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="senderAddress" className="text-xs mb-1 block">
            Address *
          </Label>
          <AddressAutocomplete
            id="senderAddress"
            value={form.senderAddress}
            onChange={(val) => update("senderAddress", val)}
            placeholder="Start typing an address..."
            data-testid="input-senderAddress"
          />
          {stepErrors.senderAddress && (
            <p className="text-xs text-red-600 mt-1">{stepErrors.senderAddress}</p>
          )}
        </div>
        <div>
          <Label htmlFor="senderPhone" className="text-xs mb-1 block">
            Phone (Optional)
          </Label>
          <Input
            id="senderPhone"
            value={form.senderPhone}
            onChange={e => update("senderPhone", e.target.value)}
            placeholder="(555) 000-0000"
          />
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Recipient Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="recipientName" className="text-xs mb-1 block">
              Full Name / Company *
            </Label>
            <Input
              id="recipientName"
              value={form.recipientName}
              onChange={e => update("recipientName", e.target.value)}
              placeholder="Jane Doe / Acme Corp"
            />
            {stepErrors.recipientName && (
              <p className="text-xs text-red-600 mt-1">{stepErrors.recipientName}</p>
            )}
          </div>
          <div>
            <Label htmlFor="recipientEmail" className="text-xs mb-1 block">
              Email (Optional)
            </Label>
            <Input
              id="recipientEmail"
              type="email"
              value={form.recipientEmail}
              onChange={e => update("recipientEmail", e.target.value)}
              placeholder="recipient@example.com"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="recipientAddress" className="text-xs mb-1 block">
            Address *
          </Label>
          <AddressAutocomplete
            id="recipientAddress"
            value={form.recipientAddress}
            onChange={(val) => update("recipientAddress", val)}
            placeholder="Start typing an address..."
            data-testid="input-recipientAddress"
          />
          {stepErrors.recipientAddress && (
            <p className="text-xs text-red-600 mt-1">{stepErrors.recipientAddress}</p>
          )}
        </div>
      </div>
    </>
  );
}
