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
