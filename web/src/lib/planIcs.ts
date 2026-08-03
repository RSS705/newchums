/**
 * Client-side .ics generation and download for the plan page's
 * "Add to calendar" button.
 *
 * Small deliberate duplicate of api/src/lib/ics.ts (the server builds the
 * same entries as email attachments): the two runtimes share no module
 * today, and the format is a dozen stable lines. Keep the two in step; the
 * UID/SEQUENCE contract is what lets a re-added entry replace an old one.
 *
 * Privacy comes free here: the caller passes the `locationDisplay` string
 * the page itself renders, which the API already filtered for this viewer's
 * role. What the page shows this person is exactly what their calendar
 * entry gets.
 */

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

export type PlanIcsInput = {
  planId: string;
  title: string;
  startsAt: string;
  /** The viewer-filtered display string the page renders; omit to skip. */
  location?: string | null;
  planUrl: string;
  updatedAt?: string | null;
};

export function buildPlanIcs(input: PlanIcsInput): string {
  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  const sequence = input.updatedAt
    ? Math.max(0, Math.floor(new Date(input.updatedAt).getTime() / 1000))
    : 0;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NewChums//Plan Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.planId}@newchums.com`,
    `DTSTAMP:${icsUtc(input.updatedAt ? new Date(input.updatedAt) : start)}`,
    `SEQUENCE:${sequence}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    `DESCRIPTION:${escapeIcsText(`Details and RSVP: ${input.planUrl}`)}`,
    `URL:${input.planUrl}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Trigger a browser download of the entry; calendar apps claim the file. */
export function downloadPlanIcs(input: PlanIcsInput): void {
  const blob = new Blob([buildPlanIcs(input)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plan.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
