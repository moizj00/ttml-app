/**
 * DiscountCodeInput — Reusable promo/discount code input with live validation.
 *
 * Used on:
 *  - Pricing page (subscription checkout)
 *  - LetterPaywall (per-letter checkout)
 *
 * Supports:
 *  - Manual entry + validation via affiliate.validateCode
 *  - Pre-filled via URL parameter (?code=XXX)
 *  - Callback with validated code + discount percent
 *  - Light and dark visual variants
 */
import { useState, useEffect, useCallback } from "react";
import { Tag, CheckCircle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export interface DiscountCodeResult {
  code: string;
  discountPercent: number;
}

interface DiscountCodeInputProps {
  /** Called when a code is successfully applied or removed */
  onCodeChange?: (result: DiscountCodeResult | null) => void;
  /** Pre-fill the input with a code (e.g. from URL param) */
  initialCode?: string;
  /** Visual variant */
  variant?: "light" | "dark";
  /** Additional CSS classes for the container */
  className?: string;
  /** Label text override */
  label?: string;
}

export function DiscountCodeInput({
  onCodeChange,
  initialCode,
  variant = "dark",
  className = "",
  label = "Have a promo code?",
}: DiscountCodeInputProps) {
  const [promoInput, setPromoInput] = useState(initialCode?.toUpperCase() ?? "");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [autoValidated, setAutoValidated] = useState(false);

  // tRPC query for validation (manual refetch)
  const validateCodeQuery = trpc.affiliate.validateCode.useQuery(
    { code: promoInput.trim().toUpperCase() },
    { enabled: false }
  );

  const applyCode = useCallback(async (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setPromoInput(normalized);
    setPromoLoading(true);
    setPromoError(null);
    try {
      const result = await validateCodeQuery.refetch();
      if (result.data?.valid) {
        setAppliedCode(normalized);
        setAppliedDiscount(result.data.discountPercent);
        onCodeChange?.({ code: normalized, discountPercent: result.data.discountPercent });
        toast.success(`Promo code applied — ${result.data.discountPercent}% off!`);
      } else {
        setPromoError("Invalid or expired promo code.");
        setAppliedCode(null);
        setAppliedDiscount(0);
        onCodeChange?.(null);
      }
    } catch {
      setPromoError("Could not validate code. Please try again.");
    } finally {
      setPromoLoading(false);
    }
  }, [validateCodeQuery, onCodeChange]);

  const handleRemovePromo = useCallback(() => {
    setAppliedCode(null);
    setAppliedDiscount(0);
    setPromoInput("");
    setPromoError(null);
    onCodeChange?.(null);
  }, [onCodeChange]);

  // Auto-validate initial code (from URL param) once
  useEffect(() => {
    if (initialCode && !autoValidated && !appliedCode) {
      setAutoValidated(true);
      // Small delay to let the query hook initialize
      const timer = setTimeout(() => applyCode(initialCode), 300);
      return () => clearTimeout(timer);
    }
  }, [initialCode, autoValidated, appliedCode, applyCode]);

  const isDark = variant === "dark";

  return (
    <div
      className={`rounded-xl p-4 space-y-2 ${
        isDark
          ? "bg-white/10 border border-white/20"
          : "bg-muted/50 border border-border"
      } ${className}`}
    >
      <p
        className={`text-xs font-semibold flex items-center gap-1.5 ${
          isDark ? "text-white/70" : "text-muted-foreground"
        }`}
      >
        <Tag className="w-3.5 h-3.5" />
        {label}
      </p>

      {appliedCode ? (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
            isDark
              ? "bg-emerald-500/20 border border-emerald-400/40"
              : "bg-emerald-50 border border-emerald-200"
          }`}
        >
          <CheckCircle
            className={`w-4 h-4 flex-shrink-0 ${
              isDark ? "text-emerald-300" : "text-emerald-600"
            }`}
          />
          <span
            className={`text-sm font-semibold flex-1 ${
              isDark ? "text-white" : "text-foreground"
            }`}
          >
            {appliedCode} — {appliedDiscount}% off applied
          </span>
          <button
            onClick={handleRemovePromo}
            className={`transition-colors ${
              isDark
                ? "text-white/60 hover:text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Remove promo code"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            value={promoInput}
            onChange={(e) => {
              setPromoInput(e.target.value.toUpperCase());
              setPromoError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && applyCode(promoInput)}
            placeholder="Enter code (e.g. SAVE20)"
            className={`h-9 text-sm font-mono uppercase tracking-wider ${
              isDark
                ? "bg-white/10 border-white/20 text-white placeholder:text-white/40"
                : "bg-background border-border text-foreground placeholder:text-muted-foreground"
            }`}
            maxLength={32}
          />
          <Button
            onClick={() => applyCode(promoInput)}
            disabled={!promoInput.trim() || promoLoading}
            variant="outline"
            size="sm"
            className={`h-9 px-4 whitespace-nowrap ${
              isDark
                ? "bg-white/10 border-white/30 text-white hover:bg-white/20"
                : ""
            }`}
          >
            {promoLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Apply"
            )}
          </Button>
        </div>
      )}

      {promoError && (
        <p
          className={`text-xs flex items-center gap-1 ${
            isDark ? "text-red-300" : "text-destructive"
          }`}
        >
          <X className="w-3 h-3" />
          {promoError}
        </p>
      )}
    </div>
  );
}
