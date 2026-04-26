import { Card, CardContent } from "@/components/ui/card";
import { FileText, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import StatusBadge from "@/components/shared/StatusBadge";
import LetterStatusTracker from "@/components/shared/LetterStatusTracker";
import { LETTER_TYPE_CONFIG } from "@shared/types";
import { getStatusCTA, timeAgo } from "./DashboardHelpers";
import { staggerStyle } from "@/hooks/useAnimations";

interface LetterListProps {
  letters: any[];
  isLoading: boolean;
  letterVisible: boolean[];
}

export function LetterList({
  letters,
  isLoading,
  letterVisible,
}: LetterListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-36 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (letters.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-base font-medium text-foreground mb-2">
            No letters yet
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            Submit your first legal matter and our attorneys will research and
            draft a professional letter for attorney review.
          </p>
          <Button asChild>
            <Link href="/submit">
              <PlusCircle className="w-4 h-4 mr-2" />
              Submit Your First Letter
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {letters.map((letter, idx) => {
        const cta = getStatusCTA(letter.status, letter.id);
        const CTAIcon = cta.icon;
        const isActionRequired = ["generated_locked", "needs_changes"].includes(
          letter.status
        );

        return (
          <Card
            key={letter.id}
            className={`overflow-hidden transition-all duration-500 ease-out hover:shadow-md ${
              letterVisible[idx]
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            } ${
              isActionRequired ? "ring-1 ring-amber-300 bg-amber-50/30" : ""
            }`}
            style={staggerStyle(idx, !!letterVisible[idx])}
          >
            <CardContent className="p-0">
              {/* Top section: letter info + status badge */}
              <div className="flex flex-col gap-3 p-4 pb-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {letter.subject}
                      </h3>
                      {isActionRequired && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                          Action Required
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {LETTER_TYPE_CONFIG[letter.letterType]?.label ??
                          letter.letterType}
                      </span>
                      <span className="text-muted-foreground/30">·</span>
                      <span>
                        {timeAgo(
                          typeof letter.createdAt === "object"
                            ? (letter.createdAt as Date).getTime()
                            : letter.createdAt
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-start sm:justify-end">
                  <StatusBadge
                    status={letter.status}
                    approvedByRole={letter.approvedByRole}
                    size="sm"
                  />
                </div>
              </div>

              {/* Pipeline stepper */}
              <div className="px-4 py-3">
                <LetterStatusTracker
                  status={letter.status}
                  size="standard"
                  isFreePreview={letter.isFreePreview === true}
                  freePreviewUnlocked={
                    !!(
                      letter.isFreePreview === true &&
                      letter.freePreviewUnlockAt &&
                      new Date(letter.freePreviewUnlockAt).getTime() <=
                        Date.now()
                    )
                  }
                />
              </div>

              {/* Bottom: CTA button */}
              <div className="px-4 pb-4 pt-1">
                <Button
                  asChild
                  variant={cta.variant}
                  size="sm"
                  className={`w-full sm:w-auto ${
                    letter.status === "generated_locked"
                      ? "bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0"
                      : ""
                  }`}
                >
                  <Link href={cta.href}>
                    <CTAIcon
                      className={`w-4 h-4 mr-2 ${cta.animate ? "animate-spin" : ""}`}
                    />
                    {cta.label}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
