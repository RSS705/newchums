"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import { AppCard } from "@/components/ui";
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

/** Canonical string key used to group consecutive days with matching hours. */
function entryKey(entry: OperatingHoursEntry): string {
  if (isClosedEntry(entry)) return "closed";
  if (isOpenEntry(entry)) return `open:${entry.open}-${entry.close}`;
  return "unknown";
}

/** Render a single entry's right-hand value in user-facing 12-hour format. */
function entryValue(entry: OperatingHoursEntry): string {
  if (isClosedEntry(entry)) return "Closed";
  if (isOpenEntry(entry)) return `${formatHour(entry.open)} – ${formatHour(entry.close)}`;
  return "";
}

/** Collapse consecutive days with identical entries into range rows. Days
 *  with no entry break any run (they're not rendered). Produces at most
 *  seven rows, usually two or three for typical weekly patterns. */
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

/**
 * Compact read-only card for community operating hours. Consecutive days
 * with matching hours collapse into a single range row ("Mon-Fri: 9 AM - 5
 * PM"), which keeps the card short for typical weekly patterns and
 * prevents it from pushing the Plans tab too far down the page. Never
 * rendered on restricted private-community responses, the server omits the
 * field from that payload.
 */
export default function OperatingHoursDisplay({ hours }: Props) {
  if (!hasAnyHours(hours)) return null;
  const rows = groupHours(hours!);
  return (
    <AppCard>
      <Stack direction="row" spacing={1.25} alignItems="flex-start">
        <AccessTimeRoundedIcon sx={{ fontSize: 18, color: "text.secondary", mt: 0.25 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, mb: 0.5 }}
          >
            Hours
          </Typography>
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
        </Box>
      </Stack>
    </AppCard>
  );
}
