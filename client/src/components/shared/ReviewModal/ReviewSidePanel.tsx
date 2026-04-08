import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, BookOpen, ClipboardList, History } from "lucide-react";
import { LETTER_TYPE_CONFIG } from "../../../../../shared/types";

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
function SideLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      {label}
    </p>
  );
}

function IntakeSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <SideLabel label={label} />
      <div className="bg-muted/50 rounded-lg p-3 space-y-0.5">{children}</div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReviewSidePanelProps {
  letter: any;
  research: any[];
  actions: any[];
  sidePanelOpen: boolean;
}

export function ReviewSidePanel({
  letter,
  research,
  actions,
  sidePanelOpen,
}: ReviewSidePanelProps) {
  return (
    <div
      className={[
        "flex flex-col overflow-hidden bg-card",
        "border-t border-border sm:border-t-0 sm:border-l",
        sidePanelOpen
          ? "h-[50vh] sm:h-auto"
          : "h-0 sm:h-auto overflow-hidden sm:overflow-visible",
        "sm:w-80 lg:w-96 flex-shrink-0",
      ].join(" ")}
    >
      <Tabs
        defaultValue="intake"
        className="flex flex-col flex-1 overflow-hidden h-full"
      >
        <TabsList className="flex-shrink-0 w-full rounded-none border-b border-border bg-muted/30 h-auto p-0 grid grid-cols-3">
          <TabsTrigger
            value="intake"
            className="rounded-none py-2.5 text-xs font-medium data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
            Intake
          </TabsTrigger>
          <TabsTrigger
            value="research"
            className="rounded-none py-2.5 text-xs font-medium data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <BookOpen className="w-3.5 h-3.5 mr-1.5" />
            Research
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="rounded-none py-2.5 text-xs font-medium data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <History className="w-3.5 h-3.5 mr-1.5" />
            History
          </TabsTrigger>
        </TabsList>

        {/* ── Intake Tab ── */}
        <TabsContent
          value="intake"
          className="flex-1 overflow-y-auto m-0 p-4 space-y-4"
        >
          {letter?.intakeJson ? (
            (() => {
              const intake = letter.intakeJson as any;
              return (
                <>
                  <IntakeSection label="Sender">
                    <p className="text-sm font-medium">{intake.sender?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {intake.sender?.address}
                    </p>
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
                  </IntakeSection>
                  <IntakeSection label="Recipient">
                    <p className="text-sm font-medium">
                      {intake.recipient?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {intake.recipient?.address}
                    </p>
                    {intake.recipient?.email && (
                      <p className="text-xs text-muted-foreground">
                        {intake.recipient.email}
                      </p>
                    )}
                  </IntakeSection>
                  <IntakeSection label="Jurisdiction">
                    <p className="text-sm">
                      {[
                        intake.jurisdiction?.city,
                        intake.jurisdiction?.state,
                        intake.jurisdiction?.country ?? "US",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </IntakeSection>
                  <IntakeSection label="Matter Description">
                    <p className="text-sm text-foreground leading-relaxed">
                      {intake.matter?.description}
                    </p>
                  </IntakeSection>
                  <IntakeSection label="Desired Outcome">
                    <p className="text-sm text-foreground">
                      {intake.desiredOutcome}
                    </p>
                  </IntakeSection>
                  {intake.financials?.amountOwed && (
                    <IntakeSection label="Amount Owed">
                      <p className="text-sm font-semibold text-foreground">
                        ${intake.financials.amountOwed.toLocaleString()}{" "}
                        {intake.financials.currency ?? "USD"}
                      </p>
                    </IntakeSection>
                  )}
                  {intake.tonePreference && (
                    <div className="space-y-1.5">
                      <SideLabel label="Tone" />
                      <Badge variant="outline" className="capitalize">
                        {intake.tonePreference}
                      </Badge>
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No intake data available.
            </p>
          )}
        </TabsContent>

        {/* ── Research Tab ── */}
        <TabsContent
          value="research"
          className="flex-1 overflow-y-auto m-0 p-4"
        >
          {research.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <BookOpen className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No research data yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {research.map((run: any) => {
                const packet = run.researchPacket as any;
                return (
                  <div key={run.id} className="space-y-3">
                    {packet?.researchSummary && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <h4 className="text-xs font-semibold text-blue-800 mb-1.5">
                          Research Summary
                        </h4>
                        <p className="text-xs text-blue-900 leading-relaxed">
                          {packet.researchSummary}
                        </p>
                      </div>
                    )}
                    {packet?.applicableRules?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-foreground mb-2">
                          Applicable Laws
                        </h4>
                        <div className="space-y-2">
                          {packet.applicableRules
                            .slice(0, 5)
                            .map((rule: any, i: number) => (
                              <div
                                key={i}
                                className="bg-muted/50 rounded-lg p-2.5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-xs font-medium text-foreground">
                                    {rule.ruleTitle}
                                  </p>
                                  <span
                                    className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                                      rule.confidence === "high"
                                        ? "bg-green-100 text-green-700"
                                        : rule.confidence === "medium"
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-gray-100 text-gray-600"
                                    }`}
                                  >
                                    {rule.confidence}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  {rule.summary}
                                </p>
                                {rule.citationText && (
                                  <p className="text-[10px] text-primary mt-1 font-mono">
                                    {rule.citationText}
                                  </p>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    {packet?.riskFlags?.length > 0 && (
                      <div className="bg-red-50 rounded-lg p-2.5">
                        <h4 className="text-xs font-semibold text-red-800 mb-1.5">
                          Risk Flags
                        </h4>
                        <ul className="space-y-1">
                          {packet.riskFlags.map((flag: string, i: number) => (
                            <li
                              key={i}
                              className="text-[11px] text-red-700 flex items-start gap-1.5"
                            >
                              <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                              {flag}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {packet?.openQuestions?.length > 0 && (
                      <div className="bg-amber-50 rounded-lg p-2.5">
                        <h4 className="text-xs font-semibold text-amber-800 mb-1.5">
                          Open Questions
                        </h4>
                        <ul className="space-y-1">
                          {packet.openQuestions.map(
                            (q: string, i: number) => (
                              <li
                                key={i}
                                className="text-[11px] text-amber-700"
                              >
                                • {q}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent
          value="history"
          className="flex-1 overflow-y-auto m-0 p-4"
        >
          {actions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <History className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No actions recorded yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {actions.map((action: any) => (
                <div key={action.id} className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground capitalize">
                        {action.action.replace(/_/g, " ")}
                      </span>
                      {action.noteVisibility === "internal" && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          internal
                        </span>
                      )}
                    </div>
                    {action.noteText && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        {action.noteText}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {new Date(action.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
