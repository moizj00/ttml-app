/**
 * FreePreviewUpsellBanner — floating bottom-right invitation, NOT a modal.
 *
 * Replaces the previous `FreePreviewConversionPopup` Dialog which:
 *   - Blocked the letter content the subscriber just got excited to see
 *   - Chained a second modal (letterhead pitch) immediately after the first
 *   - Re-popped every 5 minutes after dismissal
 *
 * This component is non-blocking, sticky in the bottom-right corner, dismissible
 * with one click, and respects dismissal for the rest of the session
 * (sessionStorage). The CTA is the same — route to /pricing — but framed as a
 * suggestion, not a paywall.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Gavel, ArrowRight, X, Sparkles, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

interface FreePreviewUpsellBannerProps {
  open: boolean;
  onDismiss: () => void;
}

export function FreePreviewUpsellBanner({
  open,
  onDismiss,
}: FreePreviewUpsellBannerProps) {
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(false);

  if (!open) return null;

  const handleCta = () => {
    navigate("/pricing");
    onDismiss();
  };

  return (
    <div
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[min(380px,calc(100vw-2rem))] pointer-events-auto"
      role="complementary"
      aria-label="Optional attorney review"
    >
      <div className="relative bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-500">
        {/* Subtle gradient accent */}
        <div
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500"
          aria-hidden="true"
        />

        <div className="p-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-indigo-100">
              <Gavel className="w-5 h-5 text-indigo-600" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Sparkles
                  className="w-3 h-3 text-amber-500"
                  aria-hidden="true"
                />
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                  Optional upgrade
                </p>
              </div>
              <h3 className="text-sm font-bold text-slate-900 leading-snug">
                Want an attorney to review &amp; sign this?
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                Letters reviewed by a licensed attorney get{" "}
                <span className="font-semibold text-slate-700">
                  3&times; more responses.
                </span>
              </p>

              {expanded && (
                <ul className="mt-3 space-y-1.5 text-xs text-slate-600 animate-in fade-in duration-300">
                  {[
                    "Licensed attorney signature",
                    "Substantive legal edits",
                    "Professional law-firm letterhead",
                  ].map(item => (
                    <li key={item} className="flex items-center gap-1.5">
                      <CheckCircle2
                        className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0"
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={onDismiss}
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-50 -mr-1 -mt-1 p-1 rounded-md transition-colors"
              aria-label="Dismiss"
              data-testid="button-dismiss-upsell-banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3.5 flex gap-2">
            <Button
              size="sm"
              onClick={handleCta}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-semibold rounded-lg h-9 shadow-sm group"
              data-testid="button-cta-upsell-banner"
            >
              See attorney plans
              <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </Button>
            {!expanded ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExpanded(true)}
                className="text-xs text-slate-500 hover:bg-slate-50 h-9 px-3"
                data-testid="button-expand-upsell-banner"
              >
                What's in it?
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                className="text-xs text-slate-500 hover:bg-slate-50 h-9 px-3"
              >
                Not now
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
