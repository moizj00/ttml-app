import { useEffect, useRef, useState } from "react";
import { FileText, Search, CheckCircle2 } from "lucide-react";

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

const LAST_CARD_DELAY = 150 + 2 * 200;
const SHIMMER_DELAY = LAST_CARD_DELAY + 900;

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
  const [revealed, setRevealed] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const skip = reducedMotion;

  return (
    <section
      ref={sectionRef}
      className="py-20 sm:py-24 md:py-32 px-4 sm:px-6 lg:px-12 bg-gradient-to-b from-slate-50 via-white to-slate-50/50 border-y border-slate-100 overflow-hidden"
    >
      <style>{`
        @keyframes hiw-heading-in {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes hiw-card-in {
          0% { opacity: 0; transform: translateY(60px) scale(0.97); }
          70% { opacity: 1; transform: translateY(-4px) scale(1.015); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes hiw-icon-in {
          0% { opacity: 0; transform: scale(0.4); }
          60% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes hiw-step-number-in {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes hiw-dot-pulse {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
          50% { transform: translate(-50%, -50%) scale(1.6); opacity: 0.4; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        @keyframes hiw-shimmer-sweep {
          0% { transform: translateX(-100%); opacity: 1; }
          100% { transform: translateX(300%); opacity: 0; }
        }
        .hiw-card-inner {
          transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 300ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hiw-card-inner:hover {
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 20px 40px rgba(37, 99, 235, 0.08),
                      0 8px 16px rgba(0, 0, 0, 0.04);
        }
        @media (prefers-reduced-motion: reduce) {
          .hiw-card, .hiw-heading, .hiw-icon-wrap, .hiw-watermark,
          .hiw-line-fill, .hiw-mobile-fill, .hiw-dot, .hiw-shimmer-overlay {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
          .hiw-line-fill { transform: scaleX(1) !important; }
          .hiw-mobile-fill { transform: scaleY(1) !important; }
          .hiw-card-inner { transition: none !important; }
          .hiw-card-inner:hover { transform: none !important; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto">
        <div
          className="text-center max-w-3xl mx-auto mb-16 md:mb-20 hiw-heading"
          style={skip ? {} : {
            animation: revealed ? "hiw-heading-in 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards" : "none",
            opacity: revealed ? undefined : 0,
          }}
        >
          <p className="text-sm font-semibold tracking-widest uppercase text-blue-600 mb-4" data-testid="text-hiw-label">
            How It Works
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-slate-900" data-testid="text-hiw-heading">
            Three Steps to a Professional Legal Letter
          </h2>
          <p className="text-lg text-slate-500" data-testid="text-hiw-subheading">
            From intake to attorney-approved PDF in as little as 24 hours
          </p>
        </div>

        <div className="relative">
          <DesktopTimeline revealed={revealed} skip={skip} />

          <div className="grid md:grid-cols-3 gap-10 md:gap-6 lg:gap-10 relative">
            {steps.map((item, i) => (
              <StepCard
                key={i}
                item={item}
                index={i}
                revealed={revealed}
                skip={skip}
                isLast={i === steps.length - 1}
              />
            ))}
          </div>

          <ShimmerSweep revealed={revealed} skip={skip} />
        </div>

        <div className="sr-only" aria-live="polite" role="status">
          {revealed && "Step 1: Describe Your Situation. Step 2: Attorneys Research and Draft. Step 3: Attorney Reviews and Approves. "}
        </div>
      </div>
    </section>
  );
}

function ShimmerSweep({ revealed, skip }: { revealed: boolean; skip: boolean }) {
  if (skip) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden hiw-shimmer-overlay"
      aria-hidden="true"
    >
      <div
        className="absolute inset-y-0 w-1/3"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(37, 99, 235, 0.06) 40%, rgba(37, 99, 235, 0.03) 60%, transparent 100%)",
          animation: revealed ? `hiw-shimmer-sweep 600ms cubic-bezier(0.16, 1, 0.3, 1) ${SHIMMER_DELAY}ms both` : "none",
        }}
      />
    </div>
  );
}

function DesktopTimeline({ revealed, skip }: { revealed: boolean; skip: boolean }) {
  return (
    <div className="hidden md:block absolute top-[66px] left-0 right-0 z-0 pointer-events-none" aria-hidden="true">
      <div className="relative mx-auto" style={{ width: "66.66%", height: 4 }}>
        <div className="absolute inset-0 bg-slate-200/60 rounded-full" />

        <div
          className="absolute inset-0 rounded-full hiw-line-fill"
          style={skip ? {
            transform: "scaleX(1)",
            background: "linear-gradient(90deg, #3b82f6, #2563eb, #1d4ed8)",
          } : {
            background: "linear-gradient(90deg, #3b82f6, #2563eb, #1d4ed8)",
            transformOrigin: "left center",
            transform: revealed ? "scaleX(1)" : "scaleX(0)",
            opacity: revealed ? 1 : 0,
            transition: "transform 1200ms cubic-bezier(0.16, 1, 0.3, 1) 600ms, opacity 300ms ease 600ms",
          }}
        />

        {[0, 50, 100].map((pos, i) => (
          <div
            key={i}
            className="absolute top-1/2"
            style={{ left: `${pos}%` }}
          >
            <div
              className="w-3 h-3 rounded-full hiw-dot"
              style={skip ? {
                transform: "translate(-50%, -50%) scale(1)",
                opacity: 1,
                backgroundColor: "#2563eb",
                boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.15)",
              } : {
                animation: revealed ? `hiw-dot-pulse 500ms cubic-bezier(0.16, 1, 0.3, 1) ${700 + i * 300}ms both` : "none",
                backgroundColor: "#2563eb",
                boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.15)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileConnector({ skip, revealed, delay }: { skip: boolean; revealed: boolean; delay: number }) {
  return (
    <div className="md:hidden flex flex-col items-center" style={{ height: 48 }} aria-hidden="true">
      <div className="relative w-[3px] flex-1">
        <div className="absolute inset-0 bg-slate-200/60 rounded-full" />
        <div
          className="absolute inset-0 rounded-full hiw-mobile-fill"
          style={skip ? {
            transform: "scaleY(1)",
            transformOrigin: "top center",
            background: "linear-gradient(180deg, #3b82f6, #1d4ed8)",
          } : {
            background: "linear-gradient(180deg, #3b82f6, #1d4ed8)",
            transformOrigin: "top center",
            transform: revealed ? "scaleY(1)" : "scaleY(0)",
            opacity: revealed ? 1 : 0,
            transition: `transform 600ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, opacity 200ms ease ${delay}ms`,
          }}
        />
      </div>
      <div
        className="w-2.5 h-2.5 rounded-full hiw-dot"
        style={skip ? {
          backgroundColor: "#2563eb",
          boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.15)",
          opacity: 1,
          transform: "scale(1)",
        } : {
          backgroundColor: "#2563eb",
          boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.15)",
          animation: revealed ? `hiw-dot-pulse 500ms cubic-bezier(0.16, 1, 0.3, 1) ${delay + 400}ms both` : "none",
        }}
      />
    </div>
  );
}

function StepCard({
  item,
  index,
  revealed,
  skip,
  isLast,
}: {
  item: (typeof steps)[number];
  index: number;
  revealed: boolean;
  skip: boolean;
  isLast: boolean;
}) {
  const cardDelay = 150 + index * 200;
  const iconDelay = cardDelay + 250;
  const numberDelay = cardDelay + 100;

  return (
    <>
      <div
        className="relative flex flex-col items-center text-center group hiw-card"
        data-testid={`step-${item.step}`}
        style={skip ? {} : {
          animation: revealed ? `hiw-card-in 800ms cubic-bezier(0.16, 1, 0.3, 1) ${cardDelay}ms both` : "none",
          opacity: revealed ? undefined : 0,
        }}
      >
        <div className="relative bg-white rounded-2xl border border-slate-200/80 px-6 pt-16 pb-8 w-full hiw-card-inner">
          <div
            className="absolute top-3 right-4 font-black text-[72px] leading-none select-none pointer-events-none hiw-watermark"
            style={skip ? {
              color: "rgba(37, 99, 235, 0.04)",
            } : {
              color: "rgba(37, 99, 235, 0.04)",
              animation: revealed ? `hiw-step-number-in 600ms cubic-bezier(0.16, 1, 0.3, 1) ${numberDelay}ms both` : "none",
            }}
            aria-hidden="true"
          >
            {item.step}
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 -top-[50px]">
            <div
              className="w-[100px] h-[100px] rounded-full flex items-center justify-center relative bg-white"
              style={{
                border: "3px solid transparent",
                backgroundImage: "linear-gradient(white, white), linear-gradient(135deg, #3b82f6, #1d4ed8)",
                backgroundOrigin: "border-box",
                backgroundClip: "padding-box, border-box",
                boxShadow: "0 12px 40px rgba(37, 99, 235, 0.15), 0 0 0 8px rgba(37, 99, 235, 0.08)",
              }}
            >
              <div
                className="hiw-icon-wrap"
                style={skip ? {} : {
                  animation: revealed ? `hiw-icon-in 500ms cubic-bezier(0.34, 1.56, 0.64, 1) ${iconDelay}ms both` : "none",
                }}
              >
                <item.icon
                  className="w-10 h-10 text-blue-600"
                  strokeWidth={1.8}
                />
              </div>
            </div>
          </div>

          <div
            className="inline-block px-2.5 py-0.5 rounded-md text-xs font-bold tracking-wider uppercase mb-3"
            data-testid={`text-step-label-${item.step}`}
            style={{
              color: "#2563eb",
              backgroundColor: "rgba(37, 99, 235, 0.06)",
            }}
          >
            Step {item.step}
          </div>

          <h3 className="text-lg font-bold mb-2 text-slate-900" data-testid={`text-step-title-${item.step}`}>
            {item.title}
          </h3>
          <p className="text-slate-500 leading-relaxed text-[15px]" data-testid={`text-step-desc-${item.step}`}>
            {item.desc}
          </p>
        </div>
      </div>

      {!isLast && (
        <MobileConnector skip={skip} revealed={revealed} delay={cardDelay + 400} />
      )}
    </>
  );
}
