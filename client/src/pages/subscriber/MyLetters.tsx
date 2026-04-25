import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import LetterStatusTracker from "@/components/shared/LetterStatusTracker";
import { FreePreviewViewer } from "@/components/FreePreviewViewer";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  PlusCircle,
  Search,
  Lock,
  Download,
  FileCheck,
  Eye,
  ArrowDownUp,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import { useLetterListRealtime } from "@/hooks/useLetterRealtime";
import { useAuth } from "@/_core/hooks/useAuth";

const ACTIVE_STATUSES = [
  "submitted",
  "researching",
  "drafting",
  "ai_generation_completed_hidden",
];
const NEEDS_ACTION_STATUSES = [
  "generated_locked",
  "letter_released_to_subscriber",
  "attorney_review_upsell_shown",
  "needs_changes",
  "client_approval_pending",
  "client_revision_requested",
];
const PREVIEW_PROCESSING_STATUSES = [
  "submitted",
  "researching",
  "drafting",
  "ai_generation_completed_hidden",
];
const PREVIEW_READY_STATUSES = [
  "ai_generation_completed_hidden",
  "letter_released_to_subscriber",
  "attorney_review_upsell_shown",
  "attorney_review_checkout_started",
  "attorney_review_payment_confirmed",
];

type SortKey = "date_desc" | "date_asc" | "type";

function sortLetters(letters: any[], sort: SortKey) {
  const sorted = [...letters];
  if (sort === "date_desc")
    return sorted.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  if (sort === "date_asc")
    return sorted.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  if (sort === "type")
    return sorted.sort((a, b) => a.letterType.localeCompare(b.letterType));
  return sorted;
}

function getPreviewState(letter: any, nowMs: number) {
  const previewGated = letter.isFreePreview === true;
  const unlockAt = letter.freePreviewUnlockAt
    ? new Date(letter.freePreviewUnlockAt).getTime()
    : Number.POSITIVE_INFINITY;
  const hasDraft = !!letter.currentAiDraftVersionId;
  const unlocked = Number.isFinite(unlockAt) && unlockAt <= nowMs;
  const ready =
    previewGated &&
    hasDraft &&
    unlocked &&
    PREVIEW_READY_STATUSES.includes(letter.status);
  const inProcess =
    previewGated &&
    !ready &&
    PREVIEW_PROCESSING_STATUSES.includes(letter.status);

  return { previewGated, ready, inProcess, unlocked, hasDraft };
}

function PreviewStatusPill({
  state,
}: {
  state: ReturnType<typeof getPreviewState>;
}) {
  if (state.ready) {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        Draft Preview Ready
      </Badge>
    );
  }
  if (state.inProcess) {
    return (
      <Badge className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50">
        In Process
      </Badge>
    );
  }
  return null;
}

function getQuickActions(letter: any) {
  const actions: Array<{
    label: string;
    icon: any;
    href: string;
    variant: "default" | "outline" | "secondary";
    color?: string;
  }> = [];

  if (letter.status === "client_approval_pending") {
    actions.push({
      label: "Review & Approve",
      icon: Eye,
      href: `/letters/${letter.id}`,
      variant: "default",
      color: "bg-blue-600 hover:bg-blue-700 text-white",
    });
  }

  if (
    (letter.status === "approved" ||
      letter.status === "client_approved" ||
      letter.status === "sent") &&
    (letter as any).pdfUrl
  ) {
    actions.push({
      label: "Download PDF",
      icon: Download,
      href: (letter as any).pdfUrl,
      variant: "default",
      color: "bg-green-600 hover:bg-green-700 text-white",
    });
  }

  if (
    (letter.status === "approved" ||
      letter.status === "client_approved" ||
      letter.status === "sent") &&
    !(letter as any).pdfUrl
  ) {
    actions.push({
      label: "View Letter",
      icon: Eye,
      href: `/letters/${letter.id}`,
      variant: "secondary",
    });
  }

  if (letter.status === "generated_locked" && letter.isFreePreview !== true) {
    actions.push({
      label: "View Draft",
      icon: FileText,
      href: `/letters/${letter.id}`,
      variant: "default",
      color: "bg-amber-500 hover:bg-amber-600 text-white",
    });
  }

  if (letter.status === "client_revision_requested") {
    actions.push({
      label: "View Details",
      icon: Eye,
      href: `/letters/${letter.id}`,
      variant: "outline",
    });
  }

  return actions;
}

export default function MyLetters() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [previewLetterId, setPreviewLetterId] = useState<number | null>(null);
  const { data: letters, isLoading } = trpc.letters.myLetters.useQuery(
    undefined,
    {
      refetchInterval: query => {
        const list = query.state.data;
        if (!list?.length) return false;
        if (list.some((l: any) => ACTIVE_STATUSES.includes(l.status)))
          return 8000;
        if (
          list.some((l: any) => {
            const state = getPreviewState(l, Date.now());
            return state.previewGated && !state.ready;
          })
        )
          return 60_000;
        return false;
      },
    }
  );
  const previewDetail = trpc.letters.detail.useQuery(
    { id: previewLetterId ?? 0 },
    {
      enabled: previewLetterId != null,
      retry: false,
    }
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("date_desc");

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (previewDetail.data) {
      utils.letters.myLetters.invalidate();
    }
  }, [previewDetail.data, utils.letters.myLetters]);

  useLetterListRealtime({
    userId: user?.id,
    onAnyChange: () => utils.letters.myLetters.invalidate(),
    enabled: !!user?.id,
  });

  const filtered = sortLetters(
    (letters ?? []).filter(l => {
      const previewState = getPreviewState(l, nowMs);
      const matchSearch = l.subject
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchStatus =
        statusFilter === "all" ||
        l.status === statusFilter ||
        (statusFilter === "in_process" && previewState.inProcess) ||
        (statusFilter === "draft_preview_ready" && previewState.ready);
      return matchSearch && matchStatus;
    }),
    sort
  );

  const approvedCount = (letters ?? []).filter(l =>
    ["approved", "client_approved", "sent"].includes(l.status)
  ).length;
  const pendingCount = (letters ?? []).filter(l =>
    ["pending_review", "under_review"].includes(l.status)
  ).length;
  const approvalPendingCount = (letters ?? []).filter(
    l => l.status === "client_approval_pending"
  ).length;
  const actionCount = (letters ?? []).filter(l => {
    const state = getPreviewState(l, nowMs);
    return state.ready || NEEDS_ACTION_STATUSES.includes(l.status);
  }).length;

  const previewLetter = previewDetail.data?.letter;
  const previewDraft = previewDetail.data?.versions?.find(
    (v: any) => v.versionType === "ai_draft"
  );

  return (
    <AppLayout
      breadcrumb={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "My Letters" },
      ]}
    >
      <Dialog
        open={previewLetterId != null}
        onOpenChange={open => {
          if (!open) setPreviewLetterId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          {previewDetail.isLoading ? (
            <div className="flex min-h-48 items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading draft preview...
            </div>
          ) : previewLetter && previewDraft?.content ? (
            <FreePreviewViewer
              letterId={previewLetter.id}
              subject={previewLetter.subject}
              draftContent={previewDraft.content}
              jurisdictionState={previewLetter.jurisdictionState}
              letterType={previewLetter.letterType}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Draft preview is still being prepared</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Your draft exists in the queue but is not ready to view yet.
                Please check My Letters again shortly.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">My Letters</h1>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="text-sm text-muted-foreground">
                {letters?.length ?? 0} total
              </span>
              {approvedCount > 0 && (
                <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">
                  {approvedCount} approved
                </span>
              )}
              {approvalPendingCount > 0 && (
                <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-semibold animate-pulse">
                  {approvalPendingCount} awaiting your approval
                </span>
              )}
              {pendingCount > 0 && (
                <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                  {pendingCount} in review
                </span>
              )}
              {actionCount > 0 && (
                <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">
                  {actionCount} need action
                </span>
              )}
            </div>
          </div>
          <Button asChild size="sm">
            <Link href="/submit">
              <PlusCircle className="w-4 h-4 mr-2" />
              New Letter
            </Link>
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by subject..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="in_process">In Process</SelectItem>
              <SelectItem value="draft_preview_ready">
                Draft Preview Ready
              </SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="researching">Researching</SelectItem>
              <SelectItem value="drafting">Drafting</SelectItem>
              <SelectItem value="generated_locked">Draft Ready</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="needs_changes">Needs Changes</SelectItem>
              <SelectItem value="client_approval_pending">
                Awaiting Your Approval
              </SelectItem>
              <SelectItem value="client_revision_requested">
                Revision Requested
              </SelectItem>
              <SelectItem value="approved">Attorney Approved</SelectItem>
              <SelectItem value="client_approved">
                Client Approved (Legacy)
              </SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="client_declined">Declined</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={v => setSort(v as SortKey)}>
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

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-foreground mb-2">
              {search || statusFilter !== "all"
                ? "No letters match your filters"
                : "No letters yet"}
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
            {filtered.map(letter => {
              const previewState = getPreviewState(letter, nowMs);
              const hasPdf =
                (letter.status === "approved" ||
                  letter.status === "client_approved" ||
                  letter.status === "sent") &&
                !!(letter as any).pdfUrl;
              const isApproved =
                letter.status === "approved" ||
                letter.status === "client_approved" ||
                letter.status === "sent";
              const isLocked =
                letter.status === "generated_locked" || previewState.ready;
              const isAwaitingApproval =
                letter.status === "client_approval_pending";
              const needsAction =
                previewState.ready ||
                NEEDS_ACTION_STATUSES.includes(letter.status);
              const quickActions = getQuickActions(letter);

              return (
                <div
                  key={letter.id}
                  className={`bg-card border rounded-xl p-4 transition-all hover:shadow-sm ${
                    isApproved
                      ? "border-green-200 bg-green-50/20"
                      : isAwaitingApproval
                        ? "border-blue-200 bg-blue-50/20 ring-1 ring-blue-200"
                        : isLocked
                          ? "border-amber-200 bg-amber-50/20 ring-1 ring-amber-200"
                          : needsAction
                            ? "border-orange-200 bg-orange-50/10"
                            : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isApproved
                          ? "bg-green-100"
                          : isAwaitingApproval
                            ? "bg-blue-100"
                            : isLocked
                              ? "bg-amber-100"
                              : "bg-primary/10"
                      }`}
                    >
                      {isApproved ? (
                        <FileCheck className="w-4.5 h-4.5 text-green-600" />
                      ) : isAwaitingApproval ? (
                        <Eye className="w-4 h-4 text-blue-600" />
                      ) : isLocked ? (
                        <Lock className="w-4 h-4 text-amber-600" />
                      ) : (
                        <FileText className="w-4 h-4 text-primary" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <button
                          onClick={() => {
                            if (previewState.ready) {
                              setPreviewLetterId(letter.id);
                            } else {
                              navigate(`/letters/${letter.id}`);
                            }
                          }}
                          className="text-sm font-semibold text-foreground leading-tight truncate max-w-full text-left hover:underline"
                        >
                          {letter.subject}
                        </button>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {previewState.inProcess || previewState.ready ? (
                            <PreviewStatusPill state={previewState} />
                          ) : (
                            <StatusBadge
                              status={letter.status}
                              approvedByRole={letter.approvedByRole}
                              size="sm"
                            />
                          )}
                          {hasPdf && (
                            <Badge
                              variant="outline"
                              className="text-xs text-green-700 border-green-300 bg-green-50 font-semibold gap-1 hidden sm:flex"
                            >
                              <Download className="w-3 h-3" />
                              PDF
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {LETTER_TYPE_CONFIG[letter.letterType]?.label ??
                            letter.letterType}
                        </span>
                        {letter.jurisdictionState && (
                          <>
                            <span className="text-muted-foreground/30 text-xs">
                              .
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {letter.jurisdictionState}
                            </span>
                          </>
                        )}
                        <span className="text-muted-foreground/30 text-xs">
                          .
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(letter.createdAt).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" }
                          )}
                        </span>
                      </div>

                      {(previewState.ready || quickActions.length > 0) && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {previewState.ready && (
                            <Button
                              size="sm"
                              className="h-7 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={e => {
                                e.stopPropagation();
                                setPreviewLetterId(letter.id);
                              }}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1.5" />
                              Preview Draft
                            </Button>
                          )}
                          {quickActions.map(action => {
                            const ActionIcon = action.icon;
                            const isExternal = action.href.startsWith("http");
                            return isExternal ? (
                              <a
                                key={action.label}
                                href={action.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                              >
                                <Button
                                  size="sm"
                                  className={`h-7 text-xs px-3 ${action.color ?? ""}`}
                                  variant={
                                    action.color ? undefined : action.variant
                                  }
                                >
                                  <ActionIcon className="w-3.5 h-3.5 mr-1.5" />
                                  {action.label}
                                </Button>
                              </a>
                            ) : (
                              <Button
                                key={action.label}
                                size="sm"
                                className={`h-7 text-xs px-3 ${action.color ?? ""}`}
                                variant={
                                  action.color ? undefined : action.variant
                                }
                                onClick={e => {
                                  e.stopPropagation();
                                  navigate(action.href);
                                }}
                              >
                                <ActionIcon className="w-3.5 h-3.5 mr-1.5" />
                                {action.label}
                              </Button>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-2.5 w-full">
                        <LetterStatusTracker
                          status={letter.status}
                          size="compact"
                          isFreePreview={(letter as any).isFreePreview === true}
                          freePreviewUnlocked={previewState.ready}
                        />
                      </div>

                      {!previewState.ready && quickActions.length === 0 && (
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

        {filtered.length > 0 && (
          <p className="text-xs text-muted-foreground text-center pb-2">
            Showing {filtered.length} of {letters?.length ?? 0} letters
          </p>
        )}
      </div>
    </AppLayout>
  );
}
