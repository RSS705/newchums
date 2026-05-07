"use client";

import * as React from "react";
import { TimePicker, type TimePickerProps } from "@mui/x-date-pickers/TimePicker";
import { pickerFieldTabKeyDown } from "./pickerTabNav";

/**
 * Drop-in replacement for `<TimePicker>` that bakes in the three
 * settings we keep forgetting on time fields:
 *
 *   1. `format="h:mm A"` so single-digit hours render without a leading
 *      zero ("9:30 PM", not "09:30 PM").
 *   2. `slotProps.field.shouldRespectLeadingZeros: true` so MUI's
 *      accessible field DOM treats the format token literally and
 *      doesn't pad. Without this the visual format string is honored
 *      but the section behavior still treats hours as 2-digit.
 *   3. `slotProps.textField.onKeyDown = pickerFieldTabKeyDown` so Tab /
 *      Shift+Tab walk through the hour, minute, and AM/PM sections
 *      instead of jumping out of the field.
 *
 * Use this anywhere you'd reach for `TimePicker`. Callers can still
 * override the format / slotProps / textField props by passing them
 * through; their values are merged on top of these defaults rather
 * than replaced wholesale, so an explicit `onKeyDown` chains with the
 * built-in tab handler (the wrapper version runs first; if the caller
 * preventDefault'd the event, the tab handler exits cleanly via its
 * own bail-on-non-Tab guard).
 *
 * If the field misbehaves, fix it here so every call site benefits.
 * Avoid reaching for raw `TimePicker` unless you have a specific
 * reason that's documented at the call site.
 */
export default function AppTimePicker(
  props: TimePickerProps,
): React.ReactElement {
  const { format, slotProps, ...rest } = props;
  const callerField = (slotProps?.field ?? undefined) as Record<string, unknown> | undefined;
  const callerTextField = (slotProps?.textField ?? undefined) as Record<string, unknown> | undefined;
  const callerOnKeyDown = callerTextField?.onKeyDown as
    | ((e: React.KeyboardEvent<HTMLElement>) => void)
    | undefined;

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    pickerFieldTabKeyDown(e);
    if (!e.defaultPrevented) callerOnKeyDown?.(e);
  };

  return (
    <TimePicker
      format={format ?? "h:mm A"}
      slotProps={{
        ...(slotProps ?? {}),
        field: {
          ...(callerField ?? {}),
          shouldRespectLeadingZeros: true,
        } as Record<string, unknown>,
        textField: {
          ...(callerTextField ?? {}),
          onKeyDown,
        } as Record<string, unknown>,
      }}
      {...rest}
    />
  );
}
