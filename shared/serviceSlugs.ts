/**
 * Canonical list of public service-page slugs.
 *
 * Single source of truth for:
 *   - server/sitemapRoute.ts — sitemap.xml generation
 *   - server/spaRoutes.ts — known route allowlist + per-route SEO
 *   - scripts/prerender.ts — build-time static prerender of /services/<slug>
 *   - client/public/llms.txt — link list for AI engines
 *
 * When adding a new service: add the slug here AND the matching SEO entry
 * in server/spaRoutes.ts's SERVICE_ROUTE_SEO map AND the user-facing copy
 * in client/src/pages/services/serviceData.ts.
 */
export const SERVICE_SLUGS = [
  "demand-letter",
  "cease-and-desist",
  "security-deposit-letter",
  "breach-of-contract-letter",
  "employment-dispute-letter",
  "personal-injury-demand-letter",
  "landlord-harassment-cease-desist",
  "non-compete-dispute-letter",
  "intellectual-property-infringement-letter",
  "small-claims-demand-letter",
] as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[number];
