import { Link } from "wouter";
import BrandLogo from "@/components/shared/BrandLogo";

interface AnalyzerNavProps {
  me: { role: string } | null | undefined;
}

export function AnalyzerNav({ me }: AnalyzerNavProps) {
  const dashboardHref =
    me?.role === "subscriber"
      ? "/dashboard"
      : me?.role === "attorney"
      ? "/attorney"
      : me?.role === "admin"
      ? "/admin"
      : "/employee";

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 h-16 flex items-center justify-between">
        <BrandLogo href="/" size="lg" hideWordmarkOnMobile />
        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/analyze"
            className="text-[13px] font-semibold text-blue-600 tracking-wide uppercase"
            data-testid="nav-analyze"
          >
            Document Analyzer
          </Link>
          <Link
            href="/pricing"
            className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors"
            data-testid="nav-pricing"
          >
            Pricing
          </Link>
          <div className="w-px h-4 bg-slate-200" />
          {me ? (
            <Link
              href={dashboardHref}
              className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
              data-testid="nav-dashboard"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
              data-testid="nav-signin"
            >
              Sign In
            </Link>
          )}
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-[13px] font-bold transition-all shadow-md shadow-blue-600/20"
            data-testid="nav-cta"
          >
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
