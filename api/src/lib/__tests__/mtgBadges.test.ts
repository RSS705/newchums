import { describe, expect, it } from "vitest";
import { MTG_BADGES, MTG_RARITIES, badgeDescription, compareBadges, ordinal, type MtgRarity } from "../mtg";
import { alsaMedians, computeSeasonBadges, type SeasonBadge, type SeasonCard, type SeasonEntry, type SeasonGroup, type SeasonPick } from "../mtgBadges";
import { scoreEntry } from "../mtgScoring";

// Twenty ranked cards at every rarity: "c1" is the #1 common, "m20" the last mythic.
const N = 20;
function pool(opts: { ranked?: number | Partial<Record<MtgRarity, number>>; alsa?: (rarity: MtgRarity, rank: number) => number | null; adj?: (rarity: MtgRarity, rank: number) => number } = {}): SeasonCard[] {
  return MTG_RARITIES.flatMap((rarity) => {
    const ranked = typeof opts.ranked === "number" ? opts.ranked : opts.ranked?.[rarity] ?? N;
    return Array.from({ length: N }, (_, i) => {
      const rank = i + 1;
      // Like computeCardScores: a rarity with fewer than two cards with a win rate ranks none.
      const isRanked = ranked >= 2 && rank <= ranked;
      return {
        cardId: `${rarity[0]}${rank}`,
        name: `${rarity} card ${rank}`,
        rarity,
        rank: isRanked ? rank : null,
        rankedCount: ranked >= 2 ? ranked : 0,
        cardScore: isRanked ? (100 * (ranked - rank)) / (ranked - 1) : 50,
        adjWr: isRanked ? (opts.adj ? opts.adj(rarity, rank) : 0.6 - rank / 200) : null,
        alsa: opts.alsa ? opts.alsa(rarity, rank) : null,
      };
    });
  });
}

type Ranks = Partial<Record<MtgRarity, number[]>>;
// Unremarkable picks: out of order, outside the top 10 and above the bottom quarter.
const BORING = [12, 11, 14, 13, 15];
const DEFAULT: Record<MtgRarity, number[]> = { common: BORING, uncommon: BORING, rare: BORING, mythic: BORING };

/** An entry picking the cards at `ranks`, slot order, scored against `cards`. */
function entry(userId: string, ranks: Ranks = {}, cards: SeasonCard[] = pool(), opts: { notes?: string[]; hidden?: boolean; completedAt?: string } = {}): SeasonEntry {
  const picks: SeasonPick[] = MTG_RARITIES.flatMap((rarity) => (ranks[rarity] ?? DEFAULT[rarity]).map((rank, i) => {
    const cardId = `${rarity[0]}${rank}`;
    return { rarity, slot: i + 1, cardId, note: opts.notes?.includes(cardId) ? "Calling it now" : null };
  }));
  const s = scoreEntry(picks, new Map(cards.map((c) => [c.cardId, { score: c.cardScore }])));
  return {
    userId, hidden: opts.hidden ?? false, total: s.total, slot1: s.slot1,
    subtotals: { common: s.common, uncommon: s.uncommon, rare: s.rare, mythic: s.mythic },
    completedAt: opts.completedAt ?? "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z", picks,
  };
}

/** One day's group standings from totals, best first. */
function day(entries: SeasonEntry[]) {
  return [...entries].sort((a, b) => b.total - a.total).map((e, i) => ({ userId: e.userId, rank: i + 1 }));
}

const mine = (badges: SeasonBadge[], userId: string, code?: string) => badges.filter((b) => b.userId === userId && (!code || b.code === code));
const codesFor = (badges: SeasonBadge[], userId: string) => [...new Set(mine(badges, userId).map((b) => b.code))].sort();

describe("prediction achievements", () => {
  it("Clean Sweep, Perfect Order, Sniper, Called It and Bullseye from one perfect rarity", () => {
    const e = entry("a", { common: [1, 2, 3, 4, 5] });
    const badges = computeSeasonBadges({ cards: pool(), entries: [e], groups: [] });
    for (const code of ["clean_sweep", "perfect_order", "sniper", "called_it", "bullseye"]) expect(codesFor(badges, "a")).toContain(code);
    expect(mine(badges, "a", "clean_sweep")).toEqual([{ userId: "a", communityId: null, code: "clean_sweep", key: "common", detail: { rarity: "common" } }]);
    expect((mine(badges, "a", "bullseye")[0].detail.cards as unknown[]).length).toBe(5);
  });

  it("Clean Sweep is the top five in any order; Perfect Order is any increasing ranks", () => {
    const shuffled = computeSeasonBadges({ cards: pool(), entries: [entry("a", { common: [3, 1, 2, 5, 4] })], groups: [] });
    expect(mine(shuffled, "a", "clean_sweep")).toHaveLength(1);
    expect(mine(shuffled, "a", "perfect_order")).toHaveLength(0);
    const spread = computeSeasonBadges({ cards: pool(), entries: [entry("a", { rare: [2, 5, 9, 14, 18] })], groups: [] });
    expect(mine(spread, "a", "perfect_order")[0]).toMatchObject({ key: "rare", detail: { rarity: "rare", ranks: [2, 5, 9, 14, 18] } });
    expect(mine(spread, "a", "clean_sweep")).toHaveLength(0);
    expect(mine(spread, "a", "sniper")).toHaveLength(0);
  });

  it("Sniper needs all five in the top 10", () => {
    expect(mine(computeSeasonBadges({ cards: pool(), entries: [entry("a", { uncommon: [10, 1, 4, 7, 9] })], groups: [] }), "a", "sniper")).toHaveLength(1);
    expect(mine(computeSeasonBadges({ cards: pool(), entries: [entry("a", { uncommon: [11, 1, 4, 7, 9] })], groups: [] }), "a", "sniper")).toHaveLength(0);
  });

  it("Called It and Bust stack, one per rarity", () => {
    const e = entry("a", { common: [1, 6, 7, 8, 9], mythic: [1, 6, 7, 8, 9], rare: [16, 6, 7, 8, 9], uncommon: [15, 6, 7, 8, 9] });
    const badges = computeSeasonBadges({ cards: pool(), entries: [e], groups: [] });
    expect(mine(badges, "a", "called_it").map((b) => b.key).sort()).toEqual(["common", "mythic"]);
    // The bottom quarter of 20 is ranks 16 to 20.
    expect(mine(badges, "a", "bust").map((b) => b.key)).toEqual(["rare"]);
    expect(mine(badges, "a", "bust")[0].detail).toMatchObject({ rarity: "rare", card: { name: "rare card 16", rank: 16, ranked: 20 } });
  });

  it("Grand Slam wants a top-five pick at every rarity, Well-Rounded a top 10", () => {
    const both = computeSeasonBadges({ cards: pool(), entries: [entry("a", { common: [5, 12, 13, 14, 15], uncommon: [2, 12, 13, 14, 15], rare: [4, 12, 13, 14, 15], mythic: [3, 12, 13, 14, 15] })], groups: [] });
    expect(codesFor(both, "a")).toEqual(expect.arrayContaining(["grand_slam", "well_rounded"]));
    const near = computeSeasonBadges({ cards: pool(), entries: [entry("a", { common: [7, 12, 13, 14, 15], uncommon: [2, 12, 13, 14, 15], rare: [4, 12, 13, 14, 15], mythic: [3, 12, 13, 14, 15] })], groups: [] });
    expect(codesFor(near, "a")).toContain("well_rounded");
    expect(codesFor(near, "a")).not.toContain("grand_slam");
  });

  it("Bomb Squad, Bomb Detector and Common Denominator look at the #1 cards in any slot", () => {
    const squad = computeSeasonBadges({ cards: pool(), entries: [entry("a", { rare: [6, 7, 1, 8, 9], mythic: [6, 7, 8, 9, 1], common: [6, 1, 7, 8, 9] })], groups: [] });
    expect(codesFor(squad, "a")).toEqual(expect.arrayContaining(["bomb_squad", "bomb_detector", "common_denominator"]));
    expect(mine(squad, "a", "bomb_detector")[0].detail.cards).toHaveLength(2);
    const detector = computeSeasonBadges({ cards: pool(), entries: [entry("a", { mythic: [6, 7, 8, 9, 1] })], groups: [] });
    expect(codesFor(detector, "a")).toContain("bomb_detector");
    expect(codesFor(detector, "a")).not.toContain("bomb_squad");
    expect(codesFor(detector, "a")).not.toContain("common_denominator");
  });

  it("Sleeper Agent: a top 10 card with its ALSA in the later half", () => {
    // ALSA rises with the rank, except common 3, which drafters take very late.
    const cards = pool({ alsa: (rarity, rank) => (rarity === "common" && rank === 3 ? 12 : rank / 4) });
    expect(alsaMedians(cards).get("common")).toBeCloseTo(2.875);
    const badges = computeSeasonBadges({ cards, entries: [entry("a", { common: [3, 1, 2, 4, 5] }, cards)], groups: [] });
    expect(mine(badges, "a", "sleeper_agent")[0].detail.cards).toEqual([{ name: "common card 3", rarity: "common", rank: 3, ranked: 20, slot: 1 }]);
    // Common 12 is late too, but outside the top 10.
    const late = pool({ alsa: (_, rank) => rank });
    expect(mine(computeSeasonBadges({ cards: late, entries: [entry("b", {}, late)], groups: [] }), "b", "sleeper_agent")).toHaveLength(0);
  });

  it("Rock Bottom is dead last; Eats Words is a noted pick in the bottom quarter", () => {
    const e = entry("a", { rare: [6, 7, 8, 9, 20], uncommon: [6, 7, 8, 17, 9] }, pool(), { notes: ["u17", "c6"] });
    const badges = computeSeasonBadges({ cards: pool(), entries: [e], groups: [] });
    expect(mine(badges, "a", "rock_bottom")[0].detail.cards).toEqual([{ name: "rare card 20", rarity: "rare", rank: 20, ranked: 20, slot: 5 }]);
    expect(mine(badges, "a", "eats_words")[0].detail.cards).toEqual([{ name: "uncommon card 17", rarity: "uncommon", rank: 17, ranked: 20, slot: 4 }]);
  });

  it("Oracle and Sharp Eye need 20 on the Everyone board, and hidden entries aren't on it", () => {
    const cards = pool();
    // Twenty entries whose totals fall with the index: p0 leads.
    const ranked = Array.from({ length: 20 }, (_, i) => entry(`p${i}`, { common: [i + 1] }, cards));
    const many = [...ranked].reverse();
    const badges = computeSeasonBadges({ cards, entries: many, groups: [] });
    expect(codesFor(badges, ranked[0].userId)).toEqual(expect.arrayContaining(["oracle", "sharp_eye"]));
    expect(mine(badges, ranked[0].userId, "oracle")[0].detail).toEqual({ rank: 1, players: 20 });
    expect(codesFor(badges, ranked[4].userId)).toContain("sharp_eye");
    expect(codesFor(badges, ranked[4].userId)).not.toContain("oracle");
    expect(codesFor(badges, ranked[5].userId)).not.toContain("sharp_eye");
    // Hide the leader: 19 on the board is too few for either.
    const hidden = many.map((e) => (e.userId === ranked[0].userId ? { ...e, hidden: true } : e));
    const none = computeSeasonBadges({ cards, entries: hidden, groups: [] });
    expect(none.some((b) => b.code === "oracle" || b.code === "sharp_eye")).toBe(false);
  });

  it("Monkey Business is a complete entry below the random-picks line", () => {
    const bad = entry("a", { common: [16, 17, 18, 19, 20], uncommon: [16, 17, 18, 19, 20], rare: [16, 17, 18, 19, 20], mythic: [16, 17, 18, 19, 20] });
    expect(mine(computeSeasonBadges({ cards: pool(), entries: [bad], groups: [] }), "a", "monkey_business")[0].detail).toEqual({ points: bad.total });
    const half = { ...bad, picks: bad.picks.slice(0, 10) };
    expect(mine(computeSeasonBadges({ cards: pool(), entries: [half], groups: [] }), "a", "monkey_business")).toHaveLength(0);
    const thin = pool({ ranked: { mythic: 9 } });
    const early = entry("a", { common: [16, 17, 18, 19, 20], uncommon: [16, 17, 18, 19, 20], rare: [16, 17, 18, 19, 20] }, thin);
    expect(early.total).toBeLessThan(1000);
    expect(mine(computeSeasonBadges({ cards: thin, entries: [early], groups: [] }), "a", "monkey_business")).toHaveLength(0);
  });

  it("judges nothing by rank until a rarity has more than ten cards ranked, and never an unranked card", () => {
    const thin = pool({ ranked: 10 });
    const badges = computeSeasonBadges({ cards: thin, entries: [entry("a", { common: [1, 2, 3, 4, 5] }, thin)], groups: [] });
    expect(badges.filter((b) => b.code !== "monkey_business")).toEqual([]);
    const cards = pool();
    const unranked = cards.map((c) => (c.cardId === "c1" ? { ...c, rank: null } : c));
    expect(mine(computeSeasonBadges({ cards: unranked, entries: [entry("a", { common: [1, 6, 7, 8, 9] }, unranked)], groups: [] }), "a", "called_it")).toHaveLength(0);
  });
});

describe("group honors", () => {
  const cards = pool();
  const group = (entries: SeasonEntry[], extra: Partial<SeasonGroup> = {}): SeasonGroup => ({ communityId: "g1", days: [day(entries)], mind: [], ...extra });

  it("need three players with entries", () => {
    const two = [entry("a", { common: [1, 2, 3, 4, 5] }), entry("b")];
    expect(computeSeasonBadges({ cards, entries: two, groups: [group(two)] }).filter((b) => b.communityId)).toEqual([]);
  });

  it("Champion, Runner-Up, Third Place and Wooden Spoon follow the standings", () => {
    const four = [entry("a", { common: [1, 2, 3, 4, 5] }), entry("b", { common: [1, 2, 3, 4, 6] }), entry("c"), entry("d", { common: [16, 17, 18, 19, 20] })];
    const badges = computeSeasonBadges({ cards, entries: four, groups: [group(four)] });
    expect(mine(badges, "a", "champion")).toEqual([{ userId: "a", communityId: "g1", code: "champion", key: "", detail: { players: 4 } }]);
    expect(codesFor(badges, "b")).toContain("runner_up");
    expect(codesFor(badges, "c")).toContain("third_place");
    expect(codesFor(badges, "d")).toContain("wooden_spoon");
    expect(codesFor(badges, "a")).not.toContain("wooden_spoon");
  });

  it("subtotal honors go to the highest subtotal at each rarity, shared on a tie", () => {
    const three = [entry("a", { mythic: [1, 2, 3, 4, 5] }), entry("b", { mythic: [1, 2, 3, 4, 5] }), entry("c", { common: [1, 2, 3, 4, 5] })];
    const badges = computeSeasonBadges({ cards, entries: three, groups: [group(three)] });
    expect(mine(badges, "a", "mythic_vision")).toHaveLength(1);
    expect(mine(badges, "b", "mythic_vision")).toHaveLength(1);
    expect(mine(badges, "c", "common_sense")[0].detail).toMatchObject({ rarity: "common" });
    expect(mine(badges, "c", "mythic_vision")).toHaveLength(0);
  });

  it("Pick of the Season is the pick worth the most points, whatever its slot", () => {
    const three = [entry("a", { rare: [2, 1, 3, 4, 5] }), entry("b", { rare: [1, 2, 3, 4, 5] }), entry("c", { rare: [3, 4, 5, 6, 7] })];
    const badges = computeSeasonBadges({ cards, entries: three, groups: [group(three)] });
    // Every slot counts the same, so the #1 rare earns 100 at a's #2 as at b's #1; c's best is the #3 rare.
    expect(mine(badges, "b", "pick_of_the_season")[0].detail.cards).toEqual([{ name: "rare card 1", rarity: "rare", rank: 1, ranked: 20, slot: 1, points: 100 }]);
    expect(mine(badges, "a", "pick_of_the_season")[0].detail.cards).toEqual([{ name: "rare card 1", rarity: "rare", rank: 1, ranked: 20, slot: 2, points: 100 }]);
    expect(mine(badges, "c", "pick_of_the_season")).toHaveLength(0);
  });

  it("Comeback Kid, King of the Hill, Wire to Wire and Rollercoaster read the days", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => entry(id));
    const days = [
      [{ userId: "a", rank: 1 }, { userId: "b", rank: 2 }, { userId: "c", rank: 3 }, { userId: "d", rank: 4 }],
      [{ userId: "b", rank: 1 }, { userId: "a", rank: 2 }, { userId: "c", rank: 3 }, { userId: "d", rank: 4 }],
      [{ userId: "d", rank: 1 }, { userId: "a", rank: 2 }, { userId: "b", rank: 3 }, { userId: "c", rank: 4 }],
    ];
    const badges = computeSeasonBadges({ cards, entries: [a, b, c, d], groups: [{ communityId: "g1", days, mind: [] }] });
    expect(mine(badges, "d", "comeback_kid")[0].detail).toEqual({ from: 4, to: 1 });
    // a, b and d each led one day.
    for (const id of ["a", "b", "d"]) expect(mine(badges, id, "king_of_the_hill")[0].detail).toEqual({ days: 1 });
    expect(badges.filter((x) => x.code === "wire_to_wire")).toEqual([]);
    // Places moved: a 1+0, b 1+2, c 0+1, d 0+3.
    expect(mine(badges, "d", "rollercoaster")[0].detail).toEqual({ places: 3 });
    expect(mine(badges, "b", "rollercoaster")[0].detail).toEqual({ places: 3 });
    expect(mine(badges, "a", "rollercoaster")).toHaveLength(0);

    const steady = [days[0], days[0]];
    const wire = computeSeasonBadges({ cards, entries: [a, b, c, d], groups: [{ communityId: "g1", days: steady, mind: [] }] });
    expect(mine(wire, "a", "wire_to_wire")[0].detail).toEqual({ days: 2 });
    expect(wire.filter((x) => x.code === "rollercoaster" || x.code === "comeback_kid")).toEqual([]);
  });

  it("counts days from the group's first standings", () => {
    const [a, b, c] = ["a", "b", "c"].map((id) => entry(id));
    const today = [{ userId: "a", rank: 1 }, { userId: "b", rank: 2 }, { userId: "c", rank: 3 }];
    const badges = computeSeasonBadges({ cards, entries: [a, b, c], groups: [{ communityId: "g1", days: [[], [], today], mind: [] }] });
    expect(mine(badges, "a", "wire_to_wire")[0].detail).toEqual({ days: 1 });
    expect(mine(badges, "a", "king_of_the_hill")[0].detail).toEqual({ days: 1 });
  });

  it("Contrarian and Hive Mind compare complete entries with the Group Mind, only when they differ", () => {
    const mindPicks = MTG_RARITIES.flatMap((rarity) => BORING.map((rank, i) => ({ rarity, slot: i + 1, cardId: `${rarity[0]}${rank}` })));
    const four = [entry("a"), entry("b"), entry("c", { common: [1, 2, 3, 4, 5], uncommon: [1, 2, 3, 4, 5] }), entry("d", { common: [1, 2, 3, 4, 5] })];
    const badges = computeSeasonBadges({ cards, entries: four, groups: [group(four, { mind: mindPicks })] });
    expect(mine(badges, "c", "contrarian")[0].detail).toEqual({ shared: 10 });
    expect(mine(badges, "a", "hive_mind")[0].detail).toEqual({ shared: 20 });
    expect(mine(badges, "b", "hive_mind")).toHaveLength(1);
    const same = [entry("a"), entry("b"), entry("c"), entry("d")];
    expect(computeSeasonBadges({ cards, entries: same, groups: [group(same, { mind: mindPicks })] }).filter((x) => x.code === "contrarian" || x.code === "hive_mind")).toEqual([]);
  });

  it("Beat the Crowd is more points than the Group Mind's picks", () => {
    const mindPicks = MTG_RARITIES.flatMap((rarity) => BORING.map((rank, i) => ({ rarity, slot: i + 1, cardId: `${rarity[0]}${rank}` })));
    const four = [entry("a", { common: [1, 2, 3, 4, 5] }), entry("b"), entry("c", { common: [16, 17, 18, 19, 20] }), entry("d", { rare: [16, 17, 18, 19, 20] })];
    const badges = computeSeasonBadges({ cards, entries: four, groups: [group(four, { mind: mindPicks })] });
    expect(badges.filter((x) => x.code === "beat_the_crowd").map((x) => x.userId)).toEqual(["a"]);
    expect(mine(badges, "a", "beat_the_crowd")[0].detail).toEqual({ points: four[0].total, mind: four[1].total });
  });

  it("Photo Finish goes to both players on either side of the smallest gap", () => {
    const four = [entry("a", { common: [1, 2, 3, 4, 5] }), entry("b", { common: [1, 2, 3, 4, 6] }), entry("c"), entry("d", { common: [16, 17, 18, 19, 20] })];
    const badges = computeSeasonBadges({ cards, entries: four, groups: [group(four)] });
    expect(badges.filter((x) => x.code === "photo_finish").map((x) => x.userId).sort()).toEqual(["a", "b"]);
    expect(mine(badges, "a", "photo_finish")[0].detail.gap).toBeCloseTo(four[0].total - four[1].total, 4);
  });

  it("Whiff of the Season is the lowest Card Score among the #1 picks", () => {
    const three = [entry("a", { mythic: [19, 1, 2, 3, 4] }), entry("b", { rare: [18, 1, 2, 3, 4] }), entry("c")];
    const badges = computeSeasonBadges({ cards, entries: three, groups: [group(three)] });
    expect(badges.filter((x) => x.code === "whiff_of_the_season").map((x) => x.userId)).toEqual(["a"]);
    expect(mine(badges, "a", "whiff_of_the_season")[0].detail.cards).toEqual([{ name: "mythic card 19", rarity: "mythic", rank: 19, ranked: 20, score: expect.closeTo(100 / 19, 4) }]);
  });

  it("Lone Wolf is the only player in the group on a top-five card", () => {
    const three = [entry("a", { common: [2, 6, 7, 8, 9] }), entry("b", { common: [1, 6, 7, 8, 9] }), entry("c", { common: [1, 6, 7, 8, 9] })];
    const badges = computeSeasonBadges({ cards, entries: three, groups: [group(three)] });
    expect(badges.filter((x) => x.code === "lone_wolf").map((x) => x.userId)).toEqual(["a"]);
  });

  it("Told You So is a noted pick the Group Mind left out, in the top five, in a group of three", () => {
    const mindPicks = [{ rarity: "common" as const, slot: 1, cardId: "c1" }];
    const three = [entry("a", { common: [1, 3, 7, 8, 9] }, cards, { notes: ["c1", "c3"] }), entry("b", {}, cards, { notes: ["c6"] }), entry("c")];
    const badges = computeSeasonBadges({ cards, entries: three, groups: [group(three, { mind: mindPicks })] });
    expect(mine(badges, "a", "told_you_so")[0]).toMatchObject({ communityId: "g1", detail: { cards: [{ name: "common card 3", rank: 3 }] } });
    expect(mine(badges, "b", "told_you_so")).toHaveLength(0);
    expect(computeSeasonBadges({ cards, entries: three, groups: [group(three)] }).filter((x) => x.code === "told_you_so")).toEqual([]);
    expect(computeSeasonBadges({ cards, entries: three.slice(0, 2), groups: [group(three.slice(0, 2), { mind: mindPicks })] }).filter((x) => x.code === "told_you_so")).toEqual([]);
  });

  it("Pick of the Season settles equal points on the higher adjusted win rate", () => {
    // a's #1 common and b's #1 mythic both finish #1: 100 points each.
    const adj = (rarity: MtgRarity, rank: number) => (rarity === "mythic" ? 0.66 : 0.6) - rank / 200;
    const thinAdj = pool({ adj });
    const three = [entry("a", { common: [1, 6, 7, 8, 9] }, thinAdj), entry("b", { mythic: [1, 6, 7, 8, 9] }, thinAdj), entry("c", {}, thinAdj)];
    const badges = computeSeasonBadges({ cards: thinAdj, entries: three, groups: [group(three)] });
    expect(badges.filter((x) => x.code === "pick_of_the_season").map((x) => x.userId)).toEqual(["b"]);
    // The same card at #1 shares.
    const twins = [entry("a", { mythic: [1, 6, 7, 8, 9] }, thinAdj), entry("b", { mythic: [1, 6, 7, 8, 9] }, thinAdj), entry("c", {}, thinAdj)];
    expect(computeSeasonBadges({ cards: thinAdj, entries: twins, groups: [group(twins)] }).filter((x) => x.code === "pick_of_the_season").map((x) => x.userId).sort()).toEqual(["a", "b"]);
  });

  it("Wooden Spoon needs four players, so last of three keeps Third Place alone", () => {
    const three = [entry("a", { common: [1, 2, 3, 4, 5] }), entry("b"), entry("c", { common: [16, 17, 18, 19, 20] })];
    const badges = computeSeasonBadges({ cards, entries: three, groups: [group(three)] });
    expect(codesFor(badges, "c")).toContain("third_place");
    expect(codesFor(badges, "c")).not.toContain("wooden_spoon");
  });

  it("days with fewer than three players, or no ranked rarity, don't count", () => {
    const [a, b, c] = ["a", "b", "c"].map((id) => entry(id));
    const alone = [{ userId: "a", rank: 1 }];
    const full = [{ userId: "a", rank: 1 }, { userId: "b", rank: 2 }, { userId: "c", rank: 3 }];
    const founder = computeSeasonBadges({ cards, entries: [a, b, c], groups: [{ communityId: "g1", days: [alone, alone, full, full], mind: [] }] });
    expect(mine(founder, "a", "wire_to_wire")[0].detail).toEqual({ days: 2 });
    expect(mine(founder, "a", "king_of_the_hill")[0].detail).toEqual({ days: 2 });
    const thinFirst = computeSeasonBadges({ cards, entries: [a, b, c], groups: [{ communityId: "g1", days: [full, full, full], mind: [] }], judgedDays: [false, true, true] });
    expect(mine(thinFirst, "a", "wire_to_wire")[0].detail).toEqual({ days: 2 });
  });

  it("a rarity's honors wait until it's ranked, and standings honors until any rarity is", () => {
    const noMythics = pool({ ranked: { mythic: 8 } });
    const four = ["a", "b", "c", "d"].map((id, i) => entry(id, { common: [1 + i, 11, 12, 13, 14] }, noMythics));
    const badges = computeSeasonBadges({ cards: noMythics, entries: four, groups: [group(four)] });
    expect(badges.some((x) => x.code === "mythic_vision")).toBe(false);
    expect(badges.some((x) => x.code === "common_sense")).toBe(true);
    expect(badges.some((x) => x.code === "champion")).toBe(true);
    const blank = pool({ ranked: 1 });
    const flat = ["a", "b", "c", "d"].map((id) => entry(id, {}, blank));
    const none = computeSeasonBadges({ cards: blank, entries: flat, groups: [group(flat)] });
    for (const code of ["champion", "runner_up", "third_place", "wooden_spoon", "photo_finish", "king_of_the_hill", "wire_to_wire", "common_sense", "monkey_business"]) {
      expect(none.some((x) => x.code === code)).toBe(false);
    }
  });
});

describe("badge catalogue and reasons", () => {
  it("has all 46 badges, numbered once each", () => {
    const numbers = Object.values(MTG_BADGES).map((b) => b.number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 46 }, (_, i) => i + 1));
    expect(["called_it", "champion", "wooden_spoon", "hive_mind"].sort(compareBadges)).toEqual(["champion", "called_it", "hive_mind", "wooden_spoon"]);
  });

  it("writes past tense for earned badges and present tense on track", () => {
    expect(badgeDescription("champion", { players: 6 })).toBe("Finished first of 6 in the group.");
    expect(badgeDescription("champion", { players: 6 }, true)).toBe("First of 6 in the group right now.");
    const called = { rarity: "mythic", card: { name: "Sky Tyrant", rarity: "mythic", rank: 1, ranked: 26 } };
    expect(badgeDescription("called_it", called)).toBe("Sky Tyrant, the #1 mythic pick, finished #1 among mythics.");
    expect(badgeDescription("called_it", called, true)).toBe("Sky Tyrant, the #1 mythic pick, is #1 among mythics right now.");
    expect(badgeDescription("photo_finish", { gap: 0.04 }, true)).toBe("Under 0.1 points from the player one place away, the closest gap in the group right now.");
    expect(badgeDescription("contrarian", { shared: 0 })).toBe("None of 20 picks matched the Group Mind, the fewest in the group.");
    expect(badgeDescription("oracle", { rank: 2, players: 40 })).toBe("Finished 2nd of 40 on the Everyone board, in the top 5%.");
    expect(badgeDescription("monkey_business", { points: 999.6 }, true)).toBe("999.6 points right now, below the 1,000 points random picks would score.");
    expect(badgeDescription("monkey_business", { points: 912.3 })).toBe("Finished with 912 points, below the 1,000 points random picks would score.");
    expect(badgeDescription("beat_the_crowd", { points: 1500.04, mind: 1500.01 })).toBe("Finished with 1,500.04 points, above the Group Mind's 1,500.01.");
  });

  it("lists the first three cards and counts the rest", () => {
    const cards = ["A", "B", "C", "D", "E"].map((name, i) => ({ name, rarity: "common", rank: i + 1, ranked: 81 }));
    expect(badgeDescription("bullseye", { cards })).toBe("Finished exactly where they were ranked: A, 1st of 81 commons; B, 2nd of 81 commons; C, 3rd of 81 commons; and 2 more.");
    expect(badgeDescription("rock_bottom", { cards: [{ name: "Dud", rarity: "rare", rank: 51, ranked: 51 }] }, true)).toBe("Dead last right now: Dud, 51st of 51 rares.");
  });

  it("falls back to the catalogue line when the detail is missing something", () => {
    expect(badgeDescription("rock_bottom", {})).toBe(MTG_BADGES.rock_bottom.description);
    expect(badgeDescription("champion", null, true)).toBe(MTG_BADGES.champion.description);
    const emDash = String.fromCharCode(0x2014);
    for (const code of Object.keys(MTG_BADGES)) expect(badgeDescription(code, {})).not.toContain(emDash);
  });

  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]);
  });
});
