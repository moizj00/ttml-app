import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export function CommissionStatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <Badge
        variant="outline"
        className="border-amber-300 text-amber-700 bg-amber-50"
      >
        <Clock className="w-3 h-3 mr-1" />
        Pending
      </Badge>
    );
  if (status === "paid")
    return (
      <Badge
        variant="outline"
        className="border-green-300 text-green-700 bg-green-50"
      >
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Paid
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">
      <XCircle className="w-3 h-3 mr-1" />
      Voided
    </Badge>
  );
}

export function PayoutStatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <Badge
        variant="outline"
        className="border-amber-300 text-amber-700 bg-amber-50"
      >
        <Clock className="w-3 h-3 mr-1" />
        Pending
      </Badge>
    );
  if (status === "processing")
    return (
      <Badge
        variant="outline"
        className="border-blue-300 text-blue-700 bg-blue-50"
      >
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        Processing
      </Badge>
    );
  if (status === "completed")
    return (
      <Badge
        variant="outline"
        className="border-green-300 text-green-700 bg-green-50"
      >
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Completed
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">
      <XCircle className="w-3 h-3 mr-1" />
      Rejected
    </Badge>
  );
}
