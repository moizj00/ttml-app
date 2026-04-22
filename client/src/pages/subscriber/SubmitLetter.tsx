import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect, useMemo, useRef } from "react";
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
  X,
} from "lucide-react";
import { LETTER_TYPE_CONFIG, ANALYZE_PREFILL_KEY } from "../../../../shared/types";
import type { AnalysisPrefill, SituationFieldDef, IntakeFormTemplateRecord, IntakeFieldConfig } from "../../../../shared/types";
import { AlertCircle, Scale } from "lucide-react";
import { Link } from "wouter";
import { Step1LetterType } from "./intake-steps/Step1LetterType";
import { Step2Jurisdiction } from "./intake-steps/Step2Jurisdiction";
import { Step3Parties } from "./intake-steps/Step3Parties";
import { Step4Details } from "./intake-steps/Step4Details";
import { Step5Outcome } from "./intake-steps/Step5Outcome";
import { Step6Exhibits } from "./intake-steps/Step6Exhibits";
import type { FormData, ExhibitRow, PendingFile } from "./intake-steps/types";
import { LetterSubmitProgressModal } from "@/components/LetterSubmitProgressModal";

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
  situationFields: {},
};

const DRAFT_KEY_PREFIX = "ttml_draft_letter";

function getTabSessionId(): string {
  let tabId = sessionStorage.getItem("ttml_tab_id");
  if (!tabId) {
    tabId = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem("ttml_tab_id", tabId);
  }
  return tabId;
}

function readAndClearPrefill(): { prefill: AnalysisPrefill | null; found: boolean } {
  try {
    const raw = sessionStorage.getItem(ANALYZE_PREFILL_KEY);
    if (raw) {
      sessionStorage.removeItem(ANALYZE_PREFILL_KEY);
      const prefill = JSON.parse(raw) as AnalysisPrefill;
      return { prefill, found: true };
    }
  } catch {
    /* ignore */
  }
  return { prefill: null, found: false };
}

function buildInitialFormFromPrefill(prefill: AnalysisPrefill): FormData {
  return {
    ...INITIAL,
    ...(prefill.letterType && { letterType: prefill.letterType }),
    ...(prefill.subject && { subject: prefill.subject.slice(0, 200) }),
    ...(prefill.jurisdictionState && { jurisdictionState: prefill.jurisdictionState }),
    ...(prefill.senderName && { senderName: prefill.senderName }),
    ...(prefill.recipientName && { recipientName: prefill.recipientName }),
    ...(prefill.description && { description: prefill.description.slice(0, 600) }),
  };
}

export default function SubmitLetter() {
  const { user } = useAuth();
  const search = useSearch();
  const DRAFT_KEY = useMemo(() => {
    const userId = user?.id ?? "anon";
    const tabId = getTabSessionId();
    return `${DRAFT_KEY_PREFIX}_${userId}_${tabId}`;
  }, [user?.id]);
  const [step, setStep] = useState(1);

  const templateIdParam = useMemo(() => {
    const params = new URLSearchParams(search);
    const tid = params.get("templateId");
    return tid ? parseInt(tid, 10) : null;
  }, [search]);

  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(templateIdParam);

  const cachedTemplate = useMemo(() => {
    if (!templateIdParam) return null;
    try {
      const raw = sessionStorage.getItem(`template_prefill_${templateIdParam}`);
      if (raw) {
        sessionStorage.removeItem(`template_prefill_${templateIdParam}`);
        return JSON.parse(raw) as {
          templateId: number;
          templateTitle: string;
          prefillData: Record<string, string | undefined>;
        };
      }
    } catch {}
    return null;
  }, [templateIdParam]);

  const { data: templateData, isError: templateFetchError } = trpc.templates.getById.useQuery(
    { id: templateIdParam! },
    { enabled: !!templateIdParam && !cachedTemplate, retry: false }
  );

  const resolvedPrefill = useMemo(() => {
    if (cachedTemplate) return cachedTemplate.prefillData;
    if (templateData) return templateData.prefillData as Record<string, string | undefined>;
    return null;
  }, [cachedTemplate, templateData]);

  useEffect(() => {
    if (templateFetchError && !cachedTemplate) {
      setActiveTemplateId(null);
    }
  }, [templateFetchError, cachedTemplate]);

  const prefillApplied = useRef(false);
  const prefillFromAnalyzer = useRef(false);
  const templatePrefillApplied = useRef(false);
  const analyzerEvidenceSummary = useRef<string | null>(null);
  const [form, setForm] = useState<FormData>(() => {
    const { prefill, found } = readAndClearPrefill();
    if (found && prefill) {
      prefillApplied.current = true;
      prefillFromAnalyzer.current = true;
      if (prefill.evidenceSummary) {
        analyzerEvidenceSummary.current = prefill.evidenceSummary;
      }
      return buildInitialFormFromPrefill(prefill);
    }
    const params = new URLSearchParams(search);
    const typeParam = params.get("type");
    if (typeParam && LETTER_TYPE_CONFIG[typeParam]) {
      prefillApplied.current = true;
      return { ...INITIAL, letterType: typeParam };
    }
    return INITIAL;
  });

  useEffect(() => {
    if (resolvedPrefill && !templatePrefillApplied.current) {
      templatePrefillApplied.current = true;
      prefillApplied.current = true;
      const pf = resolvedPrefill;
      setForm(prev => ({
        ...prev,
        ...(pf.letterType && { letterType: pf.letterType }),
        ...(pf.subject && { subject: pf.subject.slice(0, 500) }),
        ...(pf.description && { description: pf.description }),
        ...(pf.desiredOutcome && { desiredOutcome: pf.desiredOutcome }),
        ...(pf.tonePreference && { tonePreference: pf.tonePreference as FormData["tonePreference"] }),
        ...(pf.amountOwed && { amountOwed: pf.amountOwed }),
        ...(pf.jurisdictionState && { jurisdictionState: pf.jurisdictionState }),
        ...(pf.jurisdictionCity && { jurisdictionCity: pf.jurisdictionCity }),
        ...(pf.additionalContext && { additionalContext: pf.additionalContext }),
      }));
      setShowTemplateBanner(true);
    }
  }, [resolvedPrefill]);

  const [exhibits, setExhibits] = useState<ExhibitRow[]>([
    { id: "exhibit-0", description: "", file: null },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showPrefillBanner, setShowPrefillBanner] = useState(false);
  const [showTemplateBanner, setShowTemplateBanner] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [, navigate] = useLocation();

  // ── Post-submit free-preview progress modal state ───────────────────────
  // When a letter is successfully submitted we open a 90-second progress
  // modal that masks the real background pipeline and explains the 24-hour
  // free-preview lead-magnet flow. See client/src/components/LetterSubmitProgressModal.tsx
  // for the full rationale. The letter id is stored so the CTA can route
  // the user to their letters list when the timer completes.
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [submittedLetterId, setSubmittedLetterId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (prefillFromAnalyzer.current) {
      setShowPrefillBanner(true);
    }
  }, []);

  // ── Resume draft: load saved draft on mount ─────────────────────────────
  useEffect(() => {
    if (prefillApplied.current) return; // skip draft check if prefill was applied
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
  }, [DRAFT_KEY]);

  const resumeDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const restoredForm = parsed.form ? { ...INITIAL, ...parsed.form } : INITIAL;
        setForm(restoredForm);
        const maxValidStep = (() => {
          if (!restoredForm.letterType || restoredForm.subject.length < 5) return 1;
          if (!restoredForm.jurisdictionState) return 2;
          if (!restoredForm.senderName?.trim() || !restoredForm.senderAddress?.trim() || !restoredForm.recipientName?.trim() || !restoredForm.recipientAddress?.trim()) return 3;
          if (restoredForm.description.length < 20) return 4;
          if (restoredForm.desiredOutcome.length < 10) return 5;
          return 6;
        })();
        const targetStep = parsed.step ? Math.min(parsed.step, maxValidStep) : 1;
        setStep(targetStep);
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
  }, [form, step, DRAFT_KEY]);

  const { data: intakeFormTemplatesList } = trpc.intakeFormTemplates.list.useQuery();

  const intakeFormTemplatesForType = useMemo((): IntakeFormTemplateRecord[] => {
    if (!intakeFormTemplatesList || !form.letterType) return [];
    return (intakeFormTemplatesList as IntakeFormTemplateRecord[]).filter(t => t.baseLetterType === form.letterType);
  }, [intakeFormTemplatesList, form.letterType]);

  const [activeIntakeFormTemplateId, setActiveIntakeFormTemplateId] = useState<number | null>(null);
  const prevLetterTypeRef = useRef(form.letterType);
  useEffect(() => {
    if (form.letterType !== prevLetterTypeRef.current) {
      prevLetterTypeRef.current = form.letterType;
      setActiveIntakeFormTemplateId(null);
    }
  }, [form.letterType]);

  const activeIntakeFormTemplate = useMemo((): IntakeFormTemplateRecord | null => {
    if (!activeIntakeFormTemplateId || !intakeFormTemplatesList) return null;
    return (intakeFormTemplatesList as IntakeFormTemplateRecord[]).find(t => t.id === activeIntakeFormTemplateId) ?? null;
  }, [activeIntakeFormTemplateId, intakeFormTemplatesList]);

  const intakeFormTemplateFieldConfig = useMemo((): IntakeFieldConfig | null => {
    if (activeIntakeFormTemplate) {
      return activeIntakeFormTemplate.fieldConfig;
    }
    if (resolvedPrefill) {
      const pf = resolvedPrefill as Record<string, string | string[] | SituationFieldDef[] | undefined>;
      if (pf.enabledSituationFields || pf.customSituationFields) {
        return {
          enabledDefaultFields: (pf.enabledSituationFields as string[] | undefined) ?? [],
          customFields: (pf.customSituationFields as SituationFieldDef[] | undefined) ?? [],
        };
      }
    }
    return null;
  }, [activeIntakeFormTemplate, resolvedPrefill]);

  const { data: canSubmitData, isLoading: checkingSubscription } =
    trpc.billing.checkCanSubmit.useQuery();

  const submit = trpc.letters.submit.useMutation();
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

  const updateSituationField = (key: string, value: string) => {
    setForm(prev => ({
      ...prev,
      situationFields: { ...prev.situationFields, [key]: value },
    }));
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

  // ── Submit with attachments ───────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.jurisdictionState || form.jurisdictionState.length < 2) {
      toast.error("Missing jurisdiction", {
        description: "Please go back to Step 2 and select a state.",
      });
      setStep(2);
      return;
    }
    if (!form.letterType || form.subject.length < 5) {
      toast.error("Missing letter details", {
        description: "Please go back to Step 1 and fill in the required fields.",
      });
      setStep(1);
      return;
    }
    if (!form.senderName.trim() || !form.senderAddress.trim() || !form.recipientName.trim() || !form.recipientAddress.trim()) {
      toast.error("Missing party information", {
        description: "Please go back to Step 3 and fill in sender and recipient details.",
      });
      setStep(3);
      return;
    }
    if (form.description.length < 20) {
      toast.error("Description too short", {
        description: "Please go back to Step 4 and provide more detail.",
      });
      setStep(4);
      return;
    }
    if (form.desiredOutcome.length < 10) {
      toast.error("Desired outcome too short", {
        description: "Please go back to Step 5 and describe your desired outcome.",
      });
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
        evidenceSummary: analyzerEvidenceSummary.current || undefined,
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
        situationFields: Object.keys(form.situationFields).length > 0
          ? Object.fromEntries(
              Object.entries(form.situationFields)
                .filter(([, v]) => v !== "")
                .map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])
            )
          : undefined,
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
      // Clear saved draft on successful submission
      localStorage.removeItem(DRAFT_KEY);
      setSubmittedLetterId(letterId);
      // Only show the progress modal for first-letter free-preview submissions —
      // its copy (90s timer + "we'll email you in 24 hours") is wrong for paid
      // subscribers whose letters flow straight into the paywall/attorney-review
      // track. For those, navigate directly to the letter detail page.
      if ((result as any).isFreePreview === true) {
        setProgressModalOpen(true);
      } else {
        navigate(`/letters/${letterId}`);
      }
    } catch (err: any) {
      toast.error("Submission failed", {
        description: err?.message ?? "Please check your inputs and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProgressModalClose = () => {
    setProgressModalOpen(false);
    const destination = submittedLetterId ? `/letters/${submittedLetterId}` : "/letters";
    navigate(destination);
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
      {/* Post-submit free-preview progress modal — 90-second fake timer that
          masks the background pipeline and communicates the 24h email gate.
          Rendered as a sibling so it overlays the whole intake flow. */}
      <LetterSubmitProgressModal
        open={progressModalOpen}
        letterId={submittedLetterId}
        onClose={handleProgressModalClose}
      />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Prefill Banner — from Document Analyzer */}
        {showPrefillBanner && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-900">
                  Pre-filled from your document analysis
                </p>
                <p className="text-xs text-green-700">
                  We've populated the form with details detected from your uploaded document. Review and edit as needed.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPrefillBanner(false)}
              className="shrink-0 border-green-300 text-green-700 hover:bg-green-100"
              data-testid="button-dismiss-prefill-banner"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Dismiss
            </Button>
          </div>
        )}

        {/* Template Pre-fill Banner */}
        {showTemplateBanner && (cachedTemplate || templateData) && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-indigo-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-indigo-900" data-testid="text-template-banner-title">
                  Pre-filled from template: {cachedTemplate?.templateTitle ?? templateData?.title ?? "Template"}
                </p>
                <p className="text-xs text-indigo-700">
                  We've populated the form with scenario data. Review each step and customize as needed.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplateBanner(false)}
              className="shrink-0 border-indigo-300 text-indigo-700 hover:bg-indigo-100"
              data-testid="button-dismiss-template-banner"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Dismiss
            </Button>
          </div>
        )}

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
          <CardContent className="space-y-4 animate-dashboard-fade-up" key={step}>
            {step === 1 && (
              <Step1LetterType
                form={form}
                stepErrors={stepErrors}
                update={update}
                intakeTemplatesForType={intakeFormTemplatesForType}
                activeIntakeFormTemplateId={activeIntakeFormTemplateId}
                onSelectIntakeTemplate={setActiveIntakeFormTemplateId}
              />
            )}
            {step === 2 && (
              <Step2Jurisdiction
                form={form}
                stepErrors={stepErrors}
                update={update}
              />
            )}
            {step === 3 && (
              <Step3Parties
                form={form}
                stepErrors={stepErrors}
                update={update}
              />
            )}
            {step === 4 && (
              <Step4Details
                form={form}
                stepErrors={stepErrors}
                update={update}
                updateSituationField={updateSituationField}
                enabledSituationFields={intakeFormTemplateFieldConfig?.enabledDefaultFields}
                customSituationFields={intakeFormTemplateFieldConfig?.customFields}
              />
            )}
            {step === 5 && (
              <Step5Outcome
                form={form}
                stepErrors={stepErrors}
                update={update}
              />
            )}
            {step === 6 && (
              <Step6Exhibits
                exhibits={exhibits}
                setExhibits={setExhibits}
                form={form}
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => { setStepErrors({}); setStep(s => s - 1); }}
            disabled={step === 1}
            className="bg-background"
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
    </AppLayout>
  );
}
