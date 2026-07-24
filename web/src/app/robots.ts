import type { MetadataRoute } from "next";

/** Crawl directives for search engines. Kept in code (not a static
 *  robots.txt) so the canonical host stays in one place next to the
 *  rest of the site's metadata machinery.
 *
 *  Allowed paths are the public marketing surfaces, public community
 *  discovery, public plan and community detail URLs, public profiles,
 *  and the public roadmap. Everything else is disallowed:
 *  authenticated app surfaces, admin, edit forms, auth flows,
 *  onboarding, utility endpoints (unsubscribe, Sentry test), the
 *  internal design-system preview, the API proxy, and the
 *  /qr/[code] redirect route. The QR route in particular is a
 *  redirect handler (not a content page) and should never appear in
 *  search results; it carries its own Cache-Control: no-store header.
 *  Per-page robots directives (set by (app)/layout.tsx's noindex
 *  cascade and by generateMetadata on private / hidden dynamic pages)
 *  give a second layer of defense if any page is reached anyway. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/how-it-works",
          // /science-of-friendship is deliberately not listed: the page
          // stays live (unlisted) but carries a noindex in its metadata,
          // which crawlers can only see because crawling is not
          // disallowed. It is also omitted from the sitemap.
          "/safety-center",
          "/contact",
          "/privacy",
          "/terms",
          "/roadmap",
          "/roadmap/",
          "/communities",
          "/communities/",
          "/events/",
          "/u/",
        ],
        disallow: [
          "/admin",
          "/admin/",
          "/api",
          "/api/",
          "/auth",
          "/auth/",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/onboarding",
          "/onboarding/",
          "/unsubscribe",
          "/qr/",
          "/settings",
          "/profile",
          "/plans",
          "/your-plan",
          "/chum-groups",
          "/ui",
          "/sentry-test",
          "/monitoring",
          "/_next/",
          // Create and edit forms under communities/events are authed-
          // only. The layout's noindex cascade backs this up, but
          // disallowing the path saves crawl budget.
          "/communities/create",
          "/events/create",
        ],
      },
    ],
    sitemap: "https://newchums.com/sitemap.xml",
    host: "https://newchums.com",
  };
}
