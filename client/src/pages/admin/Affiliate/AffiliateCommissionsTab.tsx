import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, DollarSign } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CommissionStatusBadge } from "@/components/shared/CommissionBadges";

interface Commission {
  id: number;
  createdAt: string | Date;
  employeeName: string | null;
  employeeEmail: string | null;
  employeeId: number;
  saleAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: string;
}

interface AffiliateCommissionsTabProps {
  commissions: Commission[] | undefined;
  commissionsLoading: boolean;
}

export function AffiliateCommissionsTab({
  commissions,
  commissionsLoading,
}: AffiliateCommissionsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-indigo-600" />
          All Commissions
        </CardTitle>
        <CardDescription>
          Full ledger of all commissions across affiliates.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {commissionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : commissions && commissions.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Affiliate</TableHead>
                  <TableHead>Sale</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">
                      {formatDate(c.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {c.employeeName ?? "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.employeeEmail ?? `#${c.employeeId}`}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(c.saleAmount)}</TableCell>
                    <TableCell className="text-sm">
                      {(c.commissionRate / 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="font-medium text-green-700">
                      {formatCurrency(c.commissionAmount)}
                    </TableCell>
                    <TableCell>
                      <CommissionStatusBadge status={c.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No commissions recorded yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
