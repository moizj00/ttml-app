import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parsePipelineError, PIPELINE_ERROR_LABELS } from "../../../../shared/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Cpu,
  RefreshCw,
  Shield,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";
import StatusBadge from "@/components/shared/StatusBadge";
import StatusTimeline from "@/components/shared/StatusTimeline";

const ALL_STATUSES = [
  "submitted",
  "researching",
  "drafting",
  "generated_locked",
  "pending_review",
  "under_review",
  "approved",
  "rejected",
  "needs_changes",
  "client_approval_pending",
  "client_revision_requested",
  "client_declined",
  "client_approved",
  "sent",
  "pipeline_failed",
] as const;

export default function AdminLetterDetail() {
  const { id } = useParams<{ id: string }>();
  const letterId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  useAuth();
  const [forceStatus, setForceStatus] = useState<string>("");
  const [forceNote, setForceNote] = useState("");
  const [showForceForm, setShowForceForm] = useState(false);
  const [showForceConfirm, setShowForceConfirm] = useState(false);

  const {
    data: letter,
    error,
    refetch,
  } = trpc.admin.getLetterDetail.useQuery(
    { letterId },
    { enabled: !!letterId, refetchInterval: 8000 }
  );

  const forceStatusMutation = trpc.admin.forceStatusTransition.useMutation({
    onSuccess: () => {
      toast.success("Status updated", {
        description: "The letter status has been changed.",
      });
      setShowForceForm(false);
      setForceStatus("");
      setForceNote("");
      refetch();
    },
    onError: err =>
      toast.error("Status update failed", { description: err.message }),
  });

  const [retryStage] = useState<"research" | "drafting">("research");
  const retryMutation = trpc.admin.retryJob.useMutation({
    onSuccess: () => {
      toast.success("Pipeline retry triggered", {
        description:
          "The letter is being re-processed through the drafting pipeline.",
      });
      refetch();
    },
    onError: err => toast.error("Retry failed", { description: err.message }),
  });

  const claimAsAttorneyMutation = trpc.admin.claimLetterAsAttorney.useMutation({
    onSuccess: () => {
      toast.success("Letter claimed", {
        description: "Redirecting to the attorney review view...",
      });
      navigate(`/attorney/review/${letterId}`);
    },
    onError: err => toast.error("Could not claim letter", { description: err.message }),
  });

  const repairMutation = trpc.admin.repairLetterState.useMutation({
    onSuccess: (data) => {
      toast.success("Repair complete", {
        description: data.findings.join(" · "),
      });
      refetch();
    },
    onError: err => toast.error("Repair failed", { description: err.message }),
  });

  if (!letter) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading letter details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6">
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
      </div>
    );
  }

  // Cast to any to handle Drizzle's unknown return type for enum columns
  const l = letter as any;
  const letterStatus = (l.status ?? "submitted") as string;

  const handleForceStatus = () => {
    if (!forceStatus) {
      toast.error("Missing status", {
        description: "Please select a target status before proceeding.",
      });
      return;
    }
    if (!forceNote.trim()) {
      toast.error("Reason required", {
        description: "Please provide a reason for the force transition.",
      });
      return;
    }
    setShowForceConfirm(true);
  };

  const executeForceStatus = () => {
    forceStatusMutation.mutate({
      letterId,
      newStatus: forceStatus as any,
      reason: forceNote,
    });
    setShowForceConfirm(false);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/letters">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to All Letters
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{l.subject}</h1>
            <StatusBadge status={letterStatus} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Letter #{l.id} · {l.letterType} · Submitted{" "}
            {new Date(l.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Quality Degraded Banner */}
      {l.qualityDegraded && (
        <div
          data-testid="banner-quality-degraded-admin"
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              QUALITY DEGRADED DRAFT
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              This draft was produced via best-effort fallback or has quality warnings attached (jurisdiction mismatch, vetting flags, or pipeline fallback). 
              Attorney review should give this letter extra scrutiny. Check version metadata for degradation reasons.
            </p>
          </div>
        </div>
      )}

      {/* Status Timeline */}
      <StatusTimeline currentStatus={letterStatus} />

      {/* Admin Controls */}
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Shield className="h-5 w-5" />
            Admin Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="border-amber-400 text-amber-700"
              onClick={() => setShowForceForm(!showForceForm)}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Force Status Transition
            </Button>
            {(letter.status === "submitted" ||
              letter.status === "researching" ||
              letter.status === "drafting") && (
              <Button
                variant="outline"
                size="sm"
                className="border-blue-400 text-blue-700"
                onClick={() =>
                  retryMutation.mutate({ letterId, stage: retryStage })
                }
                disabled={retryMutation.isPending}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${retryMutation.isPending ? "animate-spin" : ""}`}
                />
                Retry Pipeline
              </Button>
            )}
            {l.status === "pending_review" && !l.assignedReviewerId && (
              <Button
                data-testid="button-claim-as-attorney"
                variant="outline"
                size="sm"
                className="border-green-400 text-green-700"
                onClick={() => claimAsAttorneyMutation.mutate({ letterId })}
                disabled={claimAsAttorneyMutation.isPending}
              >
                <ClipboardList className="h-4 w-4 mr-2" />
                {claimAsAttorneyMutation.isPending ? "Claiming..." : "Claim and Review This Letter"}
              </Button>
            )}
            <Button
              data-testid="button-repair-letter"
              variant="outline"
              size="sm"
              className="border-gray-400 text-gray-700"
              onClick={() => repairMutation.mutate({ letterId })}
              disabled={repairMutation.isPending}
            >
              <Wrench className="h-4 w-4 mr-2" />
              {repairMutation.isPending ? "Repairing..." : "Repair Letter State"}
            </Button>
          </div>

          {showForceForm && (
            <div className="space-y-3 pt-2 border-t border-amber-200">
              <p className="text-sm text-amber-700 font-medium">
                ⚠️ Force transition bypasses normal workflow. Use only for admin
                corrections.
              </p>
              <div className="flex gap-3">
                <Select value={forceStatus} onValueChange={setForceStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select target status" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.filter(s => s !== letter.status).map(s => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                placeholder="Reason for force transition (required for audit trail)"
                value={forceNote}
                onChange={e => setForceNote(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleForceStatus}
                  disabled={forceStatusMutation.isPending}
                >
                  {forceStatusMutation.isPending
                    ? "Applying..."
                    : "Apply Force Transition"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowForceForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Letter Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Letter Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{l.letterType}</span>
              <span className="text-muted-foreground">Jurisdiction</span>
              <span className="font-medium">
                {l.jurisdictionState || "—"}, {l.jurisdictionCountry || "US"}
              </span>
              <span className="text-muted-foreground">Subscriber</span>
              <span className="font-medium">
                {l.submitterRoleId ? (
                  <span className="font-mono text-green-700">{l.submitterRoleId}</span>
                ) : (
                  `User #${l.userId}`
                )}
              </span>
              <span className="text-muted-foreground">Reviewer</span>
              <span className="font-medium">
                {l.reviewerRoleId ? (
                  <span className="font-mono text-purple-700">{l.reviewerRoleId}</span>
                ) : l.assignedReviewerId ? (
                  `Reviewer #${l.assignedReviewerId}`
                ) : (
                  "Unassigned"
                )}
              </span>
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">
                {new Date(l.createdAt).toLocaleString()}
              </span>
              <span className="text-muted-foreground">Updated</span>
              <span className="font-medium">
                {new Date(l.updatedAt).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {l.workflowJobs && l.workflowJobs.length > 0 ? (
              <div className="space-y-2">
                {l.workflowJobs.map((job: any) => {
                  const structured = job.errorMessage ? parsePipelineError(job.errorMessage) : null;
                  return (
                    <div
                      key={job.id}
                      className="text-sm p-2 rounded border space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{job.jobType}</span>
                          <span className="text-muted-foreground ml-2">
                            ({job.provider})
                          </span>
                        </div>
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "default"
                              : job.status === "failed"
                                ? "destructive"
                                : job.status === "running"
                                  ? "secondary"
                                  : "outline"
                          }
                        >
                          {job.status}
                        </Badge>
                      </div>
                      {job.status === "failed" && job.errorMessage && (
                        structured ? (
                          <div className="space-y-0.5 pl-0.5" data-testid={`letter-error-structured-${job.id}`}>
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${structured.category === "transient" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`} data-testid={`letter-error-category-${job.id}`}>
                                {structured.category}
                              </span>
                              <span className="text-xs font-medium text-foreground" data-testid={`letter-error-code-${job.id}`}>
                                {PIPELINE_ERROR_LABELS[structured.code] ?? structured.code}
                              </span>
                            </div>
                            <p className="text-xs text-red-600" data-testid={`letter-error-message-${job.id}`}>{structured.message}</p>
                            {structured.details && (
                              <p className="text-[11px] text-muted-foreground" data-testid={`letter-error-details-${job.id}`}>{structured.details}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-red-600 pl-0.5" data-testid={`letter-error-message-${job.id}`}>{job.errorMessage}</p>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No pipeline jobs yet
              </p>
            )}
            {/* end jobs */}
          </CardContent>
        </Card>

        {/* Research Cache Status */}
        {l.researchRuns && l.researchRuns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Research Cache</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {l.researchRuns.map((run: { id: number; cacheHit: boolean; cacheKey: string | null; provider: string; status: string }) => (
                  <div
                    key={run.id}
                    data-testid={`row-research-run-${run.id}`}
                    className="flex items-start justify-between text-sm p-2 rounded border gap-3"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{run.provider}</span>
                      {run.cacheKey && (
                        <p className="text-xs text-muted-foreground font-mono truncate mt-0.5" title={run.cacheKey}>
                          key: {run.cacheKey}
                        </p>
                      )}
                    </div>
                    <Badge
                      data-testid={run.cacheHit ? "badge-cache-hit" : "badge-cache-miss"}
                      variant={run.cacheHit ? "default" : "outline"}
                      className={run.cacheHit ? "bg-emerald-100 text-emerald-800 border-emerald-200 shrink-0" : "shrink-0"}
                    >
                      {run.cacheHit ? "cache hit" : "fresh"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pipeline Cost */}
      {(() => {
        interface JobRow {
          id: number;
          jobType: string;
          provider: string;
          promptTokens: number | null;
          completionTokens: number | null;
          estimatedCostUsd: string | null;
          requestPayloadJson: { stage?: string } | null;
        }
        const STAGE_LABELS: Record<string, string> = {
          initial_draft: "Initial Draft",
          final_assembly: "Final Assembly",
        };
        const JOB_TYPE_LABELS: Record<string, string> = {
          research: "Research",
          vetting: "Vetting",
          generation_pipeline: "Citation Revalidation",
          retry: "Retry Pipeline",
        };
        const getStageLabel = (job: JobRow): string => {
          const stageKey = job.requestPayloadJson?.stage;
          if (stageKey && STAGE_LABELS[stageKey]) return STAGE_LABELS[stageKey];
          return JOB_TYPE_LABELS[job.jobType] ?? job.jobType.replace(/_/g, " ");
        };
        const trackedJobs: JobRow[] = l.workflowJobs
          ? (l.workflowJobs as JobRow[]).filter(j => j.estimatedCostUsd != null)
          : [];
        if (trackedJobs.length === 0) return null;
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                Pipeline Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Stage</th>
                      <th className="pb-2 font-medium text-right">Prompt Tokens</th>
                      <th className="pb-2 font-medium text-right">Completion Tokens</th>
                      <th className="pb-2 font-medium text-right">Total Tokens</th>
                      <th className="pb-2 font-medium text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trackedJobs.map(job => (
                      <tr key={job.id} data-testid={`row-cost-job-${job.id}`}>
                        <td className="py-2 font-medium">
                          {getStageLabel(job)}
                          <span className="text-muted-foreground text-xs ml-1">
                            ({job.provider})
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {(job.promptTokens ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {(job.completionTokens ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {((job.promptTokens ?? 0) + (job.completionTokens ?? 0)).toLocaleString()}
                        </td>
                        <td className="py-2 text-right tabular-nums font-medium text-green-700">
                          ${parseFloat(job.estimatedCostUsd ?? "0").toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t">
                    <tr>
                      <td className="pt-2 font-semibold" colSpan={3}>Total</td>
                      <td className="pt-2 text-right tabular-nums font-semibold">
                        {(l.pipelineCostSummary?.totalTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="pt-2 text-right tabular-nums font-semibold text-green-700">
                        ${parseFloat(l.pipelineCostSummary?.totalCostUsd ?? "0").toFixed(4)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Intake Data */}
      {l.intakeJson && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Intake Data (Raw)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-64">
              {JSON.stringify(l.intakeJson, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Initial Draft */}
      {l.aiDraftContent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Initial Draft (Internal)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap">
              {l.aiDraftContent}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Audit Trail */}
      {l.reviewActions && l.reviewActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Full Audit Trail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {l.reviewActions.map((action: any) => (
                <div
                  key={action.id}
                  className="flex gap-3 text-sm p-2 rounded border"
                >
                  <div className="text-muted-foreground text-xs w-32 shrink-0">
                    {new Date(action.createdAt).toLocaleString()}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">{action.action}</span>
                    {action.fromStatus && action.toStatus && (
                      <span className="text-muted-foreground ml-2">
                        {action.fromStatus} → {action.toStatus}
                      </span>
                    )}
                    {action.noteText && (
                      <p className="text-muted-foreground mt-1">
                        {action.noteText}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {action.actorType}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showForceConfirm} onOpenChange={setShowForceConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force Status Transition</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to force this letter from{" "}
              <strong>{letterStatus}</strong> to <strong>{forceStatus}</strong>?
              This bypasses normal workflow checks and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeForceStatus}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Force Transition
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
