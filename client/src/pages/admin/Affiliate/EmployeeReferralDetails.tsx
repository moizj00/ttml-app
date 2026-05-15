import { trpc } from "@/lib/trpc";
import { Loader2, Users, TrendingUp, DollarSign } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CommissionStatusBadge,
} from "@/components/shared/CommissionBadges";

function SubscriptionStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    canceled: "bg-red-100 text-red-800",
    past_due: "bg-amber-100 text-amber-800",
    trialing: "bg-blue-100 text-blue-800",
    none: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
        map[status] ?? "bg-gray-100 text-gray-600"
      }`}
      data-testid="badge-subscription-status"
    >
      {status.replace("_", " ")}
    </span>
  );
}

function PlanBadge({ plan }: { plan: string | null }) {
  if (!plan) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 font-mono"
      data-testid="badge-plan"
    >
      {plan}
    </span>
  );
}

interface EmployeeReferralDetailsProps {
  employeeId: number;
}

export function EmployeeReferralDetails({
  employeeId,
}: EmployeeReferralDetailsProps) {
  const { data, isLoading } = trpc.affiliate.adminReferralDetails.useQuery(
    { employeeId },
    { staleTime: 30_000 }
  );

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-6"
        data-testid="referral-details-loading"
      >
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">
          Loading referrals…
        </span>
      </div>
    );
  }

  if (!data) return null;

  const { referrals, summary } = data;

  return (
    <div
      className="bg-muted/30 border-t px-4 py-4 space-y-4"
      data-testid="referral-details-panel"
    >
      {/* Summary Stats */}
      <div className="flex flex-wrap gap-4 text-sm" data-testid="referral-summary">
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-indigo-500" />
          <span className="text-muted-foreground">Total referred:</span>
          <span
            className="font-semibold"
            data-testid="summary-total-referred"
          >
            {summary.totalReferred}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <span className="text-muted-foreground">Avg tenure:</span>
          <span
            className="font-semibold"
            data-testid="summary-avg-tenure"
          >
            {summary.avgTenureMonths} mo
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-green-500" />
          <span className="text-muted-foreground">Revenue generated:</span>
          <span
            className="font-semibold"
            data-testid="summary-total-revenue"
          >
            {formatCurrency(summary.totalRevenue)}
          </span>
        </div>
      </div>

      {referrals.length === 0 ? (
        <div
          className="text-center py-4 text-muted-foreground text-sm"
          data-testid="referral-empty"
        >
          No referrals recorded for this affiliate.
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-md border bg-background"
          data-testid="referral-table-container"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Sub Status</TableHead>
                <TableHead className="text-center">Tenure</TableHead>
                <TableHead className="text-right">Sale</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-center">Invoices</TableHead>
                <TableHead>Com. Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map((r) => (
                <TableRow
                  key={r.commissionId}
                  data-testid={`referral-row-${r.commissionId}`}
                >
                  <TableCell>
                    <div>
                      <p
                        className="font-medium text-sm"
                        data-testid={`referral-subscriber-name-${r.commissionId}`}
                      >
                        {r.subscriberName ?? "Unknown"}
                      </p>
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid={`referral-subscriber-email-${r.commissionId}`}
                      >
                        {r.subscriberEmail ?? `#${r.subscriberId}`}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <PlanBadge plan={r.subscriptionPlan} />
                  </TableCell>
                  <TableCell>
                    <SubscriptionStatusBadge status={r.subscriptionStatus} />
                  </TableCell>
                  <TableCell
                    className="text-center"
                    data-testid={`referral-tenure-${r.commissionId}`}
                  >
                    {r.tenureMonths !== null ? `${r.tenureMonths} mo` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(r.saleAmount)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-green-700">
                    {formatCurrency(r.commissionAmount)}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {r.commissionCount}
                  </TableCell>
                  <TableCell>
                    <CommissionStatusBadge status={r.commissionStatus} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(r.commissionCreatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
