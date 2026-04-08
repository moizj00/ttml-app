/**
 * AffiliateClickAnalytics
 *
 * Click analytics card showing total clicks, unique visitors, and daily breakdown.
 * Visible on the "referrals" tab only.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart3, Loader2, MousePointerClick, ExternalLink } from "lucide-react";

interface DailyClick {
  date: string;
  clicks: number;
  uniqueVisitors: number;
}

interface ClickAnalyticsData {
  totalClicks: number;
  uniqueVisitors: number;
  daily: DailyClick[];
}

interface AffiliateClickAnalyticsProps {
  analyticsLoading: boolean;
  clickAnalytics: ClickAnalyticsData | null | undefined;
}

export function AffiliateClickAnalytics({
  analyticsLoading,
  clickAnalytics,
}: AffiliateClickAnalyticsProps) {
  return (
    <Card data-testid="card-click-analytics">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          Click Analytics
        </CardTitle>
        <CardDescription>
          Real-time click tracking from your referral link — last 30 days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {analyticsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 text-center"
                data-testid="stat-total-clicks"
              >
                <div className="text-2xl font-bold text-primary">
                  {clickAnalytics?.totalClicks ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Total Clicks</p>
              </div>
              <div
                className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-center"
                data-testid="stat-unique-visitors"
              >
                <div className="text-2xl font-bold text-emerald-700">
                  {clickAnalytics?.uniqueVisitors ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Unique Visitors</p>
              </div>
            </div>

            {clickAnalytics && clickAnalytics.daily.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Daily Breakdown
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {clickAnalytics.daily.map(day => (
                    <div
                      key={day.date}
                      className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-0"
                      data-testid={`row-analytics-${day.date}`}
                    >
                      <span className="text-muted-foreground font-mono text-xs">
                        {day.date}
                      </span>
                      <div className="flex items-center gap-3 text-xs">
                        <span>
                          <span className="font-semibold text-foreground">{day.clicks}</span>
                          <span className="text-muted-foreground ml-1">clicks</span>
                        </span>
                        <span>
                          <span className="font-semibold text-emerald-600">
                            {day.uniqueVisitors}
                          </span>
                          <span className="text-muted-foreground ml-1">unique</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <MousePointerClick className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No clicks tracked yet.</p>
                <p className="text-xs mt-1">
                  Share your tracked referral link to start seeing analytics.
                </p>
                <a
                  href="https://refer.talktomylawyer.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-3 text-xs text-indigo-600 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  refer.talktomylawyer.com
                </a>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
