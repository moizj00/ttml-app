import { useRef, useEffect, useState } from "react";
import { motion, useTransform, useSpring, useMotionValue, useReducedMotion } from "framer-motion";

const B = {
  primary:   "#2563eb",
  accent:    "#60a5fa",
  dark:      "#1d4ed8",
  bg:        "#FAFAFF",
  bgMuted:   "#dbeafe",
  textPri:   "#0f172a",
  textSec:   "#475569",
  textMuted: "#94a3b8",
  success:   "#00C48C",
  line:      "rgba(37,99,235,0.12)",
};

function IconScale({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3v18" />
      <path d="m3 7 9-4 9 4" />
      <path d="m5 7 2 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l2-11" />
      <path d="M8 20h8" />
    </svg>
  );
}

function IconSparkles({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

function IconDocument({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconCheckmark({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function useScrollProgress(containerRef: React.RefObject<HTMLDivElement | null>) {
  const scrollYProgress = useMotionValue(0);
  const lockedRef = useRef(false);
  const virtualProgressRef = useRef(0);
  const touchStartYRef = useRef(0);
  const prevBodyOverflowRef = useRef("");
  const prevBodyTouchActionRef = useRef("");
  const scrollSpeedFactor = 0.0008;
  const touchSpeedFactor = 0.002;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isStickyActive = () => {
      const rect = el.getBoundingClientRect();
      return rect.top <= 0 && rect.bottom >= window.innerHeight;
    };

    const lockScroll = () => {
      if (!lockedRef.current) {
        prevBodyOverflowRef.current = document.body.style.overflow;
        prevBodyTouchActionRef.current = document.body.style.touchAction;
        lockedRef.current = true;
        document.body.style.overflow = "hidden";
        document.body.style.touchAction = "none";
      }
    };

    const unlockScroll = () => {
      if (lockedRef.current) {
        lockedRef.current = false;
        document.body.style.overflow = prevBodyOverflowRef.current;
        document.body.style.touchAction = prevBodyTouchActionRef.current;
      }
    };

    const repositionAndUnlock = (atEnd: boolean) => {
      unlockScroll();
      const scrollableHeight = el.scrollHeight - window.innerHeight;
      const rect = el.getBoundingClientRect();
      const targetScrollTop = atEnd
        ? window.scrollY + rect.top + scrollableHeight
        : window.scrollY + rect.top;
      window.scrollTo({ top: targetScrollTop, behavior: "auto" });
    };

    const shouldLock = (progress: number, delta: number) => {
      if (progress > 0 && progress < 1) return true;
      if (progress <= 0 && delta > 0) return true;
      if (progress >= 1 && delta < 0) return true;
      return false;
    };

    const onScroll = () => {
      if (lockedRef.current) return;

      if (!isStickyActive()) return;

      const rect = el.getBoundingClientRect();
      const scrollableHeight = el.scrollHeight - window.innerHeight;
      if (scrollableHeight <= 0) return;
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / scrollableHeight));
      virtualProgressRef.current = progress;
      scrollYProgress.set(progress);

      if (progress > 0 && progress < 1) {
        lockScroll();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!lockedRef.current) {
        if (!isStickyActive()) return;

        const rect = el.getBoundingClientRect();
        const scrollableHeight = el.scrollHeight - window.innerHeight;
        if (scrollableHeight <= 0) return;
        const scrolled = -rect.top;
        const progress = Math.max(0, Math.min(1, scrolled / scrollableHeight));
        virtualProgressRef.current = progress;
        scrollYProgress.set(progress);

        if (shouldLock(progress, e.deltaY)) {
          lockScroll();
          e.preventDefault();
        }
        return;
      }

      e.preventDefault();

      const delta = e.deltaY * scrollSpeedFactor;
      const newProgress = Math.max(0, Math.min(1, virtualProgressRef.current + delta));
      virtualProgressRef.current = newProgress;
      scrollYProgress.set(newProgress);

      if (newProgress <= 0 && delta < 0) {
        repositionAndUnlock(false);
      } else if (newProgress >= 1 && delta > 0) {
        repositionAndUnlock(true);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const touchY = e.touches[0].clientY;
      const touchDelta = touchStartYRef.current - touchY;

      if (!lockedRef.current) {
        if (!isStickyActive()) return;

        const rect = el.getBoundingClientRect();
        const scrollableHeight = el.scrollHeight - window.innerHeight;
        if (scrollableHeight <= 0) return;
        const scrolled = -rect.top;
        const progress = Math.max(0, Math.min(1, scrolled / scrollableHeight));
        virtualProgressRef.current = progress;
        scrollYProgress.set(progress);

        if (shouldLock(progress, touchDelta)) {
          lockScroll();
          e.preventDefault();
        }
        touchStartYRef.current = touchY;
        return;
      }

      e.preventDefault();

      const delta = touchDelta * touchSpeedFactor;
      touchStartYRef.current = touchY;

      const newProgress = Math.max(0, Math.min(1, virtualProgressRef.current + delta));
      virtualProgressRef.current = newProgress;
      scrollYProgress.set(newProgress);

      if (newProgress <= 0 && delta < 0) {
        repositionAndUnlock(false);
      } else if (newProgress >= 1 && delta > 0) {
        repositionAndUnlock(true);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      unlockScroll();
    };
  }, [containerRef, scrollYProgress]);

  return scrollYProgress;
}

const PANELS = [
  { id: "intro", label: "Intro" },
  { id: "step1", label: "Step 1" },
  { id: "step2", label: "Step 2" },
  { id: "step3", label: "Step 3" },
  { id: "outro", label: "Done" },
];

function IntroPanel() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 sm:px-6 text-center">
      <div className="relative mb-6 sm:mb-8">
        <motion.div
          animate={prefersReducedMotion ? {} : { rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -inset-6 sm:-inset-8 rounded-full border border-dashed"
          style={{ borderColor: `rgba(37,99,235,0.2)` }}
        />
        <div
          className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full shadow-2xl flex items-center justify-center relative z-10"
          style={{ background: "white", border: `1px solid ${B.bgMuted}`, color: B.primary }}
        >
          <IconScale className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10" />
        </div>
        <div className="absolute -top-3 -right-3" style={{ color: B.accent }}>
          <IconSparkles className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
        </div>
      </div>

      <h2
        className="font-bold tracking-tight mb-4 sm:mb-6"
        style={{ fontSize: "clamp(1.5rem, 5vw, 3.5rem)", color: B.textPri, lineHeight: 1.1 }}
      >
        From Facts to Draft.{" "}
        <span style={{ color: B.primary }}>Precision Flow.</span>
      </h2>

      <p
        className="max-w-xl mx-auto text-sm sm:text-base md:text-lg leading-relaxed"
        style={{ color: B.textSec }}
      >
        No more blank-page guessing. A structured, predictable pipeline for generating California-focused legal letters.
      </p>
    </div>
  );
}

function Step1Panel() {
  return (
    <div className="flex items-center justify-center h-full px-4 sm:px-6 md:px-12 lg:px-20 py-4 sm:py-0 overflow-y-auto">
      <div className="max-w-5xl w-full grid md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 lg:gap-16 items-center">
        <div>
          <div className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: B.primary }}>STEP 01</div>
          <h3 className="font-bold leading-tight mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)", color: B.textPri }}>
            Turn Your Facts<br />Into a Draft
          </h3>
          <p className="leading-relaxed text-base" style={{ color: B.textSec }}>
            Complete a guided intake form with the facts of your situation. The system structures your input into a California-focused legal-letter draft — no blank-page guessing.
          </p>
          <div className="mt-6 space-y-3">
            {["Situation details", "Parties involved", "Desired outcome"].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm font-medium" style={{ color: B.textSec }}>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: B.bgMuted, border: `1.5px solid ${B.accent}` }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: B.primary }} />
                </div>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div
            className="rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: "white", border: `1px solid rgba(37,99,235,0.1)`, boxShadow: `0 25px 50px -12px rgba(37,99,235,0.1)` }}
          >
            <div className="flex items-center gap-2 px-4 h-9 border-b" style={{ background: "#f8fafc", borderColor: "rgba(37,99,235,0.08)" }}>
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
              <div className="ml-3 flex-1 h-4 rounded-md" style={{ background: "rgba(37,99,235,0.06)" }} />
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: "rgba(37,99,235,0.08)" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: B.bgMuted, color: B.primary }}>
                  <IconScale className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="h-2.5 rounded-full mb-1.5" style={{ background: `rgba(37,99,235,0.15)`, width: "60%" }} />
                  <div className="h-2 rounded-full" style={{ background: `rgba(37,99,235,0.08)`, width: "40%" }} />
                </div>
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3.5 h-3.5 rounded-sm shrink-0" style={{ border: `2px solid rgba(37,99,235,0.3)` }} />
                  <div className="h-2.5 rounded w-full" style={{ background: `rgba(37,99,235,0.12)` }} />
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <div className="h-2.5 rounded-full" style={{ width: "45%", background: `rgba(37,99,235,0.1)` }} />
                <div className="w-0.5 h-4 rounded-full animate-pulse" style={{ background: B.primary }} />
              </div>
            </div>
          </div>

          <div
            className="absolute -left-4 md:-left-6 top-1/4 w-14 h-14 md:w-16 md:h-16 rounded-full shadow-lg flex items-center justify-center z-30"
            style={{ background: "white", border: `1px solid ${B.bgMuted}`, color: B.primary }}
          >
            <IconDocument className="w-6 h-6 md:w-7 md:h-7" />
          </div>

          <div
            className="absolute -bottom-3 -right-3 px-4 py-2 rounded-xl shadow-lg text-sm font-semibold z-30"
            style={{ background: B.primary, color: "white" }}
          >
            ~5 min intake
          </div>
        </div>
      </div>
    </div>
  );
}

function Step2Panel() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <div className="flex items-center justify-center h-full px-4 sm:px-6 md:px-12 lg:px-20 py-4 sm:py-0 overflow-y-auto">
      <div className="max-w-5xl w-full grid md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 lg:gap-16 items-center">
        <div className="relative order-2 md:order-1">
          <div
            className="relative rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: "white", border: `1px solid rgba(37,99,235,0.1)`, minHeight: 260, boxShadow: `0 25px 50px -12px rgba(37,99,235,0.1)` }}
          >
            {!prefersReducedMotion && (
            <motion.div
              className="absolute top-0 left-0 right-0 h-24 z-20 pointer-events-none"
              style={{
                background: `linear-gradient(to bottom, transparent, rgba(37,99,235,0.08), rgba(37,99,235,0.15))`,
                borderBottom: `2px solid ${B.primary}`,
              }}
              animate={{ y: ["-100%", "300%"] }}
              transition={{ duration: 2, ease: "linear", repeat: Infinity }}
            />
            )}
            <div className="p-6 space-y-3 pt-8">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-3 rounded-full"
                  style={{ width: `${95 - i * 5}%`, background: `rgba(37,99,235,${0.08 + i * 0.015})` }} />
              ))}
            </div>
            <div
              className="absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-bold z-30"
              style={{ background: B.bgMuted, color: B.primary, border: `1px solid rgba(37,99,235,0.2)` }}
            >
              CA Law Applied
            </div>
          </div>
          <div
            className="absolute -right-3 md:-right-6 top-1/3 w-16 h-16 md:w-20 md:h-20 rounded-full shadow-2xl flex items-center justify-center z-30"
            style={{ background: B.primary, color: "white", boxShadow: `0 25px 50px -12px rgba(37,99,235,0.3)` }}
          >
            <IconSearch className="w-7 h-7 md:w-9 md:h-9" />
          </div>
        </div>

        <div className="order-1 md:order-2">
          <div className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: B.primary }}>STEP 02</div>
          <h3 className="font-bold leading-tight mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)", color: B.textPri }}>
            A Stronger Draft<br />in 10 Minutes
          </h3>
          <p className="leading-relaxed text-base" style={{ color: B.textSec }}>
            The drafting engine applies California legal language and repeatable letter workflows to generate a structured, review-ready draft fast.
          </p>
          <div
            className="mt-6 p-4 rounded-xl flex items-center gap-4"
            style={{ background: B.bgMuted, border: `1px solid rgba(37,99,235,0.15)` }}
          >
            <div className="w-9 h-9 shrink-0" style={{ color: B.primary }}>
              <IconSparkles className="w-9 h-9" />
            </div>
            <div>
              <div className="font-semibold text-sm" style={{ color: B.textPri }}>California-Specific Language</div>
              <div className="text-xs mt-0.5" style={{ color: B.textSec }}>Cites relevant state statutes & case law</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step3Panel() {
  return (
    <div className="flex items-center justify-center h-full px-4 sm:px-6 md:px-12 lg:px-20 py-4 sm:py-0 overflow-y-auto">
      <div className="max-w-5xl w-full grid md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 lg:gap-16 items-center">
        <div>
          <div className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: B.success }}>STEP 03</div>
          <h3 className="font-bold leading-tight mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)", color: B.textPri }}>
            Review With an<br />Attorney or Send
          </h3>
          <p className="leading-relaxed text-base" style={{ color: B.textSec }}>
            Your draft is ready for attorney review or self-organized use. A licensed California attorney can review, edit, and approve before delivery on official law firm letterhead.
          </p>
          <div className="mt-6 space-y-3">
            {["Attorney reviews & signs off", "Delivered as authoritative PDF", "100% confidential & secure"].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm font-medium" style={{ color: B.textSec }}>
                <div
                  className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                  style={{ background: "rgba(0,196,140,0.12)", border: "1.5px solid #00C48C" }}
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 3.5,7 9,1" stroke="#00C48C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="relative">
            <div
              className="relative rounded-2xl shadow-2xl p-6 md:p-8 flex flex-col w-56 md:w-64"
              style={{ background: "white", border: `1.5px solid rgba(0,196,140,0.2)`, minHeight: 280, boxShadow: `0 25px 50px -12px rgba(0,196,140,0.1)` }}
            >
              <div className="w-1/3 h-3 rounded mb-6" style={{ background: B.primary }} />
              <div className="flex-1 space-y-3">
                <div className="w-full h-2.5 rounded" style={{ background: `rgba(37,99,235,0.08)` }} />
                <div className="w-5/6 h-2.5 rounded" style={{ background: `rgba(37,99,235,0.06)` }} />
                <div className="w-full h-2.5 rounded" style={{ background: `rgba(37,99,235,0.08)` }} />
                <div className="w-4/6 h-2.5 rounded" style={{ background: `rgba(37,99,235,0.05)` }} />
              </div>
              <div className="mt-auto pt-6 border-t flex justify-between items-end" style={{ borderColor: B.bgMuted }}>
                <div>
                  <div className="w-20 h-2 rounded mb-1.5" style={{ background: `rgba(37,99,235,0.15)` }} />
                  <div className="w-28 h-1 rounded" style={{ background: `rgba(37,99,235,0.08)` }} />
                </div>
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ border: `3px solid ${B.success}`, color: B.success, transform: "rotate(12deg)", opacity: 0.8 }}
                >
                  <div className="font-bold text-[10px] uppercase tracking-widest text-center leading-tight">
                    App<br />roved
                  </div>
                </div>
              </div>
            </div>
            <div
              className="absolute -right-4 md:-right-6 top-1/4 w-16 h-16 md:w-20 md:h-20 rounded-full shadow-2xl flex items-center justify-center z-30"
              style={{ background: B.success, color: "white", boxShadow: `0 25px 50px -12px rgba(0,196,140,0.4)` }}
            >
              <IconCheckmark className="w-8 h-8 md:w-10 md:h-10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutroPanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 sm:px-6 text-center">
      <div
        className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full mb-6 sm:mb-8 mx-auto"
        style={{ background: `rgba(37,99,235,0.1)`, color: B.primary }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 sm:w-10 sm:h-10">
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
      </div>

      <h2
        className="font-bold tracking-tight mb-4"
        style={{ fontSize: "clamp(1.5rem, 5vw, 3.5rem)", color: B.textPri, lineHeight: 1.1 }}
      >
        Ready to Send.
      </h2>

      <p
        className="text-sm sm:text-base md:text-lg max-w-md mx-auto"
        style={{ color: B.textSec }}
      >
        Your facts. California law. Expertly structured.
      </p>

      <div
        className="mt-6 sm:mt-8 inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full text-sm font-semibold text-white shadow-lg"
        style={{ background: `linear-gradient(135deg, ${B.primary}, ${B.dark})` }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
        Download PDF
      </div>
    </div>
  );
}

function ProgressBar({ scrollProgress }: { scrollProgress: ReturnType<typeof useMotionValue<number>> }) {
  const smoothProgress = useSpring(scrollProgress, { stiffness: 100, damping: 30 });
  const width = useTransform(smoothProgress, [0, 1], ["0%", "100%"]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const unsub = scrollProgress.on("change", (v: number) => {
      const idx = Math.min(Math.floor(v * PANELS.length), PANELS.length - 1);
      setActiveIndex(idx);
    });
    return unsub;
  }, [scrollProgress]);

  return (
    <div className="absolute bottom-0 left-0 right-0 px-6 md:px-16 pb-8 z-30">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between mb-3">
          {PANELS.map((panel, i) => (
            <div key={panel.id} className="flex flex-col items-center gap-1">
              <motion.div
                className="w-2.5 h-2.5 rounded-full"
                animate={{
                  backgroundColor: i <= activeIndex ? B.primary : B.line,
                  scale: i === activeIndex ? 1.4 : 1,
                  boxShadow: i === activeIndex ? `0 0 0 4px rgba(37,99,235,0.2)` : "none",
                }}
                transition={{ duration: 0.4 }}
              />
              <span className="text-[10px] font-medium hidden sm:block" style={{ color: i <= activeIndex ? B.textSec : B.textMuted }}>
                {panel.label}
              </span>
            </div>
          ))}
        </div>

        <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: B.line }}>
          <motion.div
            className="absolute top-0 left-0 h-full rounded-full"
            style={{
              width,
              background: `linear-gradient(90deg, ${B.accent}, ${B.primary})`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const scrollProgress = useScrollProgress(containerRef);
  const smoothProgress = useSpring(scrollProgress, prefersReducedMotion ? { stiffness: 300, damping: 50 } : { stiffness: 80, damping: 30 });
  const translateX = useTransform(smoothProgress, [0, 1], ["0%", `-${(PANELS.length - 1) * 100}%`]);

  return (
    <section
      ref={containerRef}
      data-testid="how-it-works-section"
      className="relative"
      style={{
        height: `${PANELS.length * 100}vh`,
        borderTop: `1px solid ${B.line}`,
        borderBottom: `1px solid ${B.line}`,
      }}
    >
      <div
        className="sticky top-0 h-screen w-full overflow-hidden"
        style={{ background: B.bg }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: 0.06,
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E")',
          }}
        />

        <motion.div
          className="absolute pointer-events-none rounded-full hidden sm:block"
          style={{
            width: "clamp(300px, 50vw, 800px)",
            height: "clamp(300px, 50vw, 800px)",
            filter: "blur(120px)",
            background: `radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)`,
            x: useTransform(smoothProgress, [0, 0.25, 0.5, 0.75, 1], ["40%", "5%", "30%", "55%", "40%"]),
            y: useTransform(smoothProgress, [0, 0.25], ["20%", "5%"]),
          }}
        />

        <motion.div
          className="absolute pointer-events-none rounded-full hidden sm:block"
          style={{
            width: "clamp(200px, 35vw, 600px)",
            height: "clamp(200px, 35vw, 600px)",
            filter: "blur(100px)",
            background: `radial-gradient(circle, rgba(96,165,250,0.07) 0%, transparent 70%)`,
            x: useTransform(smoothProgress, [0, 0.5, 0.75, 1], ["65%", "10%", "50%", "65%"]),
            y: useTransform(smoothProgress, [0, 0.75], ["50%", "30%"]),
          }}
        />

        <motion.div
          className="flex h-full"
          style={{
            width: `${PANELS.length * 100}%`,
            x: translateX,
          }}
        >
          {[IntroPanel, Step1Panel, Step2Panel, Step3Panel, OutroPanel].map((Panel, i) => (
            <div
              key={PANELS[i].id}
              className="h-full flex-shrink-0"
              style={{ width: `${100 / PANELS.length}%` }}
            >
              <Panel />
            </div>
          ))}
        </motion.div>

        <ProgressBar scrollProgress={scrollProgress} />
      </div>
    </section>
  );
}
