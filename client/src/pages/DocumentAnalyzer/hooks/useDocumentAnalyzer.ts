import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { DocumentAnalysisResult, AnalysisPrefill } from "@shared/types";
import { LETTER_TYPE_CONFIG, ANALYZE_PREFILL_KEY, US_STATES } from "@shared/types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const ALLOWED_TYPES: Record<string, "pdf" | "docx" | "txt"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};
export const ALLOWED_EXTS = [".pdf", ".docx", ".txt"];
export const MAX_MB = 7.5;
export const MAX_BYTES = 7_864_320;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a detected jurisdiction string to a US state code, or undefined if not found. */
export function detectJurisdictionCode(detected: string | null | undefined): string | undefined {
  if (!detected) return undefined;
  const upper = detected.trim().toUpperCase();
  const byCode = US_STATES.find(s => s.code === upper);
  if (byCode) return byCode.code;
  const lower = detected.trim().toLowerCase();
  const byName = US_STATES.find(s => s.name.toLowerCase() === lower);
  if (byName) return byName.code;
  const byPrefix = US_STATES.find(s => lower.startsWith(s.name.toLowerCase()));
  if (byPrefix) return byPrefix.code;
  return undefined;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDocumentAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<DocumentAnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();

  const { data: me } = trpc.auth.me.useQuery();
  const isSubscriber = me?.role === "subscriber";

  const analyzeMutation = trpc.documents.analyze.useMutation({
    onSuccess: (data) => {
      setResult(data as DocumentAnalysisResult);
    },
    onError: (err) => {
      toast.error("Analysis failed", { description: err.message });
    },
  });

  const isAnalyzing = analyzeMutation.isPending;

  const handleFile = useCallback((f: File) => {
    const ext = "." + (f.name.split(".").pop() ?? "").toLowerCase();
    const mimeType = ALLOWED_TYPES[f.type];
    const extType = ALLOWED_EXTS.includes(ext);
    if (!mimeType && !extType) {
      toast.error("Unsupported file type", {
        description: "Please upload a PDF, DOCX, or plain text file.",
      });
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("File too large", {
        description: `Maximum file size is ${MAX_MB} MB.`,
      });
      return;
    }
    setFile(f);
    setResult(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile]
  );

  const handleAnalyze = async () => {
    if (!file) return;
    try {
      const base64 = await readAsBase64(file);
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      const fileType =
        ALLOWED_TYPES[file.type] ??
        (ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : "txt");
      analyzeMutation.mutate({
        fileName: file.name,
        fileType,
        fileBase64: base64,
      });
    } catch {
      toast.error("Could not read file", { description: "Please try again." });
    }
  };

  const handleDraftLetter = () => {
    if (!result) return;

    const prefill: AnalysisPrefill = {};

    if (result.recommendedLetterType) {
      prefill.letterType = result.recommendedLetterType;
    }

    if (result.recommendedResponseSummary) {
      const truncated = result.recommendedResponseSummary.slice(0, 200);
      prefill.subject =
        truncated.length < result.recommendedResponseSummary.length
          ? truncated + "..."
          : truncated;
    }

    const jurisdictionCode = detectJurisdictionCode(result.detectedJurisdiction);
    if (jurisdictionCode) {
      prefill.jurisdictionState = jurisdictionCode;
    }

    if (result.detectedParties.senderName) {
      prefill.senderName = result.detectedParties.senderName;
    }
    if (result.detectedParties.recipientName) {
      prefill.recipientName = result.detectedParties.recipientName;
    }

    if (result.summary) {
      prefill.description = result.summary.slice(0, 600);
    }

    if (result.extractedEvidence && result.extractedEvidence.length > 0) {
      prefill.evidenceItems = result.extractedEvidence;
      prefill.evidenceSummary = result.extractedEvidence
        .map(e => `${e.type}: ${e.value} — ${e.context}`)
        .join("; ");
    }

    try {
      sessionStorage.setItem(ANALYZE_PREFILL_KEY, JSON.stringify(prefill));
    } catch {
      // sessionStorage may be unavailable
    }

    if (isSubscriber) {
      navigate("/submit");
    } else {
      navigate("/signup");
    }
  };

  const handleCopy = async () => {
    if (!result || !file) return;
    try {
      await navigator.clipboard.writeText(buildTextReport(file.name, result));
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleDownload = () => {
    if (!result || !file) return;
    const text = buildTextReport(file.name, result);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis-${file.name.replace(/\.[^.]+$/, "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
  };

  return {
    file,
    dragging,
    setDragging,
    result,
    fileInputRef,
    me,
    isSubscriber,
    isAnalyzing,
    handleFile,
    handleDrop,
    handleAnalyze,
    handleDraftLetter,
    handleCopy,
    handleDownload,
    handleReset,
  };
}

// ─── Report builder (pure utility, co-located with hook) ──────────────────────

import type { FlaggedRisk } from "@shared/types";

export function buildTextReport(fileName: string, result: DocumentAnalysisResult): string {
  const lines: string[] = [
    "DOCUMENT ANALYSIS REPORT",
    "========================",
    `Document: ${fileName}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "DISCLAIMER: This analysis is system-generated and is not legal advice.",
    "Consult a qualified attorney for legal guidance.",
    "",
  ];

  if (result.recommendedLetterType) {
    const letterLabel =
      LETTER_TYPE_CONFIG[result.recommendedLetterType]?.label ??
      result.recommendedLetterType;
    lines.push("━━━ RECOMMENDED ACTION ━━━");
    lines.push(`Recommended Response: ${letterLabel}`);
    lines.push(`Urgency: ${urgencyLabel(result.urgencyLevel)}`);
    if (result.recommendedResponseSummary)
      lines.push(`Next Step: ${result.recommendedResponseSummary}`);
    if (result.detectedDeadline) lines.push(`Deadline: ${result.detectedDeadline}`);
    if (result.detectedJurisdiction)
      lines.push(`Jurisdiction: ${result.detectedJurisdiction}`);
    if (result.detectedParties.senderName)
      lines.push(`Sender: ${result.detectedParties.senderName}`);
    if (result.detectedParties.recipientName)
      lines.push(`Recipient: ${result.detectedParties.recipientName}`);
    lines.push("");
  }

  lines.push(
    "━━━ SUMMARY ━━━",
    result.summary,
    "",
    "━━━ ACTION ITEMS ━━━",
    ...result.actionItems.map((item, i) => `${i + 1}. ${item}`),
    "",
    "━━━ FLAGGED RISKS & IMPORTANT CLAUSES ━━━",
    ...result.flaggedRisks.map(
      (risk, i) =>
        `${i + 1}. [${risk.severity.toUpperCase()}] ${risk.clause}\n   ${risk.description}`
    )
  );

  const ei = result.emotionalIntelligence;
  if (ei) {
    lines.push(
      "",
      "",
      "━━━ EMOTIONAL INTELLIGENCE ANALYSIS ━━━",
      "",
      `Overall Tone: ${ei.overallTone} (Confidence: ${ei.toneConfidence})`,
      ""
    );

    if (ei.emotionBreakdown.length > 0) {
      lines.push("── Emotion Breakdown ──");
      ei.emotionBreakdown.forEach(e => {
        const bar =
          "█".repeat(Math.round(e.intensity / 5)) +
          "░".repeat(20 - Math.round(e.intensity / 5));
        lines.push(`  ${e.emotion}: ${bar} ${e.intensity}%`);
      });
      lines.push("");
    }

    if (ei.hiddenImplications.length > 0) {
      lines.push("── Hidden Implications ──");
      ei.hiddenImplications.forEach((imp, i) => lines.push(`  ${i + 1}. ${imp}`));
      lines.push("");
    }

    if (ei.redFlags.length > 0) {
      lines.push("── Red Flags & Dark Corners ──");
      ei.redFlags.forEach((rf, i) => {
        lines.push(`  ${i + 1}. "${rf.passage}"`);
        lines.push(`     → ${rf.explanation}`);
      });
      lines.push("");
    }

    if (ei.manipulationTactics.length > 0) {
      lines.push("── Manipulation Tactics ──");
      ei.manipulationTactics.forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));
      lines.push("");
    }

    if (ei.trueIntentSummary) {
      lines.push("── True Intent Summary ──");
      lines.push(ei.trueIntentSummary);
    }
  }

  return lines.join("\n");
}

// ─── Severity / urgency helpers (shared across sub-components) ────────────────

export function severityColor(severity: FlaggedRisk["severity"]) {
  switch (severity) {
    case "high":
      return "text-red-700 bg-red-50 border-red-200";
    case "medium":
      return "text-amber-700 bg-amber-50 border-amber-200";
    case "low":
      return "text-blue-700 bg-blue-50 border-blue-200";
  }
}

export function severityBadgeVariant(
  severity: FlaggedRisk["severity"]
): "destructive" | "secondary" | "outline" {
  switch (severity) {
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
  }
}

export function severityLabel(severity: FlaggedRisk["severity"]) {
  switch (severity) {
    case "high":
      return "High Risk";
    case "medium":
      return "Medium Risk";
    case "low":
      return "Low Risk";
  }
}

export function urgencyColor(level: "low" | "medium" | "high") {
  switch (level) {
    case "high":
      return "text-red-700 bg-red-100 border-red-200";
    case "medium":
      return "text-amber-700 bg-amber-100 border-amber-200";
    case "low":
      return "text-green-700 bg-green-100 border-green-200";
  }
}

export function urgencyLabel(level: "low" | "medium" | "high") {
  switch (level) {
    case "high":
      return "High Urgency";
    case "medium":
      return "Medium Urgency";
    case "low":
      return "Low Urgency";
  }
}
