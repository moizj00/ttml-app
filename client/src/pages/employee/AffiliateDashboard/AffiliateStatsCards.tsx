/**
 * AffiliateStatsCards
 *
 * The four always-visible KPI cards at the top of the AffiliateDashboard:
 * Total Earned, Pending, Paid Out, and Referrals.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Clock, TrendingUp, Users, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useStaggerReveal, staggerStyle } from "@/hooks/useAnimations";

interface AffiliateStatsCardsProps {
  isLoading: boolean;
  totalEarned: number;
  pending: number;
  reserved: number;
  paid: number;
  referralCount: number;
  usageCount: number;
}

export function AffiliateStatsCards({
  isLoading,
  totalEarned,
  pending,
  reserved,
  paid,
  referralCount,
  usageCount,
}: AffiliateStatsCardsProps) {
  const statCardVisible = useStaggerReveal(4, 80);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        className="border-primary/20 bg-primary/5 shadow-sm"
        data-testid="card-stat-total-earned"
        style={staggerStyle(0, statCardVisible[0])}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-primary">Total Earned</CardTitle>
          <DollarSign className="w-4 h-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-primary" data-testid="text-total-earned">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              formatCurrency(totalEarned)
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            5% commission on all referred sales
          </p>
        </CardContent>
      </Card>

      <Card
        data-testid="card-stat-pending"
        style={staggerStyle(1, statCardVisible[1])}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          <Clock className="w-4 h-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600" data-testid="text-pending-balance">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              formatCurrency(pending)
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Available for payout
            {!isLoading && reserved > 0
              ? `; ${formatCurrency(reserved)} reserved`
              : ""}
          </p>
        </CardContent>
      </Card>

      <Card
        data-testid="card-stat-paid-out"
        style={staggerStyle(2, statCardVisible[2])}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Paid Out</CardTitle>
          <TrendingUp className="w-4 h-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600" data-testid="text-paid-out">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              formatCurrency(paid)
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total withdrawn</p>
        </CardContent>
      </Card>

      <Card
        data-testid="card-stat-referrals"
        style={staggerStyle(3, statCardVisible[3])}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Referrals</CardTitle>
          <Users className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-referral-count">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              (referralCount ?? usageCount ?? 0)
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Successful conversions</p>
        </CardContent>
      </Card>
    </div>
  );
}
