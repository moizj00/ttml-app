import { Shield, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CounterArgument } from "@shared/types";

interface CounterArgumentPanelProps {
  counterArguments?: CounterArgument[];
  counterArgumentGaps?: string[];
}

const strengthConfig = {
  strong: { label: "Strong", variant: "default" as const, icon: ShieldCheck, color: "text-green-600" },
  moderate: { label: "Moderate", variant: "secondary" as const, icon: Shield, color: "text-yellow-600" },
  weak: { label: "Weak", variant: "destructive" as const, icon: ShieldAlert, color: "text-red-600" },
};

export function CounterArgumentPanel({ counterArguments, counterArgumentGaps }: CounterArgumentPanelProps) {
  if (!counterArguments?.length && !counterArgumentGaps?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground" data-testid="counter-args-empty">
        <ShieldQuestion className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No counter-argument analysis available for this letter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-1" data-testid="counter-args-panel">
      {counterArguments && counterArguments.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Anticipated Opposing Arguments ({counterArguments.length})
          </p>
          {counterArguments.map((ca, i) => {
            const cfg = strengthConfig[ca.strength] || strengthConfig.moderate;
            const Icon = cfg.icon;
            return (
              <div
                key={i}
                className="rounded-lg border p-3 space-y-2"
                data-testid={`counter-arg-${i}`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium leading-tight">{ca.argument}</span>
                      <Badge variant={cfg.variant} className="text-[10px] flex-shrink-0">
                        {cfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {ca.howAddressed}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {counterArgumentGaps && counterArgumentGaps.length > 0 && (
        <div className="mt-4" data-testid="counter-arg-gaps">
          <p className="text-xs font-medium text-destructive uppercase tracking-wide mb-2">
            Unaddressed Gaps ({counterArgumentGaps.length})
          </p>
          {counterArgumentGaps.map((gap, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-destructive/80 mb-2">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{gap}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
