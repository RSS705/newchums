import { describe, expect, it } from "vitest";
import { MTG_BADGES, badgeDescription, badgeLabel, compareBadges, computeEntryBadges, computeGroupMind, earlyBirdWinners, formatEasternDate, mtgMorningAfter, mtgRevealedEmailAt, revealFunFact, type MtgRarity } from "../mtg";

const LOCK = "2026-09-29T03:59:00Z";
const RARITIES: MtgRarity[] = ["common", "uncommon", "rare", "mythic"];
function entry(colorsFor: (i: number) => string, opts: { notes?: number; completedAt?: string | null; updatedAt?: string; count?: number } = {}) {
  const count = opts.count ?? 20;
  const picks = Array.from({ length: count }, (_, i) => ({
    rarity: RARITIES[Math.floor(i / 5)],
    slot: (i % 5) + 1,
    note: i < (opts.notes ?? 0) ? "calling it" : null,
    colors: colorsFor(i),
  }));
  return { completedAt: opts.completedAt ?? null, updatedAt: opts.updatedAt ?? "2026-09-20T00:00:00Z", picks };
}
const codes = (awards: { code: string }[]) => awards.map((a) => a.code).sort();

describe("computeEntryBadges", () => {
  it("awards nothing to an empty entry", () => {
    expect(computeEntryBadges({ completedAt: null, updatedAt: LOCK, picks: [] }, LOCK)).toEqual([]);
  });

  it("On the Record and Locked and Loaded need a complete entry, the second a week early", () => {
    const early = computeEntryBadges(entry(() => "W", { completedAt: "2026-09-20T00:00:00Z" }), LOCK);
    expect(codes(early)).toContain("on_the_record");
    expect(codes(early)).toContain("locked_and_loaded");
    const late = computeEntryBadges(entry(() => "W", { completedAt: "2026-09-25T00:00:00Z" }), LOCK);
    expect(codes(late)).toContain("on_the_record");
    expect(codes(late)).not.toContain("locked_and_loaded");
    expect(codes(computeEntryBadges(entry(() => "W", { count: 19, completedAt: "2026-09-01T00:00:00Z" }), LOCK))).not.toContain("on_the_record");
  });

  it("Buzzer Beater is a change in the final hour, not after the lock", () => {
    expect(codes(computeEntryBadges(entry(() => "W", { updatedAt: "2026-09-29T03:30:00Z" }), LOCK))).toContain("buzzer_beater");
    expect(codes(computeEntryBadges(entry(() => "W", { updatedAt: "2026-09-29T02:30:00Z" }), LOCK))).not.toContain("buzzer_beater");
  });

  it("Receipts on File needs five notes", () => {
    expect(codes(computeEntryBadges(entry(() => "W", { notes: 5 }), LOCK))).toContain("receipts_on_file");
    expect(codes(computeEntryBadges(entry(() => "W", { notes: 4 }), LOCK))).not.toContain("receipts_on_file");
  });

  it("colour badges: Rainbow, Loyalist with its colour, Gold Rush and Artificer", () => {
    const palette = ["W", "U", "B", "R", "G"];
    const rainbow = computeEntryBadges(entry((i) => palette[i % 5]), LOCK);
    expect(codes(rainbow)).toContain("rainbow");
    const blue = computeEntryBadges(entry((i) => (i < 10 ? "U" : i < 15 ? "WU" : "")), LOCK);
    const loyal = blue.find((a) => a.code === "loyalist");
    expect(loyal?.key).toBe("u");
    expect(badgeLabel("loyalist", loyal?.detail)).toBe("Blue Loyalist");
    expect(codes(blue)).toContain("gold_rush");
    expect(codes(blue)).toContain("artificer");
    expect(codes(computeEntryBadges(entry((i) => (i < 9 ? "R" : "")), LOCK))).not.toContain("loyalist");
  });

  it("Rainbow and Loyalist need all 20 picks", () => {
    const palette = ["W", "U", "B", "R", "G"];
    const partial = computeEntryBadges(entry((i) => (i < 10 ? "U" : palette[i % 5]), { count: 19 }), LOCK);
    expect(codes(partial)).not.toContain("rainbow");
    expect(codes(partial)).not.toContain("loyalist");
  });

  it("Loyalist ties go to WUBRG order", () => {
    const tie = computeEntryBadges(entry((i) => (i < 10 ? "G" : "W")), LOCK);
    expect(tie.find((a) => a.code === "loyalist")?.key).toBe("w");
  });
});

describe("computeGroupMind", () => {
  it("sums 5 votes for #1 down to 1 for #5 and keeps the top five per rarity", () => {
    const picks = [
      { userId: "a", rarity: "mythic" as const, slot: 1, cardId: "x" },
      { userId: "b", rarity: "mythic" as const, slot: 2, cardId: "x" },
      { userId: "a", rarity: "mythic" as const, slot: 2, cardId: "y" },
      { userId: "b", rarity: "mythic" as const, slot: 1, cardId: "z" },
    ];
    const mind = computeGroupMind(picks).filter((r) => r.rarity === "mythic");
    expect(mind.map((r) => [r.cardId, r.votes, r.pickers])).toEqual([["x", 9, 2], ["z", 5, 1], ["y", 4, 1]]);
    expect(mind.map((r) => r.slot)).toEqual([1, 2, 3]);
  });

  it("breaks ties by #1 votes, then players, then collector order", () => {
    const picks = [
      { userId: "a", rarity: "rare" as const, slot: 1, cardId: "first" },
      { userId: "b", rarity: "rare" as const, slot: 3, cardId: "spread" },
      { userId: "c", rarity: "rare" as const, slot: 4, cardId: "spread" },
      { userId: "d", rarity: "rare" as const, slot: 2, cardId: "low" },
      { userId: "e", rarity: "rare" as const, slot: 2, cardId: "high" },
    ];
    const order = new Map([["low", 3], ["high", 7]]);
    const mind = computeGroupMind(picks, order).filter((r) => r.rarity === "rare").map((r) => r.cardId);
    // first 5 votes and one #1; spread 5 votes, no #1, two players; low and high 4 votes, collector order.
    expect(mind).toEqual(["first", "spread", "low", "high"]);
  });

  it("never returns more than five per rarity", () => {
    const picks = Array.from({ length: 12 }, (_, i) => ({ userId: `u${i}`, rarity: "common" as const, slot: 1, cardId: `c${i}` }));
    expect(computeGroupMind(picks).filter((r) => r.rarity === "common")).toHaveLength(5);
  });
});

describe("earlyBirdWinners", () => {
  it("needs three players with entries and rewards the earliest complete entry, ties included", () => {
    const base = [
      { userId: "a", pickCount: 20, completedAt: "2026-09-20T10:00:00Z" },
      { userId: "b", pickCount: 20, completedAt: "2026-09-19T10:00:00Z" },
      { userId: "c", pickCount: 12, completedAt: null },
    ];
    expect(earlyBirdWinners(base)).toEqual(["b"]);
    expect(earlyBirdWinners(base.slice(0, 2))).toEqual([]);
    expect(earlyBirdWinners([...base, { userId: "d", pickCount: 20, completedAt: "2026-09-19T10:00:00Z" }]).sort()).toEqual(["b", "d"]);
    expect(earlyBirdWinners([{ userId: "a", pickCount: 3, completedAt: null }, { userId: "b", pickCount: 4, completedAt: null }, { userId: "c", pickCount: 5, completedAt: null }])).toEqual([]);
  });
});

describe("badge order and wording", () => {
  it("puts higher tiers first, then the spec's order", () => {
    expect(["on_the_record", "early_bird", "gold_rush", "buzzer_beater"].sort(compareBadges)).toEqual(["gold_rush", "early_bird", "on_the_record", "buzzer_beater"]);
  });

  it("names the Loyalist color in the description", () => {
    expect(badgeDescription("loyalist", { colorName: "Blue" })).toBe("At least 10 of 20 picks are blue.");
    expect(badgeDescription("rainbow", {})).toBe(MTG_BADGES.rainbow.description);
  });
});

describe("mtgMorningAfter", () => {
  it("is 9 AM Eastern the next Eastern day, across the end of daylight saving", () => {
    expect(mtgMorningAfter("2026-09-29T18:00:00Z").toISOString()).toBe("2026-09-30T13:00:00.000Z");
    expect(mtgMorningAfter("2026-11-01T01:30:00Z").toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });
});

describe("reveal email timing and copy", () => {
  it("goes out at 9 AM ET the morning after the lock", () => {
    expect(mtgRevealedEmailAt(LOCK).toISOString()).toBe("2026-09-29T13:00:00.000Z");
    expect(formatEasternDate("2026-09-30T13:00:00Z")).toBe("Wednesday, September 30");
  });

  it("a midnight lock still sends that morning, a mid-morning lock the next", () => {
    expect(mtgRevealedEmailAt("2026-09-29T04:00:00Z").toISOString()).toBe("2026-09-29T13:00:00.000Z");
    expect(mtgRevealedEmailAt("2026-09-29T14:00:00Z").toISOString()).toBe("2026-09-30T13:00:00.000Z");
  });

  it("prefers a shared mythic, then a bold #1, then nothing", () => {
    const shared = revealFunFact([
      { name: "Ann", picks: [{ rarity: "mythic", slot: 1, cardId: "m1", cardName: "Dragon" }] },
      { name: "Bo", picks: [{ rarity: "mythic", slot: 3, cardId: "m1", cardName: "Dragon" }] },
    ]);
    expect(shared).toBe("Most-picked mythic: Dragon, picked by 2 of 2 players.");
    const bold = revealFunFact([
      { name: "Ann", picks: [{ rarity: "rare", slot: 1, cardId: "r1", cardName: "Sword" }, { rarity: "mythic", slot: 1, cardId: "m1", cardName: "Dragon" }] },
      { name: "Bo", picks: [{ rarity: "mythic", slot: 1, cardId: "m2", cardName: "Angel" }, { rarity: "rare", slot: 2, cardId: "r1", cardName: "Sword" }] },
    ]);
    expect(bold).toBe("Boldest #1: Ann put Dragon at #1 among mythics, and nobody else picked it.");
    expect(revealFunFact([{ name: "Solo", picks: [{ rarity: "mythic", slot: 1, cardId: "m1", cardName: "Dragon" }] }])).toBeNull();
  });
});
