import { useState } from "react";
import { Link } from "wouter";
import { Mail, Send, Linkedin, Twitter } from "lucide-react";
import BrandLogo from "./BrandLogo";

export default function Footer() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "footer" }),
      });
      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <footer className="bg-[#0c2340] text-slate-300" data-testid="site-footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8 mb-10">
          <div className="md:col-span-1">
            <BrandLogo href="/" variant="dark" size="sm" loading="lazy" />
            <p className="mt-4 text-sm text-slate-400 leading-relaxed">
              Attorney-reviewed legal letters drafted around California legal language.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <a
                href="https://www.linkedin.com/company/talk-to-my-lawyer"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
                aria-label="LinkedIn"
                data-testid="social-linkedin"
              >
                <Linkedin className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://x.com/talktomylawyer"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
                aria-label="X (Twitter)"
                data-testid="social-x"
              >
                <Twitter className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold uppercase tracking-wider mb-4">Services</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/services/demand-letter" className="hover:text-white transition-colors" data-testid="footer-link-demand">Demand Letters</Link></li>
              <li><Link href="/services/cease-and-desist" className="hover:text-white transition-colors" data-testid="footer-link-cnd">Cease & Desist</Link></li>
              <li><Link href="/services/breach-of-contract-letter" className="hover:text-white transition-colors" data-testid="footer-link-breach">Breach of Contract</Link></li>
              <li><Link href="/services/security-deposit-letter" className="hover:text-white transition-colors" data-testid="footer-link-deposit">Security Deposit</Link></li>
              <li><Link href="/services/employment-dispute-letter" className="hover:text-white transition-colors" data-testid="footer-link-employment">Employment Disputes</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold uppercase tracking-wider mb-4">Company</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/pricing" className="hover:text-white transition-colors" data-testid="footer-link-pricing">Pricing</Link></li>
              <li><Link href="/blog" className="hover:text-white transition-colors" data-testid="footer-link-blog">Blog</Link></li>
              <li><Link href="/faq" className="hover:text-white transition-colors" data-testid="footer-link-faq">FAQ</Link></li>
              <li><Link href="/analyze" className="hover:text-white transition-colors" data-testid="footer-link-analyze">Document Analyzer</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors" data-testid="footer-link-terms">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-white transition-colors" data-testid="footer-link-privacy">Privacy Policy</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold uppercase tracking-wider mb-4">Stay Updated</h4>
            <p className="text-sm text-slate-400 mb-3">Legal insights and platform updates — no spam.</p>
            {status === "success" ? (
              <div className="flex items-center gap-2 text-sm text-green-400" data-testid="newsletter-success">
                <Mail className="w-4 h-4" />
                You're subscribed!
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex gap-2" data-testid="newsletter-form">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  required
                  className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="input-newsletter-email"
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition-colors flex-shrink-0"
                  data-testid="button-newsletter-submit"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            )}
            {status === "error" && (
              <p className="text-red-400 text-xs mt-2" data-testid="newsletter-error">Something went wrong. Please try again.</p>
            )}
          </div>
        </div>

        <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} Talk to My Lawyer. All rights reserved.
          </div>
          <div className="text-xs text-slate-600">
            This is a drafting tool — not legal advice. Review all drafts with a licensed attorney.
          </div>
        </div>
      </div>
    </footer>
  );
}
