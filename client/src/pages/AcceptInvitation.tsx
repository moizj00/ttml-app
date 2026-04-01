import { useEffect, useState } from "react";
import { useLocation } from "wouter";
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
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle, Scale } from "lucide-react";
import BrandLogo from "@/components/shared/BrandLogo";

type PageState = "loading" | "form" | "success" | "error";

export default function AcceptInvitation() {
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
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    const refresh = params.get("refresh_token");
    const type = params.get("type");

    if (!token || type !== "recovery") {
      setErrorMessage(
        token
          ? "This link is not a valid invitation link. Please contact the administrator."
          : "No invitation token found. Please use the link from your invitation email."
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
        credentials: "include",
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          password,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        if (data.redirectTo) {
          toast.success("Account activated!", {
            description: "Welcome to the Review Center. Redirecting to your dashboard…",
          });
          setTimeout(() => {
            window.location.href = data.redirectTo;
          }, 500);
          return;
        }
        setState("success");
      } else {
        toast.error("Setup failed", {
          description:
            data.error ||
            "The invitation link may have expired. Please contact the administrator.",
        });
        if (data.error?.includes("expired")) {
          setState("error");
          setErrorMessage(
            "This invitation link has expired. Please contact the administrator to receive a new invitation."
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-4 sm:mx-auto">
        <div className="text-center mb-6 sm:mb-8">
          <BrandLogo href="/" size="lg" className="justify-center mb-4" />
        </div>

        <Card className="border-purple-200 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Scale className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-semibold text-center" data-testid="text-invitation-title">
              {state === "loading" && "Loading…"}
              {state === "form" && "Set Your Password"}
              {state === "success" && "You're All Set!"}
              {state === "error" && "Link Invalid"}
            </CardTitle>
            <CardDescription className="text-center">
              {state === "form" && "Choose a password to activate your attorney account and access the Review Center."}
              {state === "success" && "Your attorney account is ready. Welcome to the Review Center!"}
              {state === "error" && "This invitation link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {state === "loading" && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
              </div>
            )}

            {state === "form" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 mb-2">
                  <p className="text-xs text-purple-800">
                    You have been invited as a <strong>Reviewing Attorney</strong>.
                    After setting your password, you will have access to the Letter Review Center
                    where you can claim, edit, and approve legal letter drafts.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
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
                      data-testid="input-invitation-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      data-testid="button-toggle-invitation-password"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                      className="pr-10"
                      data-testid="input-invitation-confirm-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      data-testid="button-toggle-invitation-confirm"
                      aria-label={showConfirm ? "Hide confirmation password" : "Show confirmation password"}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {password && confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-600" data-testid="text-password-mismatch">Passwords do not match.</p>
                )}
                <Button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  disabled={loading || (!!password && !!confirmPassword && password !== confirmPassword)}
                  data-testid="button-set-password"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Setting up your account…
                    </>
                  ) : (
                    "Set Password & Continue"
                  )}
                </Button>
              </form>
            )}

            {state === "success" && (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                <p className="text-sm text-slate-600">
                  Your password has been set and your attorney account is active.
                  Sign in to access the Letter Review Center.
                </p>
                <Button
                  onClick={() => navigate("/login")}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  data-testid="button-go-to-login"
                >
                  Sign In to Attorney Dashboard
                </Button>
              </div>
            )}

            {state === "error" && (
              <div className="space-y-4 text-center">
                <XCircle className="w-16 h-16 text-red-500 mx-auto" />
                <p className="text-sm text-slate-600" data-testid="text-invitation-error">{errorMessage}</p>
                <Button
                  onClick={() => navigate("/forgot-password")}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  data-testid="button-forgot-password"
                >
                  Reset Password Instead
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-slate-500"
                  onClick={() => navigate("/login")}
                  data-testid="button-back-to-login"
                >
                  Back to Sign In
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
