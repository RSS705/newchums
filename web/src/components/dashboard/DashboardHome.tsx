"use client";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EventCard, { type EventCardData } from "@/components/events/EventCard";
import EventListItem, { type EventListItemData } from "@/components/events/EventListItem";
import ExploreFilterBar from "@/components/events/ExploreFilterBar";
import SectionHeader from "@/components/dashboard/SectionHeader";

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
  upcomingCount?: number;
};

export default function DashboardHome({
  userName,
  upcomingCount = 2,
}: DashboardHomeProps) {
  const displayName = userName?.trim() || "there";

  return (
    <Stack spacing={4}>
      <Box>
        <Typography component="h1" variant="h4" fontWeight={700} gutterBottom>
          Welcome back, {displayName}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          You have {upcomingCount} gathering{upcomingCount !== 1 ? "s" : ""} coming up this
          week. Ready to meet some new chums?
        </Typography>
      </Box>

      <Box>
        <SectionHeader title="Your Upcoming Gatherings" />
        <Grid container spacing={2}>
          {PLACEHOLDER_UPCOMING.map((event) => (
            <Grid key={event.id} size={{ xs: 12, sm: 6 }}>
              <EventCard event={event} />
            </Grid>
          ))}
        </Grid>
      </Box>

      <Box>
        <SectionHeader title="Explore New Gatherings" />
        <Stack spacing={2}>
          <ExploreFilterBar />
          <Stack spacing={2}>
            {PLACEHOLDER_EXPLORE.map((event) => (
              <EventListItem key={event.id} event={event} />
            ))}
          </Stack>
        </Stack>
      </Box>

      <Box>
        <SectionHeader title="Previous Gatherings in your Area" />
        <Grid container spacing={2}>
          {PLACEHOLDER_PAST.map((event) => (
            <Grid key={event.id} size={{ xs: 12, sm: 6 }}>
              <EventCard event={event} imageHeight={120} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Stack>
  );
}
