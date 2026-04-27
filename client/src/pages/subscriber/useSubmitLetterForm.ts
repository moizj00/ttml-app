import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { LETTER_TYPE_CONFIG, ANALYZE_PREFILL_KEY } from "../../../../shared/types";
import type {
    AnalysisPrefill,
    IntakeFormTemplateRecord,
    IntakeFieldConfig,
    SituationFieldDef
} from "../../../../shared/types";
import type {
    FormData,
    ExhibitRow,
    PendingFile
} from "./intake-steps/types";

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
const EXHIBIT_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

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

export function useSubmitLetterForm() {
    const { user } = useAuth();
    const search = useSearch();
    const [, navigate] = useLocation();

    const DRAFT_KEY = useMemo(() => {
        const userId = user?.id ?? "anon";
        const tabId = getTabSessionId();
        return `${DRAFT_KEY_PREFIX}_${userId}_${tabId}`;
    }, [user?.id]);

    const [step, setStep] = useState(1);
    const [form, setForm] = useState<FormData>(() => {
        const { prefill, found } = readAndClearPrefill();
        if (found && prefill) {
            return buildInitialFormFromPrefill(prefill);
        }
        const params = new URLSearchParams(search);
        const typeParam = params.get("type");
        if (typeParam && LETTER_TYPE_CONFIG[typeParam]) {
            return { ...INITIAL, letterType: typeParam };
        }
        return INITIAL;
    });

    const [exhibits, setExhibits] = useState<ExhibitRow[]>([
        { id: "exhibit-0", description: "", file: null },
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDraftBanner, setShowDraftBanner] = useState(false);
    const [showPrefillBanner, setShowPrefillBanner] = useState(false);
    const [showTemplateBanner, setShowTemplateBanner] = useState(false);
    const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

    const [progressModalOpen, setProgressModalOpen] = useState(false);
    const [submittedLetterId, setSubmittedLetterId] = useState<number | undefined>(undefined);

    const prefillApplied = useRef(false);
    const prefillFromAnalyzer = useRef(false);
    const templatePrefillApplied = useRef(false);
    const analyzerEvidenceSummary = useRef<string | null>(null);

    useEffect(() => {
        const { found, prefill } = readAndClearPrefill();
        if (found && prefill) {
            prefillApplied.current = true;
            prefillFromAnalyzer.current = true;
            setShowPrefillBanner(true);
            if (prefill.evidenceSummary) {
                analyzerEvidenceSummary.current = prefill.evidenceSummary;
            }
        }
        const params = new URLSearchParams(search);
        if (params.get("type")) {
            prefillApplied.current = true;
        }
    }, [search]);

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
        } catch { }
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

    useEffect(() => {
        if (prefillApplied.current) return;
        try {
            const saved = localStorage.getItem(DRAFT_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.form && parsed.step) {
                    setShowDraftBanner(true);
                }
            }
        } catch { }
    }, [DRAFT_KEY]);

    useEffect(() => {
        if (form.letterType || form.subject || form.description) {
            try {
                localStorage.setItem(
                    DRAFT_KEY,
                    JSON.stringify({ form, step, savedAt: Date.now() })
                );
            } catch { }
        }
    }, [form, step, DRAFT_KEY]);

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
                toast.success("Draft restored");
            }
        } catch { }
        setShowDraftBanner(false);
    };

    const discardDraft = () => {
        localStorage.removeItem(DRAFT_KEY);
        setShowDraftBanner(false);
        toast.info("Draft discarded");
    };

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

    const submitMutation = trpc.letters.submit.useMutation();
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

    const validateStep = (s: number): boolean => {
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
        setStepErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async () => {
        for (let i = 1; i <= 5; i++) {
            if (!validateStep(i)) {
                setStep(i);
                toast.error("Form incomplete", { description: "Please review the errors." });
                return;
            }
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
                situationFields: Object.keys(form.situationFields).length > 0
                    ? Object.fromEntries(
                        Object.entries(form.situationFields)
                            .filter(([, v]) => v !== "")
                            .map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])
                    )
                    : undefined,
            };

            const result = await submitMutation.mutateAsync({
                letterType: form.letterType as any,
                subject: form.subject,
                jurisdictionState: form.jurisdictionState,
                jurisdictionCity: form.jurisdictionCity || undefined,
                intakeJson,
                ...(activeIntakeFormTemplateId
                    ? { templateId: activeIntakeFormTemplateId }
                    : activeTemplateId
                        ? { templateId: activeTemplateId }
                        : {}),
            });

            const letterId = result.letterId;
            const exhibitFiles = exhibits
                .filter(e => e.file && e.file.status === "ready")
                .map(e => e.file!);

            if (exhibitFiles.length > 0) {
                await Promise.allSettled(
                    exhibitFiles.map((f: PendingFile) =>
                        uploadAttachment.mutateAsync({
                            letterId,
                            fileName: f.name,
                            mimeType: f.mimeType,
                            base64Data: f.base64,
                        })
                    )
                );
            }

            localStorage.removeItem(DRAFT_KEY);
            setSubmittedLetterId(letterId);
            if ((result as any).isFreePreview === true) {
                setProgressModalOpen(true);
            } else {
                navigate(`/letters/${letterId}`);
            }
        } catch (err: any) {
            toast.error("Submission failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        step, setStep,
        form, setForm,
        exhibits, setExhibits,
        isSubmitting,
        showDraftBanner, setShowDraftBanner,
        showPrefillBanner, setShowPrefillBanner,
        showTemplateBanner, setShowTemplateBanner,
        stepErrors,
        progressModalOpen, setProgressModalOpen,
        submittedLetterId,
        resumeDraft, discardDraft,
        update, updateSituationField,
        validateStep,
        handleSubmit,
        intakeFormTemplatesForType,
        activeIntakeFormTemplateId,
        setActiveIntakeFormTemplateId,
        intakeFormTemplateFieldConfig,
        cachedTemplate, templateData,
    };
}
