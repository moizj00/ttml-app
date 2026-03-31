import { useEffect, useRef, useState } from "react";
import { FileText, Search, CheckCircle2 } from "lucide-react";

const steps = [
  {
    step: "01",
    icon: FileText,
    title: "Turn Your Facts Into a Draft",
    desc: "Complete a guided intake form with the facts of your situation. The system structures your input into a California-focused legal-letter draft — no blank-page guessing.",
  },
  {
    step: "02",
    icon: Search,
    title: "Send a Stronger First Draft in 10 Minutes",
    desc: "The drafting engine applies California legal language and repeatable letter workflows to generate a structured, review-ready draft fast.",
  },
  {
    step: "03",
    icon: CheckCircle2,
    title: "Review With an Attorney or Send Directly",
    desc: "Your draft is ready for attorney review or self-organized use. A licensed attorney can review, edit, and approve before delivery.",
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
      className="relative py-20 sm:py-24 md:py-32 px-4 sm:px-6 lg:px-12 overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #f0f4ff 0%, #ffffff 40%, #f8faff 70%, #eef2ff 100%)",
        borderTop: "1px solid rgba(226,232,240,0.8)",
        borderBottom: "1px solid rgba(226,232,240,0.8)",
      }}
    >
      <style>{`
        /* Section background decoration */
        .hiw-bg-dot-grid {
          background-image: radial-gradient(circle, rgba(37,99,235,0.07) 1px, transparent 1px);
          background-size: 28px 28px;
        }

        /* Heading entrance */
        @keyframes hiw-heading-in {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Card entrance with spring overshoot */
        @keyframes hiw-card-in {
          0%   { opacity: 0; transform: translateY(70px) scale(0.95); }
          55%  { opacity: 1; transform: translateY(-8px) scale(1.02); }
          75%  { transform: translateY(3px) scale(0.99); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Icon pop with big overshoot */
        @keyframes hiw-icon-in {
          0%   { opacity: 0; transform: scale(0.3) rotate(-15deg); }
          50%  { opacity: 1; transform: scale(1.25) rotate(5deg); }
          70%  { transform: scale(0.92) rotate(-2deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }

        /* Icon idle pulse */
        @keyframes hiw-icon-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0.35), 0 12px 40px rgba(37,99,235,0.18); }
          50%       { box-shadow: 0 0 0 10px rgba(37,99,235,0), 0 12px 40px rgba(37,99,235,0.25); }
        }

        /* Step number fade in */
        @keyframes hiw-step-number-in {
          0%   { opacity: 0; transform: translateY(12px) scale(0.9); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Dot appear */
        @keyframes hiw-dot-pulse {
          0%   { transform: translate(-50%, -50%) scale(0); opacity: 0; }
          50%  { transform: translate(-50%, -50%) scale(1.7); opacity: 0.5; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }

        /* Timeline glow shimmer */
        @keyframes hiw-shimmer-sweep {
          0%   { transform: translateX(-100%); opacity: 1; }
          100% { transform: translateX(300%); opacity: 0; }
        }

        /* Glow travel along line */
        @keyframes hiw-line-glow {
          0%   { opacity: 0.4; }
          50%  { opacity: 1; }
          100% { opacity: 0.4; }
        }

        /* Icon hover shimmer */
        @keyframes hiw-icon-shimmer {
          0%   { transform: translateX(-150%) rotate(25deg); }
          100% { transform: translateX(350%) rotate(25deg); }
        }

        /* Card hover interaction */
        .hiw-card-inner {
          transition: transform 400ms cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 400ms cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 400ms ease;
        }
        .hiw-card-inner:hover {
          transform: translateY(-10px) scale(1.025);
          box-shadow:
            0 30px 60px rgba(37, 99, 235, 0.14),
            0 10px 20px rgba(0, 0, 0, 0.05),
            0 0 0 1px rgba(37, 99, 235, 0.12),
            inset 0 1px 0 rgba(255,255,255,0.9);
          border-color: rgba(37, 99, 235, 0.25) !important;
        }

        /* Icon circle hover glow */
        .hiw-icon-circle {
          transition: box-shadow 400ms cubic-bezier(0.16, 1, 0.3, 1), transform 400ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hiw-card-inner:hover .hiw-icon-circle {
          box-shadow:
            0 0 0 8px rgba(37, 99, 235, 0.12),
            0 0 30px rgba(37, 99, 235, 0.3),
            0 12px 40px rgba(37, 99, 235, 0.2);
          transform: scale(1.07);
        }

        /* Icon shimmer on card hover */
        .hiw-icon-shimmer-track {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          overflow: hidden;
          pointer-events: none;
        }
        .hiw-icon-shimmer-bar {
          position: absolute;
          inset-y: 0;
          width: 35%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
          opacity: 0;
          transition: none;
        }
        .hiw-card-inner:hover .hiw-icon-shimmer-bar {
          animation: hiw-icon-shimmer 600ms cubic-bezier(0.16, 1, 0.3, 1) 50ms both;
        }

        /* Dot glow idle */
        .hiw-dot-glow {
          animation: hiw-line-glow 2.5s ease-in-out infinite;
        }

        /* Reduced motion overrides */
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
          .hiw-card-inner {
            transition: none !important;
          }
          .hiw-card-inner:hover {
            transform: none !important;
          }
          .hiw-icon-circle {
            transition: none !important;
          }
          .hiw-card-inner:hover .hiw-icon-circle {
            transform: none !important;
          }
          .hiw-card-inner:hover .hiw-icon-shimmer-bar {
            animation: none !important;
          }
          .hiw-dot-glow { animation: none !important; }
          .hiw-icon-pulse { animation: none !important; }
        }
      `}</style>

      {/* Dot-grid background layer */}
      <div
        className="hiw-bg-dot-grid absolute inset-0 pointer-events-none"
        aria-hidden="true"
      />

      {/* Radial glow behind center */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background: "radial-gradient(ellipse 55% 55% at 50% 50%, rgba(37,99,235,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-6xl mx-auto relative">
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
            From Facts to Structured Draft in Minutes
          </h2>
          <p className="text-lg text-slate-500" data-testid="text-hiw-subheading">
            Reduce drafting time for California legal letters — structured, review-friendly outputs every time
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
          background: "linear-gradient(90deg, transparent 0%, rgba(37, 99, 235, 0.07) 40%, rgba(37, 99, 235, 0.04) 60%, transparent 100%)",
          animation: revealed ? `hiw-shimmer-sweep 700ms cubic-bezier(0.16, 1, 0.3, 1) ${SHIMMER_DELAY}ms both` : "none",
        }}
      />
    </div>
  );
}

function DesktopTimeline({ revealed, skip }: { revealed: boolean; skip: boolean }) {
  return (
    <div className="hidden md:block absolute top-[66px] left-0 right-0 z-0 pointer-events-none" aria-hidden="true">
      <div className="relative mx-auto" style={{ width: "66.66%", height: 6 }}>
        {/* Track */}
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: "rgba(37,99,235,0.10)" }}
        />

        {/* Animated fill */}
        <div
          className="absolute inset-0 rounded-full hiw-line-fill"
          style={skip ? {
            transform: "scaleX(1)",
            background: "linear-gradient(90deg, #60a5fa, #3b82f6, #2563eb, #1d4ed8)",
            boxShadow: "0 0 16px rgba(37,99,235,0.55), 0 0 6px rgba(37,99,235,0.8)",
          } : {
            background: "linear-gradient(90deg, #60a5fa, #3b82f6, #2563eb, #1d4ed8)",
            boxShadow: "0 0 16px rgba(37,99,235,0.55), 0 0 6px rgba(37,99,235,0.8)",
            transformOrigin: "left center",
            transform: revealed ? "scaleX(1)" : "scaleX(0)",
            opacity: revealed ? 1 : 0,
            transition: "transform 1400ms cubic-bezier(0.16, 1, 0.3, 1) 500ms, opacity 300ms ease 500ms",
          }}
        />

        {/* Glow pulse overlay on line */}
        {!skip && revealed && (
          <div
            className="absolute inset-0 rounded-full hiw-dot-glow"
            style={{
              background: "linear-gradient(90deg, transparent 10%, rgba(255,255,255,0.35) 50%, transparent 90%)",
              animationDelay: "1800ms",
            }}
          />
        )}

        {/* Dot markers */}
        {[0, 50, 100].map((pos, i) => (
          <div
            key={i}
            className="absolute top-1/2"
            style={{ left: `${pos}%` }}
          >
            {/* Outer glow ring */}
            <div
              className="absolute rounded-full"
              style={{
                width: 22,
                height: 22,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "radial-gradient(circle, rgba(37,99,235,0.25) 0%, transparent 70%)",
              }}
            />
            <div
              className="w-4 h-4 rounded-full hiw-dot"
              style={skip ? {
                transform: "translate(-50%, -50%) scale(1)",
                opacity: 1,
                background: "linear-gradient(135deg, #60a5fa, #2563eb)",
                boxShadow: "0 0 0 4px rgba(37,99,235,0.18), 0 0 12px rgba(37,99,235,0.5)",
              } : {
                animation: revealed ? `hiw-dot-pulse 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${800 + i * 280}ms both` : "none",
                background: "linear-gradient(135deg, #60a5fa, #2563eb)",
                boxShadow: "0 0 0 4px rgba(37,99,235,0.18), 0 0 12px rgba(37,99,235,0.5)",
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
    <div className="md:hidden flex flex-col items-center" style={{ height: 52 }} aria-hidden="true">
      <div className="relative w-[4px] flex-1">
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: "rgba(37,99,235,0.12)" }}
        />
        <div
          className="absolute inset-0 rounded-full hiw-mobile-fill"
          style={skip ? {
            transform: "scaleY(1)",
            transformOrigin: "top center",
            background: "linear-gradient(180deg, #60a5fa, #2563eb)",
            boxShadow: "0 0 8px rgba(37,99,235,0.5)",
          } : {
            background: "linear-gradient(180deg, #60a5fa, #2563eb)",
            boxShadow: "0 0 8px rgba(37,99,235,0.5)",
            transformOrigin: "top center",
            transform: revealed ? "scaleY(1)" : "scaleY(0)",
            opacity: revealed ? 1 : 0,
            transition: `transform 700ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, opacity 200ms ease ${delay}ms`,
          }}
        />
      </div>
      <div
        className="w-3 h-3 rounded-full hiw-dot"
        style={skip ? {
          background: "linear-gradient(135deg, #60a5fa, #2563eb)",
          boxShadow: "0 0 0 3px rgba(37,99,235,0.18), 0 0 10px rgba(37,99,235,0.4)",
          opacity: 1,
          transform: "scale(1)",
        } : {
          background: "linear-gradient(135deg, #60a5fa, #2563eb)",
          boxShadow: "0 0 0 3px rgba(37,99,235,0.18), 0 0 10px rgba(37,99,235,0.4)",
          animation: revealed ? `hiw-dot-pulse 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay + 450}ms both` : "none",
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
  const iconDelay = cardDelay + 280;
  const numberDelay = cardDelay + 80;

  return (
    <>
      <div
        className="relative flex flex-col items-center text-center group hiw-card"
        data-testid={`step-${item.step}`}
        style={skip ? {} : {
          animation: revealed ? `hiw-card-in 900ms cubic-bezier(0.16, 1, 0.3, 1) ${cardDelay}ms both` : "none",
          opacity: revealed ? undefined : 0,
        }}
      >
        <div
          className="relative rounded-2xl px-6 pt-16 pb-8 w-full hiw-card-inner"
          style={{
            background: "linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(248,250,255,0.95) 100%)",
            border: "1px solid rgba(37,99,235,0.12)",
            boxShadow:
              "0 4px 6px rgba(0,0,0,0.03), 0 12px 32px rgba(37,99,235,0.07), inset 0 1px 0 rgba(255,255,255,0.9)",
            backdropFilter: "blur(4px)",
          }}
        >
          {/* Bold watermark step number */}
          <div
            className="absolute top-3 right-4 font-black leading-none select-none pointer-events-none hiw-watermark"
            style={skip ? {
              fontSize: 80,
              color: "rgba(37,99,235,0.09)",
              background: "linear-gradient(135deg, rgba(37,99,235,0.13) 0%, rgba(37,99,235,0.05) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            } : {
              fontSize: 80,
              color: "rgba(37,99,235,0.09)",
              background: "linear-gradient(135deg, rgba(37,99,235,0.13) 0%, rgba(37,99,235,0.05) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              animation: revealed ? `hiw-step-number-in 700ms cubic-bezier(0.16, 1, 0.3, 1) ${numberDelay}ms both` : "none",
            }}
            aria-hidden="true"
          >
            {item.step}
          </div>

          {/* Icon circle */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-[54px]">
            <div
              className="hiw-icon-circle w-[108px] h-[108px] rounded-full flex items-center justify-center relative"
              style={{
                background: "linear-gradient(145deg, #eff6ff 0%, #dbeafe 50%, #bfdbfe 100%)",
                border: "2.5px solid transparent",
                backgroundImage: "linear-gradient(145deg, #eff6ff, #dbeafe, #bfdbfe), linear-gradient(135deg, #60a5fa, #2563eb, #1e40af)",
                backgroundOrigin: "border-box",
                backgroundClip: "padding-box, border-box",
                boxShadow:
                  "0 0 0 8px rgba(37,99,235,0.09), 0 0 24px rgba(37,99,235,0.2), 0 14px 40px rgba(37,99,235,0.18)",
              }}
            >
              {/* Shimmer track inside icon circle */}
              <div className="hiw-icon-shimmer-track">
                <div className="hiw-icon-shimmer-bar" />
              </div>

              <div
                className="hiw-icon-wrap"
                style={skip ? {} : {
                  animation: revealed ? `hiw-icon-in 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${iconDelay}ms both` : "none",
                }}
              >
                <item.icon
                  className="w-11 h-11 text-blue-600"
                  strokeWidth={1.7}
                />
              </div>
            </div>
          </div>

          {/* Step label badge */}
          <div
            className="inline-block px-2.5 py-0.5 rounded-md text-xs font-bold tracking-wider uppercase mb-3"
            data-testid={`text-step-label-${item.step}`}
            style={{
              color: "#2563eb",
              background: "linear-gradient(90deg, rgba(37,99,235,0.09), rgba(37,99,235,0.05))",
              border: "1px solid rgba(37,99,235,0.12)",
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
