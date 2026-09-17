import { afterEach, describe, expect, it, vi } from "vitest";
import { MTG_BADGES, MTG_FINALIZE_GRACE_MS, collectorSort, easternHour, mtgFinalizeDue, mtgPhase, mtgPicksOpenAt, mtgResultsEmailAt, mtgTimeline, syncScryfallSet, type MtgSetRow } from "../mtg";

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

  it("marks everything done once the season is finalized", () => {
    const entries = mtgTimeline({ ...fra, status: "final", finalized_at: "2026-10-27T13:05:00Z" }, new Date("2026-11-01T00:00:00Z"));
    expect(entries.every((e) => e.status === "done")).toBe(true);
  });

  it("keeps the final day happening until the season is finalized, however late", () => {
    const entries = mtgTimeline(fra, new Date("2026-11-01T00:00:00Z"));
    expect(entries.find((e) => e.key === "final")?.status).toBe("now");
    expect(entries.filter((e) => e.key !== "final").every((e) => e.status === "done")).toBe(true);
  });

  it("keeps picks open on the timeline until the lock, past the full card list", () => {
    const previews = mtgTimeline(fra, new Date("2026-09-20T00:00:00Z")).find((e) => e.key === "previews");
    expect(previews?.endAt).toBe(fra.lock_at);
    expect(previews?.status).toBe("now");
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

  it("waits through the next day's retries, and leaves a reopened season for an admin", () => {
    // 36 hours after 9 AM EST is 9 PM EST the next day, after the 8 PM retry.
    expect(new Date(Date.parse(season.final_at) + MTG_FINALIZE_GRACE_MS).toISOString()).toBe("2026-11-15T02:00:00.000Z");
    expect(mtgFinalizeDue({ ...season, reopened_at: "2026-11-13T16:00:00Z" }, "2026-11-13", at("2026-11-13T17:00:00Z"))).toBe(false);
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

describe("syncScryfallSet pool rule", () => {
  const set = { ...fra, gallery_complete_at: "2026-09-18T14:00:00Z", lock_at: "2026-09-25T22:00:00Z", final_at: "2026-11-13T14:00:00Z" };
  const oracle = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const cards = (n: number, boosterFor = 0) => Array.from({ length: n }, (_, i) => ({
    id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`, oracle_id: oracle(i), name: `Card ${i}`, rarity: ["common", "uncommon", "rare", "mythic"][i % 4],
    collector_number: String(i + 1), ...(i < boosterFor ? { booster: true } : {}),
  }));
  /** Serves one Scryfall page and records what the sync writes. `overdue` are
   *  pool cards already missing for a day. The pool itself is decided in SQL,
   *  so this records what the sync asks for: whether each card qualifies,
   *  whether the run holds the pool, and whether unlisted cards are handled. */
  function run(opts: { now: string; cards: ReturnType<typeof cards>; inPool: string[]; overdue?: string[]; failOn?: string }) {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: opts.cards, has_more: false }), { status: 200 }));
    const wanted = new Map<string, boolean>();
    const holds: boolean[] = [];
    let unlistedHeld: boolean | null = null;
    const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      if (text.includes("SELECT oracle_id::text AS oracle_id")) return opts.inPool.map((oracle_id) => ({ oracle_id, overdue: (opts.overdue ?? []).includes(oracle_id) }));
      if (text.includes("INSERT INTO newchums.mtg_cards")) {
        if (values[2] === opts.failOn) throw new Error("duplicate key value violates unique constraint");
        wanted.set(String(values[2]), values[23] === true);
        holds.push(values[26] === true);
        return [{ inserted: false }];
      }
      if (text.includes("missing_since = COALESCE(missing_since, now())")) { unlistedHeld = values[0] === true; return []; }
      if (text.includes("SELECT COUNT(*)::int AS n")) return [{ n: 0 }];
      return [];
    };
    return syncScryfallSet(sql as never, undefined as never, set, new Date(opts.now)).then((summary) => ({ summary, wanted, holds, unlistedHeld }));
  }
  afterEach(() => { vi.unstubAllGlobals(); });

  it("keeps every card after the gallery date while Scryfall marks no booster cards", async () => {
    const all = Array.from({ length: 40 }, (_, i) => oracle(i));
    const { summary, wanted } = await run({ now: "2026-09-18T14:00:20Z", cards: cards(40), inPool: all });
    expect([...wanted.values()].every(Boolean)).toBe(true);
    expect(summary.poolHeld).toBeUndefined();
    expect(summary.notes.join(" ")).toMatch(/no booster cards/);
  });

  it("narrows to booster cards once the set has them", async () => {
    const all = Array.from({ length: 40 }, (_, i) => oracle(i));
    const { summary, wanted } = await run({ now: "2026-09-19T14:00:20Z", cards: cards(40, 37), inPool: all });
    expect([...wanted.values()].filter((v) => !v)).toHaveLength(3);
    expect(summary.poolHeld).toBeUndefined();
  });

  it("doesn't hold the pool for cards that have only just gone missing: they wait a day first", async () => {
    const all = Array.from({ length: 40 }, (_, i) => oracle(i));
    const { summary, holds, unlistedHeld } = await run({ now: "2026-09-19T14:00:20Z", cards: cards(10), inPool: all });
    expect(summary.poolHeld).toBeUndefined();
    expect(holds.every((h) => !h)).toBe(true);
    // The 30 unlisted cards start their day; the SQL keeps them in until it passes.
    expect(unlistedHeld).toBe(false);
  });

  it("holds the pool, and says so, when a sync would take a large share out before the lock", async () => {
    const all = Array.from({ length: 40 }, (_, i) => oracle(i));
    const { summary, holds, unlistedHeld } = await run({ now: "2026-09-19T14:00:20Z", cards: cards(40, 5), inPool: all, overdue: all });
    expect(summary.poolHeld).toEqual({ leaving: 35, total: 40 });
    expect(holds.every(Boolean)).toBe(true);
    expect(unlistedHeld).toBe(true);
  });

  it("still lets a couple of retracted cards leave once they've been missing a day", async () => {
    const all = [...Array.from({ length: 40 }, (_, i) => oracle(i)), oracle(900), oracle(901)];
    const { summary, unlistedHeld } = await run({ now: "2026-09-16T14:00:20Z", cards: cards(40), inPool: all, overdue: [oracle(900), oracle(901)] });
    expect(summary.poolHeld).toBeUndefined();
    expect(unlistedHeld).toBe(false);
  });

  it("carries on past a card that can't be saved", async () => {
    const all = Array.from({ length: 40 }, (_, i) => oracle(i));
    const { summary, wanted } = await run({ now: "2026-09-16T14:00:20Z", cards: cards(40), inPool: all, failOn: oracle(3) });
    expect(summary.failed).toBe(1);
    expect(wanted.size).toBe(39);
    expect(summary.notes.join(" ")).toMatch(/Couldn't save Card 3/);
  });

  it("leaves unlisted cards alone after the lock", async () => {
    const all = [...Array.from({ length: 40 }, (_, i) => oracle(i)), oracle(900)];
    const { unlistedHeld } = await run({ now: "2026-09-26T14:00:20Z", cards: cards(40), inPool: all, overdue: [oracle(900)] });
    expect(unlistedHeld).toBeNull();
  });
});
