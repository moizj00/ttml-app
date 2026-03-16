import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import BrandLogo from "@/components/shared/BrandLogo";

type PageState = "loading" | "form" | "success" | "error";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<PageState>("loading");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Supabase sends tokens in the URL hash fragment:
    // /reset-password#access_token=xxx&refresh_token=yyy&type=recovery
    const hash = window.location.hash.slice(1); // remove leading #
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    const refresh = params.get("refresh_token");
    const type = params.get("type");

    if (!token || type !== "recovery") {
      setErrorMessage(
        token
          ? "This link is not a password reset link. Please request a new one."
          : "No reset token found. Please request a new password reset link."
      );
      setState("error");
      return;
    }

    setAccessToken(token);
    setRefreshToken(refresh || "");
    setState("form");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match", {
        description: "Please make sure both password fields are identical.",
      });
      return;
    }
    if (password.length < 8) {
      toast.error("Password too short", {
        description: "Password must be at least 8 characters.",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          password,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setState("success");
        // Clear the hash from the URL so the tokens aren't visible
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      } else {
        toast.error("Reset failed", {
          description:
            data.error ||
            "The link may have expired. Please request a new one.",
        });
        if (data.error?.includes("expired")) {
          setState("error");
          setErrorMessage(
            "This reset link has expired. Please request a new password reset email."
          );
        }
      }
    } catch {
      toast.error("Connection error", {
        description: "Please check your internet connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-4 sm:mx-auto">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <BrandLogo href="/" size="lg" className="justify-center mb-4" />
        </div>

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-semibold text-center">
              {state === "loading" && "Loading…"}
              {state === "form" && "Set New Password"}
              {state === "success" && "Password Updated"}
              {state === "error" && "Link Invalid"}
            </CardTitle>
            <CardDescription className="text-center">
              {state === "form" && "Choose a strong password for your account."}
              {state === "success" &&
                "Your password has been reset successfully."}
              {state === "error" &&
                "This reset link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Loading */}
            {state === "loading" && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
              </div>
            )}

            {/* Form */}
            {state === "form" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={8}
                      disabled={loading}
                      className="pr-10"
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      data-testid="button-toggle-password"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repeat your new password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                      className="pr-10"
                      data-testid="input-confirm-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      data-testid="button-toggle-confirm-password"
                      aria-label={
                        showConfirm
                          ? "Hide confirmation password"
                          : "Show confirmation password"
                      }
                    >
                      {showConfirm ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                {password &&
                  confirmPassword &&
                  password !== confirmPassword && (
                    <p className="text-xs text-red-600">
                      Passwords do not match.
                    </p>
                  )}
                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  disabled={
                    loading ||
                    (!!password &&
                      !!confirmPassword &&
                      password !== confirmPassword)
                  }
                  data-testid="button-reset-password"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating password…
                    </>
                  ) : (
                    "Set New Password"
                  )}
                </Button>
              </form>
            )}

            {/* Success */}
            {state === "success" && (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                <p className="text-sm text-slate-600">
                  Your password has been updated. You can now sign in with your
                  new password.
                </p>
                <Button
                  onClick={() => navigate("/login")}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                >
                  Sign In
                </Button>
              </div>
            )}

            {/* Error */}
            {state === "error" && (
              <div className="space-y-4 text-center">
                <XCircle className="w-16 h-16 text-red-500 mx-auto" />
                <p className="text-sm text-slate-600">{errorMessage}</p>
                <Link href="/forgot-password">
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                    Request New Reset Link
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="ghost" className="w-full text-slate-500">
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
