"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import EventCard, { type PlanEvent } from "@/components/events/EventCard";
import { apiFetch } from "@/lib/apiClient";

type Variant = "public_explore" | "logged_in_explore" | "community";

type RecentlyHappenedSectionProps = {
  variant: Variant;
  /** Required for variant="community". Used to scope the fetch to one community. */
  communityId?: string;
  /** Pass through for hobby-match highlight on the logged-in surface. */
  viewerHobbyCategories?: ReadonlySet<string>;
  /** Whether the viewer is signed in. Affects whether the auth header is sent
   *  on the community-scoped fetch. The public endpoint does not require it. */
  isAuthenticated?: boolean;
};

// All three variants share the same title now ("Recently happened"). The
// eyebrow used to repeat the title verbatim, so we dropped it: the inline
// history icon next to the title carries the same affordance with less
// visual weight, which fits a section meant to read as social proof
// rather than a primary feed.
const COPY: Record<Variant, { title: string; subtitle: string }> = {
  public_explore: {
    title: "Recently happened",
    subtitle: "A few public plans that already ran through NewChums.",
  },
  logged_in_explore: {
    title: "Recently happened",
    subtitle: "A few public plans that already ran through NewChums.",
  },
  community: {
    title: "Recently happened",
    subtitle: "Past gatherings from this community.",
  },
};

export default function RecentlyHappenedSection({
  variant,
  communityId,
  viewerHobbyCategories,
  isAuthenticated,
}: RecentlyHappenedSectionProps) {
  const [events, setEvents] = useState<PlanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let url: string;
        let auth = false;
        if (variant === "community") {
          if (!communityId) {
            setLoading(false);
            setFetched(true);
            return;
          }
          url = `/communities/${communityId}/events?past=true&limit=6`;
          auth = isAuthenticated === true;
        } else {
          url = "/events/recently-happened/public?limit=6";
        }
        const res = await apiFetch(url, auth ? { auth: true } : undefined);
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; events: PlanEvent[] };
          if (data.ok) setEvents(data.events ?? []);
        }
      } catch { /* degrade silently, social-proof block is non-critical */ }
      if (cancelled) return;
      setLoading(false);
      setFetched(true);
    })();
    return () => { cancelled = true; };
  }, [variant, communityId, isAuthenticated]);

  const copy = COPY[variant];

  // Hide the section entirely when empty on every surface. Don't render
  // any heading or skeleton residue in that case, the surface already
  // has a primary upcoming feed and an empty social-proof block would
  // feel like dead air. Same behavior on the community detail page,
  // an unused "Recently happened" block read as accidental rather than
  // informative.
  if (fetched && events.length === 0) return null;

  // Past cards render in the same grid sizing as the upcoming feed
  // (xs:12, sm:6, md:4) and stay left-aligned even when there's only
  // one. Centering or widening a lone card made the section read as
  // featured / hero, which competed with the upcoming feed for
  // attention. Past plans are social proof, "here is one more
  // example", not the main thing on the page.
  const cardSize = { xs: 12, sm: 6, md: 4 } as const;

  return (
    <Box component="section">
      <Stack spacing={0.75} sx={{ mb: { xs: 2, sm: 2.5 } }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              bgcolor: "grey.200",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <HistoryRoundedIcon sx={{ color: "text.secondary", fontSize: 16 }} />
          </Box>
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: "1.25rem", sm: "1.5rem" },
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: "-0.02em",
            }}
          >
            {copy.title}
          </Typography>
        </Stack>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 560, lineHeight: 1.6, fontSize: { xs: "0.9375rem", sm: "1rem" } }}
        >
          {copy.subtitle}
        </Typography>
      </Stack>

      {loading ? (
        <Grid container spacing={{ xs: 1.5, sm: 2 }}>
          {[0, 1, 2].map((i) => (
            <Grid key={i} size={cardSize} sx={{ display: "flex" }}>
              <Skeleton variant="rounded" sx={{ width: "100%", height: 280, borderRadius: 3, bgcolor: "grey.100" }} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={{ xs: 1.5, sm: 2 }}>
          {events.map((ev) => (
            <Grid key={ev.id} size={cardSize} sx={{ display: "flex" }}>
              <EventCard event={ev} isPast hideRsvp viewerHobbyCategories={viewerHobbyCategories} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
