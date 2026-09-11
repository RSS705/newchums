import { describe, expect, it } from "vitest";
import { collectorSort, easternHour, mtgPhase, mtgTimeline, type MtgSetRow } from "../mtg";

// Reality Fracture as seeded by migration 123.
const fra: MtgSetRow = {
  id: "set-1",
  code: "fra",
  name: "Reality Fracture",
  previews_start_at: "2026-09-08T04:00:00Z",
  gallery_complete_at: "2026-09-18T14:00:00Z",
  prerelease_start_at: "2026-09-25T04:00:00Z",
  prerelease_end_at: "2026-10-02T03:59:00Z",
  picks_open_at: "2026-09-18T14:00:00Z",
  lock_at: "2026-09-29T03:59:00Z",
  arena_release_at: "2026-09-29T18:00:00Z",
  tabletop_release_at: "2026-10-02T04:00:00Z",
  final_at: "2026-10-27T13:00:00Z",
  feed_url: "https://www.17lands.com/api/card_data?expansion=FRA&event_type=PremierDraft&time_period=ALL_TIME",
  scoring_version: 1,
  status: "active",
};

describe("mtgPhase", () => {
  it("walks the season in order", () => {
    expect(mtgPhase(fra, new Date("2026-09-01T00:00:00Z"))).toBe("upcoming");
    expect(mtgPhase(fra, new Date("2026-09-10T12:00:00Z"))).toBe("previews");
    expect(mtgPhase(fra, new Date("2026-09-18T14:00:00Z"))).toBe("open");
    expect(mtgPhase(fra, new Date("2026-09-29T03:59:00Z"))).toBe("locked");
    expect(mtgPhase(fra, new Date("2026-09-29T18:00:00Z"))).toBe("live");
    expect(mtgPhase(fra, new Date("2026-10-27T13:00:00Z"))).toBe("final");
  });

  it("treats a finalized or archived set as final whatever the date", () => {
    expect(mtgPhase({ ...fra, status: "final" }, new Date("2026-09-10T12:00:00Z"))).toBe("final");
    expect(mtgPhase({ ...fra, status: "archived" }, new Date("2026-09-10T12:00:00Z"))).toBe("final");
  });

  it("copes with the optional dates missing", () => {
    const bare = { ...fra, previews_start_at: null, picks_open_at: null, arena_release_at: null };
    expect(mtgPhase(bare, new Date("2026-09-10T12:00:00Z"))).toBe("upcoming");
    expect(mtgPhase(bare, new Date("2026-10-05T12:00:00Z"))).toBe("locked");
  });
});

describe("mtgTimeline", () => {
  it("is sorted, marks the current entry and puts calendar links on lock and final", () => {
    const entries = mtgTimeline(fra, new Date("2026-09-10T12:00:00Z"));
    const times = entries.map((e) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(entries[0]).toMatchObject({ key: "previews", status: "now" });
    expect(entries.filter((e) => e.status === "now")).toHaveLength(1);
    expect(entries.find((e) => e.key === "lock")?.calendar).toBe(true);
    expect(entries.find((e) => e.key === "final")?.calendar).toBe(true);
    expect(entries[entries.length - 1].key).toBe("final");
  });

  it("puts weekly standings on Tuesdays at 10 AM Eastern and skips the final week", () => {
    const weekly = mtgTimeline(fra).filter((e) => e.key.startsWith("weekly_"));
    expect(weekly.length).toBeGreaterThanOrEqual(3);
    for (const w of weekly) {
      const label = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hour12: false }).format(new Date(w.at));
      expect(label).toMatch(/^Tue,? 10$/);
      expect(new Date(w.at).getTime()).toBeLessThan(new Date(fra.final_at).getTime() - 6 * 86400000);
    }
  });

  it("marks everything done after the final day", () => {
    const entries = mtgTimeline(fra, new Date("2026-11-01T00:00:00Z"));
    expect(entries.every((e) => e.status === "done")).toBe(true);
  });
});

describe("collectorSort", () => {
  it("orders by the numeric prefix and tolerates odd numbers", () => {
    expect(collectorSort("12")).toBe(12);
    expect(collectorSort("12a")).toBe(12);
    expect(collectorSort("★")).toBe(0);
    expect(collectorSort("")).toBe(0);
  });
});

describe("easternHour", () => {
  it("returns the hour in New York, not UTC", () => {
    expect(easternHour(new Date("2026-09-11T10:30:00Z"))).toBe(6); // EDT, UTC-4
    expect(easternHour(new Date("2026-12-11T11:30:00Z"))).toBe(6); // EST, UTC-5
    expect(easternHour(new Date("2026-09-11T03:30:00Z"))).toBe(23);
  });
});
