"use client";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EventCard, { type EventCardData } from "@/components/events/EventCard";
import { SectionHeader } from "@/components/ui";

const PLACEHOLDER_UPCOMING: EventCardData[] = [
  {
    id: "1",
    title: "Morning Brew & Chat",
    category: "COFFEE & CHAT",
    dateTime: "Tomorrow, 9:00 AM",
    location: "The Daily Grind Cafe",
    attendeeSummary: "3 joined",
  },
  {
    id: "2",
    title: "Catan & Cocktails Night",
    category: "BOARD GAMES",
    dateTime: "Thursday, 7:00 PM",
    location: "The Dice & Drink Hub",
    attendeeSummary: "4/6 joined",
  },
];

const PLACEHOLDER_PAST: EventCardData[] = [
  {
    id: "5",
    title: "Sunset Yoga Session",
    category: "WELLNESS",
    dateTime: "Last Sunday",
    location: "Riverside Park",
    attendeeSummary: "5 attended",
    isPast: true,
  },
  {
    id: "6",
    title: "Weekly Coding Jam",
    category: "TECH",
    dateTime: "Last Wednesday",
    location: "The Hive Co-working",
    attendeeSummary: "8 attended",
    isPast: true,
  },
];

export default function PlansPage() {
  return (
    <Stack spacing={{ xs: 4, sm: 5 }}>
      <Box sx={{ pt: 0.5, pb: 0, mb: 0 }}>
        <Typography
          component="h1"
          sx={{
            mb: 1,
            lineHeight: 1.25,
            fontSize: { xs: "1.75rem", sm: "2rem" },
            letterSpacing: "-0.02em",
            fontWeight: 700,
            color: "text.primary",
          }}
        >
          Your Plans
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{
            fontSize: { xs: "0.875rem", sm: "0.9375rem" },
            fontWeight: 400,
          }}
        >
          Gatherings you&apos;ve joined or are interested in.
        </Typography>
      </Box>

      <Box>
        <SectionHeader title="Your Upcoming Gatherings" emphasis="primary" />
        <Grid container spacing={2}>
          {PLACEHOLDER_UPCOMING.map((event) => (
            <Grid key={event.id} size={{ xs: 12, sm: 6 }}>
              <EventCard event={event} emphasis="upcoming" />
            </Grid>
          ))}
        </Grid>
      </Box>

      <Box sx={{ pt: { xs: 1.5, sm: 2 } }}>
        <SectionHeader title="Your Previous Gatherings" emphasis="secondary" />
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
