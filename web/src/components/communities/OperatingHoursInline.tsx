"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import {
  OPERATING_HOURS_DAY_CODES,
  OPERATING_HOURS_DAY_SHORT_LABELS,
  formatHour,
  hasAnyHours,
  isClosedEntry,
  isOpenEntry,
  type OperatingHours,
  type OperatingHoursDay,
  type OperatingHoursEntry,
} from "./operatingHours";

type Props = {
  hours: OperatingHours | null | undefined;
};

/** JS Date.getDay() (0=Sunday) → our three-letter day code. */
const JS_DAY_TO_CODE: Record<number, OperatingHoursDay> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

/** Canonical group-key used to collapse consecutive matching days. */
function entryKey(entry: OperatingHoursEntry): string {
  if (isClosedEntry(entry)) return "closed";
  if (isOpenEntry(entry)) return `open:${entry.open}-${entry.close}`;
  return "unknown";
}

function entryValue(entry: OperatingHoursEntry): string {
  if (isClosedEntry(entry)) return "Closed";
  if (isOpenEntry(entry)) return `${formatHour(entry.open)} – ${formatHour(entry.close)}`;
  return "";
}

function groupHours(hours: OperatingHours): Array<{ label: string; value: string; closed: boolean }> {
  const rows: Array<{ label: string; value: string; closed: boolean }> = [];
  let runStart: OperatingHoursDay | null = null;
  let runEnd: OperatingHoursDay | null = null;
  let runEntry: OperatingHoursEntry | null = null;

  const flush = () => {
    if (!runStart || !runEnd || !runEntry) return;
    const startLabel = OPERATING_HOURS_DAY_SHORT_LABELS[runStart];
    const endLabel = OPERATING_HOURS_DAY_SHORT_LABELS[runEnd];
    const label = runStart === runEnd ? startLabel : `${startLabel}–${endLabel}`;
    rows.push({ label, value: entryValue(runEntry), closed: isClosedEntry(runEntry) });
  };

  for (const day of OPERATING_HOURS_DAY_CODES) {
    const entry = hours[day];
    if (!entry) {
      flush();
      runStart = null;
      runEnd = null;
      runEntry = null;
      continue;
    }
    if (runEntry && entryKey(runEntry) === entryKey(entry)) {
      runEnd = day;
    } else {
      flush();
      runStart = day;
      runEnd = day;
      runEntry = entry;
    }
  }
  flush();
  return rows;
}

/** Pick a short summary for the meta-stack row. Prefers today's entry; if
 *  today has none, falls back to a generic "Hours" label so we always have
 *  something to click for viewers who want to see the full schedule. */
function todaySummary(hours: OperatingHours): string {
  const todayCode = JS_DAY_TO_CODE[new Date().getDay()];
  const entry = hours[todayCode];
  if (entry) {
    if (isClosedEntry(entry)) return "Closed today";
    if (isOpenEntry(entry)) return `Today: ${formatHour(entry.open)} – ${formatHour(entry.close)}`;
  }
  return "Hours";
}

/**
 * Compact, clickable hours row for the community header's meta stack.
 * Shows today's hours (or a generic "Hours" label when today has none)
 * and opens a popover listing the full weekly schedule. Stays visually
 * consistent with the other meta rows (member count, location, website,
 * Discord): small 14px icon, 0.8125rem text, no standalone card. The
 * full-schedule display is intentionally hidden by default so the hours
 * feature stays clearly subordinate to the main community content below.
 * Renders nothing when no hours are set.
 */
export default function OperatingHoursInline({ hours }: Props) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  if (!hasAnyHours(hours)) return null;
  const summary = todaySummary(hours!);
  const open = Boolean(anchorEl);
  const rows = groupHours(hours!);
  return (
    <>
      <Stack
        component="button"
        type="button"
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget)}
        direction="row"
        spacing={0.5}
        alignItems="center"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Show weekly hours"
        sx={{
          alignSelf: "flex-start",
          bgcolor: "transparent",
          border: 0,
          p: 0,
          cursor: "pointer",
          color: "text.secondary",
          borderRadius: 1,
          "&:hover .hours-inline-label": { color: "text.primary" },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 2,
          },
        }}
      >
        <AccessTimeRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
        <Typography
          className="hours-inline-label"
          variant="body2"
          sx={{ fontSize: "0.8125rem", fontWeight: 500 }}
        >
          {summary}
        </Typography>
        <ExpandMoreRoundedIcon
          sx={{
            fontSize: 16,
            color: "text.disabled",
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </Stack>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: 0.75, p: 1.5, borderRadius: 2, minWidth: 220 } } }}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.25 }}>
          {rows.map((row, i) => (
            <Box key={i} sx={{ display: "contents" }}>
              <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                {row.label}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: row.closed ? "text.disabled" : "text.primary" }}
              >
                {row.value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Popover>
    </>
  );
}
