import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Shield,
  Zap,
  Share2,
  FileText,
  Copy,
  History,
} from "lucide-react";

const supportingFeatures = [
  {
    icon: FileText,
    title: "California-Specific Letter Types",
    desc: "Landlord-tenant, employment disputes, demand letters, collections/debt response, and business dispute letters — all built around California legal language.",
  },
  {
    icon: Copy,
    title: "Real-Time Status Tracking",
    desc: "Follow your draft from intake through the drafting workflow, attorney review, and final approval with live status updates and email notifications.",
  },
  {
    icon: History,
    title: "Full Audit Trail",
    desc: "Every action is logged — from intake to drafting, attorney edits, and final approval. Complete transparency at every step.",
  },
  {
    icon: Shield,
    title: "Encrypted & Confidential",
    desc: "Your case details are encrypted in transit and at rest. Attorneys are bound by professional confidentiality obligations. Your data is never shared.",
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

function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion, threshold]);

  return { ref, revealed, skip: reducedMotion };
}

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const BOUNCE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

export default function FeaturesSection() {
  const heading = useScrollReveal(0.3);
  const row1 = useScrollReveal(0.15);
  const row2 = useScrollReveal(0.15);
  const grid = useScrollReveal(0.1);

  return (
    <section
      id="features"
      className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 lg:px-12 bg-white overflow-hidden"
    >
      <style>{`
        @keyframes feat-fade-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes feat-slide-left {
          from { opacity: 0; transform: translateX(-60px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes feat-slide-right {
          from { opacity: 0; transform: translateX(60px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes feat-slide-up {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes feat-scale-in {
          0% { opacity: 0; transform: scale(0.6); }
          60% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes feat-check-in {
          0% { opacity: 0; transform: translateX(-20px) scale(0.5); }
          60% { opacity: 1; transform: translateX(2px) scale(1.1); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes feat-highlight-reveal {
          from { opacity: 0; transform: scaleX(0); }
          to { opacity: 1; transform: scaleX(1); }
        }
        @keyframes feat-annotation-in {
          from { opacity: 0; transform: translateX(10px) translateY(-50%); }
          to { opacity: 1; transform: translateX(0) translateY(-50%); }
        }
        @keyframes feat-bar-header {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes feat-panel-slide {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .feat-card-hover {
          transition: transform 300ms ${EASE};
        }
        .feat-card-hover:hover {
          transform: translateY(-6px);
        }
        @media (prefers-reduced-motion: reduce) {
          .feat-heading, .feat-row-visual, .feat-row-text,
          .feat-card, .feat-internal, .feat-card-hover {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
          .feat-card-hover:hover {
            transform: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto">
        <div
          ref={heading.ref}
          className="text-center max-w-3xl mx-auto mb-12 md:mb-24 feat-heading"
          style={heading.skip ? {} : {
            animation: heading.revealed
              ? `feat-fade-up 700ms ${EASE} forwards`
              : "none",
            opacity: heading.revealed ? undefined : 0,
          }}
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
            Built for California Legal Correspondence
          </h2>
          <p className="text-lg text-slate-600">
            Every feature exists to get you a stronger draft, faster — structured around California legal language
          </p>
        </div>

        <div className="space-y-16 sm:space-y-24 md:space-y-32">
          <FeatureRow1 rowRef={row1.ref} revealed={row1.revealed} skip={row1.skip} />
          <FeatureRow2 rowRef={row2.ref} revealed={row2.revealed} skip={row2.skip} />
          <SupportingGrid gridRef={grid.ref} revealed={grid.revealed} skip={grid.skip} />
        </div>
      </div>
    </section>
  );
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

function FeatureRow1({
  rowRef,
  revealed,
  skip,
}: {
  rowRef: React.RefObject<HTMLDivElement | null>;
  revealed: boolean;
  skip: boolean;
}) {
  const isDesktop = useIsDesktop();

  const visualAnim = skip ? {} : {
    animation: revealed
      ? `${isDesktop ? "feat-slide-left" : "feat-fade-up"} 800ms ${EASE} forwards`
      : "none",
    opacity: revealed ? undefined : 0,
  };
  const textAnim = skip ? {} : {
    animation: revealed
      ? `${isDesktop ? "feat-slide-right" : "feat-fade-up"} 800ms ${EASE} 200ms forwards`
      : "none",
    opacity: revealed ? undefined : 0,
  };

  return (
    <div ref={rowRef} className="flex flex-col lg:flex-row items-center gap-8 sm:gap-12 lg:gap-24">
      <div className="w-full lg:w-1/2 feat-row-visual" style={visualAnim}>
        <MockupJurisdiction revealed={revealed} skip={skip} />
      </div>
      <div className="w-full lg:w-1/2 flex flex-col justify-center feat-row-text" style={textAnim}>
        <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
          <Zap className="w-7 h-7 text-blue-600" />
        </div>
        <h3 className="text-3xl font-bold mb-4">
          California-Focused Drafting Engine
        </h3>
        <p className="text-lg text-slate-600 mb-8 leading-relaxed">
          The drafting system is built around California legal-letter
          conventions — structured around repeatable workflows and
          designed to reduce unsupported output. You get review-friendly
          drafts grounded in a controlled drafting process.
        </p>
        <ul className="space-y-4">
          {[
            "California-specific legal language applied",
            "Built from curated legal-letter patterns",
            "Structured around repeatable letter workflows",
            "Designed to reduce drafting time significantly",
          ].map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-3 feat-internal"
              style={skip ? {} : {
                animation: revealed
                  ? `feat-fade-up 500ms ${EASE} ${600 + i * 100}ms forwards`
                  : "none",
                opacity: revealed ? undefined : 0,
              }}
            >
              <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <span className="text-slate-700 font-medium">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MockupJurisdiction({ revealed, skip }: { revealed: boolean; skip: boolean }) {
  return (
    <div className="aspect-square max-h-[400px] sm:max-h-[500px] w-full bg-blue-50 rounded-2xl sm:rounded-3xl p-6 sm:p-12 relative flex items-center justify-center">
      <div
        className="absolute inset-0 bg-blue-600/5 rounded-3xl"
        style={{
          backgroundImage:
            "radial-gradient(circle at 2px 2px, rgba(37, 99, 235, 0.15) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      ></div>

      <div className="relative w-full h-full bg-white rounded-2xl shadow-xl p-8 flex flex-col justify-between border border-blue-100">
        <div className="flex justify-between items-start mb-8">
          <div
            className="bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-xs font-bold feat-internal"
            style={skip ? {} : {
              animation: revealed
                ? `feat-scale-in 500ms ${BOUNCE} 500ms forwards`
                : "none",
              opacity: revealed ? undefined : 0,
            }}
          >
            CALIFORNIA
          </div>
          <Shield
            className="text-blue-600 w-6 h-6 feat-internal"
            style={skip ? {} : {
              animation: revealed
                ? `feat-scale-in 500ms ${BOUNCE} 600ms forwards`
                : "none",
              opacity: revealed ? undefined : 0,
            }}
          />
        </div>
        <div className="space-y-4 flex-1">
          <div
            className="p-4 bg-slate-50 rounded-lg border border-slate-100 feat-internal"
            style={skip ? {} : {
              animation: revealed
                ? `feat-panel-slide 500ms ${EASE} 700ms forwards`
                : "none",
              opacity: revealed ? undefined : 0,
            }}
          >
            <div className="h-2 w-20 bg-blue-200 rounded mb-2"></div>
            <div className="h-2 w-full bg-slate-200 rounded"></div>
          </div>
          <div
            className="p-4 bg-blue-50 rounded-lg border border-blue-100 relative feat-internal"
            style={skip ? {} : {
              animation: revealed
                ? `feat-panel-slide 500ms ${EASE} 850ms forwards`
                : "none",
              opacity: revealed ? undefined : 0,
            }}
          >
            <div
              className="absolute -left-3 top-1/2 -translate-y-1/2 bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs feat-internal"
              style={skip ? {} : {
                animation: revealed
                  ? `feat-check-in 500ms ${BOUNCE} 1050ms forwards`
                  : "none",
                opacity: revealed ? undefined : 0,
              }}
            >
              ✓
            </div>
            <div className="h-2 w-32 bg-blue-300 rounded mb-2 ml-4"></div>
            <div className="h-2 w-full bg-blue-200 rounded ml-4"></div>
          </div>
          <div
            className="p-4 bg-slate-50 rounded-lg border border-slate-100 feat-internal"
            style={skip ? {} : {
              animation: revealed
                ? `feat-panel-slide 500ms ${EASE} 1000ms forwards`
                : "none",
              opacity: revealed ? undefined : 0,
            }}
          >
            <div className="h-2 w-24 bg-blue-200 rounded mb-2"></div>
            <div className="h-2 w-full bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow2({
  rowRef,
  revealed,
  skip,
}: {
  rowRef: React.RefObject<HTMLDivElement | null>;
  revealed: boolean;
  skip: boolean;
}) {
  const isDesktop = useIsDesktop();

  const visualAnim = skip ? {} : {
    animation: revealed
      ? `${isDesktop ? "feat-slide-right" : "feat-fade-up"} 800ms ${EASE} forwards`
      : "none",
    opacity: revealed ? undefined : 0,
  };
  const textAnim = skip ? {} : {
    animation: revealed
      ? `${isDesktop ? "feat-slide-left" : "feat-fade-up"} 800ms ${EASE} 200ms forwards`
      : "none",
    opacity: revealed ? undefined : 0,
  };

  return (
    <div ref={rowRef} className="flex flex-col lg:flex-row-reverse items-center gap-8 sm:gap-12 lg:gap-24">
      <div className="w-full lg:w-1/2 feat-row-visual" style={visualAnim}>
        <MockupAttorneyReview revealed={revealed} skip={skip} />
      </div>
      <div className="w-full lg:w-1/2 flex flex-col justify-center feat-row-text" style={textAnim}>
        <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center mb-6">
          <Share2 className="w-7 h-7 text-indigo-600" />
        </div>
        <h3 className="text-3xl font-bold mb-4">
          Attorney Review Center
        </h3>
        <p className="text-lg text-slate-600 mb-8 leading-relaxed">
          Licensed attorneys work in a dedicated Review Center — editing
          language, verifying draft quality, and providing inline feedback.
          Your draft is built for review before it reaches an attorney or
          goes out the door.
        </p>
        <div className="grid grid-cols-2 gap-6">
          {[
            { value: "100%", label: "Human-reviewable drafts" },
            { value: "24-48h", label: "Average turnaround" },
            { value: "CA-first", label: "California language focus" },
            { value: "Inline", label: "Attorney draft feedback" },
          ].map((stat, i) => (
            <div
              key={i}
              className="feat-internal"
              style={skip ? {} : {
                animation: revealed
                  ? `feat-fade-up 500ms ${EASE} ${600 + i * 100}ms forwards`
                  : "none",
                opacity: revealed ? undefined : 0,
              }}
            >
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-slate-600 font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockupAttorneyReview({ revealed, skip }: { revealed: boolean; skip: boolean }) {
  return (
    <div className="aspect-square max-h-[400px] sm:max-h-[500px] w-full bg-slate-100 rounded-2xl sm:rounded-3xl p-6 sm:p-12 relative flex items-center justify-center">
      <div className="relative w-full h-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
        <div
          className="bg-slate-900 px-6 py-4 flex items-center justify-between feat-internal"
          style={skip ? {} : {
            animation: revealed
              ? `feat-bar-header 500ms ${EASE} 400ms forwards`
              : "none",
            opacity: revealed ? undefined : 0,
          }}
        >
          <span className="text-white font-medium text-sm">
            Attorney Review Portal
          </span>
          <div className="flex gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-700"></span>
            <span className="w-2 h-2 rounded-full bg-slate-700"></span>
            <span className="w-2 h-2 rounded-full bg-slate-700"></span>
          </div>
        </div>
        <div className="flex-1 p-6 bg-slate-50 flex gap-4">
          <div className="w-1/3 space-y-3">
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className={`p-3 rounded shadow-sm feat-internal ${
                  j === 0 ? "bg-white border-l-4 border-blue-600" : "bg-white/50"
                }`}
                style={skip ? {} : {
                  animation: revealed
                    ? `feat-panel-slide 500ms ${EASE} ${600 + j * 120}ms forwards`
                    : "none",
                  opacity: revealed ? undefined : 0,
                }}
              >
                <div className="h-2 w-full bg-slate-200 rounded mb-2"></div>
                <div className={`h-2 rounded bg-slate-200 ${j === 0 ? "w-1/2" : j === 1 ? "w-2/3" : "w-3/4"}`}></div>
              </div>
            ))}
          </div>
          <div
            className="w-2/3 bg-white rounded shadow-sm border border-slate-200 p-6 flex flex-col feat-internal"
            style={skip ? {} : {
              animation: revealed
                ? `feat-panel-slide 500ms ${EASE} 700ms forwards`
                : "none",
              opacity: revealed ? undefined : 0,
            }}
          >
            <div className="space-y-4 mb-auto">
              <div className="h-2 w-full bg-slate-100 rounded"></div>
              <div className="h-2 w-full bg-slate-100 rounded"></div>
              <div
                className="p-2 bg-yellow-50 rounded border border-yellow-200 relative feat-internal"
                style={skip ? {} : {
                  animation: revealed
                    ? `feat-highlight-reveal 600ms ${EASE} 1000ms forwards`
                    : "none",
                  opacity: revealed ? undefined : 0,
                  transformOrigin: "left center",
                }}
              >
                <div className="h-2 w-full bg-yellow-200 rounded mb-2"></div>
                <div className="h-2 w-4/5 bg-yellow-200 rounded"></div>
                <div
                  className="absolute top-1/2 -right-12 translate-x-full -translate-y-1/2 bg-white shadow-lg rounded p-2 text-[10px] text-slate-500 border border-slate-100 w-24 hidden sm:block feat-internal"
                  style={skip ? {} : {
                    animation: revealed
                      ? `feat-annotation-in 500ms ${EASE} 1300ms forwards`
                      : "none",
                    opacity: revealed ? undefined : 0,
                  }}
                >
                  Strengthened claim here.
                </div>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded"></div>
            </div>
            <div
              className="mt-8 flex justify-end gap-2 border-t border-slate-100 pt-4 feat-internal"
              style={skip ? {} : {
                animation: revealed
                  ? `feat-fade-up 500ms ${EASE} 1200ms forwards`
                  : "none",
                opacity: revealed ? undefined : 0,
              }}
            >
              <div className="h-6 w-16 bg-slate-100 rounded"></div>
              <div className="h-6 w-20 bg-blue-600 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupportingGrid({
  gridRef,
  revealed,
  skip,
}: {
  gridRef: React.RefObject<HTMLDivElement | null>;
  revealed: boolean;
  skip: boolean;
}) {
  return (
    <div
      ref={gridRef}
      className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 pt-12 border-t border-slate-100"
    >
      {supportingFeatures.map((f, i) => (
        <div
          key={i}
          className={`p-6 rounded-2xl bg-slate-50 feat-card${skip ? "" : " feat-card-hover"}`}
          data-testid={`feature-card-${i}`}
          style={skip ? {} : {
            animation: revealed
              ? `feat-slide-up 600ms ${EASE} ${i * 120}ms forwards`
              : "none",
            opacity: revealed ? undefined : 0,
          }}
        >
          <f.icon className="w-8 h-8 text-blue-600 mb-6" />
          <h4 className="text-xl font-bold mb-3">{f.title}</h4>
          <p className="text-slate-600 leading-relaxed">{f.desc}</p>
        </div>
      ))}
    </div>
  );
}
