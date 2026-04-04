import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Paperclip, X, File as FileIcon, CheckCircle2, MapPin, Users, AlignLeft, Target, FileText } from "lucide-react";
import { toast } from "sonner";
import { LETTER_TYPE_CONFIG } from "../../../../../shared/types";
import type { ExhibitRow, PendingFile, FormData } from "./types";

const EXHIBIT_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const MAX_EXHIBITS = 10;
const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_EXTS = [
  ".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp", ".txt",
];

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

interface SummaryRowProps {
  label: string;
  value: string | undefined | null;
  mono?: boolean;
}

function SummaryRow({ label, value, mono }: SummaryRowProps) {
  if (!value) return null;
  return (
    <>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`text-xs font-medium text-foreground ${mono ? "font-mono" : ""}`}>{value}</span>
    </>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-primary/70">{icon}</span>
        <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide">{title}</h5>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 pl-5">
        {children}
      </div>
    </div>
  );
}

interface SubmissionSummaryProps {
  form: FormData;
  exhibits: ExhibitRow[];
}

function SubmissionSummary({ form, exhibits }: SubmissionSummaryProps) {
  const activeExhibits = exhibits.filter(e => e.description || e.file);
  const toneLabel: Record<string, string> = {
    firm: "Firm",
    moderate: "Moderate",
    aggressive: "Aggressive",
  };
  const priorCommLabel: Record<string, string> = {
    none: "No prior contact",
    verbal: "Verbal only",
    written: "Written (email/letter)",
    both: "Both verbal and written",
  };
  const deliveryLabel: Record<string, string> = {
    email: "Email",
    certified_mail: "Certified Mail",
    hand_delivery: "Hand Delivery",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4" data-testid="submission-summary">
      <div className="flex items-center gap-2 pb-1 border-b border-border">
        <CheckCircle2 className="w-4 h-4 text-green-500" />
        <h4 className="text-sm font-semibold text-foreground">Review Before Submitting</h4>
      </div>

      <Section icon={<FileText className="w-3.5 h-3.5" />} title="Letter Info">
        <SummaryRow label="Type" value={LETTER_TYPE_CONFIG[form.letterType]?.label ?? form.letterType} />
        <SummaryRow label="Subject" value={form.subject} />
      </Section>

      <Section icon={<MapPin className="w-3.5 h-3.5" />} title="Jurisdiction">
        <SummaryRow
          label="State"
          value={form.jurisdictionState}
        />
        {form.jurisdictionCity && (
          <SummaryRow label="City" value={form.jurisdictionCity} />
        )}
      </Section>

      <Section icon={<Users className="w-3.5 h-3.5" />} title="Parties">
        <SummaryRow label="Sender" value={form.senderName} />
        {form.senderAddress && <SummaryRow label="Sender Address" value={form.senderAddress} />}
        {form.senderEmail && <SummaryRow label="Sender Email" value={form.senderEmail} />}
        {form.senderPhone && <SummaryRow label="Sender Phone" value={form.senderPhone} />}
        <SummaryRow label="Recipient" value={form.recipientName} />
        {form.recipientAddress && <SummaryRow label="Recipient Address" value={form.recipientAddress} />}
        {form.recipientEmail && <SummaryRow label="Recipient Email" value={form.recipientEmail} />}
      </Section>

      <Section icon={<AlignLeft className="w-3.5 h-3.5" />} title="Situation">
        {form.description && (
          <>
            <span className="text-muted-foreground text-xs">Description</span>
            <span className="text-xs font-medium text-foreground">{truncate(form.description, 160)}</span>
          </>
        )}
        {form.incidentDate && (
          <SummaryRow label="Incident Date" value={new Date(form.incidentDate + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
        )}
        {form.amountOwed && (
          <SummaryRow label="Amount Owed" value={`$${parseFloat(form.amountOwed).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        )}
        {form.additionalContext && (
          <>
            <span className="text-muted-foreground text-xs">Additional Context</span>
            <span className="text-xs font-medium text-foreground">{truncate(form.additionalContext, 100)}</span>
          </>
        )}
      </Section>

      <Section icon={<Target className="w-3.5 h-3.5" />} title="Outcome & Preferences">
        {form.desiredOutcome && (
          <>
            <span className="text-muted-foreground text-xs">Desired Outcome</span>
            <span className="text-xs font-medium text-foreground">{truncate(form.desiredOutcome, 120)}</span>
          </>
        )}
        {form.deadlineDate && (
          <SummaryRow label="Deadline" value={new Date(form.deadlineDate + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
        )}
        <SummaryRow label="Tone" value={toneLabel[form.tonePreference] ?? form.tonePreference} />
        <SummaryRow label="Language" value={form.language ? (form.language.charAt(0).toUpperCase() + form.language.slice(1)) : undefined} />
        <SummaryRow label="Delivery" value={deliveryLabel[form.deliveryMethod] ?? form.deliveryMethod} />
        {form.priorCommunication && (
          <SummaryRow label="Prior Communication" value={form.priorCommunication === "none" ? "None" : (priorCommLabel[form.priorCommunication] ?? form.priorCommunication)} />
        )}
        {form.communicationsSummary && (
          <>
            <span className="text-muted-foreground text-xs">Communications Summary</span>
            <span className="text-xs font-medium text-foreground">{truncate(form.communicationsSummary, 100)}</span>
          </>
        )}
      </Section>

      {activeExhibits.length > 0 && (
        <Section icon={<Paperclip className="w-3.5 h-3.5" />} title="Exhibits">
          <span className="text-muted-foreground text-xs">Count</span>
          <span className="text-xs font-medium text-foreground">{activeExhibits.length} exhibit{activeExhibits.length !== 1 ? "s" : ""} added</span>
          {activeExhibits.map((e, i) => (
            <span key={e.id} className="text-muted-foreground text-xs col-span-2 pl-2 border-l-2 border-border">
              <span className="font-semibold text-foreground">Exhibit {EXHIBIT_LETTERS[i]}:</span>{" "}
              {e.description ? truncate(e.description, 60) : ""}
              {e.file ? ` · ${e.file.name}` : ""}
            </span>
          ))}
        </Section>
      )}
    </div>
  );
}

interface Props {
  exhibits: ExhibitRow[];
  setExhibits: React.Dispatch<React.SetStateAction<ExhibitRow[]>>;
  form: FormData;
}

export function Step6Exhibits({ exhibits, setExhibits, form }: Props) {
  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add supporting exhibits — prior communications, contracts, photos, or
          other documents that strengthen your case. Each exhibit can include a
          description and/or a file attachment.{" "}
          <span className="font-medium">Optional.</span>
        </p>

        <div className="space-y-3">
          {exhibits.map((exhibit, idx) => (
            <div
              key={exhibit.id}
              className="rounded-xl border border-border p-4 space-y-3"
              data-testid={`exhibit-row-${idx}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  Exhibit {EXHIBIT_LETTERS[idx]}
                </span>
                {exhibits.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExhibits(prev => prev.filter(e => e.id !== exhibit.id))
                    }
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Remove Exhibit ${EXHIBIT_LETTERS[idx]}`}
                    data-testid={`exhibit-remove-${idx}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center mb-1">
                  <span className="text-xs text-muted-foreground">Description</span>
                </div>
                <Textarea
                  value={exhibit.description}
                  onChange={e => {
                    const val = e.target.value;
                    setExhibits(prev =>
                      prev.map(ex =>
                        ex.id === exhibit.id ? { ...ex, description: val } : ex
                      )
                    );
                  }}
                  placeholder="Describe this exhibit (e.g., Email sent on Jan 5 requesting payment...)"
                  rows={2}
                  className="resize-none"
                  data-testid={`exhibit-description-${idx}`}
                />
              </div>
              {exhibit.file ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                    <FileIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{exhibit.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtBytes(exhibit.file.size)} &nbsp;·&nbsp;{" "}
                      <span className="text-green-600 dark:text-green-400">Ready</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExhibits(prev =>
                        prev.map(ex =>
                          ex.id === exhibit.id ? { ...ex, file: null } : ex
                        )
                      )
                    }
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    aria-label="Remove file"
                    data-testid={`exhibit-file-remove-${idx}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label
                  className="flex items-center gap-2 text-sm text-primary cursor-pointer hover:underline"
                  data-testid={`exhibit-file-attach-${idx}`}
                >
                  <Paperclip className="w-4 h-4" />
                  Attach file
                  <input
                    type="file"
                    accept={ALLOWED_EXTS.join(",")}
                    className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const ext =
                        "." + (file.name.split(".").pop() ?? "").toLowerCase();
                      if (file.size > MAX_FILE_BYTES) {
                        toast.error("File too large", {
                          description: `${file.name} exceeds the ${MAX_FILE_MB} MB limit.`,
                        });
                        return;
                      }
                      if (!ALLOWED_EXTS.includes(ext)) {
                        toast.error("Unsupported file type", {
                          description: `${file.name} is not an accepted format.`,
                        });
                        return;
                      }
                      try {
                        const base64 = await readBase64(file);
                        const pf: PendingFile = {
                          id: `${file.name}-${Date.now()}`,
                          name: file.name,
                          size: file.size,
                          mimeType: file.type || "application/octet-stream",
                          base64,
                          status: "ready",
                        };
                        setExhibits(prev =>
                          prev.map(ex =>
                            ex.id === exhibit.id ? { ...ex, file: pf } : ex
                          )
                        );
                      } catch {
                        toast.error("Upload failed", {
                          description: `Could not read ${file.name}.`,
                        });
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          ))}
        </div>

        {exhibits.length < MAX_EXHIBITS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setExhibits(prev => [
                ...prev,
                { id: `exhibit-${Date.now()}`, description: "", file: null },
              ])
            }
            data-testid="exhibit-add"
          >
            + Add Exhibit
          </Button>
        )}

        {exhibits.every(e => !e.description && !e.file) && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              No exhibits added yet. You can still submit — exhibits help the
              attorney build a stronger letter.
            </p>
          </div>
        )}
      </div>

      <SubmissionSummary form={form} exhibits={exhibits} />
    </div>
  );
}
