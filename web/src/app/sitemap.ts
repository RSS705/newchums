import type { MetadataRoute } from "next";

/** Sitemap of intentional public routes. Deliberately static; we do not
 *  enumerate dynamic routes (per-plan, per-community, per-profile,
 *  per-roadmap-item) here.
 *
 *  Rationale: enumerating dynamic URLs would either require an API call
 *  that could grow unbounded, or leak shareable URLs the owner never
 *  intended to publish. Those pages are still crawlable when discovered
 *  through organic links (public Explore feed, public community
 *  discovery, etc.) and carry their own generateMetadata robots
 *  directives that opt out when the underlying record is private or
 *  hidden. Keeping the sitemap to marketing surfaces + discovery index
 *  pages is the least-surprise posture for a pilot launch. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://newchums.com";
  const now = new Date();
  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/how-it-works`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/science-of-friendship`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/safety-center`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/roadmap`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${base}/communities`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];
}
