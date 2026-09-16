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
  /** True once the lock time has passed. */
  revealOpen: boolean;
  /** When the lock job ran; null until then. */
  lockedAt: string | null;
  /** The latest published standings; null before the first day. */
  standings: MtgStandingsSummary | null;
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

// ── Lock and reveal (Batch 4) ────────────────────────────────────────────────

export type MtgBadgeTier = "common" | "uncommon" | "rare" | "mythic" | "shame";

export type MtgBadge = {
  code: string;
  name: string;
  tier: MtgBadgeTier;
  description: string;
  /** True for group honors such as Early Bird. */
  groupHonor: boolean;
};

/** Badge tier colors, after Magic's rarity symbols (spec 7.1). */
export const BADGE_TIER_STYLE: Record<MtgBadgeTier, { bg: string; fg: string; border: string }> = {
  common: { bg: "#F3F4F6", fg: "#1F2937", border: "#1F2937" },
  uncommon: { bg: "#EEF1F4", fg: "#4B5563", border: "#9CA3AF" },
  rare: { bg: "#FFF7DB", fg: "#8A6200", border: "#D4A017" },
  mythic: { bg: "#FFEDE3", fg: "#B83A0B", border: "#E65B13" },
  shame: { bg: "#F5F5F4", fg: "#57534E", border: "#A8A29E" },
};

export type MtgRevealPick = { slot: number; note: string | null; onlyYou: boolean; card: MtgCard };

export type MtgRevealPlayer = {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  isViewer: boolean;
  pickCount: number;
  picks: Record<MtgRarity, MtgRevealPick[]>;
  badges: MtgBadge[];
};

export type MtgMindPick = { slot: number; votes: number; pickers: number; card: MtgCard };

/** GET /mtg/communities/:id/reveal */
export type MtgRevealPayload = {
  set: { code: string; name: string; lockAt: string };
  community: { id: string; name: string; slug: string };
  viewerIsMember: boolean;
  /** Members with picks now. */
  entries: number;
  /** True when the Group Mind was stored at the lock; false when it is
   *  worked out from the group's current members. */
  mindAtLock: boolean;
  /** Entries the Group Mind was worked out from. */
  mindEntries: number;
  players: MtgRevealPlayer[];
  mind: Record<MtgRarity, MtgMindPick[]>;
  mostPicked: Record<MtgRarity, Array<{ card: MtgCard; count: number }>>;
};

// ── Standings (Batch 5) ──────────────────────────────────────────────────────

export type MtgStandingsSummary = { date: string; takenAt: string; day: number | null; totalDays: number | null };

export type MtgLeaderboardRow = {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  isViewer: boolean;
  rank: number;
  previousRank: number | null;
  total: number;
  /** Points gained or lost since the previous day; null on the first day. */
  change: number | null;
  behind: number;
  subtotals: Record<MtgRarity, number>;
  /** The top three badges, best first. */
  badges: MtgBadge[];
  badgeCount: number;
};

/** GET /mtg/communities/:id/leaderboard */
export type MtgLeaderboardPayload = {
  dates: string[];
  standings: null | {
    date: string;
    previousDate: string | null;
    takenAt: string;
    isFinal: boolean;
    day: number | null;
    totalDays: number | null;
    rows: MtgLeaderboardRow[];
    noEntry: Array<{ userId: string; name: string | null; username: string | null; isViewer: boolean }>;
    groupMind: { total: number; change: number | null; atLock: boolean } | null;
    randomPicks: number;
  };
};

// ── Player and card pages, the Everyone board (Batch 6) ──────────────────────

/** A card's 17Lands numbers and rank within its rarity on one day. */
export type MtgCardNumbers = {
  gihWr: number | null;
  gihGames: number | null;
  rank: number | null;
  rankedCount: number | null;
  alsa: number | null;
  ata: number | null;
};

export type MtgPlayerPick = {
  slot: number;
  multiplier: number;
  note: string | null;
  card: MtgCard;
  /** The card's numbers on the latest day; null before the first standings or for a voided card. */
  stats: MtgCardNumbers | null;
  /** Null before the first standings; a neutral 50 for a card without numbers. */
  cardScore: number | null;
  points: number | null;
  /** Card Score change since the day before. */
  trend: number | null;
};

export type MtgTopCard = { rank: number; rankedCount: number | null; cardScore: number; gihWr: number | null; gihGames: number | null; card: MtgCard };

type MtgPageSet = { code: string; name: string; phase: MtgPhase; lockAt: string; arenaReleaseAt: string | null };

/** GET /mtg/communities/:id/players/:userId */
export type MtgPlayerPayload = {
  set: MtgPageSet;
  community: { id: string; name: string; slug: string };
  player: { userId: string; name: string | null; username: string | null; avatarUrl: string | null; isViewer: boolean; hasEntry: boolean; pickCount: number };
  standing: null | {
    date: string;
    previousDate: string | null;
    takenAt: string;
    isFinal: boolean;
    day: number | null;
    totalDays: number | null;
    rank: number;
    previousRank: number | null;
    /** Players ranked in the group that day. */
    players: number;
    total: number;
    change: number | null;
    behind: number;
    subtotals: Record<MtgRarity, number>;
  };
  history: Array<{ date: string; total: number; rank: number | null }>;
  picks: Record<MtgRarity, MtgPlayerPick[]>;
  top: Record<MtgRarity, MtgTopCard[]>;
  /** The viewer's own picks, when looking at someone else's page after the lock. */
  compare: Record<MtgRarity, MtgPlayerPick[]> | null;
  badges: MtgBadge[];
};

/** GET /mtg/communities/:id/cards/:cardId */
export type MtgCardPagePayload = {
  set: MtgPageSet;
  community: { id: string; name: string; slug: string };
  card: MtgCard & { inPool: boolean; voided: boolean };
  latestDate: string | null;
  latest: null | { date: string; gihWr: number | null; gihGames: number | null; alsa: number | null; ata: number | null; iwd: number | null; cardScore: number; rank: number | null; rankedCount: number | null };
  history: Array<{ date: string; rank: number | null; rankedCount: number | null; cardScore: number; gihWr: number | null; gihGames: number | null }>;
  /** Null until the lock. */
  pickedBy: null | Array<{ userId: string; name: string | null; username: string | null; avatarUrl: string | null; isViewer: boolean; slot: number; note: string | null }>;
  links: { scryfall: string; seventeenLands: string };
};

export type MtgEveryoneRow = { rank: number; handle: string | null; total: number; isViewer: boolean };

/** GET /mtg/sets/:code/everyone */
export type MtgEveryonePayload = {
  set: { code: string; name: string };
  viewer: { hasEntry: boolean; hidden: boolean };
  standings: null | {
    date: string;
    takenAt: string;
    isFinal: boolean;
    day: number | null;
    totalDays: number | null;
    players: number;
    rows: MtgEveryoneRow[];
    /** The viewer's row when it falls below the rows shown. */
    viewerRow: MtgEveryoneRow | null;
  };
};

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** 0.5823 → "58.2%". */
export const formatWinRate = (wr: number | null) => (wr === null ? "–" : `${(wr * 100).toFixed(1)}%`);

/** 12345.6 → "12,346". */
export const formatCount = (n: number | null) => (n === null ? "–" : Math.round(n).toLocaleString("en-US"));

/** A YYYY-MM-DD day as "Oct 1". */
export const formatDayKey = (key: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${key}T12:00:00Z`));
