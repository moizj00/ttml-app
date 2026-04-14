/**
 * Client Portal Page — /portal/:token
 *
 * Public, no login required.
 * Shown to the letter recipient so they can read the letter and
 * optionally respond by submitting their own request via TTML.
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { FileText, ArrowRight, Clock, AlertTriangle, CheckCircle, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PublicNav from "@/components/shared/PublicNav";
import PublicBreadcrumb from "@/components/shared/PublicBreadcrumb";

interface PortalData {
  letterRequestId: number;
  recipientName: string | null;
  recipientEmail: string | null;
  viewedAt: string | null;
  expiresAt: string;
  content: string;
  versionType: string;
}

type PortalState =
  | { status: "loading" }
  | { status: "error"; message: string; expired?: boolean }
  | { status: "loaded"; data: PortalData };

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PortalState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "No token provided." });
      return;
    }

    fetch(`/api/portal/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setState({
            status: "error",
            message: json.error ?? "This link is invalid or has expired.",
            expired: json.expired ?? false,
          });
        } else {
          setState({ status: "loaded", data: json });
        }
      })
      .catch(() => {
        setState({ status: "error", message: "Could not load letter. Please try again." });
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 font-['Inter'] text-slate-900">
      <Helmet>
        <title>View Your Letter | Talk to My Lawyer</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <PublicNav activeLink="" />
      <PublicBreadcrumb items={[{ label: "Your Letter" }]} />

      <main className="pb-16 px-4 max-w-3xl mx-auto">

        {state.status === "loading" && (
          <div className="mt-16 flex flex-col items-center gap-4 text-muted-foreground">
            <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            <p className="text-sm">Loading your letter...</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="mt-12 bg-white rounded-2xl border border-red-200 p-8 text-center shadow-sm">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 mb-4">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Link Unavailable</h1>
            <p className="text-slate-600 text-sm mb-6 max-w-sm mx-auto">
              {state.message}
              {state.expired && (
                <span className="block mt-1 text-slate-500">
                  This link expires after 7 days for your security.
                </span>
              )}
            </p>
            <Link href="/">
              <Button variant="outline">Go to Talk to My Lawyer</Button>
            </Link>
          </div>
        )}

        {state.status === "loaded" && (
          <div className="mt-10 space-y-6">
            {/* Header card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <Scale className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Attorney-Reviewed Legal Letter</h1>
                  <p className="text-xs text-slate-500">Delivered via Talk to My Lawyer</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5 text-xs">
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  Attorney Reviewed
                </Badge>
                {state.data.recipientName && (
                  <Badge variant="outline" className="text-xs">
                    For: {state.data.recipientName}
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1.5 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  Expires {new Date(state.data.expiresAt).toLocaleDateString()}
                </Badge>
              </div>
            </div>

            {/* Letter content */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <FileText className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Letter Content</span>
              </div>
              <div className="px-6 py-6">
                <pre className="font-['Inter'] text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {state.data.content}
                </pre>
              </div>
            </div>

            {/* CTA: respond via TTML */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-md">
              <h2 className="text-base font-bold mb-1">Need to respond to this letter?</h2>
              <p className="text-blue-100 text-sm mb-4 leading-relaxed">
                Talk to My Lawyer can help you draft and send an attorney-reviewed response. Our platform
                connects you with licensed attorneys for a fraction of traditional legal costs.
              </p>
              <Link href={`/signup?ref=portal&token=${encodeURIComponent(token ?? "")}`}>
                <Button
                  className="bg-white text-blue-700 hover:bg-blue-50 font-semibold gap-2 shadow-sm"
                  size="sm"
                >
                  Get Attorney Help
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <p className="text-blue-200 text-xs mt-3">
                Already have an account?{" "}
                <Link
                  href={`/submit?ref=portal&token=${encodeURIComponent(token ?? "")}`}
                  className="underline underline-offset-2"
                >
                  Submit your response letter
                </Link>
              </p>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              This letter was generated with AI assistance and reviewed by a licensed California attorney.
              This portal link is private and expires automatically. It is not legal advice.
            </p>
          </div>
        )}

      </main>
    </div>
  );
}
