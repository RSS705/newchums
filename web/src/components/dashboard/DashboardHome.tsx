"use client";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EventCard, { type EventCardData } from "@/components/events/EventCard";
import EventListItem, { type EventListItemData } from "@/components/events/EventListItem";
import ExploreFilterBar from "@/components/events/ExploreFilterBar";
import { SectionHeader } from "@/components/ui";

const PLACEHOLDER_EXPLORE: EventListItemData[] = [
  {
    id: "3",
    title: "Sunday Park Sketching",
    description: "Bring your sketchbook and meet fellow artists for a relaxing afternoon.",
    dateTime: "Sun, 2pm",
    location: "Central Park",
    attendeeSummary: "3/6 joined",
    distance: "2 KM AWAY",
  },
  {
    id: "4",
    title: "Indie Book Club Chat",
    description: "Discussing our latest pick over coffee.",
    dateTime: "Fri, 6pm",
    location: "Downtown Cafe",
    attendeeSummary: "2/8 joined",
    distance: "1.2 KM AWAY",
  },
];

const PLACEHOLDER_PAST: EventCardData[] = [
  {
    id: "5",
    title: "Sunset Yoga Session",
    dateTime: "Last Sunday",
    location: "",
    category: "",
    isPast: true,
  },
  {
    id: "6",
    title: "Weekly Coding Jam",
    dateTime: "Last Wednesday",
    location: "",
    category: "",
    isPast: true,
  },
];

type DashboardHomeProps = {
  userName?: string | null;
};

export default function DashboardHome({ userName }: DashboardHomeProps) {
  const displayName = userName?.trim() || "there";

  return (
    <Stack spacing={{ xs: 4, sm: 5 }}>
      <Box sx={{ pt: 0.5, pb: 0, mb: 0 }}>
        <Typography
          component="h1"
          sx={{
            mb: 1.5,
            lineHeight: 1.25,
            fontSize: { xs: "1.75rem", sm: "2rem" },
            letterSpacing: "-0.02em",
          }}
        >
          <Box
            component="span"
            sx={{ color: "text.secondary", fontWeight: 500, fontSize: "0.65em" }}
          >
            Welcome back,{" "}
          </Box>
          <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
            {displayName}
          </Box>
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{
            fontSize: { xs: "0.875rem", sm: "0.9375rem" },
            fontWeight: 400,
            whiteSpace: { xs: "normal", sm: "nowrap" },
          }}
        >
          Ready to meet some new chums?
        </Typography>
      </Box>

      <Box>
        <SectionHeader title="Explore New Gatherings" emphasis="primary" />
        <Stack spacing={2}>
          <ExploreFilterBar />
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            {PLACEHOLDER_EXPLORE.map((event) => (
              <EventListItem key={event.id} event={event} />
            ))}
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ pt: { xs: 1.5, sm: 2 } }}>
        <SectionHeader title="Previous Gatherings in your Area" emphasis="primary" />
        <Grid container spacing={2}>
          {PLACEHOLDER_PAST.map((event) => (
            <Grid key={event.id} size={{ xs: 12, sm: 6 }}>
              <EventCard event={event} imageHeight={120} emphasis="past" />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Stack>
  );
}
