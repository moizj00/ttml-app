import { Helmet } from "react-helmet-async";
import { FileText, ShieldAlert } from "lucide-react";
import { FileUploadZone } from "./FileUploadZone";
import { AnalysisResults } from "./AnalysisResults";
import { useDocumentAnalyzer } from "./hooks/useDocumentAnalyzer";
import PublicNav from "@/components/shared/PublicNav";
import PublicBreadcrumb from "@/components/shared/PublicBreadcrumb";

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
  description:
    "Upload any legal document (PDF, DOCX, or TXT) and instantly get automated analysis, flagged risks, action items, and a recommended legal response letter.",
  featureList: [
    "Automated legal document analysis",
    "Risk flagging and severity classification",
    "Recommended action items",
    "Auto-detection of jurisdiction and parties",
    "One-click letter drafting from analysis",
  ],
};

export default function DocumentAnalyzer() {
  const {
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
  } = useDocumentAnalyzer();

  return (
    <div className="min-h-screen bg-slate-50 font-['Inter'] text-slate-900">
      <Helmet>
        <title>
          Free Legal Document Analyzer — Instant Risk Analysis | Talk to My Lawyer
        </title>
        <meta
          name="description"
          content="Upload any legal document (PDF, DOCX, TXT) and get instant automated analysis. Identifies risks, flags important clauses, and recommends attorney-reviewed response letters."
        />
        <link rel="canonical" href="https://www.talk-to-my-lawyer.com/analyze" />
        <meta
          property="og:title"
          content="Free Legal Document Analyzer | Talk to My Lawyer"
        />
        <meta
          property="og:description"
          content="Instantly analyze legal documents online. Identifies risks, detects jurisdiction, flags key clauses, and recommends a professional legal response letter."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.talk-to-my-lawyer.com/analyze" />
        <meta
          property="og:image"
          content="https://www.talk-to-my-lawyer.com/logo-main.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Free Legal Document Analyzer | Talk to My Lawyer"
        />
        <meta
          name="twitter:description"
          content="Upload any legal document and get instant risk analysis plus a path to an attorney-reviewed response letter."
        />
        <meta
          name="twitter:image"
          content="https://www.talk-to-my-lawyer.com/logo-main.png"
        />
        <script type="application/ld+json">{JSON.stringify(analyzerJsonLd)}</script>
      </Helmet>

      <PublicNav activeLink="/analyze" />
      <PublicBreadcrumb items={[{ label: "Document Analyzer" }]} />

      <main className="pb-16 px-4 max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-5">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
            Document Analyzer
          </h1>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Upload any legal document and instantly get automated analysis, recommended action,
            and a path to a professionally drafted response letter.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            Not legal advice — consult a qualified attorney for legal guidance
          </div>
        </div>

        {/* Upload zone or results */}
        {!result ? (
          <FileUploadZone
            file={file}
            dragging={dragging}
            isAnalyzing={isAnalyzing}
            fileInputRef={fileInputRef}
            onFile={handleFile}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onRemoveFile={() => {
              handleReset();
            }}
            onAnalyze={handleAnalyze}
          />
        ) : (
          <AnalysisResults
            result={result}
            fileName={file?.name ?? ""}
            me={me}
            isSubscriber={isSubscriber}
            onDraftLetter={handleDraftLetter}
            onCopy={handleCopy}
            onDownload={handleDownload}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  );
}
