import { describe, expect, it } from "vitest";
import { cleanPickNote, mtgPicksOpen, validateEntryPicks, type MtgRarity } from "../mtg";

const pool = new Map<string, MtgRarity>([
  ["c1", "common"], ["c2", "common"], ["c3", "common"], ["c4", "common"], ["c5", "common"], ["c6", "common"],
  ["u1", "uncommon"], ["r1", "rare"], ["m1", "mythic"],
]);

describe("validateEntryPicks", () => {
  it("accepts a partial entry and returns picks in rarity then slot order", () => {
    const v = validateEntryPicks({ rare: [{ cardId: "r1", slot: 1, note: null }], common: [{ cardId: "c2", slot: 2, note: "  a house " }, { cardId: "c1", slot: 1 }] }, pool);
    expect(v).toEqual({ ok: true, picks: [
      { rarity: "common", slot: 1, cardId: "c1", note: null },
      { rarity: "common", slot: 2, cardId: "c2", note: "a house" },
      { rarity: "rare", slot: 1, cardId: "r1", note: null },
    ] });
  });

  it("accepts an empty entry", () => {
    expect(validateEntryPicks({}, pool)).toEqual({ ok: true, picks: [] });
  });

  it("rejects more than five picks at a rarity", () => {
    const six = ["c1", "c2", "c3", "c4", "c5", "c6"].map((cardId, i) => ({ cardId, slot: i + 1 }));
    expect(validateEntryPicks({ common: six }, pool).ok).toBe(false);
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

  it("enforces the 140-character Receipts limit in code points", () => {
    expect(validateEntryPicks({ common: [{ cardId: "c1", slot: 1, note: "x".repeat(140) }] }, pool).ok).toBe(true);
    expect(validateEntryPicks({ common: [{ cardId: "c1", slot: 1, note: "x".repeat(141) }] }, pool).ok).toBe(false);
    // 140 emoji are 280 UTF-16 units but 140 characters.
    expect(validateEntryPicks({ common: [{ cardId: "c1", slot: 1, note: "🔥".repeat(140) }] }, pool).ok).toBe(true);
    expect(validateEntryPicks({ common: [{ cardId: "c1", slot: 1, note: 42 }] }, pool).ok).toBe(false);
  });
});

describe("cleanPickNote", () => {
  it("collapses whitespace, strips control characters and nulls empties", () => {
    const messy = "  this" + String.fromCharCode(10, 9) + "common   is a house" + String.fromCharCode(0) + " ";
    expect(cleanPickNote(messy)).toBe("this common is a house");
    expect(cleanPickNote("   ")).toBeNull();
    expect(cleanPickNote(undefined)).toBeNull();
    expect(cleanPickNote(7)).toBeUndefined();
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
