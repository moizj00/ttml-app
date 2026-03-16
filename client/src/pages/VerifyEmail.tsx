import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import BrandLogo from "@/components/shared/BrandLogo";

type VerifyState = "loading" | "success" | "error" | "resend";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<VerifyState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("token");
    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    const queryType = params.get("type");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const hashType = hashParams.get("type");

    const clearAuthParams = () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    const verifyCustomToken = async () => {
      const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token!)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Verification failed. The link may have expired.");
      }
      clearAuthParams();
      setState("success");
    };

    const verifySupabaseFlow = async (payload: Record<string, string>) => {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Verification failed. The link may have expired.");
      }
      clearAuthParams();
      setState("success");
    };

    if (!token && !code && !tokenHash && !accessToken) {
      // No token — show resend form
      setState("resend");
      return;
    }

    (async () => {
      try {
        if (token) {
          await verifyCustomToken();
          return;
        }

        if (code) {
          await verifySupabaseFlow({ code });
          return;
        }

        if (tokenHash && queryType) {
          await verifySupabaseFlow({ token_hash: tokenHash, type: queryType });
          return;
        }

        if (accessToken && hashType && hashType !== "recovery") {
          await verifySupabaseFlow({
            access_token: accessToken,
            refresh_token: refreshToken || "",
            type: hashType,
          });
          return;
        }

        setErrorMessage("This verification link is invalid or incomplete. Please request a new one.");
        setState("error");
      } catch (err: any) {
        setErrorMessage(err?.message || "Network error. Please try again.");
        setState("error");
      }
    })();
  }, []);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendSent(true);
        toast.success("Verification email sent", { description: data.message || "Check your inbox for the confirmation link." });
      } else {
        toast.error("Could not resend email", { description: data.error || "Please wait a moment and try again." });
      }
    } catch {
        toast.error("Connection error", { description: "Please check your internet connection and try again." });
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-4 sm:mx-auto">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <BrandLogo href="/" size="lg" className="justify-center" />
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 text-center">
          {/* Loading */}
          {state === "loading" && (
            <>
              <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Verifying your email…</h1>
              <p className="text-slate-500">Please wait while we confirm your address.</p>
            </>
          )}

          {/* Success */}
          {state === "success" && (
            <>
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Email Verified!</h1>
              <p className="text-slate-600 mb-6">
                Your email address has been confirmed. Your account is now active and ready to use.
              </p>
              <Button
                onClick={() => setLocation("/login")}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                data-testid="button-sign-in"
              >
                Sign In to Your Account
              </Button>
            </>
          )}

          {/* Error */}
          {state === "error" && (
            <>
              <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Verification Failed</h1>
              <p className="text-slate-600 mb-6">{errorMessage}</p>
              <Button
                variant="outline"
                onClick={() => setState("resend")}
                className="w-full mb-3"
                data-testid="button-request-new-link"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Request a New Verification Link
              </Button>
              <Link href="/login" data-testid="link-back-to-login-error">
                <Button variant="ghost" className="w-full text-indigo-600">
                  Back to Sign In
                </Button>
              </Link>
            </>
          )}

          {/* Resend form */}
          {state === "resend" && (
            <>
              <Mail className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Resend Verification Email</h1>
              {resendSent ? (
                <>
                  <p className="text-green-600 mb-6">
                    A new verification link has been sent to <strong>{resendEmail}</strong>. Please check your inbox.
                  </p>
                  <Link href="/login" data-testid="link-back-to-login-success">
                    <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                      Back to Sign In
                    </Button>
                  </Link>
                </>
              ) : (
                <form onSubmit={handleResend} className="text-left mt-4">
                  <p className="text-slate-500 text-sm mb-4 text-center">
                    Enter your email address and we'll send you a new verification link.
                  </p>
                  <div className="mb-4">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="mt-1"
                      data-testid="input-email"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={resendLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                    data-testid="button-resend-verification"
                  >
                    {resendLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
                    ) : (
                      "Send Verification Email"
                    )}
                  </Button>
                  <Link href="/login" data-testid="link-back-to-login-resend">
                    <Button variant="ghost" className="w-full mt-2 text-slate-600">
                      Back to Sign In
                    </Button>
                  </Link>
                </form>
              )}
            </>
          )}
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          Need help?{" "}
          <a href="mailto:support@talk-to-my-lawyer.com" className="text-indigo-600 hover:underline" data-testid="link-contact-support">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
