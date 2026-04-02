import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { X, Gift, Clock } from "lucide-react";

const FIRST_VISIT_KEY = "ttml_first_visit_popup_seen";
const COUNTDOWN_SECONDS = 5 * 60;

function formatTime(seconds: number): { minutes: string; secs: string } {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return { minutes: m.toString(), secs: s.toString().padStart(2, "0") };
}

export default function FirstVisitPopup() {
  const [visible, setVisible] = useState(false);
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS);
  const [, navigate] = useLocation();

  useEffect(() => {
    const seen = localStorage.getItem(FIRST_VISIT_KEY);
    if (seen) return;

    const timer = setTimeout(() => {
      setVisible(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, timeLeft]);

  const dismiss = useCallback(() => {
    localStorage.setItem(FIRST_VISIT_KEY, "true");
    setVisible(false);
  }, []);

  const handleGetStarted = useCallback(() => {
    localStorage.setItem(FIRST_VISIT_KEY, "true");
    setVisible(false);
    navigate("/login");
  }, [navigate]);

  if (!visible) return null;

  const { minutes, secs } = formatTime(timeLeft);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-popup-overlay"
      data-testid="first-visit-popup-overlay"
    >
      <div
        className="relative w-full max-w-sm rounded-3xl shadow-[0_25px_60px_-12px_rgba(0,0,0,0.35)] overflow-hidden animate-popup-card border border-white/20"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(245,245,255,0.9) 100%)" }}
        data-testid="first-visit-popup"
      >
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-black/5 text-slate-400 hover:bg-black/10 hover:text-slate-600 transition-all duration-200 z-10"
          aria-label="Close"
          data-testid="first-visit-popup-close"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="relative px-6 pt-8 pb-6 text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-blue-700 to-violet-800" />
          <div className="absolute inset-0 animate-popup-shimmer" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 animate-popup-icon-glow border border-white/20">
              <Gift className="w-8 h-8 text-white drop-shadow-sm" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mb-1" data-testid="first-visit-popup-title">
              California-Focused Drafting
            </h2>
            <p className="text-blue-200 text-sm font-medium tracking-wide uppercase">
              Built for speed
            </p>
          </div>
        </div>

        <div className="px-6 py-5 text-center">
          <p
            className="text-lg font-semibold text-slate-800 mb-5 tracking-tight leading-snug"
            data-testid="first-visit-popup-message"
          >
            Generate your first California-focused draft for free
          </p>

          <div className="flex items-center justify-center gap-2.5 mb-6">
            <Clock className="w-4 h-4 text-indigo-400 animate-popup-pulse" />
            <div
              className="flex items-center gap-1"
              data-testid="first-visit-popup-timer"
            >
              <span className="inline-flex items-center justify-center min-w-[2rem] h-9 bg-slate-900 text-white font-mono font-bold text-lg rounded-lg px-2 shadow-sm">
                {minutes}
              </span>
              <span className="text-slate-400 font-bold text-lg leading-none">:</span>
              <span className="inline-flex items-center justify-center min-w-[2rem] h-9 bg-slate-900 text-white font-mono font-bold text-lg rounded-lg px-2 shadow-sm">
                {secs}
              </span>
            </div>
            <span className="text-xs text-slate-400 font-medium">remaining</span>
          </div>

          <button
            onClick={handleGetStarted}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm tracking-wide transition-all duration-200 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 hover:shadow-[0_4px_20px_rgba(79,70,229,0.4)] active:scale-[0.98]"
            data-testid="first-visit-popup-cta"
          >
            Generate your first draft
          </button>

          <p className="text-[11px] text-slate-400 mt-3">
            No credit card required — not legal advice, for drafting purposes only
          </p>
        </div>
      </div>
    </div>
  );
}
