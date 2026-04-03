import { useState } from "react";
import { Mail, ArrowRight } from "lucide-react";

export default function BlogNewsletter() {
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
        body: JSON.stringify({ email: email.trim(), source: "blog" }),
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

  if (status === "success") {
    return (
      <div className="mt-12 p-8 bg-blue-50 rounded-xl border border-blue-100 text-center" data-testid="blog-newsletter-success">
        <Mail className="w-8 h-8 text-blue-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-[#0c2340] mb-1">You're subscribed!</h3>
        <p className="text-sm text-slate-600">We'll send you legal insights and platform updates — no spam.</p>
      </div>
    );
  }

  return (
    <div className="mt-12 p-8 bg-slate-50 rounded-xl border border-slate-200" data-testid="blog-newsletter">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <Mail className="w-6 h-6 text-blue-600" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-[#0c2340] mb-1">Free Legal Tips in Your Inbox</h3>
          <p className="text-sm text-slate-600">Get expert insights on legal letters, dispute resolution, and protecting your rights — delivered weekly.</p>
        </div>
      </div>
      <form onSubmit={handleSubscribe} className="mt-5 flex flex-col sm:flex-row gap-3" data-testid="blog-newsletter-form">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          required
          className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          data-testid="input-blog-newsletter-email"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="bg-[#0c2340] hover:bg-[#163a5f] disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          data-testid="button-blog-newsletter-submit"
        >
          Subscribe <ArrowRight className="w-4 h-4" />
        </button>
      </form>
      {status === "error" && (
        <p className="text-red-500 text-xs mt-2" data-testid="blog-newsletter-error">Something went wrong. Please try again.</p>
      )}
    </div>
  );
}
