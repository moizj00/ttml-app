import { Helmet } from "react-helmet-async";
import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Clock,
  Calendar,
  ArrowLeft,
  Share2,
  ArrowRight,
  FileText,
  Shield,
} from "lucide-react";
import Footer from "@/components/shared/Footer";
import PublicNav from "@/components/shared/PublicNav";
import PublicBreadcrumb from "@/components/shared/PublicBreadcrumb";
import BlogNewsletter from "@/components/BlogNewsletter";
import { SERVICES, CATEGORY_TO_SERVICES } from "./services/serviceData";
import type { ServiceData } from "./services/serviceData";

const CATEGORY_LABELS: Record<string, string> = {
  "demand-letters": "Demand Letters",
  "cease-and-desist": "Cease & Desist",
  "contract-disputes": "Contract Disputes",
  "eviction-notices": "Eviction Notices",
  "employment-disputes": "Employment",
  "consumer-complaints": "Consumer Rights",
  "pre-litigation-settlement": "Pre-Litigation",
  "debt-collection": "Debt Collection",
  "estate-probate": "Estate & Probate",
  "landlord-tenant": "Landlord-Tenant",
  "insurance-disputes": "Insurance Disputes",
  "personal-injury": "Personal Injury",
  "intellectual-property": "IP & Trademark",
  "family-law": "Family Law",
  "neighbor-hoa": "Neighbor & HOA",
  "document-analysis": "Document Analysis",
  "pricing-and-roi": "Pricing & ROI",
  general: "General",
};

const CATEGORY_CTA: Record<string, { text: string; href: string }> = {
  "demand-letters": { text: "Get Your Demand Letter", href: "/services/demand-letter" },
  "cease-and-desist": { text: "Send a Cease & Desist", href: "/services/cease-and-desist" },
  "contract-disputes": {
    text: "Draft a Breach of Contract Letter",
    href: "/services/breach-of-contract-letter",
  },
  "eviction-notices": { text: "Start the Eviction Process", href: "/services/eviction-notice" },
  "employment-disputes": {
    text: "File an Employment Dispute Letter",
    href: "/services/employment-dispute-letter",
  },
  "landlord-tenant": {
    text: "Get Your Security Deposit Back",
    href: "/services/security-deposit-letter",
  },
  "personal-injury": {
    text: "Send a Personal Injury Demand Letter",
    href: "/services/personal-injury-demand-letter",
  },
  "intellectual-property": {
    text: "Protect Your IP Rights",
    href: "/services/intellectual-property-infringement-letter",
  },
  "document-analysis": { text: "Try the Free Document Analyzer", href: "/analyze" },
  "pricing-and-roi": { text: "View Our Plans", href: "/pricing" },
  general: { text: "Get Your First Letter Free", href: "/" },
};

function formatDate(date: string | Date | null) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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

// ─── Markdown → HTML ──────────────────────────────────────────────────────────
// Converts the subset of Markdown the content agent produces into safe HTML.
// Improvements over the previous version:
//   • List items are properly wrapped in <ul> / <ol> containers
//   • <p> wrapping no longer swallows headings or list blocks
//   • Nested bold inside links works correctly
//   • Blockquote supported
function renderMarkdown(content: string): string {
  // 1. Escape HTML entities first so we can safely inject class attributes
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  // 2. Split into lines and process block-level elements
  const lines = content.split("\n");
  const blocks: string[] = [];
  let i = 0;

  const inlineFormat = (text: string): string =>
    text
      // bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // links  — run after escaping
      .replace(/\[(.+?)\]\((.+?)\)/g, (_m, linkText, url) => {
        const safe = sanitizeUrl(url);
        return `<a href="${safe}" class="text-blue-600 hover:underline" rel="noopener noreferrer">${linkText}</a>`;
      })
      // inline code
      .replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1 rounded text-sm font-mono">$1</code>');

  while (i < lines.length) {
    const raw = lines[i];
    const line = escape(raw.trimEnd());

    // Headings
    if (/^#{3} /.test(raw)) {
      blocks.push(
        `<h3 class="text-xl font-bold text-[#0c2340] mt-8 mb-3">${inlineFormat(escape(raw.slice(4)))}</h3>`
      );
      i++;
      continue;
    }
    if (/^#{2} /.test(raw)) {
      blocks.push(
        `<h2 class="text-2xl font-bold text-[#0c2340] mt-10 mb-4">${inlineFormat(escape(raw.slice(3)))}</h2>`
      );
      i++;
      continue;
    }
    if (/^#{1} /.test(raw)) {
      // H1 is the article title — skip duplicate from content body
      i++;
      continue;
    }

    // Unordered list — collect consecutive items
    if (/^[-*] /.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(
          `<li class="ml-5 list-disc text-slate-700 mb-1.5">${inlineFormat(escape(lines[i].slice(2)))}</li>`
        );
        i++;
      }
      blocks.push(`<ul class="my-4 space-y-1">${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        const text = lines[i].replace(/^\d+\. /, "");
        items.push(
          `<li class="ml-5 list-decimal text-slate-700 mb-1.5">${inlineFormat(escape(text))}</li>`
        );
        i++;
      }
      blocks.push(`<ol class="my-4 space-y-1">${items.join("")}</ol>`);
      continue;
    }

    // Blockquote
    if (/^> /.test(raw)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^> /.test(lines[i])) {
        quoteLines.push(inlineFormat(escape(lines[i].slice(2))));
        i++;
      }
      blocks.push(
        `<blockquote class="border-l-4 border-blue-200 pl-4 italic text-slate-600 my-4">${quoteLines.join(" ")}</blockquote>`
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(raw.trim())) {
      blocks.push(`<hr class="my-8 border-slate-200" />`);
      i++;
      continue;
    }

    // Empty line → paragraph break (skip)
    if (raw.trim() === "") {
      i++;
      continue;
    }

    // Regular paragraph — collect until blank line
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6} /.test(lines[i]) &&
      !/^[-*] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      !/^> /.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(inlineFormat(escape(lines[i])));
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(
        `<p class="text-slate-700 leading-relaxed mb-4">${paraLines.join(" ")}</p>`
      );
    }
  }

  return blocks.join("\n");
}

// ─── FAQ Schema Extractor ─────────────────────────────────────────────────────
// Lifts H2 sections from post content into schema.org/FAQPage structured data
// so search engines and AI answer engines can cite specific questions directly.
function extractFaqSchema(
  content: string,
  postUrl: string
): object | null {
  const sections: { question: string; answer: string }[] = [];
  const lines = content.split("\n");
  let currentQuestion: string | null = null;
  const answerLines: string[] = [];

  for (const line of lines) {
    if (/^## /.test(line)) {
      if (currentQuestion && answerLines.length > 0) {
        const answer = answerLines
          .join(" ")
          .replace(/\*\*/g, "")
          .replace(/\*/g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .trim()
          .slice(0, 500);
        if (answer.length > 20) sections.push({ question: currentQuestion, answer });
      }
      currentQuestion = line.slice(3).trim();
      answerLines.length = 0;
    } else if (currentQuestion && line.trim() !== "" && !/^#/.test(line)) {
      answerLines.push(line.replace(/^[-*] /, "").trim());
    }
  }
  // flush last section
  if (currentQuestion && answerLines.length > 0) {
    const answer = answerLines
      .join(" ")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim()
      .slice(0, 500);
    if (answer.length > 20) sections.push({ question: currentQuestion, answer });
  }

  if (sections.length < 2) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": sections.map(({ question, answer }) => ({
      "@type": "Question",
      "name": question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": answer,
        "url": postUrl,
      },
    })),
  };
}

// ─── Quick Answer Detector ────────────────────────────────────────────────────
// If the first non-heading paragraph is short (≤300 chars), surface it as
// a styled callout box — this is the format AI citation engines prefer.
function extractQuickAnswer(content: string): string | null {
  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.trim() || /^#{1,6} /.test(line) || /^[-*>]/.test(line)) continue;
    const text = line.replace(/\*\*/g, "").replace(/\*/g, "").trim();
    if (text.length > 20 && text.length <= 300) return text;
    break;
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const { data: post, isLoading, error } = trpc.blog.getBySlug.useQuery(
    { slug },
    { enabled: !!slug }
  );

  const cta = post
    ? (CATEGORY_CTA[post.category] ?? CATEGORY_CTA["general"])
    : CATEGORY_CTA["general"];

  const postUrl = `https://www.talk-to-my-lawyer.com/blog/${slug}`;

  const faqSchema = post ? extractFaqSchema(post.content, postUrl) : null;
  const quickAnswer = post ? extractQuickAnswer(post.content) : null;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: post?.title ?? "Blog Post", url: postUrl });
    } else {
      navigator.clipboard.writeText(postUrl);
    }
  };

  return (
    <>
      {post && (
        <Helmet>
          <title>{post.title} — Talk to My Lawyer Blog</title>
          <meta name="description" content={post.metaDescription ?? post.excerpt} />
          <link rel="canonical" href={postUrl} />

          {/* Open Graph */}
          <meta property="og:title" content={post.title} />
          <meta property="og:description" content={post.metaDescription ?? post.excerpt} />
          <meta property="og:type" content="article" />
          <meta property="og:url" content={postUrl} />
          <meta property="og:image" content={post.ogImageUrl ?? "https://www.talk-to-my-lawyer.com/logo-main.png"} />
          <meta property="article:published_time" content={post.publishedAt?.toString() ?? ""} />
          <meta property="article:modified_time" content={(post.updatedAt ?? post.publishedAt)?.toString() ?? ""} />
          <meta property="article:section" content={CATEGORY_LABELS[post.category] ?? "Legal"} />

          {/* Twitter */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={post.title} />
          <meta name="twitter:description" content={post.metaDescription ?? post.excerpt} />
          <meta name="twitter:image" content={post.ogImageUrl ?? "https://www.talk-to-my-lawyer.com/logo-main.png"} />

          {/* Article JSON-LD */}
          <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Article",
              headline: post.title,
              description: post.metaDescription ?? post.excerpt,
              author: {
                "@type": "Organization",
                name: "Talk to My Lawyer Legal Team",
                url: "https://www.talk-to-my-lawyer.com",
              },
              publisher: {
                "@type": "Organization",
                name: "Talk to My Lawyer",
                url: "https://www.talk-to-my-lawyer.com",
                logo: {
                  "@type": "ImageObject",
                  url: "https://www.talk-to-my-lawyer.com/logo-main.png",
                },
              },
              datePublished: post.publishedAt,
              dateModified: post.updatedAt ?? post.publishedAt,
              url: postUrl,
              mainEntityOfPage: postUrl,
              keywords: CATEGORY_LABELS[post.category] ?? "legal",
              about: { "@type": "Thing", name: "Legal Letters" },
              reviewedBy: {
                "@type": "Organization",
                name: "Licensed California Attorneys",
              },
            })}
          </script>

          {/* Breadcrumb JSON-LD */}
          <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://www.talk-to-my-lawyer.com/" },
                { "@type": "ListItem", position: 2, name: "Blog", item: "https://www.talk-to-my-lawyer.com/blog" },
                { "@type": "ListItem", position: 3, name: post.title, item: postUrl },
              ],
            })}
          </script>

          {/* FAQ JSON-LD (when extractable) — improves AI citation pickup */}
          {faqSchema && (
            <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
          )}
        </Helmet>
      )}

      <div className="min-h-screen bg-white">
        <PublicNav activeLink="/blog" />
        <PublicBreadcrumb
          items={[
            { label: "Blog", href: "/blog" },
            ...(post ? [{ label: post.title }] : []),
          ]}
        />

        <main className="pb-20">
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
                <h2 className="text-2xl font-bold text-slate-700 mb-4" data-testid="text-post-not-found">
                  Post Not Found
                </h2>
                <p className="text-slate-500 mb-6">
                  The article you're looking for doesn't exist or has been removed.
                </p>
                <Link href="/blog" className="text-blue-600 hover:underline font-medium" data-testid="link-back-to-blog">
                  <ArrowLeft className="w-4 h-4 inline mr-1" />
                  Back to Blog
                </Link>
              </div>
            ) : post ? (
              <article>
                {/* Category badge */}
                <div className="mb-4">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                    {CATEGORY_LABELS[post.category] ?? post.category}
                  </span>
                </div>

                <h1
                  className="text-3xl sm:text-4xl font-bold text-[#0c2340] mb-4 leading-tight"
                  data-testid="text-post-title"
                >
                  {post.title}
                </h1>

                {/* Byline */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mb-8 pb-8 border-b border-slate-100">
                  <div className="flex items-center gap-3" data-testid="text-author">
                    <div className="w-9 h-9 rounded-full bg-[#0c2340] flex items-center justify-center flex-shrink-0">
                      <Shield className="w-4 h-4 text-blue-300" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">
                        Talk to My Lawyer Legal Team
                      </div>
                      <div className="text-xs text-slate-500">Reviewed by licensed attorneys</div>
                    </div>
                  </div>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(post.publishedAt)}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400" data-testid="text-last-updated">
                    Last updated: {formatDate(post.updatedAt || post.publishedAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {post.readingTimeMinutes} min read
                  </span>
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors ml-auto"
                    data-testid="button-share"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                  </button>
                </div>

                {/* Quick Answer callout — AI citation–optimised summary */}
                {quickAnswer && (
                  <div className="mb-8 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
                      Quick Answer
                    </p>
                    <p className="text-slate-800 text-sm leading-relaxed">{quickAnswer}</p>
                  </div>
                )}

                {/* Body */}
                <div
                  className="prose prose-slate max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
                  data-testid="content-post-body"
                />

                {/* CTA block */}
                <div className="mt-12 p-6 bg-gradient-to-r from-[#0c2340] to-[#1a3f66] rounded-xl text-white text-center">
                  <h3 className="text-xl font-bold mb-2">Ready to Take Action?</h3>
                  <p className="text-blue-100 mb-4 text-sm">
                    Your first attorney-reviewed letter is free — no credit card required.
                  </p>
                  <Link
                    href={cta.href}
                    className="inline-block bg-white text-[#0c2340] font-semibold px-6 py-2.5 rounded-lg hover:bg-blue-50 transition-colors"
                    data-testid="link-cta"
                  >
                    {cta.text}
                  </Link>
                </div>

                <BlogNewsletter />

                {/* Related Services */}
                {(() => {
                  const related: ServiceData[] =
                    CATEGORY_TO_SERVICES[post.category] ?? [];
                  if (related.length === 0) return null;
                  return (
                    <div
                      className="mt-12 p-6 bg-slate-50 rounded-xl border border-slate-200"
                      data-testid="related-services"
                    >
                      <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Related Services
                      </h3>
                      <div className="space-y-3">
                        {related.map((s) => (
                          <Link
                            key={s.slug}
                            href={`/services/${s.slug}`}
                            className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 hover:border-blue-200 hover:shadow-md transition-all group"
                            data-testid={`related-service-${s.slug}`}
                          >
                            <div>
                              <div className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors text-sm">
                                {s.title}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {s.metaDescription.slice(0, 80)}...
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-blue-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-8 pt-6 border-t border-slate-100">
                  <Link
                    href="/blog"
                    className="text-blue-600 hover:underline font-medium text-sm"
                    data-testid="link-back-to-blog"
                  >
                    <ArrowLeft className="w-4 h-4 inline mr-1" />
                    Back to all posts
                  </Link>
                </div>
              </article>
            ) : null}
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
