const SITE_ORIGIN = "https://www.talk-to-my-lawyer.com";
const DEFAULT_IMAGE = `${SITE_ORIGIN}/logo-main.png`;

export interface SeoBlogPost {
  slug?: string;
  title: string;
  excerpt: string | null;
  content?: string | null;
  metaDescription?: string | null;
  ogImageUrl?: string | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface SeoBlogListPost {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface RouteSeo {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}

export interface SpaRouteResolution {
  pathname: string;
  knownRoute: boolean;
  statusCode: 200 | 404;
  seo: RouteSeo;
  fallbackHtml?: string;
}

export interface ResolveSpaRouteOptions {
  getBlogPost?: (slug: string) => Promise<SeoBlogPost | null>;
  getBlogPosts?: () => Promise<{ posts: SeoBlogListPost[]; total: number }>;
}

const INDEX_ROBOTS = "index, follow, max-image-preview:large";
const NOINDEX_ROBOTS = "noindex, nofollow";

const PUBLIC_ROUTE_SEO: Record<string, Omit<RouteSeo, "canonical">> = {
  "/": {
    title:
      "Attorney-Drafted Legal Letters - Demand Letters & Cease and Desist | Talk to My Lawyer",
    description:
      "Get attorney-drafted legal letters in minutes - flat fee, no hourly billing. Demand letters, cease and desist, breach of contract, and more. Your first letter is completely free.",
    robots: INDEX_ROBOTS,
    ogTitle: "Talk to My Lawyer - Professional Legal Letters",
    ogDescription:
      "Get professional, attorney-reviewed legal letters in minutes. Your first letter is free.",
    ogType: "website",
  },
  "/pricing": {
    title:
      "Legal Letter Pricing - Single, Monthly & Yearly Plans | Talk to My Lawyer",
    description:
      "Transparent pricing for attorney-reviewed legal letters. Single, monthly, and yearly plans available. All plans include attorney review and PDF delivery.",
    robots: INDEX_ROBOTS,
    ogTitle: "Legal Letter Pricing Plans | Talk to My Lawyer",
    ogDescription:
      "Choose the right plan for your legal needs. Attorney review is included in every plan.",
    ogType: "website",
  },
  "/analyze": {
    title:
      "Free Legal Document Analyzer - Instant Risk Analysis | Talk to My Lawyer",
    description:
      "Upload any legal document and get instant automated analysis. Identifies risks, flags important clauses, and recommends attorney-reviewed response letters.",
    robots: INDEX_ROBOTS,
    ogTitle: "Free Legal Document Analyzer | Talk to My Lawyer",
    ogDescription:
      "Instantly analyze legal documents online and get a path to an attorney-reviewed response letter.",
    ogType: "website",
  },
  "/faq": {
    title:
      "Frequently Asked Questions - Legal Letter Service | Talk to My Lawyer",
    description:
      "Get answers to common questions about our attorney-reviewed legal letter service. Pricing, process, legal validity, attorney review, and more.",
    robots: INDEX_ROBOTS,
    ogTitle: "FAQ - Legal Letter Service | Talk to My Lawyer",
    ogDescription:
      "Answers to common questions about attorney-reviewed legal letters, pricing, and how our service works.",
    ogType: "website",
  },
  "/terms": {
    title: "Terms of Service | Talk to My Lawyer",
    description:
      "Read the Terms of Service for Talk to My Lawyer. Understand your rights and obligations when using our professional attorney-reviewed legal letter service.",
    robots: INDEX_ROBOTS,
    ogTitle: "Terms of Service | Talk to My Lawyer",
    ogDescription:
      "Terms of Service for Talk to My Lawyer - professional attorney-reviewed legal letter service.",
    ogType: "website",
  },
  "/privacy": {
    title: "Privacy Policy | Talk to My Lawyer",
    description:
      "Read the Privacy Policy for Talk to My Lawyer. Learn how we collect, use, and protect your personal information when you use our attorney-reviewed legal letter service.",
    robots: INDEX_ROBOTS,
    ogTitle: "Privacy Policy | Talk to My Lawyer",
    ogDescription:
      "Privacy Policy for Talk to My Lawyer - how we collect, use, and protect your personal information.",
    ogType: "website",
  },
  "/blog": {
    title: "Legal Blog - Talk to My Lawyer | Expert Legal Insights",
    description:
      "Expert legal insights on demand letters, cease and desist orders, contract disputes, and more. Free resources from licensed attorneys.",
    robots: INDEX_ROBOTS,
    ogTitle: "Legal Blog - Talk to My Lawyer",
    ogDescription:
      "Expert legal insights on demand letters, cease and desist orders, contract disputes, and more.",
    ogType: "website",
  },
  "/services": {
    title: "Legal Letter Services - Attorney-Reviewed | Talk to My Lawyer",
    description:
      "Professional attorney-reviewed legal letters: demand letters, cease and desist, security deposit recovery, breach of contract, and employment disputes.",
    robots: INDEX_ROBOTS,
    ogTitle: "Legal Letter Services - Talk to My Lawyer",
    ogDescription:
      "Professional attorney-reviewed legal letters for common disputes.",
    ogType: "website",
  },
};

const SERVICE_ROUTE_SEO: Record<string, Omit<RouteSeo, "canonical">> = {
  "demand-letter": {
    title: "Demand Letter Service - Attorney-Reviewed | Talk to My Lawyer",
    description:
      "Get a professional demand letter drafted and reviewed by a licensed attorney. Starting at $299. Delivered in minutes, not weeks.",
    robots: INDEX_ROBOTS,
    ogType: "website",
  },
  "cease-and-desist": {
    title: "Cease & Desist Letter Service | Talk to My Lawyer",
    description:
      "Send a professional cease and desist letter to stop harassment, IP theft, or defamation. Attorney-reviewed, starting at $299.",
    robots: INDEX_ROBOTS,
    ogType: "website",
  },
  "security-deposit-letter": {
    title: "Security Deposit Demand Letter | Talk to My Lawyer",
    description:
      "Get your security deposit back with a professional demand letter. Attorney-reviewed, California-focused. Starting at $299.",
    robots: INDEX_ROBOTS,
    ogType: "website",
  },
  "breach-of-contract-letter": {
    title: "Breach of Contract Letter | Talk to My Lawyer",
    description:
      "Enforce your agreement with a professional breach of contract letter. Attorney-reviewed, California-focused. Starting at $299.",
    robots: INDEX_ROBOTS,
    ogType: "website",
  },
  "employment-dispute-letter": {
    title: "Employment Dispute Letter | Talk to My Lawyer",
    description:
      "Protect your workplace rights with a professional employment dispute letter. Attorney-reviewed, California-focused. Starting at $299.",
    robots: INDEX_ROBOTS,
    ogType: "website",
  },
  "personal-injury-demand-letter": {
    title: "Personal Injury Demand Letter | Talk to My Lawyer",
    description:
      "Send a professional personal injury demand letter to recover damages for medical bills, lost wages, and pain and suffering. Attorney-reviewed, California-focused.",
    robots: INDEX_ROBOTS,
    ogType: "website",
  },
  "landlord-harassment-cease-desist": {
    title: "Landlord Harassment Cease & Desist Letter | Talk to My Lawyer",
    description:
      "Stop landlord harassment with a professional cease and desist letter. Attorney-reviewed, citing California tenant protection laws. Starting at $299.",
    robots: INDEX_ROBOTS,
    ogType: "website",
  },
  "non-compete-dispute-letter": {
    title: "Non-Compete Dispute Letter | Talk to My Lawyer",
    description:
      "Challenge an unfair non-compete agreement with a professional dispute letter. California generally voids non-competes - know your rights.",
    robots: INDEX_ROBOTS,
    ogType: "website",
  },
  "intellectual-property-infringement-letter": {
    title:
      "IP Infringement Letter - Protect Your Intellectual Property | Talk to My Lawyer",
    description:
      "Protect your intellectual property with a professional infringement letter. Stop copyright theft, trademark misuse, and trade secret violations.",
    robots: INDEX_ROBOTS,
    ogType: "website",
  },
  "small-claims-demand-letter": {
    title: "Small Claims Demand Letter | Talk to My Lawyer",
    description:
      "Send a professional demand letter before filing in California Small Claims Court. Attorney-reviewed, citing California small claims procedures.",
    robots: INDEX_ROBOTS,
    ogType: "website",
  },
};

const EXACT_SPA_ROUTES = new Set([
  "/",
  "/pricing",
  "/faq",
  "/terms",
  "/privacy",
  "/analyze",
  "/blog",
  "/content-calendar",
  "/newsletter-template",
  "/services",
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-email",
  "/reset-password",
  "/accept-invitation",
  "/onboarding",
  "/dashboard",
  "/submit",
  "/library",
  "/letters",
  "/subscriber/billing",
  "/subscriber/receipts",
  "/subscriber/intake-templates",
  "/profile",
  "/attorney",
  "/attorney/queue",
  "/attorney/review-centre",
  "/review",
  "/review/queue",
  "/review/centre",
  "/employee/dashboard",
  "/employee",
  "/employee/referrals",
  "/employee/earnings",
  "/admin/verify",
  "/admin",
  "/admin/users",
  "/admin/jobs",
  "/admin/letters",
  "/admin/affiliate",
  "/admin/learning",
  "/admin/blog",
  "/admin/pipeline",
  "/admin/quality",
  "/admin/templates",
  "/admin/submit",
  "/404",
]);

const DYNAMIC_SPA_ROUTE_PATTERNS = [
  /^\/portal\/[^/]+$/,
  /^\/letters\/[^/]+$/,
  /^\/attorney\/review\/[^/]+$/,
  /^\/attorney\/[^/]+$/,
  /^\/review\/[^/]+$/,
  /^\/admin\/letters\/[^/]+$/,
];

const PRIVATE_PATH_PREFIXES = [
  "/api/",
  "/auth/",
  "/admin",
  "/dashboard",
  "/submit",
  "/library",
  "/letters",
  "/attorney",
  "/review",
  "/employee",
  "/subscriber",
  "/profile",
  "/portal",
  "/onboarding",
  "/settings",
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-email",
  "/reset-password",
  "/accept-invitation",
];

const NOINDEX_EXACT_ROUTES = new Set([
  "/content-calendar",
  "/newsletter-template",
  "/404",
]);

function normalizePathname(originalUrl: string): string {
  const pathname = new URL(originalUrl, SITE_ORIGIN).pathname;
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

function withCanonical(
  pathname: string,
  seo: Omit<RouteSeo, "canonical">
): RouteSeo {
  const canonicalPath = pathname === "/" ? "/" : pathname;
  return {
    ...seo,
    canonical: `${SITE_ORIGIN}${canonicalPath}`,
    ogTitle: seo.ogTitle ?? seo.title,
    ogDescription: seo.ogDescription ?? seo.description,
    ogImage: seo.ogImage ?? DEFAULT_IMAGE,
  };
}

function noindexSeo(pathname: string): RouteSeo {
  return withCanonical(pathname, {
    title: "Talk to My Lawyer",
    description:
      "Talk to My Lawyer provides professional attorney-reviewed legal letters.",
    robots: NOINDEX_ROBOTS,
    ogType: "website",
  });
}

function notFoundSeo(pathname: string): RouteSeo {
  return withCanonical(pathname, {
    title: "Page Not Found | Talk to My Lawyer",
    description: "The page you requested could not be found.",
    robots: NOINDEX_ROBOTS,
    ogType: "website",
  });
}

function titleToHeading(title: string): string {
  return title
    .replace(/\s+\|\s+Talk to My Lawyer.*$/i, "")
    .replace(/\s+-\s+Talk to My Lawyer.*$/i, "")
    .replace(/\s+-\s+Attorney-Reviewed.*$/i, "")
    .trim();
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function markdownToFallbackHtml(content: string): string {
  const lines = content.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i].trim();

    if (!raw) {
      i += 1;
      continue;
    }

    if (/^###\s+/.test(raw)) {
      blocks.push(
        `<h3>${escapeHtmlText(stripInlineMarkdown(raw.replace(/^###\s+/, "")))}</h3>`
      );
      i += 1;
      continue;
    }

    if (/^##\s+/.test(raw)) {
      blocks.push(
        `<h2>${escapeHtmlText(stripInlineMarkdown(raw.replace(/^##\s+/, "")))}</h2>`
      );
      i += 1;
      continue;
    }

    if (/^#\s+/.test(raw)) {
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(
          `<li>${escapeHtmlText(stripInlineMarkdown(lines[i].trim().replace(/^[-*]\s+/, "")))}</li>`
        );
        i += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(
          `<li>${escapeHtmlText(stripInlineMarkdown(lines[i].trim().replace(/^\d+\.\s+/, "")))}</li>`
        );
        i += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paragraphLines.push(stripInlineMarkdown(lines[i].trim()));
      i += 1;
    }
    blocks.push(`<p>${escapeHtmlText(paragraphLines.join(" "))}</p>`);
  }

  return blocks.join("");
}

function buildFallbackHtml(
  pathname: string,
  heading: string,
  description: string,
  bodyHtml = ""
): string {
  return [
    `<main data-prerender-route="${escapeHtmlAttribute(pathname)}">`,
    `<h1>${escapeHtmlText(heading)}</h1>`,
    `<p>${escapeHtmlText(description)}</p>`,
    bodyHtml,
    "</main>",
  ].join("");
}

function fallbackLinkListHtml(
  heading: string,
  links: { href: string; title: string; description?: string | null }[]
): string {
  if (links.length === 0) return "";

  const items = links
    .map(link => {
      const description = link.description?.trim()
        ? `<p>${escapeHtmlText(link.description.trim())}</p>`
        : "";
      return [
        "<li>",
        `<a href="${escapeHtmlAttribute(link.href)}">${escapeHtmlText(link.title)}</a>`,
        description,
        "</li>",
      ].join("");
    })
    .join("");

  return [
    "<section>",
    `<h2>${escapeHtmlText(heading)}</h2>`,
    `<ul>${items}</ul>`,
    "</section>",
  ].join("");
}

function formatIsoDate(
  value: Date | string | null | undefined
): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function blogPostSeo(pathname: string, post: SeoBlogPost): RouteSeo {
  return withCanonical(pathname, {
    title: `${post.title} - Talk to My Lawyer Blog`,
    description:
      post.metaDescription?.trim() ||
      post.excerpt?.trim() ||
      "Legal guidance from Talk to My Lawyer.",
    robots: INDEX_ROBOTS,
    ogTitle: post.title,
    ogDescription:
      post.metaDescription?.trim() ||
      post.excerpt?.trim() ||
      "Legal guidance from Talk to My Lawyer.",
    ogImage: post.ogImageUrl ?? DEFAULT_IMAGE,
    ogType: "article",
    publishedTime: formatIsoDate(post.publishedAt),
    modifiedTime: formatIsoDate(post.updatedAt ?? post.publishedAt),
  });
}

function blogPostFallbackHtml(pathname: string, post: SeoBlogPost): string {
  const description =
    post.metaDescription?.trim() ||
    post.excerpt?.trim() ||
    "Legal guidance from Talk to My Lawyer.";

  return buildFallbackHtml(
    pathname,
    post.title,
    description,
    post.content ? markdownToFallbackHtml(post.content) : ""
  );
}

function blogIndexFallbackHtml(
  pathname: string,
  seo: Omit<RouteSeo, "canonical">,
  posts: SeoBlogListPost[]
): string {
  return buildFallbackHtml(
    pathname,
    titleToHeading(seo.ogTitle ?? seo.title),
    seo.description,
    fallbackLinkListHtml(
      "Recent legal guides",
      posts.map(post => ({
        href: `/blog/${post.slug}`,
        title: post.title,
        description: post.excerpt,
      }))
    )
  );
}

function servicesIndexFallbackHtml(
  pathname: string,
  seo: Omit<RouteSeo, "canonical">
): string {
  return buildFallbackHtml(
    pathname,
    titleToHeading(seo.ogTitle ?? seo.title),
    seo.description,
    fallbackLinkListHtml(
      "Letter services",
      Object.entries(SERVICE_ROUTE_SEO).map(([slug, serviceSeo]) => ({
        href: `/services/${slug}`,
        title: titleToHeading(serviceSeo.title),
        description: serviceSeo.description,
      }))
    )
  );
}

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(prefix)
  );
}

export function shouldReturnAsset404(originalUrl: string): boolean {
  const pathname = normalizePathname(originalUrl);
  const lastSegment = pathname.split("/").pop() ?? "";
  return /\.[a-zA-Z0-9]{2,8}$/.test(lastSegment);
}

export async function resolveSpaRoute(
  originalUrl: string,
  options: ResolveSpaRouteOptions = {}
): Promise<SpaRouteResolution> {
  const pathname = normalizePathname(originalUrl);

  if (pathname === "/404") {
    return {
      pathname,
      knownRoute: true,
      statusCode: 404,
      seo: notFoundSeo(pathname),
      fallbackHtml: buildFallbackHtml(
        pathname,
        "Page Not Found",
        "The page you requested could not be found."
      ),
    };
  }

  const staticSeo = PUBLIC_ROUTE_SEO[pathname];
  if (staticSeo) {
    const blogPosts =
      pathname === "/blog" && options.getBlogPosts
        ? (await options.getBlogPosts()).posts
        : [];
    const fallbackHtml =
      pathname === "/blog"
        ? blogIndexFallbackHtml(pathname, staticSeo, blogPosts)
        : pathname === "/services"
          ? servicesIndexFallbackHtml(pathname, staticSeo)
          : buildFallbackHtml(
              pathname,
              titleToHeading(staticSeo.ogTitle ?? staticSeo.title),
              staticSeo.description
            );

    return {
      pathname,
      knownRoute: true,
      statusCode: 200,
      seo: withCanonical(pathname, staticSeo),
      fallbackHtml,
    };
  }

  const serviceSlug = pathname.match(/^\/services\/([^/]+)$/)?.[1];
  if (serviceSlug) {
    const serviceSeo = SERVICE_ROUTE_SEO[serviceSlug];
    if (serviceSeo) {
      return {
        pathname,
        knownRoute: true,
        statusCode: 200,
        seo: withCanonical(pathname, serviceSeo),
        fallbackHtml: buildFallbackHtml(
          pathname,
          titleToHeading(serviceSeo.title),
          serviceSeo.description
        ),
      };
    }
    return {
      pathname,
      knownRoute: false,
      statusCode: 404,
      seo: notFoundSeo(pathname),
      fallbackHtml: buildFallbackHtml(
        pathname,
        "Page Not Found",
        "The page you requested could not be found."
      ),
    };
  }

  const blogSlug = pathname.match(/^\/blog\/([^/]+)$/)?.[1];
  if (blogSlug) {
    const post = options.getBlogPost
      ? await options.getBlogPost(decodeURIComponent(blogSlug))
      : null;
    if (post) {
      return {
        pathname,
        knownRoute: true,
        statusCode: 200,
        seo: blogPostSeo(pathname, post),
        fallbackHtml: blogPostFallbackHtml(pathname, post),
      };
    }
    return {
      pathname,
      knownRoute: false,
      statusCode: 404,
      seo: notFoundSeo(pathname),
      fallbackHtml: buildFallbackHtml(
        pathname,
        "Page Not Found",
        "The page you requested could not be found."
      ),
    };
  }

  if (
    EXACT_SPA_ROUTES.has(pathname) ||
    DYNAMIC_SPA_ROUTE_PATTERNS.some(pattern => pattern.test(pathname))
  ) {
    return {
      pathname,
      knownRoute: true,
      statusCode: 200,
      seo:
        isPrivatePath(pathname) || NOINDEX_EXACT_ROUTES.has(pathname)
          ? noindexSeo(pathname)
          : withCanonical(pathname, PUBLIC_ROUTE_SEO["/"]),
      fallbackHtml:
        isPrivatePath(pathname) || NOINDEX_EXACT_ROUTES.has(pathname)
          ? undefined
          : buildFallbackHtml(
              pathname,
              titleToHeading(
                PUBLIC_ROUTE_SEO["/"].ogTitle ?? PUBLIC_ROUTE_SEO["/"].title
              ),
              PUBLIC_ROUTE_SEO["/"].description
            ),
    };
  }

  return {
    pathname,
    knownRoute: false,
    statusCode: 404,
    seo: notFoundSeo(pathname),
    fallbackHtml: buildFallbackHtml(
      pathname,
      "Page Not Found",
      "The page you requested could not be found."
    ),
  };
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}

function stripManagedHeadTags(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']keywords["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']robots["'][^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+property=["']og:title["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+property=["']og:description["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+property=["']og:type["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+property=["']og:url["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+property=["']og:image["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+property=["']article:published_time["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+property=["']article:modified_time["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:card["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:title["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:description["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:image["'][^>]*>\s*/gi, "");
}

export function injectSeoIntoHtml(
  html: string,
  route: SpaRouteResolution
): string {
  const { seo } = route;
  const tags = [
    `<title>${escapeHtmlText(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtmlAttribute(seo.description)}" />`,
    `<meta name="robots" content="${escapeHtmlAttribute(seo.robots)}" />`,
    `<link rel="canonical" href="${escapeHtmlAttribute(seo.canonical)}" />`,
    `<meta property="og:title" content="${escapeHtmlAttribute(seo.ogTitle ?? seo.title)}" />`,
    `<meta property="og:description" content="${escapeHtmlAttribute(seo.ogDescription ?? seo.description)}" />`,
    `<meta property="og:type" content="${seo.ogType}" />`,
    `<meta property="og:url" content="${escapeHtmlAttribute(seo.canonical)}" />`,
    `<meta property="og:image" content="${escapeHtmlAttribute(seo.ogImage ?? DEFAULT_IMAGE)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtmlAttribute(seo.ogTitle ?? seo.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtmlAttribute(seo.ogDescription ?? seo.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtmlAttribute(seo.ogImage ?? DEFAULT_IMAGE)}" />`,
  ];

  if (seo.publishedTime) {
    tags.push(
      `<meta property="article:published_time" content="${escapeHtmlAttribute(seo.publishedTime)}" />`
    );
  }

  if (seo.modifiedTime) {
    tags.push(
      `<meta property="article:modified_time" content="${escapeHtmlAttribute(seo.modifiedTime)}" />`
    );
  }

  const managedHead = `\n    ${tags.join("\n    ")}\n`;
  const stripped = stripManagedHeadTags(html);
  const withHead = stripped.replace(/<\/head>/i, `${managedHead}  </head>`);

  if (!route.fallbackHtml) {
    return withHead;
  }

  return withHead.replace(/<div\s+id=["']root["'][^>]*>\s*<\/div>/i, match =>
    match.replace(/><\/div>$/, `>${route.fallbackHtml}</div>`)
  );
}
