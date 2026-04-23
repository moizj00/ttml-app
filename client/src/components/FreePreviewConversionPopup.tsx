import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gavel, ArrowRight, X, Building, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

interface FreePreviewConversionPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FreePreviewConversionPopup({
  open,
  onOpenChange,
}: FreePreviewConversionPopupProps) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // When step 1 is closed, show step 2
  const handleCloseStep1 = () => {
    setStep(2);
  };

  // When step 2 is closed, close the whole popup
  const handleCloseStep2 = () => {
    onOpenChange(false);
    // Step is reset via useEffect when open becomes false
  };

  const handleSubscribe = () => {
    navigate("/pricing");
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) {
      // Re-initialize to step 1 for next time it opens
      const resetTimeout = setTimeout(() => setStep(1), 300);
      return () => clearTimeout(resetTimeout);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={val => {
        if (!val) {
          if (step === 1) handleCloseStep1();
          else handleCloseStep2();
        }
      }}
    >
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden border-none shadow-2xl">
        {step === 1 ? (
          <div className="relative">
            {/* Decorative background */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-700 h-32" />

            <div className="relative pt-8 px-6 pb-6">
              <div className="bg-white rounded-2xl p-6 shadow-xl border border-blue-100">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 mx-auto border-4 border-white shadow-inner">
                  <Gavel className="w-8 h-8 text-blue-600" />
                </div>

                <h2 className="text-xl font-bold text-center text-slate-900 mb-2">
                  Submit for Professional Review?
                </h2>
                <p className="text-slate-600 text-center text-sm mb-6 leading-relaxed">
                  Your draft is ready! Would you like a licensed attorney to
                  review, edit, and sign it for you?
                </p>

                <div className="space-y-3 mb-6">
                  {[
                    "Licensed attorney signature",
                    "Professional legal formatting",
                    "Substantive edits included",
                  ].map(text => (
                    <div
                      key={text}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3">
                  <Button
                    onClick={handleSubscribe}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 rounded-xl text-base group"
                  >
                    Yes, Review My Letter
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleCloseStep1}
                    className="w-full text-slate-500 font-medium hover:bg-slate-50"
                  >
                    I'll review it myself first
                  </Button>
                </div>
              </div>
            </div>

            <button
              onClick={handleCloseStep1}
              className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="relative p-8">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-6 border border-amber-100 shadow-sm">
              <Building className="w-8 h-8 text-amber-600" />
            </div>

            <h2 className="text-2xl font-extrabold text-slate-900 mb-2">
              Send it on our letterhead?
            </h2>
            <p className="text-slate-600 mb-8 leading-relaxed">
              Letters sent on{" "}
              <span className="font-bold text-slate-900">
                Talk to My Lawyer
              </span>{" "}
              letterhead get{" "}
              <span className="text-blue-600 font-bold">3x more responses</span>
              . Don't let your draft get ignored.
            </p>

            <div className="grid gap-3">
              <Button
                onClick={handleSubscribe}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold h-12 rounded-xl text-base"
              >
                Get Letterhead Version
              </Button>
              <Button
                variant="outline"
                onClick={handleCloseStep2}
                className="w-full border-slate-200 text-slate-500 font-medium h-12 rounded-xl hover:bg-slate-50"
              >
                No thanks, just the draft
              </Button>
            </div>

            <button
              onClick={handleCloseStep2}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
