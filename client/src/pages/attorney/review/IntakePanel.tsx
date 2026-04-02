import { Card, CardContent } from "@/components/ui/card";

interface IntakeJson {
  sender?: { name?: string; address?: string; email?: string; phone?: string };
  recipient?: { name?: string; address?: string; company?: string; email?: string };
  jurisdiction?: string | { state?: string; country?: string; city?: string };
  matter?: { description?: string; [key: string]: unknown };
  description?: string;
  desiredOutcome?: string;
  financials?: { amountOwed?: string | number; currency?: string };
  timeline?: string;
  [key: string]: unknown;
}

interface Props {
  intakeJson: unknown;
  jurisdictionState?: string | null;
}

export function IntakePanel({ intakeJson, jurisdictionState }: Props) {
  return (
    <Card className="h-full border-border">
      <CardContent className="p-3 space-y-3">
        {intakeJson ? (
          (() => {
            const intake = intakeJson as IntakeJson;
            return (
              <>
                {/* Sender */}
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-foreground mb-1">
                    {intake.sender?.name}
                  </p>
                  {intake.sender?.address && (
                    <p className="text-xs text-muted-foreground">
                      {intake.sender.address}
                    </p>
                  )}
                  {intake.sender?.email && (
                    <p className="text-xs text-muted-foreground">
                      {intake.sender.email}
                    </p>
                  )}
                  {intake.sender?.phone && (
                    <p className="text-xs text-muted-foreground">
                      {intake.sender.phone}
                    </p>
                  )}
                </div>

                {/* Recipient */}
                {intake.recipient && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Recipient
                    </p>
                    <p className="text-xs font-medium text-foreground">
                      {intake.recipient.name}
                      {intake.recipient.company &&
                        ` / ${intake.recipient.company}`}
                    </p>
                    {intake.recipient.address && (
                      <p className="text-xs text-muted-foreground">
                        {intake.recipient.address}
                      </p>
                    )}
                    {intake.recipient.email && (
                      <p className="text-xs text-muted-foreground">
                        {intake.recipient.email}
                      </p>
                    )}
                  </div>
                )}

                {/* Jurisdiction */}
                {(intake.jurisdiction || jurisdictionState) && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Jurisdiction
                    </p>
                    <p className="text-xs text-foreground">
                      {typeof intake.jurisdiction === "string"
                        ? intake.jurisdiction
                        : intake.jurisdiction
                          ? [
                              intake.jurisdiction.city,
                              intake.jurisdiction.state,
                              intake.jurisdiction.country,
                            ]
                              .filter(Boolean)
                              .join(", ")
                          : `${jurisdictionState}, US`}
                    </p>
                  </div>
                )}

                {/* Matter description */}
                {intake.matter?.description && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Matter Description
                    </p>
                    <p className="text-xs text-foreground leading-relaxed">
                      {intake.matter.description}
                    </p>
                  </div>
                )}

                {/* Desired outcome */}
                {intake.desiredOutcome && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Desired Outcome
                    </p>
                    <p className="text-xs text-foreground leading-relaxed">
                      {intake.desiredOutcome}
                    </p>
                  </div>
                )}

                {/* Financials */}
                {intake.financials?.amountOwed && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Amount Owed
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      ${Number(intake.financials.amountOwed).toLocaleString()}{" "}
                      {intake.financials.currency ?? "USD"}
                    </p>
                  </div>
                )}
              </>
            );
          })()
        ) : (
          <p className="text-xs text-muted-foreground">
            No intake data available.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
