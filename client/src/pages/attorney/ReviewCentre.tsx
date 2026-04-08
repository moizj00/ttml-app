/**
 * Review Centre
 *
 * Shows letters that have been claimed by the current attorney or admin
 * (i.e., `assignedReviewerId = currentUser.id`). This is the attorney's
 * personal workspace — distinct from the shared Review Queue.
 *
 * Statuses typically shown here: under_review, needs_changes,
 * client_revision_requested, client_approval_pending, client_approved,
 * client_declined, approved, rejected.
 */
import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import ReviewModal from "@/components/shared/ReviewModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Search,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Layers,
} from "lucide-react";
import { useState, useMemo } from "react";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import { useReviewQueueRealtime } from "@/hooks/useLetterRealtime";
import { useStaggerReveal, staggerStyle } from "@/hooks/useAnimations";

// Statuses that belong in the Review Centre (claimed letters)
const CENTRE_STATUSES = [
  "under_review",
  "needs_changes",
  "client_revision_requested",
  "client_approval_pending",
  "client_approved",
  "client_declined",
  "approved",
  "rejected",
];

const STATUS_LABELS: Record<string, string> = {
  under_review: "Under Review",
  needs_changes: "Needs Changes",
  client_revision_requested: "Client Revision",
  client_approval_pending: "Client Approval Pending",
  client_approved: "Client Approved",
  client_declined: "Client Declined",
  approved: "Approved",
  rejected: "Rejected",
};

export default function ReviewCentre() {
  const utils = trpc.useUtils();

  // Realtime updates — invalidate both myClaimed and queue since claiming moves letters between them
  useReviewQueueRealtime({
    onAnyChange: () => {
      void utils.review.myClaimed.invalidate();
      void utils.review.queue.invalidate();
    },
    enabled: true,
  });

  const { data: letters, isLoading } = trpc.review.myClaimed.useQuery(undefined, {
    refetchInterval: 15000,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selectedLetterId, setSelectedLetterId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return (letters ?? [])
      .filter((l) => CENTRE_STATUSES.includes(l.status))
      .filter((l) => {
        const matchSearch = l.subject
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchStatus =
          statusFilter === "all"
            ? true
            : statusFilter === "active"
            ? ["under_review", "needs_changes", "client_revision_requested"].includes(
                l.status
              )
            : l.status === statusFilter;
        return matchSearch && matchStatus;
      });
  }, [letters, search, statusFilter]);

  const activeCount = (letters ?? []).filter((l) =>
    ["under_review", "needs_changes", "client_revision_requested"].includes(l.status)
  ).length;

  const letterVisible = useStaggerReveal(filtered.length, 50);

  return (
    <AppLayout
      breadcrumb={[{ label: "Review Centre" }]}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Review Centre</h1>
            <p className="text-sm text-muted-foreground">
              Letters you have claimed.{" "}
              {activeCount > 0 && (
                <span className="text-blue-600 font-medium">
                  {activeCount} active
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="input-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your letters..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-status-filter" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (needs action)</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="needs_changes">Needs Changes</SelectItem>
              <SelectItem value="client_revision_requested">Client Revision</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            {statusFilter === "active" ? (
              <>
                <CheckCircle className="w-12 h-12 text-green-400/60 mx-auto mb-4" />
                <p className="text-sm font-medium text-muted-foreground">
                  No active letters — you're all caught up!
                </p>
              </>
            ) : (
              <>
                <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  {search ? "No letters match your search." : "No letters found."}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((letter, idx) => (
              <div
                key={letter.id}
                data-testid={`card-letter-${letter.id}`}
                onClick={() => setSelectedLetterId(letter.id)}
                style={staggerStyle(idx, letterVisible[idx])}
                className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-primary/10">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          data-testid={`text-subject-${letter.id}`}
                          className="text-sm font-semibold text-foreground leading-tight"
                        >
                          {letter.subject}
                        </p>
                        {letter.qualityDegraded && (
                          <Badge
                            data-testid={`badge-quality-degraded-${letter.id}`}
                            className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 h-4 flex items-center gap-0.5"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Degraded
                          </Badge>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {LETTER_TYPE_CONFIG[letter.letterType]?.label ?? letter.letterType}
                      {letter.jurisdictionState && ` · ${letter.jurisdictionState}`}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <StatusBadge
                        status={letter.status}
                        size="sm"
                        data-testid={`status-badge-${letter.id}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {new Date(letter.createdAt).toLocaleDateString()}
                      </span>
                      {letter.priority && letter.priority !== "normal" && (
                        <span
                          className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            letter.priority === "urgent"
                              ? "bg-red-100 text-red-700"
                              : letter.priority === "high"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {letter.priority.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedLetterId !== null && (
        <ReviewModal
          letterId={selectedLetterId}
          open={true}
          onOpenChange={(open) => {
            if (!open) setSelectedLetterId(null);
          }}
        />
      )}
    </AppLayout>
  );
}
