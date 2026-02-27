"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";

export type EventListItemData = {
  id: string;
  title: string;
  description?: string;
  dateTime: string;
  location: string;
  attendeeSummary?: string;
  distance?: string;
  thumbnailUrl?: string | null;
};

type EventListItemProps = {
  event: EventListItemData;
};

export default function EventListItem({ event }: EventListItemProps) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 1.5, sm: 2 }}
      component="article"
      sx={{
        position: "relative",
        p: { xs: 1.5, sm: 2 },
        border: 1,
        borderColor: "divider",
        borderRadius: { xs: 2, sm: 2.5 },
        alignItems: { sm: "stretch" },
        bgcolor: "background.paper",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        "&:hover": {
          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
          borderColor: "grey.300",
        },
      }}
    >
      <Box
        sx={{
          width: { xs: "100%", sm: 80 },
          height: 80,
          flexShrink: 0,
          bgcolor: "grey.200",
          borderRadius: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          thumb
        </Typography>
      </Box>
      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: "1rem" }}>
          {event.title}
        </Typography>
        {event.description && (
          <Typography variant="body2" color="text.secondary">
            {event.description}
          </Typography>
        )}
        <Stack direction="row" flexWrap="wrap" spacing={2} sx={{ gap: 0.5 }}>
          {event.attendeeSummary && (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <PeopleOutlineRoundedIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" color="text.secondary">
                {event.attendeeSummary}
              </Typography>
            </Stack>
          )}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <AccessTimeRoundedIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption" color="text.secondary">
              {event.dateTime}
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <PlaceRoundedIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption" color="text.secondary">
              {event.location}
            </Typography>
          </Stack>
        </Stack>
      </Stack>
      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "stretch", sm: "flex-end" },
          justifyContent: { xs: "center", sm: "flex-end" },
          pt: { sm: 2 },
        }}
      >
        <Button
          variant="contained"
          color="primary"
          size="small"
          sx={{
            borderRadius: 2,
            textTransform: "capitalize",
            boxShadow: "none",
            fontWeight: 600,
            width: { xs: "100%", sm: "auto" },
            transition: "opacity 0.2s ease, transform 0.15s ease",
            "&:hover": { boxShadow: "none", opacity: 0.95 },
            "&:active": { transform: "scale(0.98)" },
          }}
        >
          Join
        </Button>
      </Box>
    </Stack>
  );
}
