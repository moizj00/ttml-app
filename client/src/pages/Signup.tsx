import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  getRoleDashboard,
  isRoleAllowedOnPath,
} from "@/components/ProtectedRoute";
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
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Check,
  User,
  Briefcase,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import BrandLogo from "@/components/shared/BrandLogo";

// Google OAuth icon (inline SVG)
import GoogleIcon from "@/components/shared/GoogleIcon";

type RoleOption = "subscriber" | "employee";

const ROLE_OPTIONS: {
  value: RoleOption;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "subscriber",
    label: "Client",
    description: "I need a legal letter drafted",
    icon: <User className="w-5 h-5" />,
  },
  {
    value: "employee",
    label: "Affiliate",
    description: "I work on operations & support",
    icon: <Briefcase className="w-5 h-5" />,
  },
];

export default function Signup() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const utils = trpc.useUtils();

  const requestedRoleFromSearch = (() => {
    const params = new URLSearchParams(search);
    const raw = params.get("role");
    return raw === "subscriber" || raw === "employee"
      ? raw
      : null;
  })();

  // Parse ?next= from query string
  const nextPath = (() => {
    const params = new URLSearchParams(search);
    const raw = params.get("next");
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  })();

  const [role, setRole] = useState<RoleOption>(
    requestedRoleFromSearch ?? "subscriber"
  );
  const [wantsAffiliate, setWantsAffiliate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Detect hash tokens at mount — if present, the finalize useEffect handles
  // the OAuth completion and we must not show any URL-param error.
  const hashHasTokens = typeof window !== "undefined" &&
    new URLSearchParams(window.location.hash.replace(/^#/, "")).has("access_token");
  const [error, setError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [signedUpEmail, setSignedUpEmail] = useState("");
  const oauthFinalizeStarted = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const authError = params.get("error");
    // If hash tokens are present, the finalize useEffect handles everything —
    // do NOT show an error from the URL params (they're a server-side artefact
    // of the implicit flow redirect, not a real failure).
    if (!authError || hashHasTokens) return;

    const messageMap: Record<string, string> = {
      auth_failed: "Google sign-up failed. Please try again.",
      server_error: "A server error interrupted Google sign-up. Please try again.",
    };

    setError(messageMap[authError] || "Authentication failed. Please try again.");
  }, [search, hashHasTokens]);

  useEffect(() => {
    if (requestedRoleFromSearch) {
      setRole(requestedRoleFromSearch);
    }
  }, [requestedRoleFromSearch]);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hashParams.get("access_token");
    if (!accessToken || oauthFinalizeStarted.current) return;

    oauthFinalizeStarted.current = true;
    setGoogleLoading(true);
    setError(null);

    const refreshToken = hashParams.get("refresh_token");
    const expiresIn = hashParams.get("expires_in");

    const finalizeGoogleSignup = async () => {
      try {
        const response = await fetch("/api/auth/google/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: expiresIn,
            next: nextPath,
            role: requestedRoleFromSearch ?? role,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Google sign-up failed. Please try again.");
        }

         localStorage.setItem("sb_access_token", accessToken);
        localStorage.setItem("sb_refresh_token", refreshToken || "");
        // Clean the hash from the URL so tokens don't persist in browser history
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
        await utils.auth.me.invalidate();
        localStorage.removeItem("ttml_onboarding_seen");
        toast.success("Account created", {
          description: "Welcome to Talk to My Lawyer. Let's get started.",
        });
        navigate(data.redirectPath || getRoleDashboard(data.user?.role || "subscriber"));
      } catch (err: any) {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
        setError(err?.message || "Google sign-up failed. Please try again.");
        toast.error("Google sign-up failed", {
          description: err?.message || "Please try again.",
        });
      } finally {
        setGoogleLoading(false);
      }
    };

    void finalizeGoogleSignup();
  }, [navigate, nextPath, requestedRoleFromSearch, role, utils]);

  const passwordChecks = {
    length: password.length >= 8,
    match: password === confirmPassword && confirmPassword.length > 0,
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const doSignup = async (attempt: number) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const resp = await fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              email,
              password,
              name: name || undefined,
              role,
              wantsAffiliate: role === "employee" ? wantsAffiliate : undefined,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return resp;
        } catch (err) {
          clearTimeout(timeoutId);
          if (attempt < 2) return doSignup(attempt + 1);
          throw err;
        }
      };

      const response = await doSignup(0);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Signup failed");
        setLoading(false);
        return;
      }

      if (data.requiresVerification) {
        setSignedUpEmail(email);
        setVerificationSent(true);
        return;
      }

      if (data.needsLogin) {
        toast.success("Account created", {
          description: "Please sign in with your new credentials.",
        });
        navigate("/login");
        return;
      }

      if (data.session?.access_token) {
        localStorage.setItem("sb_access_token", data.session.access_token);
        localStorage.setItem(
          "sb_refresh_token",
          data.session.refresh_token || ""
        );
      }

      await utils.auth.me.invalidate();

      toast.success("Account created", {
        description: "Welcome to Talk to My Lawyer. Let's get started.",
      });

      localStorage.removeItem("ttml_onboarding_seen");

      // Redirect based on role — honour ?next= if the role is allowed on that path
      if (nextPath && isRoleAllowedOnPath(role, nextPath)) {
        navigate(nextPath);
      } else {
        navigate(getRoleDashboard(role));
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setError(
          "Request timed out. Please try again — the server may be warming up."
        );
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          intent: "signup",
          role,
          next: nextPath,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error("Google sign-up failed", {
          description: data.error || "Please try again.",
        });
        setGoogleLoading(false);
        return;
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      toast.error("Connection error", {
        description: "Could not initiate Google sign-up. Please try again.",
      });
      setGoogleLoading(false);
    }
  };

  // Email verification sent screen
  if (verificationSent) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-4 sm:mx-auto">
          <div className="text-center mb-6 sm:mb-8">
            <BrandLogo href="/" size="lg" className="justify-center mb-4" />
          </div>
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">
              Check Your Email
            </h1>
            <p className="text-slate-600 mb-2">
              We sent a verification link to:
            </p>
            <p className="font-semibold text-indigo-700 mb-6 break-all">
              {signedUpEmail}
            </p>
            <p className="text-slate-500 text-sm mb-6">
              Click the link in the email to activate your account. The link
              expires in 24 hours.
            </p>
            <p className="text-slate-400 text-xs mb-4">
              Didn't receive it? Check your spam folder or
            </p>
            <button
              data-testid="button-resend-verification"
              onClick={async () => {
                try {
                  const res = await fetch("/api/auth/resend-verification", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ email: signedUpEmail }),
                  });
                  const d = await res.json();
                  toast.success("Verification email sent", {
                    description:
                      d.message ||
                      "Check your inbox for the confirmation link.",
                  });
                } catch {
                  toast.error("Could not resend email", {
                    description: "Please wait a moment and try again.",
                  });
                }
              }}
              className="text-indigo-600 hover:underline text-sm font-medium"
            >
              resend the verification email
            </button>
            <div className="mt-6">
              <Link href="/login" data-testid="link-back-to-login">
                <Button variant="outline" className="w-full">
                  Back to Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md mx-4 sm:mx-auto">
        {/* Logo & Brand */}
        <div className="text-center mb-6 sm:mb-8">
          <BrandLogo href="/" size="lg" className="justify-center mb-4" />
          <p className="text-slate-500 text-sm">
            Professional legal letters drafted and reviewed by attorneys
          </p>
        </div>

        {/* Signup Card */}
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl sm:text-2xl font-semibold text-center">
              Create Account
            </CardTitle>
            <CardDescription className="text-center">
              Choose your role to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Google Sign-up Button */}
            <Button
              type="button"
              variant="outline"
              className="w-full mb-4 border-slate-300 text-slate-700 hover:bg-slate-50"
              onClick={handleGoogleSignup}
              disabled={googleLoading || loading}
              data-testid="button-google-signup"
            >
              {googleLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing up...
                </>
              ) : (
                <>
                  <GoogleIcon />
                  <span className="ml-2">Continue with Google</span>
                </>
              )}
            </Button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="px-2 bg-white text-slate-500">Or</span>
              </div>
            </div>

            <form onSubmit={handleSignup} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Role Selector */}
              <div className="space-y-2">
                <Label>I am signing up as</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      disabled={loading}
                      data-testid={`button-role-${opt.value}`}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all duration-150 cursor-pointer",
                        role === opt.value
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <span
                        className={cn(
                          "p-1.5 rounded-lg",
                          role === opt.value
                            ? "bg-indigo-100 text-indigo-600"
                            : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {opt.icon}
                      </span>
                      <span className="text-xs font-semibold leading-tight">
                        {opt.label}
                      </span>
                      <span className="text-[10px] leading-tight text-slate-400 hidden sm:block">
                        {opt.description}
                      </span>
                    </button>
                  ))}
                </div>
                {role === "employee" && (
                  <>
                    <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      Affiliate accounts require admin approval before full
                      access is granted.
                    </p>
                    <div
                      className={cn(
                        "flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer transition-all duration-150",
                        wantsAffiliate
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                      onClick={() => setWantsAffiliate(v => !v)}
                      data-testid="card-affiliate-opt-in"
                    >
                      <input
                        type="checkbox"
                        id="wantsAffiliate"
                        checked={wantsAffiliate}
                        onChange={e => setWantsAffiliate(e.target.checked)}
                        onClick={e => e.stopPropagation()}
                        className="mt-0.5 shrink-0 w-4 h-4 accent-indigo-600 cursor-pointer"
                        data-testid="checkbox-affiliate"
                      />
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-indigo-600" />
                          <span className="text-xs font-semibold text-slate-800">
                            Join the referral program
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight">
                          Get a personal 20% discount code to share. Each code
                          is single-use — it auto-rotates every time you copy
                          it, keeping every share unique.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Full Name <span className="text-slate-400">(optional)</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                  disabled={loading}
                  data-testid="input-name"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={loading}
                  data-testid="input-email"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
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
                {password.length > 0 && (
                  <div className="flex items-center gap-2 text-xs mt-1">
                    <Check
                      className={`w-3 h-3 ${passwordChecks.length ? "text-green-500" : "text-slate-300"}`}
                    />
                    <span
                      className={
                        passwordChecks.length
                          ? "text-green-600"
                          : "text-slate-400"
                      }
                    >
                      At least 8 characters
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={loading}
                  data-testid="input-confirm-password"
                />
                {confirmPassword.length > 0 && (
                  <div className="flex items-center gap-2 text-xs mt-1">
                    <Check
                      className={`w-3 h-3 ${passwordChecks.match ? "text-green-500" : "text-slate-300"}`}
                    />
                    <span
                      className={
                        passwordChecks.match
                          ? "text-green-600"
                          : "text-slate-400"
                      }
                    >
                      Passwords match
                    </span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={loading || !passwordChecks.length}
                data-testid="button-signup"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  `Create ${role === "subscriber" ? "Client" : "Affiliate"} Account`
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
                data-testid="link-login"
              >
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="underline hover:text-slate-600">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-slate-600">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
