"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import { AppCard } from "@/components/ui";
import { type TimelineEntry, formatWhen } from "./mtgTypes";

/** The dates that matter to players, each with done / now / upcoming, shown
 *  in the viewer's own time zone. The current phase is highlighted. */
export default function SeasonTimeline({ entries, setName }: { entries: TimelineEntry[]; setName: string }) {
  return (
    <AppCard>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.75 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CalendarMonthRoundedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>Season timeline</Typography>
          <Typography variant="caption" color="text.secondary">{setName}. Times are shown in your time zone.</Typography>
        </Box>
      </Stack>
      <Stack spacing={0}>
        {entries.map((e, i) => {
          const isNow = e.status === "now";
          const done = e.status === "done";
          return (
            <Stack
              key={e.key}
              direction="row"
              spacing={1.5}
              sx={{
                py: 1.25,
                px: isNow ? 1.25 : 0,
                mx: isNow ? -1.25 : 0,
                borderRadius: 2,
                bgcolor: isNow ? "primary.light" : "transparent",
                borderTop: i === 0 ? 0 : "1px solid",
                borderColor: "divider",
                opacity: done ? 0.6 : 1,
              }}
            >
              <Box
                sx={{
                  width: 10, height: 10, borderRadius: "50%", mt: "6px", flexShrink: 0,
                  bgcolor: isNow ? "primary.main" : done ? "text.disabled" : "transparent",
                  border: "2px solid", borderColor: isNow ? "primary.main" : done ? "text.disabled" : "divider",
                }}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <Typography variant="body2" fontWeight={700} sx={{ textDecoration: done ? "line-through" : "none" }}>{e.label}</Typography>
                  {isNow && <Chip label="Happening now" size="small" color="primary" sx={{ height: 20, fontSize: "0.6875rem", fontWeight: 700 }} />}
                  {done && <Chip label="Done" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.6875rem" }} />}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {formatWhen(e.at)}{e.endAt ? ` to ${formatWhen(e.endAt)}` : ""}
                </Typography>
                <Typography variant="caption" sx={{ display: "block", color: done ? "text.disabled" : "text.secondary", lineHeight: 1.45 }}>
                  {e.detail}
                </Typography>
              </Box>
            </Stack>
          );
        })}
      </Stack>
    </AppCard>
  );
}
