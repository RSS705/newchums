/**
 * Minimal RFC 5545 .ics generation for plan calendar entries.
 *
 * Scope decisions, made deliberately (see Technical_Specs "Add to calendar"):
 *
 * - LOCATION is whatever permission-filtered string the caller passes,
 *   normally from buildEmailEventLocation with the recipient's role. The
 *   rules that govern what the page shows govern what the calendar entry
 *   shows; an approximate-location plan must never carry an exact address
 *   into a calendar, where it outlives the page.
 * - One-way snapshots, not managed invites. Full update semantics (iMIP
 *   METHOD:REQUEST/CANCEL organizer emails with per-attendee sequencing) are
 *   a large job; instead the UID is stable (<planId>@newchums.com) and
 *   SEQUENCE increases with the plan's updated_at, so RE-adding a downloaded
 *   entry after a change REPLACES the old one in calendar apps rather than
 *   duplicating. The DESCRIPTION always points back at the plan page as the
 *   source of truth.
 * - Plans have no end time in the schema; entries carry a 2-hour duration,
 *   which is the least-wrong default for social plans.
 */

const NEWCHUMS_PRODID = "-//NewChums//Plan Calendar//EN";
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC basic format: 20260805T170000Z */
function icsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Fold lines longer than 75 octets with CRLF + space continuation. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

export type PlanIcsInput = {
  planId: string;
  title: string;
  startsAt: string | Date;
  /** Already permission-filtered for the recipient. Omit to skip LOCATION. */
  location?: string | null;
  /** Absolute plan URL; becomes URL and closes the DESCRIPTION. */
  planUrl: string;
  /** Drives SEQUENCE so re-added entries replace older ones. */
  updatedAt?: string | Date | null;
  /** Renders STATUS:CANCELLED so a re-added entry marks itself cancelled. */
  cancelled?: boolean;
};

export function buildPlanIcs(input: PlanIcsInput): string {
  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  const sequence = input.updatedAt
    ? Math.max(0, Math.floor(new Date(input.updatedAt).getTime() / 1000))
    : 0;
  const description = `Details and RSVP: ${input.planUrl}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${NEWCHUMS_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.planId}@newchums.com`,
    `DTSTAMP:${icsUtc(new Date(input.updatedAt ? new Date(input.updatedAt) : start))}`,
    `SEQUENCE:${sequence}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    `DESCRIPTION:${escapeIcsText(description)}`,
    `URL:${input.planUrl}`,
    ...(input.cancelled ? ["STATUS:CANCELLED"] : ["STATUS:CONFIRMED"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Base64 for Resend's attachment content field (Workers-safe). */
export function icsToBase64(ics: string): string {
  const bytes = new TextEncoder().encode(ics);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
