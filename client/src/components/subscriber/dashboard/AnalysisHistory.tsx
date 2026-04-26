import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  ArrowRight,
  ScanSearch,
  Loader2,
  Calendar,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import type { DocumentAnalysis } from "../../../../drizzle/schema";
import type { DocumentAnalysisResult } from "../../../../shared/types";

interface AnalysisHistoryProps {
  isLoading: boolean;
  analyses: any;
  onUseAnalysis: (analysis: Partial<DocumentAnalysisResult>) => void;
}

export function AnalysisHistory({
  isLoading,
  analyses,
  onUseAnalysis,
}: AnalysisHistoryProps) {
  // Safely cast the jsonb field
  const getAnalysisJson = (
    row: DocumentAnalysis
  ): Partial<DocumentAnalysisResult> =>
    (row.analysisJson ?? {}) as Partial<DocumentAnalysisResult>;

  if (!isLoading && !analyses?.rows?.length) {
    return (
      <Card data-testid="card-analysis-history">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanSearch className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-base">
              Document Analysis History
            </CardTitle>
          </div>
          <Link href="/analyze">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              data-testid="button-new-analysis"
            >
              <ScanSearch className="w-3.5 h-3.5" />
              New Analysis
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <ScanSearch className="w-6 h-6 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600">
                No analyses yet
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Upload a legal document to get an instant analysis and
                recommended action.
              </p>
            </div>
            <Link href="/analyze">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 mt-1"
                data-testid="button-start-analysis-empty"
              >
                <ScanSearch className="w-3.5 h-3.5" />
                Analyze a Document
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-analysis-history">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanSearch className="w-5 h-5 text-blue-600" />
          <CardTitle className="text-base">Document Analysis History</CardTitle>
        </div>
        <Link href="/analyze">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            data-testid="button-new-analysis"
          >
            <ScanSearch className="w-3.5 h-3.5" />
            New Analysis
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading analyses…
          </div>
        ) : (
          <div className="space-y-2">
            {(analyses?.rows ?? []).map((row: DocumentAnalysis) => {
              const analysis = getAnalysisJson(row);
              const letterType = analysis.recommendedLetterType;
              const letterLabel = letterType
                ? (LETTER_TYPE_CONFIG[letterType]?.label ?? letterType)
                : null;
              const createdAt = row.createdAt ? new Date(row.createdAt) : null;
              const hasUsefulPrefill = !!(
                letterType || analysis.recommendedResponseSummary
              );

              return (
                <div
                  key={row.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                  data-testid={`row-analysis-${row.id}`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium text-slate-800 truncate"
                        data-testid={`text-analysis-name-${row.id}`}
                      >
                        {row.documentName}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {createdAt && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Calendar className="w-3 h-3" />
                            {createdAt.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        {letterLabel && (
                          <Badge
                            variant="secondary"
                            className="text-xs flex items-center gap-1"
                            data-testid={`badge-analysis-type-${row.id}`}
                          >
                            <Scale className="w-3 h-3" />
                            {letterLabel}
                          </Badge>
                        )}
                        {analysis.urgencyLevel === "high" && (
                          <Badge variant="destructive" className="text-xs">
                            High Urgency
                          </Badge>
                        )}
                        {analysis.detectedDeadline && (
                          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            Deadline: {analysis.detectedDeadline}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {hasUsefulPrefill && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUseAnalysis(analysis)}
                      className="flex-shrink-0 gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
                      data-testid={`button-use-analysis-${row.id}`}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Draft Letter
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
