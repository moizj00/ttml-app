import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Gift, Ban } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Code {
  id: number;
  code: string;
  employeeName: string | null;
  employeeEmail: string | null;
  employeeId: number;
  discountPercent: number;
  usageCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string | Date;
  isActive: boolean;
}

interface AffiliateCodesTabProps {
  codes: Code[] | undefined;
  codesLoading: boolean;
  updateCode: {
    mutate: (args: { id: number; isActive?: boolean; expiresAt?: string | null }) => void;
    isPending: boolean;
  };
  setForceExpireCodeId: (id: number | null) => void;
}

export function AffiliateCodesTab({
  codes,
  codesLoading,
  updateCode,
  setForceExpireCodeId,
}: AffiliateCodesTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-indigo-600" />
          All Discount Codes
        </CardTitle>
        <CardDescription>
          Manage affiliate discount codes. Toggle active/inactive status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {codesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : codes && codes.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Affiliate</TableHead>
                <TableHead className="text-center">Discount</TableHead>
                <TableHead className="text-center">Uses</TableHead>
                <TableHead className="text-center">Max Uses</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((code) => {
                const isExpired =
                  code.expiresAt && new Date(code.expiresAt) < new Date();
                return (
                  <TableRow
                    key={code.id}
                    data-testid={`code-row-${code.id}`}
                  >
                    <TableCell className="font-mono font-medium">
                      {code.code}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {code.employeeName ?? "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {code.employeeEmail ?? `#${code.employeeId}`}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {code.discountPercent}%
                    </TableCell>
                    <TableCell className="text-center">
                      {code.usageCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {code.maxUses ?? "∞"}
                    </TableCell>
                    <TableCell>
                      {isExpired ? (
                        <Badge
                          variant="destructive"
                          className="text-xs"
                          data-testid={`badge-expired-${code.id}`}
                        >
                          Expired
                        </Badge>
                      ) : code.expiresAt ? (
                        <span
                          className="text-sm"
                          data-testid={`text-expires-${code.id}`}
                        >
                          {formatDate(code.expiresAt)}
                        </span>
                      ) : (
                        <span
                          className="text-sm text-muted-foreground"
                          data-testid={`text-expires-${code.id}`}
                        >
                          Never
                        </span>
                      )}
                      <div className="mt-1">
                        <input
                          type="date"
                          className="text-xs border rounded px-1.5 py-0.5 w-32 bg-background"
                          data-testid={`input-expiry-date-${code.id}`}
                          value={
                            code.expiresAt
                              ? new Date(code.expiresAt)
                                  .toISOString()
                                  .split("T")[0]
                              : ""
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            updateCode.mutate({
                              id: code.id,
                              expiresAt: val
                                ? new Date(val + "T23:59:59Z").toISOString()
                                : null,
                            });
                          }}
                        />
                        {code.expiresAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-6 px-1.5 ml-1 text-muted-foreground"
                            data-testid={`button-clear-expiry-${code.id}`}
                            onClick={() =>
                              updateCode.mutate({
                                id: code.id,
                                expiresAt: null,
                              })
                            }
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(code.createdAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={code.isActive}
                        data-testid={`switch-active-${code.id}`}
                        onCheckedChange={(checked) =>
                          updateCode.mutate({
                            id: code.id,
                            isActive: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="text-xs h-7"
                        data-testid={`button-force-expire-${code.id}`}
                        disabled={!!isExpired && !code.isActive}
                        onClick={() => setForceExpireCodeId(code.id)}
                      >
                        <Ban className="w-3 h-3 mr-1" />
                        Force Expire
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Gift className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No discount codes created yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
