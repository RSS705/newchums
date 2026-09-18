import { describe, expect, it } from "vitest";
import { mtgPicksOpen, validateEntryPicks, type MtgRarity } from "../mtg";

const pool = new Map<string, MtgRarity>([
  ["c1", "common"], ["c2", "common"], ["c3", "common"], ["c4", "common"], ["c5", "common"], ["c6", "common"],
  ["u1", "uncommon"], ["r1", "rare"], ["m1", "mythic"],
]);

describe("validateEntryPicks", () => {
  it("accepts a partial entry and returns picks in rarity then slot order", () => {
    const v = validateEntryPicks({ rare: [{ cardId: "r1", slot: 1 }], common: [{ cardId: "c2", slot: 2 }, { cardId: "c1", slot: 1 }] }, pool);
    expect(v).toEqual({ ok: true, picks: [
      { rarity: "common", slot: 1, cardId: "c1" },
      { rarity: "common", slot: 2, cardId: "c2" },
      { rarity: "rare", slot: 1, cardId: "r1" },
    ] });
  });

  it("accepts an empty entry", () => {
    expect(validateEntryPicks({}, pool)).toEqual({ ok: true, picks: [] });
  });

  it("rejects more than five picks at a rarity", () => {
    const six = ["c1", "c2", "c3", "c4", "c5", "c6"].map((cardId, i) => ({ cardId, slot: i + 1 }));
    expect(validateEntryPicks({ common: six }, pool).ok).toBe(false);
  });

  it("takes a list of up to ten with the shortlist, slots 1 to 10", () => {
    const big = new Map<string, MtgRarity>(Array.from({ length: 11 }, (_, i) => [`k${i + 1}`, "common" as MtgRarity]));
    const list = (n: number) => Array.from({ length: n }, (_, i) => ({ cardId: `k${i + 1}`, slot: i + 1 }));
    const ten = validateEntryPicks({ common: list(10) }, big, 10);
    expect(ten.ok && ten.picks.map((p) => p.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(validateEntryPicks({ common: list(11) }, big, 10)).toEqual({ ok: false, message: "At most 10 common cards on your list" });
    // Without the shortlist, slot 6 is still out of range.
    expect(validateEntryPicks({ common: [{ cardId: "k1", slot: 6 }] }, big).ok).toBe(false);
  });

  it("rejects a shared slot, a slot out of range and a fractional slot", () => {
    expect(validateEntryPicks({ common: [{ cardId: "c1", slot: 1 }, { cardId: "c2", slot: 1 }] }, pool).ok).toBe(false);
    expect(validateEntryPicks({ common: [{ cardId: "c1", slot: 6 }] }, pool).ok).toBe(false);
    expect(validateEntryPicks({ common: [{ cardId: "c1", slot: 0 }] }, pool).ok).toBe(false);
    expect(validateEntryPicks({ common: [{ cardId: "c1", slot: 1.5 }] }, pool).ok).toBe(false);
  });

  it("rejects a card at the wrong rarity, a card outside the pool and the same card twice", () => {
    expect(validateEntryPicks({ common: [{ cardId: "r1", slot: 1 }] }, pool)).toEqual({ ok: false, message: "That card is a rare, not a common" });
    expect(validateEntryPicks({ common: [{ cardId: "nope", slot: 1 }] }, pool).ok).toBe(false);
    expect(validateEntryPicks({ common: [{ cardId: "c1", slot: 1 }, { cardId: "c1", slot: 2 }] }, pool).ok).toBe(false);
  });

  it("rejects unknown rarities and malformed shapes", () => {
    expect(validateEntryPicks({ special: [] }, pool).ok).toBe(false);
    expect(validateEntryPicks([], pool).ok).toBe(false);
    expect(validateEntryPicks(null, pool).ok).toBe(false);
    expect(validateEntryPicks({ common: "c1" }, pool).ok).toBe(false);
    expect(validateEntryPicks({ common: [{ slot: 1 }] }, pool).ok).toBe(false);
  });

  it("ignores a note sent by a page from before notes were removed", () => {
    const v = validateEntryPicks({ common: [{ cardId: "c1", slot: 1, note: "x".repeat(500) }, { cardId: "c2", slot: 2, note: 42 }] }, pool);
    expect(v).toEqual({ ok: true, picks: [{ rarity: "common", slot: 1, cardId: "c1" }, { rarity: "common", slot: 2, cardId: "c2" }] });
  });
});

describe("mtgPicksOpen", () => {
  const set = { status: "active", previews_start_at: "2026-09-08T04:00:00Z", picks_open_at: "2026-09-18T14:00:00Z", lock_at: "2026-09-29T03:59:00Z" };
  it("opens when previews start and closes at the lock", () => {
    expect(mtgPicksOpen(set, new Date("2026-09-07T00:00:00Z"))).toBe(false);
    expect(mtgPicksOpen(set, new Date("2026-09-10T00:00:00Z"))).toBe(true);
    expect(mtgPicksOpen(set, new Date("2026-09-29T03:58:59Z"))).toBe(true);
    expect(mtgPicksOpen(set, new Date("2026-09-29T03:59:00Z"))).toBe(false);
  });
  it("never opens a set that is not active", () => {
    expect(mtgPicksOpen({ ...set, status: "final" }, new Date("2026-09-10T00:00:00Z"))).toBe(false);
  });
  it("accepts Date objects, which is what the database driver returns", () => {
    const fromDb = { status: "active", previews_start_at: new Date("2026-09-20T00:00:00Z"), picks_open_at: new Date("2026-09-21T00:00:00Z"), lock_at: new Date("2026-09-29T03:59:00Z") };
    expect(mtgPicksOpen(fromDb, new Date("2026-09-15T00:00:00Z"))).toBe(false);
    expect(mtgPicksOpen(fromDb, new Date("2026-09-22T00:00:00Z"))).toBe(true);
  });
  it("falls back to the picks-open date when there is no previews date", () => {
    const noPreviews = { ...set, previews_start_at: null };
    expect(mtgPicksOpen(noPreviews, new Date("2026-09-10T00:00:00Z"))).toBe(false);
    expect(mtgPicksOpen(noPreviews, new Date("2026-09-19T00:00:00Z"))).toBe(true);
  });
});
