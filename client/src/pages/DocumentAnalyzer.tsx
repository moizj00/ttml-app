import { useState, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import BrandLogo from "@/components/shared/BrandLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Upload,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  X,
  Download,
  Copy,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ShieldAlert,
  Info,
  Zap,
  Calendar,
  Users,
  MapPin,
  Scale,
  UserPlus,
  Clock,
  CheckCircle,
  Brain,
  Eye,
  Quote,
  Target,
  MessageSquareWarning,
} from "lucide-react";
import type { DocumentAnalysisResult, FlaggedRisk, EmotionalIntelligence } from "@shared/types";
import { LETTER_TYPE_CONFIG, ANALYZE_PREFILL_KEY, US_STATES } from "@shared/types";
import type { AnalysisPrefill } from "@shared/types";

/** Resolve a detected jurisdiction string to a US state code, or undefined if not found. */
function detectJurisdictionCode(detected: string | null | undefined): string | undefined {
  if (!detected) return undefined;
  const upper = detected.trim().toUpperCase();
  // Try direct abbreviation match first
  const byCode = US_STATES.find(s => s.code === upper);
  if (byCode) return byCode.code;
  // Try full name match (case-insensitive)
  const lower = detected.trim().toLowerCase();
  const byName = US_STATES.find(s => s.name.toLowerCase() === lower);
  if (byName) return byName.code;
  // Try prefix match (e.g. "California law" → "California")
  const byPrefix = US_STATES.find(s => lower.startsWith(s.name.toLowerCase()));
  if (byPrefix) return byPrefix.code;
  return undefined;
}

const ALLOWED_TYPES: Record<string, "pdf" | "docx" | "txt"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};
const ALLOWED_EXTS = [".pdf", ".docx", ".txt"];
const MAX_MB = 7.5;
const MAX_BYTES = 7_864_320;

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

function severityColor(severity: FlaggedRisk["severity"]) {
  switch (severity) {
    case "high": return "text-red-700 bg-red-50 border-red-200";
    case "medium": return "text-amber-700 bg-amber-50 border-amber-200";
    case "low": return "text-blue-700 bg-blue-50 border-blue-200";
  }
}

function severityBadgeVariant(severity: FlaggedRisk["severity"]): "destructive" | "secondary" | "outline" {
  switch (severity) {
    case "high": return "destructive";
    case "medium": return "secondary";
    case "low": return "outline";
  }
}

function severityLabel(severity: FlaggedRisk["severity"]) {
  switch (severity) {
    case "high": return "High Risk";
    case "medium": return "Medium Risk";
    case "low": return "Low Risk";
  }
}

function urgencyColor(level: "low" | "medium" | "high") {
  switch (level) {
    case "high": return "text-red-700 bg-red-100 border-red-200";
    case "medium": return "text-amber-700 bg-amber-100 border-amber-200";
    case "low": return "text-green-700 bg-green-100 border-green-200";
  }
}

function urgencyLabel(level: "low" | "medium" | "high") {
  switch (level) {
    case "high": return "High Urgency";
    case "medium": return "Medium Urgency";
    case "low": return "Low Urgency";
  }
}

function buildTextReport(
  fileName: string,
  result: DocumentAnalysisResult
): string {
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
    const letterLabel = LETTER_TYPE_CONFIG[result.recommendedLetterType]?.label ?? result.recommendedLetterType;
    lines.push("━━━ RECOMMENDED ACTION ━━━");
    lines.push(`Recommended Response: ${letterLabel}`);
    lines.push(`Urgency: ${urgencyLabel(result.urgencyLevel)}`);
    if (result.recommendedResponseSummary) lines.push(`Next Step: ${result.recommendedResponseSummary}`);
    if (result.detectedDeadline) lines.push(`Deadline: ${result.detectedDeadline}`);
    if (result.detectedJurisdiction) lines.push(`Jurisdiction: ${result.detectedJurisdiction}`);
    if (result.detectedParties.senderName) lines.push(`Sender: ${result.detectedParties.senderName}`);
    if (result.detectedParties.recipientName) lines.push(`Recipient: ${result.detectedParties.recipientName}`);
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
    ),
  );

  const ei = result.emotionalIntelligence;
  if (ei) {
    lines.push(
      "",
      "",
      "━━━ EMOTIONAL INTELLIGENCE ANALYSIS ━━━",
      "",
      `Overall Tone: ${ei.overallTone} (Confidence: ${ei.toneConfidence})`,
      "",
    );

    if (ei.emotionBreakdown.length > 0) {
      lines.push("── Emotion Breakdown ──");
      ei.emotionBreakdown.forEach((e) => {
        const bar = "█".repeat(Math.round(e.intensity / 5)) + "░".repeat(20 - Math.round(e.intensity / 5));
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

export default function DocumentAnalyzer() {
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

  const handleFile = useCallback(
    (f: File) => {
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
    },
    []
  );

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
      prefill.subject = truncated.length < result.recommendedResponseSummary.length
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

    try {
      sessionStorage.setItem(ANALYZE_PREFILL_KEY, JSON.stringify(prefill));
    } catch {
      // ignore sessionStorage errors
    }

    // Always navigate to /submit — route guard will redirect to /login if unauthenticated,
    // and the prefill remains in sessionStorage so it will be applied when they return.
    navigate("/submit");
  };

  const handleCopy = () => {
    if (!result || !file) return;
    navigator.clipboard.writeText(buildTextReport(file.name, result));
    toast.success("Copied to clipboard");
  };

  const handleDownload = () => {
    if (!result || !file) return;
    const text = buildTextReport(file.name, result);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis-${file.name.replace(/\.[^/.]+$/, "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    analyzeMutation.reset();
  };

  const isAnalyzing = analyzeMutation.isPending;

  const analyzerJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Talk to My Lawyer — Document Analyzer",
    url: "https://www.talk-to-my-lawyer.com/analyze",
    applicationCategory: "LegalService",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free automated legal document analysis",
    },
    description: "Upload any legal document (PDF, DOCX, or TXT) and instantly get automated analysis, flagged risks, action items, and a recommended legal response letter.",
    featureList: [
      "Automated legal document analysis",
      "Risk flagging and severity classification",
      "Recommended action items",
      "Auto-detection of jurisdiction and parties",
      "One-click letter drafting from analysis",
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50 font-['Inter'] text-slate-900">
      <Helmet>
        <title>Free Legal Document Analyzer — Instant Risk Analysis | Talk to My Lawyer</title>
        <meta name="description" content="Upload any legal document (PDF, DOCX, TXT) and get instant automated analysis. Identifies risks, flags important clauses, and recommends attorney-reviewed response letters." />
        <link rel="canonical" href="https://www.talk-to-my-lawyer.com/analyze" />
        <meta property="og:title" content="Free Legal Document Analyzer | Talk to My Lawyer" />
        <meta property="og:description" content="Instantly analyze legal documents online. Identifies risks, detects jurisdiction, flags key clauses, and recommends a professional legal response letter." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.talk-to-my-lawyer.com/analyze" />
        <meta property="og:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Free Legal Document Analyzer | Talk to My Lawyer" />
        <meta name="twitter:description" content="Upload any legal document and get instant risk analysis plus a path to an attorney-reviewed response letter." />
        <meta name="twitter:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <script type="application/ld+json">{JSON.stringify(analyzerJsonLd)}</script>
      </Helmet>

      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 h-16 flex items-center justify-between">
          <BrandLogo href="/" size="lg" hideWordmarkOnMobile />
          <div className="hidden md:flex items-center gap-6">
            <Link
              href="/analyze"
              className="text-[13px] font-semibold text-blue-600 tracking-wide uppercase"
              data-testid="nav-analyze"
            >
              Document Analyzer
            </Link>
            <Link
              href="/pricing"
              className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors"
              data-testid="nav-pricing"
            >
              Pricing
            </Link>
            <div className="w-px h-4 bg-slate-200" />
            {me ? (
              <Link
                href={me.role === "subscriber" ? "/dashboard" : me.role === "attorney" ? "/attorney" : me.role === "admin" ? "/admin" : "/employee"}
                className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                data-testid="nav-dashboard"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                data-testid="nav-signin"
              >
                Sign In
              </Link>
            )}
            <Link
              href="/login"
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-[13px] font-bold transition-all shadow-md shadow-blue-600/20"
              data-testid="nav-cta"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-20 pb-16 px-4 max-w-4xl mx-auto">
        {/* Back link */}
        <div className="pt-6 mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
            data-testid="link-back-home"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-5">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
            Document Analyzer
          </h1>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Upload any legal document and instantly get automated analysis, recommended action, and a path to a professionally drafted response letter.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            Not legal advice — consult a qualified attorney for legal guidance
          </div>
        </div>

        {/* Upload zone or results */}
        {!result ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            {/* Drag & Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl transition-all ${
                file
                  ? "border-blue-300 bg-blue-50/40 cursor-default"
                  : dragging
                  ? "border-blue-500 bg-blue-50 cursor-pointer scale-[1.01] animate-drag-glow"
                  : "border-slate-200 hover:border-blue-300 hover:bg-slate-50 cursor-pointer"
              } p-8 sm:p-12 flex flex-col items-center gap-4 text-center`}
              data-testid="upload-dropzone"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_EXTS.join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
                data-testid="input-file"
              />

              {file ? (
                <>
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
                    <FileText className="w-7 h-7 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-base">{file.name}</p>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    data-testid="button-remove-file"
                    aria-label="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-slate-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 text-base">
                      Drag & drop your document here
                    </p>
                    <p className="text-sm text-slate-400 mt-1">
                      or click to browse — PDF, DOCX, or TXT up to {MAX_MB} MB
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Analyze button */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 items-center justify-center">
              <Button
                onClick={handleAnalyze}
                disabled={!file || isAnalyzing}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl text-base font-semibold shadow-md shadow-blue-600/20 disabled:opacity-50"
                data-testid="button-analyze"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing document…
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Analyze Document
                  </>
                )}
              </Button>
              {!file && (
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto"
                  data-testid="button-choose-file"
                >
                  Choose File
                </Button>
              )}
            </div>

            {/* Progress hint */}
            {isAnalyzing && (
              <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 flex items-start gap-3">
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">Processing your document</p>
                  <p className="text-sm text-blue-600 mt-0.5">
                    Extracting text, analyzing legal content, identifying recommended actions and risks…
                    This may take 15–30 seconds.
                  </p>
                </div>
              </div>
            )}

            {/* Info line */}
            {!isAnalyzing && (
              <p className="mt-5 text-center text-xs text-slate-400">
                <Info className="inline w-3 h-3 mr-1" />
                Unauthenticated users are limited to 3 analyses per hour.
                <Link href="/login" className="underline ml-1 text-blue-500">Sign in</Link> for higher limits.
              </p>
            )}
          </div>
        ) : (
          /* Results */
          <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <span className="font-semibold text-slate-800 truncate text-sm">{file?.name}</span>
                <Badge variant="secondary" className="flex-shrink-0">Analyzed</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="gap-1.5"
                  data-testid="button-copy-analysis"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="gap-1.5"
                  data-testid="button-download-analysis"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="gap-1.5"
                  data-testid="button-analyze-new"
                >
                  <Upload className="w-3.5 h-3.5" />
                  New
                </Button>
              </div>
            </div>

            {/* Disclaimer banner */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                <strong>Not legal advice.</strong> This system-generated analysis is for informational
                purposes only. Consult a qualified attorney before taking any legal action.
              </p>
            </div>

            {/* ─── Recommended Action Card (leads the results) ─── */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-blue-600/20" data-testid="card-recommended-action">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 text-blue-200" />
                <span className="text-sm font-semibold text-blue-100 uppercase tracking-wide">Recommended Action</span>
              </div>

              {result.recommendedResponseSummary ? (
                <p className="text-lg sm:text-xl font-semibold text-white mb-5 leading-snug" data-testid="text-recommended-summary">
                  {result.recommendedResponseSummary}
                </p>
              ) : (
                <p className="text-lg font-semibold text-white mb-5">
                  Review this document carefully and consider a legal response.
                </p>
              )}

              {/* Metadata row */}
              <div className="flex flex-wrap gap-2 mb-6">
                {/* Urgency pill */}
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${urgencyColor(result.urgencyLevel)}`} data-testid="badge-urgency">
                  <Clock className="w-3.5 h-3.5" />
                  {urgencyLabel(result.urgencyLevel)}
                </span>

                {/* Recommended letter type */}
                {result.recommendedLetterType && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/20 text-white" data-testid="badge-letter-type">
                    <Scale className="w-3.5 h-3.5" />
                    {LETTER_TYPE_CONFIG[result.recommendedLetterType]?.label ?? result.recommendedLetterType}
                  </span>
                )}

                {/* Deadline */}
                {result.detectedDeadline && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/20 text-white" data-testid="text-deadline">
                    <Calendar className="w-3.5 h-3.5" />
                    Deadline: {result.detectedDeadline}
                  </span>
                )}

                {/* Jurisdiction */}
                {result.detectedJurisdiction && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/20 text-white" data-testid="text-jurisdiction">
                    <MapPin className="w-3.5 h-3.5" />
                    {result.detectedJurisdiction}
                  </span>
                )}
              </div>

              {/* Detected parties */}
              {(result.detectedParties.senderName || result.detectedParties.recipientName) && (
                <div className="flex flex-wrap gap-4 mb-6 p-4 bg-white/10 rounded-xl">
                  {result.detectedParties.senderName && (
                    <div data-testid="text-sender-name">
                      <p className="text-blue-200 text-xs font-medium mb-0.5">Sent by</p>
                      <p className="text-white text-sm font-semibold">{result.detectedParties.senderName}</p>
                    </div>
                  )}
                  {result.detectedParties.senderName && result.detectedParties.recipientName && (
                    <div className="w-px bg-white/20 self-stretch" />
                  )}
                  {result.detectedParties.recipientName && (
                    <div data-testid="text-recipient-name">
                      <p className="text-blue-200 text-xs font-medium mb-0.5">Sent to</p>
                      <p className="text-white text-sm font-semibold">{result.detectedParties.recipientName}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Draft CTA */}
              <Button
                onClick={handleDraftLetter}
                className="w-full sm:w-auto bg-white text-blue-700 hover:bg-blue-50 font-bold text-sm px-6 py-3 rounded-xl shadow-md"
                data-testid="button-draft-letter"
              >
                {isSubscriber ? (
                  <>
                    <Scale className="w-4 h-4 mr-2" />
                    Draft Your Response Letter
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Draft Your Response Letter
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>

              {!isSubscriber && (
                <p className="text-blue-200 text-xs mt-3">
                  Create a free account → the letter intake form will be pre-filled from this analysis.
                </p>
              )}
            </div>

            {/* Summary */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
              </div>
              <div className="prose prose-slate max-w-none text-slate-600 text-sm leading-relaxed whitespace-pre-line" data-testid="text-summary">
                {result.summary}
              </div>
            </div>

            {/* Action Items */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <ClipboardList className="w-4 h-4 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Action Items</h2>
                <Badge variant="secondary" className="ml-auto">{result.actionItems.length}</Badge>
              </div>
              {result.actionItems.length === 0 ? (
                <p className="text-slate-400 text-sm">No specific action items identified.</p>
              ) : (
                <ul className="space-y-3" data-testid="list-action-items">
                  {result.actionItems.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3"
                      data-testid={`item-action-${i}`}
                    >
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-700">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Flagged Risks */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Flagged Risks & Important Clauses</h2>
                <Badge variant="secondary" className="ml-auto">{result.flaggedRisks.length}</Badge>
              </div>
              {result.flaggedRisks.length === 0 ? (
                <p className="text-slate-400 text-sm">No significant risks or clauses flagged.</p>
              ) : (
                <div className="space-y-3" data-testid="list-flagged-risks">
                  {result.flaggedRisks.map((risk, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border p-4 ${severityColor(risk.severity)}`}
                      data-testid={`item-risk-${i}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-semibold text-sm">{risk.clause}</span>
                        <Badge variant={severityBadgeVariant(risk.severity)} className="flex-shrink-0 text-xs">
                          {severityLabel(risk.severity)}
                        </Badge>
                      </div>
                      <p className="text-sm opacity-90">{risk.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── Emotional Intelligence Section ─── */}
            {result.emotionalIntelligence && (
              <div className="relative overflow-hidden rounded-2xl shadow-lg" data-testid="card-emotional-intelligence">
                {/* Header banner */}
                <div className="relative bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-6 sm:px-8 pt-6 pb-8">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_70%)]" />
                  <div className="relative flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
                      <Brain className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white tracking-tight">Emotional Intelligence</h2>
                      <p className="text-xs text-purple-200">Reading between the lines</p>
                    </div>
                    <Badge variant="outline" className="ml-auto border-white/30 text-white bg-white/10 backdrop-blur-sm text-[10px] uppercase tracking-widest font-bold">Insight</Badge>
                  </div>

                  {/* Overall Tone — hero-style */}
                  <div className="relative rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-5" data-testid="section-overall-tone">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-xs font-semibold text-purple-200 uppercase tracking-wider">Detected Tone</span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        result.emotionalIntelligence.toneConfidence === "high"
                          ? "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/30"
                          : result.emotionalIntelligence.toneConfidence === "medium"
                          ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/30"
                          : "bg-white/10 text-white/70 ring-1 ring-white/20"
                      }`} data-testid="badge-tone-confidence">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          result.emotionalIntelligence.toneConfidence === "high" ? "bg-emerald-400" :
                          result.emotionalIntelligence.toneConfidence === "medium" ? "bg-amber-400" : "bg-white/50"
                        }`} />
                        {result.emotionalIntelligence.toneConfidence} confidence
                      </span>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-white leading-tight" data-testid="text-overall-tone">
                      {result.emotionalIntelligence.overallTone}
                    </p>
                  </div>
                </div>

                {/* Body content — white card area */}
                <div className="bg-white border border-slate-200 border-t-0 rounded-b-2xl px-6 sm:px-8 py-6 space-y-6">

                  {/* Emotion Breakdown */}
                  {result.emotionalIntelligence.emotionBreakdown.length > 0 && (
                    <div data-testid="section-emotion-breakdown">
                      <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center">
                          <Zap className="w-3.5 h-3.5 text-purple-600" />
                        </div>
                        Emotion Breakdown
                      </h3>
                      <div className="grid gap-3">
                        {result.emotionalIntelligence.emotionBreakdown.map((item, i) => {
                          const barGradient = item.intensity >= 70
                            ? "from-rose-400 to-red-500"
                            : item.intensity >= 40
                            ? "from-amber-300 to-orange-400"
                            : "from-sky-300 to-blue-400";
                          const dotColor = item.intensity >= 70
                            ? "bg-red-500"
                            : item.intensity >= 40
                            ? "bg-amber-400"
                            : "bg-blue-400";
                          return (
                            <div key={i} className="group flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors" data-testid={`emotion-bar-${i}`}>
                              <div className="flex items-center gap-2 w-32 min-w-[8rem]">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                                <span className="text-xs font-semibold text-slate-700 capitalize truncate">{item.emotion}</span>
                              </div>
                              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-700 ease-out`}
                                  style={{ width: `${item.intensity}%` }}
                                />
                              </div>
                              <span className={`text-xs font-bold w-10 text-right tabular-nums ${
                                item.intensity >= 70 ? "text-red-600" : item.intensity >= 40 ? "text-amber-600" : "text-blue-600"
                              }`}>{item.intensity}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Hidden Implications */}
                  {result.emotionalIntelligence.hiddenImplications.length > 0 && (
                    <div data-testid="section-hidden-implications">
                      <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center">
                          <Eye className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        Hidden Implications
                      </h3>
                      <div className="space-y-2">
                        {result.emotionalIntelligence.hiddenImplications.map((imp, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm text-slate-700 bg-indigo-50/50 rounded-xl border border-indigo-100 p-4 hover:bg-indigo-50 transition-colors" data-testid={`hidden-implication-${i}`}>
                            <div className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-[10px] font-bold text-indigo-700">{i + 1}</span>
                            </div>
                            <span className="leading-relaxed">{imp}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Red Flags & Dark Corners */}
                  {result.emotionalIntelligence.redFlags.length > 0 && (
                    <div data-testid="section-red-flags">
                      <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-red-100 flex items-center justify-center">
                          <MessageSquareWarning className="w-3.5 h-3.5 text-red-600" />
                        </div>
                        Red Flags & Dark Corners
                      </h3>
                      <div className="space-y-3">
                        {result.emotionalIntelligence.redFlags.map((rf, i) => (
                          <div key={i} className="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-rose-50 overflow-hidden" data-testid={`red-flag-${i}`}>
                            <div className="px-4 pt-4 pb-3 border-b border-red-100 bg-red-50/50">
                              <div className="flex items-start gap-2.5">
                                <Quote className="w-4 h-4 text-red-400 flex-shrink-0 mt-1" />
                                <p className="text-sm font-medium text-red-900 italic leading-relaxed">"{rf.passage}"</p>
                              </div>
                            </div>
                            <div className="px-4 py-3 flex items-start gap-2.5">
                              <ArrowRight className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                              <p className="text-sm text-slate-700 leading-relaxed">{rf.explanation}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manipulation Tactics */}
                  {result.emotionalIntelligence.manipulationTactics.length > 0 && (
                    <div data-testid="section-manipulation-tactics">
                      <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center">
                          <Target className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        Manipulation Tactics
                      </h3>
                      <div className="space-y-2">
                        {result.emotionalIntelligence.manipulationTactics.map((tactic, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm text-slate-700 bg-amber-50/50 rounded-xl border border-amber-200 p-4 hover:bg-amber-50 transition-colors" data-testid={`manipulation-tactic-${i}`}>
                            <div className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <AlertTriangle className="w-3 h-3 text-amber-700" />
                            </div>
                            <span className="leading-relaxed">{tactic}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* True Intent Summary */}
                  {result.emotionalIntelligence.trueIntentSummary && (
                    <div className="relative rounded-xl overflow-hidden" data-testid="section-true-intent">
                      <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700" />
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,255,255,0.1),transparent_60%)]" />
                      <div className="relative p-5 sm:p-6">
                        <h3 className="text-xs font-bold text-purple-200 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4" />
                          What This Document Is Really Saying
                        </h3>
                        <p className="text-sm sm:text-base text-white/95 leading-relaxed font-medium">
                          {result.emotionalIntelligence.trueIntentSummary}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bottom nudge for guests */}
            {!me ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-blue-900 mb-1">Save your analysis history & draft a response letter</p>
                    <p className="text-sm text-blue-700">
                      Create a free account to save your analysis, access it anytime, and draft a professionally-reviewed legal letter — with the form pre-filled from this analysis.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                    <Link href="/signup">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5" data-testid="button-signup-nudge">
                        <UserPlus className="w-4 h-4" />
                        Create Account
                      </Button>
                    </Link>
                    <Link href="/login">
                      <Button variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100" data-testid="button-signin-nudge">
                        Sign In
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ) : !isSubscriber ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center">
                <p className="font-semibold text-blue-900 mb-1">Ready to take legal action?</p>
                <p className="text-sm text-blue-700 mb-4">
                  Subscribe to get attorney-reviewed legal letters — your first one is free, with the form pre-filled from this analysis.
                </p>
                <Link href="/pricing">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-pricing-cta">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    View Plans — First Letter Free
                  </Button>
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
