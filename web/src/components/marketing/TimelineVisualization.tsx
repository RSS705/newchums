"use client";

import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

const TIMELINE_ITEMS = [
  { label: "Casual acquaintance", hours: 50, proportion: 0.25 },
  { label: "Friend", hours: 90, proportion: 0.45 },
  { label: "Close friend", hours: 200, proportion: 1 },
] as const;

/**
 * "Normalize the Pace" timeline: horizontal progress bars showing hours to friendship
 * (Jeffrey Hall's research). Dark highlight block with accent-colored bars.
 */
export default function TimelineVisualization() {
  const theme = useTheme();
  const secondaryMain = theme.palette.secondary.main;
  const darkBg =
    theme.palette.mode === "light"
      ? theme.palette.primary.dark
      : theme.palette.background.default;

  return (
    <Box
      component="section"
        sx={{
          py: 6,
          px: { xs: 2, sm: 3 },
          backgroundColor: darkBg,
        color: "background.paper",
        mx: { xs: -2, sm: -3 },
      }}
    >
      <Box maxWidth={800} mx="auto">
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Normalize the Pace
        </Typography>
        <Typography variant="body1" sx={{ mb: 2, opacity: 0.9, lineHeight: 1.65 }}>
          Research by Jeffrey Hall suggests that friendship develops through accumulated time
          together: roughly 50 hours to move from acquaintance to casual friend, 90 hours to become
          friends, and 200+ hours to reach close friendship. NewChums helps create the repeated,
          low-pressure interactions that add up.
        </Typography>
        <Typography
          variant="caption"
          sx={{ display: "block", mb: 4, opacity: 0.8 }}
        >
          Hall, J. A. (2019). How many hours does it take to make a friend? Journal of Social and
          Personal Relationships, 36(4), 1278–1296.
        </Typography>

        <Stack spacing={4}>
          {TIMELINE_ITEMS.map((item) => (
            <Box key={item.label}>
              <Typography variant="body2" sx={{ mb: 1, opacity: 0.95 }}>
                {item.label} · {item.hours}{item.hours >= 200 ? "+" : ""} hours
              </Typography>
              <LinearProgress
                variant="determinate"
                value={item.proportion * 100}
                sx={{
                  height: 10,
                  borderRadius: 1,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  "& .MuiLinearProgress-bar": {
                    backgroundColor: secondaryMain,
                  },
                }}
              />
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
