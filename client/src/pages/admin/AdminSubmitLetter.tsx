import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
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
  ShieldCheck,
} from "lucide-react";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import { Step1LetterType } from "../subscriber/intake-steps/Step1LetterType";
import { Step2Jurisdiction } from "../subscriber/intake-steps/Step2Jurisdiction";
import { Step3Parties } from "../subscriber/intake-steps/Step3Parties";
import { Step4Details } from "../subscriber/intake-steps/Step4Details";
import { Step5Outcome } from "../subscriber/intake-steps/Step5Outcome";
import { Step6Exhibits } from "../subscriber/intake-steps/Step6Exhibits";
import type { FormData, ExhibitRow, PendingFile } from "../subscriber/intake-steps/types";

const STEPS = [
  { id: 1, label: "Letter Type", icon: <FileText className="w-4 h-4" /> },
  { id: 2, label: "Jurisdiction", icon: <MapPin className="w-4 h-4" /> },
  { id: 3, label: "Parties", icon: <Users className="w-4 h-4" /> },
  { id: 4, label: "Details", icon: <AlignLeft className="w-4 h-4" /> },
  { id: 5, label: "Outcome", icon: <Target className="w-4 h-4" /> },
  { id: 6, label: "Exhibits", icon: <Paperclip className="w-4 h-4" /> },
];

const EXHIBIT_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

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

export default function AdminSubmitLetter() {
  const { user } = useAuth();
  const search = useSearch();
  const [step, setStep] = useState(1);

  const templateIdParam = useMemo(() => {
    const params = new URLSearchParams(search);
    const tid = params.get("templateId");
    return tid ? parseInt(tid, 10) : null;
  }, [search]);

  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(templateIdParam);

  const prefillApplied = useRef(false);
  const [form, setForm] = useState<FormData>(() => {
    const params = new URLSearchParams(search);
    const typeParam = params.get("type");
    if (typeParam && LETTER_TYPE_CONFIG[typeParam]) {
      prefillApplied.current = true;
      return { ...INITIAL, letterType: typeParam };
    }
    return INITIAL;
  });

  const [exhibits, setExhibits] = useState<ExhibitRow[]>([
    { id: "exhibit-0", description: "", file: null },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [, navigate] = useLocation();

  const submit = trpc.letters.adminSubmit.useMutation();
  const uploadAttachment = trpc.letters.uploadAttachment.useMutation();

  const update = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (stepErrors[field]) {
      setStepErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const getStepErrors = (s: number): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (s === 1) {
      if (!form.letterType) errors.letterType = "Letter type is required.";
      if (form.subject.length < 5) errors.subject = "Subject must be at least 5 characters.";
    } else if (s === 2) {
      if (!form.jurisdictionState) errors.jurisdictionState = "State / jurisdiction is required.";
    } else if (s === 3) {
      if (!form.senderName.trim()) errors.senderName = "Sender name is required.";
      if (!form.senderAddress.trim()) errors.senderAddress = "Sender address is required.";
      if (!form.recipientName.trim()) errors.recipientName = "Recipient name is required.";
      if (!form.recipientAddress.trim()) errors.recipientAddress = "Recipient address is required.";
    } else if (s === 4) {
      if (form.description.length < 20) errors.description = "Description must be at least 20 characters.";
    } else if (s === 5) {
      if (form.desiredOutcome.length < 10) errors.desiredOutcome = "Desired outcome must be at least 10 characters.";
    }
    return errors;
  };

  const validateStep = (): boolean => {
    const errors = getStepErrors(step);
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!form.jurisdictionState || form.jurisdictionState.length < 2) {
      toast.error("Missing jurisdiction", { description: "Please go back to Step 2 and select a state." });
      setStep(2);
      return;
    }
    if (!form.letterType || form.subject.length < 5) {
      toast.error("Missing letter details", { description: "Please go back to Step 1 and fill in the required fields." });
      setStep(1);
      return;
    }
    if (!form.senderName.trim() || !form.senderAddress.trim() || !form.recipientName.trim() || !form.recipientAddress.trim()) {
      toast.error("Missing party information", { description: "Please go back to Step 3 and fill in sender and recipient details." });
      setStep(3);
      return;
    }
    if (form.description.length < 20) {
      toast.error("Description too short", { description: "Please go back to Step 4 and provide more detail." });
      setStep(4);
      return;
    }
    if (form.desiredOutcome.length < 10) {
      toast.error("Desired outcome too short", { description: "Please go back to Step 5 and describe your desired outcome." });
      setStep(5);
      return;
    }
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
                | "email" | "phone" | "letter" | "in-person" | "other" | undefined,
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
                : undefined) as "email" | "certified-mail" | "hand-delivery" | undefined,
        },
      };
      const result = await submit.mutateAsync({
        letterType: form.letterType as any,
        subject: form.subject,
        jurisdictionState: form.jurisdictionState,
        jurisdictionCity: form.jurisdictionCity || undefined,
        intakeJson,
        ...(activeTemplateId ? { templateId: activeTemplateId } : {}),
      });
      const letterId = result.letterId;
      const exhibitFiles = exhibits
        .filter(e => e.file && e.file.status === "ready")
        .map(e => e.file!);
      if (exhibitFiles.length > 0) {
        const uploadResults = await Promise.allSettled(
          exhibitFiles.map((f: PendingFile) =>
            uploadAttachment.mutateAsync({
              letterId,
              fileName: f.name,
              mimeType: f.mimeType,
              base64Data: f.base64,
            })
          )
        );
        const failedUploads = exhibitFiles.filter((_, i) => uploadResults[i].status === "rejected");
        if (failedUploads.length > 0) {
          toast.warning(`${failedUploads.length} attachment(s) failed to upload`, {
            description: `${failedUploads.map((f: PendingFile) => f.name).join(", ")} — you can re-upload from the letter detail page.`,
            duration: 8000,
          });
        }
      }
      toast.success("Admin letter submitted", {
        description: "Letter has been submitted and will be processed without billing.",
      });
      navigate(`/admin/letters/${letterId}`);
    } catch (err: any) {
      toast.error("Submission failed", {
        description: err?.message ?? "Please check your inputs and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout
      breadcrumb={[
        { label: "Admin", href: "/admin" },
        { label: "Generate Letter" },
      ]}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-slate-800 text-white rounded-xl p-4 flex items-center gap-3" data-testid="banner-admin-submit">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">Admin Letter Generation</p>
            <p className="text-xs text-slate-300">
              This letter will bypass all billing, entitlement checks, and paywall gates.
            </p>
          </div>
        </div>

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
          <CardContent className="space-y-4 animate-dashboard-fade-up" key={step}>
            {step === 1 && <Step1LetterType form={form} stepErrors={stepErrors} update={update} />}
            {step === 2 && <Step2Jurisdiction form={form} stepErrors={stepErrors} update={update} />}
            {step === 3 && <Step3Parties form={form} stepErrors={stepErrors} update={update} />}
            {step === 4 && <Step4Details form={form} stepErrors={stepErrors} update={update} />}
            {step === 5 && <Step5Outcome form={form} stepErrors={stepErrors} update={update} />}
            {step === 6 && <Step6Exhibits exhibits={exhibits} setExhibits={setExhibits} />}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => { setStepErrors({}); setStep(s => s - 1); }}
            disabled={step === 1}
            className="bg-background"
            data-testid="button-admin-submit-back"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          {step < 6 ? (
            <Button
              onClick={() => {
                if (validateStep()) {
                  setStep(s => s + 1);
                }
              }}
              data-testid="button-admin-submit-next"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="button-admin-submit-letter">
              {isSubmitting ? "Submitting..." : "Generate Letter (Admin)"}
              <ShieldCheck className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
