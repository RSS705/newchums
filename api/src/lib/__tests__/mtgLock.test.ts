import { describe, expect, it } from "vitest";
import {
  MTG_BADGES, MTG_LOCK_BADGE_CODES, MTG_REDEFINED_LOCK_BADGE_CODES, MTG_RETIRED_LOCK_BADGE_CODES, badgeDescription, badgeLabel, cardTypes, compareBadges,
  computeEntryBadges, computeGroupLockBadges, computeGroupMind, formatEasternDate, formatEasternLong, mtgLatestLockAt, mtgMorningAfter, mtgRevealedEmailAt,
  revealFunFact, type GroupLockPick, type GroupLockPlayer, type MtgRarity,
} from "../mtg";

const LOCK = "2026-09-29T03:59:00Z";
const RARITIES: MtgRarity[] = ["common", "uncommon", "rare", "mythic"];
function entry(colorsFor: (i: number) => string, opts: { completedAt?: string | null; updatedAt?: string; count?: number } = {}) {
  const count = opts.count ?? 20;
  const picks = Array.from({ length: count }, (_, i) => ({
    rarity: RARITIES[Math.floor(i / 5)],
    slot: (i % 5) + 1,
    colors: colorsFor(i),
  }));
  return { completedAt: opts.completedAt ?? null, updatedAt: opts.updatedAt ?? "2026-09-20T00:00:00Z", picks };
}
const codes = (awards: { code: string }[]) => awards.map((a) => a.code).sort();

describe("computeEntryBadges", () => {
  it("awards nothing to an empty entry", () => {
    expect(computeEntryBadges({ completedAt: null, updatedAt: LOCK, picks: [] }, LOCK)).toEqual([]);
  });

  it("no longer gives the badges nearly everyone earned", () => {
    const palette = ["W", "U", "B", "R", "G"];
    const early = computeEntryBadges(entry((i) => palette[i % 5], { completedAt: "2026-09-01T00:00:00Z" }), LOCK);
    expect(codes(early)).toEqual([]);
    for (const code of MTG_RETIRED_LOCK_BADGE_CODES) expect(MTG_BADGES[code]).toBeUndefined();
  });

  it("Buzzer Beater is a change in the final hour, not after the lock", () => {
    expect(codes(computeEntryBadges(entry(() => "W", { updatedAt: "2026-09-29T03:30:00Z" }), LOCK))).toContain("buzzer_beater");
    expect(codes(computeEntryBadges(entry(() => "W", { updatedAt: "2026-09-29T02:30:00Z" }), LOCK))).not.toContain("buzzer_beater");
  });

  it("Loyalist names its colour, and needs half of all 20 picks", () => {
    const blue = computeEntryBadges(entry((i) => (i < 10 ? "U" : i < 15 ? "WU" : "")), LOCK);
    const loyal = blue.find((a) => a.code === "loyalist");
    expect(loyal?.key).toBe("u");
    expect(badgeLabel("loyalist", loyal?.detail)).toBe("Blue Loyalist");
    // Gold Rush and Artificer compare a player with their group now.
    expect(codes(blue)).toEqual(["loyalist"]);
    expect(codes(computeEntryBadges(entry((i) => (i < 9 ? "R" : "")), LOCK))).not.toContain("loyalist");
    expect(codes(computeEntryBadges(entry(() => "U", { count: 19 }), LOCK))).not.toContain("loyalist");
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

describe("cardTypes", () => {
  it("reads the front face's types and ignores subtypes", () => {
    // Scryfall separates types from subtypes with a long dash.
    const dash = String.fromCharCode(0x2014);
    expect(cardTypes(`Artifact Creature ${dash} Golem`)).toEqual(["creature", "artifact"]);
    expect(cardTypes(`Legendary Enchantment ${dash} Saga`)).toEqual(["enchantment"]);
    expect(cardTypes("Instant // Sorcery")).toEqual(["instant"]);
    expect(cardTypes(`Land ${dash} Forest Island`)).toEqual(["land"]);
    expect(cardTypes(null)).toEqual([]);
  });
});

describe("computeGroupLockBadges", () => {
  const RARITY_OF = (i: number) => RARITIES[Math.floor(i / 5)];
  /** Twenty picks. Cards are shared with the rest of the group unless `own` says a pick is the player's alone. */
  function player(userId: string, opts: { own?: number; type?: (i: number) => string; cost?: (i: number) => number; colors?: (i: number) => string; count?: number } = {}): GroupLockPlayer {
    const picks: GroupLockPick[] = Array.from({ length: opts.count ?? 20 }, (_, i) => ({
      rarity: RARITY_OF(i),
      cardId: i < (opts.own ?? 0) ? `${userId}-${i}` : `shared-${i}`,
      colors: opts.colors?.(i) ?? "W",
      manaValue: opts.cost?.(i) ?? 3,
      typeLine: opts.type?.(i) ?? "Creature",
    }));
    return { userId, picks };
  }
  const won = (badges: ReturnType<typeof computeGroupLockBadges>, code: string) => badges.filter((b) => b.code === code).map((b) => b.userId).sort();

  it("needs three players with all 20 picks", () => {
    const two = [player("a", { own: 6 }), player("b"), player("c", { count: 19 })];
    expect(computeGroupLockBadges(two)).toEqual([]);
    expect(won(computeGroupLockBadges([...two, player("d")]), "one_of_a_kind")).toEqual(["a"]);
  });

  it("One of a Kind goes to the most picks nobody else made, counting unfinished players as somebody", () => {
    const group = [player("a", { own: 4 }), player("b", { own: 7 }), player("c"), player("d", { count: 12 })];
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "one_of_a_kind")).toEqual(["b"]);
    expect(badges.find((b) => b.code === "one_of_a_kind")?.detail).toEqual({ count: 7 });
    // d picked shared-0 to shared-11 too, so nobody's shared picks became their own.
    expect(badgeDescription("one_of_a_kind", { count: 7 })).toBe("7 of 20 picks are cards nobody else in the group picked, the most in the group.");
  });

  it("Big Spender and Bargain Hunter compare average mana value, lands left out", () => {
    const group = [
      player("a", { cost: () => 5 }),
      player("b", { cost: () => 2 }),
      // Ten lands at 0 would drag the average to 2; without them it is 4.
      player("c", { cost: (i) => (i < 10 ? 0 : 4), type: (i) => (i < 10 ? "Land" : "Creature") }),
    ];
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "big_spender")).toEqual(["a"]);
    expect(won(badges, "bargain_hunter")).toEqual(["b"]);
    expect(badges.find((b) => b.code === "big_spender")?.detail).toEqual({ average: 5 });
    expect(badgeDescription("bargain_hunter", { average: 2.35 })).toBe("The picks cost 2.4 mana on average, the lowest in the group.");
  });

  it("type badges go to the most of a type, with a minimum", () => {
    const group = [
      player("a", { type: (i) => (i < 4 ? "Sorcery" : "Creature") }),
      player("b", { type: (i) => (i < 1 ? "Instant" : "Creature") }),
      player("c", { type: (i) => (i < 3 ? "Artifact Creature" : i < 5 ? "Enchantment" : "Creature") }),
    ];
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "sorcery_believer")).toEqual(["a"]);
    // One instant leads the group, but one isn't a habit.
    expect(won(badges, "instant_gratification")).toEqual([]);
    expect(won(badges, "artificer")).toEqual(["c"]);
    expect(won(badges, "enchanted")).toEqual(["c"]);
    expect(won(badges, "creature_feature")).toEqual(["b"]);
    expect(badgeDescription("sorcery_believer", { count: 4 })).toBe("Picked 4 sorceries, the most in the group.");
    expect(badgeDescription("creature_feature", { count: 1 })).toBe("Picked 1 creature, the most in the group.");
  });

  it("Gold Rush goes to the most multicolored cards, three at least", () => {
    const group = [player("a", { colors: (i) => (i < 6 ? "WU" : "W") }), player("b", { colors: (i) => (i < 2 ? "BR" : "B") }), player("c")];
    expect(won(computeGroupLockBadges(group), "gold_rush")).toEqual(["a"]);
    const few = [player("a", { colors: (i) => (i < 2 ? "WU" : "W") }), player("b"), player("c")];
    expect(won(computeGroupLockBadges(few), "gold_rush")).toEqual([]);
  });

  it("a lead shared by everyone, or by more than a third of the group, is nobody's", () => {
    const same = [player("a"), player("b"), player("c")];
    expect(computeGroupLockBadges(same)).toEqual([]);
    const six = ["a", "b", "c", "d", "e", "f"].map((id, i) => player(id, { own: i < 2 ? 5 : i < 3 ? 2 : 0 }));
    expect(won(computeGroupLockBadges(six), "one_of_a_kind")).toEqual(["a", "b"]);
    const crowded = ["a", "b", "c", "d", "e", "f"].map((id, i) => player(id, { own: i < 3 ? 5 : 0 }));
    expect(won(computeGroupLockBadges(crowded), "one_of_a_kind")).toEqual([]);
  });

  it("judges a group like the first season's: eight finished players and one who stopped at five", () => {
    // Three tie for the most creatures, which is more than a third of eight; one leads on instants.
    const group = [
      player("a", { type: (i) => (i < 8 ? "Instant" : "Creature") }),
      player("b"), player("c"), player("d"),
      player("e", { type: (i) => (i < 9 ? "Sorcery" : "Creature"), own: 2 }),
      player("f", { type: (i) => (i < 9 ? "Sorcery" : "Creature"), own: 2 }),
      player("g", { type: (i) => (i < 12 ? "Enchantment" : "Creature") }),
      player("h", { type: (i) => (i < 12 ? "Enchantment" : "Creature") }),
      player("late", { count: 5, own: 5 }),
    ];
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "creature_feature")).toEqual([]);
    expect(won(badges, "instant_gratification")).toEqual(["a"]);
    // Two may share a lead in a group of eight.
    expect(won(badges, "sorcery_believer")).toEqual(["e", "f"]);
    expect(won(badges, "enchanted")).toEqual(["g", "h"]);
    expect(won(badges, "one_of_a_kind")).toEqual(["e", "f"]);
    // The player who stopped at five is never judged, however unusual their picks.
    expect(badges.some((b) => b.userId === "late")).toBe(false);
  });

  it("averages only the picks with a mana value, and ties on the rounded average share", () => {
    const group = [
      player("a", { cost: () => 3 }),
      // Two decimals: 61 / 20 is 3.05 for both of these.
      player("b", { cost: (i) => (i === 0 ? 4 : 3) }),
      player("c", { cost: (i) => (i === 19 ? 4 : 3) }),
      player("d", { cost: () => 3 }), player("e", { cost: () => 3 }), player("f", { cost: () => 3 }),
    ];
    expect(won(computeGroupLockBadges(group), "big_spender")).toEqual(["b", "c"]);
    // Four share the lowest average, which is more than a third of six.
    expect(won(computeGroupLockBadges(group), "bargain_hunter")).toEqual([]);
    const unknown = [
      { userId: "a", picks: player("a", { cost: () => 5 }).picks.map((p, i) => (i < 10 ? { ...p, manaValue: null } : p)) },
      player("b", { cost: () => 2 }),
      { userId: "c", picks: player("c").picks.map((p) => ({ ...p, manaValue: null })) },
      player("d", { cost: () => 3 }),
    ];
    const badges = computeGroupLockBadges(unknown);
    // c has no mana values at all, so three players compare: a at 5, d at 3 and b at 2.
    expect(won(badges, "big_spender")).toEqual(["a"]);
    expect(won(badges, "bargain_hunter")).toEqual(["b"]);
  });

  it("every badge it gives is a lock badge with a catalogue entry", () => {
    for (const code of MTG_LOCK_BADGE_CODES) expect(MTG_BADGES[code]).toBeDefined();
    for (const code of MTG_REDEFINED_LOCK_BADGE_CODES) expect(MTG_LOCK_BADGE_CODES).toContain(code);
  });
});

describe("mtgLatestLockAt", () => {
  it("is 11:59 PM Eastern on the Tuesday before prereleases start", () => {
    // Friday, September 25, 6 PM ET.
    expect(mtgLatestLockAt("2026-09-25T22:00:00Z").toISOString()).toBe("2026-09-23T03:59:00.000Z");
    expect(formatEasternLong(mtgLatestLockAt("2026-09-25T22:00:00Z"))).toBe("Tuesday, September 22 at 11:59 PM ET");
    // In winter the same wall-clock time is an hour later in UTC.
    expect(mtgLatestLockAt("2027-01-22T23:00:00Z").toISOString()).toBe("2027-01-20T04:59:00.000Z");
  });

  it("finds the Tuesday before every day of the week", () => {
    // Sunday September 20 to Saturday September 26, 2026, each at noon Eastern.
    const tuesdays = [20, 21, 22, 23, 24, 25, 26].map((day) => formatEasternLong(mtgLatestLockAt(`2026-09-${day}T16:00:00Z`)));
    expect(tuesdays).toEqual([
      "Tuesday, September 15 at 11:59 PM ET", "Tuesday, September 15 at 11:59 PM ET", "Tuesday, September 15 at 11:59 PM ET",
      "Tuesday, September 22 at 11:59 PM ET", "Tuesday, September 22 at 11:59 PM ET", "Tuesday, September 22 at 11:59 PM ET", "Tuesday, September 22 at 11:59 PM ET",
    ]);
  });

  it("keeps 11:59 PM through the weeks the clocks change", () => {
    // Clocks go back on Sunday, November 1, 2026: the Tuesday is in daylight time, the prerelease in standard time.
    expect(mtgLatestLockAt("2026-11-06T23:00:00Z").toISOString()).toBe("2026-11-04T04:59:00.000Z");
    expect(mtgLatestLockAt("2026-10-30T22:00:00Z").toISOString()).toBe("2026-10-28T03:59:00.000Z");
    // Clocks go forward on Sunday, March 14, 2027.
    expect(mtgLatestLockAt("2027-03-19T22:00:00Z").toISOString()).toBe("2027-03-17T03:59:00.000Z");
    expect(mtgLatestLockAt("2027-03-12T23:00:00Z").toISOString()).toBe("2027-03-10T04:59:00.000Z");
  });

  it("goes by the Eastern day, and a Tuesday or Wednesday start still gets a Tuesday before it", () => {
    // 1 AM UTC on Saturday is still Friday evening in New York.
    expect(formatEasternLong(mtgLatestLockAt("2026-09-26T01:00:00Z"))).toBe("Tuesday, September 22 at 11:59 PM ET");
    expect(formatEasternLong(mtgLatestLockAt("2026-09-23T16:00:00Z"))).toBe("Tuesday, September 22 at 11:59 PM ET");
    expect(formatEasternLong(mtgLatestLockAt("2026-09-22T16:00:00Z"))).toBe("Tuesday, September 15 at 11:59 PM ET");
  });
});

describe("badge order and wording", () => {
  it("puts higher tiers first, then the spec's order", () => {
    expect(["sorcery_believer", "gold_rush", "one_of_a_kind", "buzzer_beater"].sort(compareBadges)).toEqual(["one_of_a_kind", "buzzer_beater", "gold_rush", "sorcery_believer"]);
  });

  it("a code that is no longer in the catalogue sorts last and falls back to itself", () => {
    expect(["on_the_record", "buzzer_beater"].sort(compareBadges)).toEqual(["buzzer_beater", "on_the_record"]);
    expect(badgeLabel("on_the_record", {})).toBe("on_the_record");
    expect(badgeDescription("on_the_record", {})).toBe("");
  });

  it("names the Loyalist color in the description", () => {
    expect(badgeDescription("loyalist", { colorName: "Blue" })).toBe("At least 10 of 20 picks are blue.");
    expect(badgeDescription("gold_rush", {})).toBe(MTG_BADGES.gold_rush.description);
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
