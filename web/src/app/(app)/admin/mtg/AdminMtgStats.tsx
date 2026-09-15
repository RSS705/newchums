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

type Run = { attempted_at: string; snapshot_date: string; trigger: string; outcome: string; notes: string | null; total_games: string | number | null; matched: number | null; alerted: boolean };
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
type IngestResult = { outcome: string; reason: string | null; snapshotDate: string; matched?: number; poolSize?: number; totalGames?: number; replaced?: boolean };
type Body = Record<string, unknown> & { ok?: boolean; message?: string };

const OUTCOME_LABEL: Record<string, string> = { published: "Published", not_newer: "Not newer", fetch_failed: "Fetch failed", failed_validation: "Failed checks", skipped: "Not run", error: "Error" };
const FAILED = "#B91C1C";
const label = { textTransform: "uppercase", letterSpacing: "0.04em" } as const;
const games = (n: string | number | null | undefined) => (n == null ? "–" : Number(n).toLocaleString("en-US"));

function describeResult(r: IngestResult): string {
  if (r.outcome === "published") return `Published ${r.snapshotDate}${r.replaced ? " again" : ""}: ${r.matched} of ${r.poolSize} cards matched, ${games(r.totalGames)} games in hand`;
  return `${OUTCOME_LABEL[r.outcome] ?? r.outcome}: ${r.reason ?? "no reason given"}`;
}

/**
 * The stats half of a season on MTG Seasons (spec 9.1): fetch 17Lands now,
 * paste a response copied from a browser, re-score a day, see recent
 * attempts, match pool cards the feed missed, and void or restore cards. A
 * failed fetch or paste offers "Publish anyway" for that attempt only.
 * Matching or voiding re-scores the latest day straight away.
 */
export default function AdminMtgStats({ code }: { code: string }) {
  const toast = useToast();
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [retry, setRetry] = useState<{ kind: "fetch" | "paste"; message: string } | null>(null);
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

  const runIngest = async (kind: "fetch" | "paste", force: boolean) => {
    setRetry(null);
    const path = kind === "fetch" ? `/admin/mtg/sets/${code}/ingest` : `/admin/mtg/sets/${code}/ingest/paste`;
    const body = await call(kind, path, { method: "POST", body: JSON.stringify(kind === "fetch" ? { force } : { raw: paste, force }) });
    if (body) {
      const r = body.result as IngestResult;
      if (r.outcome === "published") {
        toast.success(describeResult(r));
        if (kind === "paste") { setPaste(""); setPasteOpen(false); }
      } else if (r.outcome === "failed_validation" || r.outcome === "not_newer") {
        setRetry({ kind, message: describeResult(r) });
      } else {
        toast.error(describeResult(r));
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

  /** Save a match or a void, then re-score the latest day so standings reflect it. */
  const applyChange = async (key: string, path: string, payload: unknown, done: string) => {
    const saved = await call(key, path, { method: "PUT", body: JSON.stringify(payload) });
    if (saved) {
      const latest = data?.snapshots[0];
      if (latest) {
        const again = await call(`rescore:${latest.snapshot_date}`, `/admin/mtg/sets/${code}/snapshots/${latest.snapshot_date}/rescore`, { method: "POST" });
        if (again) toast.success(`${done} Re-scored ${latest.snapshot_date}.`);
      } else {
        toast.success(`${done} It applies to the next fetch or paste.`);
      }
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
            <Button size="small" variant="text" onClick={() => load()} sx={{ textTransform: "none", fontWeight: 700 }}>Try again</Button>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">Loading…</Typography>
        )}
      </Box>
    );
  }

  const latest = data.snapshots[0] ?? null;
  const records = [...data.unmatchedRecords].sort((a, b) => a.name.localeCompare(b.name));
  const recordsFor = (rarity: string) => {
    const same = records.filter((r) => r.rarity === rarity);
    return same.length > 0 ? same : records;
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
        {latest && (
          <Button variant="text" onClick={() => rescore(latest.snapshot_date)} disabled={busy !== null} sx={{ textTransform: "none", fontWeight: 600 }}>
            {busy === `rescore:${latest.snapshot_date}` ? "Re-scoring…" : `Re-score ${latest.snapshot_date}`}
          </Button>
        )}
      </Stack>

      {retry && (
        <Alert
          severity="warning"
          sx={{ mt: 1.5, borderRadius: 2 }}
          action={
            <Stack direction="row" spacing={0.5}>
              <Button variant="text" color="inherit" size="small" disabled={busy !== null || (retry.kind === "paste" && !paste.trim())} onClick={() => runIngest(retry.kind, true)} sx={{ textTransform: "none", fontWeight: 700 }}>
                Publish anyway
              </Button>
              <Button variant="text" color="inherit" size="small" onClick={() => setRetry(null)} sx={{ textTransform: "none" }}>Dismiss</Button>
            </Stack>
          }
        >
          {retry.message}. Publishing anyway {retry.kind === "fetch" ? "fetches again and " : ""}replaces today&apos;s standings for every group.
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
                {new Date(r.attempted_at).toLocaleString()} · {r.trigger} · {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                {r.matched != null ? ` · ${r.matched} matched, ${games(r.total_games)} games` : ""}{r.notes ? ` · ${r.notes}` : ""}{r.alerted ? " · admin emailed" : ""}
              </Typography>
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
              const options = recordsFor(card.rarity);
              return (
                <Stack key={card.id} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
                  <Typography variant="body2" sx={{ minWidth: 200 }}>{card.name} <Typography component="span" variant="caption" color="text.secondary">· {card.rarity}{card.arenaId ? ` · Arena ${card.arenaId}` : ""}</Typography></Typography>
                  {options.length > 0 && (
                    <TextField select size="small" label={`Match to (${options.length})`} value="" disabled={busy !== null} onChange={(e) => setMatch(card.id, options[Number(e.target.value)] ?? null)} sx={{ minWidth: 260 }}>
                      {options.map((r, i) => (
                        <MenuItem key={`${r.name}-${r.mtgaId ?? i}`} value={String(i)}>{r.name} · {r.rarity} · {games(r.gihGames)} games</MenuItem>
                      ))}
                    </TextField>
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
                <Button size="small" variant="text" disabled={busy !== null} onClick={() => setMatch(m.id, null)} sx={{ textTransform: "none" }}>Clear</Button>
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
              <Button size="small" variant="text" disabled={busy !== null} onClick={() => setVoided(card, false)} sx={{ textTransform: "none" }}>Restore</Button>
            </Stack>
          ))}
        </Stack>
        <TextField size="small" label="Void a card" placeholder="Card name" value={voidQuery} onFocus={loadPool} onChange={(e) => setVoidQuery(e.target.value)} sx={{ mt: 1, maxWidth: 320, width: "100%" }}
          helperText={poolFailed ? "Couldn't load the card list. Click the field to try again." : undefined} error={poolFailed} />
        {voidMatches.length > 0 && (
          <Stack spacing={0.25} sx={{ mt: 0.5 }}>
            {voidMatches.map((card) => (
              <Stack key={card.id} direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="body2">{card.name} <Typography component="span" variant="caption" color="text.secondary">· {card.rarity}</Typography></Typography>
                {confirmVoid === card.id ? (
                  <>
                    <Button size="small" variant="text" disabled={busy !== null} onClick={() => setVoided(card, true)} sx={{ textTransform: "none", fontWeight: 700, color: FAILED }}>Confirm void</Button>
                    <Button size="small" variant="text" onClick={() => setConfirmVoid(null)} sx={{ textTransform: "none" }}>Cancel</Button>
                  </>
                ) : (
                  <Button size="small" variant="text" disabled={busy !== null} onClick={() => setConfirmVoid(card.id)} sx={{ textTransform: "none", color: FAILED }}>Void</Button>
                )}
              </Stack>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
