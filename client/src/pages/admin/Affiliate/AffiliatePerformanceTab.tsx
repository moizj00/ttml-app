import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, TrendingUp, Users, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { EmployeeReferralDetails } from "./EmployeeReferralDetails";

interface AffiliatePerformanceTabProps {
  performance: Array<{
    employeeId: number;
    name: string | null;
    email: string | null;
    role: string;
    discountCode: string | null;
    codeActive: boolean;
    usageCount: number;
    totalEarned: number;
    pending: number;
    paid: number;
    referralCount: number;
  }> | undefined;
  perfLoading: boolean;
  expandedEmployeeId: number | null;
  toggleEmployee: (id: number) => void;
}

export function AffiliatePerformanceTab({
  performance,
  perfLoading,
  expandedEmployeeId,
  toggleEmployee,
}: AffiliatePerformanceTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-600" />
          Affiliate Performance
        </CardTitle>
        <CardDescription>
          Overview of each affiliate's referral activity and earnings.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {perfLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : performance && performance.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Affiliate</TableHead>
                  <TableHead>Discount Code</TableHead>
                  <TableHead className="text-center">Uses</TableHead>
                  <TableHead className="text-center">Referrals</TableHead>
                  <TableHead className="text-right">Total Earned</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performance.map((emp) => (
                  <React.Fragment key={emp.employeeId}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleEmployee(emp.employeeId)}
                      data-testid={`affiliate-row-${emp.employeeId}`}
                    >
                      <TableCell className="pr-0">
                        {expandedEmployeeId === emp.employeeId ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {emp.name ?? "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {emp.email ?? `#${emp.employeeId}`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {emp.discountCode ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {emp.usageCount}
                      </TableCell>
                      <TableCell className="text-center">
                        {emp.referralCount}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(emp.totalEarned)}
                      </TableCell>
                      <TableCell className="text-right text-amber-600">
                        {formatCurrency(emp.pending)}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(emp.paid)}
                      </TableCell>
                    </TableRow>
                    {expandedEmployeeId === emp.employeeId && (
                      <TableRow
                        key={`detail-${emp.employeeId}`}
                        className="hover:bg-transparent"
                      >
                        <TableCell
                          colSpan={8}
                          className="p-0"
                          data-testid={`referral-details-cell-${emp.employeeId}`}
                        >
                          <EmployeeReferralDetails
                            employeeId={emp.employeeId}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No affiliates found.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
