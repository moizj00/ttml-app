import { useEffect, useRef, useState } from "react";
import { FileText, Search, CheckCircle2, Check } from "lucide-react";

const steps = [
  {
    step: "01",
    icon: FileText,
    title: "Describe Your Situation",
    desc: "Complete a guided intake form with the facts of your case. No legal expertise required.",
  },
  {
    step: "02",
    icon: Search,
    title: "Attorneys Research & Draft",
    desc: "Our legal team researches applicable statutes for your jurisdiction and drafts your letter.",
  },
  {
    step: "03",
    icon: CheckCircle2,
    title: "Attorney Reviews & Approves",
    desc: "A licensed attorney makes final edits and signs off before delivery. Human oversight guaranteed.",
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

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [inView, setInView] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold: 0.15 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setInView(true);
      setProgress(1);
      return;
    }

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
        const start = windowH * 0.75;
        const end = windowH * 0.1;
        const raw = (start - rect.top) / (start - end);
        setProgress(Math.max(0, Math.min(1, raw)));
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [reducedMotion]);

  const stepThresholds = [0.15, 0.45, 0.72];
  const activeSteps = stepThresholds.map((t) => progress >= t);
  const allComplete = progress >= 0.92;

  const lineProgress = Math.min(1, progress * 1.15);

  const skip = reducedMotion;

  return (
    <section
      ref={sectionRef}
      className="py-16 sm:py-20 md:py-28 px-4 sm:px-6 lg:px-12 bg-gradient-to-b from-slate-50 to-white border-y border-slate-100 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto">
        <div
          className="text-center max-w-3xl mx-auto mb-16 md:mb-24"
          style={skip ? {} : {
            opacity: inView ? 1 : 0,
            transform: inView ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 560ms cubic-bezier(0.16, 1, 0.3, 1), transform 560ms cubic-bezier(0.16, 1, 0.3, 1)",
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

        <div className="hidden md:block relative mb-6" style={{ height: 4 }}>
          <div className="absolute inset-0 bg-slate-200 rounded-full" />
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
            style={{
              width: `${lineProgress * 100}%`,
              transition: skip ? "none" : "width 80ms linear",
              boxShadow: lineProgress > 0.05 ? "0 0 12px rgba(37, 99, 235, 0.4)" : "none",
            }}
          />
          {stepThresholds.map((t, i) => {
            const pct = (t / 1) * 100;
            const reached = progress >= t;
            return (
              <div
                key={i}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                style={{ left: `${i === 0 ? 16.66 : i === 1 ? 50 : 83.33}%` }}
              >
                <div
                  className="w-4 h-4 rounded-full border-[3px] transition-all duration-500"
                  style={{
                    borderColor: reached ? "#2563eb" : "#cbd5e1",
                    backgroundColor: reached ? "#2563eb" : "#f8fafc",
                    transform: reached ? "scale(1.3)" : "scale(1)",
                    boxShadow: reached ? "0 0 0 4px rgba(37, 99, 235, 0.15)" : "none",
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="grid md:grid-cols-3 gap-8 md:gap-6 lg:gap-10 relative">
          {steps.map((item, i) => {
            const isActive = activeSteps[i];
            const cardDelay = skip ? 0 : 150 + i * 120;
            const cardVisible = skip || (inView && progress > 0.02);

            return (
              <div
                key={i}
                className="flex flex-col items-center text-center group"
                data-testid={`step-${item.step}`}
                style={skip ? {} : {
                  opacity: cardVisible ? 1 : 0,
                  transform: cardVisible ? "translateY(0)" : "translateY(32px)",
                  transition: `opacity 480ms cubic-bezier(0.16, 1, 0.3, 1) ${cardDelay}ms, transform 480ms cubic-bezier(0.16, 1, 0.3, 1) ${cardDelay}ms`,
                }}
              >
                <div className="relative mb-8">
                  <div
                    className="absolute inset-0 rounded-full transition-all"
                    style={{
                      transform: isActive ? "scale(1.35)" : "scale(1)",
                      opacity: isActive ? 1 : 0,
                      background: "radial-gradient(circle, rgba(37, 99, 235, 0.08) 0%, transparent 70%)",
                      transition: "transform 600ms cubic-bezier(0.16, 1, 0.3, 1), opacity 400ms ease",
                    }}
                  />

                  <div
                    className="w-[88px] h-[88px] rounded-full flex items-center justify-center relative border-[3px] bg-white"
                    style={{
                      borderColor: isActive ? "#2563eb" : "#e2e8f0",
                      boxShadow: isActive
                        ? "0 8px 32px rgba(37, 99, 235, 0.18), 0 0 0 6px rgba(37, 99, 235, 0.06)"
                        : "0 4px 16px rgba(0, 0, 0, 0.06)",
                      transform: isActive ? "scale(1.05)" : "scale(1)",
                      transition: "border-color 400ms ease, box-shadow 500ms cubic-bezier(0.16, 1, 0.3, 1), transform 500ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    <item.icon
                      className="w-9 h-9"
                      style={{
                        color: isActive ? "#2563eb" : "#94a3b8",
                        transform: isActive ? "scale(1)" : "scale(0.9)",
                        transition: "color 400ms ease, transform 400ms cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                      strokeWidth={isActive ? 2.2 : 1.8}
                    />

                    <div
                      className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{
                        backgroundColor: isActive ? "#1e40af" : "#64748b",
                        transform: isActive ? "scale(1.1)" : "scale(1)",
                        transition: "background-color 400ms ease, transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                    >
                      {item.step}
                    </div>

                    {i === 2 && allComplete && (
                      <div
                        className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center"
                        data-testid="completion-tick"
                        style={{
                          animation: skip ? "none" : "scale-in 420ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
                        }}
                      >
                        <Check className="w-4 h-4" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </div>

                <h3
                  className="text-lg font-bold mb-2 text-slate-900"
                  style={{
                    opacity: isActive || skip ? 1 : 0.55,
                    transition: "opacity 400ms ease",
                  }}
                >
                  {item.title}
                </h3>
                <p
                  className="text-slate-500 leading-relaxed max-w-[280px] text-[15px]"
                  style={{
                    opacity: isActive || skip ? 1 : 0.4,
                    transform: isActive || skip ? "translateY(0)" : "translateY(4px)",
                    transition: "opacity 400ms ease 80ms, transform 400ms cubic-bezier(0.16, 1, 0.3, 1) 80ms",
                  }}
                >
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>

        <div className="md:hidden mt-4">
          <div className="flex justify-center gap-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-full transition-all duration-500"
                style={{
                  width: activeSteps[i] ? 32 : 12,
                  backgroundColor: activeSteps[i] ? "#2563eb" : "#cbd5e1",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
