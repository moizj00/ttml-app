import AppLayout from "@/components/shared/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, RefreshCw, CheckCircle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useState } from "react";

export default function AdminJobs() {
  const { data: failedJobs, isLoading, refetch } = trpc.admin.failedJobs.useQuery();
  const [retrying, setRetrying] = useState<number | null>(null);

  const purgeJobs = trpc.admin.purgeFailedJobs.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.deletedCount > 0
          ? `Purged ${data.deletedCount} failed job${data.deletedCount !== 1 ? "s" : ""} successfully.`
          : "No failed jobs to purge."
      );
      refetch();
    },
    onError: (e) => toast.error("Purge failed", { description: e.message }),
  });

  const retryJob = trpc.admin.retryJob.useMutation({
    onSuccess: (_, vars) => {
      toast.success("Retry initiated", { description: `Letter #${vars.letterId} has been re-queued for processing.` });
      setRetrying(null);
      setTimeout(() => refetch(), 2000);
    },
    onError: (e) => { toast.error("Retry failed", { description: e.message }); setRetrying(null); },
  });

  const jobCount = failedJobs?.length ?? 0;

  const handleRetry = (letterId: number, jobType: string) => {
    const stage = jobType.includes("research") ? "research" : "drafting";
    setRetrying(letterId);
    retryJob.mutate({ letterId, stage: stage as any });
  };

  return (
    <AppLayout breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Failed Jobs" }]}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Failed Jobs</h1>
            <p className="text-sm text-muted-foreground">{jobCount} failed pipeline job{jobCount !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="bg-background">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            {jobCount > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={purgeJobs.isPending}>
                    {purgeJobs.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Purging...</>
                    ) : (
                      <><Trash2 className="w-4 h-4 mr-2" />Purge All ({jobCount})</>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Purge all failed jobs?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {jobCount} failed pipeline job{jobCount !== 1 ? "s" : ""} from the database.
                      This action cannot be undone. The associated letter requests will remain intact.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => purgeJobs.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Yes, purge all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : !failedJobs || failedJobs.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-foreground mb-2">No Failed Jobs</h3>
            <p className="text-sm text-muted-foreground">All pipeline jobs are running normally.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {failedJobs.map((job) => (
              <Card key={job.id} className="border-red-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Letter #{job.letterRequestId} — {job.jobType.replace(/_/g, " ")}
                        </p>
                        {job.errorMessage && (
                          <p className="text-xs text-red-600 mt-1 max-w-md">{job.errorMessage}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Failed at {new Date(job.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetry(job.letterRequestId, job.jobType)}
                      disabled={retrying === job.letterRequestId}
                      className="bg-background flex-shrink-0"
                    >
                      {retrying === job.letterRequestId ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Retrying...</>
                      ) : (
                        <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
