/**
 * Shared types + helpers for community operating hours.
 *
 * Format mirrors the JSONB column on `newchums.communities` (see migration
 * 087). Keys are the three-letter weekday codes; each value is either
 * `{ closed: true }` or `{ open: "HH:MM", close: "HH:MM" }`. A day with
 * neither entry is simply absent from the object, meaning "no hours
 * published for this day" (not "closed"); the UI renders it that way.
 */

export const OPERATING_HOURS_DAY_CODES = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type OperatingHoursDay = (typeof OPERATING_HOURS_DAY_CODES)[number];

export type OperatingHoursEntry =
  | { closed: true }
  | { open: string; close: string };

export type OperatingHours = Partial<Record<OperatingHoursDay, OperatingHoursEntry>>;

/** Full weekday names for the editor's row labels. */
export const OPERATING_HOURS_DAY_LABELS: Record<OperatingHoursDay, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** Three-letter abbreviations for the compact detail-page display. */
export const OPERATING_HOURS_DAY_SHORT_LABELS: Record<OperatingHoursDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** True when a given entry is a real "closed" entry (not a missing-day gap). */
export function isClosedEntry(entry: OperatingHoursEntry | undefined): entry is { closed: true } {
  return !!entry && "closed" in entry && entry.closed === true;
}

/** True when an entry is a valid { open, close } pair. */
export function isOpenEntry(
  entry: OperatingHoursEntry | undefined,
): entry is { open: string; close: string } {
  return !!entry && "open" in entry && "close" in entry;
}

/** `true` iff the hours object has at least one usable entry to render. */
export function hasAnyHours(hours: OperatingHours | null | undefined): boolean {
  if (!hours) return false;
  return OPERATING_HOURS_DAY_CODES.some((d) => hours[d] !== undefined);
}

/**
 * Display a single `HH:MM` 24-hour time in friendly 12-hour format.
 * On-the-hour times drop the `:00` (e.g. `"6 PM"` instead of `"6:00 PM"`).
 * Leading zero on the hour is never rendered, the formatter uses the
 * `"numeric"` hour style, not `"2-digit"`.
 */
export function formatHour(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) return `${hour12} ${period}`;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
