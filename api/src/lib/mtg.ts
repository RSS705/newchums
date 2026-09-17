/**
 * MTG Card Evaluation Challenge (docs/MTG-Bets-Spec.md), shared pieces.
 *
 * Batch 1: season phases and timeline, and the Scryfall card sync. Later
 * batches add entries, the 17Lands ingest, scoring and badges here.
 */

export const MTG_SPECIALIZATION = "mtg_prediction_challenge";
export const MTG_RARITIES = ["common", "uncommon", "rare", "mythic"] as const;
export type MtgRarity = (typeof MTG_RARITIES)[number];

/** How the game presents itself, so the same headers go on every request. */
export const MTG_USER_AGENT = "NewChums/1.0 (MTG Card Evaluation Challenge; https://newchums.com)";

export type MtgSetRow = {
  id: string;
  code: string;
  name: string;
  previews_start_at: string | null;
  gallery_complete_at: string | null;
  prerelease_start_at: string | null;
  prerelease_end_at: string | null;
  picks_open_at: string | null;
  lock_at: string;
  arena_release_at: string | null;
  tabletop_release_at: string | null;
  final_at: string;
  feed_url: string;
  scoring_version: number;
  status: string;
  /** When the lock job finished (Batch 4); null until then. */
  locked_at?: string | Date | null;
  /** When the finalize job ended the season (Batch 8); null until then. */
  finalized_at?: string | Date | null;
  /** When an admin reopened a finalized season; the finalize job waits for Finalize now. */
  reopened_at?: string | Date | null;
};

export type MtgPhase = "upcoming" | "previews" | "open" | "locked" | "live" | "final";

/** Hour of the day in Eastern time, DST-aware. The cron runs hourly in UTC
 *  and the spec states every schedule in ET. */
export function easternHour(at: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(at);
  return Number(h) % 24;
}

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : null);

/** The season's phase at `now`, derived from the set's dates so setting up
 *  a season is entering dates once. `status = 'final'` (set by the finalize
 *  job in a later batch) wins over the clock. */
export function mtgPhase(set: MtgSetRow, now: Date = new Date()): MtgPhase {
  const t = now.getTime();
  if (set.status === "final" || set.status === "archived") return "final";
  if (t >= new Date(set.final_at).getTime()) return "final";
  const arena = ms(set.arena_release_at);
  if (arena !== null && t >= arena) return "live";
  if (t >= new Date(set.lock_at).getTime()) return "locked";
  const open = ms(set.picks_open_at);
  if (open !== null && t >= open) return "open";
  const previews = ms(set.previews_start_at);
  if (previews !== null && t >= previews) return "previews";
  return "upcoming";
}

export type TimelineEntry = {
  key: string;
  label: string;
  at: string;
  endAt?: string;
  detail: string;
  status: "done" | "now" | "upcoming";
};

/** The dates that matter to players, in order, with a status each. */
export function mtgTimeline(set: MtgSetRow, now: Date = new Date()): TimelineEntry[] {
  const t = now.getTime();
  const entries: Array<Omit<TimelineEntry, "status">> = [];
  if (set.previews_start_at) {
    entries.push({
      // Picks stay open until the lock, well after the full card list arrives, so the entry runs to the lock.
      key: "previews", label: "Previews start, picks open", at: set.previews_start_at, endAt: set.lock_at,
      detail: "New cards are revealed every day, and you can make your picks from the first one until picks lock. Revealed cards appear in the pick screens automatically.",
    });
  }
  // Picks lock before prereleases start, so the lock comes first even when the
  // two share a moment (the sort below keeps insertion order for ties).
  entries.push({ key: "lock", label: "Picks lock", at: set.lock_at, detail: "After this moment nothing can change, and everyone's picks are revealed to the group." });
  if (set.prerelease_start_at) {
    entries.push({
      key: "prerelease", label: "Prerelease weekend", at: set.prerelease_start_at, endAt: set.prerelease_end_at ?? undefined,
      detail: "Tabletop events at stores, from Friday evening. Picks are locked by then.",
    });
  }
  if (set.arena_release_at) {
    entries.push({ key: "arena", label: "Arena launch", at: set.arena_release_at, detail: "Premier Draft opens and 17Lands starts collecting games." });
    const firstStandings = mtgMorningAfter(set.arena_release_at); // 9 AM ET the morning after
    entries.push({ key: "first_standings", label: "First standings", at: firstStandings.toISOString(), detail: "Day 1 of scoring. The first few days swing a lot." });
  }
  if (set.tabletop_release_at) {
    entries.push({ key: "paper", label: "Paper release", at: set.tabletop_release_at, detail: "The set arrives in stores." });
  }
  entries.push({ key: "final", label: "Final day", at: set.final_at, detail: "The last standings of the season, the podium and everyone's badges, and an email with your results." });
  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return entries.map((e) => {
    const start = new Date(e.at).getTime();
    // The final day is happening until the season is finalized, however late its standings are.
    const end = e.key === "final" && set.status === "active"
      ? Number.POSITIVE_INFINITY
      : e.key === "final" && set.finalized_at
        ? Math.max(start, new Date(set.finalized_at).getTime())
        : e.endAt ? new Date(e.endAt).getTime() : start + 3600000;
    const status: TimelineEntry["status"] = t >= end ? "done" : t >= start ? "now" : "upcoming";
    return { ...e, status };
  });
}

// ── Scryfall sync ────────────────────────────────────────────────────────────

type ScryfallCard = {
  id: string;
  oracle_id?: string;
  arena_id?: number;
  name: string;
  rarity: string;
  collector_number: string;
  layout?: string;
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  booster?: boolean;
  image_status?: string;
  image_uris?: { normal?: string; large?: string };
  card_faces?: Array<{ image_uris?: { normal?: string; large?: string }; colors?: string[]; mana_cost?: string; oracle_text?: string }>;
  preview?: { previewed_at?: string; source?: string; source_uri?: string };
  set_type?: string;
  digital?: boolean;
};

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
type R2Like = { put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown> } | undefined;

const sleep = (msWait: number) => new Promise((r) => setTimeout(r, msWait));

/** Numeric part of a collector number ("12a" -> 12, "★" -> 0), for ordering
 *  and for picking the regular printing of each oracle card. */
export function collectorSort(cn: string): number {
  const m = /^\d+/.exec(cn);
  return m ? Number(m[0]) : 0;
}

export type CardSyncSummary = {
  seen: number; kept: number; inserted: number; updated: number; pages: number; rawKeys: string[]; notes: string[];
  /** Set when the sync would have taken a large share of the pool out at once, so it kept the pool as it was. */
  poolHeld?: { leaving: number; total: number };
};

/** Before the lock, a sync may take at most this share of the pool out in one run (and always a few cards). */
const MTG_POOL_DROP_LIMIT = 0.1;

/**
 * Pull the set from Scryfall, keep one row per oracle card (lowest collector
 * number, which is the regular printing), and upsert. Never touches
 * `first_seen_at` on existing rows, never touches `voided`.
 *
 * Pool rule: a card is in the pool when its rarity is one of the four and,
 * once the gallery is complete, Scryfall flags it as a booster card. During
 * previews the booster flag is unreliable, so every previewed card of the
 * four rarities is in until the gallery date passes. Scryfall adds the flags
 * weeks or months after a set's release (none of Reality Fracture's printings
 * had one on September 17, 2026, nor any set's released since April), so the
 * flag narrows the pool only once some printing in the set carries it.
 *
 * Before the lock a sync never takes more than a tenth of the pool out at
 * once: a pool that shrinks that fast is Scryfall misbehaving (flags half
 * added, a page missing), not a retraction, and every pick of a card that
 * leaves the pool is deleted when its player next opens their picks. Such a
 * run keeps the pool as it was, says so in its notes and sets `poolHeld`.
 */
export async function syncScryfallSet(
  sql: SqlTag,
  bucket: R2Like,
  set: MtgSetRow,
  now: Date = new Date(),
): Promise<CardSyncSummary> {
  const summary: CardSyncSummary = { seen: 0, kept: 0, inserted: 0, updated: 0, pages: 0, rawKeys: [], notes: [] };
  const headers = { "User-Agent": MTG_USER_AGENT, Accept: "application/json" };
  let url: string | null = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`e:${set.code} -t:basic`)}&unique=prints&order=set`;
  const all: ScryfallCard[] = [];
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  while (url) {
    let res = await fetch(url, { headers });
    // Scryfall rate-limits in bursts. Giving up throws away the whole run and
    // freezes the pool until the next sync hours later, so wait and try again.
    for (let tries = 0; (res.status === 429 || res.status >= 500) && tries < 2; tries++) {
      await sleep(1500 + tries * 2000);
      res = await fetch(url, { headers });
      if (res.ok) summary.notes.push(`Scryfall was busy, retried page ${summary.pages + 1}`);
    }
    if (res.status === 404) { summary.notes.push("Scryfall returned no cards for this set yet"); break; }
    if (!res.ok) throw new Error(`Scryfall ${res.status}`);
    const text = await res.text();
    summary.pages += 1;
    if (bucket) {
      const key = `mtg/scryfall/${set.code}/${stamp}-p${summary.pages}.json`;
      try { await bucket.put(key, text, { httpMetadata: { contentType: "application/json" } }); summary.rawKeys.push(key); } catch { summary.notes.push("archive write failed"); }
    }
    const page = JSON.parse(text) as { data?: ScryfallCard[]; has_more?: boolean; next_page?: string };
    for (const card of page.data ?? []) all.push(card);
    url = page.has_more && page.next_page ? page.next_page : null;
    if (url) await sleep(120);
  }
  summary.seen = all.length;

  // One row per oracle card: the lowest collector number wins.
  const byOracle = new Map<string, ScryfallCard>();
  for (const card of all) {
    if (!card.oracle_id) continue;
    if (!MTG_RARITIES.includes(card.rarity as MtgRarity)) continue;
    if (card.digital === true) continue;
    const current = byOracle.get(card.oracle_id);
    if (!current || collectorSort(card.collector_number) < collectorSort(current.collector_number)) byOracle.set(card.oracle_id, card);
  }
  const galleryDone = !!set.gallery_complete_at && now.getTime() >= new Date(set.gallery_complete_at).getTime();
  const byBooster = galleryDone && all.some((card) => card.booster === true);
  if (galleryDone && !byBooster) summary.notes.push("Scryfall marks no booster cards for this set yet, so every card stays in the pool");
  const wantsPool = (card: ScryfallCard) => (byBooster ? card.booster === true : true);

  const beforeLock = now.getTime() < new Date(set.lock_at).getTime();
  let held = new Set<string>();
  if (beforeLock) {
    const current = (await sql`
      SELECT oracle_id::text AS oracle_id FROM newchums.mtg_cards WHERE set_id = ${set.id} AND in_pool = true
    `) as { oracle_id: string }[];
    const leaving = current.filter((r) => { const card = byOracle.get(r.oracle_id); return !card || !wantsPool(card); }).length;
    if (leaving > Math.max(3, Math.floor(current.length * MTG_POOL_DROP_LIMIT))) {
      held = new Set(current.map((r) => r.oracle_id));
      summary.poolHeld = { leaving, total: current.length };
      summary.notes.push(`Kept the pool as it was: this sync would have taken ${leaving} of ${current.length} cards out`);
    }
  }

  for (const card of byOracle.values()) {
    const front = card.image_uris ?? card.card_faces?.[0]?.image_uris;
    const back = card.card_faces?.[1]?.image_uris;
    const colors = (card.colors ?? Array.from(new Set((card.card_faces ?? []).flatMap((f) => f.colors ?? [])))).join("");
    const manaCost = card.mana_cost ?? (card.card_faces ?? []).map((f) => f.mana_cost).filter(Boolean).join(" // ") ?? null;
    const oracleText = card.oracle_text ?? (card.card_faces ?? []).map((f) => f.oracle_text).filter(Boolean).join("\n//\n") ?? null;
    const inPool = wantsPool(card) || held.has(card.oracle_id as string);
    const rows = (await sql`
      INSERT INTO newchums.mtg_cards (
        set_id, scryfall_id, oracle_id, arena_id, name, rarity, collector_number, collector_sort, layout, colors,
        mana_cost, mana_value, type_line, oracle_text, image_normal, image_large, image_back_normal, image_back_large,
        image_status, booster, previewed_at, preview_source, preview_source_uri, in_pool
      ) VALUES (
        ${set.id}, ${card.id}, ${card.oracle_id}, ${card.arena_id ?? null}, ${card.name}, ${card.rarity}, ${card.collector_number},
        ${collectorSort(card.collector_number)}, ${card.layout ?? null}, ${colors}, ${manaCost || null}, ${card.cmc ?? null},
        ${card.type_line ?? null}, ${oracleText || null}, ${front?.normal ?? null}, ${front?.large ?? null},
        ${back?.normal ?? null}, ${back?.large ?? null}, ${card.image_status ?? null}, ${card.booster ?? null},
        ${card.preview?.previewed_at ?? null}, ${card.preview?.source ?? null}, ${card.preview?.source_uri ?? null}, ${inPool}
      )
      ON CONFLICT (set_id, oracle_id) DO UPDATE SET
        scryfall_id = EXCLUDED.scryfall_id, arena_id = COALESCE(EXCLUDED.arena_id, newchums.mtg_cards.arena_id),
        name = EXCLUDED.name, rarity = CASE WHEN now() >= ${new Date(set.lock_at).toISOString()}::timestamptz THEN newchums.mtg_cards.rarity ELSE EXCLUDED.rarity END, collector_number = EXCLUDED.collector_number,
        collector_sort = EXCLUDED.collector_sort, layout = EXCLUDED.layout, colors = EXCLUDED.colors,
        mana_cost = EXCLUDED.mana_cost, mana_value = EXCLUDED.mana_value, type_line = EXCLUDED.type_line,
        oracle_text = EXCLUDED.oracle_text, image_normal = EXCLUDED.image_normal, image_large = EXCLUDED.image_large,
        image_back_normal = EXCLUDED.image_back_normal, image_back_large = EXCLUDED.image_back_large,
        image_status = EXCLUDED.image_status, booster = EXCLUDED.booster,
        previewed_at = COALESCE(EXCLUDED.previewed_at, newchums.mtg_cards.previewed_at),
        preview_source = COALESCE(EXCLUDED.preview_source, newchums.mtg_cards.preview_source),
        preview_source_uri = COALESCE(EXCLUDED.preview_source_uri, newchums.mtg_cards.preview_source_uri),
        in_pool = CASE WHEN now() >= ${new Date(set.lock_at).toISOString()}::timestamptz THEN (newchums.mtg_cards.in_pool OR EXCLUDED.in_pool) ELSE EXCLUDED.in_pool END, updated_at = now()
      RETURNING (xmax = 0) AS inserted
    `) as { inserted: boolean }[];
    summary.kept += 1;
    if (rows[0]?.inserted) summary.inserted += 1; else summary.updated += 1;
  }

  // Retractions and renumbered previews: a card the complete sync didn't see
  // leaves the pool, so it can't be picked or counted against the ingest's
  // match check. Only before the lock, when the pool is still allowed to move.
  if (byOracle.size > 0 && beforeLock && !summary.poolHeld) {
    const dropped = (await sql`
      UPDATE newchums.mtg_cards SET in_pool = false, updated_at = now()
      WHERE set_id = ${set.id} AND in_pool = true AND oracle_id::text <> ALL(${Array.from(byOracle.keys())}::text[])
      RETURNING id
    `) as { id: string }[];
    if (dropped.length > 0) summary.notes.push(`${dropped.length} card${dropped.length === 1 ? "" : "s"} Scryfall no longer lists left the pool`);
  }
  return summary;
}

// ── Picks (Batch 2) ──────────────────────────────────────────────────────────

/** Receipts note limit, in characters (spec 10.3). */
export const MTG_NOTE_MAX = 140;
/** Picks per rarity; four rarities make a twenty-card entry. */
export const MTG_SLOTS_PER_RARITY = 5;

/**
 * Whether entries can change right now. Picks open when previews start,
 * earlier than the spec's full-gallery date, so a group can start arguing
 * as cards are revealed; a pick whose card later leaves the pool is dropped
 * with a notice. They close at the lock, and a set that is no longer active
 * never accepts changes.
 */
export function mtgPicksOpen(
  // The Neon driver hands timestamptz columns back as Date objects, and
  // tests pass ISO strings, so accept both.
  set: { status: string; lock_at: string | Date; previews_start_at: string | Date | null; picks_open_at: string | Date | null },
  now: Date = new Date(),
): boolean {
  if (set.status !== "active") return false;
  const t = now.getTime();
  if (t >= new Date(set.lock_at).getTime()) return false;
  const starts = [set.previews_start_at, set.picks_open_at]
    .map((v) => (v ? new Date(v).getTime() : Number.NaN))
    .filter((ms) => Number.isFinite(ms));
  return starts.length === 0 || t >= Math.min(...starts);
}

export type ValidatedPick = { rarity: MtgRarity; slot: number; cardId: string; note: string | null };
export type EntryValidation = { ok: true; picks: ValidatedPick[] } | { ok: false; message: string };

/**
 * Normalise a Receipts note: control characters become spaces, runs of
 * whitespace collapse, and an empty note is null. Returns undefined when the
 * value is not text at all, so the caller can reject it.
 */
export function cleanPickNote(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Validate a full-replace entry against the set's pool (spec 12.6): at most
 * five picks per rarity, slots 1 to 5 and unique within a rarity, every card
 * in the pool at the rarity it is listed under, no card twice, and notes of
 * at most 140 characters. `pool` maps card id to rarity for cards that are in
 * the pool and not voided.
 */
export function validateEntryPicks(input: unknown, pool: Map<string, MtgRarity>): EntryValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "Picks must be grouped by rarity" };
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(MTG_RARITIES as readonly string[]).includes(key)) return { ok: false, message: `Unknown rarity "${key}"` };
  }
  const picks: ValidatedPick[] = [];
  const seenCards = new Set<string>();
  for (const rarity of MTG_RARITIES) {
    const list = record[rarity];
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list)) return { ok: false, message: `The ${rarity} picks must be a list` };
    if (list.length > MTG_SLOTS_PER_RARITY) return { ok: false, message: `At most ${MTG_SLOTS_PER_RARITY} ${rarity} picks` };
    const seenSlots = new Set<number>();
    for (const item of list) {
      if (!item || typeof item !== "object") return { ok: false, message: "Each pick needs a card and a slot" };
      const { cardId, slot, note } = item as Record<string, unknown>;
      if (typeof cardId !== "string" || cardId.length === 0) return { ok: false, message: "Each pick needs a card" };
      if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 1 || slot > MTG_SLOTS_PER_RARITY) {
        return { ok: false, message: `Slots run from 1 to ${MTG_SLOTS_PER_RARITY}` };
      }
      if (seenSlots.has(slot)) return { ok: false, message: `Two ${rarity} picks share slot ${slot}` };
      seenSlots.add(slot);
      const cardRarity = pool.get(cardId);
      if (!cardRarity) return { ok: false, message: "One of those cards is no longer in the pool" };
      if (cardRarity !== rarity) return { ok: false, message: `That card is a ${cardRarity}, not a ${rarity}` };
      if (seenCards.has(cardId)) return { ok: false, message: "A card can only be picked once" };
      seenCards.add(cardId);
      const cleaned = cleanPickNote(note);
      if (cleaned === undefined) return { ok: false, message: "Receipts notes must be text" };
      // Count code points, the way Postgres char_length does.
      if (cleaned !== null && [...cleaned].length > MTG_NOTE_MAX) {
        return { ok: false, message: `Receipts notes are ${MTG_NOTE_MAX} characters at most` };
      }
      picks.push({ rarity, slot, cardId, note: cleaned });
    }
  }
  const order = (r: MtgRarity) => MTG_RARITIES.indexOf(r);
  picks.sort((a, b) => order(a.rarity) - order(b.rarity) || a.slot - b.slot);
  return { ok: true, picks };
}

// ── Emails and calendar (Batch 3) ────────────────────────────────────────────

const EASTERN = "America/New_York";

function easternParts(at: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Minutes the Eastern clock is offset from UTC at an instant (-240 in EDT). */
function easternOffsetMinutes(at: Date): number {
  const p = easternParts(at);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((wallAsUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant for a wall-clock time in New York. Two passes settle the
 *  offset on a daylight-saving changeover day. */
export function easternToUtc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall;
  for (let i = 0; i < 2; i++) guess = wall - easternOffsetMinutes(new Date(guess)) * 60000;
  return new Date(guess);
}

/** When the lock warning goes out: 10:00 AM ET on the calendar day before
 *  the lock, in Eastern terms (spec section 8). */
export function mtgLockWarningAt(lockAt: string | Date): Date {
  const p = easternParts(new Date(lockAt));
  const previous = new Date(Date.UTC(p.year, p.month - 1, p.day) - 86400000);
  return easternToUtc(previous.getUTCFullYear(), previous.getUTCMonth() + 1, previous.getUTCDate(), 10, 0);
}

/** The Eastern calendar day of an instant as YYYY-MM-DD, for comparing days
 *  the way players in New York would. */
export function easternDateKey(at: string | Date): string {
  const p = easternParts(new Date(at));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "Monday, September 28 at 11:59 PM ET" for emails, which cannot know the
 *  reader's time zone. */
export function formatEasternLong(at: string | Date): string {
  const d = new Date(at);
  const date = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, weekday: "long", month: "long", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, hour: "numeric", minute: "2-digit" }).format(d);
  return `${date} at ${time} ET`;
}

/** "Mon, Sep 28, 11:59 PM ET" for compact date lists. */
export function formatEasternShort(at: string | Date): string {
  const d = new Date(at);
  return `${new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d)} ET`;
}

const BACKSLASH = String.fromCharCode(92);

/** RFC 5545 text escaping: backslash, semicolon, comma and newlines. */
export function escapeIcsText(text: string): string {
  return text
    .split(BACKSLASH).join(BACKSLASH + BACKSLASH)
    .split(";").join(BACKSLASH + ";")
    .split(",").join(BACKSLASH + ",")
    .replace(/\r?\n/g, BACKSLASH + "n");
}

/** Fold a content line at 75 octets, continuation lines starting with a
 *  space, never splitting a multi-byte character. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) { out.push(current); current = ""; bytes = 0; }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

export type IcsEvent = {
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description: string;
  url: string;
  /** Adds a reminder this many minutes before the start. */
  alarmMinutesBefore?: number;
};

/** A one-event calendar file (the "Add to calendar" links, spec 4.2). */
export function buildIcsEvent(ev: IcsEvent, now: Date = new Date()): string {
  const end = new Date(ev.start.getTime() + ev.durationMinutes * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NewChums//MTG Card Evaluation Challenge//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(ev.start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${escapeIcsText(ev.summary)}`,
    `DESCRIPTION:${escapeIcsText(ev.description)}`,
    `URL:${ev.url}`,
  ];
  if (ev.alarmMinutesBefore && ev.alarmMinutesBefore > 0) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeIcsText(ev.summary)}`, `TRIGGER:-PT${Math.round(ev.alarmMinutesBefore)}M`, "END:VALARM");
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}


// ── Lock, Group Mind and entry badges (Batch 4) ──────────────────────────────

export type MtgBadgeTier = "common" | "uncommon" | "rare" | "mythic" | "shame";

/** Badge definitions (spec section 7, where `number` comes from). The
 *  description is the fallback reason; `badgeDescription` writes the real one
 *  from what the award remembers. */
export const MTG_BADGES: Record<string, { number: number; name: string; tier: MtgBadgeTier; description: string }> = {
  champion: { number: 1, name: "Champion", tier: "mythic", description: "Finished first in the group." },
  // Tiers recalibrated in Version 18: every group hands out these honors, so as
  // Rares they gave most players a Rare, where spec 7.6 expects one in ten.
  runner_up: { number: 2, name: "Runner-Up", tier: "uncommon", description: "Finished second in the group." },
  third_place: { number: 3, name: "Third Place", tier: "common", description: "Finished third in the group." },
  common_sense: { number: 4, name: "Common Sense", tier: "uncommon", description: "Had the group's highest commons subtotal." },
  uncommon_knowledge: { number: 5, name: "Uncommon Knowledge", tier: "uncommon", description: "Had the group's highest uncommons subtotal." },
  rare_insight: { number: 6, name: "Rare Insight", tier: "uncommon", description: "Had the group's highest rares subtotal." },
  mythic_vision: { number: 7, name: "Mythic Vision", tier: "uncommon", description: "Had the group's highest mythics subtotal." },
  pick_of_the_season: { number: 8, name: "Pick of the Season", tier: "uncommon", description: "Made the pick that earned the most points in the group." },
  comeback_kid: { number: 9, name: "Comeback Kid", tier: "uncommon", description: "Made the group's biggest climb from the first standings, at least two places." },
  king_of_the_hill: { number: 10, name: "King of the Hill", tier: "uncommon", description: "Spent the most days in first place in the group." },
  contrarian: { number: 11, name: "Contrarian", tier: "uncommon", description: "Made the picks that match the Group Mind least." },
  hive_mind: { number: 12, name: "Hive Mind", tier: "common", description: "Made the picks that match the Group Mind most." },
  photo_finish: { number: 13, name: "Photo Finish", tier: "uncommon", description: "Finished closer on points to the player one place away than anyone else in the group." },
  rollercoaster: { number: 14, name: "Rollercoaster", tier: "common", description: "Moved the most places in the group across the daily standings, up and down." },
  early_bird: { number: 15, name: "Early Bird", tier: "common", description: "First in the group to complete all 20 picks." },
  clean_sweep: { number: 16, name: "Clean Sweep", tier: "mythic", description: "The five picks at a rarity finished as its top five." },
  beat_the_crowd: { number: 17, name: "Beat the Crowd", tier: "mythic", description: "Finished above the group's Group Mind." },
  wire_to_wire: { number: 18, name: "Wire to Wire", tier: "mythic", description: "First in the group on every day of standings." },
  perfect_order: { number: 19, name: "Perfect Order", tier: "rare", description: "The five picks at a rarity finished in the order they were ranked." },
  oracle: { number: 20, name: "Oracle", tier: "rare", description: "Finished in the top 5% of the Everyone board." },
  sleeper_agent: { number: 21, name: "Sleeper Agent", tier: "uncommon", description: "Picked a card that finished in the top 10 though drafters took it late." },
  told_you_so: { number: 22, name: "Told You So", tier: "rare", description: "A pick with a Receipts note, left out of the Group Mind, finished in the top five." },
  called_it: { number: 23, name: "Called It", tier: "uncommon", description: "A #1 pick finished #1 at its rarity." },
  sniper: { number: 24, name: "Sniper", tier: "uncommon", description: "All five picks at a rarity finished in its top 10." },
  grand_slam: { number: 25, name: "Grand Slam", tier: "uncommon", description: "At every rarity, a pick finished in the top five." },
  bomb_squad: { number: 26, name: "Bomb Squad", tier: "uncommon", description: "Picked both the #1 rare and the #1 mythic." },
  common_denominator: { number: 27, name: "Common Denominator", tier: "uncommon", description: "Picked the #1 common." },
  lone_wolf: { number: 28, name: "Lone Wolf", tier: "uncommon", description: "The only player in the group to pick a card that finished in the top five." },
  sharp_eye: { number: 29, name: "Sharp Eye", tier: "uncommon", description: "Finished in the top 25% of the Everyone board." },
  bullseye: { number: 30, name: "Bullseye", tier: "common", description: "A pick finished at exactly the rank it was given." },
  well_rounded: { number: 31, name: "Well-Rounded", tier: "common", description: "At every rarity, a pick finished in the top 10." },
  bomb_detector: { number: 32, name: "Bomb Detector", tier: "common", description: "Picked the #1 rare or the #1 mythic." },
  on_the_record: { number: 33, name: "On the Record", tier: "common", description: "Made all 20 picks before the lock." },
  locked_and_loaded: { number: 34, name: "Locked and Loaded", tier: "common", description: "Had a complete entry at least seven days before the lock." },
  buzzer_beater: { number: 35, name: "Buzzer Beater", tier: "common", description: "Made a last change in the final hour before the lock." },
  receipts_on_file: { number: 36, name: "Receipts on File", tier: "common", description: "Wrote a Receipts note on at least five picks." },
  rainbow: { number: 37, name: "Rainbow", tier: "common", description: "Picked at least one card of each of the five colors." },
  loyalist: { number: 38, name: "Loyalist", tier: "common", description: "At least 10 of 20 picks share a color." },
  gold_rush: { number: 39, name: "Gold Rush", tier: "uncommon", description: "Picked at least five multicolored cards." },
  artificer: { number: 40, name: "Artificer", tier: "uncommon", description: "Picked at least three colorless cards." },
  wooden_spoon: { number: 41, name: "Wooden Spoon", tier: "shame", description: "Finished last in the group." },
  whiff_of_the_season: { number: 42, name: "Whiff of the Season", tier: "shame", description: "A #1 pick had the lowest Card Score of every #1 pick in the group." },
  bust: { number: 43, name: "Bust", tier: "shame", description: "A #1 pick finished in the bottom quarter of its rarity." },
  rock_bottom: { number: 44, name: "Rock Bottom", tier: "shame", description: "A pick finished dead last at its rarity." },
  eats_words: { number: 45, name: "Eats Words", tier: "shame", description: "A pick with a Receipts note finished in the bottom quarter of its rarity." },
  monkey_business: { number: 46, name: "Monkey Business", tier: "shame", description: "Finished below the 1,000 points random picks would score." },
};

const TIER_RANK: Record<MtgBadgeTier, number> = { mythic: 4, rare: 3, uncommon: 2, common: 1, shame: 0 };

/** Best first: the higher tier, then the spec's badge number. */
export function compareBadges(a: string, b: string): number {
  const x = MTG_BADGES[a];
  const y = MTG_BADGES[b];
  return TIER_RANK[y?.tier ?? "common"] - TIER_RANK[x?.tier ?? "common"] || (x?.number ?? 999) - (y?.number ?? 999);
}

const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

/** The badge's display name, which for Loyalist names the color. */
export function badgeLabel(code: string, detail: Record<string, unknown> | null | undefined): string {
  const base = MTG_BADGES[code]?.name ?? code;
  if (code === "loyalist" && typeof detail?.colorName === "string") return `${detail.colorName} Loyalist`;
  return base;
}

/** "1st", "2nd", "11th", "23rd". */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
}

const RARITY_PLURAL_LOWER: Record<MtgRarity, string> = { common: "commons", uncommon: "uncommons", rare: "rares", mythic: "mythics" };

type BadgeCardDetail = { name: string; rarity: MtgRarity; rank: number | null; ranked: number | null; points: number | null; score: number | null };

const detailNumber = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** What random picks average (spec 6.3), the line Monkey Business falls below. */
const MTG_RANDOM_POINTS = 1000;
const isRarity = (v: unknown): v is MtgRarity => typeof v === "string" && (MTG_RARITIES as readonly string[]).includes(v);

/** The cards a season badge remembers, whether it keeps a list or one card. */
function detailCards(detail: Record<string, unknown>): BadgeCardDetail[] {
  const raw = Array.isArray(detail.cards) ? detail.cards : detail.card && typeof detail.card === "object" ? [detail.card] : [];
  return raw.flatMap((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    if (typeof o.name !== "string" || !isRarity(o.rarity)) return [];
    return [{ name: o.name, rarity: o.rarity, rank: detailNumber(o.rank), ranked: detailNumber(o.ranked), points: detailNumber(o.points), score: detailNumber(o.score) }];
  });
}

const wholePoints = (n: number) => Math.round(n).toLocaleString("en-US");
/** Two point totals at the fewest decimals (up to two) that still tell them apart. */
function pointsPair(a: number, b: number): [string, string] {
  for (const digits of [0, 1, 2]) {
    const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    if (fmt(a) !== fmt(b) || digits === 2) return [fmt(a), fmt(b)];
  }
  return [wholePoints(a), wholePoints(b)];
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Why the player earned a badge, or is on track for it (`onTrack`, present
 * tense), from what the award remembers. Written without a subject, since
 * it's read on other players' pages too. Falls back to the catalogue's line
 * when the detail is missing something.
 */
export function badgeDescription(code: string, detail: Record<string, unknown> | null | undefined, onTrack = false): string {
  const d = detail ?? {};
  const fallback = MTG_BADGES[code]?.description ?? "";
  const when = (earned: string, now: string) => (onTrack ? now : earned);
  const num = (key: string) => detailNumber(d[key]);
  const rarity = isRarity(d.rarity) ? d.rarity : null;
  const cards = detailCards(d);
  type RankedDetail = BadgeCardDetail & { rank: number; ranked: number };
  const rankedCards = cards.filter((c): c is RankedDetail => c.rank !== null && c.ranked !== null);
  // One clause per card, the first three and a count for the rest.
  const clauses = (write: (c: RankedDetail) => string) => {
    if (rankedCards.length === 0) return null;
    const shown = rankedCards.slice(0, 3).map(write).join("; ");
    return rankedCards.length > 3 ? `${shown}; and ${rankedCards.length - 3} more` : shown;
  };
  // A lead-in, then the cards: "Dead last right now: Card, 40th of 40 commons."
  const cardList = (earned: string, now: string) => {
    const list = clauses((c) => `${c.name}, ${ordinal(c.rank)} of ${c.ranked} ${among(c)}`);
    return list ? `${when(earned, now)}: ${list}.` : null;
  };
  const among = (c: { rarity: MtgRarity }) => RARITY_PLURAL_LOWER[c.rarity];
  let text: string | null = null;
  switch (code) {
    case "loyalist":
      if (typeof d.colorName === "string") text = `At least 10 of 20 picks are ${d.colorName.toLowerCase()}.`;
      break;
    case "champion":
    case "runner_up":
    case "third_place":
    case "wooden_spoon": {
      const players = num("players");
      const place = ({ champion: "first", runner_up: "second", third_place: "third", wooden_spoon: "last" } as Record<string, string>)[code];
      if (players !== null) text = when(`Finished ${place} of ${players} in the group.`, `${place[0].toUpperCase()}${place.slice(1)} of ${players} in the group right now.`);
      break;
    }
    case "common_sense":
    case "uncommon_knowledge":
    case "rare_insight":
    case "mythic_vision": {
      const points = num("points");
      if (rarity && points !== null) text = when(`Had the group's highest ${RARITY_PLURAL_LOWER[rarity]} subtotal, ${wholePoints(points)} points.`, `The group's highest ${RARITY_PLURAL_LOWER[rarity]} subtotal right now, ${wholePoints(points)} points.`);
      break;
    }
    case "pick_of_the_season": {
      const scored = cards.filter((c) => c.points !== null);
      const list = scored.slice(0, 3).map((c) => when(`${c.name} earned ${wholePoints(c.points as number)} points`, `${c.name} is earning ${wholePoints(c.points as number)} points`));
      if (scored.length > 3) list.push(`and ${scored.length - 3} more`);
      if (list.length > 0) text = `${list.join("; ")}, the most of any pick in the group.`;
      break;
    }
    case "comeback_kid": {
      const from = num("from");
      const to = num("to");
      if (from !== null && to !== null) text = `${when("Climbed", "Up")} from ${ordinal(from)} in the first standings to ${ordinal(to)}, the biggest climb in the group.`;
      break;
    }
    case "king_of_the_hill": {
      const days = num("days");
      if (days !== null) text = when(`Spent ${plural(days, "day")} in first place, the most in the group.`, `${plural(days, "day")} in first place so far, the most in the group.`);
      break;
    }
    case "contrarian":
    case "hive_mind": {
      const shared = num("shared");
      if (shared === null) break;
      const count = code === "contrarian" && shared > 0 ? `Only ${shared}` : shared === 0 ? "None" : String(shared);
      text = `${count} of 20 picks ${when("matched", "match")} the Group Mind, the ${code === "contrarian" ? "fewest" : "most"} in the group.`;
      break;
    }
    case "photo_finish": {
      const gap = num("gap");
      if (gap === null) break;
      if (gap === 0) text = when("Finished level on points with the player one place away.", "Level on points with the player one place away right now.");
      else {
        const size = gap < 0.1 ? "under 0.1" : gap.toFixed(1);
        text = when(`Finished ${size} points from the player one place away, the closest gap in the group.`, `${size[0].toUpperCase()}${size.slice(1)} points from the player one place away, the closest gap in the group right now.`);
      }
      break;
    }
    case "rollercoaster": {
      const places = num("places");
      if (places !== null) text = when(`Moved ${plural(places, "place")} up and down across the daily standings, the most in the group.`, `${plural(places, "place")} moved up and down so far, the most in the group.`);
      break;
    }
    case "whiff_of_the_season": {
      const scored = cards.filter((c) => c.score !== null);
      const list = scored.slice(0, 3).map((c) => when(`${c.name}, a #1 ${c.rarity} pick, finished with a Card Score of ${Math.round(c.score as number)}`, `${c.name}, a #1 ${c.rarity} pick, has a Card Score of ${Math.round(c.score as number)}`));
      if (scored.length > 3) list.push(`and ${scored.length - 3} more`);
      if (list.length > 0) text = `${list.join("; ")}, the lowest of any #1 pick in the group.`;
      break;
    }
    case "beat_the_crowd":
    case "monkey_business": {
      const points = num("points");
      const mind = num("mind");
      if (points === null) break;
      if (code === "monkey_business") {
        // Never "1,000 points, below the 1,000": show the decimals that keep it under.
        const [shown] = pointsPair(points, MTG_RANDOM_POINTS);
        text = when(`Finished with ${shown} points, below the 1,000 points random picks would score.`, `${shown} points right now, below the 1,000 points random picks would score.`);
      } else if (mind !== null) {
        const [mine, theirs] = pointsPair(points, mind);
        text = when(`Finished with ${mine} points, above the Group Mind's ${theirs}.`, `${mine} points right now, above the Group Mind's ${theirs}.`);
      }
      break;
    }
    case "wire_to_wire": {
      const days = num("days");
      if (days === null) break;
      text = days === 1
        ? when("First in the group on the only day of standings.", "First in the group on the only day of standings so far.")
        : when(`First in the group on all ${days} days of standings.`, `First in the group on all ${days} days of standings so far.`);
      break;
    }
    case "told_you_so":
      text = cardList("Picked with a Receipts note, left out of the Group Mind, and finished in the top five", "Picked with a Receipts note, left out of the Group Mind, and in the top five right now");
      break;
    case "lone_wolf":
      text = cardList("Picked by no one else in the group, and finished in the top five", "Picked by no one else in the group, and in the top five right now");
      break;
    case "clean_sweep":
      if (rarity) text = when(`The five ${rarity} picks finished as the top five ${RARITY_PLURAL_LOWER[rarity]}.`, `The five ${rarity} picks are the top five ${RARITY_PLURAL_LOWER[rarity]} right now.`);
      break;
    case "perfect_order": {
      const ranks = Array.isArray(d.ranks) ? d.ranks.map(detailNumber).filter((r): r is number => r !== null) : [];
      if (rarity && ranks.length > 0) text = `The five ${rarity} picks ${when("finished", "are")} in the order they were ranked${onTrack ? " right now" : ""}: ${ranks.map(ordinal).join(", ")}.`;
      break;
    }
    case "sniper":
      if (rarity) text = `All five ${rarity} picks ${when("finished", "are")} in the top 10 ${RARITY_PLURAL_LOWER[rarity]}${onTrack ? " right now" : ""}.`;
      break;
    case "grand_slam":
    case "well_rounded":
      text = `At every rarity, a pick ${when("finished", "is")} in the top ${code === "grand_slam" ? "five" : "10"}${onTrack ? " right now" : ""}.`;
      break;
    case "oracle":
    case "sharp_eye": {
      const rank = num("rank");
      const players = num("players");
      const share = code === "oracle" ? "5%" : "25%";
      if (rank !== null && players !== null) text = when(`Finished ${ordinal(rank)} of ${players} on the Everyone board, in the top ${share}.`, `${ordinal(rank)} of ${players} on the Everyone board right now, in the top ${share}.`);
      break;
    }
    case "called_it": {
      const list = clauses((c) => when(`${c.name}, the #1 ${c.rarity} pick, finished #1 among ${among(c)}`, `${c.name}, the #1 ${c.rarity} pick, is #1 among ${among(c)} right now`));
      if (list) text = `${list}.`;
      break;
    }
    case "bust": {
      const list = clauses((c) => when(`${c.name}, the #1 ${c.rarity} pick, finished ${ordinal(c.rank)} of ${c.ranked} ${among(c)}, in the bottom quarter`, `${c.name}, the #1 ${c.rarity} pick, is ${ordinal(c.rank)} of ${c.ranked} ${among(c)} right now, in the bottom quarter`));
      if (list) text = `${list}.`;
      break;
    }
    case "bomb_squad":
    case "bomb_detector":
    case "common_denominator": {
      const list = cards.slice(0, 2).map((c) => `${c.name}, the #1 ${c.rarity}`);
      if (list.length > 0) text = `Picked ${list.join(", and ")}${onTrack ? " right now" : ""}.`;
      break;
    }
    case "sleeper_agent":
      text = cardList("Taken late by drafters, and finished in the top 10", "Taken late by drafters, and in the top 10 right now");
      break;
    case "bullseye":
      text = cardList("Finished exactly where they were ranked", "Exactly where they were ranked right now");
      break;
    case "rock_bottom":
      text = cardList("Finished dead last", "Dead last right now");
      break;
    case "eats_words":
      text = cardList("Picked with a Receipts note, and finished in the bottom quarter", "Picked with a Receipts note, and in the bottom quarter right now");
      break;
  }
  return text ?? fallback;
}

/** Colour letters on a card, whatever separator the sync stored them with. */
export function colorLetters(colors: string | null | undefined): string[] {
  return Array.from(new Set((colors ?? "").toUpperCase().match(/[WUBRG]/g) ?? []));
}

export type BadgeAward = { code: string; key: string; detail: Record<string, unknown> };

export type LockEntryInput = {
  completedAt: string | Date | null;
  updatedAt: string | Date;
  picks: Array<{ rarity: MtgRarity; slot: number; note: string | null; colors: string | null }>;
};

/**
 * Entry badges awarded at the lock (spec 7.4). A multicolored card counts
 * toward each of its colors; Loyalist goes to the most-picked color, with
 * ties settled in WUBRG order.
 */
export function computeEntryBadges(entry: LockEntryInput, lockAt: string | Date): BadgeAward[] {
  const lock = new Date(lockAt).getTime();
  const picks = entry.picks;
  const full = MTG_RARITIES.length * MTG_SLOTS_PER_RARITY;
  const out: BadgeAward[] = [];
  if (picks.length === 0) return out;
  const complete = picks.length >= full;
  if (complete) out.push({ code: "on_the_record", key: "", detail: {} });
  const completedMs = entry.completedAt ? new Date(entry.completedAt).getTime() : null;
  if (complete && completedMs !== null && completedMs <= lock - 7 * 86400000) out.push({ code: "locked_and_loaded", key: "", detail: {} });
  const updatedMs = new Date(entry.updatedAt).getTime();
  if (updatedMs >= lock - 3600000 && updatedMs < lock) out.push({ code: "buzzer_beater", key: "", detail: {} });
  const notes = picks.filter((p) => (p.note ?? "").trim().length > 0).length;
  if (notes >= 5) out.push({ code: "receipts_on_file", key: "", detail: { notes } });

  const perColor: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let multicolored = 0;
  let colorless = 0;
  for (const p of picks) {
    const letters = colorLetters(p.colors);
    if (letters.length === 0) colorless += 1;
    if (letters.length > 1) multicolored += 1;
    for (const l of letters) perColor[l] += 1;
  }
  // Rainbow and Loyalist are about "your 20 picks" (spec 7.4), so they need a complete entry.
  if (complete && Object.values(perColor).every((n) => n > 0)) out.push({ code: "rainbow", key: "", detail: {} });
  let best = "W";
  for (const l of "WUBRG") if (perColor[l] > perColor[best]) best = l;
  if (complete && perColor[best] >= 10) {
    out.push({ code: "loyalist", key: best.toLowerCase(), detail: { color: best, colorName: COLOR_NAMES[best], count: perColor[best] } });
  }
  if (multicolored >= 5) out.push({ code: "gold_rush", key: "", detail: { count: multicolored } });
  if (colorless >= 3) out.push({ code: "artificer", key: "", detail: { count: colorless } });
  return out;
}

export type MindPickInput = { userId: string; rarity: MtgRarity; slot: number; cardId: string };
export type MindRow = { rarity: MtgRarity; slot: number; cardId: string; votes: number; pickers: number };

/**
 * The Group Mind (spec 10.4): each #1 pick is worth 5 votes down to 1 for a
 * #5, and the five cards with the most votes at each rarity make the
 * consensus. Ties go to more #1 votes, then more players, then collector
 * order (`order` maps card id to collector number), then card id, so the
 * result never depends on query order.
 */
export function computeGroupMind(picks: MindPickInput[], order: Map<string, number> = new Map()): MindRow[] {
  const tally = new Map<string, { rarity: MtgRarity; cardId: string; votes: number; firsts: number; users: Set<string> }>();
  for (const p of picks) {
    if (!Number.isInteger(p.slot) || p.slot < 1 || p.slot > MTG_SLOTS_PER_RARITY) continue;
    const key = `${p.rarity}|${p.cardId}`;
    const t = tally.get(key) ?? { rarity: p.rarity, cardId: p.cardId, votes: 0, firsts: 0, users: new Set<string>() };
    t.votes += MTG_SLOTS_PER_RARITY + 1 - p.slot;
    if (p.slot === 1) t.firsts += 1;
    t.users.add(p.userId);
    tally.set(key, t);
  }
  const rows: MindRow[] = [];
  for (const rarity of MTG_RARITIES) {
    const ranked = [...tally.values()]
      .filter((t) => t.rarity === rarity)
      .sort((a, b) =>
        b.votes - a.votes
        || b.firsts - a.firsts
        || b.users.size - a.users.size
        || (order.get(a.cardId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.cardId) ?? Number.MAX_SAFE_INTEGER)
        || a.cardId.localeCompare(b.cardId));
    ranked.slice(0, MTG_SLOTS_PER_RARITY).forEach((t, i) => rows.push({ rarity, slot: i + 1, cardId: t.cardId, votes: t.votes, pickers: t.users.size }));
  }
  return rows;
}

/**
 * Early Bird (spec 7.2, #15): the first member to complete all 20 picks, in
 * a group with at least three players with entries (the group-honor rule in
 * 7.1). Everyone tied for first gets it.
 */
export function earlyBirdWinners(members: Array<{ userId: string; pickCount: number; completedAt: string | Date | null }>): string[] {
  const full = MTG_RARITIES.length * MTG_SLOTS_PER_RARITY;
  if (members.filter((m) => m.pickCount > 0).length < 3) return [];
  const complete = members.filter((m) => m.pickCount >= full && m.completedAt);
  if (complete.length === 0) return [];
  const first = Math.min(...complete.map((m) => new Date(m.completedAt as string | Date).getTime()));
  return complete.filter((m) => new Date(m.completedAt as string | Date).getTime() === first).map((m) => m.userId);
}

/** 9:00 AM Eastern on the Eastern calendar day after an instant. */
export function mtgMorningAfter(at: string | Date, hour = 9): Date {
  const p = easternParts(new Date(at));
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day) + 86400000);
  return easternToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), hour, 0);
}

/** When the picks-revealed email goes out (spec section 8, email 3): the
 *  first 9:00 AM ET at least an hour after the lock, so an 11:59 PM lock and
 *  a midnight lock both send that morning. */
export function mtgRevealedEmailAt(lockAt: string | Date): Date {
  const earliest = new Date(new Date(lockAt).getTime() + 3600000);
  const p = easternParts(earliest);
  const sameDay = easternToUtc(p.year, p.month, p.day, 9, 0);
  return sameDay.getTime() >= earliest.getTime() ? sameDay : mtgMorningAfter(earliest);
}

/** "Wednesday, September 30" in Eastern time. */
export function formatEasternDate(at: string | Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, weekday: "long", month: "long", day: "numeric" }).format(new Date(at));
}

/** How long past `final_at` the finalize job waits for the final day's
 *  standings before ending the season with the latest day there is: through
 *  the next day's attempts for them, the last at 8 PM ET (spec 9.1). */
export const MTG_FINALIZE_GRACE_MS = 36 * 3600000;

/**
 * Whether the finalize job should end the season now (spec 12.3): once the
 * final day has begun and its standings are published, or, if 17Lands never
 * delivered them, once the grace period has passed, with the latest standings.
 * Never without any standings at all, and never a season an admin reopened.
 */
export function mtgFinalizeDue(
  set: { status: string; final_at: string | Date; reopened_at?: string | Date | null },
  latestSnapshotDate: string | null,
  now: Date = new Date(),
): boolean {
  if (set.status !== "active" || set.reopened_at || !latestSnapshotDate) return false;
  const finalMs = new Date(set.final_at).getTime();
  if (now.getTime() < finalMs) return false;
  return latestSnapshotDate >= easternDateKey(set.final_at) || now.getTime() >= finalMs + MTG_FINALIZE_GRACE_MS;
}

/** When the season results email goes out (spec section 8, email 5): 10:00
 *  AM ET on the final day, or when the season is finalized if that's later. */
export function mtgResultsEmailAt(set: { final_at: string | Date; finalized_at?: string | Date | null }): Date {
  const p = easternParts(new Date(set.final_at));
  const tenAm = easternToUtc(p.year, p.month, p.day, 10, 0);
  const finalized = set.finalized_at ? new Date(set.finalized_at).getTime() : 0;
  return new Date(Math.max(tenAm.getTime(), finalized));
}

/** The earliest moment a season's picks open: previews or the picks date, whichever comes first. */
export function mtgPicksOpenAt(set: { previews_start_at: string | Date | null; picks_open_at: string | Date | null }): Date | null {
  const starts = [set.previews_start_at, set.picks_open_at].map((v) => (v ? new Date(v).getTime() : Number.NaN)).filter((ms) => Number.isFinite(ms));
  return starts.length > 0 ? new Date(Math.min(...starts)) : null;
}

export type FunFactPlayer = { name: string; picks: Array<{ rarity: MtgRarity; slot: number; cardId: string; cardName: string }> };

/**
 * One fun fact for a group's reveal email (spec section 8, email 3): the
 * most-picked mythic when at least two players share it, otherwise the
 * boldest #1, a #1 pick nobody else in the group picked at all (mythics
 * first). Null when there is nothing worth saying.
 */
export function revealFunFact(players: FunFactPlayer[]): string | null {
  const withPicks = players.filter((p) => p.picks.length > 0);
  if (withPicks.length === 0) return null;
  const mythicCounts = new Map<string, { name: string; count: number }>();
  const pickers = new Map<string, number>();
  for (const player of withPicks) {
    const seen = new Set<string>();
    for (const pick of player.picks) {
      const key = `${pick.rarity}|${pick.cardId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pickers.set(key, (pickers.get(key) ?? 0) + 1);
      if (pick.rarity === "mythic") {
        const m = mythicCounts.get(pick.cardId) ?? { name: pick.cardName, count: 0 };
        m.count += 1;
        mythicCounts.set(pick.cardId, m);
      }
    }
  }
  const topMythic = [...mythicCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
  if (topMythic && topMythic.count >= 2) {
    return `Most-picked mythic: ${topMythic.name}, picked by ${topMythic.count} of ${withPicks.length} players.`;
  }
  for (const rarity of ["mythic", "rare", "uncommon", "common"] as MtgRarity[]) {
    for (const player of withPicks) {
      const first = player.picks.find((p) => p.rarity === rarity && p.slot === 1);
      if (first && (pickers.get(`${rarity}|${first.cardId}`) ?? 0) === 1 && withPicks.length > 1) {
        return `Boldest #1: ${player.name} put ${first.cardName} at #1 among ${RARITY_PLURAL_LOWER[rarity]}, and nobody else picked it.`;
      }
    }
  }
  return null;
}
