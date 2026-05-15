/**
 * AffiliateEarningsSection
 *
 * Renders the Payout Requests card (with the request payout dialog) and the
 * Commission History card. Visible on the "overview" and "earnings" tabs.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  DollarSign,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CommissionStatusBadge,
  PayoutStatusBadge,
} from "@/components/shared/CommissionBadges";

interface Payout {
  id: number;
  createdAt: string | Date;
  amount: number;
  paymentMethod: string;
  status: string;
}

interface Commission {
  id: number;
  createdAt: string | Date;
  saleAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: string;
}

interface AffiliateEarningsSectionProps {
  // Payout dialog state
  payoutOpen: boolean;
  setPayoutOpen: (open: boolean) => void;
  payoutMethod: string;
  setPayoutMethod: (v: string) => void;
  paypalEmail: string;
  setPaypalEmail: (v: string) => void;
  venmoHandle: string;
  setVenmoHandle: (v: string) => void;
  // Data
  payouts: Payout[] | undefined;
  commissions: Commission[] | undefined;
  payoutsLoading: boolean;
  commissionsLoading: boolean;
  pendingBalance: number;
  requestPayoutPending: boolean;
  onRequestPayout: () => void;
}

export function AffiliateEarningsSection({
  payoutOpen,
  setPayoutOpen,
  payoutMethod,
  setPayoutMethod,
  paypalEmail,
  setPaypalEmail,
  venmoHandle,
  setVenmoHandle,
  payouts,
  commissions,
  payoutsLoading,
  commissionsLoading,
  pendingBalance,
  requestPayoutPending,
  onRequestPayout,
}: AffiliateEarningsSectionProps) {
  return (
    <>
      {/* Payout Requests Card */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-indigo-600" />
              Payout Requests
            </CardTitle>
            <CardDescription>
              Request withdrawal of your pending commissions.
            </CardDescription>
          </div>
          <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                disabled={pendingBalance < 1000}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <ArrowUpRight className="w-4 h-4 mr-1" />
                Request Payout
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Payout</DialogTitle>
                <DialogDescription>
                  Available balance:{" "}
                  <strong>{formatCurrency(pendingBalance)}</strong>.
                  Minimum payout: $10.00.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <Label>Amount</Label>
                  <div
                    className="mt-1 text-2xl font-bold"
                    data-testid="text-payout-full-amount"
                  >
                    {formatCurrency(pendingBalance)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Payout requests withdraw the full available balance.
                  </p>
                </div>
                <div>
                  <Label htmlFor="method">Payment Method</Label>
                  <Select
                    value={payoutMethod}
                    onValueChange={val => {
                      setPayoutMethod(val);
                      setPaypalEmail("");
                      setVenmoHandle("");
                    }}
                  >
                    <SelectTrigger data-testid="select-payout-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="venmo">Venmo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {payoutMethod === "paypal" && (
                  <div>
                    <Label htmlFor="paypal-email">PayPal Email</Label>
                    <Input
                      id="paypal-email"
                      data-testid="input-paypal-email"
                      type="email"
                      placeholder="you@example.com"
                      value={paypalEmail}
                      onChange={e => setPaypalEmail(e.target.value)}
                    />
                  </div>
                )}
                {payoutMethod === "venmo" && (
                  <div>
                    <Label htmlFor="venmo-handle">Venmo Handle</Label>
                    <Input
                      id="venmo-handle"
                      data-testid="input-venmo-handle"
                      placeholder="@yourhandle"
                      value={venmoHandle}
                      onChange={e => setVenmoHandle(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPayoutOpen(false)}
                  disabled={requestPayoutPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={onRequestPayout}
                  disabled={requestPayoutPending}
                  className="bg-indigo-600 hover:bg-indigo-700"
                  data-testid="button-submit-payout"
                >
                  {requestPayoutPending && (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  )}
                  Submit Request
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {payoutsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : payouts && payouts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map(p => (
                  <TableRow key={p.id} data-testid={`row-payout-${p.id}`}>
                    <TableCell className="text-sm">{formatDate(p.createdAt)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="text-sm capitalize">
                      {p.paymentMethod.replace("_", " ")}
                    </TableCell>
                    <TableCell>
                      <PayoutStatusBadge status={p.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No payout requests yet.</p>
              <p className="text-xs mt-1">Earn commissions and request your first payout.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commission History Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            Commission History
          </CardTitle>
          <CardDescription>
            Track every commission earned from your referrals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {commissionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : commissions && commissions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Sale Amount</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map(c => (
                  <TableRow key={c.id} data-testid={`row-commission-${c.id}`}>
                    <TableCell className="text-sm">{formatDate(c.createdAt)}</TableCell>
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
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No commissions yet.</p>
              <p className="text-xs mt-1">Share your discount code to start earning.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
