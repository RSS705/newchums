import { describe, expect, it } from "vitest";
import { MTG_BADGES, MTG_FINALIZE_GRACE_MS, collectorSort, easternHour, mtgFinalizeDue, mtgPhase, mtgPicksOpenAt, mtgResultsEmailAt, mtgTimeline, type MtgSetRow } from "../mtg";

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
  it("is sorted, marks the current entry, and opens picks with the previews", () => {
    const entries = mtgTimeline(fra, new Date("2026-09-10T12:00:00Z"));
    const times = entries.map((e) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(entries[0]).toMatchObject({ key: "previews", label: "Previews start, picks open", status: "now" });
    expect(entries.filter((e) => e.status === "now")).toHaveLength(1);
    expect(entries.some((e) => e.key === "picks_open")).toBe(false);
    expect(entries[entries.length - 1].key).toBe("final");
  });

  it("puts the lock ahead of prereleases that start at the same moment", () => {
    const friday = "2026-09-25T22:00:00Z";
    const keys = mtgTimeline({ ...fra, lock_at: friday, prerelease_start_at: friday }).map((e) => e.key);
    expect(keys.indexOf("lock")).toBe(keys.indexOf("prerelease") - 1);
  });

  it("lists no weekly entries, since there is no weekly email", () => {
    expect(mtgTimeline({ ...fra, final_at: "2026-11-13T14:00:00Z" }).some((e) => e.key.startsWith("weekly"))).toBe(false);
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

describe("the season's end", () => {
  // The production final day: Friday, November 13, 9 AM EST.
  const season = { status: "active", final_at: "2026-11-13T14:00:00Z" };
  const at = (iso: string) => new Date(iso);

  it("finalizes once the final day's standings are published", () => {
    expect(mtgFinalizeDue(season, "2026-11-13", at("2026-11-13T14:05:00Z"))).toBe(true);
    // Not before the final morning, even with that day's standings somehow in.
    expect(mtgFinalizeDue(season, "2026-11-13", at("2026-11-13T13:59:00Z"))).toBe(false);
  });

  it("waits for the final day's standings, then ends with the latest after the grace period", () => {
    expect(mtgFinalizeDue(season, "2026-11-12", at("2026-11-13T20:00:00Z"))).toBe(false);
    expect(mtgFinalizeDue(season, "2026-11-12", new Date(Date.parse(season.final_at) + MTG_FINALIZE_GRACE_MS - 1))).toBe(false);
    expect(mtgFinalizeDue(season, "2026-11-12", new Date(Date.parse(season.final_at) + MTG_FINALIZE_GRACE_MS))).toBe(true);
  });

  it("never finalizes without standings, or a season that isn't active", () => {
    expect(mtgFinalizeDue(season, null, at("2026-12-01T00:00:00Z"))).toBe(false);
    expect(mtgFinalizeDue({ ...season, status: "final" }, "2026-11-13", at("2026-11-13T15:00:00Z"))).toBe(false);
  });

  it("sends the results email at 10 AM ET on the final day, or when the season is finalized if later", () => {
    expect(mtgResultsEmailAt({ final_at: season.final_at, finalized_at: "2026-11-13T14:02:00Z" }).toISOString()).toBe("2026-11-13T15:00:00.000Z");
    expect(mtgResultsEmailAt({ final_at: season.final_at, finalized_at: "2026-11-14T16:00:00Z" }).toISOString()).toBe("2026-11-14T16:00:00.000Z");
    expect(mtgResultsEmailAt({ final_at: season.final_at }).toISOString()).toBe("2026-11-13T15:00:00.000Z");
  });

  it("opens the next season's picks at previews or the picks date, whichever is first", () => {
    expect(mtgPicksOpenAt({ previews_start_at: "2026-10-20T13:00:00Z", picks_open_at: "2026-10-30T13:00:00Z" })?.toISOString()).toBe("2026-10-20T13:00:00.000Z");
    expect(mtgPicksOpenAt({ previews_start_at: null, picks_open_at: "2026-10-30T13:00:00Z" })?.toISOString()).toBe("2026-10-30T13:00:00.000Z");
    expect(mtgPicksOpenAt({ previews_start_at: null, picks_open_at: null })).toBeNull();
  });
});

describe("badge tiers (Version 18)", () => {
  it("keeps the placings every group hands out below Rare, with Champion the group's Mythic", () => {
    expect(MTG_BADGES.champion.tier).toBe("mythic");
    for (const code of ["runner_up", "common_sense", "uncommon_knowledge", "rare_insight", "mythic_vision", "pick_of_the_season", "sleeper_agent"]) {
      expect(MTG_BADGES[code].tier).toBe("uncommon");
    }
    expect(MTG_BADGES.third_place.tier).toBe("common");
  });
});
