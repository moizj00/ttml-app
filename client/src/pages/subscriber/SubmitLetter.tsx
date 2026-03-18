import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  FileText,
  MapPin,
  Users,
  AlignLeft,
  Target,
  Paperclip,
  X,
  File as FileIcon,
} from "lucide-react";
import { LETTER_TYPE_CONFIG, US_STATES } from "../../../../shared/types";
import { AlertCircle, Scale } from "lucide-react";
import PipelineProgressModal from "@/components/PipelineProgressModal";
import { Link } from "wouter";

const STEPS = [
  { id: 1, label: "Letter Type", icon: <FileText className="w-4 h-4" /> },
  { id: 2, label: "Jurisdiction", icon: <MapPin className="w-4 h-4" /> },
  { id: 3, label: "Parties", icon: <Users className="w-4 h-4" /> },
  { id: 4, label: "Details", icon: <AlignLeft className="w-4 h-4" /> },
  { id: 5, label: "Outcome", icon: <Target className="w-4 h-4" /> },
  { id: 6, label: "Exhibits", icon: <Paperclip className="w-4 h-4" /> },
];

const EXHIBIT_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const MAX_EXHIBITS = 10;

const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_EXTS = [
  ".pdf",
  ".doc",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".txt",
];

interface PendingFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  base64: string;
  status: "ready" | "error";
  error?: string;
}

interface ExhibitRow {
  id: string;
  description: string;
  file: PendingFile | null;
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

interface FormData {
  letterType: string;
  subject: string;
  jurisdictionState: string;
  jurisdictionCity: string;
  tonePreference: "firm" | "moderate" | "aggressive";
  senderName: string;
  senderAddress: string;
  senderEmail: string;
  senderPhone: string;
  recipientName: string;
  recipientAddress: string;
  recipientEmail: string;
  incidentDate: string;
  description: string;
  additionalContext: string;
  amountOwed: string;
  desiredOutcome: string;
  deadlineDate: string;
  language: string;
  priorCommunication: string;
  deliveryMethod: string;
  communicationsSummary: string;
  communicationsLastContactDate: string;
  communicationsMethod: string;
}

const INITIAL: FormData = {
  letterType: "",
  subject: "",
  jurisdictionState: "",
  jurisdictionCity: "",
  tonePreference: "firm",
  senderName: "",
  senderAddress: "",
  senderEmail: "",
  senderPhone: "",
  recipientName: "",
  recipientAddress: "",
  recipientEmail: "",
  incidentDate: "",
  description: "",
  additionalContext: "",
  amountOwed: "",
  desiredOutcome: "",
  deadlineDate: "",
  language: "english",
  priorCommunication: "",
  deliveryMethod: "email",
  communicationsSummary: "",
  communicationsLastContactDate: "",
  communicationsMethod: "",
};

const DRAFT_KEY = "ttml_draft_letter";

export default function SubmitLetter() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [exhibits, setExhibits] = useState<ExhibitRow[]>([
    { id: "exhibit-0", description: "", file: null },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pipelineLetterId, setPipelineLetterId] = useState<number | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [, navigate] = useLocation();

  // ── Resume draft: load saved draft on mount ─────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.form && parsed.step) {
          setShowDraftBanner(true);
        }
      }
    } catch {
      /* ignore corrupt data */
    }
  }, []);

  const resumeDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.form) setForm({ ...INITIAL, ...parsed.form });
        if (parsed.step) setStep(parsed.step);
        toast.success("Draft restored", {
          description: "Your previously saved progress has been loaded.",
        });
      }
    } catch {
      /* ignore */
    }
    setShowDraftBanner(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setShowDraftBanner(false);
    toast.info("Draft discarded", {
      description: "Starting fresh with a blank form.",
    });
  };

  // ── Save draft to localStorage on step/form change ──────────────────────
  useEffect(() => {
    // Only save if user has started filling out the form
    if (form.letterType || form.subject || form.description) {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ form, step, savedAt: Date.now() })
        );
      } catch {
        /* storage full — ignore */
      }
    }
  }, [form, step]);

  const { data: canSubmitData, isLoading: checkingSubscription } =
    trpc.billing.checkCanSubmit.useQuery();

  const submit = trpc.letters.submit.useMutation();
  const uploadAttachment = trpc.letters.uploadAttachment.useMutation();

  const update = (field: keyof FormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const canProceed = () => {
    if (step === 1) return !!form.letterType && form.subject.length >= 5;
    if (step === 2) return !!form.jurisdictionState;
    if (step === 3)
      return (
        !!form.senderName &&
        !!form.senderAddress &&
        !!form.recipientName &&
        !!form.recipientAddress
      );
    if (step === 4) return form.description.length >= 20;
    if (step === 5) return form.desiredOutcome.length >= 10;
    if (step === 6) return true; // exhibits are optional
    return true;
  };

  const readBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ── Submit with attachments ───────────────────────────────────────────────
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const intakeJson = {
        schemaVersion: "1.0",
        letterType: form.letterType,
        sender: {
          name: form.senderName,
          address: form.senderAddress,
          email: form.senderEmail || undefined,
          phone: form.senderPhone || undefined,
        },
        recipient: {
          name: form.recipientName,
          address: form.recipientAddress,
          email: form.recipientEmail || undefined,
        },
        jurisdiction: {
          country: "US",
          state: form.jurisdictionState,
          city: form.jurisdictionCity || undefined,
        },
        matter: {
          category: form.letterType,
          subject: form.subject,
          description: form.description,
          incidentDate: form.incidentDate || undefined,
        },
        financials: form.amountOwed
          ? { amountOwed: parseFloat(form.amountOwed), currency: "USD" }
          : undefined,
        desiredOutcome: form.desiredOutcome,
        deadlineDate: form.deadlineDate || undefined,
        additionalContext: form.additionalContext || undefined,
        tonePreference: form.tonePreference,
        language: form.language,
        priorCommunication: form.priorCommunication || undefined,
        deliveryMethod: form.deliveryMethod,
        exhibits: exhibits
          .filter(e => e.description || e.file)
          .map((e, i) => ({
            label: `Exhibit ${EXHIBIT_LETTERS[i]}`,
            description: e.description || undefined,
            hasAttachment: !!e.file,
          })),
        communications: form.communicationsSummary
          ? {
              summary: form.communicationsSummary,
              lastContactDate: form.communicationsLastContactDate || undefined,
              method: (form.communicationsMethod || undefined) as
                | "email"
                | "phone"
                | "letter"
                | "in-person"
                | "other"
                | undefined,
            }
          : undefined,
        toneAndDelivery: {
          tone: form.tonePreference,
          deliveryMethod: (form.deliveryMethod === "certified_mail"
            ? "certified-mail"
            : form.deliveryMethod === "hand_delivery"
              ? "hand-delivery"
              : form.deliveryMethod === "email"
                ? "email"
                : undefined) as
            | "email"
            | "certified-mail"
            | "hand-delivery"
            | undefined,
        },
      };
      const result = await submit.mutateAsync({
        letterType: form.letterType as any,
        subject: form.subject,
        jurisdictionState: form.jurisdictionState,
        jurisdictionCity: form.jurisdictionCity || undefined,
        intakeJson,
      });
      const letterId = result.letterId;
      const exhibitFiles = exhibits
        .filter(e => e.file && e.file.status === "ready")
        .map(e => e.file!);
      if (exhibitFiles.length > 0) {
        await Promise.allSettled(
          exhibitFiles.map(f =>
            uploadAttachment.mutateAsync({
              letterId,
              fileName: f.name,
              mimeType: f.mimeType,
              base64Data: f.base64,
            })
          )
        );
      }
      // Clear saved draft on successful submission
      localStorage.removeItem(DRAFT_KEY);
      toast.success("Letter submitted", {
        description:
          "Our legal team is preparing your draft. This usually takes 1\u20132 minutes.",
      });
      setPipelineLetterId(letterId);
      setShowPipeline(true);
    } catch (err: any) {
      toast.error("Submission failed", {
        description: err?.message ?? "Please check your inputs and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show subscription gate if user cannot submit
  if (!checkingSubscription && canSubmitData && !canSubmitData.allowed) {
    return (
      <AppLayout
        breadcrumb={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Submit Letter" },
        ]}
      >
        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-10 text-center space-y-4">
            <Scale className="w-12 h-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-bold text-foreground">
              Subscription Required
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {canSubmitData.reason}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <Link href="/pricing">
                <Button className="bg-[#3b82f6] hover:bg-[#2563eb] text-white">
                  <Scale className="w-4 h-4 mr-2" /> View Plans
                </Button>
              </Link>
              <Link href="/subscriber/billing">
                <Button variant="outline">Manage Billing</Button>
              </Link>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      breadcrumb={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Submit Letter" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Resume Draft Banner */}
        {showDraftBanner && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  You have an unfinished draft
                </p>
                <p className="text-xs text-blue-600">
                  Would you like to continue where you left off?
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={discardDraft}>
                Discard
              </Button>
              <Button size="sm" onClick={resumeDraft}>
                Resume
              </Button>
            </div>
          </div>
        )}

        {/* Step Progress */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 min-w-0">
              <div
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                  step === s.id
                    ? "bg-primary text-primary-foreground"
                    : step > s.id
                      ? "bg-green-100 text-green-700"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s.id ? <CheckCircle className="w-3.5 h-3.5" /> : s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 ${step > s.id ? "bg-green-300" : "bg-muted"}`}
                />
              )}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {STEPS[step - 1].icon}
              {STEPS[step - 1].label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 1: Letter Type */}
            {step === 1 && (
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
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">
                    Tone Preference
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
                        Firm (Professional & Direct)
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
            )}

            {/* Step 2: Jurisdiction */}
            {step === 2 && (
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
                    This determines which laws and statutes apply to your
                    letter.
                  </p>
                </div>
                <div>
                  <Label
                    htmlFor="city"
                    className="text-sm font-medium mb-1.5 block"
                  >
                    City (Optional)
                  </Label>
                  <Input
                    id="city"
                    value={form.jurisdictionCity}
                    onChange={e => update("jurisdictionCity", e.target.value)}
                    placeholder="e.g., Los Angeles"
                  />
                </div>
              </>
            )}

            {/* Step 3: Parties */}
            {step === 3 && (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Your Information (Sender)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label
                        htmlFor="senderName"
                        className="text-xs mb-1 block"
                      >
                        Full Name *
                      </Label>
                      <Input
                        id="senderName"
                        value={form.senderName}
                        onChange={e => update("senderName", e.target.value)}
                        placeholder="John Smith"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="senderEmail"
                        className="text-xs mb-1 block"
                      >
                        Email
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
                    <Label
                      htmlFor="senderAddress"
                      className="text-xs mb-1 block"
                    >
                      Address *
                    </Label>
                    <Input
                      id="senderAddress"
                      value={form.senderAddress}
                      onChange={e => update("senderAddress", e.target.value)}
                      placeholder="123 Main St, City, State 12345"
                    />
                  </div>
                  <div>
                    <Label htmlFor="senderPhone" className="text-xs mb-1 block">
                      Phone
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
                      <Label
                        htmlFor="recipientName"
                        className="text-xs mb-1 block"
                      >
                        Full Name / Company *
                      </Label>
                      <Input
                        id="recipientName"
                        value={form.recipientName}
                        onChange={e => update("recipientName", e.target.value)}
                        placeholder="Jane Doe / Acme Corp"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="recipientEmail"
                        className="text-xs mb-1 block"
                      >
                        Email
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
                    <Label
                      htmlFor="recipientAddress"
                      className="text-xs mb-1 block"
                    >
                      Address *
                    </Label>
                    <Input
                      id="recipientAddress"
                      value={form.recipientAddress}
                      onChange={e => update("recipientAddress", e.target.value)}
                      placeholder="456 Other St, City, State 67890"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Step 4: Details */}
            {step === 4 && (
              <>
                <div>
                  <Label
                    htmlFor="description"
                    className="text-sm font-medium mb-1.5 block"
                  >
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
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label
                      htmlFor="incidentDate"
                      className="text-sm font-medium mb-1.5 block"
                    >
                      Incident Date
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
                      Amount Owed (USD)
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
                  <Label
                    htmlFor="additionalContext"
                    className="text-sm font-medium mb-1.5 block"
                  >
                    Additional Context
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
            )}

            {/* Step 5: Outcome */}
            {step === 5 && (
              <>
                <div>
                  <Label
                    htmlFor="desiredOutcome"
                    className="text-sm font-medium mb-1.5 block"
                  >
                    What outcome do you want? *
                  </Label>
                  <Textarea
                    id="desiredOutcome"
                    value={form.desiredOutcome}
                    onChange={e => update("desiredOutcome", e.target.value)}
                    placeholder="e.g., I want the recipient to pay the outstanding balance of $2,500 within 14 days, or I will pursue legal action..."
                    rows={4}
                    className="resize-none"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="deadlineDate"
                    className="text-sm font-medium mb-1.5 block"
                  >
                    Response Deadline
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
                      Language Preference
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
                      Prior Communication?
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
                        <SelectItem value="written">
                          Written (email/letter)
                        </SelectItem>
                        <SelectItem value="both">
                          Both verbal and written
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">
                      Delivery Method
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
                      {form.jurisdictionCity
                        ? `, ${form.jurisdictionCity}`
                        : ""}
                    </span>
                    <span className="text-muted-foreground">Sender:</span>
                    <span className="text-foreground font-medium">
                      {form.senderName}
                    </span>
                    <span className="text-muted-foreground">Recipient:</span>
                    <span className="text-foreground font-medium">
                      {form.recipientName}
                    </span>
                    <span className="text-muted-foreground">Tone:</span>
                    <span className="text-foreground font-medium capitalize">
                      {form.tonePreference}
                    </span>
                    <span className="text-muted-foreground">Language:</span>
                    <span className="text-foreground font-medium capitalize">
                      {form.language}
                    </span>
                    <span className="text-muted-foreground">Delivery:</span>
                    <span className="text-foreground font-medium capitalize">
                      {form.deliveryMethod.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              </>
            )}
            {/* ── Step 6: Exhibits (merged Communications + Evidence) ──── */}
            {step === 6 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Add supporting exhibits — prior communications, contracts,
                  photos, or other documents that strengthen your case. Each
                  exhibit can include a description and/or a file attachment.{" "}
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
                              setExhibits(prev =>
                                prev.filter(e => e.id !== exhibit.id)
                              )
                            }
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label={`Remove Exhibit ${EXHIBIT_LETTERS[idx]}`}
                            data-testid={`exhibit-remove-${idx}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <Textarea
                        value={exhibit.description}
                        onChange={e => {
                          const val = e.target.value;
                          setExhibits(prev =>
                            prev.map(ex =>
                              ex.id === exhibit.id
                                ? { ...ex, description: val }
                                : ex
                            )
                          );
                        }}
                        placeholder="Describe this exhibit (e.g., Email sent on Jan 5 requesting payment...)"
                        rows={2}
                        className="resize-none"
                        data-testid={`exhibit-description-${idx}`}
                      />
                      {exhibit.file ? (
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                          <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                            <FileIcon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {exhibit.file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {fmtBytes(exhibit.file.size)} &nbsp;·&nbsp;{" "}
                              <span className="text-green-600 dark:text-green-400">
                                Ready
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setExhibits(prev =>
                                prev.map(ex =>
                                  ex.id === exhibit.id
                                    ? { ...ex, file: null }
                                    : ex
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
                                "." +
                                (file.name.split(".").pop() ?? "").toLowerCase();
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
                                  mimeType:
                                    file.type || "application/octet-stream",
                                  base64,
                                  status: "ready",
                                };
                                setExhibits(prev =>
                                  prev.map(ex =>
                                    ex.id === exhibit.id
                                      ? { ...ex, file: pf }
                                      : ex
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
                        {
                          id: `exhibit-${Date.now()}`,
                          description: "",
                          file: null,
                        },
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
                      No exhibits added yet. You can still submit — exhibits
                      help the attorney build a stronger letter.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            className="bg-background"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          {step < 6 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Letter"}
              <CheckCircle className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
      <PipelineProgressModal
        open={showPipeline}
        onClose={() => {
          setShowPipeline(false);
          if (pipelineLetterId) navigate(`/letters/${pipelineLetterId}`);
        }}
        letterId={pipelineLetterId}
      />
    </AppLayout>
  );
}
