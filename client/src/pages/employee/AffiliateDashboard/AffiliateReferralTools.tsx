/**
 * AffiliateReferralTools
 *
 * Renders the Referral Program card (discount code + tracked/plain links)
 * and the Compliance card (approved/disallowed messaging hooks).
 * Visible on the "overview" and "referrals" tabs.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Gift,
  Copy,
  RefreshCw,
  Loader2,
  MousePointerClick,
  AlertTriangle,
  CalendarClock,
  Shield,
  ExternalLink,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface DiscountCode {
  code: string;
  usageCount: number;
  isActive: boolean;
  expiresAt?: string | Date | null;
}

interface AffiliateReferralToolsProps {
  activeTab: "overview" | "referrals" | "earnings";
  discountCode: DiscountCode | null | undefined;
  codeLoading: boolean;
  workerReferralLink: string;
  referralLink: string;
  rotateCodePending: boolean;
  onCopyCode: () => void;
  onCopyLink: () => void;
  onCopyWorkerLink: () => void;
  onRegenerateCode: () => void;
}

export function AffiliateReferralTools({
  activeTab,
  discountCode,
  codeLoading,
  workerReferralLink,
  referralLink,
  rotateCodePending,
  onCopyCode,
  onCopyLink,
  onCopyWorkerLink,
  onRegenerateCode,
}: AffiliateReferralToolsProps) {
  if (activeTab === "earnings") return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Referral Program Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-indigo-600" />
            Referral Program
          </CardTitle>
          <CardDescription>
            Share your unique link. New subscribers get 20% off their first payment, and you earn 5% commission in real-time. Disclosure: recipients should know you may earn a commission if they buy through your link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {codeLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : discountCode ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                {/* Tracked referral link */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Tracked Referral Link
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      <MousePointerClick className="w-2.5 h-2.5" />
                      Click tracking on
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="min-w-0 flex-1 rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 text-sm font-mono text-primary font-medium truncate"
                      data-testid="text-worker-referral-link"
                    >
                      {workerReferralLink}
                    </div>
                    <Button
                      onClick={onCopyWorkerLink}
                      variant="default"
                      size="lg"
                      className="shrink-0"
                      data-testid="button-copy-worker-link"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </div>

                {/* Plain referral link */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Plain Referral Link
                  </span>
                  <div className="flex items-center gap-2">
                    <div
                      className="min-w-0 flex-1 rounded-lg bg-muted px-4 py-3 text-sm font-mono text-muted-foreground truncate"
                      data-testid="text-referral-link"
                    >
                      {referralLink}
                    </div>
                    <Button
                      onClick={onCopyLink}
                      variant="outline"
                      size="lg"
                      className="shrink-0"
                      data-testid="button-copy-link"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </div>

                {/* Discount code */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Discount Code
                  </span>
                  <div className="flex items-center gap-2">
                    <div
                      className="min-w-0 flex-1 rounded-lg bg-muted px-4 py-3 text-sm font-mono font-bold tracking-widest truncate"
                      data-testid="text-discount-code"
                    >
                      {discountCode.code}
                    </div>
                    <Button
                      onClick={onCopyCode}
                      variant="outline"
                      size="icon"
                      data-testid="button-copy-code"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={onRegenerateCode}
                      variant="ghost"
                      size="sm"
                      disabled={rotateCodePending}
                      data-testid="button-regenerate-code"
                      title="Generate a new code (e.g. if you suspect it was leaked)"
                    >
                      {rotateCodePending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Share this code with anyone — it can be used by multiple people. Use "Regenerate" only if you suspect the code was leaked.
                  </p>
                </div>
              </div>

              {/* Code status footer */}
              <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between pt-2 border-t">
                <span>
                  Total Conversions: <strong>{discountCode.usageCount}</strong>
                </span>
                <div className="flex items-center gap-2">
                  {discountCode.expiresAt ? (
                    new Date(discountCode.expiresAt) < new Date() ? (
                      <Badge
                        variant="destructive"
                        className="flex items-center gap-1"
                        data-testid="badge-code-expired"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Expired
                      </Badge>
                    ) : (
                      <span
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                        data-testid="text-code-expires"
                      >
                        <CalendarClock className="w-3 h-3" />
                        Expires {formatDate(discountCode.expiresAt)}
                      </span>
                    )
                  ) : (
                    <span
                      className="text-xs text-muted-foreground"
                      data-testid="text-code-no-expiry"
                    >
                      No expiration
                    </span>
                  )}
                  <Badge variant={discountCode.isActive ? "default" : "secondary"}>
                    {discountCode.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No discount code found. Contact admin.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Compliance Card — referrals tab only */}
      {activeTab === "referrals" && (
        <Card data-testid="card-affiliate-compliance">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              What to Say (and What to Never Say)
            </CardTitle>
            <CardDescription>
              Use these compliant hooks when sharing your link. FTC guidelines require you to disclose your affiliate relationship.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase text-emerald-700 mb-3">
                Approved hooks — use these
              </p>
              <ul className="space-y-2">
                {[
                  "I found a faster way to draft legal-style letters.",
                  "This tool helps organize your facts into a stronger first draft.",
                  "For California-specific letters, this is way more focused than generic tools.",
                  "Useful for first drafts before legal review.",
                  "This is a drafting tool — it helps create a structured first draft.",
                  "This organizes your facts into a legal-style letter.",
                  "Review with a licensed attorney where needed.",
                ].map((hook, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-emerald-800">
                    <span className="mt-0.5 text-emerald-600 font-bold">✓</span>
                    <span>"{hook}"</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-xs font-bold uppercase text-red-700 mb-3">Never say these</p>
              <ul className="space-y-2">
                {[
                  "This is legal advice.",
                  "This replaces a lawyer.",
                  "Guaranteed legally correct.",
                  "Zero hallucinations.",
                  "Wins your case.",
                  "Certified by California courts.",
                  "We connect you to lawyers.",
                ].map((no, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                    <span className="mt-0.5 text-red-600 font-bold">✗</span>
                    <span>"{no}"</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase text-amber-700 mb-3">
                Required disclosures
              </p>
              <ul className="space-y-2">
                {[
                  "I may earn a commission if you buy through this link.",
                  "Affiliate link — I earn a small commission at no extra cost to you.",
                  "Paid partnership / Sponsored.",
                ].map((disclosure, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                    <span className="mt-0.5 text-amber-600">•</span>
                    <span>"{disclosure}"</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Click Analytics Card — referrals tab only */}
      {activeTab === "referrals" && (
        <Card data-testid="card-click-analytics">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MousePointerClick className="w-5 h-5 text-indigo-600" />
              Click Analytics
            </CardTitle>
            <CardDescription>
              Real-time click tracking from your referral link — last 30 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Analytics content is rendered by the parent via clickAnalytics prop */}
            <p className="text-xs text-muted-foreground">
              Visit the{" "}
              <a
                href="https://refer.talktomylawyer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                refer.talktomylawyer.com
              </a>{" "}
              dashboard for detailed analytics.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
