import { MTG_LIST_MAX, MTG_RARITIES, type MtgCard, type MtgCardWithNew, type MtgRarity, MTG_NOTE_MAX, MTG_SLOTS_PER_RARITY } from "../mtgTypes";

export const COLOR_FILTERS = [
  { key: "W", label: "White" },
  { key: "U", label: "Blue" },
  { key: "B", label: "Black" },
  { key: "R", label: "Red" },
  { key: "G", label: "Green" },
  { key: "M", label: "Multicolor" },
  { key: "C", label: "Colorless" },
] as const;
export type ColorKey = (typeof COLOR_FILTERS)[number]["key"];

export const TYPE_FILTERS = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"] as const;
export const MV_FILTERS = ["0", "1", "2", "3", "4", "5", "6+"] as const;
export type SortKey = "number" | "color" | "mv";

export type CardFilters = {
  colors: ColorKey[];
  types: string[];
  mvs: string[];
  newOnly: boolean;
  hidePicked: boolean;
  search: string;
  sort: SortKey;
};

export const EMPTY_FILTERS: CardFilters = { colors: [], types: [], mvs: [], newOnly: false, hidePicked: false, search: "", sort: "number" };

/** Colour letters on a card, whatever separator the sync stored them with. */
export function cardColors(card: Pick<MtgCard, "colors">): string[] {
  return Array.from(new Set((card.colors ?? "").toUpperCase().match(/[WUBRG]/g) ?? []));
}

function matchesColor(card: MtgCard, key: ColorKey): boolean {
  const colors = cardColors(card);
  if (key === "M") return colors.length > 1;
  if (key === "C") return colors.length === 0;
  return colors.includes(key);
}

function mvBucket(card: MtgCard): string {
  const v = card.manaValue ?? 0;
  return v >= 6 ? "6+" : String(Math.floor(v));
}

const COLOR_ORDER = "WUBRG";
function colorRank(card: MtgCard): number {
  const colors = cardColors(card);
  if (colors.length === 0) return 7;
  if (colors.length > 1) return 6;
  return COLOR_ORDER.indexOf(colors[0]);
}

export function activeFilterCount(f: CardFilters): number {
  return f.colors.length + f.types.length + f.mvs.length + (f.newOnly ? 1 : 0) + (f.hidePicked ? 1 : 0);
}

/**
 * Filter and sort one rarity's cards. Colour chips combine with OR (a card
 * matches if it is any selected colour), and the other groups narrow further.
 * Search looks at the name and the rules text.
 */
export function applyFilters(cards: MtgCardWithNew[], f: CardFilters, pickedIds: Set<string>): MtgCardWithNew[] {
  const q = f.search.trim().toLowerCase();
  const out = cards.filter((card) => {
    if (f.colors.length > 0 && !f.colors.some((k) => matchesColor(card, k))) return false;
    if (f.types.length > 0 && !f.types.some((t) => (card.typeLine ?? "").toLowerCase().includes(t.toLowerCase()))) return false;
    if (f.mvs.length > 0 && !f.mvs.includes(mvBucket(card))) return false;
    if (f.newOnly && !card.isNew) return false;
    if (f.hidePicked && pickedIds.has(card.id)) return false;
    if (q && !card.name.toLowerCase().includes(q) && !(card.oracleText ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
  const byNumber = (a: MtgCard, b: MtgCard) =>
    a.collectorNumber.localeCompare(b.collectorNumber, undefined, { numeric: true });
  if (f.sort === "color") out.sort((a, b) => colorRank(a) - colorRank(b) || byNumber(a, b));
  else if (f.sort === "mv") out.sort((a, b) => (a.manaValue ?? 0) - (b.manaValue ?? 0) || byNumber(a, b));
  else out.sort(byNumber);
  return out;
}

export type PickSlot = { card: MtgCard; note: string };
/** Each rarity's list in order, up to ten cards: the first five are the picks,
 *  and the rest a shortlist that never scores. */
export type PickState = Record<MtgRarity, PickSlot[]>;

export const emptyPickState = (): PickState => ({ common: [], uncommon: [], rare: [], mythic: [] });

/** How many of a list's cards are picks (the top five). */
export const scoredCount = (list: PickSlot[]) => Math.min(list.length, MTG_SLOTS_PER_RARITY);
/** How many are on the shortlist below the picks. */
export const shortlistCount = (list: PickSlot[]) => Math.max(0, list.length - MTG_SLOTS_PER_RARITY);

/** Picks across all four rarities, out of twenty; shortlisted cards don't count. */
export function totalPicked(p: PickState): number {
  return MTG_RARITIES.reduce((n, r) => n + scoredCount(p[r]), 0);
}

export function noteLength(note: string): number {
  return [...note].length;
}

/**
 * A note edit kept within the limit, counted in characters (code points, as
 * the server counts them). Typing or pasting into the middle of a full note
 * is refused rather than cutting words off its end; a paste at the end is
 * trimmed to fit, a whole emoji or letter at a time.
 */
export function fitNote(prev: string, next: string): string {
  if (noteLength(next) <= MTG_NOTE_MAX) return next;
  const room = MTG_NOTE_MAX - noteLength(prev);
  if (!next.startsWith(prev) || room <= 0) return prev;
  const added = next.slice(prev.length);
  const pieces = typeof Intl !== "undefined" && "Segmenter" in Intl
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(added), (s) => s.segment)
    : [...added];
  let kept = "";
  for (const piece of pieces) {
    if (noteLength(kept) + noteLength(piece) > room) break;
    kept += piece;
  }
  return prev + kept;
}

/** Full-replace body for PUT /mtg/sets/:code/entry. Slots follow list order,
 *  so a list never has gaps: 1 to 5 are the picks, 6 to 10 the shortlist. */
export function toPutBody(p: PickState) {
  return {
    picks: Object.fromEntries(
      MTG_RARITIES.map((r) => [r, p[r].slice(0, MTG_LIST_MAX).map((s, i) => ({ cardId: s.card.id, slot: i + 1, note: s.note.trim() || null }))]),
    ),
  };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** "Sep 12" from a Scryfall preview date, which has no time zone. */
export function formatPreviewDate(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
