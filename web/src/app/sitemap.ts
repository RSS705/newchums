import type { MetadataRoute } from "next";

/** Sitemap of public routes: the static marketing/discovery surfaces plus
 *  the dynamic public plan and community URLs.
 *
 *  Dynamic entries come from the API's two anonymous discovery endpoints,
 *  which enforce the privacy contract server-side (public visibility,
 *  published/active status, no QA, no hidden-from-explore records), so
 *  nothing can land here that the owner didn't already publish to the
 *  public Explore and community discovery feeds. Each fetch is wrapped in
 *  its own try/catch and the whole build degrades to the static list on
 *  any error; the sitemap must never 500. Entry counts are capped so the
 *  response stays bounded even if the API's own limit clamp changes. */

const MAX_DYNAMIC_ENTRIES = 200;

/** Fetch a list endpoint on the API worker and return the parsed body,
 *  or null on any failure (missing env, network error, non-2xx, bad JSON). */
async function fetchApiList<T>(path: string): Promise<T | null> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!apiBase) return null;
  try {
    const res = await fetch(`${apiBase}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://newchums.com";
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
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
      url: `${base}/communities`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  const dynamicEntries: MetadataRoute.Sitemap = [];

  // Public upcoming plans. The endpoint only returns published,
  // public-visibility, non-QA plans that are not hidden from Explore.
  const planData = await fetchApiList<{
    ok?: boolean;
    events?: Array<{ id?: string | null }>;
  }>("/events/explore/public?limit=100");
  if (planData?.ok && Array.isArray(planData.events)) {
    for (const ev of planData.events.slice(0, MAX_DYNAMIC_ENTRIES)) {
      if (typeof ev?.id === "string" && ev.id) {
        dynamicEntries.push({
          url: `${base}/events/${encodeURIComponent(ev.id)}`,
          lastModified: now,
          changeFrequency: "daily",
          priority: 0.7,
        });
      }
    }
  }

  // Public active communities. The endpoint only returns public-visibility,
  // active communities.
  const communityData = await fetchApiList<{
    ok?: boolean;
    communities?: Array<{ slug?: string | null }>;
  }>("/public/communities?limit=100");
  if (communityData?.ok && Array.isArray(communityData.communities)) {
    for (const community of communityData.communities.slice(
      0,
      MAX_DYNAMIC_ENTRIES
    )) {
      if (typeof community?.slug === "string" && community.slug) {
        dynamicEntries.push({
          url: `${base}/communities/${encodeURIComponent(community.slug)}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    }
  }

  return [...staticEntries, ...dynamicEntries];
}
