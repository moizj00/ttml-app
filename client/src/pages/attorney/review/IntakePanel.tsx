import { Card, CardContent } from "@/components/ui/card";

interface IntakeJson {
  sender?: { name?: string; address?: string; email?: string; phone?: string };
  recipient?: { name?: string; address?: string; company?: string; email?: string };
  jurisdiction?: string | { state?: string; country?: string; city?: string };
  matter?: { description?: string; incidentDate?: string; [key: string]: unknown };
  description?: string;
  desiredOutcome?: string;
  deadlineDate?: string;
  additionalContext?: string;
  financials?: { amountOwed?: string | number; currency?: string };
  tonePreference?: string;
  language?: string;
  priorCommunication?: string;
  deliveryMethod?: string;
  communications?: { summary?: string; lastContactDate?: string; method?: string };
  exhibits?: { label: string; description?: string; hasAttachment?: boolean }[];
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

                {/* Incident date */}
                {intake.matter?.incidentDate && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Incident Date
                    </p>
                    <p className="text-xs text-foreground">
                      {new Date(intake.matter.incidentDate + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                )}

                {/* Deadline */}
                {intake.deadlineDate && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Response Deadline
                    </p>
                    <p className="text-xs text-foreground">
                      {new Date(intake.deadlineDate + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                )}

                {/* Additional context */}
                {intake.additionalContext && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Additional Context
                    </p>
                    <p className="text-xs text-foreground leading-relaxed">
                      {intake.additionalContext}
                    </p>
                  </div>
                )}

                {/* Tone / Language / Delivery */}
                {(intake.tonePreference || intake.language || intake.deliveryMethod || intake.priorCommunication) && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Preferences
                    </p>
                    {intake.tonePreference && <p className="text-xs text-foreground">Tone: <span className="capitalize">{intake.tonePreference}</span></p>}
                    {intake.language && <p className="text-xs text-foreground">Language: <span className="capitalize">{intake.language}</span></p>}
                    {intake.deliveryMethod && <p className="text-xs text-foreground">Delivery: <span className="capitalize">{String(intake.deliveryMethod).replace(/_/g, " ")}</span></p>}
                    {intake.priorCommunication && intake.priorCommunication !== "none" && <p className="text-xs text-foreground">Prior Contact: <span className="capitalize">{intake.priorCommunication}</span></p>}
                  </div>
                )}

                {/* Exhibits */}
                {Array.isArray(intake.exhibits) && intake.exhibits.length > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Exhibits ({intake.exhibits.length})
                    </p>
                    <div className="space-y-1.5">
                      {intake.exhibits.map((ex, i) => (
                        <div key={i} className="text-xs text-foreground">
                          <span className="font-semibold">{ex.label}:</span>{" "}
                          {ex.description || "(no description)"}
                          {ex.hasAttachment && <span className="text-primary ml-1">· file attached</span>}
                        </div>
                      ))}
                    </div>
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
