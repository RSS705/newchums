import type { Metadata } from "next";
import { Suspense } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import EventDetailClient from "./EventDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

const FALLBACK_METADATA: Metadata = {
  title: "Plan",
  description:
    "A gathering on NewChums. Sign in to RSVP, suggest alt times, or join the chat.",
  robots: { index: true, follow: true },
};

/** Dynamic metadata for public plan detail pages. Fetches GET /events/:id
 *  WITHOUT authentication so the response is exactly the logged-out
 *  public-preview shape: no exact address, no online link, no attendee
 *  identities, @handle-only host name. That's the privacy contract for
 *  everything this function emits. QA plans (is_qa=true) and draft /
 *  canceled plans noindex and use the generic fallback title so the
 *  existence of super-admin-only plans or unfinished drafts never leaks
 *  into search. Failing to fetch falls back silently; the plan page
 *  still renders.
 *
 *  Safe fields consumed from the public response: title, description,
 *  hobby, hobbies (names only), startsAt, timezone, locationDisplay
 *  (approximate), locationArea, bannerKey, community {slug, name}. All
 *  other fields are explicitly null or hidden in the public response. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!base || !id) return FALLBACK_METADATA;

  try {
    const res = await fetch(`${base}/events/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return FALLBACK_METADATA;
    const data = (await res.json()) as {
      ok?: boolean;
      event?: {
        title?: string | null;
        description?: string | null;
        startsAt?: string | null;
        locationType?: string | null;
        locationDisplay?: string | null;
        locationArea?: string | null;
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

    // Never surface QA plans in metadata; they're super-admin-only and
    // their visibility outside the app is a non-starter. Also noindex
    // non-published plans (draft, canceled) so transient states don't
    // get indexed.
    if (ev.isQa || (ev.status && ev.status !== "published")) {
      return { ...FALLBACK_METADATA, robots: { index: false, follow: false } };
    }
    // invite_only plans should never show up in search even though the
    // page technically responds; the base visibility gate is the source
    // of truth for product-side discoverability, so mirror it here.
    if (ev.visibility === "invite_only") {
      return { ...FALLBACK_METADATA, robots: { index: false, follow: false } };
    }

    const title = (ev.title || "").trim() || "Plan";
    const hobby = ev.hobby || ev.hobbies?.[0]?.name || null;
    // Build a short description with only public-safe fields: hobby name
    // plus approximate area OR "Online." Never include exact address,
    // online link, attendee counts/identities.
    const locationBit = ev.locationType === "online"
      ? "Online"
      : (ev.locationDisplay || ev.locationArea || "").trim();
    const descriptionPieces = [
      hobby ? `A ${hobby.toLowerCase()} plan on NewChums.` : "A plan on NewChums.",
      locationBit ? locationBit : null,
    ].filter(Boolean);
    const description = descriptionPieces.join(" ").slice(0, 200);

    const canonicalPath = `/events/${encodeURIComponent(id)}`;
    const imageUrl = ev.bannerKey
      ? `${base}/events/${encodeURIComponent(id)}/banner`
      : undefined;

    return {
      title,
      description,
      robots: { index: true, follow: true },
      alternates: { canonical: canonicalPath },
      openGraph: {
        title,
        description,
        url: canonicalPath,
        type: "article",
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
      twitter: {
        title,
        description,
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default function EventDetailPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
          <CircularProgress />
        </Box>
      }
    >
      <EventDetailClient />
    </Suspense>
  );
}
