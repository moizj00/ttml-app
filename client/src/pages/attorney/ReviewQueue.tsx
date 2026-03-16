import AppLayout from "@/components/shared/AppLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import ReviewModal from "@/components/shared/ReviewModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Search, ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { LETTER_TYPE_CONFIG } from "../../../../shared/types";
import { useReviewQueueRealtime } from "@/hooks/useLetterRealtime";

// Letters that arrived in the queue within the last 24 hours are considered "New"
const NEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// Only statuses that belong in the attorney review workflow
const REVIEW_STATUSES = ["pending_review", "under_review", "needs_changes", "approved", "rejected"];

export default function ReviewQueue() {
  const utils = trpc.useUtils();

  // Supabase Realtime — instant queue updates when any letter status changes
  useReviewQueueRealtime({
    onAnyChange: () => utils.review.queue.invalidate(),
    enabled: true,
  });

  const { data: letters, isLoading } = trpc.review.queue.useQuery({}, {
    refetchInterval: 15000, // Fallback polling if Realtime is unavailable
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selectedLetterId, setSelectedLetterId] = useState<number | null>(null);

  // Filter to review-relevant statuses only, then apply user filters
  const filtered = (letters ?? [])
    .filter((l) => REVIEW_STATUSES.includes(l.status))
    .filter((l) => {
      const matchSearch = l.subject.toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
          ? ["pending_review", "under_review", "needs_changes"].includes(l.status)
          : l.status === statusFilter;
      return matchSearch && matchStatus;
    });

  const pendingCount = (letters ?? []).filter((l) => l.status === "pending_review").length;

  return (
    <AppLayout breadcrumb={[{ label: "Review Center", href: "/review" }, { label: "Queue" }]}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Letter Review Queue</h1>
            <p className="text-sm text-muted-foreground">
              {filtered.length} letter{filtered.length !== 1 ? "s" : ""} shown
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium">
                  · {pendingCount} awaiting review
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search letters..." className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (needs action)</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="needs_changes">Needs Changes</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              {statusFilter === "active"
                ? "No letters are currently awaiting review."
                : "No letters match your filters."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((letter) => {
              const isNew =
                letter.status === "pending_review" &&
                Date.now() - new Date(letter.createdAt).getTime() < NEW_THRESHOLD_MS;

              return (
                <div
                  key={letter.id}
                  onClick={() => setSelectedLetterId(letter.id)}
                  className={`bg-card border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer ${
                    isNew ? "border-amber-300 bg-amber-50/30" : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isNew ? "bg-amber-100" : "bg-primary/10"
                    }`}>
                      <FileText className={`w-5 h-5 ${isNew ? "text-amber-600" : "text-primary"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground leading-tight">{letter.subject}</p>
                          {isNew && (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 h-4 flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" />
                              New
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
                        <StatusBadge status={letter.status} size="sm" />
                        <span className="text-xs text-muted-foreground">
                          {new Date(letter.createdAt).toLocaleDateString()}
                        </span>
                        {letter.priority && letter.priority !== "normal" && (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            letter.priority === "urgent" ? "bg-red-100 text-red-700" :
                            letter.priority === "high" ? "bg-orange-100 text-orange-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {letter.priority.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selectedLetterId !== null && (
        <ReviewModal
          letterId={selectedLetterId}
          open={true}
          onOpenChange={(open) => { if (!open) setSelectedLetterId(null); }}
        />
      )}
    </AppLayout>
  );
}
