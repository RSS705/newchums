import { describe, expect, it } from "vitest";
import { buildIcsEvent, easternDateKey, easternToUtc, escapeIcsText, foldIcsLine, formatEasternLong, formatEasternShort, mtgLockWarningAt } from "../mtg";

describe("easternToUtc", () => {
  it("converts New York wall time in daylight and standard time", () => {
    expect(easternToUtc(2026, 9, 27, 10, 0).toISOString()).toBe("2026-09-27T14:00:00.000Z");
    expect(easternToUtc(2026, 12, 6, 10, 0).toISOString()).toBe("2026-12-06T15:00:00.000Z");
  });
  it("handles both changeover days", () => {
    expect(easternToUtc(2026, 11, 1, 10, 0).toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(easternToUtc(2026, 3, 8, 10, 0).toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });
});

describe("mtgLockWarningAt", () => {
  it("is 10 AM ET the day before a Reality Fracture lock", () => {
    // Lock: Monday, September 28 at 11:59 PM EDT.
    expect(mtgLockWarningAt("2026-09-29T03:59:00Z").toISOString()).toBe("2026-09-27T14:00:00.000Z");
  });
  it("uses the Eastern calendar day, not the UTC one, and survives the clock change", () => {
    // Lock Monday, November 2 at 11:59 PM EST; warning Sunday, November 1, the changeover day.
    expect(mtgLockWarningAt(new Date("2026-11-03T04:59:00Z")).toISOString()).toBe("2026-11-01T15:00:00.000Z");
    // Lock Sunday, March 8 at 11:59 PM EDT; warning Saturday, March 7 in EST.
    expect(mtgLockWarningAt("2026-03-09T03:59:00Z").toISOString()).toBe("2026-03-07T15:00:00.000Z");
  });
});

describe("easternDateKey", () => {
  it("uses the New York calendar day, which lags UTC in the evening", () => {
    expect(easternDateKey("2026-09-29T03:59:00Z")).toBe("2026-09-28");
    expect(easternDateKey(new Date("2026-09-28T14:00:00Z"))).toBe("2026-09-28");
  });
});

describe("Eastern formatting", () => {
  it("reads naturally", () => {
    expect(formatEasternLong("2026-09-29T03:59:00Z")).toBe("Monday, September 28 at 11:59 PM ET");
    expect(formatEasternShort("2026-10-27T13:00:00Z")).toBe("Tue, Oct 27, 9:00 AM ET");
  });
});

describe("calendar files", () => {
  it("escapes text the way RFC 5545 wants", () => {
    const backslash = String.fromCharCode(92);
    expect(escapeIcsText("a, b; c")).toBe(`a${backslash}, b${backslash}; c`);
    expect(escapeIcsText("line one\nline two")).toBe(`line one${backslash}nline two`);
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const folded = foldIcsLine("DESCRIPTION:" + "é".repeat(80));
    const encoder = new TextEncoder();
    for (const part of folded.split("\r\n")) expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe("DESCRIPTION:" + "é".repeat(80));
  });

  it("builds a single event with UTC times, CRLF endings and an optional alarm", () => {
    const ics = buildIcsEvent({
      uid: "mtg-fra-lock@newchums.com",
      start: new Date("2026-09-29T03:59:00Z"),
      durationMinutes: 30,
      summary: "Reality Fracture picks lock",
      description: "Last call, change anything before this.",
      url: "https://newchums.com/mtg/how-scoring-works",
      alarmMinutesBefore: 120,
    }, new Date("2026-09-15T12:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20260929T035900Z");
    expect(ics).toContain("DTEND:20260929T042900Z");
    expect(ics).toContain("DTSTAMP:20260915T120000Z");
    expect(ics).toContain("TRIGGER:-PT120M");
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
  });
});
