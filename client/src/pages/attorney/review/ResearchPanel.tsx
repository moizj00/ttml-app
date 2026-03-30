import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, AlertCircle } from "lucide-react";

interface ResearchPacketSummary {
  researchSummary?: string;
  applicableRules?: Array<{
    ruleTitle?: string;
    relevanceScore?: number;
    citationText?: string;
    citation?: string;
    summary?: string;
    confidence?: string;
  }>;
  issuesIdentified?: string[];
  riskFlags?: string[];
  openQuestions?: string[];
  [key: string]: unknown;
}

interface ResearchRun {
  id: number;
  cacheHit?: boolean | null;
  resultJson?: unknown;
  validationResultJson?: unknown;
}

interface Props {
  research: ResearchRun[] | null | undefined;
}

export function ResearchPanel({ research }: Props) {
  return (
    <Card className="h-full border-border">
      <CardContent className="p-3 space-y-3">
        {!research || research.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <BookOpen className="w-7 h-7 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Research not yet available.
            </p>
          </div>
        ) : (
          research.map(run => {
            const packet = (run.resultJson ??
              run.validationResultJson) as ResearchPacketSummary | null;
            const isCacheHit = run.cacheHit === true;
            return (
              <div key={run.id} className="space-y-2">
                {isCacheHit && (
                  <div
                    data-testid="badge-research-cache-hit"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200"
                  >
                    <span className="text-xs text-emerald-700 font-medium">
                      Served from cache
                    </span>
                    <span className="text-xs text-emerald-600">
                      &mdash; Perplexity API call skipped
                    </span>
                  </div>
                )}
                {packet?.researchSummary && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-800 mb-1">
                      Research Summary
                    </p>
                    <p className="text-xs text-blue-900 leading-relaxed">
                      {packet.researchSummary}
                    </p>
                  </div>
                )}
                {packet?.applicableRules && packet.applicableRules.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-1.5">
                      Applicable Laws
                    </p>
                    <div className="space-y-1.5">
                      {packet.applicableRules.slice(0, 5).map((rule, i) => (
                        <div key={i} className="bg-muted/50 rounded-lg p-2.5">
                          <div className="flex items-start justify-between gap-1.5">
                            <p className="text-xs font-medium text-foreground leading-snug">
                              {rule.ruleTitle}
                            </p>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                                rule.confidence === "high"
                                  ? "bg-green-100 text-green-700"
                                  : rule.confidence === "medium"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {rule.confidence}
                            </span>
                          </div>
                          {rule.summary && (
                            <p className="text-xs text-muted-foreground mt-1 leading-snug">
                              {rule.summary}
                            </p>
                          )}
                          {rule.citationText && (
                            <p className="text-xs text-primary mt-1 font-mono">
                              {rule.citationText}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {packet?.riskFlags && packet.riskFlags.length > 0 && (
                  <div className="bg-red-50 rounded-lg p-2.5">
                    <p className="text-xs font-semibold text-red-800 mb-1">
                      Risk Flags
                    </p>
                    <ul className="space-y-0.5">
                      {packet.riskFlags.map((flag: string, i: number) => (
                        <li
                          key={i}
                          className="text-xs text-red-700 flex items-start gap-1"
                        >
                          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {packet?.openQuestions && packet.openQuestions.length > 0 && (
                  <div className="bg-amber-50 rounded-lg p-2.5">
                    <p className="text-xs font-semibold text-amber-800 mb-1">
                      Open Questions
                    </p>
                    <ul className="space-y-0.5">
                      {packet.openQuestions.map((q: string, i: number) => (
                        <li key={i} className="text-xs text-amber-700">
                          • {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
