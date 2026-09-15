/** Wire shapes for the MTG Prediction Challenge (see api/src/lib/mtg.ts). */

export type MtgPhase = "upcoming" | "previews" | "open" | "locked" | "live" | "final";
export type MtgRarity = "common" | "uncommon" | "rare" | "mythic";
export const MTG_RARITIES: MtgRarity[] = ["common", "uncommon", "rare", "mythic"];
export const RARITY_LABEL: Record<MtgRarity, string> = { common: "Commons", uncommon: "Uncommons", rare: "Rares", mythic: "Mythics" };

export type TimelineEntry = {
  key: string;
  label: string;
  at: string;
  endAt?: string;
  detail: string;
  status: "done" | "now" | "upcoming";
  calendar?: boolean;
};

export type MtgSetPayload = {
  code: string;
  name: string;
  phase: MtgPhase;
  dates: {
    previewsStartAt: string | null; galleryCompleteAt: string | null; prereleaseStartAt: string | null; prereleaseEndAt: string | null;
    picksOpenAt: string | null; lockAt: string; arenaReleaseAt: string | null; tabletopReleaseAt: string | null; finalAt: string;
  };
  timeline: TimelineEntry[];
  pool: Record<MtgRarity, number>;
  poolTotal: number;
  galleryComplete: boolean;
  lastCardSyncAt: string | null;
  scoringVersion: number;
  /** True from the first preview day until the lock (server rule). */
  picksOpen: boolean;
};

export type MtgCard = {
  id: string;
  scryfallId: string;
  arenaId: number | null;
  name: string;
  rarity: MtgRarity;
  collectorNumber: string;
  layout: string | null;
  colors: string;
  manaCost: string | null;
  manaValue: number | null;
  typeLine: string | null;
  oracleText: string | null;
  imageNormal: string | null;
  imageLarge: string | null;
  imageBackNormal: string | null;
  imageBackLarge: string | null;
  imageStatus: string | null;
  previewedAt: string | null;
  previewSource: string | null;
  previewSourceUri: string | null;
  firstSeenAt: string;
};

/** Attribution that goes on every challenge surface (spec section 9.3). */
export const MTG_ATTRIBUTION =
  "Card performance data from 17Lands.com (Premier Draft, all users). Card images and data via Scryfall. MTG Prediction Challenge is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC. Not affiliated with 17Lands or Scryfall.";

export function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** The same moment in Eastern time with an "ET" suffix. Deterministic on
 *  the server, where the reader's zone is unknown, so server-rendered pages
 *  hydrate cleanly before switching to `formatWhen`. */
export function formatWhenEastern(iso: string): string {
  try {
    return `${new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`;
  } catch {
    return iso;
  }
}

/** "3d 4h" / "6h 12m" / "under a minute" until `iso`, or null once passed. */
export function countdown(iso: string, nowMs: number): string | null {
  const diff = new Date(iso).getTime() - nowMs;
  if (diff <= 0) return null;
  const mins = Math.floor(diff / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "under a minute";
}

// ── Picks (Batch 2) ──────────────────────────────────────────────────────────

export const MTG_NOTE_MAX = 140;
export const MTG_SLOTS_PER_RARITY = 5;
export const MTG_TOTAL_PICKS = 20;
/** Points multiplier by slot, #1 first (spec 6.3). */
export const SLOT_MULTIPLIERS = [1.5, 1.25, 1, 0.75, 0.5] as const;
export const RARITY_SINGULAR: Record<MtgRarity, string> = { common: "common", uncommon: "uncommon", rare: "rare", mythic: "mythic" };
export const RARITY_PLURAL: Record<MtgRarity, string> = { common: "commons", uncommon: "uncommons", rare: "rares", mythic: "mythics" };

/** A card as served to a signed-in player: NEW when it was first seen after
 *  they last opened this rarity. */
export type MtgCardWithNew = MtgCard & { isNew?: boolean };

export type MtgEntryPick = { slot: number; note: string | null; card: MtgCard };

/** GET /mtg/sets/:code/entry. The caller's own entry only: other players'
 *  picks never leave the server before the lock. */
export type MtgEntryPayload = {
  set: {
    code: string;
    name: string;
    phase: MtgPhase;
    lockAt: string;
    locked: boolean;
    picksOpen: boolean;
    pool: Record<MtgRarity, number>;
  };
  entry: null | {
    updatedAt: string;
    completedAt: string | null;
    picks: Record<MtgRarity, MtgEntryPick[]>;
    /** Picks whose card has since left the pool; shown once, then gone. */
    dropped: { name: string; rarity: MtgRarity }[];
  };
};

/** GET /mtg/communities/:id/progress. Counts only, never cards. */
export type MtgProgressMember = {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  picked: number;
  complete: boolean;
  isViewer: boolean;
};
