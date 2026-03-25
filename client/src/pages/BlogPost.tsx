import { Helmet } from "react-helmet-async";
import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Clock, Calendar, ArrowLeft, Share2, ChevronRight } from "lucide-react";
import BrandLogo from "@/components/shared/BrandLogo";

const CATEGORY_LABELS: Record<string, string> = {
  "demand-letters": "Demand Letters",
  "cease-and-desist": "Cease & Desist",
  "contract-disputes": "Contract Disputes",
  "document-analysis": "Document Analysis",
  "pricing-and-roi": "Pricing & ROI",
  "general": "General",
};

const CATEGORY_CTA: Record<string, { text: string; href: string }> = {
  "demand-letters": { text: "Get Your Demand Letter", href: "/" },
  "cease-and-desist": { text: "Send a Cease & Desist", href: "/" },
  "contract-disputes": { text: "Draft a Breach of Contract Letter", href: "/" },
  "document-analysis": { text: "Try the Free Document Analyzer", href: "/analyze" },
  "pricing-and-roi": { text: "View Our Plans", href: "/pricing" },
  "general": { text: "Get Your First Letter Free", href: "/" },
};

function formatDate(date: string | Date | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url: string) {
  try {
    const parsed = new URL(url, "https://example.com");
    if (["http:", "https:", "mailto:"].includes(parsed.protocol)) return url;
    return "#";
  } catch {
    return "#";
  }
}

function renderMarkdown(content: string) {
  let html = escapeHtml(content)
    .replace(/^### (.+)$/gm, '<h3 class="text-xl font-bold text-[#0c2340] mt-8 mb-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold text-[#0c2340] mt-10 mb-4">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold text-[#0c2340] mt-10 mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_m: string, text: string, url: string) =>
      `<a href="${sanitizeUrl(url)}" class="text-blue-600 hover:underline" rel="noopener noreferrer">${text}</a>`)
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-slate-700 mb-1">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-700 mb-1">$1</li>')
    .replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-blue-200 pl-4 italic text-slate-600 my-4">$1</blockquote>')
    .replace(/\n\n/g, '</p><p class="text-slate-700 leading-relaxed mb-4">');

  return '<p class="text-slate-700 leading-relaxed mb-4">' + html + "</p>";
}

export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const { data: post, isLoading, error } = trpc.blog.getBySlug.useQuery(
    { slug },
    { enabled: !!slug }
  );

  const goToLogin = () => { window.location.href = "/login"; };

  const cta = post ? (CATEGORY_CTA[post.category] ?? CATEGORY_CTA["general"]) : CATEGORY_CTA["general"];

  const handleShare = () => {
    const url = `https://www.talk-to-my-lawyer.com/blog/${slug}`;
    if (navigator.share) {
      navigator.share({ title: post?.title ?? "Blog Post", url });
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  return (
    <>
      {post && (
        <Helmet>
          <title>{post.title} — Talk to My Lawyer Blog</title>
          <meta name="description" content={post.metaDescription ?? post.excerpt} />
          <link rel="canonical" href={`https://www.talk-to-my-lawyer.com/blog/${post.slug}`} />
          <meta property="og:title" content={post.title} />
          <meta property="og:description" content={post.metaDescription ?? post.excerpt} />
          <meta property="og:type" content="article" />
          <meta property="og:url" content={`https://www.talk-to-my-lawyer.com/blog/${post.slug}`} />
          <meta property="og:image" content={post.ogImageUrl ?? "https://www.talk-to-my-lawyer.com/logo-main.png"} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={post.title} />
          <meta name="twitter:description" content={post.metaDescription ?? post.excerpt} />
          <meta name="twitter:image" content={post.ogImageUrl ?? "https://www.talk-to-my-lawyer.com/logo-main.png"} />
          <script type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": post.title,
            "description": post.metaDescription ?? post.excerpt,
            "author": { "@type": "Organization", "name": post.authorName },
            "publisher": {
              "@type": "Organization",
              "name": "Talk to My Lawyer",
              "url": "https://www.talk-to-my-lawyer.com",
            },
            "datePublished": post.publishedAt,
            "dateModified": post.updatedAt,
            "url": `https://www.talk-to-my-lawyer.com/blog/${post.slug}`,
            "mainEntityOfPage": `https://www.talk-to-my-lawyer.com/blog/${post.slug}`,
          })}</script>
        </Helmet>
      )}

      <div className="min-h-screen bg-white">
        <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 h-[64px] md:h-[72px] flex items-center justify-between">
            <BrandLogo href="/" size="lg" hideWordmarkOnMobile />
            <div className="hidden md:flex items-center gap-7">
              <Link href="/" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors">Home</Link>
              <Link href="/pricing" className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors">Pricing</Link>
              <Link href="/analyze" className="text-[13px] font-semibold text-blue-600 hover:text-blue-800 tracking-wide uppercase transition-colors">Doc Analyzer</Link>
              <Link href="/blog" className="text-[13px] font-semibold text-slate-900 tracking-wide uppercase transition-colors">Blog</Link>
              <div className="w-px h-4 bg-slate-200" />
              <button onClick={goToLogin} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors">Sign In</button>
              <button onClick={goToLogin} className="bg-[#0c2340] text-white text-[13px] font-semibold px-5 py-2 rounded-lg hover:bg-[#163a5f] transition-colors shadow-sm">Get Started</button>
            </div>
            <button onClick={goToLogin} className="md:hidden bg-[#0c2340] text-white text-[13px] font-semibold px-4 py-2 rounded-lg">Get Started</button>
          </div>
        </nav>

        <main className="pt-[88px] md:pt-[96px] pb-20">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            {isLoading ? (
              <div className="animate-pulse py-12">
                <div className="h-4 bg-slate-200 rounded w-32 mb-6" />
                <div className="h-10 bg-slate-200 rounded w-full mb-4" />
                <div className="h-10 bg-slate-200 rounded w-2/3 mb-8" />
                <div className="h-4 bg-slate-200 rounded w-48 mb-10" />
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-4 bg-slate-100 rounded w-full mb-3" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-20">
                <h2 className="text-2xl font-bold text-slate-700 mb-4" data-testid="text-post-not-found">Post Not Found</h2>
                <p className="text-slate-500 mb-6">The article you're looking for doesn't exist or has been removed.</p>
                <Link href="/blog" className="text-blue-600 hover:underline font-medium" data-testid="link-back-to-blog">
                  <ArrowLeft className="w-4 h-4 inline mr-1" />
                  Back to Blog
                </Link>
              </div>
            ) : post ? (
              <article>
                <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6" aria-label="Breadcrumb">
                  <Link href="/blog" className="hover:text-slate-600 transition-colors" data-testid="breadcrumb-blog">Blog</Link>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span className="text-blue-600 font-medium" data-testid="breadcrumb-category">{CATEGORY_LABELS[post.category] ?? post.category}</span>
                </nav>

                <h1 className="text-3xl sm:text-4xl font-bold text-[#0c2340] mb-4 leading-tight" data-testid="text-post-title">
                  {post.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">
                  <span className="font-medium text-slate-700" data-testid="text-author">{post.authorName}</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(post.publishedAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {post.readingTimeMinutes} min read
                  </span>
                  <button onClick={handleShare} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors ml-auto" data-testid="button-share">
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                  </button>
                </div>

                <div
                  className="prose prose-slate max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
                  data-testid="content-post-body"
                />

                <div className="mt-12 p-6 bg-gradient-to-r from-[#0c2340] to-[#1a3f66] rounded-xl text-white text-center">
                  <h3 className="text-xl font-bold mb-2">Ready to Take Action?</h3>
                  <p className="text-blue-100 mb-4 text-sm">Your first attorney-reviewed letter is free — no credit card required.</p>
                  <Link
                    href={cta.href}
                    className="inline-block bg-white text-[#0c2340] font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-50 transition-colors"
                    data-testid="link-cta"
                  >
                    {cta.text}
                  </Link>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100">
                  <Link href="/blog" className="text-blue-600 hover:underline font-medium text-sm" data-testid="link-back-to-blog">
                    <ArrowLeft className="w-4 h-4 inline mr-1" />
                    Back to all posts
                  </Link>
                </div>
              </article>
            ) : null}
          </div>
        </main>

        <footer className="bg-[#0c2340] text-slate-300 py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
            <BrandLogo href="/" variant="footer" size="sm" loading="lazy" />
            <div className="flex flex-wrap gap-6 text-sm">
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/faq" className="hover:text-white transition-colors">FAQ</Link>
              <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            </div>
            <div className="text-sm">&copy; {new Date().getFullYear()} Talk to My Lawyer. All rights reserved.</div>
          </div>
        </footer>
      </div>
    </>
  );
}
