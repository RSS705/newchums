import { describe, expect, it } from "vitest";
import {
  MTG_SLOT_WEIGHTS, checkSnapshot, computeCardScores, isDateKey, matchFeed, mtgIngestDateAllowed, mtgIngestSlot, mtgIngestWindow, mtgStandingsDay,
  normalizeCardName, parseCardDataFeed, rankGroupDay, rankStandings, scoreEntry, type FeedRecord, type PoolCard,
} from "../mtgScoring";

/** A record shaped like 17Lands' card data feed (field names and types as served in September 2026). */
const record = (over: Record<string, unknown> = {}) => ({
  name: "Test Card", mtga_id: 1001, color: "W", rarity: "common", url: "", url_back: "", types: ["Creature"], layout: "standard",
  seen_count: 1000, avg_seen: 5.5, pick_count: 100, avg_pick: 6.2, game_count: 5000, pool_count: 9000, play_rate: 0.2,
  win_rate: 0.55, opening_hand_game_count: 800, opening_hand_win_rate: 0.56, drawn_game_count: 1200, drawn_win_rate: 0.57,
  ever_drawn_game_count: 2000, ever_drawn_win_rate: 0.565, never_drawn_game_count: 3000, never_drawn_win_rate: 0.54,
  drawn_improvement_win_rate: 0.02, ...over,
});

describe("parseCardDataFeed", () => {
  it("reads the wrapper 17Lands serves, and a bare list", () => {
    const wrapped = parseCardDataFeed(JSON.stringify({ copyright: "(c)", notes: "n", data: [record(), record({ name: "Other", mtga_id: 1002, ever_drawn_win_rate: null, ever_drawn_game_count: 49 })] }));
    expect(wrapped.ok).toBe(true);
    if (wrapped.ok) {
      expect(wrapped.records).toHaveLength(2);
      expect(wrapped.records[0]).toEqual({ name: "Test Card", mtgaId: 1001, rarity: "common", gihGames: 2000, gihWr: 0.565, alsa: 5.5, ata: 6.2, iwd: 0.02 });
      expect(wrapped.records[1].gihWr).toBeNull();
    }
    expect(parseCardDataFeed(JSON.stringify([record()])).ok).toBe(true);
  });

  it("refuses HTML, an empty list, a changed shape and percentages", () => {
    expect(parseCardDataFeed("<html>Just a moment...</html>")).toEqual({ ok: false, reason: "The response wasn't JSON" });
    expect(parseCardDataFeed(JSON.stringify({ data: [] }))).toEqual({ ok: true, records: [] });
    expect(parseCardDataFeed(JSON.stringify({ cards: [record()] })).ok).toBe(false);
    expect(parseCardDataFeed(JSON.stringify({ data: [{ card: "x" }, { card: "y" }] })).ok).toBe(false);
    expect(parseCardDataFeed(JSON.stringify({ data: [record({ ever_drawn_win_rate: 56.5 })] })).ok).toBe(false);
  });

  it("refuses a feed whose win-rate field was renamed", () => {
    const renamed: Record<string, unknown> = { ...record(), gih_wr: 0.55 };
    delete renamed.ever_drawn_win_rate;
    expect(parseCardDataFeed(JSON.stringify({ data: [renamed, renamed] })).ok).toBe(false);
  });
});

describe("matchFeed", () => {
  const pool: PoolCard[] = [
    { id: "a", name: "Glimmer Knight", rarity: "common", arenaId: 5001, statsArenaId: null, statsName: null, collectorSort: 1 },
    { id: "b", name: "Séance Keeper", rarity: "rare", arenaId: null, statsArenaId: null, statsName: null, collectorSort: 2 },
    { id: "c", name: "Fire // Ice", rarity: "uncommon", arenaId: null, statsArenaId: null, statsName: null, collectorSort: 3 },
    { id: "d", name: "Arena Only Name", rarity: "mythic", arenaId: null, statsArenaId: 7777, statsName: null, collectorSort: 4 },
    { id: "e", name: "Never Drafted", rarity: "common", arenaId: null, statsArenaId: null, statsName: null, collectorSort: 5 },
  ];
  const rec = (name: string, mtgaId: number | null): FeedRecord => ({ name, mtgaId, rarity: "common", gihGames: 100, gihWr: 0.55, alsa: null, ata: null, iwd: null });

  it("normalizes names to the front face without accents, case or punctuation", () => {
    expect(normalizeCardName("Séance Keeper")).toBe("seance keeper");
    expect(normalizeCardName("Fire // Ice")).toBe("fire");
    expect(normalizeCardName("Last Light of Durin's Day")).toBe("last light of durin s day");
  });

  it("uses an admin override, then Arena ID, then a unique name", () => {
    const m = matchFeed([rec("Glimmer Knight (Arena)", 5001), rec("Seance Keeper", 9001), rec("Fire", 9002), rec("Totally Different", 7777), rec("Basic Plains", 9003)], pool);
    expect(m.matched.get("a")?.mtgaId).toBe(5001);
    expect(m.matched.get("b")?.name).toBe("Seance Keeper");
    expect(m.matched.get("c")?.name).toBe("Fire");
    expect(m.matched.get("d")?.name).toBe("Totally Different");
    expect(m.unmatchedCards.map((c) => c.id)).toEqual(["e"]);
    expect(m.unmatchedRecords.map((r) => r.name)).toEqual(["Basic Plains"]);
  });

  it("skips a name that appears twice in the feed", () => {
    expect(matchFeed([rec("Seance Keeper", 1), rec("Seance Keeper", 2)], pool).matched.has("b")).toBe(false);
  });
});

describe("checkSnapshot", () => {
  const m = (games: number[]) => new Map(games.map((g, i) => [`c${i}`, { name: `c${i}`, mtgaId: i, rarity: "common", gihGames: g, gihWr: 0.5, alsa: null, ata: null, iwd: null } as FeedRecord]));
  const prev = (games: number[]) => ({ totalGames: games.reduce((a, b) => a + b, 0), gamesByCard: new Map(games.map((g, i) => [`c${i}`, g])) });

  it("publishes growing data that matches the pool", () => {
    expect(checkSnapshot({ matched: m(Array(20).fill(100)), poolSize: 20, previous: prev(Array(20).fill(90)) }).outcome).toBe("published");
    expect(checkSnapshot({ matched: m(Array(20).fill(100)), poolSize: 20, previous: null }).outcome).toBe("published");
  });

  it("needs 95% of the pool to match", () => {
    const r = checkSnapshot({ matched: m(Array(18).fill(100)), poolSize: 20, previous: null });
    expect(r).toMatchObject({ outcome: "failed_validation", reason: "Only 18 of 20 pool cards matched (90%)" });
    expect(checkSnapshot({ matched: m(Array(19).fill(100)), poolSize: 20, previous: null }).outcome).toBe("published");
  });

  it("refuses shrinking totals or too many shrinking cards, and waits on identical or empty data", () => {
    expect(checkSnapshot({ matched: m(Array(20).fill(80)), poolSize: 20, previous: prev(Array(20).fill(90)) }).reason).toBe("Games in hand went down, from 1800 to 1600");
    const sixDown = [...Array(6).fill(89), ...Array(14).fill(200)];
    expect(checkSnapshot({ matched: m(sixDown), poolSize: 20, previous: prev(Array(20).fill(90)) }).reason).toBe("6 cards lost games since the last standings");
    expect(checkSnapshot({ matched: m(Array(20).fill(90)), poolSize: 20, previous: prev(Array(20).fill(90)) }).outcome).toBe("not_newer");
    expect(checkSnapshot({ matched: m(Array(20).fill(0)), poolSize: 20, previous: null }).outcome).toBe("not_newer");
  });

  it("refuses a day where well-played cards have no win rate", () => {
    const blank = new Map(Array.from({ length: 20 }, (_, i) => [`c${i}`, { name: `c${i}`, mtgaId: i, rarity: "common", gihGames: 3000, gihWr: i < 5 ? null : 0.55, alsa: null, ata: null, iwd: null } as FeedRecord]));
    expect(checkSnapshot({ matched: blank, poolSize: 20, previous: null }).reason).toBe("5 of 20 cards with 2000+ games in hand have no win rate");
  });

  it("compares growth only over cards in both days", () => {
    expect(checkSnapshot({ matched: m(Array(20).fill(100)), poolSize: 20, previous: prev(Array(21).fill(90)) }).outcome).toBe("published");
    expect(checkSnapshot({ matched: m(Array(20).fill(90)), poolSize: 20, previous: prev([...Array(20).fill(90), 5000]) }).outcome).toBe("not_newer");
  });

  it("lets an admin force past everything but an empty match", () => {
    expect(checkSnapshot({ matched: m(Array(5).fill(1)), poolSize: 20, previous: prev(Array(20).fill(90)), force: true }).outcome).toBe("published");
    expect(checkSnapshot({ matched: new Map(), poolSize: 20, previous: null, force: true }).outcome).toBe("failed_validation");
  });
});

describe("computeCardScores and scoreEntry", () => {
  it("scores the worked example (spec 6.6)", () => {
    const pool = Array.from({ length: 81 }, (_, i) => ({ id: `c${i + 1}`, rarity: "common" as const, collectorSort: i + 1 }));
    const scores = computeCardScores(pool, new Map(pool.map((c, i) => [c.id, { gihGames: 100000, gihWr: 0.7 - i * 0.001 }])));
    expect(scores.get("c3")).toMatchObject({ score: 97.5, rank: 3, ranked: 81 });
    expect(scores.get("c12")?.score).toBe(86.25);
    const picks = (list: Array<[string, number]>) => list.map(([cardId, slot]) => ({ rarity: "common" as const, slot, cardId }));
    expect(scoreEntry(picks([["c3", 1], ["c12", 2], ["c1", 3], ["c40", 4], ["c7", 5]]), scores)).toEqual({ total: 438.75, common: 438.75, uncommon: 0, rare: 0, mythic: 0, slot1: 146.25 });
    expect(scoreEntry(picks([["c1", 1], ["c3", 2], ["c7", 3], ["c12", 4], ["c40", 5]]), scores).total).toBe(454.6875);
  });

  it("blends 200 average games into a small sample (spec 6.4)", () => {
    const pool = [{ id: "lucky", rarity: "mythic" as const, collectorSort: 1 }, { id: "filler", rarity: "mythic" as const, collectorSort: 2 }];
    const fillerWr = (0.56 * 1000060 - 45) / 1000000;
    const scores = computeCardScores(pool, new Map([["lucky", { gihGames: 60, gihWr: 0.75 }], ["filler", { gihGames: 1000000, gihWr: fillerWr }]]));
    expect(scores.get("lucky")?.adjWr).toBeCloseTo(0.6038, 4);
  });

  it("gives a neutral 50 without a win rate, or with fewer than two ranked cards", () => {
    const pool = [
      { id: "r1", rarity: "rare" as const, collectorSort: 1 }, { id: "r2", rarity: "rare" as const, collectorSort: 2 }, { id: "r3", rarity: "rare" as const, collectorSort: 3 },
      { id: "m1", rarity: "mythic" as const, collectorSort: 4 }, { id: "m2", rarity: "mythic" as const, collectorSort: 5 },
    ];
    const scores = computeCardScores(pool, new Map([
      ["r1", { gihGames: 5000, gihWr: 0.6 }], ["r2", { gihGames: 5000, gihWr: 0.5 }], ["r3", { gihGames: 300, gihWr: null }], ["m1", { gihGames: 900, gihWr: 0.58 }],
    ]));
    expect(scores.get("r1")).toMatchObject({ score: 100, rank: 1, ranked: 2 });
    expect(scores.get("r2")).toMatchObject({ score: 0, rank: 2 });
    expect(scores.get("r3")).toMatchObject({ score: 50, rank: null });
    expect(scores.get("m1")).toMatchObject({ score: 50, rank: null });
    expect(scores.get("m2")?.score).toBe(50);
  });

  it("scores empty slots 0 and cards outside the pool a neutral 50", () => {
    const s = scoreEntry([{ rarity: "rare", slot: 1, cardId: "a" }, { rarity: "rare", slot: 2, cardId: "voided" }], new Map([["a", { score: 80 }]]));
    expect(s).toEqual({ total: 182.5, common: 0, uncommon: 0, rare: 182.5, mythic: 0, slot1: 120 });
    expect(MTG_SLOT_WEIGHTS.reduce((a, b) => a + b, 0)).toBe(5);
  });
});

describe("mtgIngestSlot", () => {
  const set = { arena_release_at: "2026-09-29T18:00:00Z", final_at: "2026-10-27T13:00:00Z" };

  it("runs at 9, 11, 1, 4 and 8 ET from the day after the launch through the final day", () => {
    expect(mtgIngestSlot(set, new Date("2026-09-30T13:00:00Z"))).toEqual({ due: true, date: "2026-09-30", last: false });
    expect(mtgIngestSlot(set, new Date("2026-09-30T14:00:00Z")).due).toBe(false);
    expect(mtgIngestSlot(set, new Date("2026-10-01T00:00:00Z"))).toEqual({ due: true, date: "2026-09-30", last: true });
    expect(mtgIngestSlot(set, new Date("2026-09-29T20:00:00Z")).due).toBe(false);
    expect(mtgIngestSlot(set, new Date("2026-10-27T13:00:00Z")).due).toBe(true);
    expect(mtgIngestSlot(set, new Date("2026-10-28T13:00:00Z")).due).toBe(false);
  });

  it("follows Eastern time across the end of daylight saving", () => {
    const late = { arena_release_at: "2026-10-20T18:00:00Z", final_at: "2026-11-20T14:00:00Z" };
    expect(mtgIngestSlot(late, new Date("2026-11-02T14:00:00Z")).due).toBe(true);
    expect(mtgIngestSlot(late, new Date("2026-11-02T13:00:00Z")).due).toBe(false);
  });
});

describe("season window and dates", () => {
  const set = { arena_release_at: "2026-09-29T18:00:00Z", final_at: "2026-10-27T13:00:00Z" };
  it("opens the day after the Arena launch and closes after the final day", () => {
    expect(mtgIngestWindow(set, new Date("2026-09-30T02:00:00Z")).open).toBe(false);
    expect(mtgIngestWindow(set, new Date("2026-09-30T05:00:00Z"))).toEqual({ date: "2026-09-30", open: true });
    expect(mtgIngestWindow(set, new Date("2026-10-28T05:00:00Z")).open).toBe(false);
  });
  it("lets an admin name any day of the season, including one that has ended", () => {
    // The window closes when the day does; naming a day doesn't, so the final
    // day can still be retried in November (spec 9.1).
    expect(mtgIngestDateAllowed(set, "2026-09-30")).toBe(true);
    expect(mtgIngestDateAllowed(set, "2026-10-27")).toBe(true);
    expect(mtgIngestDateAllowed(set, "2026-09-29")).toBe(false);
    expect(mtgIngestDateAllowed(set, "2026-10-28")).toBe(false);
    expect(mtgIngestDateAllowed(set, "2026-02-31")).toBe(false);
    expect(mtgIngestDateAllowed({ ...set, arena_release_at: null }, "2026-10-01")).toBe(false);
  });
  it("accepts only real calendar dates", () => {
    expect(isDateKey("2026-09-30")).toBe(true);
    expect(isDateKey("2026-02-31")).toBe(false);
    expect(isDateKey("2026-9-30")).toBe(false);
  });
});

describe("standings", () => {
  it("counts days from the Arena launch", () => {
    expect(mtgStandingsDay("2026-09-30", "2026-09-29T18:00:00Z", "2026-10-27T13:00:00Z")).toEqual({ day: 1, totalDays: 28 });
    expect(mtgStandingsDay("2026-10-27", "2026-09-29T18:00:00Z", "2026-10-27T13:00:00Z")).toEqual({ day: 28, totalDays: 28 });
  });

  it("breaks ties on #1 picks, then on who completed first, and shares a rank only when all match", () => {
    const rows = rankStandings([
      { key: "a", total: 1500, slot1: 300, completedAt: "2026-09-20T00:00:00Z", updatedAt: null },
      { key: "b", total: 1500, slot1: 320, completedAt: "2026-09-25T00:00:00Z", updatedAt: null },
      { key: "c", total: 1600, slot1: 100, completedAt: null, updatedAt: "2026-09-01T00:00:00Z" },
      { key: "d", total: 1500, slot1: 300, completedAt: "2026-09-21T00:00:00Z", updatedAt: null },
      { key: "e", total: 1500, slot1: 300, completedAt: "2026-09-21T00:00:00Z", updatedAt: null },
    ]);
    expect(rows.map((r) => `${r.key}${r.rank}`)).toEqual(["c1", "b2", "a3", "d4", "e4"]);
  });
});

describe("rankGroupDay", () => {
  const member = (id: string, entry: string | null, joined: string) => ({ id, entry_id: entry, completed_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", joined_at: joined });
  const members = [member("ann", "e1", "2026-09-01T00:00:00Z"), member("bo", "e2", "2026-09-01T00:00:00Z"), member("cy", "e3", "2026-10-03T12:00:00Z"), member("di", null, "2026-09-01T00:00:00Z")];
  const scores = new Map([["e1", { total: "900", slot1_points: "100" }], ["e2", { total: 1100, slot1_points: 120 }], ["e3", { total: "1200", slot1_points: "90" }]]);

  it("ranks the members with points that day, highest first", () => {
    expect(rankGroupDay(members, scores).map((r) => [r.key, r.rank, r.total])).toEqual([["cy", 1, 1200], ["bo", 2, 1100], ["ann", 3, 900]]);
  });
  it("leaves out anyone who joined after the day being ranked", () => {
    const before = rankGroupDay(members, scores, Date.parse("2026-10-02T13:00:00Z"));
    expect(before.map((r) => [r.key, r.rank])).toEqual([["bo", 1], ["ann", 2]]);
  });
  it("skips members without an entry or without points that day", () => {
    expect(rankGroupDay(members, new Map([["e1", { total: 10, slot1_points: 1 }]])).map((r) => r.key)).toEqual(["ann"]);
  });
});
