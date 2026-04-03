import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Clock, Calendar, ArrowRight, BookOpen } from "lucide-react";
import BrandLogo from "@/components/shared/BrandLogo";
import Footer from "@/components/shared/Footer";

const CATEGORIES = [
  { value: "", label: "All Posts" },
  { value: "demand-letters", label: "Demand Letters" },
  { value: "cease-and-desist", label: "Cease & Desist" },
  { value: "contract-disputes", label: "Contract Disputes" },
  { value: "document-analysis", label: "Document Analysis" },
  { value: "pricing-and-roi", label: "Pricing & ROI" },
  { value: "general", label: "General" },
];

const CATEGORY_LABELS: Record<string, string> = {
  "demand-letters": "Demand Letters",
  "cease-and-desist": "Cease & Desist",
  "contract-disputes": "Contract Disputes",
  "document-analysis": "Document Analysis",
  "pricing-and-roi": "Pricing & ROI",
  "general": "General",
};

function formatDate(date: string | Date | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogIndex() {
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const limit = 12;

  const { data, isLoading } = trpc.blog.list.useQuery({
    category: category || undefined,
    limit,
    offset: page * limit,
  });

  const posts = data?.posts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const goToLogin = () => { window.location.href = "/login"; };

  return (
    <>
      <Helmet>
        <title>Legal Blog — Talk to My Lawyer | Expert Legal Insights</title>
        <meta name="description" content="Expert legal insights on demand letters, cease and desist orders, contract disputes, and more. Free resources from licensed attorneys." />
        <link rel="canonical" href="https://www.talk-to-my-lawyer.com/blog" />
        <meta property="og:title" content="Legal Blog — Talk to My Lawyer" />
        <meta property="og:description" content="Expert legal insights on demand letters, cease and desist orders, contract disputes, and more." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.talk-to-my-lawyer.com/blog" />
        <meta property="og:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Legal Blog — Talk to My Lawyer" />
        <meta name="twitter:description" content="Expert legal insights on demand letters, cease and desist orders, contract disputes, and more." />
        <meta name="twitter:image" content="https://www.talk-to-my-lawyer.com/logo-main.png" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Blog",
          "name": "Talk to My Lawyer Legal Blog",
          "description": "Expert legal insights on demand letters, cease and desist orders, contract disputes, and more.",
          "url": "https://www.talk-to-my-lawyer.com/blog",
          "publisher": {
            "@type": "Organization",
            "name": "Talk to My Lawyer",
            "url": "https://www.talk-to-my-lawyer.com",
          },
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-white">
        <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 h-[64px] md:h-[72px] flex items-center justify-between">
            <BrandLogo href="/" size="lg" hideWordmarkOnMobile />
            <div className="hidden md:flex items-center gap-7">
              <Link href="/" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors" data-testid="nav-home">Home</Link>
              <Link href="/services" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors" data-testid="nav-services">Services</Link>
              <Link href="/pricing" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors" data-testid="nav-pricing">Pricing</Link>
              <Link href="/analyze" className="text-[13px] font-semibold text-blue-600 hover:text-blue-800 tracking-wide uppercase transition-colors" data-testid="nav-analyze">Doc Analyzer</Link>
              <Link href="/blog" className="text-[13px] font-semibold text-slate-900 tracking-wide uppercase transition-colors" data-testid="nav-blog">Blog</Link>
              <div className="w-px h-4 bg-slate-200" />
              <button onClick={goToLogin} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors" data-testid="nav-signin">Sign In</button>
              <button onClick={goToLogin} className="bg-[#0c2340] text-white text-[13px] font-semibold px-5 py-2 rounded-lg hover:bg-[#163a5f] transition-colors shadow-sm" data-testid="nav-getstarted">Get Started</button>
            </div>
            <button onClick={goToLogin} className="md:hidden bg-[#0c2340] text-white text-[13px] font-semibold px-4 py-2 rounded-lg" data-testid="nav-mobile-getstarted">Get Started</button>
          </div>
        </nav>

        <main className="pt-[88px] md:pt-[96px] pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
            <header className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-medium mb-4">
                <BookOpen className="w-4 h-4" />
                Legal Insights
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0c2340] mb-4" data-testid="text-blog-title">
                Legal Blog
              </h1>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                Expert insights on legal letters, dispute resolution, and protecting your rights — written in plain English.
              </p>
            </header>

            <div className="flex flex-wrap justify-center gap-2 mb-10">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => { setCategory(cat.value); setPage(0); }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    category === cat.value
                      ? "bg-[#0c2340] text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  data-testid={`filter-${cat.value || "all"}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-6 animate-pulse">
                    <div className="h-4 bg-slate-200 rounded w-20 mb-4" />
                    <div className="h-6 bg-slate-200 rounded w-full mb-2" />
                    <div className="h-6 bg-slate-200 rounded w-3/4 mb-4" />
                    <div className="h-4 bg-slate-200 rounded w-full mb-2" />
                    <div className="h-4 bg-slate-200 rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-20">
                <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-700 mb-2" data-testid="text-no-posts">No posts yet</h2>
                <p className="text-slate-500">Check back soon for expert legal insights.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {posts.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/blog/${post.slug}`}
                      className="group bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg hover:border-blue-200 transition-all duration-200 hover:-translate-y-1"
                      data-testid={`card-post-${post.slug}`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700" data-testid={`badge-category-${post.slug}`}>
                          {CATEGORY_LABELS[post.category] ?? post.category}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-[#0c2340] mb-2 group-hover:text-blue-700 transition-colors line-clamp-2">
                        {post.title}
                      </h2>
                      <p className="text-sm text-slate-600 mb-4 line-clamp-3">
                        {post.excerpt}
                      </p>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(post.publishedAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {post.readingTimeMinutes} min read
                          </span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-10">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      data-testid="button-prev-page"
                    >
                      Previous
                    </button>
                    <span className="px-4 py-2 text-sm text-slate-500">
                      Page {page + 1} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      data-testid="button-next-page"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
