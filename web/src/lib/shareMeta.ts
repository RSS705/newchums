import type { Metadata } from "next";

// Link-preview tags (LinkedIn, Slack, Discord, iMessage) for the public pages.
//
// Why this exists: when a page sets its own `openGraph` or `twitter` object,
// Next REPLACES the root layout's object with it, it does not merge the two.
// So a page that only wanted its own title, description and url silently
// dropped the site name, the locale and the /og-image.png brand card. That is
// how the homepage shipped with no picture at all (blank LinkedIn card,
// September 2026) while /privacy, which sets nothing, kept the picture.
//
// Every public page that wants its own preview title goes through `shareMeta`
// so the site-wide fields are restated in one place. Paths resolve against
// `metadataBase` in the root layout.
//
// Not for plan pages: /events/[id] ships text-only unfurls on purpose (see the
// metadata comment in that file). Community and profile pages pass their own
// avatar, or no picture when the page is private.
//
// The image stays a PNG or JPG. LinkedIn is unreliable with WebP.

/** One place for the brand name in preview tags (a rename is under
 *  consideration, see AGENTS.md, Naming Status). */
export const SITE_NAME = "NewChums";

export const DEFAULT_SHARE_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "NewChums, make plans that actually happen",
};

export function shareMeta({
  path,
  title,
  description,
}: {
  /** The page's own address, for example "/how-it-works". */
  path: string;
  title: string;
  description: string;
}): Pick<Metadata, "alternates" | "openGraph" | "twitter"> {
  return {
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: path,
      title,
      description,
      images: [DEFAULT_SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_SHARE_IMAGE.url],
    },
  };
}
