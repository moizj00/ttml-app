import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Upload,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Copy,
  ArrowRight,
  Zap,
  Calendar,
  Users,
  MapPin,
  Scale,
  UserPlus,
  Clock,
  CheckCircle,
  Brain,
  Quote,
  Target,
  MessageSquareWarning,
  ShieldAlert,
} from "lucide-react";
import type { DocumentAnalysisResult } from "@shared/types";
import { LETTER_TYPE_CONFIG } from "@shared/types";
import {
  urgencyColor,
  urgencyLabel,
  severityColor,
  severityBadgeVariant,
  severityLabel,
} from "./hooks/useDocumentAnalyzer";

interface AnalysisResultsProps {
  result: DocumentAnalysisResult;
  fileName: string;
  me: { role: string } | null | undefined;
  isSubscriber: boolean;
  onDraftLetter: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onReset: () => void;
}

export function AnalysisResults({
  result,
  fileName,
  me,
  isSubscriber,
  onDraftLetter,
  onCopy,
  onDownload,
  onReset,
}: AnalysisResultsProps) {
  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <span className="font-semibold text-slate-800 truncate text-sm">{fileName}</span>
          <Badge variant="secondary" className="flex-shrink-0">Analyzed</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            className="gap-1.5"
            data-testid="button-copy-analysis"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDownload}
            className="gap-1.5"
            data-testid="button-download-analysis"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
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

      {/* Recommended Action Card */}
      <div
        className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-blue-600/20"
        data-testid="card-recommended-action"
      >
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-blue-200" />
          <span className="text-sm font-semibold text-blue-100 uppercase tracking-wide">
            Recommended Action
          </span>
        </div>

        {result.recommendedResponseSummary ? (
          <p
            className="text-lg sm:text-xl font-semibold text-white mb-5 leading-snug"
            data-testid="text-recommended-summary"
          >
            {result.recommendedResponseSummary}
          </p>
        ) : (
          <p className="text-lg font-semibold text-white mb-5">
            Review this document carefully and consider a legal response.
          </p>
        )}

        {/* Metadata row */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${urgencyColor(result.urgencyLevel)}`}
            data-testid="badge-urgency"
          >
            <Clock className="w-3.5 h-3.5" />
            {urgencyLabel(result.urgencyLevel)}
          </span>

          {result.recommendedLetterType && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/20 text-white"
              data-testid="badge-letter-type"
            >
              <Scale className="w-3.5 h-3.5" />
              {LETTER_TYPE_CONFIG[result.recommendedLetterType]?.label ??
                result.recommendedLetterType}
            </span>
          )}

          {result.detectedDeadline && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/20 text-white"
              data-testid="text-deadline"
            >
              <Calendar className="w-3.5 h-3.5" />
              Deadline: {result.detectedDeadline}
            </span>
          )}

          {result.detectedJurisdiction && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/20 text-white"
              data-testid="text-jurisdiction"
            >
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
                <p className="text-white text-sm font-semibold">
                  {result.detectedParties.senderName}
                </p>
              </div>
            )}
            {result.detectedParties.senderName && result.detectedParties.recipientName && (
              <div className="w-px bg-white/20 self-stretch" />
            )}
            {result.detectedParties.recipientName && (
              <div data-testid="text-recipient-name">
                <p className="text-blue-200 text-xs font-medium mb-0.5">Sent to</p>
                <p className="text-white text-sm font-semibold">
                  {result.detectedParties.recipientName}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Draft CTA */}
        <Button
          onClick={onDraftLetter}
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
        <div
          className="prose prose-slate max-w-none text-slate-600 text-sm leading-relaxed whitespace-pre-line"
          data-testid="text-summary"
        >
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
          <Badge variant="secondary" className="ml-auto">
            {result.actionItems.length}
          </Badge>
        </div>
        {result.actionItems.length === 0 ? (
          <p className="text-slate-400 text-sm">No specific action items identified.</p>
        ) : (
          <ul className="space-y-3" data-testid="list-action-items">
            {result.actionItems.map((item, i) => (
              <li key={i} className="flex items-start gap-3" data-testid={`item-action-${i}`}>
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
          <h2 className="text-lg font-semibold text-slate-900">
            Flagged Risks & Important Clauses
          </h2>
          <Badge variant="secondary" className="ml-auto">
            {result.flaggedRisks.length}
          </Badge>
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
                  <Badge
                    variant={severityBadgeVariant(risk.severity)}
                    className="flex-shrink-0 text-xs"
                  >
                    {severityLabel(risk.severity)}
                  </Badge>
                </div>
                <p className="text-sm opacity-90">{risk.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emotional Intelligence Section */}
      {result.emotionalIntelligence && (
        <div
          className="relative overflow-hidden rounded-2xl shadow-lg"
          data-testid="card-emotional-intelligence"
        >
          {/* Header banner */}
          <div className="relative bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-6 sm:px-8 pt-6 pb-8">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_70%)]" />
            <div className="relative flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Emotional Intelligence
                </h2>
                <p className="text-xs text-purple-200">Reading between the lines</p>
              </div>
              <Badge
                variant="outline"
                className="ml-auto border-white/30 text-white bg-white/10 backdrop-blur-sm text-[10px] uppercase tracking-widest font-bold"
              >
                Insight
              </Badge>
            </div>
            {/* Overall Tone */}
            <div
              className="relative rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-5"
              data-testid="section-overall-tone"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-xs font-semibold text-purple-200 uppercase tracking-wider">
                  Detected Tone
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    result.emotionalIntelligence.toneConfidence === "high"
                      ? "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/30"
                      : result.emotionalIntelligence.toneConfidence === "medium"
                      ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/30"
                      : "bg-white/10 text-white/70 ring-1 ring-white/20"
                  }`}
                  data-testid="badge-tone-confidence"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      result.emotionalIntelligence.toneConfidence === "high"
                        ? "bg-emerald-400"
                        : result.emotionalIntelligence.toneConfidence === "medium"
                        ? "bg-amber-400"
                        : "bg-white/50"
                    }`}
                  />
                  {result.emotionalIntelligence.toneConfidence} confidence
                </span>
              </div>
              <p
                className="text-xl sm:text-2xl font-bold text-white leading-tight"
                data-testid="text-overall-tone"
              >
                {result.emotionalIntelligence.overallTone}
              </p>
            </div>
          </div>

          {/* Body content */}
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
                    const barGradient =
                      item.intensity >= 70
                        ? "from-rose-400 to-red-500"
                        : item.intensity >= 40
                        ? "from-amber-300 to-orange-400"
                        : "from-sky-300 to-blue-400";
                    const dotColor =
                      item.intensity >= 70
                        ? "bg-red-500"
                        : item.intensity >= 40
                        ? "bg-amber-400"
                        : "bg-blue-400";
                    return (
                      <div
                        key={i}
                        className="group flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                        data-testid={`emotion-bar-${i}`}
                      >
                        <div className="flex items-center gap-2 w-32 min-w-[8rem]">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                          <span className="text-xs font-semibold text-slate-700 capitalize truncate">
                            {item.emotion}
                          </span>
                        </div>
                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-700`}
                            style={{ width: `${item.intensity}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-500 w-10 text-right">
                          {item.intensity}%
                        </span>
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
                    <Brain className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  Hidden Implications
                </h3>
                <div className="space-y-2">
                  {result.emotionalIntelligence.hiddenImplications.map((imp, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 text-sm text-slate-700 bg-indigo-50/50 rounded-xl border border-indigo-100 p-4 hover:bg-indigo-50 transition-colors"
                      data-testid={`hidden-implication-${i}`}
                    >
                      <div className="w-5 h-5 rounded-full bg-indigo-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-indigo-700">{i + 1}</span>
                      </div>
                      <span className="leading-relaxed">{imp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Red Flags */}
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
                    <div
                      key={i}
                      className="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-rose-50 overflow-hidden"
                      data-testid={`red-flag-${i}`}
                    >
                      <div className="px-4 pt-4 pb-3 border-b border-red-100 bg-red-50/50">
                        <div className="flex items-start gap-2.5">
                          <Quote className="w-4 h-4 text-red-400 flex-shrink-0 mt-1" />
                          <p className="text-sm font-medium text-red-900 italic leading-relaxed">
                            "{rf.passage}"
                          </p>
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
                    <div
                      key={i}
                      className="flex items-start gap-3 text-sm text-slate-700 bg-amber-50/50 rounded-xl border border-amber-200 p-4 hover:bg-amber-50 transition-colors"
                      data-testid={`manipulation-tactic-${i}`}
                    >
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
              <div
                className="relative rounded-xl overflow-hidden"
                data-testid="section-true-intent"
              >
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

      {/* Extracted Evidence */}
      {result.extractedEvidence && result.extractedEvidence.length > 0 && (
        <div className="rounded-2xl border overflow-hidden" data-testid="evidence-section">
          <div className="bg-gradient-to-r from-emerald-700 to-teal-700 px-4 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Extracted Evidence</h2>
                <p className="text-emerald-100 text-xs">
                  {result.extractedEvidence.length} items identified
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-3 bg-emerald-50/30">
            {result.extractedEvidence.map((item, i) => {
              const typeIcons: Record<string, React.ElementType> = {
                date: Calendar,
                amount: Scale,
                party: Users,
                clause: FileText,
                deadline: Clock,
                obligation: ClipboardList,
              };
              const TypeIcon = typeIcons[item.type] ?? FileText;
              const confidenceColor =
                item.confidence === "high"
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : item.confidence === "medium"
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-gray-100 text-gray-600 border-gray-200";
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-white border"
                  data-testid={`evidence-item-${i}`}
                >
                  <TypeIcon className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wider"
                      >
                        {item.type}
                      </Badge>
                      <span className="text-sm font-semibold">{item.value}</span>
                      <Badge className={`text-[10px] ${confidenceColor} border`}>
                        {item.confidence}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.context}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nudge */}
      {!me ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-blue-900 mb-1">
                Save your analysis history & draft a response letter
              </p>
              <p className="text-sm text-blue-700">
                Create a free account to save your analysis, access it anytime, and draft a
                professionally-reviewed legal letter — with the form pre-filled from this analysis.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
              <Link href="/signup">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                  data-testid="button-signup-nudge"
                >
                  <UserPlus className="w-4 h-4" />
                  Create Account
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  variant="outline"
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                  data-testid="button-signin-nudge"
                >
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
            Subscribe to get attorney-reviewed legal letters — your first one is free, with the
            form pre-filled from this analysis.
          </p>
          <Link href="/pricing">
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-pricing-cta"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              View Plans — First Letter Free
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
