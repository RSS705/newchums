import type { Metadata } from "next";
import CommunityDetailClient from "./CommunityDetailClient";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const FALLBACK_METADATA: Metadata = {
  title: "Community",
  description: "A community on NewChums.",
  robots: { index: true, follow: true },
};

/** Dynamic metadata for community slug URLs. Fetches GET /communities/:slug
 *  WITHOUT authentication so the response is exactly the logged-out shape.
 *  Key privacy rule: private communities get the "restricted" response
 *  (see AGENTS.md → Canonical Community URL). In that case we still emit
 *  limited metadata (name, generic description, hobbies, banner) so QR /
 *  poster link previews look polished, but we flip to noindex so the
 *  community doesn't appear in search. Public communities default to
 *  index and use their real description. Closed communities get the
 *  restricted-style minimal preview and noindex.
 *
 *  Fields we intentionally do NOT surface in metadata for any community:
 *  website, discord_url, operating_hours, plan details, member details.
 *  Those are omitted from the restricted response by the API, and also
 *  stripped here from the public response to keep metadata privacy-safe
 *  if the shape ever shifts. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!base || !slug) return FALLBACK_METADATA;

  try {
    const res = await fetch(`${base}/communities/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) return FALLBACK_METADATA;
    const data = (await res.json()) as {
      ok?: boolean;
      community?: {
        id?: string;
        name?: string | null;
        description?: string | null;
        visibility?: string | null;
        status?: string | null;
        restricted?: boolean;
        avatar_key?: string | null;
        banner_key?: string | null;
        is_online?: boolean;
        location_name?: string | null;
      };
    };
    const c = data.ok ? data.community : null;
    if (!c) return FALLBACK_METADATA;

    // Private (including the restricted-response branch) and closed
    // communities: shareable link preview, but not indexed. Public
    // communities: full description, indexable.
    const isPrivate =
      c.visibility === "private" || c.status === "closed" || c.restricted === true;
    const noindex = isPrivate;

    const name = (c.name || "").trim() || "Community";
    // For private / restricted / closed communities we deliberately do
    // NOT surface the community's description (or any location or
    // online/offline hints) in metadata, even though the page itself
    // renders some of those fields. QR posters and direct shares should
    // still produce a polished link preview (name + generic copy +
    // banner/avatar), but a conservative posture for private
    // communities means the owner's description text never leaks into
    // third-party caches, social scrapers, or unfurl services. Public
    // communities use their real description.
    const rawDescription = (c.description || "").trim();
    const description = isPrivate
      ? "View this private community on NewChums."
      : rawDescription
        ? rawDescription.slice(0, 240)
        : c.is_online
          ? `${name} is an online community on NewChums.`
          : c.location_name
            ? `${name} is a community on NewChums based in ${c.location_name}.`
            : `${name} is a community on NewChums.`;

    const canonicalPath = `/communities/${encodeURIComponent(slug)}`;
    const communityId = c.id;
    const imageUrl = communityId && c.banner_key
      ? `${base}/communities/${encodeURIComponent(communityId)}/banner`
      : communityId && c.avatar_key
        ? `${base}/communities/${encodeURIComponent(communityId)}/avatar`
        : undefined;

    return {
      title: name,
      description,
      robots: noindex
        ? { index: false, follow: false }
        : { index: true, follow: true },
      alternates: { canonical: canonicalPath },
      openGraph: {
        title: name,
        description,
        url: canonicalPath,
        type: "website",
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
      twitter: {
        title: name,
        description,
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default function CommunityDetailPage() {
  return <CommunityDetailClient />;
}
