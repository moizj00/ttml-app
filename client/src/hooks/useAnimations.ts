import { useState, useEffect, useRef } from "react";

export function useReducedMotion(): boolean {
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

export function useStaggerReveal(itemCount: number, staggerMs = 60): boolean[] {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState<boolean[]>(() =>
    Array(itemCount).fill(reduced)
  );
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if (reduced) {
      setVisible(Array(itemCount).fill(true));
      return;
    }
    if (itemCount === 0) {
      setVisible([]);
      return;
    }

    if (itemCount !== prevCount.current) {
      setVisible(Array(itemCount).fill(false));
      prevCount.current = itemCount;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < itemCount; i++) {
      timers.push(
        setTimeout(() => {
          setVisible(prev => {
            if (prev[i]) return prev;
            const next = [...prev];
            next[i] = true;
            return next;
          });
        }, 80 + i * staggerMs)
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [itemCount, staggerMs, reduced]);

  return visible;
}

export function useCountUp(target: number, durationMs = 600): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const prevTarget = useRef(target);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    if (target === prevTarget.current && value === target) return;
    prevTarget.current = target;

    const start = performance.now();
    const startVal = 0;
    let raf: number;

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(startVal + (target - startVal) * eased));
      if (progress < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);

  return value;
}

export function staggerStyle(index: number, visible: boolean): React.CSSProperties {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(16px)",
    transition: `opacity 420ms cubic-bezier(0.16, 1, 0.3, 1), transform 420ms cubic-bezier(0.16, 1, 0.3, 1)`,
  };
}

export function fadeStyle(visible: boolean): React.CSSProperties {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(12px)",
    transition: `opacity 320ms cubic-bezier(0.16, 1, 0.3, 1), transform 320ms cubic-bezier(0.16, 1, 0.3, 1)`,
  };
}

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, [reduced]);
  return mounted;
}

export function useProgressFill(targetPercent: number, delayMs = 300): number {
  const reduced = useReducedMotion();
  const [fill, setFill] = useState(reduced ? targetPercent : 0);

  useEffect(() => {
    if (reduced) {
      setFill(targetPercent);
      return;
    }
    const timer = setTimeout(() => setFill(targetPercent), delayMs);
    return () => clearTimeout(timer);
  }, [targetPercent, delayMs, reduced]);

  return fill;
}

export function useStepTransition(step: number): {
  displayStep: number;
  transitioning: boolean;
  direction: "forward" | "backward";
} {
  const reduced = useReducedMotion();
  const [displayStep, setDisplayStep] = useState(step);
  const [transitioning, setTransitioning] = useState(false);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const prevStep = useRef(step);

  useEffect(() => {
    if (reduced || step === prevStep.current) {
      setDisplayStep(step);
      prevStep.current = step;
      return;
    }
    setDirection(step > prevStep.current ? "forward" : "backward");
    setTransitioning(true);
    const t1 = setTimeout(() => {
      setDisplayStep(step);
      setTransitioning(false);
    }, 180);
    prevStep.current = step;
    return () => clearTimeout(t1);
  }, [step, reduced]);

  return { displayStep, transitioning, direction };
}
