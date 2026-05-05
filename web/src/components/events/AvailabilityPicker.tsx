"use client";

import { useMemo, useRef, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { AppButton } from "@/components/ui";

export type AvailabilitySelection = {
  /** Local-day key, e.g. "2026-05-06". Used to dedupe selections. */
  dayKey: string;
  /** Local start-of-day for the selected date. */
  date: Dayjs;
  /** Earliest plan-start time on this date. null = anytime. */
  start: Dayjs | null;
  /** Latest plan-start time on this date. null = anytime. */
  end: Dayjs | null;
};

type AvailabilityPickerProps = {
  mode: "availability" | "suggest";
  planStartsAt: string;
  /** Local day-keys the viewer has already submitted; these chip-cards show as already shared. */
  existingDayKeys: Set<string>;
  submitting: boolean;
  onSubmit: (entries: AvailabilitySelection[]) => Promise<void> | void;
};

const SLIDER_DAYS_BEFORE_PLAN = 3;
const SLIDER_DAYS_AFTER_PLAN = 27;

function makeDayKey(d: Dayjs): string {
  return d.format("YYYY-MM-DD");
}

// TimePicker values can carry whatever date the picker used as a reference
// (today by default when there was no prior value). Comparing the full Dayjs
// across two pickers therefore mixes time-of-day with date and produces wrong
// results, e.g. "today 7pm" is "before" a start value from a future plan day.
// Always compare only the time-of-day component for window validation.
function minutesOfDay(t: Dayjs): number {
  return t.hour() * 60 + t.minute();
}

export default function AvailabilityPicker({
  mode,
  planStartsAt,
  existingDayKeys,
  submitting,
  onSubmit,
}: AvailabilityPickerProps) {
  const isAvail = mode === "availability";
  const planDay = useMemo(() => dayjs(planStartsAt).startOf("day"), [planStartsAt]);
  const today = useMemo(() => dayjs().startOf("day"), []);

  // Slider window: a few days before the plan day for context, then ~4 weeks
  // after. Never goes before today. The user scrolls horizontally to reach
  // dates further out.
  const allChipDays = useMemo(() => {
    const days: Dayjs[] = [];
    for (let off = -SLIDER_DAYS_BEFORE_PLAN; off <= SLIDER_DAYS_AFTER_PLAN; off++) {
      const d = planDay.add(off, "day");
      if (d.isBefore(today, "day")) continue;
      days.push(d);
    }
    if (days.length === 0) days.push(today);
    return days;
  }, [planDay, today]);

  const [selected, setSelected] = useState<Map<string, AvailabilitySelection>>(new Map());
  const sliderRef = useRef<HTMLDivElement | null>(null);

  const scrollSlider = (direction: "left" | "right") => {
    const el = sliderRef.current;
    if (!el) return;
    const delta = Math.max(180, Math.round(el.clientWidth * 0.7));
    el.scrollBy({ left: direction === "left" ? -delta : delta, behavior: "smooth" });
  };

  const toggleDay = (d: Dayjs) => {
    const key = makeDayKey(d);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { dayKey: key, date: d.startOf("day"), start: null, end: null });
      }
      return next;
    });
  };

  const updateTime = (key: string, start: Dayjs | null, end: Dayjs | null) => {
    setSelected((prev) => {
      const cur = prev.get(key);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(key, { ...cur, start, end });
      return next;
    });
  };

  const sortedSelections = useMemo(
    () => [...selected.values()].sort((a, b) => (a.date.isBefore(b.date) ? -1 : 1)),
    [selected]
  );

  // Single-time entries are entered in the "Earliest start" field only; a
  // value in "Latest start" without an "Earliest start" is treated as
  // partial input rather than as a single time.
  const isMissingEarliest = (s: AvailabilitySelection): boolean =>
    !s.start && !!s.end;

  const isInvalidWindow = (s: AvailabilitySelection): boolean =>
    !!(s.start && s.end && minutesOfDay(s.end) <= minutesOfDay(s.start));

  const hasInvalidSelection = sortedSelections.some(
    (s) => isMissingEarliest(s) || isInvalidWindow(s)
  );

  const submit = async () => {
    if (sortedSelections.length === 0 || hasInvalidSelection) return;
    await onSubmit(sortedSelections);
    setSelected(new Map());
  };

  const cta = isAvail ? "Share availability" : "Submit suggestions";

  return (
    <Box>
      <Box sx={{ position: "relative" }}>
        <IconButton
          aria-label="Scroll dates left"
          onClick={() => scrollSlider("left")}
          size="small"
          sx={{
            display: { xs: "none", sm: "flex" },
            position: "absolute",
            left: -8,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <IconButton
          aria-label="Scroll dates right"
          onClick={() => scrollSlider("right")}
          size="small"
          sx={{
            display: { xs: "none", sm: "flex" },
            position: "absolute",
            right: -8,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <Box
          ref={sliderRef}
          sx={{
            display: "flex",
            flexWrap: "nowrap",
            gap: 1,
            overflowX: "auto",
            // Vertical padding gives the selected-card check badge (offset
            // top: -7) room to render. overflow-x: auto coerces overflow-y
            // to clip too, so without pt the badge gets cut off.
            pt: 1.25,
            pb: 1,
            // Reserve gutters on desktop for the chevron buttons + breathing
            // room; on mobile there are no chevrons so the slider runs
            // edge-to-edge.
            pl: { xs: 0, sm: 7 },
            pr: { xs: 0, sm: 7 },
            scrollSnapType: "x proximity",
            // Fade cards out well before the chevron zones so they don't
            // crowd the buttons. Mobile (no chevrons) gets no mask.
            "@media (min-width:600px)": {
              maskImage:
                "linear-gradient(to right, transparent 0, transparent 48px, #000 56px, #000 calc(100% - 56px), transparent calc(100% - 48px), transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0, transparent 48px, #000 56px, #000 calc(100% - 56px), transparent calc(100% - 48px), transparent 100%)",
            },
            "&::-webkit-scrollbar": { height: 6 },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "rgba(0,0,0,0.15)",
              borderRadius: 3,
            },
          }}
        >
        {allChipDays.map((d) => {
          const key = makeDayKey(d);
          const isSelected = selected.has(key);
          const wasSubmitted = existingDayKeys.has(key);
          const isPlanDay = key === makeDayKey(planDay);
          return (
            <Box
              key={key}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => toggleDay(d)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleDay(d);
                }
              }}
              sx={{
                cursor: "pointer",
                userSelect: "none",
                flex: "0 0 auto",
                minWidth: 76,
                px: 1.25,
                py: 0.875,
                borderRadius: 2,
                border: "1.5px solid",
                borderColor: isSelected
                  ? "primary.main"
                  : isPlanDay
                    ? "primary.light"
                    : "divider",
                bgcolor: isSelected
                  ? "action.selected"
                  : isPlanDay
                    ? "rgba(234, 88, 12, 0.06)"
                    : "background.paper",
                color: isSelected ? "primary.dark" : "text.primary",
                position: "relative",
                transition: "all 0.15s ease",
                "&:hover": {
                  borderColor: isSelected
                    ? "primary.main"
                    : isPlanDay
                      ? "primary.main"
                      : "primary.light",
                  bgcolor: isSelected ? "action.selected" : "action.hover",
                },
                "&:focus-visible": {
                  outline: "2px solid",
                  outlineColor: "primary.main",
                  outlineOffset: 2,
                },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  fontWeight: 600,
                  fontSize: "0.6875rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: isSelected
                    ? "primary.main"
                    : isPlanDay
                      ? "primary.dark"
                      : "text.secondary",
                }}
              >
                {d.format("ddd")}
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.2 }}
              >
                {d.format("MMM D")}
              </Typography>
              {(isPlanDay || wasSubmitted) && (
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    fontSize: "0.625rem",
                    color: wasSubmitted ? "success.main" : "primary.main",
                    mt: 0.25,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                  }}
                >
                  {wasSubmitted ? "Shared" : "Plan day"}
                </Typography>
              )}
              {isSelected && (
                <Box
                  sx={{
                    position: "absolute",
                    top: -7,
                    right: -7,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    border: "2px solid",
                    borderColor: "background.paper",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <CheckRoundedIcon sx={{ fontSize: 12 }} />
                </Box>
              )}
            </Box>
          );
        })}
        </Box>
      </Box>

      {sortedSelections.length > 0 ? (
        <Stack spacing={0.875} sx={{ mt: 1.75 }}>
          {sortedSelections.map((s) => {
            const isAnytime = !s.start && !s.end;
            const missingEarliest = isMissingEarliest(s);
            const invalidWindow = isInvalidWindow(s);
            return (
              <Paper
                key={s.dayKey}
                variant="outlined"
                sx={{
                  p: { xs: 1.25, sm: 1.5 },
                  borderRadius: 2,
                  borderColor: "primary.light",
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  spacing={0.75}
                  sx={{ mb: 1 }}
                >
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    noWrap
                    sx={{ minWidth: 0, flex: 1 }}
                  >
                    <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                      {s.date.format("ddd, MMM D")}
                    </Box>
                    <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                      {s.date.format("dddd, MMM D")}
                    </Box>
                  </Typography>
                  <Stack direction="row" spacing={0.25} alignItems="center" sx={{ flexShrink: 0 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={isAnytime}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateTime(s.dayKey, null, null);
                            }
                          }}
                          sx={{ py: 0.25 }}
                        />
                      }
                      label={
                        <Typography variant="body2" sx={{ fontSize: "0.875rem" }}>
                          Anytime
                        </Typography>
                      }
                      sx={{ mr: 0, ml: 0 }}
                    />
                    <IconButton
                      size="small"
                      aria-label="Remove date"
                      onClick={() => toggleDay(s.date)}
                    >
                      <CloseRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                    </IconButton>
                  </Stack>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <TimePicker
                    value={s.start}
                    onChange={(v) => updateTime(s.dayKey, v, s.end)}
                    format="h:mm A"
                    enableAccessibleFieldDOMStructure={false}
                    slotProps={{
                      field: {
                        shouldRespectLeadingZeros: true,
                      } as Record<string, unknown>,
                      textField: {
                        fullWidth: true,
                        size: "small",
                        placeholder: "Earliest start",
                      },
                    }}
                  />
                  <TimePicker
                    value={s.end}
                    onChange={(v) => updateTime(s.dayKey, s.start, v)}
                    format="h:mm A"
                    enableAccessibleFieldDOMStructure={false}
                    slotProps={{
                      field: {
                        shouldRespectLeadingZeros: true,
                      } as Record<string, unknown>,
                      textField: {
                        fullWidth: true,
                        size: "small",
                        placeholder: "Latest start",
                      },
                    }}
                  />
                </Stack>
                {(missingEarliest || invalidWindow) && (
                  <Typography
                    variant="caption"
                    color="warning.dark"
                    sx={{ display: "block", mt: 0.75 }}
                  >
                    {invalidWindow
                      ? "Latest start must be after earliest start."
                      : "Add an earliest start time."}
                  </Typography>
                )}
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.25 }}>
          {isAvail
            ? "Tap one or more days you're available."
            : "Tap one or more days you'd like to suggest."}
        </Typography>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 2 }}
        justifyContent={{ xs: "stretch", sm: "flex-end" }}
      >
        <AppButton
          size="medium"
          onClick={submit}
          disabled={submitting || sortedSelections.length === 0 || hasInvalidSelection}
          sx={{ width: { xs: "100%", sm: "auto" } }}
        >
          {submitting
            ? "Sharing..."
            : sortedSelections.length > 1
              ? `${cta} (${sortedSelections.length})`
              : cta}
        </AppButton>
      </Stack>
    </Box>
  );
}
