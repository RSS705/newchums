import type { Metadata } from "next";
import { Suspense, cache } from "react";
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
    // /og-image.png brand card; without an explicit override here,
    // Next deep-merges the parent's images into this page and Discord
    // unfurls a generic product embed for banner-less plans.
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

/** Shape of the GET /events/:id response, narrowed to the fields this
 *  route consumes for metadata and structured data. The API is the source
 *  of truth for what each access state exposes; logged-out requests get
 *  the public-preview shape (no exact address, no online link). */
type PlanDetailResponse = {
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
    hostName?: string | null;
    isQa?: boolean;
  };
};

/** Pull share/invite tokens out of the resolved searchParams. */
function readTokens(search: Record<string, string | string[] | undefined>) {
  const shareToken =
    typeof search.share_token === "string" && search.share_token
      ? search.share_token
      : null;
  const inviteToken =
    typeof search.invite_token === "string" && search.invite_token
      ? search.invite_token
      : null;
  return { shareToken, inviteToken };
}

/** Fetch the plan from the API worker. Wrapped in React `cache()` so
 *  generateMetadata and the page component share a single API round trip
 *  per request instead of fetching twice. Tokens are forwarded so the API
 *  returns the token-backed access state for chums_only / invite_only
 *  plans; the API validates them and is the source of truth for what each
 *  access state may expose. Returns null on any error so callers fall
 *  back to their generic branches. */
const fetchPlanDetail = cache(
  async (
    id: string,
    shareToken: string | null,
    inviteToken: string | null
  ): Promise<PlanDetailResponse | null> => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
    if (!base || !id) return null;
    const apiUrl = new URL(`${base}/events/${encodeURIComponent(id)}`);
    if (shareToken) apiUrl.searchParams.set("share_token", shareToken);
    if (inviteToken) apiUrl.searchParams.set("invite_token", inviteToken);
    try {
      const res = await fetch(apiUrl.toString(), { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as PlanDetailResponse;
    } catch {
      return null;
    }
  }
);

/** schema.org/Event structured data for public-visibility plans.
 *
 *  Emitted only for `visibility === "public"` plans (published, or
 *  canceled so search engines learn the cancellation), never for QA,
 *  draft, chums_only, or invite_only plans. Location follows the same
 *  privacy contract as the metadata above: only the approximate
 *  city/region area, never the exact address, coordinates, or online
 *  meeting link. Online plans use a VirtualLocation pointing at the plan
 *  page itself. Returns null when the plan should not carry schema. */
function buildPlanJsonLd(
  id: string,
  data: PlanDetailResponse | null
): Record<string, unknown> | null {
  const ev = data?.ok ? data.event : null;
  if (!ev) return null;
  if (ev.visibility !== "public" || ev.isQa) return null;
  if (ev.status !== "published" && ev.status !== "canceled") return null;
  const title = (ev.title || "").trim();
  if (!title || !ev.startsAt) return null;

  const url = `https://newchums.com/events/${encodeURIComponent(id)}`;
  const isOnline = ev.locationType === "online";

  // Privacy-safe location only. Approximate area comes from the stored
  // locationArea, else is derived from the address with street detail
  // stripped; the raw address itself never appears.
  let location: Record<string, unknown> | undefined;
  if (isOnline) {
    location = { "@type": "VirtualLocation", url };
  } else {
    const area =
      (ev.locationArea || "").trim() || deriveApproxArea(ev.locationAddress);
    if (area) location = { "@type": "Place", name: area };
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: title,
    startDate: ev.startsAt,
    url,
    eventAttendanceMode: isOnline
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    eventStatus:
      ev.status === "canceled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
  };
  if (location) jsonLd.location = location;
  const host = (ev.hostName || "").trim();
  if (host) jsonLd.organizer = { "@type": "Person", name: host };
  const description = (ev.description || "").trim();
  if (description) jsonLd.description = description.slice(0, 500);
  return jsonLd;
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
 *  Image handling: viewable plans ship the static branded share card at
 *  `/og-plan-card.png` (1200x630). Combined with the og:title and
 *  og:description above, a pasted link now unfurls as a branded card that
 *  names the plan and when it happens, instead of bare text.
 *
 *  Why static and not a per-plan generated card (attempted Aug 2026, and
 *  the exact blocker so nobody re-derives it):
 *    - A Next `opengraph-image.tsx` using ImageResponse renders correctly
 *      in `next dev` (verified: real 1200x630 PNG, bundled Gabarito TTF,
 *      ~1.2s), so the design and the privacy gating are not the problem.
 *    - With `export const runtime = "edge"`, `npm run build:worker`
 *      succeeds and emits the route, but the deployed OpenNext server
 *      function cannot load it at request time:
 *        TypeError: Cannot read properties of undefined (reading 'default')
 *        at interopDefault -> loadComponentsImpl -> findPageComponentsImpl
 *      i.e. the edge bundle is not wired into the single workerd server
 *      function OpenNext produces. Route returns 500.
 *    - Without the edge declaration the route is not registered in the
 *      worker at all: the URL 404s and Next emits no og:image meta.
 *    Revisit when @opennextjs/cloudflare supports edge-runtime route
 *    handlers in the server function; the deleted route is in git history
 *    at this commit and only needs its font re-bundled.
 *
 *  The host-uploaded banner is deliberately not used either way: wide
 *  banners crop badly in a 16:9 unfurl box and are unverified user
 *  imagery served under our brand.
 *
 *  The two fallback metadata objects above KEEP their empty `images`
 *  arrays. A gated plan (draft, canceled, QA or invite_only without a
 *  token) therefore ships no image at all, which is the most conservative
 *  option and also stops Next's deep-merge inheriting the root layout's
 *  `/og-image.png`.
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
  const { shareToken, inviteToken } = readTokens(search);
  const hasToken = !!(shareToken || inviteToken);

  // Forward tokens so the API returns the token-backed access state for
  // chums_only / invite_only plans rather than the public-preview shape.
  // The API validates tokens and is the source of truth for what each
  // accessState is allowed to expose; we just consume the response.
  // The fetch is request-scoped via React cache(), so the page component
  // below reuses this same response for its JSON-LD.
  const data = await fetchPlanDetail(id, shareToken, inviteToken);
  if (!data) return FALLBACK_METADATA;

  try {
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
        images: [
          {
            url: "/og-plan-card.png",
            width: 1200,
            height: 630,
            alt: "A plan on NewChums",
          },
        ],
      },
      twitter: {
        // summary_large_image now that a real 1200x630 card exists.
        card: "summary_large_image",
        title: ogTitle,
        description,
        images: ["/og-plan-card.png"],
      },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default async function EventDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const search = (await searchParams) ?? {};
  const { shareToken, inviteToken } = readTokens(search);
  // Resolve auth state on the server so the client can skip
  // `/api/auth/api-token` for logged-out viewers (which would 401 and
  // pollute the browser console / Sentry breadcrumbs). Plan detail is
  // a public canonical surface, share-link traffic and search-engine
  // bots reach it without a session, so this short-circuit matters.
  // Logged-in clients still resolve a fresh token as before.
  const session = await auth();
  const isAuthenticatedFromServer = !!session?.user?.email;
  // Reuses the request-scoped response already fetched by generateMetadata
  // (React cache()); no extra API round trip. Only public-visibility plans
  // produce structured data, see buildPlanJsonLd.
  const planData = await fetchPlanDetail(id, shareToken, inviteToken);
  const jsonLd = buildPlanJsonLd(id, planData);
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <Suspense
        fallback={
          <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
            <CircularProgress />
          </Box>
        }
      >
        <EventDetailClient isAuthenticatedFromServer={isAuthenticatedFromServer} />
      </Suspense>
    </>
  );
}
