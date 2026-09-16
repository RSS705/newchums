"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type Run = { attempted_at: string; snapshot_date: string; trigger: string; outcome: string; notes: string | null; total_games: string | number | null; matched: number | null; alerted: boolean; dry_run?: boolean };
type Snapshot = { snapshot_date: string; source: string; matched: number; pool_size: number; total_games: string | number; taken_at: string; scored_at: string };
type FeedCard = { name: string; mtgaId: number | null; rarity: string; gihGames: number };
type PoolCard = { id: string; name: string; rarity: string };
type StatsPayload = {
  runs: Run[];
  snapshots: Snapshot[];
  listsFrom: { date: string; outcome: string } | null;
  unmatchedRecords: FeedCard[];
  unmatchedCards: Array<PoolCard & { arenaId: number | null }>;
  voided: PoolCard[];
  mapped: Array<PoolCard & { stats_arena_id: number | null; stats_name: string | null }>;
};
type IngestResult = { outcome: string; reason: string | null; snapshotDate: string; matched?: number; poolSize?: number; totalGames?: number; replaced?: boolean; dryRun?: boolean };
type Body = Record<string, unknown> & { ok?: boolean; message?: string };

const OUTCOME_LABEL: Record<string, string> = { published: "Published", not_newer: "Not newer", fetch_failed: "Fetch failed", failed_validation: "Failed checks", skipped: "Not run", error: "Error" };
const FAILED = "#B91C1C";
const label = { textTransform: "uppercase", letterSpacing: "0.04em" } as const;
// Text buttons on this page sit in dense rows; keep them thumb-sized anyway.
const btn = { textTransform: "none", fontWeight: 700, minHeight: 36 } as const;
const plain = { textTransform: "none", minHeight: 36 } as const;
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// Every time on this page is Eastern: the season's schedule is written in it.
const easternTime = (iso: string) => `${ET.format(new Date(iso))} ET`;
const games = (n: string | number | null | undefined) => (n == null ? "–" : Number(n).toLocaleString("en-US"));

function describeResult(r: IngestResult): string {
  if (r.outcome === "published") {
    const what = r.dryRun ? `Dry run for ${r.snapshotDate} passed` : `Published ${r.snapshotDate}${r.replaced ? " again" : ""}`;
    return `${what}: ${r.matched} of ${r.poolSize} cards matched, ${games(r.totalGames)} games in hand`;
  }
  return `${OUTCOME_LABEL[r.outcome] ?? r.outcome}: ${r.reason ?? "no reason given"}`;
}

/**
 * The stats half of a season on MTG Seasons (spec 9.1): fetch 17Lands now,
 * paste a response copied from a browser, re-score a day, see recent
 * attempts, match pool cards the feed missed, and void or restore cards. A
 * failed check offers "Publish anyway" for that attempt only. Matching or
 * voiding re-scores every published day, because a mapping changes a card's
 * score on all of them. A dry run rehearses a fetch without publishing, and
 * naming a day retries one that has already ended.
 */
export default function AdminMtgStats({ code }: { code: string }) {
  const toast = useToast();
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [retry, setRetry] = useState<{ kind: "fetch" | "paste"; message: string; canForce: boolean } | null>(null);
  const [day, setDay] = useState("");
  const [confirmMatch, setConfirmMatch] = useState<{ cardId: string; record: FeedCard } | null>(null);
  const [pool, setPool] = useState<PoolCard[] | null>(null);
  const [poolFailed, setPoolFailed] = useState(false);
  const [voidQuery, setVoidQuery] = useState("");
  const [confirmVoid, setConfirmVoid] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/admin/mtg/sets/${code}/stats`, { auth: true });
      const body = (await res.json()) as Body & Partial<StatsPayload>;
      if (res.ok && body.ok) {
        setData(body as unknown as StatsPayload);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
    }
  }, [code]);
  useEffect(() => { load(); }, [load]);

  const call = async (key: string, path: string, init: RequestInit): Promise<Body | null> => {
    setBusy(key);
    try {
      const res = await apiFetch(path, { auth: true, ...init, headers: { "Content-Type": "application/json" } });
      const body = (await res.json()) as Body;
      if (!res.ok || !body.ok) { toast.error(body.message ?? "That didn't work"); return null; }
      return body;
    } catch {
      toast.error("That didn't work");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runIngest = async (kind: "fetch" | "paste", force: boolean, dryRun = false) => {
    setRetry(null);
    const date = day.trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast.error("Write the day as 2026-09-30"); return; }
    const path = kind === "fetch" ? `/admin/mtg/sets/${code}/ingest` : `/admin/mtg/sets/${code}/ingest/paste`;
    const payload: Record<string, unknown> = { force, ...(date ? { date } : {}), ...(dryRun ? { dryRun: true } : {}) };
    if (kind === "paste") payload.raw = paste;
    const body = await call(dryRun ? "dry" : kind, path, { method: "POST", body: JSON.stringify(payload) });
    if (body) {
      const r = body.result as IngestResult;
      if (r.outcome === "published") {
        toast.success(describeResult(r));
        if (kind === "paste" && !dryRun) { setPaste(""); setPasteOpen(false); }
      } else {
        // Only a failed check is worth forcing past. "Not newer" means the feed
        // hasn't moved, and forcing it would republish the same numbers.
        setRetry({ kind, message: describeResult(r), canForce: r.outcome === "failed_validation" && !dryRun });
      }
    }
    await load();
  };

  const rescore = async (date: string) => {
    const body = await call(`rescore:${date}`, `/admin/mtg/sets/${code}/snapshots/${date}/rescore`, { method: "POST" });
    if (body) {
      const r = body.result as { matched: number; poolSize: number };
      toast.success(`Re-scored ${date}: ${r.matched} of ${r.poolSize} cards matched`);
    }
    await load();
  };

  const rescoreAll = async (done?: string) => {
    const body = await call("rescore:all", `/admin/mtg/sets/${code}/snapshots/rescore-all`, { method: "POST" });
    if (body) {
      const r = body.result as { rescored: string[]; failed: { date: string; message: string }[] };
      const days = `${r.rescored.length} day${r.rescored.length === 1 ? "" : "s"}`;
      if (r.failed.length > 0) toast.error(`${done ? `${done} ` : ""}Re-scored ${days}; ${r.failed[0].date} couldn't be: ${r.failed[0].message}`);
      else toast.success(`${done ? `${done} ` : ""}Re-scored ${days}.`);
    }
  };

  /** Save a match or a void, then re-score every published day: a mapping or a
   *  void changes that card's score on all of them, not just the newest. */
  const applyChange = async (key: string, path: string, payload: unknown, done: string) => {
    const saved = await call(key, path, { method: "PUT", body: JSON.stringify(payload) });
    if (saved) {
      if ((data?.snapshots.length ?? 0) > 0) await rescoreAll(done);
      else toast.success(`${done} It applies to the next fetch or paste.`);
    }
    await load();
  };
  const setMatch = (cardId: string, record: FeedCard | null) =>
    applyChange(`map:${cardId}`, `/admin/mtg/cards/${cardId}/stats-match`,
      record ? (record.mtgaId ? { statsArenaId: record.mtgaId, statsName: null } : { statsArenaId: null, statsName: record.name }) : { statsArenaId: null, statsName: null },
      record ? `Matched to ${record.name}.` : "Match cleared.");
  const setVoided = async (card: PoolCard, voided: boolean) => {
    setConfirmVoid(null);
    if (voided) setVoidQuery("");
    await applyChange(`void:${card.id}`, `/admin/mtg/cards/${card.id}/voided`, { voided }, `${card.name} ${voided ? "voided" : "restored"}.`);
  };

  const loadPool = async () => {
    if (pool) return;
    setPoolFailed(false);
    try {
      const res = await apiFetch(`/mtg/sets/${code}/cards`, { auth: false });
      const body = (await res.json()) as { ok?: boolean; cards?: PoolCard[] };
      if (body.ok && body.cards) setPool(body.cards.map((c) => ({ id: c.id, name: c.name, rarity: c.rarity })));
      else setPoolFailed(true);
    } catch {
      setPoolFailed(true);
    }
  };

  if (!data) {
    return (
      <Box sx={{ mt: 2.5, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
        <Typography variant="subtitle2" fontWeight={800}>Stats from 17Lands</Typography>
        {loadFailed ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" sx={{ color: FAILED }}>Couldn&apos;t load the stats.</Typography>
            <Button size="small" variant="text" onClick={() => load()} sx={btn}>Try again</Button>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">Loading…</Typography>
        )}
      </Box>
    );
  }

  const latest = data.snapshots[0] ?? null;
  const records = [...data.unmatchedRecords].sort((a, b) => a.name.localeCompare(b.name));
  // Same-rarity records first; when the feed has none, fall back to every
  // unmatched record and say so, so a wrong-rarity match isn't made blind.
  const recordsFor = (rarity: string) => {
    const same = records.filter((r) => r.rarity === rarity);
    return same.length > 0 ? { options: same, fellBack: false } : { options: records, fellBack: true };
  };
  const q = voidQuery.trim().toLowerCase();
  const voidMatches = q.length >= 2 && pool ? pool.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6) : [];

  return (
    <Box sx={{ mt: 2.5, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
      <Typography variant="subtitle2" fontWeight={800}>Stats from 17Lands</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        Pulled at 9 and 11 AM, 1, 4 and 8 PM ET from the morning after the Arena launch through the final day. {latest ? `Latest standings: ${latest.snapshot_date}, ${latest.matched} of ${latest.pool_size} cards matched.` : "No standings yet."}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
        <Button variant="outlined" onClick={() => runIngest("fetch", false)} disabled={busy !== null} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
          {busy === "fetch" ? "Fetching…" : "Fetch stats now"}
        </Button>
        <Button variant="outlined" onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
          Paste stats
        </Button>
        <Button variant="text" onClick={() => runIngest("fetch", false, true)} disabled={busy !== null} sx={btn}>
          {busy === "dry" ? "Checking…" : "Dry run"}
        </Button>
        {latest && (
          <Button variant="text" onClick={async () => { await rescoreAll(); await load(); }} disabled={busy !== null} sx={btn}>
            {busy === "rescore:all" ? "Re-scoring…" : "Re-score every day"}
          </Button>
        )}
      </Stack>
      <TextField size="small" label="Day" placeholder="today" value={day} onChange={(e) => setDay(e.target.value)} sx={{ mt: 1.5, maxWidth: 260, width: "100%" }}
        helperText="Blank fetches and pastes today. Name a day like 2026-10-27 to publish one that has already ended." />

      {retry && (
        <Alert
          severity="warning"
          sx={{ mt: 1.5, borderRadius: 2 }}
          action={
            <Stack direction="row" spacing={0.5}>
              {retry.canForce && (
                <Button variant="text" color="inherit" size="small" disabled={busy !== null || (retry.kind === "paste" && !paste.trim())} onClick={() => runIngest(retry.kind, true)} sx={btn}>
                  Publish anyway
                </Button>
              )}
              <Button variant="text" color="inherit" size="small" onClick={() => setRetry(null)} sx={plain}>Dismiss</Button>
            </Stack>
          }
        >
          {retry.message}.{" "}
          {retry.canForce
            ? `Publishing anyway ${retry.kind === "fetch" ? "fetches again and " : ""}skips the checks and replaces the day's standings for every group. Pool cards the feed is still missing score a neutral 50.`
            : "Nothing was published, and the standings already on the board haven't changed."}
        </Alert>
      )}

      <Collapse in={pasteOpen} unmountOnExit>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <TextField
            label="Feed response"
            multiline
            minRows={4}
            maxRows={10}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            helperText="Open the season's feed address in a browser, copy everything it shows, and paste it here. The same checks run."
            slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: 12 } } }}
          />
          <Box>
            <Button variant="contained" onClick={() => runIngest("paste", false)} disabled={busy !== null || !paste.trim()} sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, boxShadow: "none" }}>
              {busy === "paste" ? "Publishing…" : "Publish pasted stats"}
            </Button>
          </Box>
        </Stack>
      </Collapse>

      {data.runs.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={label}>Recent attempts</Typography>
          <Stack spacing={0.25} sx={{ mt: 0.5 }}>
            {data.runs.map((r, i) => (
              <Typography key={i} variant="caption" sx={{ color: r.outcome === "published" || r.outcome === "not_newer" ? "text.secondary" : FAILED }}>
                {easternTime(r.attempted_at)} · for {r.snapshot_date} · {r.trigger}{r.dry_run ? " dry run" : ""} · {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                {r.matched != null ? ` · ${r.matched} matched, ${games(r.total_games)} games` : ""}{r.notes ? ` · ${r.notes}` : ""}{r.alerted ? " · admin emailed" : ""}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}

      {data.snapshots.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={label}>Published days</Typography>
          <Stack spacing={0.25} sx={{ mt: 0.5 }}>
            {data.snapshots.slice(0, 10).map((s) => (
              <Stack key={s.snapshot_date} direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="caption" color="text.secondary">
                  {s.snapshot_date} · {s.source} · {s.matched} of {s.pool_size} matched · {games(s.total_games)} games · scored {easternTime(s.scored_at)}
                </Typography>
                <Button size="small" variant="text" disabled={busy !== null} onClick={() => rescore(s.snapshot_date)} sx={btn}>
                  {busy === `rescore:${s.snapshot_date}` ? "Re-scoring…" : "Re-score"}
                </Button>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {data.unmatchedCards.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={label}>Pool cards without 17Lands data ({data.unmatchedCards.length})</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {data.listsFrom ? `From the ${data.listsFrom.date} response (${OUTCOME_LABEL[data.listsFrom.outcome] ?? data.listsFrom.outcome}). ` : ""}They score a neutral 50. If the feed lists one under another name or Arena ID, match it.
          </Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {data.unmatchedCards.map((card) => {
              const { options, fellBack } = recordsFor(card.rarity);
              const pending = confirmMatch?.cardId === card.id ? confirmMatch.record : null;
              return (
                <Stack key={card.id} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }} useFlexGap flexWrap="wrap">
                  <Typography variant="body2" sx={{ minWidth: 200 }}>{card.name} <Typography component="span" variant="caption" color="text.secondary">· {card.rarity}{card.arenaId ? ` · Arena ${card.arenaId}` : ""}</Typography></Typography>
                  {options.length > 0 && (
                    <TextField select size="small" label={`Match to (${options.length})`} value="" disabled={busy !== null} sx={{ minWidth: 260 }}
                      helperText={fellBack ? `No unmatched ${card.rarity} left in the feed — every unmatched record is listed` : undefined}
                      onChange={(e) => { const r = options[Number(e.target.value)]; if (r) setConfirmMatch({ cardId: card.id, record: r }); }}>
                      {options.map((r, i) => (
                        <MenuItem key={`${r.name}-${r.mtgaId ?? i}`} value={String(i)}>{r.name} · {r.rarity} · {games(r.gihGames)} games</MenuItem>
                      ))}
                    </TextField>
                  )}
                  {pending && (
                    <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary">Match to {pending.name}?</Typography>
                      <Button size="small" variant="text" disabled={busy !== null} onClick={() => { setConfirmMatch(null); setMatch(card.id, pending); }} sx={btn}>Confirm</Button>
                      <Button size="small" variant="text" onClick={() => setConfirmMatch(null)} sx={plain}>Cancel</Button>
                    </Stack>
                  )}
                </Stack>
              );
            })}
          </Stack>
        </Box>
      )}

      {data.mapped.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={label}>Matched by hand</Typography>
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {data.mapped.map((m) => (
              <Stack key={m.id} direction="row" spacing={1} alignItems="center">
                <Typography variant="body2">{m.name} → {m.stats_arena_id ? `Arena ${m.stats_arena_id}` : m.stats_name}</Typography>
                <Button size="small" variant="text" disabled={busy !== null} onClick={() => setMatch(m.id, null)} sx={plain}>Clear</Button>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={label}>Voided cards</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>A voided card is never pickable or ranked; a locked pick of it scores a neutral 50.</Typography>
        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
          {data.voided.map((card) => (
            <Stack key={card.id} direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">{card.name} <Typography component="span" variant="caption" color="text.secondary">· {card.rarity}</Typography></Typography>
              <Button size="small" variant="text" disabled={busy !== null} onClick={() => setVoided(card, false)} sx={plain}>Restore</Button>
            </Stack>
          ))}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
          <TextField size="small" label="Void a card" placeholder="Card name" value={voidQuery} onFocus={loadPool} onChange={(e) => setVoidQuery(e.target.value)} sx={{ maxWidth: 320, width: "100%" }}
            helperText={poolFailed ? "Couldn't load the card list." : undefined} error={poolFailed} />
          {poolFailed && <Button size="small" variant="text" onClick={loadPool} sx={btn}>Try again</Button>}
        </Stack>
        {voidMatches.length > 0 && (
          <Stack spacing={0.25} sx={{ mt: 0.5 }}>
            {voidMatches.map((card) => (
              <Stack key={card.id} direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="body2">{card.name} <Typography component="span" variant="caption" color="text.secondary">· {card.rarity}</Typography></Typography>
                {confirmVoid === card.id ? (
                  <>
                    <Button size="small" variant="text" disabled={busy !== null} onClick={() => setVoided(card, true)} sx={{ ...btn, color: FAILED }}>Confirm void</Button>
                    <Button size="small" variant="text" onClick={() => setConfirmVoid(null)} sx={plain}>Cancel</Button>
                  </>
                ) : (
                  <Button size="small" variant="text" disabled={busy !== null} onClick={() => setConfirmVoid(card.id)} sx={{ ...btn, color: FAILED }}>Void</Button>
                )}
              </Stack>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
