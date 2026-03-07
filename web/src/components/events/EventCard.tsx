"use client";

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
import Link from "next/link";

export type PlanEvent = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  locationType: string;
  locationName: string | null;
  locationAddress: string | null;
  onlineLink: string | null;
  maxSeats: number | null;
  visibility: string;
  status: string;
  hobby: string | null;
  hobbySlug?: string | null;
  hostName: string;
  isHost: boolean;
  myRsvpStatus: string | null;
  goingCount: number;
  maybeCount: number;
  distanceKm?: number | null;
};

type EventCardProps = {
  event: PlanEvent;
  isPast?: boolean;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (diffDays === 0) return `Today, ${timeStr}`;
  if (diffDays === 1) return `Tomorrow, ${timeStr}`;
  if (diffDays > 1 && diffDays < 7) {
    return `${d.toLocaleDateString(undefined, { weekday: "long" })}, ${timeStr}`;
  }
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${timeStr}`;
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

export default function EventCard({ event, isPast = false }: EventCardProps) {
  const isCanceled = event.status === "canceled";
  const locationDisplay =
    event.locationType === "online"
      ? "Online"
      : event.locationName || event.locationAddress || "TBD";

  const attendeeSummary =
    event.maxSeats
      ? `${event.goingCount}/${event.maxSeats} going`
      : event.goingCount > 0
        ? `${event.goingCount} going`
        : "No responses yet";

  return (
    <Card
      variant="outlined"
      component="article"
      sx={{
        overflow: "hidden",
        borderRadius: { xs: 2, sm: 2.5 },
        borderColor: isPast || isCanceled ? "grey.200" : "divider",
        boxShadow: isPast ? "none" : "0 1px 4px rgba(0,0,0,0.05)",
        transition: "box-shadow 0.2s, border-color 0.2s",
        bgcolor: isPast || isCanceled ? "grey.50" : "background.paper",
        opacity: isCanceled ? 0.7 : 1,
        "&:hover": {
          boxShadow: isPast ? "0 1px 3px rgba(0,0,0,0.03)" : "0 4px 12px rgba(0,0,0,0.08)",
        },
      }}
    >
      <CardActionArea component={Link} href={`/events/${event.id}`}>
        <CardContent sx={{ py: { xs: 2, sm: 2.5 }, px: { xs: 2, sm: 2.5 } }}>
          {/* Top row: hobby chip + visibility */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              {event.hobby && (
                <Chip
                  label={event.hobby}
                  size="small"
                  sx={{
                    bgcolor: isPast ? "grey.200" : "primary.light",
                    color: isPast ? "text.secondary" : "primary.dark",
                    fontWeight: 500,
                    fontSize: "0.6875rem",
                    height: 22,
                  }}
                />
              )}
              {isCanceled && (
                <Chip
                  label="Canceled"
                  size="small"
                  sx={{ bgcolor: "error.light", color: "error.dark", fontWeight: 600, fontSize: "0.6875rem", height: 22 }}
                />
              )}
            </Stack>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6875rem" }}>
              {visibilityLabel(event.visibility)}
            </Typography>
          </Stack>

          {/* Title */}
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.75, fontSize: "1.0625rem", lineHeight: 1.3 }}>
            {event.title}
          </Typography>

          {/* Host */}
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
            {event.isHost ? "Hosted by you" : `Hosted by ${event.hostName}`}
          </Typography>

          {/* Meta */}
          <Stack spacing={0.5}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <AccessTimeRoundedIcon sx={{ fontSize: 15, color: isPast ? "text.disabled" : "primary.main" }} />
              <Typography variant="body2" color="text.secondary">
                {formatDateTime(event.startsAt)}
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              {event.locationType === "online" ? (
                <LinkRoundedIcon sx={{ fontSize: 15, color: isPast ? "text.disabled" : "primary.main" }} />
              ) : (
                <PlaceRoundedIcon sx={{ fontSize: 15, color: isPast ? "text.disabled" : "primary.main" }} />
              )}
              <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1 }}>
                {locationDisplay}
              </Typography>
              {event.distanceKm != null && (
                <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, ml: 0.5, fontSize: "0.6875rem" }}>
                  {event.distanceKm < 1 ? "< 1 km" : `${Math.round(event.distanceKm)} km`}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <PeopleOutlineRoundedIcon sx={{ fontSize: 15, color: "text.disabled" }} />
              <Typography variant="body2" color="text.secondary">
                {attendeeSummary}
              </Typography>
            </Stack>
          </Stack>

          {/* RSVP status (for non-hosts) */}
          {!event.isHost && (
            <Box sx={{ mt: 1.5, pt: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
              <Typography variant="caption" sx={{ color: rsvpColor(event.myRsvpStatus), fontWeight: 600 }}>
                {rsvpLabel(event.myRsvpStatus)}
              </Typography>
            </Box>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
