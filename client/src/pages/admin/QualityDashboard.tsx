import { useState } from "react";
import AppLayout from "@/components/shared/AppLayout";
import { SectionErrorBoundary } from "@/components/ErrorBoundary";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Brain,
  CheckCircle,
  FlaskConical,
  Gauge,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  TrendingDown,
  XCircle,
  AlertCircle,
  Clock,
  Layers,
  Server,
} from "lucide-react";

type DateRange = "7d" | "30d" | "90d";

interface TrendRow {
  date?: unknown;
  count?: unknown;
  avgScore?: unknown;
  firstPassRate?: unknown;
}

interface EditDistanceRow {
  date?: unknown;
  count?: unknown;
  avgEditDistance?: unknown;
  minEditDistance?: unknown;
  maxEditDistance?: unknown;
}

interface LessonImpactRow {
  lessonText?: unknown;
  category?: unknown;
  lettersBeforeAvgScore?: unknown;
  lettersAfterAvgScore?: unknown;
  scoreDelta?: unknown;
  timesInjected?: unknown;
}

interface ByLetterTypeRow {
  letterType?: unknown;
  total?: unknown;
  avgScore?: unknown;
  firstPassRate?: unknown;
}

interface FineTuneRun {
  id?: unknown;
  vertexJobId?: unknown;
  baseModel?: unknown;
  status?: unknown;
  trainingExampleCount?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    submitted: { color: "bg-blue-100 text-blue-700", label: "Submitted" },
    running: { color: "bg-amber-100 text-amber-700", label: "Running" },
    completed: { color: "bg-green-100 text-green-700", label: "Completed" },
    failed: { color: "bg-red-100 text-red-700", label: "Failed" },
    cancelled: { color: "bg-gray-100 text-gray-600", label: "Cancelled" },
  };
  const cfg = map[status] ?? { color: "bg-gray-100 text-gray-600", label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(String(d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = value >= 70 ? "bg-green-500" : value >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{Math.round(value)}</span>
    </div>
  );
}

export default function QualityDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const days = dateRange === "7d" ? 7 : dateRange === "90d" ? 90 : 30;

  const { data: qualityStats, isLoading: statsLoading } = trpc.admin.qualityStats.useQuery();
  const { data: qualityTrendRaw, isLoading: trendLoading } = trpc.admin.qualityTrend.useQuery({ days });
  const { data: editDistRaw, isLoading: editDistLoading } = trpc.admin.editDistanceTrend.useQuery({ days });
  const { data: ragData, isLoading: ragLoading, refetch: refetchRAG } = trpc.admin.ragAnalytics.useQuery({ days });
  const { data: fineTunesRaw, isLoading: ftLoading } = trpc.admin.fineTuneRuns.useQuery();
  const { data: lessonImpactRaw, isLoading: impactLoading } = trpc.admin.lessonImpact.useQuery();
  const { data: byLetterTypeRaw, isLoading: byTypeLoading } = trpc.admin.qualityByLetterType.useQuery();

  const qualityTrend = (qualityTrendRaw ?? []) as TrendRow[];
  const editDistTrend = (editDistRaw ?? []) as EditDistanceRow[];
  const lessonImpact = (lessonImpactRaw ?? []) as LessonImpactRow[];
  const byLetterType = (byLetterTypeRaw ?? []) as ByLetterTypeRow[];
  const fineTunes = (fineTunesRaw ?? []) as FineTuneRun[];

  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
  ];

  return (
    <AppLayout breadcrumb={[{ label: "Admin Dashboard", href: "/admin" }, { label: "Quality & Learning" }]}>
      <div className="space-y-6" data-testid="quality-dashboard-page">
        <div className="rounded-2xl bg-linear-to-r from-indigo-900 to-indigo-700 p-5 text-white sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Quality &amp; Learning Dashboard
              </h1>
              <p className="text-indigo-200 text-sm">
                RAG monitoring, A/B testing, quality trends, and fine-tune run history
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-indigo-600">
                {dateRangeOptions.map(opt => (
                  <button
                    key={opt.value}
                    data-testid={`filter-range-${opt.value}`}
                    onClick={() => setDateRange(opt.value)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      dateRange === opt.value
                        ? "bg-white text-indigo-900"
                        : "text-indigo-200 hover:text-white hover:bg-indigo-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchRAG()}
                className="text-white hover:bg-indigo-600"
                data-testid="button-refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* ── Quality Overview Stats ── */}
        <SectionErrorBoundary label="Quality Overview">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Gauge className="w-4 h-4" /> Quality Overview
          </h2>
          {statsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  icon: <BarChart3 className="w-5 h-5 text-indigo-600" />,
                  bg: "bg-indigo-50",
                  label: "Avg Quality Score",
                  value: qualityStats?.avgScore != null ? `${Math.round(Number(qualityStats.avgScore))}/100` : "—",
                  testId: "text-avg-score",
                },
                {
                  icon: <CheckCircle className="w-5 h-5 text-green-600" />,
                  bg: "bg-green-50",
                  label: "First-Pass Approval",
                  value: qualityStats?.firstPassRate != null ? `${Math.round(Number(qualityStats.firstPassRate))}%` : "—",
                  testId: "text-first-pass-rate",
                },
                {
                  icon: <TrendingUp className="w-5 h-5 text-amber-600" />,
                  bg: "bg-amber-50",
                  label: "Avg Edit Distance",
                  value: qualityStats?.avgEditDistance != null ? Math.round(Number(qualityStats.avgEditDistance)) : "—",
                  testId: "text-avg-edit-dist",
                },
                {
                  icon: <Target className="w-5 h-5 text-purple-600" />,
                  bg: "bg-purple-50",
                  label: "Letters Scored",
                  value: String(qualityStats?.totalScored ?? "—"),
                  testId: "text-total-scored",
                },
              ].map(item => (
                <Card key={item.label}>
                  <CardContent className="p-4">
                    <div className={`w-9 h-9 ${item.bg} rounded-lg flex items-center justify-center mb-3`}>
                      {item.icon}
                    </div>
                    <p className="text-2xl font-bold" data-testid={item.testId}>{item.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
        </SectionErrorBoundary>

        {/* ── Quality Score Trend ── */}
        <SectionErrorBoundary label="Quality Score Trend">
        {!trendLoading && qualityTrend.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Quality Score Trend ({dateRange})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2" data-testid="quality-trend-list">
                {qualityTrend.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm" data-testid={`row-trend-${i}`}>
                    <span className="text-muted-foreground w-24 shrink-0 text-xs">
                      {new Date(String(entry.date ?? "")).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <ScoreBar value={Number(entry.avgScore ?? 0)} />
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      ({String(entry.count ?? 0)})
                    </span>
                    <span className="text-xs text-muted-foreground w-16 text-right hidden sm:block">
                      {Number(entry.firstPassRate ?? 0)}% 1st-pass
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        </SectionErrorBoundary>

        {/* ── Attorney Edit Distance Trend ── */}
        <SectionErrorBoundary label="Edit Distance Trend">
        {!editDistLoading && editDistTrend.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-600" />
                Attorney Edit Distance Trend ({dateRange})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-24 w-full mb-2" data-testid="edit-dist-trend-chart">
                {(() => {
                  const maxDist = Math.max(...editDistTrend.map(d => Number(d.avgEditDistance ?? 0)), 1);
                  return editDistTrend.map((d, i) => {
                    const avg = Number(d.avgEditDistance ?? 0);
                    const barH = Math.max((avg / maxDist) * 88, 2);
                    return (
                      <div
                        key={i}
                        className="flex-1 min-w-0 group relative"
                        title={`${String(d.date ?? "")}: avg ${avg} chars edited (n=${String(d.count ?? 0)})`}
                      >
                        <div
                          className="bg-amber-400 rounded-t hover:bg-amber-500 transition-colors"
                          style={{ height: `${barH}px` }}
                        />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-foreground text-background text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                          {String(d.date ?? "")}: avg {avg}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{String(editDistTrend[0]?.date ?? "")}</span>
                <span>{String(editDistTrend[editDistTrend.length - 1]?.date ?? "")}</span>
              </div>
              <div className="mt-3 space-y-1.5" data-testid="edit-dist-trend-list">
                {editDistTrend.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs" data-testid={`row-edit-dist-${i}`}>
                    <span className="text-muted-foreground w-20 shrink-0">
                      {new Date(String(entry.date ?? "")).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, (Number(entry.avgEditDistance ?? 0) / Math.max(...editDistTrend.map(d => Number(d.avgEditDistance ?? 0)), 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="font-medium w-12 text-right">{Number(entry.avgEditDistance ?? 0)} avg</span>
                    <span className="text-muted-foreground w-10 text-right hidden sm:block">n={String(entry.count ?? 0)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        </SectionErrorBoundary>

        {/* ── RAG Monitoring ── */}
        <SectionErrorBoundary label="RAG Monitoring">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> RAG Monitoring
          </h2>
          {ragLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : ragData ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  {
                    icon: <Layers className="w-5 h-5 text-blue-600" />,
                    bg: "bg-blue-50",
                    label: "Total Draft Jobs",
                    value: ragData.summary.totalDraftJobs,
                    testId: "text-total-draft-jobs",
                  },
                  {
                    icon: <Sparkles className="w-5 h-5 text-indigo-600" />,
                    bg: "bg-indigo-50",
                    label: "RAG Injection Rate",
                    value: `${ragData.summary.ragInjectionRate}%`,
                    testId: "text-rag-injection-rate",
                  },
                  {
                    icon: <FlaskConical className="w-5 h-5 text-emerald-600" />,
                    bg: "bg-emerald-50",
                    label: "A/B Test Letters",
                    value: ragData.summary.testCount,
                    testId: "text-test-count",
                  },
                  {
                    icon: <XCircle className="w-5 h-5 text-orange-600" />,
                    bg: "bg-orange-50",
                    label: "Control (No RAG)",
                    value: ragData.summary.controlCount,
                    testId: "text-control-count",
                  },
                ].map(item => (
                  <Card key={item.label}>
                    <CardContent className="p-4">
                      <div className={`w-9 h-9 ${item.bg} rounded-lg flex items-center justify-center mb-3`}>
                        {item.icon}
                      </div>
                      <p className="text-2xl font-bold" data-testid={item.testId}>{item.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* RAG Trend */}
              {ragData.ragTrend.length > 0 && (
                <Card className="mb-4">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      RAG Injection Rate Over Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-1 h-20 w-full" data-testid="rag-trend-chart">
                      {(() => {
                        const maxRate = Math.max(...ragData.ragTrend.map(d => d.ragInjectionRate), 1);
                        return ragData.ragTrend.map((d, i) => (
                          <div
                            key={i}
                            className="flex-1 min-w-0 group relative"
                            title={`${d.date}: ${d.ragInjectionRate}% RAG injection (${d.ragInjectedCount}/${d.totalJobs})`}
                          >
                            <div
                              className="bg-indigo-400 rounded-t hover:bg-indigo-500 transition-colors"
                              style={{ height: `${Math.max((d.ragInjectionRate / maxRate) * 76, 2)}px` }}
                            />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-foreground text-background text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                              {d.date}: {d.ragInjectionRate}%
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                      <span>{ragData.ragTrend[0]?.date}</span>
                      <span>{ragData.ragTrend[ragData.ragTrend.length - 1]?.date}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* A/B Comparison */}
              {ragData.abComparison.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FlaskConical className="w-4 h-4 text-emerald-600" />
                      A/B Comparison: RAG-on vs RAG-off
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="table-ab-comparison">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="pb-2 font-medium text-muted-foreground">Group</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Letters</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Avg Quality</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">First-Pass %</th>
                            <th className="pb-2 font-medium text-muted-foreground text-right">Avg Edit Dist</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ragData.abComparison.map((row, i) => (
                            <tr key={i} className="border-b last:border-0" data-testid={`row-ab-${row.abGroup}`}>
                              <td className="py-2.5">
                                <Badge
                                  variant="secondary"
                                  className={row.abGroup === "test"
                                    ? "bg-indigo-100 text-indigo-700"
                                    : "bg-orange-100 text-orange-700"}
                                >
                                  {row.abGroup === "test" ? "RAG On" : "Control (No RAG)"}
                                </Badge>
                              </td>
                              <td className="py-2.5 text-right text-muted-foreground">{row.letterCount}</td>
                              <td className="py-2.5 text-right">
                                <span className={`font-semibold ${
                                  row.avgQualityScore >= 70 ? "text-green-600" :
                                  row.avgQualityScore >= 50 ? "text-amber-600" : "text-red-600"
                                }`}>
                                  {row.avgQualityScore > 0 ? Math.round(row.avgQualityScore) : "—"}
                                </span>
                              </td>
                              <td className="py-2.5 text-right">
                                {row.firstPassRate > 0 ? `${Math.round(row.firstPassRate)}%` : "—"}
                              </td>
                              <td className="py-2.5 text-right text-muted-foreground">
                                {row.avgEditDistance > 0 ? Math.round(row.avgEditDistance) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {ragData.abComparison.length < 2 && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Set <code className="bg-muted px-1 rounded">RAG_AB_TEST_CONTROL_PCT</code> env var (e.g. 20) to enable A/B testing. Both groups need quality scores for comparison.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {ragData.abComparison.length === 0 && (
                <Card>
                  <CardContent className="py-8 flex flex-col items-center justify-center gap-2">
                    <FlaskConical className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">No A/B test data yet</p>
                    <p className="text-xs text-muted-foreground text-center max-w-sm">
                      Set the <code className="bg-muted px-1 rounded">RAG_AB_TEST_CONTROL_PCT</code> environment variable to a value like <strong>20</strong> to randomly skip RAG injection for 20% of letters. Quality scores from both groups will appear here once letters are reviewed.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">RAG analytics unavailable</p>
              </CardContent>
            </Card>
          )}
        </div>
        </SectionErrorBoundary>

        {/* ── Lesson Effectiveness ── */}
        <SectionErrorBoundary label="Lesson Effectiveness">
        {!impactLoading && lessonImpact.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-4 h-4 text-indigo-600" />
                Lesson Effectiveness by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-lesson-effectiveness">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Lesson</th>
                      <th className="pb-2 font-medium text-muted-foreground text-center">Category</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Before</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">After</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Delta</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Injections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessonImpact.map((row, i) => {
                      const delta = row.scoreDelta != null ? Number(row.scoreDelta) : null;
                      return (
                        <tr key={i} className="border-b last:border-0" data-testid={`row-lesson-impact-${i}`}>
                          <td className="py-2.5 max-w-xs truncate text-xs" title={String(row.lessonText ?? "")}>
                            {String(row.lessonText ?? "").substring(0, 70)}
                            {String(row.lessonText ?? "").length > 70 ? "…" : ""}
                          </td>
                          <td className="py-2.5 text-center">
                            <Badge variant="secondary" className="text-xs">
                              {String(row.category ?? "general").replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-right font-mono text-xs text-muted-foreground">
                            {row.lettersBeforeAvgScore != null ? String(row.lettersBeforeAvgScore) : "—"}
                          </td>
                          <td className="py-2.5 text-right font-mono text-xs text-muted-foreground">
                            {row.lettersAfterAvgScore != null ? String(row.lettersAfterAvgScore) : "—"}
                          </td>
                          <td className="py-2.5 text-right">
                            {delta != null ? (
                              <span className={`font-semibold text-xs ${
                                delta > 2 ? "text-green-600" : delta < -2 ? "text-red-600" : "text-muted-foreground"
                              }`}>
                                {delta > 0 ? "+" : ""}{delta}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="py-2.5 text-right text-xs text-muted-foreground">
                            {String(row.timesInjected ?? 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
        </SectionErrorBoundary>

        {/* ── Quality by Letter Type ── */}
        <SectionErrorBoundary label="Quality by Letter Type">
        {!byTypeLoading && byLetterType.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Quality by Letter Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3" data-testid="quality-by-type">
                {byLetterType.map((row, i) => (
                  <div key={i} className="flex items-center gap-3" data-testid={`row-quality-type-${i}`}>
                    <span className="text-sm font-medium w-40 shrink-0 capitalize">
                      {String(row.letterType ?? "Unknown").replace(/[-_]/g, " ")}
                    </span>
                    <ScoreBar value={Number(row.avgScore ?? 0)} />
                    <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
                      {Math.round(Number(row.firstPassRate ?? 0))}% 1st-pass
                    </span>
                    <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                      ({String(row.total ?? 0)})
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        </SectionErrorBoundary>

        {/* ── Fine-tune Runs ── */}
        <SectionErrorBoundary label="Fine-tune Run History">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Server className="w-4 h-4" /> Fine-tune Run History
          </h2>
          {ftLoading ? (
            <div className="h-32 bg-muted animate-pulse rounded-xl" />
          ) : fineTunes.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-fine-tune-runs">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-3 px-4 font-medium text-muted-foreground">Job ID</th>
                        <th className="py-3 px-4 font-medium text-muted-foreground">Base Model</th>
                        <th className="py-3 px-4 font-medium text-muted-foreground text-center">Status</th>
                        <th className="py-3 px-4 font-medium text-muted-foreground text-right">Examples</th>
                        <th className="py-3 px-4 font-medium text-muted-foreground">Started</th>
                        <th className="py-3 px-4 font-medium text-muted-foreground">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fineTunes.map((run, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/40" data-testid={`row-fine-tune-${i}`}>
                          <td className="py-3 px-4">
                            <span className="font-mono text-xs text-muted-foreground">
                              {run.vertexJobId
                                ? String(run.vertexJobId).slice(0, 20) + (String(run.vertexJobId).length > 20 ? "…" : "")
                                : `#${String(run.id ?? "")}`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs">{String(run.baseModel ?? "—")}</td>
                          <td className="py-3 px-4 text-center">
                            <StatusBadge status={String(run.status ?? "")} />
                          </td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{String(run.trainingExampleCount ?? "—")}</td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(run.startedAt as string | null)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {run.completedAt ? formatDate(run.completedAt as string) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 flex flex-col items-center justify-center gap-2">
                <Server className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No fine-tune runs yet</p>
                <p className="text-xs text-muted-foreground">Fine-tune runs will appear here once initiated from the pipeline.</p>
              </CardContent>
            </Card>
          )}
        </div>
        </SectionErrorBoundary>
      </div>
    </AppLayout>
  );
}
