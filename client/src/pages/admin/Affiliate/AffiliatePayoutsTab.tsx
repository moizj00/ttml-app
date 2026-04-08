import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Wallet, CheckCircle2, XCircle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PayoutStatusBadge } from "@/components/shared/CommissionBadges";

interface Payout {
  id: number;
  createdAt: string | Date;
  employeeName: string | null;
  employeeEmail: string | null;
  employeeId: number;
  amount: number;
  paymentMethod: string;
  status: string;
}

interface AffiliatePayoutsTabProps {
  payouts: Payout[] | undefined;
  payoutsLoading: boolean;
  setProcessingPayout: (
    val: { id: number; action: "completed" | "rejected" } | null
  ) => void;
}

export function AffiliatePayoutsTab({
  payouts,
  payoutsLoading,
  setProcessingPayout,
}: AffiliatePayoutsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-indigo-600" />
          Payout Requests
        </CardTitle>
        <CardDescription>
          Review and process affiliate payout requests.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {payoutsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : payouts && payouts.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Affiliate</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">
                    {formatDate(p.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">
                        {p.employeeName ?? "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.employeeEmail ?? `#${p.employeeId}`}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(p.amount)}
                  </TableCell>
                  <TableCell className="text-sm capitalize">
                    {p.paymentMethod.replace("_", " ")}
                  </TableCell>
                  <TableCell>
                    <PayoutStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {p.status === "pending" ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-200 hover:bg-green-50 gap-1"
                          data-testid={`button-approve-payout-${p.id}`}
                          onClick={() =>
                            setProcessingPayout({
                              id: p.id,
                              action: "completed",
                            })
                          }
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                          data-testid={`button-reject-payout-${p.id}`}
                          onClick={() =>
                            setProcessingPayout({
                              id: p.id,
                              action: "rejected",
                            })
                          }
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Processed
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No payout requests yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
