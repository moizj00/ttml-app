import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import type { FormData } from "./types";

interface Props {
  form: FormData;
  stepErrors: Record<string, string>;
  update: (field: keyof FormData, value: string) => void;
  appendVoice: (field: keyof FormData) => (transcript: string) => void;
}

export function Step3Parties({ form, stepErrors, update, appendVoice }: Props) {
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
            <div className="flex gap-2 items-center">
              <Input
                id="senderName"
                value={form.senderName}
                onChange={e => update("senderName", e.target.value)}
                placeholder="John Smith"
                className="flex-1"
              />
              <VoiceInputButton fieldId="senderName" onTranscript={appendVoice("senderName")} />
            </div>
            {stepErrors.senderName && (
              <p className="text-xs text-red-600 mt-1">{stepErrors.senderName}</p>
            )}
          </div>
          <div>
            <Label htmlFor="senderEmail" className="text-xs mb-1 block">
              Email (Optional)
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id="senderEmail"
                type="email"
                value={form.senderEmail}
                onChange={e => update("senderEmail", e.target.value)}
                placeholder="john@example.com"
                className="flex-1"
              />
              <VoiceInputButton fieldId="senderEmail" onTranscript={appendVoice("senderEmail")} />
            </div>
          </div>
        </div>
        <div>
          <Label htmlFor="senderAddress" className="text-xs mb-1 block">
            Address *
          </Label>
          <div className="flex gap-2 items-center">
            <Input
              id="senderAddress"
              value={form.senderAddress}
              onChange={e => update("senderAddress", e.target.value)}
              placeholder="123 Main St, City, State 12345"
              className="flex-1"
            />
            <VoiceInputButton fieldId="senderAddress" onTranscript={appendVoice("senderAddress")} />
          </div>
          {stepErrors.senderAddress && (
            <p className="text-xs text-red-600 mt-1">{stepErrors.senderAddress}</p>
          )}
        </div>
        <div>
          <Label htmlFor="senderPhone" className="text-xs mb-1 block">
            Phone (Optional)
          </Label>
          <div className="flex gap-2 items-center">
            <Input
              id="senderPhone"
              value={form.senderPhone}
              onChange={e => update("senderPhone", e.target.value)}
              placeholder="(555) 000-0000"
              className="flex-1"
            />
            <VoiceInputButton fieldId="senderPhone" onTranscript={appendVoice("senderPhone")} />
          </div>
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
            <div className="flex gap-2 items-center">
              <Input
                id="recipientName"
                value={form.recipientName}
                onChange={e => update("recipientName", e.target.value)}
                placeholder="Jane Doe / Acme Corp"
                className="flex-1"
              />
              <VoiceInputButton fieldId="recipientName" onTranscript={appendVoice("recipientName")} />
            </div>
            {stepErrors.recipientName && (
              <p className="text-xs text-red-600 mt-1">{stepErrors.recipientName}</p>
            )}
          </div>
          <div>
            <Label htmlFor="recipientEmail" className="text-xs mb-1 block">
              Email (Optional)
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id="recipientEmail"
                type="email"
                value={form.recipientEmail}
                onChange={e => update("recipientEmail", e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1"
              />
              <VoiceInputButton fieldId="recipientEmail" onTranscript={appendVoice("recipientEmail")} />
            </div>
          </div>
        </div>
        <div>
          <Label htmlFor="recipientAddress" className="text-xs mb-1 block">
            Address *
          </Label>
          <div className="flex gap-2 items-center">
            <Input
              id="recipientAddress"
              value={form.recipientAddress}
              onChange={e => update("recipientAddress", e.target.value)}
              placeholder="456 Other St, City, State 67890"
              className="flex-1"
            />
            <VoiceInputButton fieldId="recipientAddress" onTranscript={appendVoice("recipientAddress")} />
          </div>
          {stepErrors.recipientAddress && (
            <p className="text-xs text-red-600 mt-1">{stepErrors.recipientAddress}</p>
          )}
        </div>
      </div>
    </>
  );
}
