/**
 * MTG Prediction Challenge (docs/MTG-Bets-Spec.md), shared pieces.
 *
 * Batch 1: season phases and timeline, and the Scryfall card sync. Later
 * batches add entries, the 17Lands ingest, scoring and badges here.
 */

export const MTG_SPECIALIZATION = "mtg_prediction_challenge";
export const MTG_RARITIES = ["common", "uncommon", "rare", "mythic"] as const;
export type MtgRarity = (typeof MTG_RARITIES)[number];

/** How the game presents itself, so the same headers go on every request. */
export const MTG_USER_AGENT = "NewChums/1.0 (MTG Prediction Challenge; https://newchums.com)";

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
  /** Entries that get an "Add to calendar" link. */
  calendar?: boolean;
};

/** The dates that matter to players, in order, with a status each. Weekly
 *  standings days are every Tuesday between the first standings and the
 *  final day, excluding the final week (the results email replaces it). */
export function mtgTimeline(set: MtgSetRow, now: Date = new Date()): TimelineEntry[] {
  const t = now.getTime();
  const entries: Array<Omit<TimelineEntry, "status">> = [];
  if (set.previews_start_at) {
    entries.push({
      key: "previews", label: "Previews", at: set.previews_start_at, endAt: set.gallery_complete_at ?? undefined,
      detail: "Wizards and creators reveal new cards every day. They appear in the pick screens automatically.",
    });
  }
  if (set.picks_open_at) {
    entries.push({ key: "picks_open", label: "Picks open", at: set.picks_open_at, detail: "The full card list is out. Make your five picks at each rarity." });
  }
  if (set.prerelease_start_at) {
    entries.push({
      key: "prerelease", label: "Prerelease weekend", at: set.prerelease_start_at, endAt: set.prerelease_end_at ?? undefined,
      detail: "Tabletop events at stores. No 17Lands data yet, but a good excuse to make a Plan.",
    });
  }
  entries.push({ key: "lock", label: "Picks lock", at: set.lock_at, detail: "After this moment nothing can change, and everyone's picks are revealed to the group.", calendar: true });
  if (set.arena_release_at) {
    entries.push({ key: "arena", label: "Arena launch", at: set.arena_release_at, detail: "Premier Draft opens and 17Lands starts collecting games." });
    const firstStandings = mtgMorningAfter(set.arena_release_at); // 9 AM ET the morning after
    entries.push({ key: "first_standings", label: "First standings", at: firstStandings.toISOString(), detail: "Day 1 of scoring. The first few days swing a lot." });
    // Weekly standings: Tuesdays at 10 AM ET between the first standings and the final week.
    const finalMs = new Date(set.final_at).getTime();
    let d = new Date(firstStandings);
    for (let i = 0; i < 6; i++) {
      d = new Date(d.getTime() + 86400000);
      const dow = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
      if (dow === "Tue") break;
    }
    for (let week = 0; week < 6; week++) {
      const tue = new Date(d.getTime() + week * 7 * 86400000);
      if (tue.getTime() >= finalMs - 6 * 86400000) break;
      const tenAm = new Date(tue.toISOString().slice(0, 10) + "T14:00:00Z"); // 10 AM EDT
      entries.push({ key: `weekly_${week + 1}`, label: `Weekly standings`, at: tenAm.toISOString(), detail: "Standings email with your rank, movement and best and worst picks so far." });
    }
  }
  if (set.tabletop_release_at) {
    entries.push({ key: "paper", label: "Paper release", at: set.tabletop_release_at, detail: "The set arrives in stores." });
  }
  entries.push({ key: "final", label: "Final day", at: set.final_at, detail: "The morning's standings are final. Badges are awarded and the season results go out.", calendar: true });
  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return entries.map((e) => {
    const start = new Date(e.at).getTime();
    const end = e.endAt ? new Date(e.endAt).getTime() : start + 3600000;
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

export type CardSyncSummary = { seen: number; kept: number; inserted: number; updated: number; pages: number; rawKeys: string[]; notes: string[] };

/**
 * Pull the set from Scryfall, keep one row per oracle card (lowest collector
 * number, which is the regular printing), and upsert. Never touches
 * `first_seen_at` on existing rows, never touches `voided`.
 *
 * Pool rule: a card is in the pool when its rarity is one of the four and,
 * once the gallery is complete, Scryfall flags it as a booster card. During
 * previews the booster flag is unreliable, so every previewed card of the
 * four rarities is in until the gallery date passes.
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
    const res = await fetch(url, { headers });
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

  for (const card of byOracle.values()) {
    const front = card.image_uris ?? card.card_faces?.[0]?.image_uris;
    const back = card.card_faces?.[1]?.image_uris;
    const colors = (card.colors ?? Array.from(new Set((card.card_faces ?? []).flatMap((f) => f.colors ?? [])))).join("");
    const manaCost = card.mana_cost ?? (card.card_faces ?? []).map((f) => f.mana_cost).filter(Boolean).join(" // ") ?? null;
    const oracleText = card.oracle_text ?? (card.card_faces ?? []).map((f) => f.oracle_text).filter(Boolean).join("\n//\n") ?? null;
    const inPool = galleryDone ? card.booster === true : true;
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
        name = EXCLUDED.name, rarity = EXCLUDED.rarity, collector_number = EXCLUDED.collector_number,
        collector_sort = EXCLUDED.collector_sort, layout = EXCLUDED.layout, colors = EXCLUDED.colors,
        mana_cost = EXCLUDED.mana_cost, mana_value = EXCLUDED.mana_value, type_line = EXCLUDED.type_line,
        oracle_text = EXCLUDED.oracle_text, image_normal = EXCLUDED.image_normal, image_large = EXCLUDED.image_large,
        image_back_normal = EXCLUDED.image_back_normal, image_back_large = EXCLUDED.image_back_large,
        image_status = EXCLUDED.image_status, booster = EXCLUDED.booster,
        previewed_at = COALESCE(EXCLUDED.previewed_at, newchums.mtg_cards.previewed_at),
        preview_source = COALESCE(EXCLUDED.preview_source, newchums.mtg_cards.preview_source),
        preview_source_uri = COALESCE(EXCLUDED.preview_source_uri, newchums.mtg_cards.preview_source_uri),
        in_pool = EXCLUDED.in_pool, updated_at = now()
      RETURNING (xmax = 0) AS inserted
    `) as { inserted: boolean }[];
    summary.kept += 1;
    if (rows[0]?.inserted) summary.inserted += 1; else summary.updated += 1;
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
    "PRODID:-//NewChums//MTG Prediction Challenge//EN",
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

/** Badge definitions (spec section 7, where `number` comes from). Later
 *  batches add the rest. */
export const MTG_BADGES: Record<string, { number: number; name: string; tier: MtgBadgeTier; description: string }> = {
  early_bird: { number: 15, name: "Early Bird", tier: "common", description: "First in the group to complete all 20 picks." },
  on_the_record: { number: 33, name: "On the Record", tier: "common", description: "Made all 20 picks before the lock." },
  locked_and_loaded: { number: 34, name: "Locked and Loaded", tier: "common", description: "Had a complete entry at least seven days before the lock." },
  buzzer_beater: { number: 35, name: "Buzzer Beater", tier: "common", description: "Made a last change in the final hour before the lock." },
  receipts_on_file: { number: 36, name: "Receipts on File", tier: "common", description: "Wrote a Receipts note on at least five picks." },
  rainbow: { number: 37, name: "Rainbow", tier: "common", description: "Picked at least one card of each of the five colors." },
  loyalist: { number: 38, name: "Loyalist", tier: "common", description: "At least 10 of 20 picks share a color." },
  gold_rush: { number: 39, name: "Gold Rush", tier: "uncommon", description: "Picked at least five multicolored cards." },
  artificer: { number: 40, name: "Artificer", tier: "uncommon", description: "Picked at least three colorless cards." },
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

/** Why the player earned it, naming the Loyalist color. */
export function badgeDescription(code: string, detail: Record<string, unknown> | null | undefined): string {
  if (code === "loyalist" && typeof detail?.colorName === "string") return `At least 10 of 20 picks are ${detail.colorName.toLowerCase()}.`;
  return MTG_BADGES[code]?.description ?? "";
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

export type FunFactPlayer = { name: string; picks: Array<{ rarity: MtgRarity; slot: number; cardId: string; cardName: string }> };

const RARITY_PLURAL_LOWER: Record<MtgRarity, string> = { common: "commons", uncommon: "uncommons", rare: "rares", mythic: "mythics" };

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
