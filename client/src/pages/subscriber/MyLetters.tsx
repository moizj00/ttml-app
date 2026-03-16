import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FileText, PlusCircle, Search, Lock, Download,
  FileCheck, CreditCard, Eye, ArrowDownUp, ArrowRight,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";

const ACTIVE_STATUSES = ["submitted", "researching", "drafting"];

type SortKey = "date_desc" | "date_asc" | "type";

function sortLetters(letters: any[], sort: SortKey) {
  const sorted = [...letters];
  if (sort === "date_desc") return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (sort === "date_asc") return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (sort === "type") return sorted.sort((a, b) => a.letterType.localeCompare(b.letterType));
  return sorted;
}

function getQuickActions(letter: any) {
  const actions: Array<{ label: string; icon: any; href: string; variant: "default" | "outline" | "secondary"; color?: string }> = [];

  if (letter.status === "approved" && (letter as any).pdfUrl) {
    actions.push({ label: "Download PDF", icon: Download, href: (letter as any).pdfUrl, variant: "default", color: "bg-green-600 hover:bg-green-700 text-white" });
  }
  if (letter.status === "generated_locked") {
    actions.push({ label: "Pay to Unlock — $200", icon: CreditCard, href: `/letters/${letter.id}`, variant: "default", color: "bg-amber-500 hover:bg-amber-600 text-white" });
  }

  if (letter.status === "approved" && !(letter as any).pdfUrl) {
    actions.push({ label: "View Letter", icon: Eye, href: `/letters/${letter.id}`, variant: "secondary" });
  }

  return actions;
}

export default function MyLetters() {
  const [, navigate] = useLocation();
  const { data: letters, isLoading } = trpc.letters.myLetters.useQuery(undefined, {
    refetchInterval: (query) => {
      const list = query.state.data;
      if (list?.some((l: any) => ACTIVE_STATUSES.includes(l.status))) return 8000;
      return false;
    },
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("date_desc");

  const filtered = sortLetters(
    (letters ?? []).filter((l) => {
      const matchSearch = l.subject.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || l.status === statusFilter;
      return matchSearch && matchStatus;
    }),
    sort,
  );

  const approvedCount = (letters ?? []).filter((l) => l.status === "approved").length;
  const pendingCount = (letters ?? []).filter((l) => ["pending_review", "under_review"].includes(l.status)).length;
  const actionCount = (letters ?? []).filter((l) => ["generated_locked", "needs_changes"].includes(l.status)).length;

  return (
    <AppLayout breadcrumb={[{ label: "Dashboard", href: "/dashboard" }, { label: "My Letters" }]}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">My Letters</h1>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="text-sm text-muted-foreground">{letters?.length ?? 0} total</span>
              {approvedCount > 0 && <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">{approvedCount} approved</span>}
              {pendingCount > 0 && <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium">{pendingCount} in review</span>}
              {actionCount > 0 && <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">{actionCount} need action</span>}
            </div>
          </div>
          <Button asChild size="sm">
            <Link href="/submit">
              <PlusCircle className="w-4 h-4 mr-2" />
              New Letter
            </Link>
          </Button>
        </div>

        {/* Filters + Sort */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by subject..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="researching">Researching</SelectItem>
              <SelectItem value="drafting">Drafting</SelectItem>
              <SelectItem value="generated_locked">Draft Ready</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="needs_changes">Needs Changes</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-full sm:w-40">
              <ArrowDownUp className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest First</SelectItem>
              <SelectItem value="date_asc">Oldest First</SelectItem>
              <SelectItem value="type">By Type</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Letter List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-foreground mb-2">
              {search || statusFilter !== "all" ? "No letters match your filters" : "No letters yet"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {search || statusFilter !== "all"
                ? "Try adjusting your search or filter."
                : "Submit your first legal matter to get started."}
            </p>
            {!search && statusFilter === "all" && (
              <Button asChild size="sm">
                <Link href="/submit">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Submit Letter
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((letter) => {
              const hasPdf = letter.status === "approved" && !!(letter as any).pdfUrl;
              const isApproved = letter.status === "approved";
              const isLocked = letter.status === "generated_locked";
              const needsAction = ["generated_locked", "needs_changes"].includes(letter.status);
              const quickActions = getQuickActions(letter);

              return (
                <div
                  key={letter.id}
                  className={`bg-card border rounded-xl p-4 transition-all hover:shadow-sm ${
                    isApproved
                      ? "border-green-200 bg-green-50/20"
                      : isLocked
                      ? "border-amber-200 bg-amber-50/20 ring-1 ring-amber-200"
                      : needsAction
                      ? "border-orange-200 bg-orange-50/10"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isApproved ? "bg-green-100" : isLocked ? "bg-amber-100" : "bg-primary/10"
                      }`}
                    >
                      {isApproved ? (
                        <FileCheck className="w-4.5 h-4.5 text-green-600" />
                      ) : isLocked ? (
                        <Lock className="w-4 h-4 text-amber-600" />
                      ) : (
                        <FileText className="w-4 h-4 text-primary" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <button
                          onClick={() => navigate(`/letters/${letter.id}`)}
                          className="text-sm font-semibold text-foreground leading-tight truncate max-w-[260px] sm:max-w-[400px] text-left hover:underline"
                        >
                          {letter.subject}
                        </button>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <StatusBadge status={letter.status} size="sm" />
                          {hasPdf && (
                            <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50 font-semibold gap-1 hidden sm:flex">
                              <Download className="w-3 h-3" />
                              PDF
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {LETTER_TYPE_CONFIG[letter.letterType]?.label ?? letter.letterType}
                        </span>
                        {letter.jurisdictionState && (
                          <>
                            <span className="text-muted-foreground/30 text-xs">·</span>
                            <span className="text-xs text-muted-foreground">{letter.jurisdictionState}</span>
                          </>
                        )}
                        <span className="text-muted-foreground/30 text-xs">·</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(letter.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>

                      {/* Quick-action buttons */}
                      {quickActions.length > 0 && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {quickActions.map((action) => {
                            const ActionIcon = action.icon;
                            const isExternal = action.href.startsWith("http");
                            return isExternal ? (
                              <a key={action.label} href={action.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" className={`h-7 text-xs px-3 ${action.color ?? ""}`} variant={action.color ? undefined : action.variant}>
                                  <ActionIcon className="w-3.5 h-3.5 mr-1.5" />
                                  {action.label}
                                </Button>
                              </a>
                            ) : (
                              <Button
                                key={action.label}
                                size="sm"
                                className={`h-7 text-xs px-3 ${action.color ?? ""}`}
                                variant={action.color ? undefined : action.variant}
                                onClick={(e) => { e.stopPropagation(); navigate(action.href); }}
                              >
                                <ActionIcon className="w-3.5 h-3.5 mr-1.5" />
                                {action.label}
                              </Button>
                            );
                          })}
                        </div>
                      )}

                      {/* No action — view link */}
                      {quickActions.length === 0 && (
                        <button
                          onClick={() => navigate(`/letters/${letter.id}`)}
                          className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View Details <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer count */}
        {filtered.length > 0 && (
          <p className="text-xs text-muted-foreground text-center pb-2">
            Showing {filtered.length} of {letters?.length ?? 0} letters
          </p>
        )}
      </div>
    </AppLayout>
  );
}
