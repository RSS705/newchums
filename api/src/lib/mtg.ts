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
    const firstStandings = new Date(new Date(set.arena_release_at).getTime() + 19 * 3600000); // next morning, ~9 AM ET
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
