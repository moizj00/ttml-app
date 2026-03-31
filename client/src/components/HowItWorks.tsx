import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Brand colours (blue only) ───────────────────────────────────────────────
const B = {
  primary:   "#2563eb",   // blue-600
  accent:    "#60a5fa",   // blue-400
  dark:      "#1d4ed8",   // blue-700
  bg:        "#FAFAFF",
  bgMuted:   "#dbeafe",   // blue-100
  textPri:   "#0f172a",
  textSec:   "#475569",
  textMuted: "#94a3b8",
  success:   "#00C48C",
  line:      "rgba(37,99,235,0.12)",
};

const SCENE_DURATIONS = [4000, 4000, 3500, 4000, 3500];
const TOTAL_SCENES = SCENE_DURATIONS.length;

// ─── Easing ──────────────────────────────────────────────────────────────────
const ease = [0.21, 0.47, 0.32, 0.98] as const;

// ─── Icons ───────────────────────────────────────────────────────────────────
function IconDocument() {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="6" y="4" width="24" height="32" rx="3" fill={B.bgMuted} stroke={B.primary} strokeWidth="1.5"/>
      <rect x="10" y="12" width="16" height="2" rx="1" fill={B.primary} opacity="0.5"/>
      <rect x="10" y="17" width="16" height="2" rx="1" fill={B.primary} opacity="0.4"/>
      <rect x="10" y="22" width="12" height="2" rx="1" fill={B.primary} opacity="0.3"/>
      <rect x="10" y="27" width="8" height="2" rx="1" fill={B.primary} opacity="0.2"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="18" cy="18" r="10" stroke={B.primary} strokeWidth="2" fill={B.bgMuted}/>
      <line x1="25.5" y1="25.5" x2="34" y2="34" stroke={B.primary} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="18" cy="18" r="5" fill={B.primary} opacity="0.2"/>
    </svg>
  );
}

function IconCheckmark() {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="20" cy="20" r="16" fill={B.success} opacity="0.15"/>
      <circle cx="20" cy="20" r="12" fill={B.success} opacity="0.25"/>
      <polyline points="12,21 18,27 28,14" stroke={B.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconScale() {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <line x1="20" y1="6" x2="20" y2="34" stroke={B.primary} strokeWidth="2" strokeLinecap="round"/>
      <line x1="8" y1="10" x2="32" y2="10" stroke={B.primary} strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 10 L4 20 Q8 26 12 20 L8 10Z" fill={B.bgMuted} stroke={B.primary} strokeWidth="1.5"/>
      <path d="M32 10 L28 20 Q32 26 36 20 L32 10Z" fill={B.bgMuted} stroke={B.primary} strokeWidth="1.5"/>
      <rect x="15" y="32" width="10" height="3" rx="1.5" fill={B.primary} opacity="0.4"/>
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M20 4 L22 16 L34 20 L22 24 L20 36 L18 24 L6 20 L18 16 Z" fill={B.primary} opacity="0.3" stroke={B.primary} strokeWidth="1.2" strokeLinejoin="round"/>
      <circle cx="32" cy="10" r="2" fill={B.accent}/>
      <circle cx="10" cy="10" r="1.5" fill={B.accent} opacity="0.6"/>
    </svg>
  );
}

// ─── Persistent Layers ───────────────────────────────────────────────────────
function PersistentLayers({ currentScene, progress }: { currentScene: number; progress: number }) {
  const stepLabels = ["Intro", "Step 1", "Step 2", "Step 3", "Done"];

  return (
    <>
      {/* Drifting blue blob */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: 560, height: 560,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)`,
          top: "-10%", right: "-5%",
        }}
        animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute pointer-events-none"
        style={{
          width: 400, height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(96,165,250,0.07) 0%, transparent 70%)`,
          bottom: "5%", left: "-5%",
        }}
        animate={{ x: [0, -20, 30, 0], y: [0, 30, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Watermark step number */}
      <AnimatePresence mode="wait">
        {currentScene > 0 && currentScene < 4 && (
          <motion.div
            key={`wm-${currentScene}`}
            className="absolute right-8 md:right-16 top-1/2 -translate-y-1/2 select-none pointer-events-none font-black leading-none"
            style={{ fontSize: "clamp(120px,20vw,220px)", color: `rgba(37,99,235,0.045)` }}
            initial={{ opacity: 0, scale: 1.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.7, ease }}
          >
            0{currentScene}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress pipeline bar */}
      <div className="absolute bottom-0 left-0 right-0 px-6 md:px-16 pb-8">
        <div className="max-w-2xl mx-auto">
          {/* Step dots + labels */}
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

          {/* Progress track */}
          <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: B.line }}>
            <motion.div
              className="absolute top-0 left-0 h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${B.accent}, ${B.primary})` }}
              animate={{ width: `${((currentScene) / (TOTAL_SCENES - 1)) * 100}%` }}
              transition={{ duration: 0.6, ease }}
            />
            {/* Inner scene progress */}
            <motion.div
              className="absolute top-0 h-full rounded-full opacity-40"
              style={{
                background: B.accent,
                left: `${((currentScene) / (TOTAL_SCENES - 1)) * 100}%`,
                width: `${(1 / (TOTAL_SCENES - 1)) * 100}%`,
                transformOrigin: "left center",
              }}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Scene: Intro ─────────────────────────────────────────────────────────────
function IntroScene() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        initial={{ opacity: 0, filter: "blur(12px)", y: 20 }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{ duration: 1, ease }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold mb-8"
          style={{ borderColor: `rgba(37,99,235,0.2)`, background: "rgba(37,99,235,0.06)", color: B.primary }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: B.primary }} />
          How It Works
        </div>

        <h2 className="font-bold tracking-tight mb-6" style={{ fontSize: "clamp(2rem,5vw,3.5rem)", color: B.textPri, lineHeight: 1.1 }}>
          From Facts to Draft.{" "}
          <span style={{ color: B.primary }}>Precision Flow.</span>
        </h2>

        <p className="max-w-xl mx-auto text-lg leading-relaxed" style={{ color: B.textSec }}>
          Turn your situation into a structured, attorney-ready California legal letter in minutes — not days.
        </p>
      </motion.div>

      {/* Animated document lines */}
      <motion.div
        className="mt-12 flex gap-3 items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
      >
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="rounded-full"
            style={{ height: 4, background: `linear-gradient(90deg, ${B.accent}, ${B.primary})` }}
            initial={{ width: 0 }}
            animate={{ width: i === 0 ? 80 : i === 1 ? 120 : 60 }}
            transition={{ delay: 0.8 + i * 0.15, duration: 0.6, ease }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}

// ─── Scene: Step 1 ───────────────────────────────────────────────────────────
function Step1Scene() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-4xl w-full grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        {/* Text */}
        <motion.div
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease }}
        >
          <div className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: B.primary }}>Step 01</div>
          <h3 className="font-bold leading-tight mb-4" style={{ fontSize: "clamp(1.5rem,3vw,2.5rem)", color: B.textPri }}>
            Turn Your Facts Into a Draft
          </h3>
          <p className="leading-relaxed" style={{ color: B.textSec, fontSize: "1.0625rem" }}>
            Complete a guided intake form with the facts of your situation. The system structures your input into a California-focused legal-letter draft — no blank-page guessing.
          </p>

          <motion.div
            className="mt-8 space-y-3"
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

        {/* Document mockup */}
        <motion.div
          className="relative"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease, delay: 0.1 }}
        >
          <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-blue-900/10"
            style={{ background: "white", border: `1px solid rgba(37,99,235,0.1)` }}>
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 h-10 border-b" style={{ background: "#f8fafc", borderColor: "rgba(37,99,235,0.08)" }}>
              <div className="w-3 h-3 rounded-full bg-red-400/80" />
              <div className="w-3 h-3 rounded-full bg-amber-400/80" />
              <div className="w-3 h-3 rounded-full bg-green-400/80" />
              <div className="ml-3 flex-1 h-5 rounded-md" style={{ background: "rgba(37,99,235,0.06)" }} />
            </div>

            <div className="p-6 space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: "rgba(37,99,235,0.08)" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: B.bgMuted }}>
                  <div className="w-6 h-6"><IconScale /></div>
                </div>
                <div className="flex-1">
                  <motion.div className="h-3 rounded-full mb-1.5" style={{ background: `rgba(37,99,235,0.15)`, width: "60%" }}
                    initial={{ width: 0 }} animate={{ width: "60%" }} transition={{ delay: 0.6, duration: 0.5 }} />
                  <motion.div className="h-2 rounded-full" style={{ background: `rgba(37,99,235,0.08)`, width: "40%" }}
                    initial={{ width: 0 }} animate={{ width: "40%" }} transition={{ delay: 0.75, duration: 0.5 }} />
                </div>
              </div>

              {/* Form fields */}
              {[["80%", 0.8], ["65%", 0.95], ["90%", 1.1], ["55%", 1.25]].map(([w, d], i) => (
                <motion.div key={i} className="h-3 rounded-full"
                  style={{ background: `rgba(37,99,235,${i === 0 ? 0.12 : i === 1 ? 0.09 : i === 2 ? 0.07 : 0.05})` }}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: w as string, opacity: 1 }}
                  transition={{ delay: d as number, duration: 0.5 }}
                />
              ))}

              {/* Typing cursor animation */}
              <motion.div
                className="flex items-center gap-2 pt-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4, duration: 0.4 }}
              >
                <div className="h-3 rounded-full" style={{ width: "45%", background: `rgba(37,99,235,0.1)` }} />
                <motion.div
                  className="w-0.5 h-4 rounded-full"
                  style={{ background: B.primary }}
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              </motion.div>
            </div>
          </div>

          {/* Floating badge */}
          <motion.div
            className="absolute -bottom-4 -right-4 px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold"
            style={{ background: B.primary, color: "white" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.5, type: "spring", stiffness: 300 }}
          >
            ~5 min intake
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Scene: Step 2 ───────────────────────────────────────────────────────────
function Step2Scene() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-4xl w-full grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        {/* Scanning animation */}
        <motion.div
          className="relative order-2 md:order-1"
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease }}
        >
          <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-blue-900/10"
            style={{ background: "white", border: `1px solid rgba(37,99,235,0.1)`, minHeight: 260 }}>

            {/* Document lines */}
            <div className="p-6 space-y-3 pt-8">
              {[["95%", 0.3], ["80%", 0.4], ["88%", 0.5], ["70%", 0.6], ["92%", 0.7], ["60%", 0.8]].map(([w, d], i) => (
                <div key={i} className="h-3 rounded-full" style={{ width: w as string, background: `rgba(37,99,235,${0.06 + i * 0.01})` }} />
              ))}
            </div>

            {/* Scanning line */}
            <motion.div
              className="absolute left-0 right-0 h-0.5 pointer-events-none"
              style={{ background: `linear-gradient(90deg, transparent, ${B.accent}, ${B.primary}, ${B.accent}, transparent)`, boxShadow: `0 0 12px ${B.accent}` }}
              initial={{ top: "10%" }}
              animate={{ top: ["10%", "90%", "10%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Highlighted lines */}
            {[1, 3].map(idx => (
              <motion.div
                key={idx}
                className="absolute left-4 right-4 h-3 rounded-full"
                style={{
                  top: `${20 + idx * 18}%`,
                  background: `rgba(37,99,235,0.12)`,
                  border: `1px solid rgba(37,99,235,0.2)`,
                }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: idx * 0.4 }}
              />
            ))}

            {/* California law tag */}
            <motion.div
              className="absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-bold"
              style={{ background: B.bgMuted, color: B.primary, border: `1px solid rgba(37,99,235,0.2)` }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              CA Law Applied
            </motion.div>
          </div>
        </motion.div>

        {/* Text */}
        <motion.div
          className="order-1 md:order-2"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease, delay: 0.1 }}
        >
          <div className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: B.primary }}>Step 02</div>
          <h3 className="font-bold leading-tight mb-4" style={{ fontSize: "clamp(1.5rem,3vw,2.5rem)", color: B.textPri }}>
            A Stronger Draft in 10 Minutes
          </h3>
          <p className="leading-relaxed" style={{ color: B.textSec, fontSize: "1.0625rem" }}>
            The drafting engine applies California legal language and repeatable letter workflows to generate a structured, review-ready draft fast.
          </p>

          <motion.div
            className="mt-8 p-4 rounded-xl flex items-center gap-4"
            style={{ background: B.bgMuted, border: `1px solid rgba(37,99,235,0.15)` }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="w-9 h-9 shrink-0"><IconSparkles /></div>
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

// ─── Scene: Step 3 ───────────────────────────────────────────────────────────
function Step3Scene() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-4xl w-full grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        {/* Text */}
        <motion.div
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease }}
        >
          <div className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: B.primary }}>Step 03</div>
          <h3 className="font-bold leading-tight mb-4" style={{ fontSize: "clamp(1.5rem,3vw,2.5rem)", color: B.textPri }}>
            Review With an Attorney or Send
          </h3>
          <p className="leading-relaxed" style={{ color: B.textSec, fontSize: "1.0625rem" }}>
            Your draft is ready for attorney review or self-organized use. A licensed California attorney can review, edit, and approve before delivery on official law firm letterhead.
          </p>

          <motion.div className="mt-8 space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            {["Attorney reviews & signs off", "Delivered as authoritative PDF", "100% confidential & secure"].map((item, i) => (
              <motion.div key={i} className="flex items-center gap-3 text-sm font-medium" style={{ color: B.textSec }}
                initial={{ x: -16, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.12 }}
              >
                <motion.div
                  className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                  style={{ background: "rgba(0,196,140,0.12)", border: "1.5px solid #00C48C" }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.7 + i * 0.1, type: "spring", stiffness: 300 }}
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><polyline points="1,4 3.5,7 9,1" stroke="#00C48C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </motion.div>
                {item}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* Approval seal */}
        <motion.div
          className="flex items-center justify-center"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease, delay: 0.1 }}
        >
          <div className="relative">
            {/* Pulsing rings */}
            {[1, 2, 3].map(i => (
              <motion.div
                key={i}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ border: `1.5px solid rgba(0,196,140,${0.3 - i * 0.08})` }}
                initial={{ width: 80, height: 80, opacity: 0 }}
                animate={{ width: 80 + i * 48, height: 80 + i * 48, opacity: [0, 0.6, 0] }}
                transition={{ delay: 0.8 + i * 0.2, duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
              />
            ))}

            {/* Seal card */}
            <motion.div
              className="relative rounded-2xl p-8 text-center shadow-2xl shadow-green-900/10"
              style={{ background: "white", border: `1.5px solid rgba(0,196,140,0.25)`, width: 220 }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 250 }}
            >
              <motion.div
                className="w-16 h-16 mx-auto mb-4"
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.7, type: "spring", stiffness: 300 }}
              >
                <IconCheckmark />
              </motion.div>
              <div className="font-bold text-sm mb-0.5" style={{ color: B.textPri }}>Attorney Approved</div>
              <div className="text-xs" style={{ color: B.textMuted }}>J. Smith, Esq. · CA Bar</div>

              {/* Signature */}
              <motion.svg
                viewBox="0 0 120 30" className="w-28 mx-auto mt-4 opacity-70"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 1, duration: 1.2, ease: "easeInOut" }}
              >
                <motion.path
                  d="M5 20 C15 5 25 5 32 15 C38 25 42 25 50 15 C58 5 65 5 72 15 C78 22 82 24 90 18 C98 12 105 10 115 16"
                  stroke={B.textPri}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.6 }}
                  transition={{ delay: 1, duration: 1.2 }}
                />
              </motion.svg>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── Scene: Outro ─────────────────────────────────────────────────────────────
function OutroScene() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Pulsing rings */}
      {[1, 2, 3, 4].map(i => (
        <motion.div
          key={i}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ border: `1px solid rgba(37,99,235,${0.25 - i * 0.05})` }}
          initial={{ width: 60, height: 60, opacity: 0 }}
          animate={{ width: 60 + i * 80, height: 60 + i * 80, opacity: [0, 0.7, 0] }}
          transition={{ delay: i * 0.15, duration: 2, repeat: Infinity, repeatDelay: 0.3 }}
        />
      ))}

      <motion.div
        className="relative z-10"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease }}
      >
        <motion.div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg"
          style={{ background: `linear-gradient(135deg, ${B.accent}, ${B.primary})` }}
          animate={{ boxShadow: [`0 0 0 0 rgba(37,99,235,0.3)`, `0 0 0 20px rgba(37,99,235,0)`, `0 0 0 0 rgba(37,99,235,0)`] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-10 h-10"><IconCheckmark /></div>
        </motion.div>

        <h2 className="font-bold tracking-tight mb-4" style={{ fontSize: "clamp(2rem,5vw,3.5rem)", color: B.textPri, lineHeight: 1.1 }}>
          Ready to Send.
        </h2>
        <p className="text-lg max-w-md mx-auto" style={{ color: B.textSec }}>
          Your attorney-reviewed legal letter arrives as a professional PDF — ready to command attention.
        </p>

        <motion.div
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${B.primary}, ${B.dark})` }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          Download PDF
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────
export default function HowItWorks() {
  const [currentScene, setCurrentScene] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const rafRef = useRef<number>();
  const startRef = useRef<number>(Date.now());
  const sectionRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  // Intersection observer — only run when visible
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Scene timer
  useEffect(() => {
    if (!inView) return;
    startRef.current = Date.now();
    setProgress(0);

    const duration = SCENE_DURATIONS[currentScene];

    // Progress RAF
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.min(elapsed / duration, 1));
      if (elapsed < duration) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Scene advance
    timerRef.current = setTimeout(() => {
      setCurrentScene(prev => (prev + 1) % TOTAL_SCENES);
    }, duration);

    return () => {
      clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [currentScene, inView]);

  const scenes = [IntroScene, Step1Scene, Step2Scene, Step3Scene, OutroScene];
  const CurrentScene = scenes[currentScene];

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden"
      style={{ background: B.bg, minHeight: "100svh", borderTop: `1px solid ${B.line}`, borderBottom: `1px solid ${B.line}` }}
    >
      <PersistentLayers currentScene={currentScene} progress={progress} />

      <AnimatePresence mode="wait">
        <CurrentScene key={`scene-${currentScene}`} />
      </AnimatePresence>

      {/* Scene jump dots (top right) */}
      <div className="absolute top-6 right-6 flex gap-2 z-10">
        {Array.from({ length: TOTAL_SCENES }).map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentScene(i)}
            className="w-2 h-2 rounded-full transition-all duration-300"
            style={{
              background: i === currentScene ? B.primary : `rgba(37,99,235,0.2)`,
              transform: i === currentScene ? "scale(1.4)" : "scale(1)",
            }}
            aria-label={`Go to scene ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
