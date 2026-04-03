import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

const SCENE_DURATIONS = [4000, 4000, 3500, 4000, 3500];
const TOTAL_SCENES = SCENE_DURATIONS.length;

const sceneTransitions = {
  zoomThrough: {
    initial: { opacity: 0, scale: 0.5 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.5 },
    transition: { duration: 1, ease: "circOut" as const },
  },
  slideLeft: {
    initial: { opacity: 0, x: 100 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -100 },
    transition: { duration: 0.6, ease: "circOut" as const },
  },
  slideUp: {
    initial: { opacity: 0, y: 50 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -50 },
    transition: { duration: 0.6, ease: "circOut" as const },
  },
  clipCircle: {
    initial: { clipPath: "circle(0% at 50% 50%)" },
    animate: { clipPath: "circle(100% at 50% 50%)" },
    exit: { clipPath: "circle(0% at 50% 50%)" },
    transition: { duration: 1, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  },
  fadeBlur: {
    initial: { opacity: 0, filter: "blur(20px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
    exit: { opacity: 0, filter: "blur(20px)" },
    transition: { duration: 0.8, ease: "circOut" as const },
  },
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

function PersistentLayers({ currentScene, progress }: { currentScene: number; progress: number }) {
  const stepLabels = ["Intro", "Step 1", "Step 2", "Step 3", "Done"];

  const getWatermarkText = () => {
    if (currentScene === 1) return "01";
    if (currentScene === 2) return "02";
    if (currentScene === 3) return "03";
    return "";
  };

  const activeStepIndex = currentScene === 0 ? 0 : currentScene === 4 ? 3 : currentScene;

  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.06,
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E")',
        }}
      />

      <motion.div
        className="absolute pointer-events-none rounded-full"
        style={{
          width: "clamp(300px, 50vw, 800px)",
          height: "clamp(300px, 50vw, 800px)",
          filter: "blur(120px)",
          background: `radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)`,
        }}
        animate={{
          x: currentScene === 1 ? "5%" : currentScene === 2 ? "30%" : currentScene === 3 ? "55%" : "40%",
          y: currentScene === 0 ? "20%" : "5%",
          scale: currentScene === 4 ? 1.8 : 1,
        }}
        transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
      />

      <motion.div
        className="absolute pointer-events-none rounded-full"
        style={{
          width: "clamp(200px, 35vw, 600px)",
          height: "clamp(200px, 35vw, 600px)",
          filter: "blur(100px)",
          background: `radial-gradient(circle, rgba(96,165,250,0.07) 0%, transparent 70%)`,
        }}
        animate={{
          x: currentScene === 3 ? "50%" : currentScene === 2 ? "10%" : "65%",
          y: currentScene === 3 ? "30%" : "50%",
        }}
        transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
      />

      <AnimatePresence mode="wait">
        {currentScene > 0 && currentScene < 4 && (
          <motion.div
            key={`wm-${currentScene}`}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none font-black leading-none tracking-tighter"
            style={{ fontSize: "clamp(120px, 25vw, 300px)", color: `rgba(37,99,235,0.04)` }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            transition={{ duration: 1, ease: "easeOut" }}
          >
            {getWatermarkText()}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 right-0 px-6 md:px-16 pb-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between mb-3">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <motion.div
                  className="w-2.5 h-2.5 rounded-full"
                  animate={{
                    backgroundColor: i <= currentScene ? B.primary : B.line,
                    scale: i === currentScene ? 1.4 : 1,
                    boxShadow: i === currentScene ? `0 0 0 4px rgba(37,99,235,0.2)` : "none",
                  }}
                  transition={{ duration: 0.4 }}
                />
                <span className="text-[10px] font-medium hidden sm:block" style={{ color: i <= currentScene ? B.textSec : B.textMuted }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: B.line }}>
            <motion.div
              className="absolute top-0 left-0 h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${B.accent}, ${B.primary})` }}
              animate={{
                width: `${(currentScene / (TOTAL_SCENES - 1)) * 100}%`,
                background: currentScene >= 3 ? `linear-gradient(90deg, ${B.accent}, ${B.success})` : `linear-gradient(90deg, ${B.accent}, ${B.primary})`,
              }}
              transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
            />
            <motion.div
              className="absolute top-0 h-full rounded-full opacity-40"
              style={{
                background: B.accent,
                left: `${(currentScene / (TOTAL_SCENES - 1)) * 100}%`,
                width: `${(1 / (TOTAL_SCENES - 1)) * 100}%`,
                transformOrigin: "left center",
              }}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.1 }}
            />
          </div>

          <div className="relative h-1.5 mt-[-6px]">
            {[1, 2, 3].map((step) => (
              <motion.div
                key={step}
                className="absolute w-3 h-3 rounded-full -top-[3px]"
                style={{ left: `calc(${(step / 3) * 100}% - 6px)` }}
                animate={{
                  backgroundColor: activeStepIndex >= step ? (step === 3 ? B.success : B.primary) : B.bgMuted,
                  scale: activeStepIndex === step ? 1.5 : 1,
                  boxShadow: activeStepIndex === step ? `0 0 12px ${B.primary}` : "none",
                }}
                transition={{ duration: 0.5 }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function IntroScene() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center z-10"
      {...sceneTransitions.zoomThrough}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ staggerChildren: 0.1, delayChildren: 0.1 }}
        className="text-center max-w-3xl"
      >
        <motion.div
          className="flex justify-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute -inset-8 rounded-full border border-dashed"
              style={{ borderColor: `rgba(37,99,235,0.2)` }}
            />
            <div
              className="w-20 h-20 md:w-24 md:h-24 rounded-full shadow-2xl flex items-center justify-center relative z-10"
              style={{ background: "white", border: `1px solid ${B.bgMuted}`, color: B.primary }}
            >
              <IconScale className="w-8 h-8 md:w-10 md:h-10" />
            </div>
            <motion.div
              className="absolute -top-3 -right-3"
              style={{ color: B.accent }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.8, type: "spring" }}
            >
              <IconSparkles className="w-6 h-6 md:w-8 md:h-8" />
            </motion.div>
          </div>
        </motion.div>

        <motion.h2
          className="font-bold tracking-tight mb-6"
          style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", color: B.textPri, lineHeight: 1.1 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          From Facts to Draft.{" "}
          <span style={{ color: B.primary }}>Precision Flow.</span>
        </motion.h2>

        <motion.p
          className="max-w-xl mx-auto text-base md:text-lg leading-relaxed"
          style={{ color: B.textSec }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          No more blank-page guessing. A structured, predictable pipeline for generating California-focused legal letters.
        </motion.p>
      </motion.div>

      <motion.div
        className="hidden md:block absolute right-[8%] top-[18%] w-48 lg:w-56 bg-white/80 backdrop-blur-md rounded-xl shadow-xl p-4"
        style={{ border: `1px solid rgba(255,255,255,0.8)` }}
        initial={{ y: 50, opacity: 0, rotate: 10 }}
        animate={{ y: 0, opacity: 1, rotate: 5 }}
        transition={{ delay: 0.6, duration: 1, ease: "easeOut" }}
      >
        <div className="w-1/3 h-2 rounded mb-4" style={{ background: `rgba(37,99,235,0.2)` }} />
        <div className="w-full h-2 rounded mb-2" style={{ background: `rgba(37,99,235,0.08)` }} />
        <div className="w-5/6 h-2 rounded" style={{ background: `rgba(37,99,235,0.06)` }} />
      </motion.div>

      <motion.div
        className="hidden md:flex absolute left-[8%] bottom-[28%] w-36 lg:w-44 rounded-2xl shadow-2xl p-5 flex-col justify-end"
        style={{ background: B.primary, boxShadow: `0 25px 50px -12px rgba(37,99,235,0.3)`, aspectRatio: "1" }}
        initial={{ y: -50, opacity: 0, rotate: -15, scale: 0.8 }}
        animate={{ y: 0, opacity: 1, rotate: -10, scale: 1 }}
        transition={{ delay: 0.8, duration: 1, ease: "easeOut" }}
      >
        <div className="w-8 h-8 rounded-full mb-auto" style={{ background: "rgba(255,255,255,0.2)" }} />
        <div className="w-full h-1 rounded mt-4" style={{ background: "rgba(255,255,255,0.4)" }} />
      </motion.div>
    </motion.div>
  );
}

function Step1Scene() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-6 md:px-12 lg:px-20 z-10"
      {...sceneTransitions.slideLeft}
    >
      <div className="max-w-5xl w-full grid md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: B.primary }}>STEP 01</div>
          <h3 className="font-bold leading-tight mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)", color: B.textPri }}>
            Turn Your Facts<br />Into a Draft
          </h3>
          <p className="leading-relaxed text-base" style={{ color: B.textSec }}>
            Complete a guided intake form with the facts of your situation. The system structures your input into a California-focused legal-letter draft — no blank-page guessing.
          </p>

          <motion.div
            className="mt-6 space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {["Situation details", "Parties involved", "Desired outcome"].map((item, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-3 text-sm font-medium"
                style={{ color: B.textSec }}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.12, duration: 0.5 }}
              >
                <motion.div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: B.bgMuted, border: `1.5px solid ${B.accent}` }}
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ delay: 0.8 + i * 0.15, duration: 0.4 }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: B.primary }} />
                </motion.div>
                {item}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <div className="relative">
          <motion.div
            className="relative"
            initial={{ opacity: 0, scale: 0.8, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, type: "spring", damping: 20 }}
          >
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
                    <motion.div className="h-2.5 rounded-full mb-1.5" style={{ background: `rgba(37,99,235,0.15)` }}
                      initial={{ width: 0 }} animate={{ width: "60%" }} transition={{ delay: 0.6, duration: 0.5 }} />
                    <motion.div className="h-2 rounded-full" style={{ background: `rgba(37,99,235,0.08)` }}
                      initial={{ width: 0 }} animate={{ width: "40%" }} transition={{ delay: 0.75, duration: 0.5 }} />
                  </div>
                </div>

                {[1, 2, 3].map((i) => (
                  <motion.div key={i} className="flex items-center gap-3"
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.15 }}>
                    <div className="w-3.5 h-3.5 rounded-sm shrink-0" style={{ border: `2px solid rgba(37,99,235,0.3)` }} />
                    <div className="h-2.5 rounded w-full overflow-hidden" style={{ background: B.bgMuted }}>
                      <motion.div className="h-full rounded" style={{ background: `rgba(37,99,235,0.2)` }}
                        initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ delay: 1 + i * 0.2, duration: 0.8 }} />
                    </div>
                  </motion.div>
                ))}

                <motion.div className="flex items-center gap-2 pt-1"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: 0.4 }}>
                  <div className="h-2.5 rounded-full" style={{ width: "45%", background: `rgba(37,99,235,0.1)` }} />
                  <motion.div className="w-0.5 h-4 rounded-full" style={{ background: B.primary }}
                    animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
                </motion.div>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="absolute -left-4 md:-left-6 top-1/4 w-14 h-14 md:w-16 md:h-16 rounded-full shadow-lg flex items-center justify-center z-30"
            style={{ background: "white", border: `1px solid ${B.bgMuted}`, color: B.primary }}
            initial={{ opacity: 0, scale: 0, rotate: -45 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.8, type: "spring" }}
          >
            <IconDocument className="w-6 h-6 md:w-7 md:h-7" />
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: `2px solid ${B.primary}` }}
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
          </motion.div>

          <motion.div
            className="absolute -bottom-3 -right-3 px-4 py-2 rounded-xl shadow-lg text-sm font-semibold z-30"
            style={{ background: B.primary, color: "white" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.5, type: "spring", stiffness: 300 }}
          >
            ~5 min intake
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function Step2Scene() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-6 md:px-12 lg:px-20 z-10"
      {...sceneTransitions.slideUp}
    >
      <div className="max-w-5xl w-full grid md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center">
        <motion.div
          className="relative order-2 md:order-1"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          <div
            className="relative rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: "white", border: `1px solid rgba(37,99,235,0.1)`, minHeight: 260, boxShadow: `0 25px 50px -12px rgba(37,99,235,0.1)` }}
          >
            <motion.div
              className="absolute top-0 left-0 right-0 h-24 z-20 pointer-events-none"
              style={{
                background: `linear-gradient(to bottom, transparent, rgba(37,99,235,0.08), rgba(37,99,235,0.15))`,
                borderBottom: `2px solid ${B.primary}`,
              }}
              initial={{ y: "-100%" }}
              animate={{ y: "300%" }}
              transition={{ duration: 2, ease: "linear", repeat: Infinity }}
            />

            <div className="p-6 space-y-3 pt-8">
              {[...Array(6)].map((_, i) => (
                <motion.div key={i} className="h-3 rounded-full relative overflow-hidden"
                  style={{ width: `${95 - i * 5}%`, background: `rgba(37,99,235,${0.05 + i * 0.01})` }}>
                  <motion.div className="absolute inset-0 rounded-full"
                    style={{ background: `rgba(37,99,235,0.15)` }}
                    initial={{ x: "-100%" }} animate={{ x: "0%" }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.5, ease: "easeOut" }} />
                </motion.div>
              ))}
            </div>

            <motion.div
              className="absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-bold z-30"
              style={{ background: B.bgMuted, color: B.primary, border: `1px solid rgba(37,99,235,0.2)` }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              CA Law Applied
            </motion.div>
          </div>

          <motion.div
            className="absolute -right-3 md:-right-6 top-1/3 w-16 h-16 md:w-20 md:h-20 rounded-full shadow-2xl flex items-center justify-center z-30"
            style={{ background: B.primary, color: "white", boxShadow: `0 25px 50px -12px rgba(37,99,235,0.3)` }}
            initial={{ opacity: 0, scale: 0, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ delay: 0.8, type: "spring", damping: 15 }}
          >
            <IconSearch className="w-7 h-7 md:w-9 md:h-9" />
          </motion.div>

          {[...Array(4)].map((_, i) => (
            <motion.div
              key={`particle-${i}`}
              className="absolute h-0.5 rounded-full z-0 hidden md:block"
              style={{
                width: `${20 + i * 10}px`,
                background: B.primary,
                top: `${20 + i * 20}%`,
                left: "-10%",
              }}
              animate={{ x: [0, 300], opacity: [0, 0.6, 0] }}
              transition={{ duration: 1.5 + i * 0.3, repeat: Infinity, delay: i * 0.5, ease: "linear" }}
            />
          ))}
        </motion.div>

        <motion.div
          className="order-1 md:order-2"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: B.primary }}>STEP 02</div>
          <h3 className="font-bold leading-tight mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)", color: B.textPri }}>
            A Stronger Draft<br />in 10 Minutes
          </h3>
          <p className="leading-relaxed text-base" style={{ color: B.textSec }}>
            The drafting engine applies California legal language and repeatable letter workflows to generate a structured, review-ready draft fast.
          </p>

          <motion.div
            className="mt-6 p-4 rounded-xl flex items-center gap-4"
            style={{ background: B.bgMuted, border: `1px solid rgba(37,99,235,0.15)` }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="w-9 h-9 shrink-0" style={{ color: B.primary }}>
              <IconSparkles className="w-9 h-9" />
            </div>
            <div>
              <div className="font-semibold text-sm" style={{ color: B.textPri }}>California-Specific Language</div>
              <div className="text-xs mt-0.5" style={{ color: B.textSec }}>Cites relevant state statutes & case law</div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function Step3Scene() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-6 md:px-12 lg:px-20 z-10"
      {...sceneTransitions.clipCircle}
    >
      <div className="max-w-5xl w-full grid md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: B.success }}>STEP 03</div>
          <h3 className="font-bold leading-tight mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)", color: B.textPri }}>
            Review With an<br />Attorney or Send
          </h3>
          <p className="leading-relaxed text-base" style={{ color: B.textSec }}>
            Your draft is ready for attorney review or self-organized use. A licensed California attorney can review, edit, and approve before delivery on official law firm letterhead.
          </p>

          <motion.div className="mt-6 space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            {["Attorney reviews & signs off", "Delivered as authoritative PDF", "100% confidential & secure"].map((item, i) => (
              <motion.div key={i} className="flex items-center gap-3 text-sm font-medium" style={{ color: B.textSec }}
                initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.5 + i * 0.12 }}>
                <motion.div
                  className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                  style={{ background: "rgba(0,196,140,0.12)", border: "1.5px solid #00C48C" }}
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ delay: 0.7 + i * 0.1, type: "spring", stiffness: 300 }}
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 3.5,7 9,1" stroke="#00C48C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </motion.div>
                {item}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          className="flex items-center justify-center"
          initial={{ opacity: 0, rotate: -5, y: 50 }}
          animate={{ opacity: 1, rotate: 0, y: 0 }}
          transition={{ duration: 0.8, type: "spring", damping: 20 }}
        >
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
                <motion.div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ border: `3px solid ${B.success}`, color: B.success, transform: "rotate(12deg)" }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.8 }}
                  transition={{ delay: 1, type: "spring", stiffness: 500, damping: 15 }}
                >
                  <div className="font-bold text-[10px] uppercase tracking-widest text-center leading-tight">
                    App<br />roved
                  </div>
                </motion.div>
              </div>
            </div>

            <motion.div
              className="absolute -right-4 md:-right-6 top-1/4 w-16 h-16 md:w-20 md:h-20 rounded-full shadow-2xl flex items-center justify-center z-30"
              style={{ background: B.success, color: "white", boxShadow: `0 25px 50px -12px rgba(0,196,140,0.4)` }}
              initial={{ opacity: 0, scale: 0, rotate: 45 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ delay: 1.2, type: "spring", damping: 12 }}
            >
              <IconCheckmark className="w-8 h-8 md:w-10 md:h-10" />
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: `2px solid ${B.success}` }}
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ delay: 1.2, duration: 1, ease: "easeOut" }}
              />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function OutroScene() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center z-10"
      {...sceneTransitions.fadeBlur}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none -z-10">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute top-1/2 left-1/2 rounded-full"
            style={{ x: "-50%", y: "-50%", border: `1px solid rgba(37,99,235,${0.15 - i * 0.04})` }}
            initial={{ width: 40, height: 40, opacity: 0 }}
            animate={{
              width: [40, 200 + i * 120],
              height: [40, 200 + i * 120],
              opacity: [0, 0.5, 0],
            }}
            transition={{ duration: 3, delay: i * 0.4, repeat: Infinity, ease: "linear" }}
          />
        ))}
      </div>

      <motion.div
        className="relative z-10"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8 }}
      >
        <motion.div
          className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-8 mx-auto"
          style={{ background: `rgba(37,99,235,0.1)`, color: B.primary }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10">
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </motion.div>

        <motion.h2
          className="font-bold tracking-tight mb-4"
          style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", color: B.textPri, lineHeight: 1.1 }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Ready to Send.
        </motion.h2>

        <motion.p
          className="text-base md:text-lg max-w-md mx-auto"
          style={{ color: B.textSec }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          Your facts. California law. Expertly structured.
        </motion.p>

        <motion.div
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${B.primary}, ${B.dark})` }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
          Download PDF
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function HowItWorks() {
  const [currentScene, setCurrentScene] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(Date.now());
  const sectionRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    startRef.current = Date.now();
    setProgress(0);

    const duration = SCENE_DURATIONS[currentScene];

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.min(elapsed / duration, 1));
      if (elapsed < duration) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    timerRef.current = setTimeout(() => {
      setCurrentScene(prev => (prev + 1) % TOTAL_SCENES);
    }, duration);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [currentScene, inView]);

  const scenes = [IntroScene, Step1Scene, Step2Scene, Step3Scene, OutroScene];
  const CurrentScene = scenes[currentScene];

  return (
    <section
      ref={sectionRef}
      data-testid="how-it-works-section"
      className="relative w-full overflow-hidden"
      style={{ background: B.bg, minHeight: "100svh", borderTop: `1px solid ${B.line}`, borderBottom: `1px solid ${B.line}` }}
    >
      <PersistentLayers currentScene={currentScene} progress={progress} />

      <AnimatePresence mode="wait">
        <CurrentScene key={`scene-${currentScene}`} />
      </AnimatePresence>

      <div className="absolute top-6 right-6 flex gap-2 z-20" data-testid="scene-navigation-dots">
        {Array.from({ length: TOTAL_SCENES }).map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentScene(i)}
            className="w-2.5 h-2.5 rounded-full transition-all duration-300 cursor-pointer"
            style={{
              background: i === currentScene ? B.primary : `rgba(37,99,235,0.2)`,
              transform: i === currentScene ? "scale(1.4)" : "scale(1)",
              boxShadow: i === currentScene ? `0 0 0 3px rgba(37,99,235,0.15)` : "none",
            }}
            aria-label={`Go to scene ${i + 1}`}
            data-testid={`scene-dot-${i}`}
          />
        ))}
      </div>
    </section>
  );
}
