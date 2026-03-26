import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Users,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Activity,
  Cpu,
  DollarSign,
  UserCheck,
  Scale,
  Briefcase,
  ShieldCheck,
  TrendingUp,
  Clock,
  CalendarDays,
} from "lucide-react";
import { Link } from "wouter";
import { useStaggerReveal, staggerStyle } from "@/hooks/useAnimations";

export default function AdminDashboard() {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = trpc.admin.stats.useQuery();
  const { data: failedJobs } = trpc.admin.failedJobs.useQuery();
  const { data: costData } = trpc.admin.costAnalytics.useQuery();
  const s = stats as any;
  const statCardVisible = useStaggerReveal(4, 80);

  return (
    <AppLayout breadcrumb={[{ label: "Admin Dashboard" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-2xl bg-linear-to-r from-slate-800 to-slate-700 p-5 text-white sm:p-6">
          <h1 className="text-xl font-bold mb-1">Admin Dashboard</h1>
          <p className="text-slate-300 text-sm">
            System overview, analytics, and management controls
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card className="border-destructive/50">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-8 h-8 text-destructive mb-3" />
              <p className="text-sm font-medium text-destructive">
                Something went wrong
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {error.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => refetch()}
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : stats ? (
          <>
            {/* Primary Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Total Users",
                  value: s.totalUsers ?? 0,
                  icon: <Users className="w-5 h-5" />,
                  color: "text-indigo-600",
                  bg: "bg-indigo-50",
                },
                {
                  label: "Total Letters",
                  value: s.totalLetters ?? 0,
                  icon: <FileText className="w-5 h-5" />,
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },
                {
                  label: "Approved",
                  value: s.approvedLetters ?? 0,
                  icon: <CheckCircle className="w-5 h-5" />,
                  color: "text-green-600",
                  bg: "bg-green-50",
                },
                {
                  label: "Failed Jobs",
                  value: s.failedJobs ?? 0,
                  icon: <AlertCircle className="w-5 h-5" />,
                  color: "text-red-600",
                  bg: "bg-red-50",
                  alert: (s.failedJobs ?? 0) > 0,
                },
              ].map((stat, idx) => (
                <Card
                  key={stat.label}
                  className={stat.alert ? "border-red-300" : ""}
                  style={staggerStyle(idx, statCardVisible[idx])}
                >
                  <CardContent className="p-4">
                    <div
                      className={`w-9 h-9 ${stat.bg} rounded-lg flex items-center justify-center mb-3 ${stat.color}`}
                    >
                      {stat.icon}
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stat.label}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* User Counts by Role */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Users by Role
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      role: "Subscribers",
                      count: s.subscribers ?? 0,
                      icon: <UserCheck className="w-4 h-4" />,
                      color: "text-blue-600",
                      bg: "bg-blue-50",
                    },
                    {
                      role: "Attorneys",
                      count: s.attorneys ?? 0,
                      icon: <Scale className="w-4 h-4" />,
                      color: "text-purple-600",
                      bg: "bg-purple-50",
                    },
                    {
                      role: "Affiliates",
                      count: s.employees ?? 0,
                      icon: <Briefcase className="w-4 h-4" />,
                      color: "text-amber-600",
                      bg: "bg-amber-50",
                    },
                    {
                      role: "Admins",
                      count: s.admins ?? 0,
                      icon: <ShieldCheck className="w-4 h-4" />,
                      color: "text-slate-600",
                      bg: "bg-slate-100",
                    },
                  ].map(item => (
                    <div
                      key={item.role}
                      className={`${item.bg} rounded-lg p-4 text-center`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full ${item.bg} flex items-center justify-center mx-auto mb-2 ${item.color}`}
                      >
                        {item.icon}
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        {item.count}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.role}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Letter Statistics by Status */}
            {s.byStatus && Object.keys(s.byStatus).length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Letters by Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {Object.entries(s.byStatus as Record<string, number>)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([status, count]) => {
                        const statusColors: Record<string, string> = {
                          submitted: "bg-slate-50 border-slate-200",
                          researching: "bg-cyan-50 border-cyan-200",
                          drafting: "bg-sky-50 border-sky-200",
                          generated_locked: "bg-amber-50 border-amber-200",
                          pending_review: "bg-orange-50 border-orange-200",
                          under_review: "bg-indigo-50 border-indigo-200",
                          needs_changes: "bg-pink-50 border-pink-200",
                          approved: "bg-green-50 border-green-200",
                          rejected: "bg-red-50 border-red-200",
                        };
                        return (
                          <div
                            key={status}
                            className={`rounded-lg p-3 text-center border ${statusColors[status] || "bg-muted/50"}`}
                          >
                            <p className="text-xl font-bold text-foreground">
                              {count as number}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize mt-0.5">
                              {status.replace(/_/g, " ")}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Revenue & Commission Overview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Revenue & Commissions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: "Total Sales",
                      value: formatCurrency(s.revenue?.totalSales ?? 0),
                      icon: <TrendingUp className="w-4 h-4" />,
                      color: "text-green-600",
                      bg: "bg-green-50",
                    },
                    {
                      label: "Total Commissions",
                      value: formatCurrency(s.revenue?.totalCommissions ?? 0),
                      icon: <DollarSign className="w-4 h-4" />,
                      color: "text-blue-600",
                      bg: "bg-blue-50",
                    },
                    {
                      label: "Pending Payouts",
                      value: formatCurrency(s.revenue?.pendingCommissions ?? 0),
                      icon: <Clock className="w-4 h-4" />,
                      color: "text-amber-600",
                      bg: "bg-amber-50",
                    },
                    {
                      label: "Active Subscriptions",
                      value: s.activeSubscriptions ?? 0,
                      icon: <CalendarDays className="w-4 h-4" />,
                      color: "text-indigo-600",
                      bg: "bg-indigo-50",
                    },
                  ].map(item => (
                    <div
                      key={item.label}
                      className={`${item.bg} rounded-lg p-4`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${item.color} ${item.bg}`}
                      >
                        {item.icon}
                      </div>
                      <p className="text-lg font-bold text-foreground">
                        {item.value}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
                {s.recentLetters > 0 && (
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                    <span className="font-medium text-foreground">
                      {s.recentLetters}
                    </span>{" "}
                    letters created in the last 30 days
                  </p>
                )}
              </CardContent>
            </Card>
            {/* API Cost Analytics */}
            {costData && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-primary" />
                    API Cost Analytics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        label: "Total API Spend",
                        value: `$${(costData.totalSpend ?? 0).toFixed(4)}`,
                        icon: <DollarSign className="w-4 h-4" />,
                        color: "text-green-600",
                        bg: "bg-green-50",
                      },
                      {
                        label: "Avg Cost / Letter",
                        value: `$${(costData.avgCostPerLetter ?? 0).toFixed(4)}`,
                        icon: <TrendingUp className="w-4 h-4" />,
                        color: "text-blue-600",
                        bg: "bg-blue-50",
                      },
                      {
                        label: "Total Prompt Tokens",
                        value: (costData.totalPromptTokens ?? 0).toLocaleString(),
                        icon: <Cpu className="w-4 h-4" />,
                        color: "text-indigo-600",
                        bg: "bg-indigo-50",
                      },
                      {
                        label: "Total Output Tokens",
                        value: (costData.totalCompletionTokens ?? 0).toLocaleString(),
                        icon: <Activity className="w-4 h-4" />,
                        color: "text-purple-600",
                        bg: "bg-purple-50",
                      },
                    ].map(item => (
                      <div key={item.label} className={`${item.bg} rounded-lg p-4`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${item.color} ${item.bg}`}>
                          {item.icon}
                        </div>
                        <p className="text-lg font-bold text-foreground">{item.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>
                  {costData.costByDay && costData.costByDay.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Daily spend — last 30 days
                      </p>
                      <div className="flex items-end gap-1 h-16 w-full">
                        {(() => {
                          const days = costData.costByDay;
                          const maxCost = Math.max(...days.map(d => d.cost), 0.0001);
                          return days.map((d) => (
                            <div
                              key={d.date}
                              className="flex-1 min-w-0 group relative"
                              title={`${d.date}: $${d.cost.toFixed(4)} (${d.letters} letter${d.letters !== 1 ? "s" : ""})`}
                            >
                              <div
                                className="bg-indigo-400 rounded-t hover:bg-indigo-500 transition-colors"
                                style={{ height: `${Math.max((d.cost / maxCost) * 60, 2)}px` }}
                              />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-foreground text-background text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                                {d.date}: ${d.cost.toFixed(4)}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {costData.lettersWithCost} letter{(costData.lettersWithCost ?? 0) !== 1 ? "s" : ""} with API spend (all statuses)
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        ) : null}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Manage Users",
              desc: "View and update user roles",
              href: "/admin/users",
              icon: <Users className="w-5 h-5 text-indigo-600" />,
              bg: "bg-indigo-50",
            },
            {
              label: "All Letters",
              desc: "Browse all letter requests",
              href: "/admin/letters",
              icon: <FileText className="w-5 h-5 text-blue-600" />,
              bg: "bg-blue-50",
            },
            {
              label: "Act as Attorney",
              desc: "Access the attorney review queue",
              href: "/attorney/queue",
              icon: <Scale className="w-5 h-5 text-purple-600" />,
              bg: "bg-purple-50",
            },
            {
              label: "Failed Jobs",
              desc: `${failedJobs?.length ?? 0} jobs need attention`,
              href: "/admin/jobs",
              icon: <AlertCircle className="w-5 h-5 text-red-600" />,
              bg: "bg-red-50",
              alert: (failedJobs?.length ?? 0) > 0,
            },
          ].map(action => (
            <Card
              key={action.label}
              className={`hover:shadow-md transition-shadow cursor-pointer ${action.alert ? "border-red-300" : ""}`}
            >
              <CardContent className="p-5">
                <div
                  className={`w-10 h-10 ${action.bg} rounded-xl flex items-center justify-center mb-3`}
                >
                  {action.icon}
                </div>
                <h3 className="font-semibold text-foreground mb-1">
                  {action.label}
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {action.desc}
                </p>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full bg-background"
                >
                  <Link href={action.href}>
                    Open <ArrowRight className="w-3 h-3 ml-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Failed Jobs */}
        {failedJobs && failedJobs.length > 0 && (
          <Card className="border-red-200">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  Recent Failed Jobs ({failedJobs.length})
                </CardTitle>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-xs text-red-600"
                >
                  <Link href="/admin/jobs">
                    View All <ArrowRight className="w-3 h-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {failedJobs.slice(0, 3).map(job => (
                  <div key={job.id} className="px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Letter #{job.letterRequestId} — {job.jobType}
                        </p>
                        {job.errorMessage && (
                          <p className="mt-0.5 text-xs text-red-600 wrap-break-word sm:truncate sm:max-w-xs">
                            {job.errorMessage}
                          </p>
                        )}
                      </div>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="bg-background text-xs self-start sm:self-auto"
                      >
                        <Link href="/admin/jobs">Retry</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
