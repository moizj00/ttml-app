import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Menu, X, Sparkles } from "lucide-react";
import BrandLogo from "@/components/shared/BrandLogo";

interface NavLink {
  href: string;
  label: string;
  highlight?: boolean;
  active?: boolean;
}

interface PublicNavProps {
  activeLink?: string;
}

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/analyze", label: "Doc Analyzer", highlight: true },
];

export default function PublicNav({ activeLink }: PublicNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const goToLogin = () => { window.location.href = "/login"; };
  const goToSignup = () => { window.location.href = "/signup"; };

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm" data-testid="public-nav">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 h-[64px] md:h-[72px] flex items-center justify-between">
        <BrandLogo href="/" size="lg" hideWordmarkOnMobile />
        <div className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((link) => {
            const isActive = activeLink === link.href;
            const testId = `nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`;

            if (link.highlight) {
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group relative inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-bold uppercase tracking-wide text-white overflow-hidden bg-linear-to-r from-violet-600 via-indigo-600 to-blue-600 bg-size-[200%_100%] bg-left hover:bg-right transition-[background-position,transform,box-shadow] duration-500 ease-out shadow-[0_6px_18px_-4px_rgba(99,102,241,0.55)] hover:shadow-[0_10px_28px_-6px_rgba(124,58,237,0.65)] hover:-translate-y-0.5 ${
                    isActive ? "ring-2 ring-offset-2 ring-violet-400/70 ring-offset-white" : ""
                  }`}
                  data-testid={testId}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Sparkles
                    className="w-3.5 h-3.5 drop-shadow-[0_0_6px_rgba(255,255,255,0.8)] transition-transform duration-500 group-hover:rotate-[18deg] group-hover:scale-110"
                    aria-hidden
                  />
                  <span className="relative z-10">{link.label}</span>
                  <span className="pointer-events-none absolute inset-y-0 -left-full w-1/2 skew-x-[-20deg] bg-linear-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[300%]" />
                </Link>
              );
            }

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`group relative text-[13px] font-semibold tracking-wide uppercase transition-colors duration-200 ${
                  isActive ? "text-slate-900" : "text-slate-500 hover:text-slate-900"
                }`}
                data-testid={testId}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="relative inline-block pb-1">
                  {link.label}
                  <span
                    className={`pointer-events-none absolute left-0 -bottom-0.5 h-[2px] w-full rounded-full bg-linear-to-r from-violet-500 via-indigo-500 to-blue-500 origin-left transition-transform duration-300 ease-out ${
                      isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </span>
                {isActive && (
                  <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 -bottom-2 h-1 w-1 rounded-full bg-indigo-500 shadow-[0_0_8px_2px_rgba(99,102,241,0.6)]" />
                )}
              </Link>
            );
          })}
          <div className="w-px h-4 bg-slate-200" />
          <button
            onClick={goToLogin}
            className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            data-testid="nav-signin"
          >
            Sign In
          </button>
          <button
            onClick={goToSignup}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-[13px] font-bold transition-all shadow-md shadow-blue-600/20 inline-flex items-center gap-1.5"
            data-testid="nav-cta"
          >
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          className="md:hidden p-2 text-slate-600 hover:text-slate-900"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          data-testid="nav-mobile-toggle"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 shadow-lg">
          <div className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => {
              const isActive = activeLink === link.href;
              const testId = `mobile-${link.label.toLowerCase().replace(/\s+/g, "-")}`;

              if (link.highlight) {
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex items-center justify-center gap-2 my-1 px-4 py-2.5 rounded-full text-sm font-bold uppercase tracking-wide text-white bg-linear-to-r from-violet-600 via-indigo-600 to-blue-600 shadow-md shadow-indigo-500/30"
                    data-testid={testId}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Sparkles className="w-4 h-4" aria-hidden />
                    {link.label}
                  </Link>
                );
              }

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`relative text-sm font-semibold py-2 uppercase tracking-wide transition-colors ${
                    isActive
                      ? "text-slate-900 pl-3 border-l-2 border-indigo-500"
                      : "text-slate-700 hover:text-slate-900"
                  }`}
                  data-testid={testId}
                  aria-current={isActive ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="h-px bg-slate-100 my-1" />
            <button
              onClick={goToLogin}
              className="text-sm font-semibold py-2 text-slate-700 text-left"
              data-testid="mobile-signin"
            >
              Sign In
            </button>
            <button
              onClick={goToSignup}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold w-full text-center"
              data-testid="mobile-cta"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
