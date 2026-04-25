import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
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
import { AlertCircle, Scale } from "lucide-react";
import { Link } from "wouter";
import { Step1LetterType } from "./intake-steps/Step1LetterType";
import { Step2Jurisdiction } from "./intake-steps/Step2Jurisdiction";
import { Step3Parties } from "./intake-steps/Step3Parties";
import { Step4Details } from "./intake-steps/Step4Details";
import { Step5Outcome } from "./intake-steps/Step5Outcome";
import { Step6Exhibits } from "./intake-steps/Step6Exhibits";
import { LetterSubmitProgressModal } from "@/components/LetterSubmitProgressModal";
import { useSubmitLetterForm } from "./useSubmitLetterForm";

const STEPS = [
  { id: 1, label: "Letter Type", icon: <FileText className="w-4 h-4" /> },
  { id: 2, label: "Jurisdiction", icon: <MapPin className="w-4 h-4" /> },
  { id: 3, label: "Parties", icon: <Users className="w-4 h-4" /> },
  { id: 4, label: "Details", icon: <AlignLeft className="w-4 h-4" /> },
  { id: 5, label: "Outcome", icon: <Target className="w-4 h-4" /> },
  { id: 6, label: "Exhibits", icon: <Paperclip className="w-4 h-4" /> },
];

export default function SubmitLetter() {
  const [, navigate] = useLocation();
  const {
    step,
    setStep,
    form,
    exhibits,
    setExhibits,
    isSubmitting,
    showDraftBanner,
    showPrefillBanner,
    setShowPrefillBanner,
    showTemplateBanner,
    setShowTemplateBanner,
    stepErrors,
    progressModalOpen,
    setProgressModalOpen,
    submittedLetterId,
    resumeDraft,
    discardDraft,
    update,
    updateSituationField,
    validateStep,
    handleSubmit,
    intakeFormTemplatesForType,
    activeIntakeFormTemplateId,
    setActiveIntakeFormTemplateId,
    intakeFormTemplateFieldConfig,
    cachedTemplate,
    templateData,
  } = useSubmitLetterForm();

  const { data: canSubmitData, isLoading: checkingSubscription } =
    trpc.billing.checkCanSubmit.useQuery();

  const handleProgressModalClose = () => {
    setProgressModalOpen(false);
    navigate("/letters");
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
      {/* Post-submit progress modal: quiet 24h draft-preview confirmation.
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
                  We've populated the form with details detected from your
                  uploaded document. Review and edit as needed.
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
                <p
                  className="text-sm font-medium text-indigo-900"
                  data-testid="text-template-banner-title"
                >
                  Pre-filled from template:{" "}
                  {cachedTemplate?.templateTitle ??
                    templateData?.title ??
                    "Template"}
                </p>
                <p className="text-xs text-indigo-700">
                  We've populated the form with scenario data. Review each step
                  and customize as needed.
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
          <CardContent
            className="space-y-4 animate-dashboard-fade-up"
            key={step}
          >
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
                enabledSituationFields={
                  intakeFormTemplateFieldConfig?.enabledDefaultFields
                }
                customSituationFields={
                  intakeFormTemplateFieldConfig?.customFields
                }
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
        <Button
          variant="outline"
          onClick={() => {
            setStep(s => s - 1);
          }}
          disabled={step === 1}
          className="bg-background"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        {step < 6 ? (
          <Button
            onClick={() => {
              if (validateStep(step)) {
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
    </AppLayout>
  );
}
