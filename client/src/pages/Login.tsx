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
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import BrandLogo from "@/components/shared/BrandLogo";

// Google OAuth icon (inline SVG)
import GoogleIcon from "@/components/shared/GoogleIcon";

export default function Login() {
  const [, navigate] = useLocation();
  const search = useSearch();

  const utils = trpc.useUtils();

  // Parse ?next= or ?redirect= from query string
  const nextPath = (() => {
    const params = new URLSearchParams(search);
    const raw = params.get("next") ?? params.get("redirect");
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  })();

  // Parse ?role= from query string — forwarded by the server callback handler
  // when the implicit/hash flow redirects back to /login with a role param.
  const requestedRoleFromSearch = (() => {
    const params = new URLSearchParams(search);
    const raw = params.get("role");
    return raw === "subscriber" || raw === "employee" ? raw : null;
  })();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Show error from OAuth callback redirect — but only if no hash tokens are
  // present. If hash tokens exist the useEffect below will handle them and we
  // must not show a stale error before that completes.
  const urlError = new URLSearchParams(search).get("error");
  const hashHasTokens =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.hash.replace(/^#/, "")).has(
      "access_token"
    );
  const [error, setError] = useState<string | null>(
    hashHasTokens
      ? null
      : urlError === "auth_failed"
        ? "Google sign-in failed. Please try again."
        : urlError === "server_error"
          ? "Something went wrong. Please try again."
          : null
  );
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const oauthFinalizeStarted = useRef(false);

  useEffect(() => {
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    const accessToken = hashParams.get("access_token");
    if (!accessToken || oauthFinalizeStarted.current) return;

    oauthFinalizeStarted.current = true;
    setGoogleLoading(true);
    setError(null);

    const refreshToken = hashParams.get("refresh_token");
    const expiresIn = hashParams.get("expires_in");

    const finalizeGoogleLogin = async () => {
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
            ...(requestedRoleFromSearch ? { role: requestedRoleFromSearch } : {}),
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Google sign-in failed. Please try again."
          );
        }

        window.history.replaceState(
          {},
          document.title,
          `${window.location.pathname}${window.location.search}`
        );
        await utils.auth.me.invalidate();

        if (data.requires2FA) {
          if (data.emailFailed) {
            toast.warning("Verification required", {
              description: "Could not send the code automatically. Please use Resend Code on the next screen.",
            });
            navigate("/admin/verify?emailFailed=1");
          } else {
            toast.info("Verification required", {
              description: "A verification code has been sent to your email.",
            });
            navigate("/admin/verify");
          }
          return;
        }

        toast.success("Signed in successfully", {
          description: "Welcome back. Redirecting to your dashboard.",
        });

        navigate(
          data.redirectPath || getRoleDashboard(data.user?.role || "subscriber")
        );
      } catch (err: any) {
        window.history.replaceState(
          {},
          document.title,
          `${window.location.pathname}${window.location.search}`
        );
        setError(err?.message || "Google sign-in failed. Please try again.");
        toast.error("Google sign-in failed", {
          description: err?.message || "Please try again.",
        });
      } finally {
        setGoogleLoading(false);
      }
    };

    void finalizeGoogleLogin();
  }, [navigate, nextPath, requestedRoleFromSearch, utils]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const authError = params.get("error");
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    // If hash tokens are present, the finalize useEffect handles everything —
    // do NOT show an error from the URL params (they're a server-side artefact
    // of the implicit flow redirect, not a real failure).
    if (!authError || hashParams.get("access_token")) return;

    const messageMap: Record<string, string> = {
      auth_failed: "Google sign-in failed. Please try again.",
      server_error:
        "A server error interrupted Google sign-in. Please try again.",
    };

    setError(
      messageMap[authError] || "Authentication failed. Please try again."
    );
  }, [search]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Helper with timeout + retry for cold-start resilience
      const doLogin = async (attempt: number) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const resp = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return resp;
        } catch (err) {
          clearTimeout(timeoutId);
          if (attempt < 2) return doLogin(attempt + 1);
          throw err;
        }
      };

      const response = await doLogin(0);
      const data = await response.json();

      if (!response.ok) {
        const msg =
          data.error || "Login failed. Please check your credentials.";
        setError(msg);
        if (data.code === "EMAIL_NOT_VERIFIED") {
          setShowResendVerification(true);
        }
        toast.error(msg);
        setLoading(false);
        return;
      }

      await utils.auth.me.invalidate();

      const role =
        data.user?.role ??
        data.session?.user?.user_metadata?.role ??
        "subscriber";

      if (data.requires2FA) {
        if (data.emailFailed) {
          toast.warning("Verification required", {
            description: "Could not send the code automatically. Please use Resend Code on the next screen.",
          });
          navigate("/admin/verify?emailFailed=1");
        } else {
          toast.info("Verification required", {
            description: "A verification code has been sent to your email.",
          });
          navigate("/admin/verify");
        }
        return;
      }

      toast.success("Signed in successfully", {
        description: "Welcome back. Redirecting to your dashboard.",
      });

      if (nextPath && isRoleAllowedOnPath(role, nextPath)) {
        navigate(nextPath);
      } else {
        navigate(getRoleDashboard(role));
      }
    } catch (err: any) {
      const msg =
        err?.name === "AbortError"
          ? "Request timed out. Please try again — the server may be warming up."
          : "An unexpected error occurred. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    // Clear any stale/expired tokens from localStorage so the fresh session cookie
    // from the OAuth callback is used instead of the old bearer token.
    localStorage.removeItem("sb_access_token");
    localStorage.removeItem("sb_refresh_token");
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          intent: "login",
          next: nextPath,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error("Google sign-in failed", {
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
        description: "Could not initiate Google sign-in. Please try again.",
      });
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      {/* Mobile: mx-4 to prevent overflow on 320px phones; sm+: auto margins */}
      <div className="w-full max-w-md mx-4 sm:mx-auto">
        {/* Logo & Brand */}
        <div className="text-center mb-6 sm:mb-8">
          <BrandLogo href="/" size="lg" className="justify-center mb-4" />
          <p className="text-slate-500 text-sm">
            Professional legal letters drafted and reviewed by attorneys
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl sm:text-2xl font-semibold text-center">
              Sign In
            </CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                  {showResendVerification && (
                    <div className="mt-2 pt-2 border-t border-red-200">
                      {resendSent ? (
                        <p className="text-green-700 text-xs font-medium">
                          Verification email sent! Check your inbox.
                        </p>
                      ) : (
                        <button
                          type="button"
                          disabled={resendLoading}
                          data-testid="button-resend-verification"
                          onClick={async () => {
                            setResendLoading(true);
                            try {
                              const res = await fetch(
                                "/api/auth/resend-verification",
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  credentials: "include",
                                  body: JSON.stringify({ email }),
                                }
                              );
                              const d = await res.json();
                              setResendSent(true);
                              toast.success("Verification email sent", {
                                description: d.message || "Check your inbox.",
                              });
                            } catch {
                              toast.error("Could not resend email", {
                                description: "Please try again.",
                              });
                            } finally {
                              setResendLoading(false);
                            }
                          }}
                          className="text-indigo-700 hover:underline text-xs font-medium disabled:opacity-50"
                        >
                          {resendLoading
                            ? "Sending…"
                            : "Resend verification email"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full border-slate-300 text-slate-700 hover:bg-slate-50"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
                data-testid="button-google-login"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    <span className="ml-2">Continue with Google</span>
                  </>
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="px-2 bg-white text-slate-500">Or</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={loading}
                    className="pr-10"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={loading}
                data-testid="button-login"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-slate-500">
              Don't have an account?{" "}
              <Link
                href="/signup"
                className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
                data-testid="link-signup"
              >
                Create one
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          By signing in, you agree to our{" "}
          <Link href="/terms" className="underline hover:text-slate-600" data-testid="link-terms">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-slate-600" data-testid="link-privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
