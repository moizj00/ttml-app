import { useEffect, useRef, useState, useCallback } from "react";
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

const ICON_SIZE = 96;
const ICON_RADIUS = ICON_SIZE / 2;
const CIRCLE_RADIUS = ICON_RADIUS + 4;

const THRESHOLDS = [0.2, 0.5, 0.8];

function buildPath(positions: { x: number; y: number }[]): string {
  if (positions.length < 3) return "";
  const parts: string[] = [];

  for (let i = 0; i < positions.length; i++) {
    const { x, y } = positions[i];
    const r = CIRCLE_RADIUS;

    if (i === 0) {
      parts.push(`M ${x - r - 40} ${y}`);
    }

    parts.push(`L ${x - r} ${y}`);

    parts.push(
      `A ${r} ${r} 0 1 1 ${x + r} ${y}`,
      `A ${r} ${r} 0 1 1 ${x - r} ${y}`
    );

    if (i < positions.length - 1) {
      parts.push(`L ${positions[i + 1].x - CIRCLE_RADIUS} ${y}`);
    } else {
      parts.push(`L ${x + r + 40} ${y}`);
    }
  }

  return parts.join(" ");
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const iconRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeSteps, setActiveSteps] = useState<boolean[]>([false, false, false]);
  const [pathD, setPathD] = useState("");
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const [pathLength, setPathLength] = useState(0);
  const [allComplete, setAllComplete] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const isMobile = useIsMobile();
  const skipAnimation = reducedMotion || isMobile;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (skipAnimation) {
      setActiveSteps([true, true, true]);
      setAllComplete(true);
    } else {
      setActiveSteps([false, false, false]);
      setAllComplete(false);
    }
  }, [skipAnimation]);

  const computePositions = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;
    const sectionRect = section.getBoundingClientRect();
    if (iconRefs.current.some((el) => !el)) return;
    const positions = iconRefs.current.map((el) => {
      const rect = el!.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - sectionRect.left,
        y: rect.top + rect.height / 2 - sectionRect.top,
      };
    });

    const allX = positions.map((p) => p.x);
    const allY = positions.map((p) => p.y);
    const minX = Math.min(...allX) - CIRCLE_RADIUS - 50;
    const maxX = Math.max(...allX) + CIRCLE_RADIUS + 50;
    const y = allY[0];

    const adjustedPositions = positions.map((p) => ({
      x: p.x - minX,
      y: p.y - (y - CIRCLE_RADIUS - 10),
    }));

    const svgW = maxX - minX;
    const svgH = CIRCLE_RADIUS * 2 + 20;

    setSvgSize({ width: svgW, height: svgH });
    const d = buildPath(adjustedPositions);
    setPathD(d);
  }, []);

  useEffect(() => {
    if (skipAnimation) return;
    computePositions();
    window.addEventListener("resize", computePositions);
    return () => window.removeEventListener("resize", computePositions);
  }, [computePositions, skipAnimation]);

  useEffect(() => {
    if (skipAnimation) return;
    if (pathRef.current && pathD) {
      const len = pathRef.current.getTotalLength();
      setPathLength(len);
      pathRef.current.style.strokeDasharray = `${len}`;
      pathRef.current.style.strokeDashoffset = `${len}`;
    }
  }, [pathD, skipAnimation]);

  useEffect(() => {
    if (skipAnimation || !pathLength) return;

    const section = sectionRef.current;
    if (!section) return;

    let rafId: number;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      rafId = requestAnimationFrame(() => {
        ticking = false;
        const rect = section.getBoundingClientRect();
        const windowH = window.innerHeight;
        const start = windowH * 0.8;
        const end = windowH * 0.15;
        const rawProgress = (start - rect.top) / (start - end);
        const progress = Math.max(0, Math.min(1, rawProgress));

        progressRef.current = progress;

        if (pathRef.current) {
          pathRef.current.style.strokeDashoffset = `${pathLength * (1 - progress)}`;
        }

        const newActive = THRESHOLDS.map((t) => progress >= t);
        setActiveSteps((prev) => {
          if (prev.every((v, i) => v === newActive[i])) return prev;
          return newActive;
        });

        setAllComplete(progress >= 0.95);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [pathLength, skipAnimation]);

  return (
    <section
      ref={sectionRef}
      className="py-12 sm:py-16 md:py-24 px-4 sm:px-6 lg:px-12 bg-slate-50 border-y border-slate-100"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12 md:mb-20">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
            Three Steps to a Professional Legal Letter
          </h2>
          <p className="text-lg text-slate-600">
            From intake to attorney-approved PDF in as little as 24 hours
          </p>
        </div>

        <div className="relative">
          {!skipAnimation && pathD && (
            <svg
              ref={svgRef}
              className="hidden md:block absolute top-0 left-1/2 pointer-events-none"
              style={{
                width: svgSize.width,
                height: svgSize.height,
                transform: `translateX(-50%)`,
                top: `${ICON_SIZE / 2 - svgSize.height / 2}px`,
              }}
              viewBox={`0 0 ${svgSize.width} ${svgSize.height}`}
              fill="none"
              data-testid="how-it-works-svg"
            >
              <path
                d={pathD}
                stroke="#e2e8f0"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
              <path
                ref={pathRef}
                d={pathD}
                stroke="#2563eb"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.05s linear" }}
              />
            </svg>
          )}

          {!skipAnimation && !pathD && (
            <div className="hidden md:block absolute top-12 left-0 w-full h-1 bg-slate-200 rounded-full" />
          )}

          <div className="grid md:grid-cols-3 gap-12 relative z-10">
            {steps.map((item, i) => {
              const isActive = activeSteps[i];
              return (
                <div
                  key={i}
                  className="flex flex-col items-center text-center"
                  data-testid={`step-${item.step}`}
                >
                  <div
                    ref={(el) => { iconRefs.current[i] = el; }}
                    className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 shadow-xl relative bg-white border-4 transition-colors duration-500 ${
                      isActive ? "border-blue-600" : "border-slate-100"
                    }`}
                  >
                    <item.icon
                      className={`w-10 h-10 transition-colors duration-500 ${
                        isActive ? "text-blue-600" : "text-slate-400"
                      }`}
                    />
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-bold">
                      {item.step}
                    </div>

                    {i === 2 && allComplete && (
                      <div
                        className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center animate-bounce-in"
                        data-testid="completion-tick"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3,8 7,12 13,4" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-slate-600 leading-relaxed max-w-xs">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
