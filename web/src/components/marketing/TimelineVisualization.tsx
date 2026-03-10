"use client";

import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

const TIMELINE_ITEMS = [
  {
    accent: "Around 50 hours",
    rest: " of shared time and an acquaintance starts to feel like a casual friend",
    proportion: 0.25,
  },
  {
    accent: "Around 90 hours",
    rest: " together and a real friendship is taking shape",
    proportion: 0.45,
  },
  {
    accent: "200+ hours",
    rest: " of shared experiences and you've built something that can genuinely last",
    proportion: 1,
  },
] as const;

/**
 * "Normalize the Pace" timeline: horizontal progress bars showing hours to friendship
 * (Jeffrey Hall's research). Dark highlight block with accent-colored bars.
 */
export default function TimelineVisualization() {
  const theme = useTheme();
  const darkBg =
    theme.palette.mode === "light"
      ? theme.palette.primary.dark
      : theme.palette.background.default;

  return (
    <Box
      component="section"
      sx={{
        py: { xs: 4, sm: 6 },
        px: { xs: 2, sm: 3 },
        backgroundColor: darkBg,
        color: "background.paper",
        mx: { xs: -2, sm: -3 },
      }}
    >
      <Box maxWidth={800} mx="auto">
        <Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <Typography variant="h5" fontWeight={700} gutterBottom sx={{ fontSize: { xs: "1.15rem", sm: "1.5rem" } }}>
            Normalize the Pace
          </Typography>
          <Typography variant="body1" sx={{ mb: 4, opacity: 0.9, lineHeight: 1.65 }}>
            Friendships don&apos;t form overnight, and that&apos;s completely normal. Research by
            Jeffrey Hall (University of Kansas) found that connection develops naturally through
            shared time, and the milestones are more reachable than you might expect:
          </Typography>
        </Box>

        <Stack spacing={{ xs: 3, sm: 4 }}>
          {TIMELINE_ITEMS.map((item) => (
            <Box key={item.accent}>
              <Typography variant="body2" sx={{ mb: 1, opacity: 0.95, fontSize: { xs: "0.8125rem", sm: "0.875rem" } }}>
                <Box component="span" sx={{ color: "#F7CE16", fontWeight: 600 }}>
                  {item.accent}
                </Box>
                {item.rest}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={item.proportion * 100}
                sx={{
                  height: 10,
                  borderRadius: 1,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  "& .MuiLinearProgress-bar": {
                    backgroundColor: "#F7CE16",
                  },
                }}
              />
            </Box>
          ))}
        </Stack>

        <Typography
          variant="body1"
          sx={{ mt: { xs: 4, sm: 5 }, opacity: 0.9, lineHeight: 1.65, textAlign: { xs: "center", sm: "left" } }}
        >
          When you meet regularly around something you enjoy, those hours have a way of adding up on
          their own.
        </Typography>

        <Typography
          variant="caption"
          sx={{ display: "block", mt: { xs: 3, sm: 4 }, opacity: 0.55, textAlign: { xs: "center", sm: "left" } }}
        >
          Hall, J. A. (2019). How many hours does it take to make a friend? Journal of Social and
          Personal Relationships, 36(4), 1278–1296.
        </Typography>
      </Box>
    </Box>
  );
}
