"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import ArrowDropUpRoundedIcon from "@mui/icons-material/ArrowDropUpRounded";
import LeaderboardRoundedIcon from "@mui/icons-material/LeaderboardRounded";
import PsychologyAltRoundedIcon from "@mui/icons-material/PsychologyAltRounded";
import { AppCard } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import BadgeChip from "../reveal/BadgeChip";
import { BADGE_TIER_STYLE, MTG_RARITIES, RARITY_LABEL, type MtgLeaderboardPayload, type MtgLeaderboardRow } from "../mtgTypes";

type Standings = NonNullable<MtgLeaderboardPayload["standings"]>;

const EASTERN = "America/New_York";
/** Movement colors readable at 11 px: 5.0:1 and 6.5:1 on white. */
const UP = "#15803D";
const DOWN = "#B91C1C";
/** How stale a board may get while the tab stays open. */
const REFRESH_MS = 30 * 60 * 1000;

const points = (n: number) => Math.round(n).toLocaleString("en-US");
const signed = (n: number) => (Math.round(n) > 0 ? `+${points(n)}` : Math.round(n) < 0 ? `−${points(-n)}` : "±0");
const displayName = (p: { name: string | null; username: string | null; isViewer: boolean }) => (p.isViewer ? "You" : p.name || (p.username ? `@${p.username}` : "Member"));

/** "Ann", "Ann and Bo", "Ann, Bo and Cy", then "Ann, Bo, Cy, Di and 3 others". */
function joinNames(names: string[]): string {
  if (names.length > 4) return `${names.slice(0, 4).join(", ")} and ${names.length - 4} others`;
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const shiftDay = (key: string, days: number) => new Date(Date.parse(`${key}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const weekday = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(new Date(`${key}T12:00:00Z`));

/** Today's Eastern date and hour. */
function easternNow(ms: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** "today" when the comparison is the day before; "since Sat" after missed days. */
const changeWindow = (s: Standings) => (!s.previousDate || shiftDay(s.previousDate, 1) === s.date ? "today" : `since ${weekday(s.previousDate)}`);

function Movement({ row }: { row: MtgLeaderboardRow }) {
  if (row.previousRank === null) return null;
  const moved = row.previousRank - row.rank;
  if (moved === 0) return <Typography component="span" aria-hidden sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", lineHeight: 1 }}>–</Typography>;
  return (
    <Stack direction="row" alignItems="center" aria-hidden sx={{ color: moved > 0 ? UP : DOWN, lineHeight: 1 }}>
      {moved > 0 ? <ArrowDropUpRoundedIcon sx={{ fontSize: 18, mx: -0.5 }} /> : <ArrowDropDownRoundedIcon sx={{ fontSize: 18, mx: -0.5 }} />}
      <Typography component="span" sx={{ fontSize: "0.6875rem", fontWeight: 800, color: "inherit" }}>{Math.abs(moved)}</Typography>
    </Stack>
  );
}

/** Badge names on wide screens, tier dots on tablets; hidden on phones, where the open row shows them. */
function BadgeHints({ row }: { row: MtgLeaderboardRow }) {
  if (row.badges.length === 0) return null;
  const extra = row.badgeCount - row.badges.length;
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" aria-hidden sx={{ flexShrink: 0, display: { xs: "none", sm: "flex" } }}>
      {row.badges.map((b) => {
        const style = BADGE_TIER_STYLE[b.tier] ?? BADGE_TIER_STYLE.common;
        const dashed = b.tier === "shame" ? "dashed" : "solid";
        return (
          <Box key={`${b.code}-${b.name}`}>
            <Box sx={{ display: { xs: "block", md: "none" }, width: 12, height: 12, borderRadius: "50%", bgcolor: style.bg, border: "2px solid", borderColor: style.fg, borderStyle: dashed }} />
            <Box sx={{ display: { xs: "none", md: "block" }, px: 0.75, py: "1px", borderRadius: 10, fontSize: "0.625rem", fontWeight: 700, whiteSpace: "nowrap", bgcolor: style.bg, color: style.fg, border: "1px solid", borderColor: style.border, borderStyle: dashed }}>
              {b.name}
            </Box>
          </Box>
        );
      })}
      {extra > 0 && <Typography component="span" sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary" }}>+{extra}</Typography>}
    </Stack>
  );
}

function PlayerRow({ row, open, onToggle, window }: { row: MtgLeaderboardRow; open: boolean; onToggle: () => void; window: string }) {
  const name = displayName(row);
  const moved = row.previousRank === null ? 0 : row.previousRank - row.rank;
  const label = [
    `${row.rank}. ${name}`,
    `${points(row.total)} points`,
    row.change !== null ? `${signed(row.change)} ${window}` : null,
    moved > 0 ? `up ${moved}` : moved < 0 ? `down ${-moved}` : null,
    row.rank > 1 ? `${points(row.behind)} behind the leader` : "in the lead",
    row.badgeCount > 0 ? `${row.badgeCount} ${row.badgeCount === 1 ? "badge" : "badges"}` : null,
  ].filter(Boolean).join(", ");
  const changeColor = row.change === null ? "text.secondary" : Math.round(row.change) > 0 ? UP : Math.round(row.change) < 0 ? DOWN : "text.secondary";
  return (
    <Box component="li" sx={{ listStyle: "none", borderRadius: 2, border: "1px solid", borderColor: row.isViewer ? "primary.main" : "divider", bgcolor: "background.paper" }}>
      <ButtonBase
        focusRipple
        onClick={onToggle}
        aria-expanded={open}
        aria-label={label}
        sx={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: { xs: 1, sm: 1.5 }, px: { xs: 1, sm: 1.5 }, py: 1, borderRadius: 2, minHeight: 56, "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
      >
        <Stack alignItems="center" sx={{ width: 28, flexShrink: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.15 }}>{row.rank}</Typography>
          <Movement row={row} />
        </Stack>
        <Avatar src={row.avatarUrl ? `${getAvatarBaseUrl()}${row.avatarUrl}` : undefined} sx={{ width: 32, height: 32, fontSize: "0.875rem", bgcolor: "grey.300", flexShrink: 0 }}>
          {(row.name || row.username || "?").charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={700} noWrap>{name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {row.change === null ? "First standings" : (
              <>
                <Box component="span" sx={{ color: changeColor, fontWeight: 700 }}>{signed(row.change)}</Box>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}> {window}</Box>
              </>
            )}
            {row.rank > 1 && (
              <>
                {" · "}{points(row.behind)}
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}> behind</Box>
                <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}> back</Box>
              </>
            )}
          </Typography>
        </Box>
        <BadgeHints row={row} />
        <Typography sx={{ fontWeight: 800, fontSize: { xs: "1rem", sm: "1.125rem" }, flexShrink: 0, minWidth: 40, textAlign: "right" }}>{points(row.total)}</Typography>
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: { xs: 1, sm: 1.5 }, pb: 1.5 }}>
          <Typography variant="body2" fontWeight={700} sx={{ display: { sm: "none" }, mb: 0.75, overflowWrap: "anywhere" }}>
            {row.isViewer ? "You" : row.name || (row.username ? `@${row.username}` : "Member")}
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" }, gap: { xs: 0.75, sm: 1 } }}>
            {MTG_RARITIES.map((r) => (
              <Box key={r} sx={{ textAlign: "center", py: 0.75, borderRadius: 1.5, border: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontWeight: 800, fontSize: "0.9375rem" }}>{row.subtotals[r].toFixed(1)}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>{RARITY_LABEL[r]}</Typography>
              </Box>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
            {row.total.toFixed(1)} points in all{row.rank > 1 ? `, ${row.behind.toFixed(1)} behind the leader` : ""}.
          </Typography>
          {row.badges.length > 0 && (
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {row.badges.map((b) => <BadgeChip key={`${b.code}-${b.name}`} badge={b} />)}
              {row.badgeCount > row.badges.length && (
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ alignSelf: "center" }}>and {row.badgeCount - row.badges.length} more</Typography>
              )}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

function GroupMindRow({ mind, window }: { mind: NonNullable<Standings["groupMind"]>; window: string }) {
  const label = `Group Mind, the group's consensus picks, ${points(mind.total)} points${mind.change !== null ? `, ${signed(mind.change)} ${window}` : ""}`;
  return (
    <Box component="li" aria-label={label} sx={{ listStyle: "none", display: "flex", alignItems: "center", gap: { xs: 1, sm: 1.5 }, px: { xs: 1, sm: 1.5 }, py: 1, borderRadius: 2, border: "1px dashed", borderColor: "text.disabled", minHeight: 56 }}>
      <Box aria-hidden sx={{ width: 28, flexShrink: 0 }} />
      <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <PsychologyAltRoundedIcon sx={{ fontSize: 18 }} />
      </Box>
      <Box aria-hidden sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={700} noWrap>Group Mind</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {mind.change !== null ? `${signed(mind.change)} ${window} · ` : ""}the group&apos;s consensus
        </Typography>
      </Box>
      <Typography aria-hidden sx={{ fontWeight: 800, fontSize: { xs: "1rem", sm: "1.125rem" }, color: "text.secondary", flexShrink: 0, minWidth: 40, textAlign: "right" }}>{points(mind.total)}</Typography>
    </Box>
  );
}

function RandomPicksLine({ value }: { value: number }) {
  return (
    <Box component="li" sx={{ listStyle: "none" }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1 }} role="note" aria-label={`Random picks average about ${points(value)} points`}>
        <Box aria-hidden sx={{ flex: 1, borderTop: "2px dashed", borderColor: "divider" }} />
        <Typography aria-hidden variant="caption" color="text.secondary" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>Random picks ≈ {points(value)}</Typography>
        <Box aria-hidden sx={{ flex: 1, borderTop: "2px dashed", borderColor: "divider" }} />
      </Stack>
    </Box>
  );
}

/** "Updated Wed 9:04 AM ET · Day 2 of 28 · 17Lands Premier Draft", or "Last
 *  updated" with the date once the standings are older than they should be. */
function UpdatedLine({ standings, nowMs }: { standings: Standings; nowMs: number }) {
  const today = easternNow(nowMs);
  const seasonOver = standings.isFinal || (standings.day !== null && standings.totalDays !== null && standings.day >= standings.totalDays);
  const stale = !seasonOver && (standings.date < shiftDay(today.date, -1) || (standings.date < today.date && today.hour >= 9));
  const when = stale
    ? `Last updated ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${standings.date}T12:00:00Z`))}`
    : `Updated ${new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(standings.takenAt)).replace(",", "")} ET`;
  const day = standings.day !== null && standings.totalDays !== null ? ` · Day ${standings.day} of ${standings.totalDays}` : "";
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
      {when}{day}{standings.isFinal ? " · Final" : ""} · 17Lands Premier Draft
    </Typography>
  );
}

type Item = { kind: "player"; row: MtgLeaderboardRow } | { kind: "mind" } | { kind: "random" };

/**
 * The group's standings (spec 10.5): rank and movement, points and change,
 * points behind the leader and the top badges, with the Group Mind and a
 * random-picks line placed where their points fall. A row opens to its points
 * by rarity and its badges. The board refreshes when the tab comes back into
 * view, and every half hour while it stays open.
 */
export default function Leaderboard({ communityId, nowMs }: { communityId: string; nowMs: number }) {
  const [data, setData] = useState<MtgLeaderboardPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const lastFetch = useRef(0);

  const load = useCallback(async () => {
    lastFetch.current = Date.now();
    try {
      const res = await apiFetch(`/mtg/communities/${communityId}/leaderboard`, { auth: true });
      const body = await res.json();
      if (res.ok && body.ok) {
        setData(body as MtgLeaderboardPayload);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }
  }, [communityId]);

  // Load on mount, again when the tab comes back into view, and every half
  // hour while it stays open; each runs from a callback, not the effect body.
  useEffect(() => {
    const first = setTimeout(() => { load(); }, 0);
    const onVisible = () => { if (document.visibilityState === "visible" && Date.now() - lastFetch.current > 60000) load(); };
    const tick = setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastFetch.current > REFRESH_MS) load(); }, 60000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const s = data?.standings ?? null;
  const items = useMemo<Item[]>(() => {
    if (!s) return [];
    const ghosts: Array<{ item: Item; total: number }> = [{ item: { kind: "random" }, total: s.randomPicks }];
    if (s.groupMind) ghosts.push({ item: { kind: "mind" }, total: s.groupMind.total });
    ghosts.sort((a, b) => b.total - a.total);
    const out: Item[] = [];
    for (const row of s.rows) {
      while (ghosts.length > 0 && ghosts[0].total > row.total) out.push(ghosts.shift()!.item);
      out.push({ kind: "player", row });
    }
    for (const g of ghosts) out.push(g.item);
    return out;
  }, [s]);

  const header = (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
      <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <LeaderboardRoundedIcon sx={{ fontSize: 18 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" component="h2" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>Standings</Typography>
        {s && <UpdatedLine standings={s} nowMs={nowMs} />}
      </Box>
    </Stack>
  );

  if (!data) {
    return (
      <AppCard>
        {header}
        {failed ? (
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">We couldn&apos;t load the standings.</Typography>
            <Button variant="text" size="small" onClick={() => load()} sx={{ textTransform: "none", fontWeight: 700, minHeight: 40 }}>Try again</Button>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">Loading standings…</Typography>
        )}
      </AppCard>
    );
  }
  if (!s) {
    return (
      <AppCard>
        {header}
        <Typography variant="body2" color="text.secondary">The first standings arrive the morning after the Arena launch, around 9 AM ET.</Typography>
      </AppCard>
    );
  }

  const window = changeWindow(s);
  const best = s.rows.filter((r) => r.change !== null && Math.round(r.change) > 0).sort((a, b) => (b.change ?? 0) - (a.change ?? 0))[0];
  const noEntry = [...s.noEntry].sort((a, b) => Number(b.isViewer) - Number(a.isViewer));

  return (
    <AppCard>
      {header}
      {best && best.change !== null && (
        <Typography variant="body2" sx={{ mb: 1.25 }}>
          {displayName(best)} {window === "today" ? "had the best day" : `gained the most ${window}`},{" "}
          <Box component="span" sx={{ color: UP, fontWeight: 800 }}>{signed(best.change)}</Box>.
        </Typography>
      )}
      <Stack component="ol" spacing={0.75} aria-label="Standings" sx={{ m: 0, p: 0 }}>
        {items.map((item, i) =>
          item.kind === "player" ? (
            <PlayerRow key={item.row.userId} row={item.row} window={window} open={openRow === item.row.userId} onToggle={() => setOpenRow((cur) => (cur === item.row.userId ? null : item.row.userId))} />
          ) : item.kind === "mind" && s.groupMind ? (
            <GroupMindRow key="mind" mind={s.groupMind} window={window} />
          ) : item.kind === "random" ? (
            <RandomPicksLine key={`random-${i}`} value={s.randomPicks} />
          ) : null,
        )}
      </Stack>
      {s.rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Nobody in this group locked in picks.</Typography>
      )}
      {noEntry.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          {joinNames(noEntry.map((p) => displayName(p)))} {noEntry.length === 1 && !noEntry[0].isViewer ? "is" : "are"} following along.
        </Typography>
      )}
    </AppCard>
  );
}
