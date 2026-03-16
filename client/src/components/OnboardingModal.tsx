import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  FileText,
  Search,
  ShieldCheck,
  Download,
  ArrowRight,
  CheckCircle2,
  X,
} from "lucide-react";

const ONBOARDING_KEY = "ttml_onboarding_seen";

const STEPS = [
  {
    icon: FileText,
    color: "bg-blue-100 text-blue-600",
    title: "Submit Your Legal Matter",
    description:
      "Fill out a structured intake form describing your situation — who is involved, what happened, and what outcome you need. No legal jargon required.",
  },
  {
    icon: Search,
    color: "bg-indigo-100 text-indigo-600",
    title: "Legal Research & Drafting",
    description:
      "Our legal team researches applicable laws and statutes for your jurisdiction, then drafts a professional legal letter tailored to your specific situation.",
  },
  {
    icon: ShieldCheck,
    color: "bg-emerald-100 text-emerald-600",
    title: "Attorney Review & Approval",
    description:
      "A licensed attorney reviews the draft, makes any necessary edits, and approves the final letter. No letter is delivered without attorney sign-off."
  },
  {
    icon: Download,
    color: "bg-amber-100 text-amber-600",
    title: "Download Your Letter",
    description:
      "Once approved, download your professionally formatted PDF letter. Use it to assert your legal rights with confidence.",
  },
];

interface OnboardingModalProps {
  /** Force the modal to show (e.g., for new signups) */
  forceShow?: boolean;
  /** Called when the modal is dismissed */
  onDismiss?: () => void;
}

export default function OnboardingModal({ forceShow, onDismiss }: OnboardingModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceShow) {
      setOpen(true);
      return;
    }
    // Show automatically for first-time visitors (not seen before)
    const seen = localStorage.getItem(ONBOARDING_KEY);
    if (!seen) {
      setOpen(true);
    }
  }, [forceShow]);

  const handleDismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setOpen(false);
    onDismiss?.();
  };

  const handleFinish = () => {
    handleDismiss();
    toast.success("Welcome aboard", { description: "Your profile is set up. Submit your first letter to get started." });
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  const currentStep = STEPS[step];
  const StepIcon = currentStep.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-blue-600 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6">
          <DialogHeader className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Step {step + 1} of {STEPS.length}
              </span>
              <button
                onClick={handleDismiss}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${currentStep.color}`}
            >
              <StepIcon className="w-7 h-7" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900 text-left">
              {currentStep.title}
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-sm leading-relaxed text-left mt-2">
              {currentStep.description}
            </DialogDescription>
          </DialogHeader>

          {/* Step dots */}
          <div className="flex items-center gap-2 mb-6">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-2 rounded-full transition-all ${
                  i === step
                    ? "w-6 bg-blue-600"
                    : i < step
                    ? "w-2 bg-blue-300"
                    : "w-2 bg-slate-200"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {isLast ? (
              <Button
                asChild
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleFinish}
              >
                <Link href="/submit">
                  Submit Your First Letter
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Next
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={handleDismiss}
              className="text-slate-500 hover:text-slate-700"
            >
              Skip
            </Button>
          </div>
        </div>

        {/* Trust footer */}
        <div className="px-6 pb-5">
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            {[
              "Licensed attorneys",
              "24–48 hour turnaround",
              "Attorney-approved PDF",
            ].map((item) => (
              <span key={item} className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
