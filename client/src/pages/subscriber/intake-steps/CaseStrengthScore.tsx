import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import type { FormData } from "./types";

interface CaseStrengthScoreProps {
  form: FormData;
  hasExhibits: boolean;
}

interface ScoreFactor {
  name: string;
  score: number;
  maxScore: number;
  explanation: string;
  suggestion: string | null;
}

interface ImprovementTip {
  action: string;
  impact: string;
}

interface ScoreResult {
  score: number;
  maxScore: number;
  factors: ScoreFactor[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  improvementTips: ImprovementTip[];
}

function getScoreColor(score: number): string {
  if (score >= 8) return "text-green-600";
  if (score >= 6) return "text-blue-600";
  if (score >= 4) return "text-amber-600";
  return "text-red-600";
}

function getScoreBgColor(score: number): string {
  if (score >= 8) return "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800";
  if (score >= 6) return "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800";
  if (score >= 4) return "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800";
  return "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800";
}

function getScoreLabel(score: number): string {
  if (score >= 9) return "Very Strong";
  if (score >= 7) return "Strong";
  if (score >= 5) return "Moderate";
  if (score >= 3) return "Needs Work";
  return "Weak";
}

function ScoreGauge({ score, maxScore }: { score: number; maxScore: number }) {
  const percentage = (score / maxScore) * 100;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  let strokeColor = "#ef4444";
  if (score >= 8) strokeColor = "#22c55e";
  else if (score >= 6) strokeColor = "#3b82f6";
  else if (score >= 4) strokeColor = "#f59e0b";

  return (
    <div className="relative w-32 h-32 mx-auto" data-testid="score-gauge">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted/20"
        />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${getScoreColor(score)}`} data-testid="text-score-value">
          {score}
        </span>
        <span className="text-xs text-muted-foreground">/ {maxScore}</span>
      </div>
    </div>
  );
}

export function CaseStrengthScore({
  form,
  hasExhibits,
}: CaseStrengthScoreProps) {
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const scoreMutation = trpc.intake.scoreCase.useMutation({
    onSuccess: (data) => {
      setResult({
        score: data.score,
        maxScore: data.maxScore,
        factors: data.factors,
        summary: data.summary,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        improvementTips: data.improvementTips,
      });
    },
  });

  const canScore =
    form.letterType &&
    form.jurisdictionState &&
    form.description.length >= 10 &&
    form.desiredOutcome.length >= 5;

  const handleScore = () => {
    if (!canScore) return;
    scoreMutation.mutate({
      letterType: form.letterType,
      jurisdictionState: form.jurisdictionState,
      senderName: form.senderName || undefined,
      recipientName: form.recipientName || undefined,
      description: form.description,
      desiredOutcome: form.desiredOutcome,
      amountOwed: form.amountOwed || undefined,
      incidentDate: form.incidentDate || undefined,
      additionalContext: form.additionalContext || undefined,
      priorCommunication: form.priorCommunication || undefined,
      communicationsSummary: form.communicationsSummary || undefined,
      hasExhibits,
    });
  };

  if (!result && !scoreMutation.isPending) {
    return (
      <div
        className="border border-dashed border-blue-300 dark:border-blue-700 rounded-xl p-6 text-center space-y-3 bg-blue-50/50 dark:bg-blue-950/10"
        data-testid="case-strength-prompt"
      >
        <Shield className="w-10 h-10 text-blue-500 mx-auto" />
        <h3 className="font-semibold text-foreground">
          Check Your Case Strength
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Get an AI-powered assessment of your case strength before submitting.
          See what's strong and what could be improved.
        </p>
        <Button
          onClick={handleScore}
          disabled={!canScore}
          className="bg-blue-600 hover:bg-blue-700 text-white"
          data-testid="button-score-case"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Score My Case
        </Button>
        {!canScore && (
          <p className="text-xs text-muted-foreground">
            Complete the required fields first (letter type, jurisdiction,
            description, and desired outcome).
          </p>
        )}
      </div>
    );
  }

  if (scoreMutation.isPending) {
    return (
      <div className="border rounded-xl p-8 text-center space-y-3" data-testid="case-strength-loading">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
        <p className="text-sm text-muted-foreground">
          Analyzing your case strength...
        </p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div
      className={`border rounded-xl overflow-hidden ${getScoreBgColor(result.score)}`}
      data-testid="case-strength-result"
    >
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-6">
          <ScoreGauge score={result.score} maxScore={result.maxScore} />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg text-foreground">
                Case Strength:{" "}
                <span className={getScoreColor(result.score)}>
                  {getScoreLabel(result.score)}
                </span>
              </h3>
              <Badge
                variant={result.score >= 7 ? "default" : "secondary"}
                className="text-xs"
              >
                {result.score}/{result.maxScore}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-score-summary">
              {result.summary}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {result.strengths.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
                <CheckCircle className="w-3.5 h-3.5" /> Strengths
              </div>
              {result.strengths.map((s, i) => (
                <div
                  key={i}
                  className="text-xs text-muted-foreground pl-5"
                  data-testid={`text-strength-${i}`}
                >
                  • {s}
                </div>
              ))}
            </div>
          )}
          {result.weaknesses.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" /> Areas to Improve
              </div>
              {result.weaknesses.map((w, i) => (
                <div
                  key={i}
                  className="text-xs text-muted-foreground pl-5"
                  data-testid={`text-weakness-${i}`}
                >
                  • {w}
                </div>
              ))}
            </div>
          )}
        </div>

        {result.improvementTips.length > 0 && (
          <div className="bg-white/60 dark:bg-black/10 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> How to
              Strengthen Your Case
            </div>
            {result.improvementTips.map((tip, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs"
                data-testid={`tip-${i}`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-foreground">
                    {tip.action}
                  </span>
                  {tip.impact && (
                    <span className="text-muted-foreground">
                      {" "}
                      — {tip.impact}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs w-full"
          data-testid="button-toggle-details"
        >
          {showDetails ? (
            <>
              Hide Factor Breakdown <ChevronUp className="w-3 h-3 ml-1" />
            </>
          ) : (
            <>
              Show Factor Breakdown <ChevronDown className="w-3 h-3 ml-1" />
            </>
          )}
        </Button>

        {showDetails && result.factors.length > 0 && (
          <div className="space-y-2">
            {result.factors.map((factor, i) => (
              <div
                key={i}
                className="bg-white/60 dark:bg-black/10 rounded-lg p-3 space-y-1"
                data-testid={`factor-${i}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    {factor.name}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {factor.score}/{factor.maxScore}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {factor.explanation}
                </p>
                {factor.suggestion && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 italic">
                    Tip: {factor.suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScore}
            disabled={scoreMutation.isPending}
            className="text-xs"
            data-testid="button-rescore"
          >
            {scoreMutation.isPending ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3 mr-1" />
            )}
            Re-score
          </Button>
        </div>
      </div>
    </div>
  );
}
