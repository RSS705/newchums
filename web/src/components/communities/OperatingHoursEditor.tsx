"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
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

function hhmmToDayjs(hhmm: string): Dayjs | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return dayjs().hour(h).minute(m).second(0).millisecond(0);
}

function dayjsToHhmm(d: Dayjs | null): string {
  if (!d || !d.isValid()) return "";
  return d.format("HH:mm");
}

function hasAnyHours(value: OperatingHours | null): boolean {
  if (!value) return false;
  return OPERATING_HOURS_DAY_CODES.some((d) => value[d] !== undefined);
}

/**
 * Day-by-day operating hours editor. Each row is a single cohesive control
 * group, day label on the left, then either the open/close pickers or a
 * "Closed all day" pill when the day is marked closed, with the closed
 * checkbox immediately adjacent so it reads as part of the same row (no
 * far-right detachment from a flex spacer).
 *
 * Wrapped in a collapsible header so the form feels light by default. Auto-
 * expands once in edit mode when an existing community is loaded with hours
 * already set, so organizers can see what they have without an extra click.
 *
 * Intentionally minimal: one open/close pair per day, closed flag,
 * optional per day. No split shifts, no multiple windows, no holiday
 * overrides.
 */
export default function OperatingHoursEditor({ value, onChange }: Props) {
  const hours: OperatingHours = value ?? {};

  const [open, setOpen] = useState(false);
  // One-shot auto-expand for edit-mode loads that already have hours saved.
  // After it fires once, manual collapse/expand is fully under user control.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!autoOpenedRef.current && hasAnyHours(value)) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [value]);

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
    const hasAny = OPERATING_HOURS_DAY_CODES.some((d) => next[d] !== undefined);
    onChange(hasAny ? next : null);
  };

  const handleClosedToggle = (day: OperatingHoursDay, closed: boolean) => {
    updateDay(day, (prev) => {
      if (closed) {
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
      <Box
        onClick={() => setOpen((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
        sx={{ display: "flex", alignItems: "flex-start", cursor: "pointer", userSelect: "none", gap: 1 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            Hours <Typography component="span" variant="body2" color="text.secondary" fontWeight={400}>(optional)</Typography>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Add operating hours if your community has regular meeting times or open hours.
          </Typography>
        </Box>
        <ExpandMoreRoundedIcon
          sx={{
            mt: 0.25,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            color: "text.secondary",
          }}
        />
      </Box>

      <Collapse in={open} unmountOnExit>
        <Stack spacing={0.75} sx={{ pt: 2 }}>
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
                  sx={{ m: 0 }}
                />
              </Stack>
            );
          })}
        </Stack>
      </Collapse>
    </AppCard>
  );
}
