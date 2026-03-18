import { useState, useEffect, useCallback } from "react";
import { X, Gift, Clock } from "lucide-react";

const FIRST_VISIT_KEY = "ttml_first_visit_popup_seen";
const COUNTDOWN_SECONDS = 5 * 60;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function FirstVisitPopup() {
  const [visible, setVisible] = useState(false);
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_SECONDS);

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

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      data-testid="first-visit-popup-overlay"
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        data-testid="first-visit-popup"
      >
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors z-10"
          aria-label="Close"
          data-testid="first-visit-popup-close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-8 text-center text-white">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Gift className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2" data-testid="first-visit-popup-title">
            Congratulations!
          </h2>
          <p className="text-blue-100 text-sm">
            As a first time client
          </p>
        </div>

        <div className="px-6 py-6 text-center">
          <p
            className="text-lg font-semibold text-slate-800 mb-4"
            data-testid="first-visit-popup-message"
          >
            View your first letter for free
          </p>

          <div className="inline-flex items-center gap-2 bg-slate-100 rounded-lg px-4 py-2 mb-6">
            <Clock className="w-4 h-4 text-slate-500" />
            <span
              className="text-lg font-mono font-bold text-slate-800"
              data-testid="first-visit-popup-timer"
            >
              {formatTime(timeLeft)}
            </span>
            <span className="text-xs text-slate-500">remaining</span>
          </div>

          <button
            onClick={dismiss}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
            data-testid="first-visit-popup-cta"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
