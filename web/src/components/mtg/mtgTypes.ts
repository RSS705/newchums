/** Wire shapes for the MTG Card Evaluation Challenge (see api/src/lib/mtg.ts). */

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
  /** When the finalize job ended the season; null until then. */
  finalizedAt: string | null;
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
  "Card performance data from 17Lands.com (Premier Draft, all users). Card images and data via Scryfall. MTG Card Evaluation Challenge is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC. Not affiliated with 17Lands or Scryfall.";

export function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

/** `formatWhen` with the reader's time zone named ("6:00 PM EDT"), for a
 *  moment given on its own, where nothing else on screen says which zone. */
export function formatWhenZoned(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
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

export const MTG_SLOTS_PER_RARITY = 5;
/** Cards a player may keep in order at a rarity: the five picks, then a
 *  shortlist of up to five more that never score. */
export const MTG_LIST_MAX = 10;
export const MTG_TOTAL_PICKS = 20;
export const RARITY_SINGULAR: Record<MtgRarity, string> = { common: "common", uncommon: "uncommon", rare: "rare", mythic: "mythic" };
export const RARITY_PLURAL: Record<MtgRarity, string> = { common: "commons", uncommon: "uncommons", rare: "rares", mythic: "mythics" };

/** A card as served to a signed-in player: NEW when it was first seen after
 *  they last opened this rarity. */
export type MtgCardWithNew = MtgCard & { isNew?: boolean };

export type MtgEntryPick = { slot: number; card: MtgCard };

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
    /** Counts changes to the stored picks; a save names the one it builds on. */
    revision: number;
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
  /** Why it was earned, or for an on-track badge why it would be. */
  description: string;
  /** True for badges that belong to the group, such as Early Bird. */
  groupHonor: boolean;
  /** True for a badge the latest standings put the player on track for,
   *  which is awarded only if it still holds on the final day. */
  onTrack?: boolean;
  /** How many times it stacks, as in Called It at two rarities. */
  count?: number;
};

/** Badge tier colors, after Magic's rarity symbols (spec 7.1). */
export const BADGE_TIER_STYLE: Record<MtgBadgeTier, { bg: string; fg: string; border: string }> = {
  common: { bg: "#F3F4F6", fg: "#1F2937", border: "#1F2937" },
  // Borders at 3:1 or better on white, since an on-track badge is only its outline.
  uncommon: { bg: "#EEF1F4", fg: "#4B5563", border: "#6B7280" },
  rare: { bg: "#FFF7DB", fg: "#8A6200", border: "#A87A00" },
  mythic: { bg: "#FFEDE3", fg: "#B83A0B", border: "#E65B13" },
  shame: { bg: "#F5F5F4", fg: "#57534E", border: "#78716C" },
};

export type MtgRevealPick = { slot: number; onlyYou: boolean; card: MtgCard };

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
    /** Members not ranked: no picks, or joined after picks locked (`joinedAfterLock`), so following along until the next season. */
    noEntry: Array<{ userId: string; name: string | null; username: string | null; isViewer: boolean; joinedAfterLock?: boolean }>;
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
  card: MtgCard;
  /** Removed from scoring by an admin, so the pick scores a neutral 50. */
  voided?: boolean;
  /** The card's numbers on the latest day; null before the first standings or for a voided card. */
  stats: MtgCardNumbers | null;
  /** Null before the first standings; a neutral 50 for a card without numbers. */
  cardScore: number | null;
  /** The pick's points, which are its Card Score since every slot counts the same. */
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
  player: { userId: string; name: string | null; username: string | null; avatarUrl: string | null; isViewer: boolean; hasEntry: boolean; pickCount: number; joinedAfterLock?: boolean };
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
  pickedBy: null | Array<{ userId: string; name: string | null; username: string | null; avatarUrl: string | null; isViewer: boolean; slot: number }>;
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
/** Scryfall's 146 px wide image for thumbnails, instead of the 488 px "normal" one. */
export const smallCardImage = (url: string | null | undefined) => (url ? url.replace("/normal/", "/small/") : null);

export const formatWinRate = (wr: number | null) => (wr === null ? "–" : `${(wr * 100).toFixed(1)}%`);

/** 12345.6 → "12,346". */
export const formatCount = (n: number | null) => (n === null ? "–" : Math.round(n).toLocaleString("en-US"));

/** A YYYY-MM-DD day as "Oct 1". */
export const formatDayKey = (key: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${key}T12:00:00Z`));

// ── The season's end, past seasons and the trophy case (Batch 8) ─────────────

export type MtgResultsPerson = { userId: string; name: string | null; username: string | null; isViewer: boolean };

/** One badge in the ceremony, with everyone in the group who earned it. */
export type MtgCeremonyBadge = {
  code: string;
  name: string;
  tier: MtgBadgeTier;
  /** What the badge is for, the same for every recipient. */
  description: string;
  groupHonor: boolean;
  recipients: Array<MtgResultsPerson & { count: number; reason: string }>;
};

/** GET /mtg/communities/:id/results?set= */
export type MtgResultsPayload = {
  set: { code: string; name: string; finalAt: string };
  community: { id: string; name: string; slug: string };
  /** Null until the season is final. */
  results: null | {
    date: string;
    day: number | null;
    totalDays: number | null;
    /** Players ranked in the group on the final day. */
    players: number;
    /** Ranks 1 to 3; tied players share a rank. */
    podium: Array<MtgResultsPerson & { avatarUrl: string | null; rank: number; total: number }>;
    badges: MtgCeremonyBadge[];
    /** The viewer's finish, when they played: `name` as the group sees it, `topBadges` their three best badge names,
     *  `champion` whether they hold the group's Champion badge (a group under three players has none). */
    viewer: null | { rank: number; total: number; name: string; badgeCount: number; topBadges: string[]; champion: boolean };
  };
};

/** GET /mtg/communities/:id/seasons: newest first. */
export type MtgSeasonRef = { code: string; name: string; final: boolean; finalAt: string; isCurrent: boolean };

/** Where a season lives: the group home while it's being played, its own page once it's over. */
export const seasonPageHref = (slug: string, season: MtgSeasonRef) => (season.isCurrent && !season.final ? `/communities/${slug}` : `/communities/${slug}/seasons/${season.code}`);

/** GET /public/users/:handle/mtg-badges: seasons newest first. */
export type MtgTrophyCasePayload = {
  seasons: Array<{
    set: { code: string; name: string; final: boolean };
    badges: Array<MtgBadge & { group: null | { name: string; slug: string } | { private: true } }>;
  }>;
};

/** `?set=code` for a season's API calls and links, or nothing for the current season. */
export const seasonQuery = (setCode: string | null | undefined) => (setCode ? `?set=${encodeURIComponent(setCode)}` : "");

/** The season a page was opened for (`?set=`), or null for the current one. */
export function seasonFromSearch(params: { get: (key: string) => string | null } | null): string | null {
  const code = params?.get("set")?.toLowerCase() ?? null;
  return code && /^[a-z0-9]{2,6}$/.test(code) ? code : null;
}
