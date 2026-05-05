"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { getAvatarBaseUrl, getImageFallbackBaseUrl } from "@/lib/apiClient";
import { getGradientForEventId } from "@/lib/eventBanners";
import { effectiveCategoryOf } from "@/lib/interestUtils";

export type PlanEvent = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  timezone?: string | null;
  locationType: string;
  locationDisplay?: string;
  locationName: string | null;
  locationAddress: string | null;
  onlineLink: string | null;
  maxSeats: number | null;
  visibility: string;
  status: string;
  hobby: string | null;
  hobbySlug?: string | null;
  hobbies?: Array<{ name: string; slug: string; category?: string | null }>;
  hostName: string;
  isHost: boolean;
  myRsvpStatus: string | null;
  goingCount: number;
  maybeCount: number;
  distanceKm?: number | null;
  bannerKey?: string | null;
  /** Direct banner URL for static/demo images (bypasses API-based banner resolution) */
  bannerUrl?: string | null;
  hasUnreadChat?: boolean;
  communities?: Array<{ id: string; slug: string; name: string }>;
  hasPrefMismatch?: boolean;
  isQa?: boolean;
};

type EventCardProps = {
  event: PlanEvent;
  isPast?: boolean;
  /** Example/sample card on marketing surfaces: no RSVP row, links to signup unless overridden */
  isExample?: boolean;
  /** When set, the whole card links here (e.g. /signup). Example cards default to signup when omitted. */
  hrefOverride?: string;
  /** Viewer's effective hobby categories. Hobby chips whose effective category
   *  is in this set get a subtle highlight. See `effectiveCategoryOf` in
   *  web/src/lib/interestUtils.ts. */
  viewerHobbyCategories?: ReadonlySet<string>;
  /** Hide the RSVP status row (e.g. on public preview where the viewer has no RSVP) */
  hideRsvp?: boolean;
};

function formatDateTime(iso: string, tz?: string | null, isPast?: boolean): string {
  const d = new Date(iso);
  const tzOpts: Intl.DateTimeFormatOptions = tz ? { timeZone: tz } : {};

  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true, ...tzOpts });

  // Compare calendar dates in the event's timezone (or local if unavailable)
  const eventDay = d.toLocaleDateString("en-CA", tzOpts); // YYYY-MM-DD
  const todayDay = new Date().toLocaleDateString("en-CA", tzOpts);

  // Past plans get a "Happened" prefix instead of upcoming language so a
  // social-proof card never reads as if it might still be joinable. We
  // also skip the "Today / Tomorrow / Weekday" branches because those
  // only make sense for plans in the future, a past plan that ran
  // earlier today should still read "Happened Apr 28" style.
  if (isPast) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDay = yesterday.toLocaleDateString("en-CA", tzOpts);
    if (eventDay === todayDay) return `Happened today, ${timeStr}`;
    if (eventDay === yesterdayDay) return `Happened yesterday, ${timeStr}`;
    return `Happened ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...tzOpts })}`;
  }

  if (eventDay === todayDay) return `Today, ${timeStr}`;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = tomorrow.toLocaleDateString("en-CA", tzOpts);
  if (eventDay === tomorrowDay) return `Tomorrow, ${timeStr}`;

  const diffMs = d.getTime() - Date.now();
  if (diffMs > 0 && diffMs < 7 * 86400000) {
    return `${d.toLocaleDateString(undefined, { weekday: "long", ...tzOpts })}, ${timeStr}`;
  }
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...tzOpts })}, ${timeStr}`;
}

function visibilityLabel(v: string): string {
  if (v === "invite_only") return "Invite only";
  if (v === "chums_only") return "Chums only";
  return "Public";
}

function rsvpLabel(s: string | null): string {
  if (s === "going") return "Going";
  if (s === "maybe") return "Maybe";
  if (s === "cant_make_it") return "Can't make it";
  return "Not responded";
}

function rsvpColor(s: string | null): string {
  if (s === "going") return "success.main";
  if (s === "maybe") return "warning.main";
  if (s === "cant_make_it") return "text.disabled";
  return "text.secondary";
}

const EventCard = React.memo(function EventCard({
  event,
  isPast = false,
  isExample = false,
  hrefOverride,
  viewerHobbyCategories,
  hideRsvp = false,
}: EventCardProps) {
  const isCanceled = event.status === "canceled";
  const hobbies = event.hobbies?.length
    ? event.hobbies
    : event.hobby ? [{ name: event.hobby, slug: event.hobbySlug ?? "" }] : [];
  const locationDisplay =
    event.locationDisplay ??
    (event.locationType === "online"
      ? "Online"
      : event.locationName || event.locationAddress || "TBD");

  const attendeeSummary =
    event.maxSeats
      ? `${event.goingCount}/${event.maxSeats} going`
      : event.goingCount > 0
        ? `${event.goingCount} going`
        : "No responses yet";

  const primaryBannerUrl = event.bannerUrl
    ? event.bannerUrl
    : event.bannerKey
      ? `${getAvatarBaseUrl()}/events/${event.id}/banner`
      : null;
  const fallbackBannerUrl = React.useMemo(() => {
    if (event.bannerUrl) return null; // static URL, no fallback needed
    if (!event.bannerKey) return null;
    const fb = getImageFallbackBaseUrl();
    return fb ? `${fb}/events/${event.id}/banner` : null;
  }, [event.bannerUrl, event.bannerKey, event.id]);
  const [bannerSrc, setBannerSrc] = React.useState(primaryBannerUrl);
  const [bannerFailed, setBannerFailed] = React.useState(false);
  const bannerUrl = bannerSrc && !bannerFailed ? bannerSrc : null;
  const handleBannerError = React.useCallback(() => {
    if (bannerSrc === primaryBannerUrl && fallbackBannerUrl) {
      setBannerSrc(fallbackBannerUrl);
    } else {
      setBannerFailed(true);
    }
  }, [bannerSrc, primaryBannerUrl, fallbackBannerUrl]);
  const fallbackGradient = getGradientForEventId(event.id);

  const cardHref =
    hrefOverride ?? (isExample ? "/signup" : `/events/${event.id}`);

  return (
    <Card
      variant="outlined"
      component="article"
      sx={{
        overflow: "hidden",
        borderRadius: 3,
        borderColor: isPast || isCanceled ? "grey.200" : "grey.200",
        boxShadow: isPast ? "none" : "0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)",
        transition: "box-shadow 0.2s ease, transform 0.15s ease",
        bgcolor: isPast || isCanceled ? "grey.100" : "background.paper",
        opacity: isCanceled ? 0.65 : 1,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        "&:hover": {
          boxShadow: isPast ? "0 1px 3px rgba(0,0,0,0.03)" : "0 4px 16px rgba(0,0,0,0.08)",
          transform: isPast ? "none" : "translateY(-1px)",
        },
      }}
    >
      <CardActionArea
        component={Link}
        href={cardHref}
        sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "stretch", minHeight: 0 }}
      >
        {/* Banner, uploaded photo or deterministic gradient fallback */}
        <Box
          sx={{
            width: "100%",
            height: 120,
            overflow: "hidden",
            flexShrink: 0,
            background: bannerUrl ? undefined : fallbackGradient,
            filter: isPast || isCanceled ? "grayscale(50%)" : "none",
            opacity: isPast || isCanceled ? 0.75 : 1,
          }}
        >
          {bannerUrl && (
            <Box
              component="img"
              src={bannerUrl}
              alt=""
              onError={handleBannerError}
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          )}
        </Box>
        <CardContent sx={{ py: { xs: 2.25, sm: 2.5 }, px: { xs: 2.25, sm: 2.5 }, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Top row: hobby chip + visibility */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
              {hobbies.map((h) => {
                const isMatch =
                  !isPast &&
                  viewerHobbyCategories?.has(effectiveCategoryOf(h));
                return (
                  <Chip
                    key={h.slug}
                    label={h.name}
                    size="small"
                    sx={{
                      bgcolor: isPast ? "grey.200" : isMatch ? "primary.main" : "primary.light",
                      color: isPast ? "text.secondary" : isMatch ? "primary.contrastText" : "primary.dark",
                      fontWeight: 600,
                      fontSize: "0.6875rem",
                    }}
                  />
                );
              })}
              {event.isQa && (
                <Chip
                  label="QA"
                  size="small"
                  sx={{ bgcolor: "warning.light", color: "warning.dark", fontWeight: 700, fontSize: "0.6875rem" }}
                />
              )}
              {isCanceled && (
                <Chip
                  label="Canceled"
                  size="small"
                  sx={{ bgcolor: "error.light", color: "error.dark", fontWeight: 600, fontSize: "0.6875rem" }}
                />
              )}
            </Stack>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6875rem" }}>
              {visibilityLabel(event.visibility)}
            </Typography>
          </Stack>

          {/* Title */}
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
            <Typography fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.35, flex: 1, minWidth: 0 }}>
              {event.title}
            </Typography>
            {event.hasUnreadChat && (
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  flexShrink: 0,
                }}
              />
            )}
          </Stack>

          {/* Host */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: event.communities && event.communities.length > 0 ? 0.5 : 1.75, fontSize: "0.8125rem" }}>
            {event.isHost ? "Hosted by you" : `Hosted by ${event.hostName}`}
          </Typography>

          {/* Community attribution */}
          {event.communities && event.communities.length > 0 && (
            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 0.75 }}>
              <GroupsRoundedIcon sx={{ fontSize: 16, color: "text.disabled", mt: "1px", flexShrink: 0, opacity: 0.85 }} />
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", lineHeight: 1.4, minWidth: 0 }}>
                {event.communities.map((c) => c.name).join(", ")}
              </Typography>
            </Stack>
          )}

          {/* Meta */}
          <Stack spacing={0.75}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <AccessTimeRoundedIcon sx={{ fontSize: 16, color: isPast ? "text.disabled" : "primary.main", opacity: 0.85 }} />
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                {formatDateTime(event.startsAt, event.timezone, isPast)}
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              {event.locationType === "online" ? (
                <LinkRoundedIcon sx={{ fontSize: 16, color: isPast ? "text.disabled" : "primary.main", opacity: 0.85 }} />
              ) : (
                <PlaceRoundedIcon sx={{ fontSize: 16, color: isPast ? "text.disabled" : "primary.main", opacity: 0.85 }} />
              )}
              <Typography
                variant="body2"
                color="text.secondary"
                noWrap={!isExample}
                sx={{
                  flex: 1,
                  fontSize: "0.8125rem",
                  ...(isExample ? { whiteSpace: "normal", lineHeight: 1.45 } : {}),
                }}
              >
                {locationDisplay}
              </Typography>
              {event.distanceKm != null && (
                <Chip
                  label={event.distanceKm < 1 ? "< 1 km" : `${Math.round(event.distanceKm)} km`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: "0.6875rem", height: 20, borderColor: "grey.300", color: "text.secondary" }}
                />
              )}
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <PeopleOutlineRoundedIcon sx={{ fontSize: 16, color: "text.disabled", opacity: 0.85 }} />
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", flex: 1 }}>
                {attendeeSummary}
              </Typography>
              {event.hasPrefMismatch && !isPast && !isExample && (
                <Tooltip
                  title="Some people in this plan may not fully match your chum preferences"
                  arrow
                  placement="top"
                  enterTouchDelay={0}
                >
                  <FlagRoundedIcon
                    sx={{
                      fontSize: 15,
                      color: "warning.main",
                      opacity: 0.85,
                      cursor: "help",
                      flexShrink: 0,
                    }}
                  />
                </Tooltip>
              )}
            </Stack>
          </Stack>

          {/* Viewer participation row. For attendees this shows their RSVP
              status (Going / Maybe / Not responded); for hosts it shows a
              clear "You're hosting" state so the card always tells the viewer
              how they relate to the plan at a glance. Hidden on example
              cards and on surfaces that opt out via `hideRsvp`. */}
          {!isExample && !hideRsvp && (
            <Box sx={{ mt: 1.75, pt: 1.25, borderTop: "1px solid", borderColor: "grey.200" }}>
              <Typography
                variant="body2"
                sx={{
                  color: event.isHost ? "primary.main" : rsvpColor(event.myRsvpStatus),
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                }}
              >
                {event.isHost ? "You're hosting" : rsvpLabel(event.myRsvpStatus)}
              </Typography>
            </Box>
          )}
          {/* Spacer: fills remaining space so cards in a row share equal height */}
          <Box sx={{ flex: 1, minHeight: 0 }} />
        </CardContent>
      </CardActionArea>
    </Card>
  );
});

export default EventCard;
