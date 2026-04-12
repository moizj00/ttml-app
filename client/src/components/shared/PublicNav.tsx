import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Menu, X } from "lucide-react";
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
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[13px] font-semibold tracking-wide uppercase transition-colors ${
                  isActive
                    ? "text-slate-900"
                    : link.highlight
                    ? "text-blue-600 hover:text-blue-800"
                    : "text-slate-500 hover:text-slate-900"
                }`}
                data-testid={`nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {link.label}
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
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-semibold py-2 uppercase tracking-wide ${
                    isActive ? "text-slate-900" : "text-slate-700"
                  }`}
                  data-testid={`mobile-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
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
