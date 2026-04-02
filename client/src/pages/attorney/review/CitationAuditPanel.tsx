import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Scale } from "lucide-react";
import { useState } from "react";
import type { CitationAuditReport, CitationAuditEntry } from "../../../../../shared/types";

interface Props {
  citationAuditReport: CitationAuditReport | null;
}

export function CitationAuditPanel({ citationAuditReport }: Props) {
  const [citationReportOpen, setCitationReportOpen] = useState(false);

  return (
    <Card className="h-full border-border">
      <CardContent className="p-3 space-y-3" data-testid="panel-citation-report">
        {!citationAuditReport ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Scale className="w-7 h-7 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Citation audit not yet available.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">
                Citation Confidence Report
              </p>
              <span
                data-testid="text-hallucination-risk"
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  citationAuditReport.hallucinationRiskScore === 0
                    ? "bg-green-100 text-green-700"
                    : citationAuditReport.hallucinationRiskScore <= 25
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                }`}
              >
                Risk: {citationAuditReport.hallucinationRiskScore}%
              </span>
            </div>

            <div className="bg-muted/50 rounded-lg p-2.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Total citations</span>
                <span className="font-medium text-foreground">
                  {citationAuditReport.totalCitations}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Verified</span>
                <span className="font-medium text-green-700">
                  {citationAuditReport.verifiedCitations?.length ?? 0}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Unverified</span>
                <span className="font-medium text-red-700">
                  {citationAuditReport.unverifiedCitations?.length ?? 0}
                </span>
              </div>
            </div>

            {citationAuditReport.verifiedCitations?.length > 0 && (
              <div>
                <button
                  onClick={() => setCitationReportOpen(!citationReportOpen)}
                  className="flex items-center gap-1 text-xs font-semibold text-foreground mb-1.5 hover:text-primary transition-colors"
                  data-testid="button-toggle-verified"
                >
                  {citationReportOpen ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  Verified Citations ({citationAuditReport.verifiedCitations.length})
                </button>
                {citationReportOpen && (
                  <div className="space-y-1.5">
                    {citationAuditReport.verifiedCitations.map(
                      (entry: CitationAuditEntry, i: number) => (
                        <div
                          key={i}
                          data-testid={`citation-verified-${i}`}
                          className={`rounded-lg p-2 border ${
                            entry.confidence === "low"
                              ? "bg-amber-50 border-amber-200"
                              : "bg-green-50 border-green-200"
                          }`}
                        >
                          <p className="text-xs font-mono text-foreground leading-snug">
                            {entry.citation}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                entry.confidence === "high"
                                  ? "bg-green-100 text-green-700"
                                  : entry.confidence === "medium"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {entry.confidence}
                            </span>
                            <span className="text-xs text-green-600">verified</span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {citationAuditReport.unverifiedCitations?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-700 mb-1.5">
                  Unverified Citations (
                  {citationAuditReport.unverifiedCitations.length})
                </p>
                <div className="space-y-1.5">
                  {citationAuditReport.unverifiedCitations.map(
                    (entry: CitationAuditEntry, i: number) => (
                      <div
                        key={i}
                        data-testid={`citation-unverified-${i}`}
                        className="bg-red-50 border border-red-200 rounded-lg p-2"
                      >
                        <p className="text-xs font-mono text-red-800 leading-snug">
                          {entry.citation}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                            unverified
                          </span>
                          <span className="text-xs text-red-600">
                            added by Claude
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Audited:{" "}
              {new Date(citationAuditReport.auditedAt).toLocaleString()}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
