"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { AppCard, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import type { MtgSetPayload } from "@/components/mtg/mtgTypes";

type AdminSet = {
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
  status: string;
  phase: string;
  payload: MtgSetPayload;
  syncs: { ran_at: string; outcome: string; cards_seen: number; cards_new: number; notes: string | null }[];
};

const DATE_FIELDS: Array<{ key: keyof AdminSet; label: string; required?: boolean }> = [
  { key: "previews_start_at", label: "Previews start" },
  { key: "gallery_complete_at", label: "Full gallery (pool firms up)" },
  { key: "picks_open_at", label: "Picks open" },
  { key: "prerelease_start_at", label: "Prerelease start" },
  { key: "prerelease_end_at", label: "Prerelease end" },
  { key: "lock_at", label: "Picks lock", required: true },
  { key: "arena_release_at", label: "Arena launch" },
  { key: "tabletop_release_at", label: "Paper release" },
  { key: "final_at", label: "Final day", required: true },
];

/** ISO -> value for a datetime-local input, in the browser's zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

type Draft = Record<string, string>;

export default function AdminMtgClient() {
  const [sets, setSets] = useState<AdminSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/admin/mtg/sets", { auth: true });
      const data = (await res.json()) as { ok?: boolean; sets?: AdminSet[] };
      if (data.ok && data.sets) {
        setSets(data.sets);
        const d: Record<string, Draft> = {};
        for (const s of data.sets) {
          d[s.code] = { name: s.name, feed_url: s.feed_url, status: s.status };
          for (const f of DATE_FIELDS) d[s.code][f.key] = toLocalInput(s[f.key] as string | null);
        }
        setDrafts(d);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (code: string) => {
    const d = drafts[code]; if (!d) return;
    setBusy(code);
    try {
      const body: Record<string, string | null> = { name: d.name, feed_url: d.feed_url, status: d.status };
      for (const f of DATE_FIELDS) body[f.key] = fromLocalInput(d[f.key] ?? "");
      const res = await apiFetch(`/admin/mtg/sets/${code}`, { auth: true, method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) { toast.error(data.message ?? "Couldn't save the season"); return; }
      toast.success("Season saved");
      await load();
    } catch { toast.error("Couldn't save the season"); }
    finally { setBusy(null); }
  };

  const syncNow = async (code: string) => {
    setBusy(`${code}:sync`);
    try {
      const res = await apiFetch(`/admin/mtg/sets/${code}/sync`, { auth: true, method: "POST" });
      const data = (await res.json()) as { ok?: boolean; message?: string; summary?: { seen: number; kept: number; inserted: number; pages: number } };
      if (!res.ok || !data.ok) { toast.error(data.message ?? "Sync failed"); return; }
      const s = data.summary!;
      toast.success(`Synced: ${s.seen} printings seen, ${s.kept} cards kept, ${s.inserted} new`);
      await load();
    } catch { toast.error("Sync failed"); }
    finally { setBusy(null); }
  };

  const addSet = () => {
    const code = newCode.trim().toLowerCase();
    if (!/^[a-z0-9]{2,6}$/.test(code)) { toast.error("Use the Scryfall set code, like fra"); return; }
    if (drafts[code]) { toast.error("That set already exists"); return; }
    setDrafts((prev) => ({ ...prev, [code]: { name: "", feed_url: `https://www.17lands.com/api/card_data?expansion=${code.toUpperCase()}&event_type=PremierDraft&time_period=ALL_TIME`, status: "active" } }));
    setSets((prev) => [{ code, name: "", previews_start_at: null, gallery_complete_at: null, prerelease_start_at: null, prerelease_end_at: null, picks_open_at: null, lock_at: "", arena_release_at: null, tabletop_release_at: null, final_at: "", feed_url: "", status: "active", phase: "upcoming", payload: { code, name: "", phase: "upcoming", dates: { previewsStartAt: null, galleryCompleteAt: null, prereleaseStartAt: null, prereleaseEndAt: null, picksOpenAt: null, lockAt: "", arenaReleaseAt: null, tabletopReleaseAt: null, finalAt: "" }, timeline: [], pool: { common: 0, uncommon: 0, rare: 0, mythic: 0 }, poolTotal: 0, galleryComplete: false, lastCardSyncAt: null, scoringVersion: 1, picksOpen: false }, syncs: [] }, ...prev]);
    setNewCode("");
  };

  const setField = (code: string, key: string, value: string) => setDrafts((prev) => ({ ...prev, [code]: { ...(prev[code] ?? {}), [key]: value } }));

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" sx={{ fontSize: { xs: "1.75rem", sm: "2.125rem" }, fontWeight: 700, lineHeight: 1.15 }}>MTG Seasons</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6, maxWidth: 640 }}>
          One row per set. Dates are entered in your own time zone and stored in UTC; the game shows them in each viewer&apos;s zone. The card sync runs itself every two hours during previews; use Sync now to pull straight away.
        </Typography>
      </Box>

      <AppCard>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
          <TextField label="New set code" size="small" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="e.g. fra" sx={{ maxWidth: 220 }} />
          <Button variant="outlined" onClick={addSet} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>Add a season</Button>
        </Stack>
      </AppCard>

      {loading && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
      {!loading && sets.length === 0 && <Typography variant="body2" color="text.secondary">No seasons yet.</Typography>}

      {sets.map((s) => {
        const d = drafts[s.code] ?? {};
        return (
          <AppCard key={s.code}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>{s.code.toUpperCase()}</Typography>
              <Chip label={s.phase} size="small" sx={{ fontWeight: 700, textTransform: "capitalize" }} color={s.phase === "final" ? "default" : "primary"} variant="outlined" />
              <Typography variant="caption" color="text.secondary">
                Pool {s.payload.poolTotal}: {s.payload.pool.common} C · {s.payload.pool.uncommon} U · {s.payload.pool.rare} R · {s.payload.pool.mythic} M
              </Typography>
            </Stack>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Name" size="small" fullWidth value={d.name ?? ""} onChange={(e) => setField(s.code, "name", e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Status" size="small" select fullWidth value={d.status ?? "active"} onChange={(e) => setField(s.code, "status", e.target.value)}>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="final">Final</MenuItem>
                  <MenuItem value="archived">Archived</MenuItem>
                </TextField>
              </Grid>
              {DATE_FIELDS.map((f) => (
                <Grid key={f.key} size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField
                    label={f.label + (f.required ? " *" : "")}
                    type="datetime-local"
                    size="small"
                    fullWidth
                    value={d[f.key] ?? ""}
                    onChange={(e) => setField(s.code, f.key, e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Grid>
              ))}
              <Grid size={{ xs: 12 }}>
                <TextField label="17Lands feed address" size="small" fullWidth value={d.feed_url ?? ""} onChange={(e) => setField(s.code, "feed_url", e.target.value)} helperText="Open 17Lands' Card Data page, then the browser's Network tab, and copy the JSON request if the address ever changes." />
              </Grid>
            </Grid>
            <Stack direction="row" spacing={1.5} sx={{ mt: 2 }} useFlexGap flexWrap="wrap">
              <Button variant="contained" onClick={() => save(s.code)} disabled={busy === s.code} sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, boxShadow: "none" }}>
                {busy === s.code ? "Saving…" : "Save season"}
              </Button>
              <Button variant="outlined" onClick={() => syncNow(s.code)} disabled={busy === `${s.code}:sync` || !s.lock_at} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
                {busy === `${s.code}:sync` ? "Syncing…" : "Sync cards now"}
              </Button>
            </Stack>
            {s.syncs.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>Recent syncs</Typography>
                <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                  {s.syncs.map((r, i) => (
                    <Typography key={i} variant="caption" color={r.outcome === "ok" ? "text.secondary" : "error"}>
                      {new Date(r.ran_at).toLocaleString()} · {r.outcome} · {r.cards_seen} cards, {r.cards_new} new{r.notes ? ` · ${r.notes}` : ""}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            )}
          </AppCard>
        );
      })}
    </Stack>
  );
}
