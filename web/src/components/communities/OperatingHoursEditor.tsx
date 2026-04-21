"use client";

import { useRef } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import { AppCard } from "@/components/ui";
import { pickerFieldTabKeyDown } from "@/components/fields/pickerTabNav";
import {
  OPERATING_HOURS_DAY_CODES,
  OPERATING_HOURS_DAY_LABELS,
  isClosedEntry,
  isOpenEntry,
  type OperatingHours,
  type OperatingHoursDay,
} from "./operatingHours";

type Props = {
  value: OperatingHours | null;
  onChange: (next: OperatingHours | null) => void;
};

/**
 * Convert a stored `"HH:MM"` string to a Dayjs anchored to today, the shape
 * TimePicker expects. Invalid or empty strings return null so the picker
 * renders as empty (placeholder) rather than a bogus time.
 */
function hhmmToDayjs(hhmm: string): Dayjs | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return dayjs().hour(h).minute(m).second(0).millisecond(0);
}

/** Convert a picker Dayjs back to the stored zero-padded 24-hour `"HH:MM"`. */
function dayjsToHhmm(d: Dayjs | null): string {
  if (!d || !d.isValid()) return "";
  return d.format("HH:mm");
}

/**
 * Day-by-day operating hours editor. Each row is a single cohesive control
 * group, day label on the left, then either the open/close pickers or a
 * "Closed all day" pill when the day is marked closed, with the closed
 * checkbox immediately adjacent so it reads as part of the same row (no
 * far-right detachment from a flex spacer).
 *
 * Intentionally minimal: one open/close pair per day, closed flag,
 * optional per day. No split shifts, no multiple windows, no holiday
 * overrides.
 */
export default function OperatingHoursEditor({ value, onChange }: Props) {
  const hours: OperatingHours = value ?? {};

  // Per-day memory of the most recent open/close pair. Kept in a ref (not
  // in the stored value and not in React state) so toggling Closed on then
  // off restores the prior times without re-rendering and without changing
  // the data model. Populated on every user time edit and on Closed→true
  // from any {open, close} entry currently in the value (covers the case
  // where an Edit form loads with hours already set, then the user checks
  // Closed before typing anything new).
  const rememberedRef = useRef<Partial<Record<OperatingHoursDay, { open: string; close: string }>>>({});

  const updateDay = (day: OperatingHoursDay, patch: (prev: OperatingHours) => OperatingHours) => {
    const next = patch({ ...hours });
    // Normalize empty object back to null so the caller stores one canonical
    // "no hours" shape.
    const hasAny = OPERATING_HOURS_DAY_CODES.some((d) => next[d] !== undefined);
    onChange(hasAny ? next : null);
  };

  const handleClosedToggle = (day: OperatingHoursDay, closed: boolean) => {
    updateDay(day, (prev) => {
      if (closed) {
        // Capture any currently-entered times before overwriting the entry
        // with the closed flag, so unchecking Closed can restore them.
        const current = prev[day];
        if (isOpenEntry(current) && (current.open || current.close)) {
          rememberedRef.current[day] = { open: current.open, close: current.close };
        }
        prev[day] = { closed: true };
      } else {
        const remembered = rememberedRef.current[day];
        if (remembered && (remembered.open || remembered.close)) {
          prev[day] = { open: remembered.open, close: remembered.close };
        } else {
          // No prior times to restore, return to the "not set" state.
          delete prev[day];
        }
      }
      return prev;
    });
  };

  const handleTimeChange = (day: OperatingHoursDay, field: "open" | "close", nextValue: Dayjs | null) => {
    const nextTime = dayjsToHhmm(nextValue);
    updateDay(day, (prev) => {
      const current = prev[day];
      const base = isOpenEntry(current) ? current : { open: "", close: "" };
      const updated = { ...base, [field]: nextTime };
      // Remember the latest open/close pair on every edit. If the user
      // later checks Closed, unchecking it restores exactly what they
      // typed last, not a stale snapshot.
      if (updated.open || updated.close) {
        rememberedRef.current[day] = { open: updated.open, close: updated.close };
      }
      if (!updated.open && !updated.close) {
        delete prev[day];
      } else {
        prev[day] = { open: updated.open, close: updated.close };
      }
      return prev;
    });
  };

  return (
    <AppCard>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            Hours
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Optional. Leave a day blank if you don&rsquo;t want to publish hours for it.
          </Typography>
        </Box>

        <Stack spacing={0.75}>
          {OPERATING_HOURS_DAY_CODES.map((day) => {
            const entry = hours[day];
            const closed = isClosedEntry(entry);
            const openVal = isOpenEntry(entry) ? hhmmToDayjs(entry.open) : null;
            const closeVal = isOpenEntry(entry) ? hhmmToDayjs(entry.close) : null;
            return (
              <Stack
                key={day}
                direction={{ xs: "column", sm: "row" }}
                spacing={{ xs: 1, sm: 1.5 }}
                alignItems={{ xs: "stretch", sm: "center" }}
              >
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{ width: { xs: "auto", sm: 80 }, flexShrink: 0 }}
                >
                  {OPERATING_HOURS_DAY_LABELS[day]}
                </Typography>
                {closed ? (
                  // Closed state gets a single explicit pill instead of two
                  // greyed-out pickers, reads as "closed" at a glance and
                  // matches the width the two pickers would have taken so
                  // rows don't visibly jump when toggled.
                  <Box
                    sx={{
                      width: { xs: "100%", sm: 328 },
                      flexShrink: 0,
                      height: 40,
                      borderRadius: 1.5,
                      bgcolor: "action.hover",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "text.secondary",
                    }}
                  >
                    <Typography variant="body2" sx={{ fontStyle: "italic" }}>
                      Closed all day
                    </Typography>
                  </Box>
                ) : (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TimePicker
                      value={openVal}
                      onChange={(v) => handleTimeChange(day, "open", v)}
                      format="h:mm A"
                      slotProps={{
                        field: { shouldRespectLeadingZeros: true } as Record<string, unknown>,
                        textField: {
                          size: "small",
                          placeholder: "Open",
                          onKeyDown: pickerFieldTabKeyDown,
                          sx: { width: 150 },
                          inputProps: { "aria-label": `${OPERATING_HOURS_DAY_LABELS[day]} open time` },
                        },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      to
                    </Typography>
                    <TimePicker
                      value={closeVal}
                      onChange={(v) => handleTimeChange(day, "close", v)}
                      format="h:mm A"
                      slotProps={{
                        field: { shouldRespectLeadingZeros: true } as Record<string, unknown>,
                        textField: {
                          size: "small",
                          placeholder: "Close",
                          onKeyDown: pickerFieldTabKeyDown,
                          sx: { width: 150 },
                          inputProps: { "aria-label": `${OPERATING_HOURS_DAY_LABELS[day]} close time` },
                        },
                      }}
                    />
                  </Stack>
                )}
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={closed}
                      onChange={(e) => handleClosedToggle(day, e.target.checked)}
                    />
                  }
                  label="Closed"
                  slotProps={{ typography: { variant: "body2" } }}
                  // No flex:1 on the preceding group, so the Closed control
                  // sits immediately after the pickers / closed pill instead
                  // of being pushed to the far right edge of the card.
                  sx={{ m: 0 }}
                />
              </Stack>
            );
          })}
        </Stack>
      </Stack>
    </AppCard>
  );
}
