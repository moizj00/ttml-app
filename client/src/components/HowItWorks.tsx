import { useEffect, useRef, useState, useCallback } from "react";
import { FileText, Search, CheckCircle2, Check } from "lucide-react";

const steps = [
  {
    step: "01",
    icon: FileText,
    title: "Describe Your Situation",
    desc: "Complete a guided intake form with the facts of your case. No legal expertise required.",
    burstLabel: "Form submitted!",
  },
  {
    step: "02",
    icon: Search,
    title: "Attorneys Research & Draft",
    desc: "Our legal team researches applicable statutes for your jurisdiction and drafts your letter.",
    burstLabel: "Drafted!",
  },
  {
    step: "03",
    icon: CheckCircle2,
    title: "Attorney Reviews & Approves",
    desc: "A licensed attorney makes final edits and signs off before delivery. Human oversight guaranteed.",
    burstLabel: "Approved!",
  },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

const ORBIT_RADIUS = 52;
const ORBIT_CIRCUMFERENCE = 2 * Math.PI * ORBIT_RADIUS;
const STEP_THRESHOLDS = [0.15, 0.45, 0.72];

function getOrbitProgress(progress: number, stepIndex: number): number {
  const threshold = STEP_THRESHOLDS[stepIndex];
  const orbitStart = Math.max(0, threshold - 0.18);
  const orbitEnd = threshold;
  if (orbitStart >= orbitEnd) return progress >= orbitEnd ? 1 : 0;
  if (progress <= orbitStart) return 0;
  if (progress >= orbitEnd) return 1;
  return (progress - orbitStart) / (orbitEnd - orbitStart);
}

function BurstLabel({ text, index, onDismiss }: { text: string; index: number; onDismiss: (i: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(index), 1400);
    return () => clearTimeout(timer);
  }, [index, onDismiss]);

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap z-10"
      style={{
        bottom: "100%",
        marginBottom: 12,
        animation: "burst-pop-fade 1400ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
      }}
    >
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-semibold shadow-lg shadow-blue-500/25">
        <Check className="w-3 h-3" strokeWidth={3} />
        {text}
      </span>
    </div>
  );
}

function Connector({ progress, skip }: { progress: number; skip: boolean }) {
  const filled = Math.min(1, progress * 1.15);
  return (
    <div className="hidden md:block relative mb-6" style={{ height: 4 }}>
      <div className="absolute inset-0 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${filled * 100}%`,
            background: "linear-gradient(90deg, #3b82f6 0%, #2563eb 60%, #1d4ed8 100%)",
            transition: skip ? "none" : "width 80ms linear",
            boxShadow: filled > 0.05 ? "0 0 16px rgba(37, 99, 235, 0.35), 0 0 4px rgba(37, 99, 235, 0.5)" : "none",
          }}
        />
      </div>
      {STEP_THRESHOLDS.map((t, i) => {
        const reached = progress >= t;
        return (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
            style={{ left: `${i === 0 ? 16.66 : i === 1 ? 50 : 83.33}%` }}
          >
            {reached && !skip && (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  animation: "dot-ping 600ms cubic-bezier(0, 0, 0.2, 1) forwards",
                  backgroundColor: "#3b82f6",
                }}
              />
            )}
            <div
              className="w-4 h-4 rounded-full border-[3px] relative z-10"
              style={{
                borderColor: reached ? "#2563eb" : "#cbd5e1",
                backgroundColor: reached ? "#2563eb" : "#f8fafc",
                transform: reached ? "scale(1.3)" : "scale(1)",
                boxShadow: reached ? "0 0 0 4px rgba(37, 99, 235, 0.15)" : "none",
                transition: "all 500ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [inView, setInView] = useState(false);
  const reducedMotion = useReducedMotion();
  const [burstVisible, setBurstVisible] = useState<boolean[]>(() => steps.map(() => false));
  const prevActiveRef = useRef<boolean[]>(steps.map(() => false));

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.15 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) { setInView(true); setProgress(1); return; }
    const section = sectionRef.current;
    if (!section) return;
    let ticking = false;
    let rafId: number;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(() => {
        ticking = false;
        const rect = section.getBoundingClientRect();
        const windowH = window.innerHeight;
        const start = windowH * 0.85;
        const end = -windowH * 0.75;
        const raw = (start - rect.top) / (start - end);
        setProgress(Math.max(0, Math.min(1, raw)));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(rafId); };
  }, [reducedMotion]);

  const activeSteps = STEP_THRESHOLDS.map((t) => progress >= t);
  const allComplete = progress >= 0.92;

  useEffect(() => {
    if (reducedMotion) return;
    const prev = prevActiveRef.current;
    const activated: number[] = [];
    for (let i = 0; i < steps.length; i++) {
      if (activeSteps[i] && !prev[i]) activated.push(i);
    }
    prevActiveRef.current = [...activeSteps];
    if (activated.length > 0) {
      setBurstVisible((prev) => {
        const next = [...prev];
        for (const idx of activated) next[idx] = true;
        return next;
      });
    }
  }, [activeSteps[0], activeSteps[1], activeSteps[2], reducedMotion]);

  const dismissBurst = useCallback((index: number) => {
    setBurstVisible((prev) => { const next = [...prev]; next[index] = false; return next; });
  }, []);

  const skip = reducedMotion;

  return (
    <section
      ref={sectionRef}
      className="py-16 sm:py-20 md:py-28 px-4 sm:px-6 lg:px-12 bg-gradient-to-b from-slate-50 to-white border-y border-slate-100 overflow-hidden"
    >
      <style>{`
        @keyframes burst-pop-fade {
          0% { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.7); }
          20% { opacity: 1; transform: translateX(-50%) translateY(-6px) scale(1.05); }
          35% { transform: translateX(-50%) translateY(-10px) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-28px) scale(0.95); }
        }
        @keyframes tick-entrance {
          0% { transform: scale(0) rotate(-45deg); }
          50% { transform: scale(1.2) rotate(5deg); }
          70% { transform: scale(0.9) rotate(-2deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes tick-glow-ring {
          0% { transform: scale(0.5); opacity: 0.6; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes dot-ping {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        @keyframes icon-settle {
          0% { transform: scale(0.6) rotate(-8deg); opacity: 0; }
          60% { transform: scale(1.08) rotate(2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes card-lift {
          0% { transform: translateY(40px) scale(0.97); opacity: 0; }
          60% { transform: translateY(-4px) scale(1.01); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes shimmer-line {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes badge-pop {
          0% { transform: scale(0) rotate(-20deg); }
          60% { transform: scale(1.15) rotate(5deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes subtle-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      <div className="max-w-6xl mx-auto">
        <div
          className="text-center max-w-3xl mx-auto mb-16 md:mb-24"
          style={skip ? {} : {
            opacity: inView ? 1 : 0,
            transform: inView ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 600ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <p
            className="text-sm font-semibold tracking-widest uppercase text-blue-600 mb-4"
            style={skip ? {} : {
              opacity: inView ? 1 : 0,
              transform: inView ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 420ms cubic-bezier(0.16, 1, 0.3, 1) 100ms, transform 420ms cubic-bezier(0.16, 1, 0.3, 1) 100ms",
            }}
          >
            How It Works
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-slate-900">
            Three Steps to a Professional Legal Letter
          </h2>
          <p className="text-lg text-slate-500">
            From intake to attorney-approved PDF in as little as 24 hours
          </p>
        </div>

        <Connector progress={progress} skip={skip} />

        <div className="grid md:grid-cols-3 gap-8 md:gap-6 lg:gap-10 relative">
          {steps.map((item, i) => {
            const isActive = activeSteps[i];
            const cardDelay = skip ? 0 : 100 + i * 140;
            const cardVisible = skip || (inView && progress > 0.02);
            const orbitProg = skip ? 0 : getOrbitProgress(progress, i);
            const dashOffset = ORBIT_CIRCUMFERENCE * (1 - orbitProg);

            return (
              <div
                key={i}
                className="flex flex-col items-center text-center group"
                data-testid={`step-${item.step}`}
                style={skip ? {} : {
                  animation: cardVisible ? `card-lift 700ms cubic-bezier(0.16, 1, 0.3, 1) ${cardDelay}ms both` : "none",
                  opacity: cardVisible ? undefined : 0,
                }}
              >
                <div
                  className="relative mb-8"
                  style={!skip && isActive ? {
                    animation: "subtle-float 4s ease-in-out infinite",
                    animationDelay: `${i * 200}ms`,
                  } : {}}
                >
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      transform: isActive ? "scale(1.5)" : "scale(0.8)",
                      opacity: isActive ? 1 : 0,
                      background: "radial-gradient(circle, rgba(37, 99, 235, 0.1) 0%, rgba(37, 99, 235, 0.03) 50%, transparent 70%)",
                      transition: "transform 800ms cubic-bezier(0.16, 1, 0.3, 1), opacity 500ms ease",
                    }}
                  />

                  {!skip && (
                    <svg
                      className="absolute hidden md:block pointer-events-none"
                      width="120"
                      height="120"
                      style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
                    >
                      <circle
                        cx="60" cy="60" r={ORBIT_RADIUS}
                        fill="none" stroke="#e2e8f0" strokeWidth="1.5"
                        opacity={orbitProg > 0 ? 0.5 : 0}
                        style={{ transition: "opacity 300ms ease" }}
                      />
                      <circle
                        cx="60" cy="60" r={ORBIT_RADIUS}
                        fill="none" stroke={`url(#orbit-grad-${i})`} strokeWidth="2.5" strokeLinecap="round"
                        strokeDasharray={ORBIT_CIRCUMFERENCE}
                        strokeDashoffset={dashOffset}
                        opacity={orbitProg > 0 ? 0.5 + orbitProg * 0.5 : 0}
                        style={{ transformOrigin: "center", transform: "rotate(-90deg)", transition: "opacity 200ms ease" }}
                      />
                      <defs>
                        <linearGradient id={`orbit-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#1d4ed8" />
                        </linearGradient>
                      </defs>
                    </svg>
                  )}

                  <div
                    className="w-[88px] h-[88px] rounded-full flex items-center justify-center relative border-[3px] bg-white"
                    style={{
                      borderColor: isActive ? "#2563eb" : "#e2e8f0",
                      boxShadow: isActive
                        ? "0 8px 32px rgba(37, 99, 235, 0.18), 0 0 0 6px rgba(37, 99, 235, 0.06)"
                        : "0 4px 16px rgba(0, 0, 0, 0.06)",
                      transform: isActive ? "scale(1.05)" : "scale(1)",
                      transition: "border-color 400ms ease, box-shadow 600ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    <div
                      style={!skip && isActive ? {
                        animation: `icon-settle 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                      } : {
                        opacity: isActive || skip ? 1 : 0.6,
                        transform: isActive || skip ? "scale(1)" : "scale(0.85)",
                        transition: "opacity 400ms ease, transform 400ms ease",
                      }}
                    >
                      <item.icon
                        className="w-9 h-9"
                        style={{ color: isActive ? "#2563eb" : "#94a3b8", transition: "color 400ms ease" }}
                        strokeWidth={isActive ? 2.2 : 1.8}
                      />
                    </div>

                    <div
                      className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md"
                      style={!skip && isActive ? {
                        backgroundColor: "#1e40af",
                        animation: `badge-pop 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                      } : {
                        backgroundColor: isActive ? "#1e40af" : "#64748b",
                        transform: isActive ? "scale(1.1)" : "scale(1)",
                        transition: "background-color 400ms ease, transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                    >
                      {item.step}
                    </div>

                    {i === 2 && allComplete && (
                      <div className="absolute -bottom-1.5 -right-1.5" style={{ width: 28, height: 28 }}>
                        <div
                          className="absolute inset-0 rounded-full bg-emerald-400"
                          style={{ animation: skip ? "none" : "tick-glow-ring 800ms cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
                        />
                        <div
                          className="relative w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30"
                          data-testid="completion-tick"
                          style={{ animation: skip ? "none" : "tick-entrance 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
                        >
                          <Check className="w-4 h-4" strokeWidth={3} />
                        </div>
                      </div>
                    )}
                  </div>

                  {burstVisible[i] && (
                    <BurstLabel text={item.burstLabel} index={i} onDismiss={dismissBurst} />
                  )}
                </div>

                <h3
                  className="text-lg font-bold mb-2 text-slate-900"
                  style={{
                    opacity: isActive || skip ? 1 : 0.65,
                    transform: isActive || skip ? "translateY(0)" : "translateY(6px)",
                    transition: "opacity 500ms ease, transform 500ms cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  {item.title}
                </h3>
                <p
                  className="text-slate-500 leading-relaxed max-w-[280px] text-[15px]"
                  style={{
                    opacity: isActive || skip ? 1 : 0.5,
                    transform: isActive || skip ? "translateY(0)" : "translateY(8px)",
                    transition: "opacity 500ms ease 100ms, transform 500ms cubic-bezier(0.16, 1, 0.3, 1) 100ms",
                  }}
                >
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>

        <div className="sr-only" aria-live="polite" role="status">
          {activeSteps[0] && "Step 1 complete: Describe Your Situation. "}
          {activeSteps[1] && "Step 2 complete: Attorneys Research and Draft. "}
          {activeSteps[2] && "Step 3 complete: Attorney Reviews and Approves. "}
          {allComplete && "All steps complete."}
        </div>

        <div className="md:hidden mt-4">
          <div className="flex justify-center gap-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className="h-1.5 rounded-full"
                style={{
                  width: activeSteps[i] ? 32 : 12,
                  backgroundColor: activeSteps[i] ? "#2563eb" : "#cbd5e1",
                  boxShadow: activeSteps[i] ? "0 0 8px rgba(37, 99, 235, 0.3)" : "none",
                  transition: "all 500ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
