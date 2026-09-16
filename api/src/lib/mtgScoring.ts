import { MTG_RARITIES, easternDateKey, easternHour, type MtgRarity } from "./mtg";

// ── Constants from the spec ──────────────────────────────────────────────────

/** Slot multipliers, #1 to #5 (spec 6.3). */
export const MTG_SLOT_WEIGHTS = [1.5, 1.25, 1, 0.75, 0.5] as const;
/** "Average" games blended into every win rate (spec 6.4). */
export const MTG_PRIOR_GAMES = 200;
/** Under this many games in hand a card carries a "low data" tag. */
export const MTG_LOW_DATA_GAMES = 500;
/** Share of the pool that must match the feed (spec 9.1). */
export const MTG_MIN_MATCH_RATE = 0.95;
/** Cards with this many games in hand should have a published win rate. */
export const MTG_WELL_PLAYED_GAMES = 2000;
/** Cards allowed to lose games since the last standings (spec 9.1). */
export const MTG_MAX_SHRINKING_CARDS = 5;
/** Eastern hours of the day's ingest attempts (spec 9.1). */
export const MTG_INGEST_HOURS = [9, 11, 13, 16, 20] as const;

// ── The 17Lands feed ─────────────────────────────────────────────────────────

export type FeedRecord = {
  name: string;
  mtgaId: number | null;
  rarity: string;
  gihGames: number;
  gihWr: number | null;
  alsa: number | null;
  ata: number | null;
  iwd: number | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Read 17Lands' card data feed (spec 9.1): the `{ copyright, notes, data }`
 * wrapper, or a bare list should the wrapper go away. The content type can't
 * be trusted, since 17Lands serves the JSON as text/html.
 */
export function parseCardDataFeed(text: string): { ok: true; records: FeedRecord[] } | { ok: false; reason: string } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, reason: "The response wasn't JSON" };
  }
  const list = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data)
      ? (body as { data: unknown[] }).data
      : null;
  if (!list) return { ok: false, reason: "The response had no card list" };
  // An empty list is a new set before its first drafts, not a broken feed.
  if (list.length === 0) return { ok: true, records: [] };
  const records: FeedRecord[] = [];
  let malformed = 0;
  for (const raw of list) {
    const r = (raw ?? {}) as Record<string, unknown>;
    // Both GIH fields must be present (17Lands sends a null win rate for small
    // samples); a renamed field would otherwise score every card a neutral 50.
    if (typeof r.name !== "string" || !r.name.trim() || !("ever_drawn_game_count" in r) || !("ever_drawn_win_rate" in r)) {
      malformed++;
      continue;
    }
    records.push({
      name: r.name.trim(),
      mtgaId: num(r.mtga_id),
      rarity: typeof r.rarity === "string" ? r.rarity.toLowerCase() : "",
      gihGames: Math.max(0, Math.round(num(r.ever_drawn_game_count) ?? 0)),
      gihWr: num(r.ever_drawn_win_rate),
      alsa: num(r.avg_seen),
      ata: num(r.avg_pick),
      iwd: num(r.drawn_improvement_win_rate),
    });
  }
  if (malformed > list.length * 0.1) return { ok: false, reason: `${malformed} of ${list.length} records were missing the expected fields` };
  if (records.some((x) => x.gihWr !== null && (x.gihWr < 0 || x.gihWr > 1))) return { ok: false, reason: "Win rates weren't between 0 and 1" };
  return { ok: true, records };
}

/** A card name reduced for matching: the front face, no accents, case or punctuation. */
export function normalizeCardName(name: string): string {
  return name
    .split(" // ")[0]
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type PoolCard = {
  id: string;
  name: string;
  rarity: MtgRarity;
  arenaId: number | null;
  statsArenaId: number | null;
  statsName: string | null;
  collectorSort: number;
};

/**
 * Pair pool cards with feed records (spec 6.8): an admin's override first,
 * then Arena ID (17Lands `mtga_id` = Scryfall `arena_id`), then a name that
 * appears once in the feed. Each record pairs with at most one card.
 */
export function matchFeed(records: FeedRecord[], pool: PoolCard[]) {
  const byArena = new Map<number, FeedRecord>();
  const byName = new Map<string, FeedRecord[]>();
  for (const r of records) {
    if (r.mtgaId !== null && !byArena.has(r.mtgaId)) byArena.set(r.mtgaId, r);
    const key = normalizeCardName(r.name);
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }
  const used = new Set<FeedRecord>();
  const matched = new Map<string, FeedRecord>();
  const take = (card: PoolCard, r: FeedRecord | undefined) => {
    if (!r || used.has(r) || matched.has(card.id)) return;
    used.add(r);
    matched.set(card.id, r);
  };
  const uniqueName = (name: string) => {
    const hits = byName.get(normalizeCardName(name));
    return hits && hits.length === 1 ? hits[0] : undefined;
  };
  for (const c of pool) {
    if (c.statsArenaId !== null) take(c, byArena.get(c.statsArenaId));
    else if (c.statsName) take(c, uniqueName(c.statsName));
  }
  for (const c of pool) if (c.arenaId !== null) take(c, byArena.get(c.arenaId));
  for (const c of pool) take(c, uniqueName(c.name));
  return {
    matched,
    unmatchedRecords: records.filter((r) => !used.has(r)),
    unmatchedCards: pool.filter((c) => !matched.has(c.id)),
  };
}

export type SnapshotCheck = {
  outcome: "published" | "not_newer" | "failed_validation";
  reason: string | null;
  totalGames: number;
  matched: number;
  shrinking: number;
};

/**
 * The checks before a snapshot is published (spec 9.1). `previous` is the
 * last published snapshot. `force` is an admin's publish-anyway: it skips the
 * match, growth and not-newer checks, never the structure.
 */
export function checkSnapshot(args: {
  matched: Map<string, FeedRecord>;
  poolSize: number;
  previous: { totalGames: number; gamesByCard: Map<string, number> } | null;
  force?: boolean;
}): SnapshotCheck {
  const { matched, poolSize, previous, force = false } = args;
  let totalGames = 0;
  for (const r of matched.values()) totalGames += r.gihGames;
  // Growth is compared over cards in both days, so a card joining or leaving
  // the pool can't make the season look like it shrank or stood still.
  let sharedNow = 0;
  let sharedBefore = 0;
  let shrinking = 0;
  if (previous) {
    for (const [cardId, r] of matched) {
      const before = previous.gamesByCard.get(cardId);
      if (before === undefined) continue;
      sharedNow += r.gihGames;
      sharedBefore += before;
      if (r.gihGames < before) shrinking++;
    }
  }
  const compare = !!previous && sharedBefore > 0;
  const base = { totalGames, matched: matched.size, shrinking };
  if (poolSize === 0 || matched.size === 0) return { ...base, outcome: "failed_validation", reason: "No pool cards matched the feed" };
  if (force) return { ...base, outcome: "published", reason: null };
  const rate = matched.size / poolSize;
  if (rate < MTG_MIN_MATCH_RATE) {
    return { ...base, outcome: "failed_validation", reason: `Only ${matched.size} of ${poolSize} pool cards matched (${Math.floor(rate * 100)}%)` };
  }
  const wellPlayed = [...matched.values()].filter((r) => r.gihGames >= MTG_WELL_PLAYED_GAMES);
  const blank = wellPlayed.filter((r) => r.gihWr === null).length;
  if (wellPlayed.length >= 10 && blank > wellPlayed.length * 0.1) {
    return { ...base, outcome: "failed_validation", reason: `${blank} of ${wellPlayed.length} cards with ${MTG_WELL_PLAYED_GAMES}+ games in hand have no win rate` };
  }
  if (compare && sharedNow < sharedBefore) {
    return { ...base, outcome: "failed_validation", reason: `Games in hand went down, from ${sharedBefore} to ${sharedNow}` };
  }
  if (shrinking > MTG_MAX_SHRINKING_CARDS) {
    return { ...base, outcome: "failed_validation", reason: `${shrinking} cards lost games since the last standings` };
  }
  if (totalGames === 0) return { ...base, outcome: "not_newer", reason: "No games in hand yet" };
  if (compare && sharedNow === sharedBefore) return { ...base, outcome: "not_newer", reason: "Same data as the last standings" };
  return { ...base, outcome: "published", reason: null };
}

// ── Scoring (spec 6 and the reference implementation in 12.4) ────────────────

export type CardScore = { score: number; adjWr: number | null; rank: number | null; ranked: number };

/**
 * Card Scores for the pool: at each rarity, cards with a published win rate
 * are ranked by adjusted GIH WR (200 "average" games blended in) and scored
 * 100 × (N − rank) / (N − 1). Cards without a win rate, or a rarity with
 * fewer than two, score a neutral 50. Ties go to more games, then collector
 * order.
 */
export function computeCardScores(
  pool: Array<{ id: string; rarity: MtgRarity; collectorSort: number }>,
  stats: Map<string, { gihGames: number; gihWr: number | null }>,
): Map<string, CardScore> {
  const out = new Map<string, CardScore>();
  for (const rarity of MTG_RARITIES) {
    const cards = pool.filter((c) => c.rarity === rarity);
    const played = cards
      .map((c) => {
        const s = stats.get(c.id);
        const games = s && s.gihWr !== null ? s.gihGames : 0;
        return { c, games, wins: s && s.gihWr !== null ? s.gihWr * games : 0, adj: 0 };
      })
      .filter((r) => r.games > 0);
    for (const c of cards) out.set(c.id, { score: 50, adjWr: null, rank: null, ranked: played.length >= 2 ? played.length : 0 });
    if (played.length < 2) continue;
    const avg = played.reduce((a, r) => a + r.wins, 0) / played.reduce((a, r) => a + r.games, 0);
    for (const r of played) r.adj = (r.wins + MTG_PRIOR_GAMES * avg) / (r.games + MTG_PRIOR_GAMES);
    played.sort((a, b) => b.adj - a.adj || b.games - a.games || a.c.collectorSort - b.c.collectorSort || a.c.id.localeCompare(b.c.id));
    const n = played.length;
    played.forEach((r, i) => out.set(r.c.id, { score: (100 * (n - 1 - i)) / (n - 1), adjWr: r.adj, rank: i + 1, ranked: n }));
  }
  return out;
}

export type EntryScore = { total: number; common: number; uncommon: number; rare: number; mythic: number; slot1: number };

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * One entry's points (spec 6.3): Card Score × slot multiplier over its picks.
 * Empty slots score 0; a card outside the scoring pool (voided later, say)
 * scores a neutral 50. Rounded to four decimals so equal picks tie exactly.
 */
export function scoreEntry(picks: Array<{ rarity: MtgRarity; slot: number; cardId: string }>, scores: Map<string, { score: number }>): EntryScore {
  const out: EntryScore = { total: 0, common: 0, uncommon: 0, rare: 0, mythic: 0, slot1: 0 };
  for (const p of picks) {
    const weight = MTG_SLOT_WEIGHTS[p.slot - 1];
    if (weight === undefined || !(p.rarity in out)) continue;
    const points = (scores.get(p.cardId)?.score ?? 50) * weight;
    out[p.rarity] += points;
    out.total += points;
    if (p.slot === 1) out.slot1 += points;
  }
  return { total: round4(out.total), common: round4(out.common), uncommon: round4(out.uncommon), rare: round4(out.rare), mythic: round4(out.mythic), slot1: round4(out.slot1) };
}

// ── Schedule and standings ───────────────────────────────────────────────────

/**
 * Whether the hourly pass at `now` is an ingest attempt (spec 9.1): 9 and 11
 * AM, 1, 4 and 8 PM ET, from the day after the Arena launch through the
 * final day. `date` is the Eastern date the standings would be for; `last`
 * marks the day's final attempt.
 */
export function mtgIngestSlot(set: { arena_release_at: string | Date | null; final_at: string | Date }, now: Date = new Date()): { due: boolean; date: string; last: boolean } {
  const { date, open } = mtgIngestWindow(set, now);
  const hour = easternHour(now);
  return {
    due: open && (MTG_INGEST_HOURS as readonly number[]).includes(hour),
    date,
    last: hour === MTG_INGEST_HOURS[MTG_INGEST_HOURS.length - 1],
  };
}

/** Whether standings can be published for `now`'s Eastern date: the day after
 *  the Arena launch through the final day (spec 9.1). */
export function mtgIngestWindow(set: { arena_release_at: string | Date | null; final_at: string | Date }, now: Date = new Date()): { date: string; open: boolean } {
  const date = easternDateKey(now);
  return { date, open: !!set.arena_release_at && date > easternDateKey(set.arena_release_at) && date <= easternDateKey(set.final_at) };
}

/** Whether an admin may publish standings for `date`: a real date from the
 *  day after the Arena launch through the final day. Unlike `mtgIngestWindow`
 *  this doesn't ask what day it is now, so the final day can still be retried
 *  once it has ended, since spec 9.1 promises it can be retried until it succeeds. */
export function mtgIngestDateAllowed(set: { arena_release_at: string | Date | null; final_at: string | Date }, date: string): boolean {
  if (!isDateKey(date) || !set.arena_release_at) return false;
  return date > easternDateKey(set.arena_release_at) && date <= easternDateKey(set.final_at);
}

/** A real calendar date written YYYY-MM-DD. */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / 86400000);

/** "Day 1 of 28": Eastern days since the Arena launch, out of the days to the final day. */
export function mtgStandingsDay(snapshotDate: string, arenaReleaseAt: string | Date | null, finalAt: string | Date): { day: number; totalDays: number } | null {
  if (!arenaReleaseAt) return null;
  const launch = dayNumber(easternDateKey(arenaReleaseAt));
  return { day: dayNumber(snapshotDate) - launch, totalDays: dayNumber(easternDateKey(finalAt)) - launch };
}

export type StandingInput = { key: string; total: number; slot1: number; completedAt: string | Date | null; updatedAt: string | Date | null };

/**
 * Standings order (spec 10.9): points, then the four #1 picks' points, then
 * whoever completed their picks first. Rows identical on all of those share
 * a rank.
 */
export function rankStandings<T extends StandingInput>(rows: T[]): Array<T & { rank: number }> {
  const ms = (v: string | Date | null) => (v ? new Date(v).getTime() : Number.MAX_SAFE_INTEGER);
  const sorted = [...rows].sort((a, b) =>
    b.total - a.total || b.slot1 - a.slot1 || ms(a.completedAt) - ms(b.completedAt) || ms(a.updatedAt) - ms(b.updatedAt) || a.key.localeCompare(b.key));
  let rank = 0;
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    const tied = !!prev && prev.total === r.total && prev.slot1 === r.slot1 && ms(prev.completedAt) === ms(r.completedAt) && ms(prev.updatedAt) === ms(r.updatedAt);
    if (!tied) rank = i + 1;
    return { ...r, rank };
  });
}

export type GroupMemberStanding = {
  id: string;
  entry_id: string | null;
  completed_at: string | Date | null;
  updated_at: string | Date | null;
  joined_at: string | Date;
};

/**
 * One day of a group's standings, ranked the way the leaderboard shows them:
 * the members with points that day. With `joinedBy`, members who joined the
 * group after that moment are left out, so an earlier day is ranked as the
 * group was then and a newcomer is never slotted into it after the fact
 * (which would push everyone below them down a place and invent movement).
 */
export function rankGroupDay<M extends GroupMemberStanding, S extends { total: string | number; slot1_points: string | number }>(
  members: M[],
  scores: Map<string, S>,
  joinedBy: number | null = null,
) {
  const eligible = members.filter((m) => m.entry_id !== null && scores.has(m.entry_id) && (joinedBy === null || new Date(m.joined_at).getTime() <= joinedBy));
  return rankStandings(eligible.map((m) => {
    const score = scores.get(m.entry_id as string) as S;
    return { key: m.id, member: m, score, total: Number(score.total), slot1: Number(score.slot1_points), completedAt: m.completed_at, updatedAt: m.updated_at };
  }));
}
