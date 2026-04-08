import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  Target,
  TrendingUp,
  BookOpen,
  Loader2,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EffectivenessBadge } from "./EffectivenessBadge";
import { categoryColor } from "./constants";

export function QualityTab() {
  const { data: stats, isLoading: statsLoading } =
    trpc.admin.qualityStats.useQuery();
  const { data: trend, isLoading: trendLoading } =
    trpc.admin.qualityTrend.useQuery({ days: 30 });
  const { data: byLetterType, isLoading: byTypeLoading } =
    trpc.admin.qualityByLetterType.useQuery();
  const { data: impactData, isLoading: impactLoading } =
    trpc.admin.lessonImpact.useQuery();

  const isLoading =
    statsLoading || trendLoading || byTypeLoading || impactLoading;

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p
                      className="text-2xl font-bold"
                      data-testid="text-avg-score"
                    >
                      {stats?.avgScore != null
                        ? Math.round(Number(stats.avgScore))
                        : "\u2014"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Avg Quality Score
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <Target className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p
                      className="text-2xl font-bold"
                      data-testid="text-first-pass-rate"
                    >
                      {stats?.firstPassRate != null
                        ? `${Math.round(Number(stats.firstPassRate))}%`
                        : "\u2014"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      First-Pass Approval
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <TrendingUp className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p
                      className="text-2xl font-bold"
                      data-testid="text-avg-edit-dist"
                    >
                      {stats?.avgEditDistance != null
                        ? `${Math.round(Number(stats.avgEditDistance))}%`
                        : "\u2014"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Avg Edit Distance
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <BookOpen className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p
                      className="text-2xl font-bold"
                      data-testid="text-total-scored"
                    >
                      {String(stats?.totalScored ?? "\u2014")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Letters Scored
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lesson Impact table */}
          {impactData && (impactData as any[]).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Lesson Impact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-sm"
                    data-testid="table-lesson-impact"
                  >
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-muted-foreground">
                          Lesson
                        </th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">
                          Category
                        </th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">
                          Before
                        </th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">
                          After
                        </th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">
                          Delta
                        </th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">
                          Injections
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(impactData as any[]).map((row: any, i: number) => {
                        const delta =
                          row.scoreDelta != null
                            ? Number(row.scoreDelta)
                            : null;
                        return (
                          <tr
                            key={i}
                            className="border-b last:border-0"
                            data-testid={`row-impact-${i}`}
                          >
                            <td
                              className="py-2.5 max-w-[300px] truncate"
                              title={row.lessonText}
                            >
                              {String(row.lessonText).substring(0, 80)}
                              {String(row.lessonText).length > 80 ? "..." : ""}
                            </td>
                            <td className="py-2.5 text-center">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${categoryColor(
                                  row.category
                                )}`}
                              >
                                {String(row.category ?? "").replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">
                              {row.avgScoreBefore != null
                                ? Math.round(Number(row.avgScoreBefore))
                                : "\u2014"}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">
                              {row.avgScoreAfter != null
                                ? Math.round(Number(row.avgScoreAfter))
                                : "\u2014"}
                            </td>
                            <td className="py-2.5 text-right">
                              <EffectivenessBadge
                                before={row.avgScoreBefore}
                                after={row.avgScoreAfter}
                              />
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">
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

          {/* By letter type table */}
          {byLetterType && byLetterType.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Quality by Letter Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-sm"
                    data-testid="table-quality-by-type"
                  >
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-muted-foreground">
                          Letter Type
                        </th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">
                          Avg Score
                        </th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">
                          First-Pass %
                        </th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">
                          Avg Revisions
                        </th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {byLetterType.map((row, i: number) => {
                        const lt = String(row.letterType ?? "Unknown");
                        return (
                          <tr
                            key={i}
                            className="border-b last:border-0"
                            data-testid={`row-quality-type-${i}`}
                          >
                            <td className="py-2.5 font-medium capitalize">
                              {lt.replace(/[-_]/g, " ")}
                            </td>
                            <td className="py-2.5 text-right">
                              <span
                                className={`font-semibold ${
                                  Number(row.avgScore) >= 70
                                    ? "text-green-600"
                                    : Number(row.avgScore) >= 40
                                    ? "text-amber-600"
                                    : "text-red-600"
                                }`}
                              >
                                {Math.round(Number(row.avgScore))}
                              </span>
                            </td>
                            <td className="py-2.5 text-right">
                              {row.firstPassRate != null
                                ? `${Math.round(Number(row.firstPassRate))}%`
                                : "\u2014"}
                            </td>
                            <td className="py-2.5 text-right">
                              {row.avgRevisions != null
                                ? Number(row.avgRevisions).toFixed(1)
                                : "\u2014"}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">
                              {String(row.total ?? 0)}
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

          {/* 30-day trend */}
          {trend && trend.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">30-Day Quality Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {trend.map((entry, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 text-sm"
                      data-testid={`row-trend-${i}`}
                    >
                      <span className="text-muted-foreground w-24 shrink-0">
                        {new Date(String(entry.date)).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </span>
                      <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(Number(entry.avgScore))
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="w-12 text-right font-medium">
                        {Math.round(Number(entry.avgScore))}
                      </span>
                      <span className="text-muted-foreground w-8 text-right">
                        ({String(entry.count)})
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No quality scores yet. Scores are automatically computed when
                  attorneys approve or reject letters.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
