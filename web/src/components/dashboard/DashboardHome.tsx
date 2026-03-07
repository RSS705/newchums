"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
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

type DashboardHomeProps = {
  greetingName: string;
};

export default function DashboardHome({ greetingName }: DashboardHomeProps) {
  return (
    <Stack spacing={{ xs: 4, sm: 5 }}>
      <Box sx={{ pt: 0.5, pb: 0, mb: 0, textAlign: { xs: "center", sm: "left" } }}>
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
            {greetingName}
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

      <Box sx={{ mt: { xs: -0.5, sm: 0 } }}>
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
    </Stack>
  );
}
