/**
 * Canonical list of public service-page slugs.
 *
 * Live imports (TypeScript will fail to compile if this list drifts):
 *   - server/sitemapRoute.ts — iterates SERVICE_SLUGS to emit sitemap entries
 *   - scripts/prerender.ts — iterates SERVICE_SLUGS to drive puppeteer
 *   - server/spaRoutes.ts — SERVICE_ROUTE_SEO is typed `Record<ServiceSlug, …>`,
 *     so adding a slug here forces filling out the per-slug SEO map there
 *
 * Manually maintained (kept in sync by a test, not by import):
 *   - client/public/llms.txt — static text file served as-is to AI engines.
 *     Cannot import TypeScript. server/spaRoutes.test.ts asserts every
 *     SERVICE_SLUGS entry appears as `/services/<slug>` in llms.txt, so the
 *     test suite fails if you add a slug and forget to update the file.
 *   - client/src/pages/services/serviceData.ts — user-facing copy for the
 *     React service pages. Not test-enforced today; verify manually.
 *
 * Workflow for adding a new service slug:
 *   1. Add the slug to SERVICE_SLUGS below.
 *   2. tsc will fail until you add a SERVICE_ROUTE_SEO entry in spaRoutes.ts.
 *   3. The llms.txt test will fail until you add the `/services/<slug>` link.
 *   4. Add the React content in client/src/pages/services/serviceData.ts.
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
