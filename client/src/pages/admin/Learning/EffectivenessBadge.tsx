import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface EffectivenessBadgeProps {
  before: number | null;
  after: number | null;
}

export function EffectivenessBadge({ before, after }: EffectivenessBadgeProps) {
  if (before == null || after == null) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        data-testid="badge-effectiveness-neutral"
      >
        <Minus className="w-3 h-3" /> No data
      </span>
    );
  }
  const delta = after - before;
  if (delta > 2) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-green-600 font-medium"
        data-testid="badge-effectiveness-positive"
      >
        <TrendingUp className="w-3 h-3" /> +{delta} pts
      </span>
    );
  }
  if (delta < -2) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-red-600 font-medium"
        data-testid="badge-effectiveness-negative"
      >
        <TrendingDown className="w-3 h-3" /> {delta} pts
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      data-testid="badge-effectiveness-neutral"
    >
      <Minus className="w-3 h-3" /> Neutral
    </span>
  );
}
