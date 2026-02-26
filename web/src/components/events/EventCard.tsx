"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";

export type EventCardData = {
  id: string;
  title: string;
  category: string;
  dateTime: string;
  location: string;
  /** e.g. "3/6 joined" or "4 going" */
  attendeeSummary?: string;
  /** Image URL or placeholder */
  imageUrl?: string | null;
  isPast?: boolean;
};

type EventCardProps = {
  event: EventCardData;
  imageHeight?: number;
};

export default function EventCard({ event, imageHeight = 180 }: EventCardProps) {
  return (
    <Card variant="outlined" sx={{ overflow: "hidden" }}>
      <Box
        sx={{
          position: "relative",
          height: imageHeight,
          bgcolor: "grey.200",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {event.isPast && (
          <Chip
            label="PAST"
            size="small"
            sx={{
              position: "absolute",
              top: 8,
              left: 8,
              bgcolor: "grey.600",
              color: "white",
            }}
          />
        )}
        <Typography variant="caption" color="text.secondary">
          300×300
        </Typography>
      </Box>
      <CardContent>
        {!event.isPast && (
          <Chip
            label={event.category}
            size="small"
            sx={{ mb: 1, bgcolor: "primary.light", color: "primary.dark" }}
          />
        )}
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {event.title}
        </Typography>
        <Stack spacing={0.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AccessTimeRoundedIcon sx={{ fontSize: 16, color: "primary.main" }} />
            <Typography variant="body2" color="text.secondary">
              {event.dateTime}
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1}>
            <PlaceRoundedIcon sx={{ fontSize: 16, color: "primary.main" }} />
            <Typography variant="body2" color="text.secondary">
              {event.location}
            </Typography>
          </Stack>
          {event.attendeeSummary && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <PeopleOutlineRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="body2" color="text.secondary">
                {event.attendeeSummary}
              </Typography>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
