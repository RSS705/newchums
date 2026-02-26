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

type EventCardEmphasis = "upcoming" | "past" | "default";

type EventCardProps = {
  event: EventCardData;
  imageHeight?: number;
  emphasis?: EventCardEmphasis;
};

export default function EventCard({
  event,
  imageHeight = 180,
  emphasis = "default",
}: EventCardProps) {
  const isUpcoming = emphasis === "upcoming" || (!event.isPast && emphasis === "default");
  const isPast = emphasis === "past" || event.isPast;

  return (
    <Card
      variant="outlined"
      component="article"
      sx={{
        overflow: "hidden",
        borderRadius: 2.5,
        borderColor: isPast ? "grey.200" : "divider",
        borderWidth: 1,
        boxShadow: isPast
          ? "none"
          : "0 1px 4px rgba(0,0,0,0.05)",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        bgcolor: isPast ? "grey.100" : "background.paper",
        "&:hover": {
          boxShadow: isPast
            ? "0 1px 3px rgba(0,0,0,0.03)"
            : "0 6px 16px rgba(0,0,0,0.08)",
        },
      }}
    >
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
              bgcolor: "grey.500",
              color: "white",
              opacity: 0.9,
            }}
          />
        )}
        <Typography variant="caption" color="text.secondary">
          300×300
        </Typography>
      </Box>
      <CardContent
        sx={{
          py: isUpcoming ? 2.5 : 2,
          "&:last-child": { pb: isUpcoming ? 2.5 : 2 },
        }}
      >
        {!event.isPast && (
          <Chip
            label={event.category}
            size="small"
            sx={{
              mb: 1.25,
              bgcolor: isUpcoming ? "primary.main" : "primary.light",
              color: isUpcoming ? "primary.contrastText" : "primary.dark",
              fontWeight: isUpcoming ? 600 : 500,
              fontSize: isUpcoming ? "0.75rem" : undefined,
            }}
          />
        )}
        <Typography
          variant="subtitle1"
          fontWeight={isUpcoming ? 700 : 600}
          gutterBottom
          sx={isUpcoming ? { fontSize: "1.0625rem" } : undefined}
        >
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
