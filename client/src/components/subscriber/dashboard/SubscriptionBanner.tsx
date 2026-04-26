import { CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface SubscriptionBannerProps {
  subscription: {
    status: string;
    plan: string;
    lettersAllowed: number;
    lettersUsed: number;
    currentPeriodEnd: Date | number | string | null;
    cancelAtPeriodEnd: boolean;
  };
}

export function SubscriptionBanner({ subscription }: SubscriptionBannerProps) {
  if (subscription.status !== "active" || (subscription.plan !== "monthly" && subscription.plan !== "annual")) {
    return null;
  }

  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-green-800">
                Active Subscriber
              </span>
              <Badge
                className={
                  subscription.plan === "annual"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-blue-100 text-blue-800"
                }
              >
                {subscription.plan === "annual"
                  ? "Annual Plan"
                  : "Monthly Plan"}
              </Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-green-700">
              <span>
                {subscription.lettersAllowed === -1
                  ? "Unlimited letters"
                  : `${Math.max(0, subscription.lettersAllowed - subscription.lettersUsed)} of ${subscription.lettersAllowed} letters remaining`}
              </span>
              {subscription.currentPeriodEnd && (
                <>
                  <span className="text-green-400">·</span>
                  <span>
                    {subscription.cancelAtPeriodEnd
                      ? "Expires"
                      : "Renews"}{" "}
                    {new Date(
                      subscription.currentPeriodEnd
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
