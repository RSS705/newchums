"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { apiFetch } from "@/lib/apiClient";
import type { MtgEveryonePayload, MtgEveryoneRow } from "../mtgTypes";

/** 6.5:1 on white, as on the leaderboard. */
const FAILED = "#B91C1C";
const whole = (n: number) => Math.round(n).toLocaleString("en-US");

function Row({ row }: { row: MtgEveryoneRow }) {
  const handle = row.handle ? `@${row.handle}` : "Anonymous player";
  return (
    <Box
      component="li"
      aria-label={`${row.rank}. ${row.isViewer ? "You, " : ""}${handle}, ${whole(row.total)} points`}
      sx={{ listStyle: "none", display: "grid", gridTemplateColumns: "36px minmax(0, 1fr) auto", alignItems: "center", columnGap: 1, px: { xs: 1, sm: 1.5 }, minHeight: 44, borderRadius: 2, border: "1px solid", borderColor: row.isViewer ? "primary.main" : "divider" }}
    >
      <Typography aria-hidden sx={{ fontWeight: 800, fontSize: "0.9375rem" }}>{row.rank}</Typography>
      <Typography aria-hidden variant="body2" noWrap sx={{ fontWeight: 700, color: row.handle ? "text.primary" : "text.secondary" }}>
        {handle}{row.isViewer ? " (you)" : ""}
      </Typography>
      <Typography aria-hidden sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{whole(row.total)}</Typography>
    </Box>
  );
}

/**
 * The leaderboard's Everyone tab (spec 10.5 and 11): every entry this season
 * on the latest day, by handle, rank and points only, leaving out anyone who
 * hides themselves. A player with an entry can hide or show themselves here
 * at any time, before the first standings too.
 */
export default function EveryoneBoard({ setCode }: { setCode: string }) {
  const [data, setData] = useState<MtgEveryonePayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/mtg/sets/${encodeURIComponent(setCode)}/everyone`, { auth: true });
      const body = await res.json();
      if (res.ok && body.ok) {
        setData(body as MtgEveryonePayload);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
  }, [setCode]);

  useEffect(() => {
    const first = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(first);
  }, [load]);

  const setHidden = async (hidden: boolean) => {
    setSaving(true);
    setSaveFailed(false);
    try {
      const res = await apiFetch(`/mtg/sets/${encodeURIComponent(setCode)}/entry/everyone`, {
        auth: true,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      const body = await res.json();
      if (res.ok && body.ok) await load();
      else setSaveFailed(true);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return failed ? (
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <Typography variant="body2" color="text.secondary">We couldn&apos;t load the Everyone board.</Typography>
        <Button variant="text" size="small" onClick={() => load()} sx={{ textTransform: "none", fontWeight: 700, minHeight: 40 }}>Try again</Button>
      </Stack>
    ) : (
      <Typography variant="body2" color="text.secondary">Loading the Everyone board…</Typography>
    );
  }

  const s = data.standings;
  return (
    <Box>
      {data.viewer.hasEntry && (
        <Box sx={{ mb: 1.25 }}>
          <FormControlLabel
            control={<Switch checked={!data.viewer.hidden} disabled={saving} onChange={(e) => setHidden(!e.target.checked)} />}
            label="Show me on this board"
            sx={{ mr: 0, minHeight: 44, "& .MuiFormControlLabel-label": { fontSize: "0.875rem", fontWeight: 600 } }}
          />
          {saveFailed && <Typography variant="caption" sx={{ display: "block", color: FAILED }}>That didn&apos;t save. Try again.</Typography>}
        </Box>
      )}
      {!s ? (
        <Typography variant="body2" color="text.secondary">The Everyone board starts with the first standings, the morning after the Arena launch.</Typography>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {s.players.toLocaleString("en-US")} {s.players === 1 ? "player" : "players"} this season, shown by handle with rank and points only. Anyone can hide themselves.
            {data.viewer.hasEntry && data.viewer.hidden ? " You're hidden." : ""}
          </Typography>
          {s.rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Nobody is on the board yet.</Typography>
          ) : (
            <Stack component="ol" spacing={0.75} aria-label="Everyone board" sx={{ m: 0, p: 0 }}>
              {s.rows.map((r, i) => <Row key={i} row={r} />)}
            </Stack>
          )}
          {s.viewerRow && (
            <Box sx={{ mt: 0.75 }}>
              <Typography aria-hidden variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", lineHeight: 1.2 }}>⋯</Typography>
              <Stack component="ol" spacing={0.75} aria-label="Your place" sx={{ m: 0, p: 0, mt: 0.5 }}>
                <Row row={s.viewerRow} />
              </Stack>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
