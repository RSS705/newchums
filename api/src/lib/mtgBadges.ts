import { MTG_RARITIES, MTG_SLOTS_PER_RARITY, type MtgRarity } from "./mtg";
import { rankStandings, scoreEntry } from "./mtgScoring";

// ── Season badges (spec 7.2, 7.3 and 7.5) ────────────────────────────────────
//
// Group honors, prediction achievements and the Hall of Shame, judged on one
// day's standings. After every publish and re-score the season's latest day
// is judged and stored as "on track"; the final day's judgement is the award.
// Pure, so every rule is unit tested.

/** A rarity counts toward rank badges once more than this many of its cards
 *  are ranked. 17Lands leaves win rates blank under about 500 games in hand,
 *  so the first days rank a handful of cards, and "#1" or "top five" among a
 *  handful means nothing. Every rarity is far past it by the final day. */
export const MTG_BADGE_MIN_RANKED = 10;
/** Group honors need this many players with entries in the group (spec 7.1). */
export const MTG_HONOR_MIN_PLAYERS = 3;
/** Contrarian, Hive Mind, Photo Finish, Rollercoaster and Beat the Crowd need this many. */
export const MTG_BIG_GROUP_PLAYERS = 4;
/** Oracle and Sharp Eye need this many entries on the Everyone board. */
export const MTG_EVERYONE_MIN_ENTRIES = 20;
/** Random picks average 50 × (1.5 + 1.25 + 1 + 0.75 + 0.5) × 4 rarities. */
export const MTG_RANDOM_PICKS_POINTS = 1000;

const FULL_ENTRY = MTG_RARITIES.length * MTG_SLOTS_PER_RARITY;

/** One card's standing on the day being judged. */
export type SeasonCard = {
  cardId: string;
  name: string;
  rarity: MtgRarity;
  /** Rank at its rarity; null when it isn't ranked (no win rate yet). */
  rank: number | null;
  /** How many cards at the rarity are ranked. */
  rankedCount: number;
  cardScore: number;
  /** Adjusted win rate, which settles ties between equal Card Scores. */
  adjWr: number | null;
  alsa: number | null;
};

export type SeasonPick = { rarity: MtgRarity; slot: number; cardId: string; note: string | null };

/** An entry with points on the day being judged. */
export type SeasonEntry = {
  userId: string;
  /** Hidden from the Everyone board, which leaves it out of Oracle and Sharp Eye. */
  hidden: boolean;
  total: number;
  slot1: number;
  subtotals: Record<MtgRarity, number>;
  completedAt: string | Date | null;
  updatedAt: string | Date | null;
  picks: SeasonPick[];
};

export type SeasonGroup = {
  communityId: string;
  /** The group's standings on each published day, oldest first, ranked as the
   *  leaderboard ranked them; the last is the day being judged. A day counts
   *  toward day-based honors only when the group had MTG_HONOR_MIN_PLAYERS
   *  ranked players and the day ranked cards (see `judgedDays`). */
  days: Array<Array<{ userId: string; rank: number }>>;
  /** The Group Mind's picks, empty when the group has none. */
  mind: Array<{ rarity: MtgRarity; slot: number; cardId: string }>;
};

/** `communityId` is set for badges that belong to a group, and `key` tells
 *  stacked awards apart (Called It at two rarities is two rows). */
export type SeasonBadge = { userId: string; communityId: string | null; code: string; key: string; detail: Record<string, unknown> };

type RankedCard = SeasonCard & { rank: number };

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const hasNote = (p: SeasonPick) => (p.note ?? "").trim().length > 0;
const pickKey = (p: { rarity: MtgRarity; cardId: string }) => `${p.rarity}|${p.cardId}`;

function judged(card: SeasonCard | undefined): card is RankedCard {
  return !!card && card.rank !== null && card.rankedCount > MTG_BADGE_MIN_RANKED;
}
const inTop = (card: SeasonCard | undefined, n: number): card is RankedCard => judged(card) && card.rank <= n;
const inBottomQuarter = (card: SeasonCard | undefined): card is RankedCard => judged(card) && card.rank > 0.75 * card.rankedCount;

/** What a badge remembers about a card, for its reason. */
function cardDetail(card: RankedCard, extra: Record<string, unknown> = {}) {
  return { name: card.name, rarity: card.rarity, rank: card.rank, ranked: card.rankedCount, ...extra };
}

/** The median ALSA at each rarity, over cards with one. Higher means drafters take it later. */
export function alsaMedians(cards: SeasonCard[]): Map<MtgRarity, number> {
  const out = new Map<MtgRarity, number>();
  for (const rarity of MTG_RARITIES) {
    const values = cards.filter((c) => c.rarity === rarity && c.alsa !== null).map((c) => c.alsa as number).sort((a, b) => a - b);
    if (values.length < 2) continue;
    const mid = Math.floor(values.length / 2);
    out.set(rarity, values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2);
  }
  return out;
}

/** The rarities with more than MTG_BADGE_MIN_RANKED cards ranked on the day. */
export function judgedRarities(cards: SeasonCard[]): Set<MtgRarity> {
  return new Set(cards.filter((c) => c.rankedCount > MTG_BADGE_MIN_RANKED).map((c) => c.rarity));
}

/** The ones anyone can earn on their own (spec 7.3 and 7.5), with no group involved. */
function playerBadges(entry: SeasonEntry, cards: Map<string, SeasonCard>, board: { rank: number; players: number } | null, medians: Map<MtgRarity, number>, judgedSet: Set<MtgRarity>): SeasonBadge[] {
  const out: SeasonBadge[] = [];
  const add = (code: string, detail: Record<string, unknown> = {}, key = "") => out.push({ userId: entry.userId, communityId: null, code, key, detail });
  const picked = entry.picks.map((p) => ({ p, c: cards.get(p.cardId) }));

  for (const rarity of MTG_RARITIES) {
    const five = picked.filter((x) => x.p.rarity === rarity).sort((a, b) => a.p.slot - b.p.slot);
    const all = five.map((x) => x.c);
    if (five.length === MTG_SLOTS_PER_RARITY && all.every(judged)) {
      const ranks = (all as RankedCard[]).map((c) => c.rank);
      if ([...ranks].sort((a, b) => a - b).every((r, i) => r === i + 1)) add("clean_sweep", { rarity }, rarity);
      if (ranks.every((r, i) => i === 0 || r > ranks[i - 1])) add("perfect_order", { rarity, ranks }, rarity);
      if (ranks.every((r) => r <= 10)) add("sniper", { rarity }, rarity);
    }
    const first = five.find((x) => x.p.slot === 1)?.c;
    if (inTop(first, 1)) add("called_it", { rarity, card: cardDetail(first) }, rarity);
    if (inBottomQuarter(first)) add("bust", { rarity, card: cardDetail(first) }, rarity);
  }

  const everyRarity = (test: (c: SeasonCard | undefined) => boolean) => MTG_RARITIES.every((r) => picked.some((x) => x.p.rarity === r && test(x.c)));
  if (everyRarity((c) => inTop(c, 5))) add("grand_slam");
  if (everyRarity((c) => inTop(c, 10))) add("well_rounded");

  const numberOne = (rarity: MtgRarity) => picked.find((x) => x.p.rarity === rarity && inTop(x.c, 1))?.c as RankedCard | undefined;
  const topRare = numberOne("rare");
  const topMythic = numberOne("mythic");
  const topCommon = numberOne("common");
  if (topRare && topMythic) add("bomb_squad", { cards: [cardDetail(topRare), cardDetail(topMythic)] });
  if (topRare || topMythic) add("bomb_detector", { cards: [topRare, topMythic].filter((c): c is RankedCard => !!c).map((c) => cardDetail(c)) });
  if (topCommon) add("common_denominator", { card: cardDetail(topCommon) });

  const cardsWhere = (test: (p: SeasonPick, c: SeasonCard | undefined) => boolean) =>
    picked.filter((x) => judged(x.c) && test(x.p, x.c)).map((x) => cardDetail(x.c as RankedCard, { slot: x.p.slot }));
  const bullseye = cardsWhere((p, c) => c?.rank === p.slot);
  if (bullseye.length > 0) add("bullseye", { cards: bullseye });
  const sleepers = cardsWhere((_, c) => inTop(c, 10) && c.alsa !== null && medians.has(c.rarity) && c.alsa > (medians.get(c.rarity) as number));
  if (sleepers.length > 0) add("sleeper_agent", { cards: sleepers });
  const last = cardsWhere((_, c) => judged(c) && c.rank === c.rankedCount);
  if (last.length > 0) add("rock_bottom", { cards: last });
  const eaten = cardsWhere((p, c) => hasNote(p) && inBottomQuarter(c));
  if (eaten.length > 0) add("eats_words", { cards: eaten });

  if (board && board.players >= MTG_EVERYONE_MIN_ENTRIES) {
    if (board.rank <= 0.05 * board.players) add("oracle", { rank: board.rank, players: board.players });
    if (board.rank <= 0.25 * board.players) add("sharp_eye", { rank: board.rank, players: board.players });
  }
  // The random-picks line is for 20 picks, so an unfinished entry below it says
  // nothing about its calls; and until every rarity is ranked, unranked cards'
  // neutral 50s pull every total toward the line.
  if (entry.picks.length >= FULL_ENTRY && judgedSet.size === MTG_RARITIES.length && round4(entry.total) < MTG_RANDOM_PICKS_POINTS) {
    add("monkey_business", { points: round4(entry.total) });
  }
  return out;
}

/** Everyone in `rows` whose value is the best, when the best passes `worthIt`. Ties share. */
function winners<T>(rows: T[], value: (row: T) => number, pick: "max" | "min", worthIt: (best: number) => boolean = () => true): { best: number; rows: T[] } {
  if (rows.length === 0) return { best: 0, rows: [] };
  const values = rows.map((r) => round4(value(r)));
  const best = pick === "max" ? Math.max(...values) : Math.min(...values);
  return { best, rows: worthIt(best) ? rows.filter((_, i) => values[i] === best) : [] };
}

const SUBTOTAL_HONOR: Record<MtgRarity, string> = { common: "common_sense", uncommon: "uncommon_knowledge", rare: "rare_insight", mythic: "mythic_vision" };

/** Group honors (7.2 and 7.5) and the achievements that need a group: Beat
 *  the Crowd, Wire to Wire, Told You So and Lone Wolf. `judgedSet` holds the
 *  rarities ranked on the day being judged, and `counted` which days count. */
function groupBadges(group: SeasonGroup, entries: Map<string, SeasonEntry>, cards: Map<string, SeasonCard>, judgedSet: Set<MtgRarity>, counted: boolean[]): SeasonBadge[] {
  const out: SeasonBadge[] = [];
  const add = (userId: string, code: string, detail: Record<string, unknown> = {}) => out.push({ userId, communityId: group.communityId, code, key: "", detail });
  const latest = group.days[group.days.length - 1] ?? [];
  const players = latest
    .filter((r) => entries.has(r.userId))
    .map((r) => ({ userId: r.userId, rank: r.rank, entry: entries.get(r.userId) as SeasonEntry }));
  const n = players.length;
  if (n < MTG_HONOR_MIN_PLAYERS) return out;
  const mind = new Set(group.mind.map(pickKey));
  // Standings can't pick anyone out until at least one rarity is ranked: every
  // total sits near 1,000 and ties go to whoever finished their picks first.
  const standingsMean = judgedSet.size > 0;
  // Days a group honor can count: the group had enough players to be a
  // contest, and the day ranked cards. A founder alone for a week leads nothing.
  const days = group.days
    .filter((d, i) => counted[i] !== false && d.length >= MTG_HONOR_MIN_PLAYERS)
    .map((d) => new Map(d.map((r) => [r.userId, r.rank])));

  // Told You So: a noted pick the Group Mind left out, in the top five.
  if (mind.size > 0) {
    for (const p of players) {
      const called = p.entry.picks
        .filter((pick) => hasNote(pick) && !mind.has(pickKey(pick)))
        .map((pick) => cards.get(pick.cardId))
        .filter((c): c is RankedCard => inTop(c, 5));
      if (called.length > 0) add(p.userId, "told_you_so", { cards: called.map((c) => cardDetail(c)) });
    }
  }

  if (standingsMean) {
    // Champion, Runner-Up and Third Place by the leaderboard's own ranks.
    for (const p of players) {
      if (p.rank === 1) add(p.userId, "champion", { players: n });
      if (p.rank === 2) add(p.userId, "runner_up", { players: n });
      if (p.rank === 3) add(p.userId, "third_place", { players: n });
    }
  }

  // A rarity's honor waits until that rarity is ranked; before then every
  // complete list scores the same 250 and the whole group would tie.
  for (const rarity of MTG_RARITIES) {
    if (!judgedSet.has(rarity)) continue;
    const top = winners(players, (p) => p.entry.subtotals[rarity], "max", (best) => best > 0);
    for (const p of top.rows) add(p.userId, SUBTOTAL_HONOR[rarity], { rarity, points: top.best });
  }

  // Pick of the Season: the most points any one pick earned, which is its Card
  // Score now that every slot counts the same. A Card Score tops out at 100, so
  // every pick of a card that finishes #1 earns 100; the higher adjusted win
  // rate settles those ties, and only the same card shares.
  const bestPicks = players.flatMap((p) => {
    const scored = p.entry.picks.flatMap((pick) => {
      const c = cards.get(pick.cardId);
      return judged(c) && pick.slot >= 1 && pick.slot <= MTG_SLOTS_PER_RARITY ? [{ c, slot: pick.slot, points: round4(c.cardScore), adj: c.adjWr ?? -1 }] : [];
    });
    if (scored.length === 0) return [];
    const most = Math.max(...scored.map((x) => x.points));
    const bestAdj = Math.max(...scored.filter((x) => x.points === most).map((x) => x.adj));
    return [{ p, most, adj: bestAdj, picks: scored.filter((x) => x.points === most && x.adj === bestAdj) }];
  });
  const topPoints = winners(bestPicks, (x) => x.most, "max", (best) => best > 0).rows;
  if (topPoints.length > 0) {
    const topAdj = Math.max(...topPoints.map((x) => x.adj));
    for (const x of topPoints.filter((y) => y.adj === topAdj)) {
      add(x.p.userId, "pick_of_the_season", { cards: x.picks.map((pick) => cardDetail(pick.c, { slot: pick.slot, points: pick.points })) });
    }
  }

  if (standingsMean) {
    // Comeback Kid: from each player's first counted day in the group to today, two places at least.
    const climbs = players.map((p) => {
      const from = days.map((d) => d.get(p.userId)).find((r) => r !== undefined) ?? p.rank;
      return { p, from, climb: from - p.rank };
    });
    for (const x of winners(climbs, (c) => c.climb, "max", (best) => best >= 2).rows) add(x.p.userId, "comeback_kid", { from: x.from, to: x.p.rank });

    const leads = players.map((p) => ({ p, days: days.filter((d) => d.get(p.userId) === 1).length }));
    for (const x of winners(leads, (l) => l.days, "max", (best) => best >= 1).rows) add(x.p.userId, "king_of_the_hill", { days: x.days });

    // Wire to Wire: first on every counted day, which a late joiner can't be.
    for (const p of players) {
      if (days.length > 0 && days.every((d) => d.get(p.userId) === 1)) add(p.userId, "wire_to_wire", { days: days.length });
    }
  }

  // Whiff of the Season: the lowest Card Score among everyone's #1 picks.
  const firsts = players.map((p) => ({
    p,
    cards: p.entry.picks.filter((pick) => pick.slot === 1).map((pick) => cards.get(pick.cardId)).filter(judged),
  }));
  const allFirsts = firsts.flatMap((x) => x.cards);
  if (allFirsts.length > 0) {
    const lowest = Math.min(...allFirsts.map((c) => round4(c.cardScore)));
    for (const x of firsts) {
      const whiffs = x.cards.filter((c) => round4(c.cardScore) === lowest);
      if (whiffs.length > 0) add(x.p.userId, "whiff_of_the_season", { cards: whiffs.map((c) => cardDetail(c, { score: lowest })) });
    }
  }

  // Lone Wolf: the only player in the group to pick a card that's in the top five.
  const pickers = new Map<string, number>();
  for (const p of players) for (const pick of p.entry.picks) pickers.set(pickKey(pick), (pickers.get(pickKey(pick)) ?? 0) + 1);
  for (const p of players) {
    const alone = p.entry.picks
      .filter((pick) => pickers.get(pickKey(pick)) === 1)
      .map((pick) => cards.get(pick.cardId))
      .filter((c): c is RankedCard => inTop(c, 5));
    if (alone.length > 0) add(p.userId, "lone_wolf", { cards: alone.map((c) => cardDetail(c)) });
  }

  if (n < MTG_BIG_GROUP_PLAYERS) return out;

  // Contrarian and Hive Mind compare complete entries only, since a half-made
  // entry overlaps less by leaving slots empty, and only when overlaps differ.
  if (mind.size > 0) {
    const complete = players.filter((p) => p.entry.picks.length >= FULL_ENTRY)
      .map((p) => ({ p, shared: p.entry.picks.filter((pick) => mind.has(pickKey(pick))).length }));
    if (complete.length >= MTG_BIG_GROUP_PLAYERS) {
      const fewest = winners(complete, (x) => x.shared, "min");
      const most = winners(complete, (x) => x.shared, "max");
      if (fewest.best < most.best) {
        for (const x of fewest.rows) add(x.p.userId, "contrarian", { shared: x.shared });
        for (const x of most.rows) add(x.p.userId, "hive_mind", { shared: x.shared });
      }
    }
  }

  if (!standingsMean) return out;

  // Wooden Spoon: last place, in a group big enough that last isn't also Third Place.
  const lastRank = Math.max(...players.map((p) => p.rank));
  for (const p of players) if (p.rank === lastRank && lastRank > 3) add(p.userId, "wooden_spoon", { players: n });

  // Beat the Crowd: more points than the Group Mind's picks, scored the same way.
  if (mind.size > 0) {
    const mindTotal = scoreEntry(group.mind, new Map([...cards].map(([id, c]) => [id, { score: c.cardScore }]))).total;
    for (const p of players) {
      if (round4(p.entry.total) > mindTotal) add(p.userId, "beat_the_crowd", { points: round4(p.entry.total), mind: mindTotal });
    }
  }

  // Photo Finish: the smallest gap between two players next to each other; both earn it.
  const order = [...players].sort((a, b) => a.rank - b.rank);
  const gaps = order.slice(1).map((p, i) => ({ above: order[i], below: p, gap: round4(Math.abs(order[i].entry.total - p.entry.total)) }));
  const closest = Math.min(...gaps.map((g) => g.gap));
  const finishers = new Set(gaps.filter((g) => g.gap === closest).flatMap((g) => [g.above.userId, g.below.userId]));
  for (const p of order) if (finishers.has(p.userId)) add(p.userId, "photo_finish", { gap: closest });

  // Rollercoaster: places moved from each counted day to the next, up and down, as the leaderboard showed them.
  const rides = players.map((p) => {
    let places = 0;
    for (let d = 1; d < days.length; d++) {
      const before = days[d - 1].get(p.userId);
      const now = days[d].get(p.userId);
      if (before !== undefined && now !== undefined) places += Math.abs(now - before);
    }
    return { p, places };
  });
  for (const x of winners(rides, (r) => r.places, "max", (best) => best > 0).rows) add(x.p.userId, "rollercoaster", { places: x.places });

  return out;
}

/**
 * Every season badge earned on the day being judged: each entry's own
 * achievements, with Oracle and Sharp Eye read from the Everyone board
 * (hidden entries aren't on it), then each group's honors and group
 * achievements. A player in two groups can earn a group's badges in each.
 * `judgedDays` lines up with every group's `days` and says whether that day
 * ranked any rarity past MTG_BADGE_MIN_RANKED; a day that didn't never counts
 * toward King of the Hill, Wire to Wire, Rollercoaster or Comeback Kid.
 */
export function computeSeasonBadges(input: { cards: SeasonCard[]; entries: SeasonEntry[]; groups: SeasonGroup[]; judgedDays?: boolean[] }): SeasonBadge[] {
  const cards = new Map(input.cards.map((c) => [c.cardId, c]));
  const entries = new Map(input.entries.map((e) => [e.userId, e]));
  const board = rankStandings(input.entries.filter((e) => !e.hidden).map((e) => ({
    key: e.userId, total: e.total, slot1: e.slot1, completedAt: e.completedAt, updatedAt: e.updatedAt,
  })));
  const boardRank = new Map(board.map((r) => [r.key, r.rank]));
  const medians = alsaMedians(input.cards);
  const judgedSet = judgedRarities(input.cards);
  const out: SeasonBadge[] = [];
  for (const e of input.entries) {
    const rank = boardRank.get(e.userId);
    out.push(...playerBadges(e, cards, rank === undefined ? null : { rank, players: board.length }, medians, judgedSet));
  }
  for (const g of input.groups) out.push(...groupBadges(g, entries, cards, judgedSet, input.judgedDays ?? []));
  return out;
}
