import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Loader2, AlertCircle, RefreshCw, MailWarning } from "lucide-react";
import { toast } from "sonner";
import BrandLogo from "@/components/shared/BrandLogo";

export default function Verify2FA() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { user, loading: authLoading } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(8).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSendFailed, setEmailSendFailed] = useState(() => {
    const params = new URLSearchParams(searchString);
    return params.get("emailFailed") === "1";
  });
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
    if (emailSendFailed) {
      toast.warning("Verification code could not be sent", {
        description: "Click \"Resend code\" below to try again.",
        duration: 8000,
      });
    }
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...digits];
    if (value.length > 1) {
      const chars = value.split("").filter(c => /\d/.test(c)).slice(0, 8);
      chars.forEach((char, i) => {
        if (index + i < 8) newDigits[index + i] = char;
      });
      setDigits(newDigits);
      const nextIndex = Math.min(index + chars.length, 7);
      inputRefs.current[nextIndex]?.focus();
      return;
    }
    newDigits[index] = value;
    setDigits(newDigits);
    if (value && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 8);
    if (!pasted) return;
    const newDigits = [...digits];
    pasted.split("").forEach((char, i) => {
      if (i < 8) newDigits[i] = char;
    });
    setDigits(newDigits);
    const nextIndex = Math.min(pasted.length, 7);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const code = digits.join("");
    if (code.length !== 8) {
      setError("Please enter all 8 digits");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/admin-2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        setDigits(Array(8).fill(""));
        inputRefs.current[0]?.focus();
        setLoading(false);
        return;
      }
      toast.success("Identity verified", {
        description: "Redirecting to admin dashboard.",
      });
      navigate("/admin");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/admin-2fa/resend", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success("New code sent", { description: "Check your email for a new 8-digit code." });
        setEmailSendFailed(false);
        setDigits(Array(8).fill(""));
        inputRefs.current[0]?.focus();
      } else {
        toast.error("Failed to send code", { description: data.error || "Please try again." });
        setError(data.error || "Failed to resend code");
      }
    } catch {
      toast.error("Connection error", { description: "Could not reach the server. Please try again." });
      setError("Connection error. Please try again.");
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    if (digits.every(d => d !== "")) {
      handleVerify();
    }
  }, [digits]);

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-4 sm:mx-auto">
        <div className="text-center mb-6 sm:mb-8">
          <BrandLogo href="/" size="lg" className="justify-center mb-4" />
        </div>

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="space-y-1 pb-4 text-center">
            <div className="mx-auto w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mb-2">
              <ShieldCheck className="w-7 h-7 text-indigo-600" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-semibold" data-testid="text-verify-title">
              Admin Verification
            </CardTitle>
            <CardDescription>
              Enter the 8-digit code sent to your email to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-6">
              {emailSendFailed && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm" data-testid="text-email-failed-warning">
                  <div className="flex items-start gap-2">
                    <MailWarning className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Verification code could not be sent</p>
                      <p className="mt-1 text-amber-700">Click "Resend code" below to try again. If the issue persists, check your spam folder or contact support.</p>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm" data-testid="text-verify-error">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-2" onPaste={handlePaste}>
                {digits.map((digit, i) => (
                  <Input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    disabled={loading}
                    className="w-10 h-12 text-center text-lg font-semibold border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                    data-testid={`input-code-${i}`}
                    autoComplete="one-time-code"
                  />
                ))}
              </div>

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={loading || digits.some(d => !d)}
                data-testid="button-verify-code"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify Identity"
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                data-testid="button-resend-code"
              >
                {resending ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3" />
                    Resend code
                  </>
                )}
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-slate-400">
              Code expires in 10 minutes. Check your spam folder if you don't see it.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
