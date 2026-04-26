import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Eye,
  XCircle,
  Download,
  MessageSquare,
  Loader2,
} from "lucide-react";

export function getStatusCTA(status: string, letterId: number) {
  switch (status) {
    case "submitted":
    case "researching":
    case "drafting":
      return {
        label: "Processing...",
        icon: Loader2,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: true,
      };
    case "generated_locked":
      return {
        label: "View Draft",
        icon: FileText,
        variant: "default" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    case "pending_review":
      return {
        label: "Awaiting Attorney",
        icon: Clock,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: true,
      };
    case "under_review":
      return {
        label: "Attorney Reviewing",
        icon: Eye,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: true,
      };
    case "needs_changes":
      return {
        label: "Respond to Changes",
        icon: MessageSquare,
        variant: "destructive" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    case "approved":
      return {
        label: "Download Letter",
        icon: Download,
        variant: "default" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    case "client_approval_pending":
      return {
        label: "Review & Approve",
        icon: CheckCircle,
        variant: "default" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    case "client_revision_requested":
      return {
        label: "Revision in Progress",
        icon: Clock,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: true,
      };
    case "client_approved":
    case "sent":
      return {
        label: "Download Letter",
        icon: Download,
        variant: "default" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    case "client_declined":
      return {
        label: "Declined",
        icon: XCircle,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    case "rejected":
      return {
        label: "View Details",
        icon: XCircle,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
    default:
      return {
        label: "View",
        icon: ArrowRight,
        variant: "outline" as const,
        href: `/letters/${letterId}`,
        animate: false,
      };
  }
}

export function timeAgo(dateStr: string | number): string {
  const now = Date.now();
  const then =
    typeof dateStr === "string" ? new Date(dateStr).getTime() : dateStr;
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
