import type { Metadata } from "next";
import { Suspense } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import { auth } from "@/auth";
import EventDetailClient from "./EventDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// Generic, plan-agnostic fallback. Used when the API can't be reached or
// returns an unexpected shape. Deliberately ships no image: per the share
// preview spec, the horizontal NewChums wordmark made banner-less plan
// links look like generic product links instead of specific plans, so we
// prefer Discord's text-only card over a misleading image.
const GENERIC_FALLBACK_TITLE = "NewChums";
const GENERIC_FALLBACK_DESCRIPTION =
  "Organize real-life plans around shared hobbies and interests.";

const FALLBACK_METADATA: Metadata = {
  title: GENERIC_FALLBACK_TITLE,
  description: GENERIC_FALLBACK_DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    title: GENERIC_FALLBACK_TITLE,
    description: GENERIC_FALLBACK_DESCRIPTION,
    siteName: "NewChums",
    // Explicit empty override. Root layout sets openGraph.images to the
    // horizontal NewChums wordmark; without an explicit override here,
    // Next deep-merges the parent's images into this page and Discord
    // unfurls a "giant logo" embed for banner-less plans.
    images: [],
  },
  twitter: {
    card: "summary",
    title: GENERIC_FALLBACK_TITLE,
    description: GENERIC_FALLBACK_DESCRIPTION,
    // Same explicit override as openGraph.images above.
    images: [],
  },
};

const PRIVATE_FALLBACK_METADATA: Metadata = {
  ...FALLBACK_METADATA,
  robots: { index: false, follow: false },
};

/** Format the plan start in the plan's timezone if we have one, else fall
 *  back to a tz-agnostic format. Wrapped in try/catch because Intl can
 *  throw on unknown IANA names (rare but possible if the DB drifts). */
function formatPlanStart(iso: string, tz?: string | null): string | null {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz || undefined,
    });
  } catch {
    try {
      return new Date(iso).toLocaleString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return null;
    }
  }
}

/** Strip street-level detail out of a postal address and return the
 *  "city, region" suffix. Mirrors `api/src/lib/locationFormat.ts`'s
 *  `deriveApproxArea`. Duplicated rather than imported so this route
 *  stays self-contained, the function is tiny and pure. Used for
 *  metadata only, where exact street addresses must never appear even
 *  when the API returns them in token-backed responses. */
function deriveApproxArea(address: string | null | undefined): string | null {
  if (!address) return null;
  const skipCountry = new Set([
    "canada",
    "united states",
    "usa",
    "united kingdom",
    "uk",
    "australia",
    "new zealand",
  ]);
  const stripped = address
    .replace(/\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/g, "") // Canadian postal codes
    .replace(/\b\d{5}(-\d{4})?\b/g, ""); // US zip codes
  const parts = stripped
    .split(",")
    .map((s) => s.trim())
    .filter((p) => p && !skipCountry.has(p.toLowerCase()));
  if (parts.length === 0) return null;
  const areaParts = parts.length > 1 ? parts.slice(1) : parts;
  return areaParts.filter(Boolean).join(", ") || null;
}

/** Truncate a plan title for use inside an action-prefixed OG title.
 *  Discord wraps long unfurl titles awkwardly, so we cap at a length
 *  that keeps `Join this plan: {title}` on a tidy line. Cuts at the
 *  last word boundary when one exists in the back half so we don't
 *  truncate mid-word. */
function truncateTitleForMetadata(raw: string, max = 65): string {
  const t = raw.trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  // Only trim back to a word boundary if it doesn't shorten too much.
  const cut = lastSpace > Math.floor(max * 0.6) ? lastSpace : max;
  return `${t.slice(0, cut).trimEnd()}…`;
}

/** Dynamic metadata for plan detail pages.
 *
 *  Token-aware: when the URL carries `?share_token=` or `?invite_token=`,
 *  those are forwarded to the API. The API validates them and returns
 *  `accessState: "invite"` for valid tokens, which gives us the same
 *  privacy-safe payload a logged-out token-bearing visitor would see and
 *  lets the unfurl describe `chums_only` and `invite_only` plans that
 *  would otherwise fall back to the private generic. Without a token,
 *  we get the public-preview shape (no exact address, no online link, no
 *  attendee identities). The API is the single source of truth for what
 *  any given access state may expose; the route handler does no
 *  redaction of its own.
 *
 *  Privacy gates layered on top:
 *  - QA, draft, canceled plans: always generic + noindex.
 *  - `invite_only` plans without token-granted access: generic + noindex.
 *  - Tokenized URLs: noindex regardless. Personal share URLs should not
 *    end up in search results even when we render a useful unfurl.
 *
 *  Image handling: ships no `og:image` for plan pages. Wide
 *  host-uploaded banners crop badly when Discord/Slack box them into a
 *  16:9 unfurl, and a 1200×630 auto-generated share card is a deferred
 *  enhancement (font/runtime risk on OpenNext-Cloudflare for
 *  ImageResponse + Satori; SVG OG images are unreliable on Twitter).
 *  Both `openGraph.images` and `twitter.images` are set to an explicit
 *  empty array so Next's deep-merge doesn't inherit the root layout's
 *  `/logo-horizontal-black.png` and ship a "giant logo" embed.
 *
 *  Location handling: never includes the exact street address even
 *  when token-backed access exposes it. Built from `locationName` plus
 *  a city/region derived from `locationAddress`; online plans suppress
 *  the meeting link and read as `"Online"`.
 *
 *  Discord caching: Discord caches embeds per URL for up to 24h on
 *  first fetch. To force a refresh while testing, append a throwaway
 *  query param to the URL (e.g. `?cb=2`) or wait out the cache. */
export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const search = (await searchParams) ?? {};
  const shareToken =
    typeof search.share_token === "string" && search.share_token
      ? search.share_token
      : null;
  const inviteToken =
    typeof search.invite_token === "string" && search.invite_token
      ? search.invite_token
      : null;
  const hasToken = !!(shareToken || inviteToken);

  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!base || !id) return FALLBACK_METADATA;

  // Forward tokens so the API returns the token-backed access state for
  // chums_only / invite_only plans rather than the public-preview shape.
  // The API validates tokens and is the source of truth for what each
  // accessState is allowed to expose; we just consume the response.
  const apiUrl = new URL(`${base}/events/${encodeURIComponent(id)}`);
  if (shareToken) apiUrl.searchParams.set("share_token", shareToken);
  if (inviteToken) apiUrl.searchParams.set("invite_token", inviteToken);

  try {
    const res = await fetch(apiUrl.toString(), { cache: "no-store" });
    if (!res.ok) return FALLBACK_METADATA;
    const data = (await res.json()) as {
      ok?: boolean;
      accessState?: "public" | "invite" | "authenticated" | "attending";
      event?: {
        title?: string | null;
        description?: string | null;
        startsAt?: string | null;
        timezone?: string | null;
        locationType?: string | null;
        locationDisplay?: string | null;
        locationArea?: string | null;
        locationName?: string | null;
        locationAddress?: string | null;
        hobby?: string | null;
        hobbies?: Array<{ name: string }>;
        bannerKey?: string | null;
        visibility?: string | null;
        status?: string | null;
        isQa?: boolean;
      };
    };
    const ev = data.ok ? data.event : null;
    if (!ev) return FALLBACK_METADATA;

    // Draft / canceled / non-published: always private. These are
    // transient states whose existence shouldn't show up in unfurls or
    // search regardless of token.
    if (ev.status && ev.status !== "published") {
      return PRIVATE_FALLBACK_METADATA;
    }

    // Token gate: a valid share_token / invite_token elevates the API
    // response to accessState="invite" (or "attending" when tied to a
    // session). The API is the authority on what each access state may
    // expose; we just consume the response.
    const tokenAccess =
      data.accessState === "invite" || data.accessState === "attending";

    // QA plans: tokenized URLs are the only way to render details. Keeps
    // QA isolated from public discovery (no SEO indexing, see noindex
    // below) while letting super-admin testers share testable previews.
    if (ev.isQa && !tokenAccess) {
      return PRIVATE_FALLBACK_METADATA;
    }
    // invite_only: same token-gated pattern.
    if (ev.visibility === "invite_only" && !tokenAccess) {
      return PRIVATE_FALLBACK_METADATA;
    }

    const title = (ev.title || "").trim() || "Plan";
    const shortTitle = truncateTitleForMetadata(title);
    const hobby = ev.hobby || ev.hobbies?.[0]?.name || null;
    const dateStr = ev.startsAt ? formatPlanStart(ev.startsAt, ev.timezone) : null;

    // Build a privacy-safe location string for the description. Even when
    // the API returns full street details (token-backed access), metadata
    // must never include the exact address; chat unfurls leak too widely.
    // Prefer venue name + derived city/region; otherwise approximate area
    // alone; otherwise omit. Online plans never expose the meeting link.
    let locationBit: string | null = null;
    if (ev.locationType === "online") {
      locationBit = "Online";
    } else {
      const venue = (ev.locationName || "").trim() || null;
      const cityFromAddress = deriveApproxArea(ev.locationAddress);
      const cityFromArea = (ev.locationArea || "").trim() || null;
      const city = cityFromAddress || cityFromArea;
      if (venue && city) locationBit = `${venue} • ${city}`;
      else if (venue) locationBit = venue;
      else if (city) locationBit = city;
    }

    const factParts = [dateStr, hobby, locationBit].filter(Boolean) as string[];
    // Cap factual portion so Discord doesn't truncate the action cue.
    const factualLine = factParts.join(" • ").slice(0, 150);
    const description = factualLine
      ? `${factualLine}. View details and RSVP on NewChums.`
      : "View details and RSVP on NewChums.";

    // Action-oriented OG title. Plan title is truncated so Discord doesn't
    // wrap awkwardly when the action prefix is added. Browser tab title
    // stays as the bare full plan title via the root `%s | NewChums`
    // template.
    const ogTitle = `Join this plan: ${shortTitle}`;

    const canonicalPath = `/events/${encodeURIComponent(id)}`;

    // QA plans are never indexable, even with a valid token. Tokenized
    // URLs in general are personal share links and shouldn't be indexed.
    const noindex = hasToken || !!ev.isQa;

    return {
      title,
      description,
      robots: noindex
        ? { index: false, follow: false }
        : { index: true, follow: true },
      alternates: { canonical: canonicalPath },
      openGraph: {
        title: ogTitle,
        description,
        url: canonicalPath,
        type: "article",
        siteName: "NewChums",
        // Plan banners are wide and squash poorly when Discord crops to its
        // 16:9 unfurl box, and there's no auto-generated 1200x630 share
        // card yet (font/runtime risk on OpenNext-Cloudflare). Until that
        // exists, ship a clean text-only embed by explicitly clearing the
        // image. Empty array also overrides the root layout's
        // /logo-horizontal-black.png that would otherwise leak in via
        // Next's deep-merge.
        images: [],
      },
      twitter: {
        card: "summary",
        title: ogTitle,
        description,
        images: [],
      },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default async function EventDetailPage() {
  // Resolve auth state on the server so the client can skip
  // `/api/auth/api-token` for logged-out viewers (which would 401 and
  // pollute the browser console / Sentry breadcrumbs). Plan detail is
  // a public canonical surface, share-link traffic and search-engine
  // bots reach it without a session, so this short-circuit matters.
  // Logged-in clients still resolve a fresh token as before.
  const session = await auth();
  const isAuthenticatedFromServer = !!session?.user?.email;
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
          <CircularProgress />
        </Box>
      }
    >
      <EventDetailClient isAuthenticatedFromServer={isAuthenticatedFromServer} />
    </Suspense>
  );
}
