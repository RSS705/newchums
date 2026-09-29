import { describe, expect, it } from "vitest";
import {
  MTG_BADGES, MTG_GROUP_LOCK_BADGE_CODES, MTG_LOCK_BADGE_CODES, MTG_REDEFINED_LOCK_BADGE_CODES, MTG_RETIRED_LOCK_BADGE_CODES, badgeDescription, badgeLabel,
  cardTypes, compareBadges, computeEntryBadges, computeGroupLockBadges, computeGroupMind, creatureTypes, formatEasternDate, formatEasternLong, hasKeyword,
  isLegendary, isRemoval, mtgLatestLockAt, mtgMorningAfter, mtgRevealedEmailAt, revealFunFact, rulesText, type GroupLockPick, type GroupLockPlayer, type MtgRarity,
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
  type Shape = {
    /** How many picks are the player's alone, from the first pick on; or which ones. */
    own?: number | ((i: number) => boolean);
    type?: (i: number) => string; cost?: (i: number) => number; colors?: (i: number) => string;
    name?: (i: number) => string; text?: (i: number) => string; count?: number;
  };
  function player(userId: string, opts: Shape = {}): GroupLockPlayer {
    const own = typeof opts.own === "function" ? opts.own : (i: number) => i < ((opts.own as number | undefined) ?? 0);
    const picks: GroupLockPick[] = Array.from({ length: opts.count ?? 20 }, (_, i) => ({
      rarity: RARITY_OF(i),
      slot: (i % 5) + 1,
      cardId: own(i) ? `${userId}-${i}` : `shared-${i}`,
      colors: opts.colors?.(i) ?? "W",
      manaValue: opts.cost?.(i) ?? 3,
      typeLine: opts.type?.(i) ?? "Creature",
      name: opts.name?.(i) ?? `Card ${i}`,
      oracleText: opts.text?.(i) ?? "",
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
    expect(MTG_GROUP_LOCK_BADGE_CODES).toHaveLength(MTG_LOCK_BADGE_CODES.length - 2);
    expect(MTG_GROUP_LOCK_BADGE_CODES).not.toContain("loyalist");
    expect(MTG_GROUP_LOCK_BADGE_CODES).not.toContain("buzzer_beater");
    // A group that gives every badge it can gives only group honors, each with a reason of its own.
    const dash = String.fromCharCode(0x2014);
    const loud = player("a", {
      own: 8, cost: () => 6, colors: (i) => (i < 12 ? "WUBRG" : ""), name: (i) => (i < 4 ? `Front ${i} // Back ${i}` : `Card ${i}`),
      type: (i) => (i < 6 ? `Legendary Creature ${dash} Elf Wizard` : i < 9 ? "Legendary Planeswalker" : i < 12 ? "Instant" : i < 15 ? "Sorcery" : i < 17 ? "Artifact" : i < 19 ? "Enchantment" : "Land"),
      text: (i) => (i < 6 ? "Flying\nWhen this creature enters, create a 1/1 token, draw a card and put a +1/+1 counter on it." : "Destroy target creature."),
    });
    const group = [loud, player("b"), player("c"), player("d")];
    const badges = computeGroupLockBadges(group);
    for (const b of badges) {
      expect(MTG_GROUP_LOCK_BADGE_CODES).toContain(b.code);
      expect(badgeDescription(b.code, b.detail)).not.toBe(MTG_BADGES[b.code].description);
    }
    expect(new Set(badges.filter((b) => b.userId === "a").map((b) => b.code)).size).toBeGreaterThan(15);
  });
});

describe("reading a card for the lock badges", () => {
  const dash = String.fromCharCode(0x2014);
  it("finds a creature's types on its front face, and whether it is legendary", () => {
    expect(creatureTypes(`Legendary Creature ${dash} Human Wizard`)).toEqual(["Human", "Wizard"]);
    expect(creatureTypes(`Artifact Creature ${dash} Boar Construct // Sorcery`)).toEqual(["Boar", "Construct"]);
    expect(creatureTypes(`Artifact ${dash} Equipment`)).toEqual([]);
    expect(creatureTypes("Instant")).toEqual([]);
    expect(creatureTypes(null)).toEqual([]);
    expect(isLegendary(`Legendary Planeswalker ${dash} Jace`)).toBe(true);
    expect(isLegendary(`Creature ${dash} Elf // Legendary Sorcery`)).toBe(false);
  });

  it("drops reminder text, which explains one card in words that describe another", () => {
    expect(rulesText("Empower Jace 1. (If you don't control one, first create a blue Jace planeswalker token with \"Draw a card.\")").trim()).toBe("Empower Jace 1.");
  });

  it("counts a keyword only on a line of keywords", () => {
    expect(hasKeyword("Flying", "flying")).toBe(true);
    expect(hasKeyword("Flash\nFlying, vigilance, lifelink\nWhen this creature enters, draw a card.", "flying")).toBe(true);
    expect(hasKeyword("First strike, flying, ward {2}", "flying")).toBe(true);
    expect(hasKeyword("Flying (This creature can't be blocked except by creatures with flying or reach.)", "flying")).toBe(true);
    expect(hasKeyword("Enchanted creature has flying.", "flying")).toBe(false);
    expect(hasKeyword("Konstrari Charm deals 6 damage to target creature with flying.", "flying")).toBe(false);
    expect(hasKeyword("Create a 5/5 red Dragon creature token with flying.", "flying")).toBe(false);
    expect(hasKeyword("Reach, vigilance, trample", "flying")).toBe(false);
    expect(hasKeyword(null, "flying")).toBe(false);
  });

  it("knows removal when it reads it", () => {
    for (const text of [
      "Destroy target creature. If it wasn't attacking, its controller draws a card.",
      "Exile target creature or planeswalker.",
      "When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.",
      "No Admittance deals 3 damage to any target.",
      "Awaken the Inferno deals 6 damage to target creature or planeswalker an opponent controls.",
      "Target creature you control deals damage equal to its power to target creature or planeswalker an opponent controls.",
      "Target creature gets -3/-3 until end of turn.",
      "Put a +1/+1 counter on target creature you control. Then it fights target creature an opponent controls.",
      "Exile all creatures.",
      "Fulminous Forte deals 1 damage to each creature and planeswalker your opponents control.",
      "When this Equipment enters, for each opponent, destroy up to one target creature or planeswalker that player controls.",
    ]) expect([text, isRemoval(text)]).toEqual([text, true]);
    for (const text of [
      "Exile target creature you control, then return it to the battlefield under its owner's control.",
      "Exile target card from a graveyard. Create a 1/1 white Spirit creature token.",
      "Counter target noncreature spell unless its controller pays {2}.",
      "Stinging Vitriol deals 2 damage to target opponent.",
      "Target creature gets +3/+1 until end of turn.",
      "Flashback {5}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
      "Whenever a creature you control attacks, that creature deals 1 damage to each opponent.",
      "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)",
      "",
    ]) expect([text, isRemoval(text)]).toEqual([text, false]);
    expect(isRemoval(null)).toBe(false);
  });
});

describe("computeGroupLockBadges, the badges added in Version 25", () => {
  const RARITY_OF = (i: number) => RARITIES[Math.floor(i / 5)];
  const dash = String.fromCharCode(0x2014);
  type Shape = { own?: (i: number) => boolean; type?: (i: number) => string; colors?: (i: number) => string; name?: (i: number) => string; text?: (i: number) => string; count?: number };
  function player(userId: string, opts: Shape = {}): GroupLockPlayer {
    return {
      userId,
      picks: Array.from({ length: opts.count ?? 20 }, (_, i) => ({
        rarity: RARITY_OF(i), slot: (i % 5) + 1, cardId: opts.own?.(i) ? `${userId}-${i}` : `shared-${i}`,
        colors: opts.colors?.(i) ?? "W", manaValue: 3, typeLine: opts.type?.(i) ?? "Creature", name: opts.name?.(i) ?? `Card ${i}`, oracleText: opts.text?.(i) ?? "",
      })),
    };
  }
  const won = (badges: ReturnType<typeof computeGroupLockBadges>, code: string) => badges.filter((b) => b.code === code).map((b) => b.userId).sort();
  const detail = (badges: ReturnType<typeof computeGroupLockBadges>, code: string) => badges.find((b) => b.code === code)?.detail;

  it("the five colors each have a leader, and a card of two colors counts for both", () => {
    const group = [
      player("a", { colors: (i) => (i < 9 ? "U" : "W") }),
      player("b", { colors: (i) => (i < 6 ? "BR" : "W") }),
      player("c", { colors: (i) => (i < 4 ? "G" : "W") }),
      player("d", { colors: () => "W" }),
    ];
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "true_blue")).toEqual(["a"]);
    expect(won(badges, "back_in_black")).toEqual(["b"]);
    expect(won(badges, "seeing_red")).toEqual(["b"]);
    // Four green cards lead the group, but five make a habit.
    expect(won(badges, "green_thumb")).toEqual([]);
    expect(won(badges, "white_knight")).toEqual(["d"]);
    expect(detail(badges, "white_knight")).toEqual({ count: 20 });
    expect(badgeDescription("true_blue", { count: 9 })).toBe("Picked 9 blue cards, the most in the group.");
  });

  it("colorless cards, lands, legends, planeswalkers and two-part cards", () => {
    const group = [
      player("a", { colors: (i) => (i < 5 ? "" : "W"), type: (i) => (i < 3 ? "Land" : i < 5 ? "Artifact" : "Creature") }),
      player("b", { type: (i) => (i < 4 ? `Legendary Creature ${dash} Human` : i < 6 ? `Legendary Planeswalker ${dash} Jace` : "Creature") }),
      player("c", { name: (i) => (i < 3 ? `Front ${i} // Back ${i}` : `Card ${i}`) }),
      player("d"),
    ];
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "landlord")).toEqual(["a"]);
    // The three lands are colorless too, but Grey Area counts the cards that aren't lands.
    expect(detail(badges, "grey_area")).toEqual({ count: 2 });
    expect(won(badges, "living_legend")).toEqual(["b"]);
    expect(detail(badges, "living_legend")).toEqual({ count: 6 });
    expect(won(badges, "superfriends")).toEqual(["b"]);
    expect(won(badges, "two_for_one")).toEqual(["c"]);
    expect(badgeDescription("two_for_one", { count: 3 })).toBe("Picked 3 cards that are two cards in one, the most in the group.");
    expect(badgeDescription("landlord", { count: 1 })).toBe("Picked 1 land, the most in the group.");
  });

  it("what the cards do: flying, tokens, drawing, counters and removal", () => {
    const group = [
      player("a", { text: (i) => (i < 4 ? "Flying, vigilance" : i < 7 ? "When this creature enters, create a 2/2 colorless Wizard creature token." : "") }),
      player("b", { text: (i) => (i < 5 ? "Destroy target creature." : i < 8 ? "Draw two cards." : "") }),
      player("c", { text: (i) => (i < 2 ? "Put a +1/+1 counter on target creature." : i < 4 ? "Exile target creature or planeswalker." : "") }),
      player("d", { text: (i) => (i < 1 ? "Enchanted creature has flying." : "") }),
    ];
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "frequent_flyer")).toEqual(["a"]);
    expect(won(badges, "token_effort")).toEqual(["a"]);
    expect(won(badges, "removal_service")).toEqual(["b"]);
    expect(won(badges, "quick_draw")).toEqual(["b"]);
    expect(won(badges, "counter_culture")).toEqual(["c"]);
    expect(badgeDescription("removal_service", { count: 5 })).toBe("Picked 5 removal cards, the most in the group.");
  });

  it("Kindred Spirit names the creature type, the first by name when two tie", () => {
    const group = [
      player("a", { type: (i) => (i < 4 ? `Creature ${dash} Human Wizard` : i < 6 ? `Creature ${dash} Wizard` : "Instant") }),
      player("b", { type: (i) => (i < 3 ? `Creature ${dash} Elf Druid` : "Instant") }),
      player("c", { type: () => "Instant" }),
    ];
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "kindred_spirit")).toEqual(["a"]);
    expect(detail(badges, "kindred_spirit")).toEqual({ count: 6, type: "Wizard" });
    expect(badgeDescription("kindred_spirit", { count: 6, type: "Wizard" })).toBe("Picked 6 cards of the creature type Wizard, the most of one type in the group.");
    const tie = computeGroupLockBadges([player("a", { type: (i) => (i < 3 ? `Creature ${dash} Wizard Elf` : "Instant") }), player("b", { type: () => "Instant" }), player("c", { type: () => "Instant" })]);
    expect(detail(tie, "kindred_spirit")).toEqual({ count: 3, type: "Elf" });
    // Two of a type isn't a theme.
    expect(won(computeGroupLockBadges([player("a", { type: (i) => (i < 2 ? `Creature ${dash} Elf` : "Instant") }), player("b", { type: () => "Instant" }), player("c", { type: () => "Instant" })]), "kindred_spirit")).toEqual([]);
  });

  it("Bold Move is about the four #1 picks, and nobody else may have the card anywhere", () => {
    // Picks 0, 5, 10 and 15 are the #1 picks.
    const group = [
      player("a", { own: (i) => i % 5 === 0 }),
      player("b", { own: (i) => i === 0 || i === 1 || i === 2 }),
      player("c"), player("d"),
    ];
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "bold_move")).toEqual(["a"]);
    expect(detail(badges, "bold_move")).toEqual({ count: 4 });
    expect(badgeDescription("bold_move", { count: 4 })).toBe("4 of the four #1 picks are cards nobody else in the group picked at all, the most in the group.");
    // One bold #1 leads this group, and isn't enough.
    expect(won(computeGroupLockBadges([player("a", { own: (i) => i === 0 }), player("b"), player("c")]), "bold_move")).toEqual([]);
  });

  it("Two of a Kind goes to the closest pair, and Polar Opposites to the pair furthest apart", () => {
    const group = [
      player("a", { own: (i) => i < 2 }),
      player("b", { own: (i) => i < 4 }),
      player("c", { own: (i) => i < 12 }),
      player("d", { own: (i) => i >= 6 }),
    ];
    // a and b share 16; c shares 8 with a and b; d shares 4 with a, 2 with b and none with c.
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "two_of_a_kind")).toEqual(["a", "b"]);
    expect(detail(badges, "two_of_a_kind")).toEqual({ shared: 16 });
    expect(won(badges, "polar_opposites")).toEqual(["c", "d"]);
    expect(detail(badges, "polar_opposites")).toEqual({ shared: 0 });
    expect(badgeDescription("two_of_a_kind", { shared: 16 })).toBe("Shares 16 of 20 picks with another player, the closest pair in the group.");
    expect(badgeDescription("polar_opposites", { shared: 0 })).toBe("Shares no picks with another player, the pair furthest apart in the group.");
    expect(badgeDescription("polar_opposites", { shared: 2 })).toBe("Shares only 2 of 20 picks with another player, the pair furthest apart in the group.");
  });

  it("pairs that tie for closest give the badge to nobody once too many players would hold it", () => {
    // a-b and c-d both share 18: four holders in a group of five.
    const group = [
      player("a", { own: (i) => i < 2 }), player("b", { own: (i) => i < 2 }),
      player("c", { own: (i) => i >= 18 }), player("d", { own: (i) => i >= 18 }),
      player("e", { own: () => true }),
    ];
    const badges = computeGroupLockBadges(group);
    expect(won(badges, "two_of_a_kind")).toEqual([]);
    // Everyone shares nothing with e, so that isn't a pair either.
    expect(won(badges, "polar_opposites")).toEqual([]);
    // And a closest pair that shares three picks isn't close.
    const far = [player("a", { own: (i) => i >= 3 }), player("b", { own: (i) => i >= 3 }), player("c", { own: () => true })];
    expect(won(computeGroupLockBadges(far), "two_of_a_kind")).toEqual([]);
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
