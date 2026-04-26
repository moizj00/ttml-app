import { Card, CardContent } from "@/components/ui/card";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface FreeTierBannerProps {
  totalLetters: number;
}

export function FreeTierBanner({ totalLetters }: FreeTierBannerProps) {
  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-blue-800">
              {totalLetters === 0
                ? "Your first letter is free — attorney review included"
                : "Upgrade to a subscription"}
            </span>
            <p className="text-xs text-blue-600 mt-0.5">
              {totalLetters === 0
                ? "Subscribe monthly or yearly for the best value."
                : "Get 4 letters/month for $299/mo, or $2,400/yr for 8 letters total. Avoid the $299 per-letter fee."}
            </p>
          </div>
        </div>
        <Button
          asChild
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Link
            href={totalLetters === 0 ? "/submit" : "/subscriber/billing"}
          >
            {totalLetters === 0 ? "Start Free Letter" : "View Plans"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
