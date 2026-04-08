import { useState } from "react";
import AppLayout from "@/components/shared/AppLayout";
import { SectionErrorBoundary } from "@/components/ErrorBoundary";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  TrendingUp,
  XCircle,
  Search,
  Timer,
  BarChart3,
  Gauge,
  Zap,
} from "lucide-react";

type DateRange = "7d" | "30d" | "90d" | "all";

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatDurationLong(ms: number): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)} seconds`;
  if (ms < 3_600_000) {
    const mins = Math.floor(ms / 60_000);
    const secs = Math.round((ms % 60_000) / 1000);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins} minutes`;
  }
  const hrs = Math.floor(ms / 3_600_000);
  const mins = Math.round((ms % 3_600_000) / 60_000);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs} hours`;
}

const stageLabels: Record<string, string> = {
  research: "Research",
  draft_generation: "Drafting",
  generation_pipeline: "Assembly",
  vetting: "Vetting",
  retry: "Retry",
};

const stageColors: Record<string, { text: string; bg: string; bar: string }> = {
  research: { text: "text-cyan-700", bg: "bg-cyan-50", bar: "bg-cyan-500" },
  draft_generation: { text: "text-blue-700", bg: "bg-blue-50", bar: "bg-blue-500" },
  generation_pipeline: { text: "text-indigo-700", bg: "bg-indigo-50", bar: "bg-indigo-500" },
  vetting: { text: "text-purple-700", bg: "bg-purple-50", bar: "bg-purple-500" },
  retry: { text: "text-amber-700", bg: "bg-amber-50", bar: "bg-amber-500" },
};

const bucketColors: Record<string, { text: string; bg: string }> = {
  excellent: { text: "text-green-700", bg: "bg-green-100" },
  good: { text: "text-blue-700", bg: "bg-blue-100" },
  fair: { text: "text-amber-700", bg: "bg-amber-100" },
  poor: { text: "text-red-700", bg: "bg-red-100" },
};

export default function PipelineAnalytics() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const { data, isLoading, error, refetch } = trpc.admin.pipelineAnalytics.useQuery(
    { dateRange },
    { refetchOnWindowFocus: false }
  );

  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "all", label: "All time" },
  ];

  return (
    <AppLayout breadcrumb={[{ label: "Admin Dashboard", href: "/admin" }, { label: "Pipeline Analytics" }]}>
      <div className="space-y-6">
        <div className="rounded-2xl bg-linear-to-r from-slate-800 to-slate-700 p-5 text-white sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold mb-1">Pipeline Analytics</h1>
              <p className="text-slate-300 text-sm">
                Performance metrics, bottleneck detection, and quality trends
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-slate-600">
                {dateRangeOptions.map(opt => (
                  <button
                    key={opt.value}
                    data-testid={`filter-range-${opt.value}`}
                    onClick={() => setDateRange(opt.value)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      dateRange === opt.value
                        ? "bg-white text-slate-800"
                        : "text-slate-300 hover:text-white hover:bg-slate-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                className="text-white hover:bg-slate-600"
                data-testid="button-refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card className="border-destructive/50">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-8 h-8 text-destructive mb-3" />
              <p className="text-sm font-medium text-destructive">Failed to load analytics</p>
              <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} data-testid="button-retry">
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : !data ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">Analytics unavailable</p>
              <p className="text-xs text-muted-foreground mt-1">Could not load pipeline data. The database may be temporarily unavailable.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} data-testid="button-retry-unavailable">
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <SectionErrorBoundary label="Success Rate">
            {/* Pipeline Success Rate */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center mb-3 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-success-rate">{data.successRate.rate}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pipeline Success Rate</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mb-3 text-blue-600">
                    <Activity className="w-5 h-5" />
                  </div>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-total-letters">{data.successRate.totalLetters}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total Letters Processed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center mb-3 text-emerald-600">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-approved-count">{data.successRate.approvedCount}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Approved Letters</p>
                </CardContent>
              </Card>
              <Card className={data.successRate.failedCount > 0 ? "border-red-300" : ""}>
                <CardContent className="p-4">
                  <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center mb-3 text-red-600">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-failed-count">{data.successRate.failedCount}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pipeline Failures</p>
                </CardContent>
              </Card>
            </div>
            </SectionErrorBoundary>

            <SectionErrorBoundary label="Stage Timings & Review">
            {/* Stage Processing Times */}
            {data.stageTimings.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Timer className="w-4 h-4 text-primary" />
                    Average Processing Time by Stage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.stageTimings.map(stage => {
                      const maxDuration = Math.max(...data.stageTimings.map(s => s.avgDurationMs), 1);
                      const pct = Math.max((stage.avgDurationMs / maxDuration) * 100, 2);
                      const colors = stageColors[stage.stage] || stageColors.retry;
                      const successRate = stage.totalJobs > 0
                        ? Math.round((stage.completed / stage.totalJobs) * 100)
                        : 0;
                      return (
                        <div key={stage.stage} data-testid={`stage-timing-${stage.stage}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${colors.text}`}>
                                {stageLabels[stage.stage] || stage.stage}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {stage.totalJobs} jobs
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-green-600">{successRate}% pass</span>
                              <span className="font-medium">{formatDuration(stage.avgDurationMs)}</span>
                            </div>
                          </div>
                          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Citation Validation + Attorney Review */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Citation Stats */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Search className="w-4 h-4 text-primary" />
                    Citation Validation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Total Runs", value: data.citationStats.totalRuns, color: "text-slate-700", bg: "bg-slate-50" },
                      { label: "Completed", value: data.citationStats.completedRuns, color: "text-green-700", bg: "bg-green-50" },
                      { label: "Failed/Invalid", value: data.citationStats.failedRuns, color: "text-red-700", bg: "bg-red-50" },
                      { label: "Cache Hits", value: data.citationStats.cacheHits, color: "text-blue-700", bg: "bg-blue-50" },
                    ].map(item => (
                      <div key={item.label} className={`${item.bg} rounded-lg p-3 text-center`}>
                        <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>
                  {data.citationStats.totalRuns > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Pass Rate</span>
                        <span className="font-medium">
                          {data.citationStats.totalRuns > 0
                            ? Math.round((data.citationStats.completedRuns / data.citationStats.totalRuns) * 100)
                            : 0}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all duration-500"
                          style={{
                            width: `${data.citationStats.totalRuns > 0
                              ? (data.citationStats.completedRuns / data.citationStats.totalRuns) * 100
                              : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Attorney Review Turnaround */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Attorney Review Turnaround
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.reviewTurnaround.length > 0 ? (
                    <div className="space-y-3">
                      {data.reviewTurnaround.map(review => {
                        const actionLabels: Record<string, { label: string; color: string; bg: string }> = {
                          approve: { label: "Approved", color: "text-green-700", bg: "bg-green-50" },
                          reject: { label: "Rejected", color: "text-red-700", bg: "bg-red-50" },
                          needs_changes: { label: "Needs Changes", color: "text-amber-700", bg: "bg-amber-50" },
                        };
                        const config = actionLabels[review.action] || { label: review.action, color: "text-slate-700", bg: "bg-slate-50" };
                        return (
                          <div key={review.action} className={`${config.bg} rounded-lg p-3 flex items-center justify-between`} data-testid={`review-turnaround-${review.action}`}>
                            <div>
                              <p className={`text-sm font-medium ${config.color}`}>{config.label}</p>
                              <p className="text-xs text-muted-foreground">{review.count} actions</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-foreground">{formatDurationLong(review.avgTurnaroundMs)}</p>
                              <p className="text-xs text-muted-foreground">avg turnaround</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No review actions in this period</p>
                  )}
                </CardContent>
              </Card>
            </div>
            </SectionErrorBoundary>

            <SectionErrorBoundary label="Quality Scores">
            {/* Quality Score Distribution + Trend */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Quality Distribution */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-primary" />
                    Quality Score Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.qualityDistribution.length > 0 ? (
                    <>
                      <div className="space-y-2.5">
                        {(() => {
                          const total = data.qualityDistribution.reduce((sum, q) => sum + q.count, 0);
                          const orderedBuckets = ["excellent", "good", "fair", "poor"];
                          return orderedBuckets
                            .map(b => data.qualityDistribution.find(q => q.bucket === b))
                            .filter(Boolean)
                            .map(q => {
                              const pct = total > 0 ? Math.round((q!.count / total) * 100) : 0;
                              const colors = bucketColors[q!.bucket] || bucketColors.fair;
                              return (
                                <div key={q!.bucket} data-testid={`quality-bucket-${q!.bucket}`}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className={`text-sm font-medium capitalize ${colors.text}`}>
                                      {q!.bucket}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {q!.count} ({pct}%)
                                    </span>
                                  </div>
                                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${colors.bg} transition-all duration-500`}
                                      style={{ width: `${Math.max(pct, 2)}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            });
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                        Excellent: 90+ | Good: 70-89 | Fair: 50-69 | Poor: &lt;50
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No quality scores in this period</p>
                  )}
                </CardContent>
              </Card>

              {/* Quality Trend */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Quality Score Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.qualityTrend.length > 0 ? (
                    <>
                      <div className="flex items-end gap-1 h-24 w-full">
                        {(() => {
                          const maxScore = Math.max(...data.qualityTrend.map(d => d.avgScore), 1);
                          return data.qualityTrend.map(d => (
                            <div
                              key={d.date}
                              className="flex-1 min-w-0 group relative"
                              title={`${d.date}: Score ${d.avgScore} (${d.count} letters, ${d.firstPassRate}% first-pass)`}
                            >
                              <div
                                className="bg-indigo-400 rounded-t hover:bg-indigo-500 transition-colors"
                                style={{ height: `${Math.max((d.avgScore / maxScore) * 88, 2)}px` }}
                              />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-foreground text-background text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                                {d.date}: {d.avgScore}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                        <span>{data.qualityTrend[0]?.date}</span>
                        <span>{data.qualityTrend[data.qualityTrend.length - 1]?.date}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No quality score data yet</p>
                  )}
                </CardContent>
              </Card>
            </div>
            </SectionErrorBoundary>

            <SectionErrorBoundary label="Retries & Failures">
            {/* Retry Stats + Failure Reasons */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Retry Stats */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    Pipeline Retries
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-amber-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-amber-700" data-testid="text-retried-jobs">{data.retryStats.retriedJobs}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Retried Jobs</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-slate-700" data-testid="text-total-jobs">{data.retryStats.totalJobs}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total Jobs</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-orange-700">{data.retryStats.maxAttempts || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Max Attempts</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-blue-700">{data.retryStats.avgRetries || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Avg Retries</p>
                    </div>
                  </div>
                  {data.retryStats.totalJobs > 0 && (
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                      <span className="font-medium text-foreground">
                        {data.retryStats.totalJobs > 0
                          ? Math.round((data.retryStats.retriedJobs / data.retryStats.totalJobs) * 100)
                          : 0}%
                      </span>{" "}
                      of jobs required retries
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Failure Reasons */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    Common Failure Reasons
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.failureReasons.length > 0 ? (
                    <div className="space-y-2.5">
                      {(() => {
                        const maxCount = Math.max(...data.failureReasons.map(f => f.count), 1);
                        const reasonColors: Record<string, string> = {
                          "API Timeout": "bg-orange-400",
                          "Rate Limit": "bg-amber-400",
                          "Citation Failure": "bg-red-400",
                          "Word Count": "bg-pink-400",
                          "Token Limit": "bg-purple-400",
                          "Network Error": "bg-slate-400",
                          "Auth Error": "bg-rose-400",
                          "Parse Error": "bg-cyan-400",
                          "Other": "bg-gray-400",
                        };
                        return data.failureReasons.map(f => (
                          <div key={f.reason} data-testid={`failure-reason-${f.reason.toLowerCase().replace(/\s+/g, "-")}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-foreground">{f.reason}</span>
                              <span className="text-xs text-muted-foreground">{f.count}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${reasonColors[f.reason] || "bg-gray-400"} transition-all duration-500`}
                                style={{ width: `${Math.max((f.count / maxCount) * 100, 4)}%` }}
                              />
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No failures in this period</p>
                  )}
                </CardContent>
              </Card>
            </div>
            </SectionErrorBoundary>
          </>
        )}
      </div>
    </AppLayout>
  );
}
