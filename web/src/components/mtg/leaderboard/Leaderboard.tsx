"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextLink from "next/link";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import ArrowDropUpRoundedIcon from "@mui/icons-material/ArrowDropUpRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import LeaderboardRoundedIcon from "@mui/icons-material/LeaderboardRounded";
import PsychologyAltRoundedIcon from "@mui/icons-material/PsychologyAltRounded";
import { AppCard } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { BadgeIcon } from "../badgeIcons";
import { srOnly } from "../pageBits";
import BadgeChip from "../reveal/BadgeChip";
import EveryoneBoard from "./EveryoneBoard";
import { MTG_RARITIES, RARITY_LABEL, seasonQuery, type MtgLeaderboardPayload, type MtgLeaderboardRow } from "../mtgTypes";

type Standings = NonNullable<MtgLeaderboardPayload["standings"]>;

const EASTERN = "America/New_York";
/** Movement colors readable at 11 px: 5.0:1 and 6.5:1 on white. */
const UP = "#15803D";
const DOWN = "#B91C1C";
/** How stale a board may get while the tab stays open. */
const REFRESH_MS = 30 * 60 * 1000;

const points = (n: number) => Math.round(n).toLocaleString("en-US");
const tenths = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

/** The row's three best badges as icons in their tier colors, and a count for
 *  the rest (spec 10.5). Phones show only the best icon and count the others,
 *  since most rows carry three or more badges from the lock and a 320 px row
 *  would otherwise leave a name about four letters. */
function BadgeHints({ row }: { row: MtgLeaderboardRow }) {
  if (row.badges.length === 0) return null;
  const extraWide = row.badgeCount - row.badges.length;
  const extraPhone = row.badgeCount - 1;
  const count = (n: number, display: Record<string, string>) => (n > 0 ? (
    <Typography component="span" sx={{ display, fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", ml: "2px" }}>+{n}</Typography>
  ) : null);
  return (
    <Stack direction="row" alignItems="center" aria-hidden sx={{ flexShrink: 0, gap: "4px" }}>
      {row.badges.map((b, i) => (
        <Box key={`${b.code}-${b.name}`} sx={{ display: i === 0 ? "block" : { xs: "none", sm: "block" } }}>
          <BadgeIcon badge={b} size={{ xs: 20, sm: 24 }} />
        </Box>
      ))}
      {count(extraPhone, { xs: "inline", sm: "none" })}
      {count(extraWide, { xs: "none", sm: "inline" })}
    </Stack>
  );
}

function PlayerRow({ row, open, onToggle, sinceLabel, href }: { row: MtgLeaderboardRow; open: boolean; onToggle: () => void; sinceLabel: string; href: string }) {
  const name = displayName(row);
  const whose = row.isViewer ? "your" : row.name ? `${row.name.trim().split(/\s+/)[0]}'s` : row.username ? `@${row.username}'s` : "their";
  const moved = row.previousRank === null ? 0 : row.previousRank - row.rank;
  const label = [
    `${row.rank}. ${name}`,
    `${points(row.total)} points`,
    row.change !== null ? `${signed(row.change)} ${sinceLabel}` : null,
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
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}> {sinceLabel}</Box>
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
            {tenths(row.total)} points in all{row.rank > 1 ? `, ${tenths(row.behind)} behind the leader` : ""}.
          </Typography>
          {row.badges.length > 0 && (
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {row.badges.map((b) => <BadgeChip key={`${b.code}-${b.name}`} badge={b} />)}
              {row.badgeCount > row.badges.length && (
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ alignSelf: "center" }}>and {row.badgeCount - row.badges.length} more</Typography>
              )}
            </Stack>
          )}
          <Button component={NextLink} href={href} variant="text" size="small" endIcon={<ChevronRightRoundedIcon />} sx={{ textTransform: "none", fontWeight: 700, mt: 0.75, ml: -1, minHeight: 40 }}>
            See {whose} picks and stats
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
}

function GroupMindRow({ mind, sinceLabel }: { mind: NonNullable<Standings["groupMind"]>; sinceLabel: string }) {
  const label = `Group Mind, the group's consensus picks, ${points(mind.total)} points${mind.change !== null ? `, ${signed(mind.change)} ${sinceLabel}` : ""}`;
  const changeColor = mind.change === null ? "text.secondary" : Math.round(mind.change) > 0 ? UP : Math.round(mind.change) < 0 ? DOWN : "text.secondary";
  return (
    <Box component="li" sx={{ listStyle: "none", position: "relative", display: "flex", alignItems: "center", gap: { xs: 1, sm: 1.5 }, px: { xs: 1, sm: 1.5 }, py: 1, borderRadius: 2, border: "1px dashed", borderColor: "text.disabled", minHeight: 56 }}>
      {/* Read as one sentence; the visible parts are hidden from screen readers. */}
      <Box component="span" sx={srOnly}>{label}</Box>
      <Box aria-hidden sx={{ width: 28, flexShrink: 0 }} />
      <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <PsychologyAltRoundedIcon sx={{ fontSize: 18 }} />
      </Box>
      <Box aria-hidden sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={700} noWrap>Group Mind</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {mind.change !== null && <Box component="span" sx={{ color: changeColor, fontWeight: 700 }}>{signed(mind.change)}</Box>}
          <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>{mind.change !== null ? " · " : ""}consensus</Box>
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{mind.change !== null ? ` ${sinceLabel} · ` : ""}the group&apos;s consensus</Box>
        </Typography>
      </Box>
      <Typography aria-hidden sx={{ fontWeight: 800, fontSize: { xs: "1rem", sm: "1.125rem" }, color: "text.secondary", flexShrink: 0, minWidth: 40, textAlign: "right" }}>{points(mind.total)}</Typography>
    </Box>
  );
}

/** A benchmark placed where its points fall among the players: what 20 cards
 *  chosen at random score on average. The rules keep a little length even on
 *  a 320 px phone. */
function RandomPicksLine({ value }: { value: number }) {
  return (
    <Box component="li" sx={{ listStyle: "none", position: "relative" }}>
      <Box component="span" sx={srOnly}>Random picks score about {points(value)} points</Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1 }}>
        <Box aria-hidden sx={{ flex: 1, minWidth: "12px", borderTop: "2px dashed", borderColor: "divider" }} />
        <Typography aria-hidden variant="caption" color="text.secondary" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>Random picks score about {points(value)}</Typography>
        <Box aria-hidden sx={{ flex: 1, minWidth: "12px", borderTop: "2px dashed", borderColor: "divider" }} />
      </Stack>
    </Box>
  );
}

/** "Updated Wed 9:04 AM ET · Day 2 of 28 · 17Lands Premier Draft", or "Last
 *  updated" with the date once the standings are older than they should be. */
function UpdatedLine({ standings, nowMs }: { standings: Standings; nowMs: number }) {
  const today = easternNow(nowMs);
  const seasonOver = standings.isFinal || (standings.day !== null && standings.totalDays !== null && standings.day >= standings.totalDays);
  const stale = !seasonOver && (standings.date < shiftDay(today.date, -1) || (standings.date < today.date && today.hour >= 10));
  const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${standings.date}T12:00:00Z`));
  // Once the season is over a weekday alone would be ambiguous weeks later, so name the date.
  const when = seasonOver
    ? `Final standings from ${dayLabel}`
    : stale
      ? `Last updated ${dayLabel}`
      : `Updated ${new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(standings.takenAt)).replace(",", "")} ET`;
  const day = standings.day !== null && standings.totalDays !== null ? ` · Day ${standings.day} of ${standings.totalDays}` : "";
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
      {when}{day} · 17Lands Premier Draft
    </Typography>
  );
}

type Item = { kind: "player"; row: MtgLeaderboardRow } | { kind: "mind" } | { kind: "random" };

/**
 * The group's standings (spec 10.5): rank and movement, points and change,
 * points behind the leader and the top badges, with the Group Mind and a
 * random-picks line placed where their points fall. A row opens to its points
 * by rarity and its badges, with a link to the player's page. The Everyone tab
 * ranks the whole season by handle. The board refreshes when the tab comes
 * back into view, and every half hour while it stays open. A past season's
 * page passes `past`, so the board and its links name the season.
 */
export default function Leaderboard({ communityId, slug, setCode, nowMs, firstStandingsAt, past = false }: { communityId: string; slug: string; setCode: string; nowMs: number; firstStandingsAt: string | null; past?: boolean }) {
  const [data, setData] = useState<MtgLeaderboardPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [tab, setTab] = useState<"group" | "everyone">("group");
  // The Everyone board mounts the first time its tab opens and then stays
  // mounted, hidden, so switching back and forth doesn't reload it.
  const [everyoneOpened, setEveryoneOpened] = useState(false);
  const lastFetch = useRef(0);

  const load = useCallback(async () => {
    lastFetch.current = Date.now();
    try {
      const res = await apiFetch(`/mtg/communities/${communityId}/leaderboard${past ? seasonQuery(setCode) : ""}`, { auth: true });
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
  }, [communityId, past, setCode]);

  // Load on mount, again when the tab comes back into view, and every half
  // hour while it stays open; each runs from a callback, not the effect body.
  // Final standings never change, so once they're here nothing reloads.
  const finalLoaded = useRef(false);
  useEffect(() => {
    const first = setTimeout(() => { load(); }, 0);
    const stale = (ms: number) => !finalLoaded.current && document.visibilityState === "visible" && Date.now() - lastFetch.current > ms;
    const onVisible = () => { if (stale(60000)) load(); };
    const tick = setInterval(() => { if (stale(REFRESH_MS)) load(); }, 60000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const s = data?.standings ?? null;
  useEffect(() => { finalLoaded.current = !!s?.isFinal; }, [s]);
  const items = useMemo<Item[]>(() => {
    if (!s || s.rows.length === 0) return [];
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

  const tabs = (
    <Tabs
      value={tab}
      onChange={(_, v) => {
        setTab(v as "group" | "everyone");
        if (v === "everyone") setEveryoneOpened(true);
      }}
      aria-label="Which standings"
      sx={{ minHeight: 40, mb: 1.5, borderBottom: "1px solid", borderColor: "divider", "& .MuiTab-root": { textTransform: "none", fontWeight: 700, minHeight: 40, px: 1.5 } }}
    >
      <Tab value="group" label="This group" />
      <Tab value="everyone" label="Everyone" />
    </Tabs>
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
  const everyone = everyoneOpened ? (
    <Box sx={{ display: tab === "everyone" ? "block" : "none" }}><EveryoneBoard setCode={setCode} standingsDate={data?.standings?.date ?? null} /></Box>
  ) : null;

  if (!s) {
    // An hour past the first standings' usual time, say they're late rather than repeating the plan.
    const late = firstStandingsAt !== null && nowMs >= Date.parse(firstStandingsAt) + 3600000;
    return (
      <AppCard>
        {header}
        {tabs}
        {everyone}
        {tab === "group" && (
          <Typography variant="body2" color="text.secondary">
            {late
              ? "The first standings are running late. They'll appear here as soon as 17Lands' data comes in."
              : "The first standings arrive the morning after the Arena launch, around 9 AM ET."}
          </Typography>
        )}
      </AppCard>
    );
  }

  const sinceLabel = changeWindow(s);
  const best = s.rows.filter((r) => r.change !== null && Math.round(r.change) > 0).sort((a, b) => (b.change ?? 0) - (a.change ?? 0))[0];
  // Members without picks follow along; so do members who joined after picks
  // locked, who play from the next season (the roster is fixed at the lock).
  const byViewerFirst = <T extends { isViewer: boolean }>(list: T[]) => [...list].sort((a, b) => Number(b.isViewer) - Number(a.isViewer));
  const noEntry = byViewerFirst(s.noEntry.filter((p) => !p.joinedAfterLock));
  const lateJoiners = byViewerFirst(s.noEntry.filter((p) => p.joinedAfterLock));

  return (
    <AppCard>
      {header}
      {tabs}
      {everyone}
      {tab === "group" && (
        <>
        {failed && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="caption" sx={{ color: DOWN }}>Couldn&apos;t refresh the standings.</Typography>
            <Button variant="text" size="small" onClick={() => load()} sx={{ textTransform: "none", fontWeight: 700, minHeight: 32 }}>Try again</Button>
          </Stack>
        )}
        {best && best.change !== null && (
          <Typography variant="body2" sx={{ mb: 1.25 }}>
            {displayName(best)} {sinceLabel === "today" ? "had the best day" : `gained the most ${sinceLabel}`},{" "}
            <Box component="span" sx={{ color: UP, fontWeight: 800 }}>{signed(best.change)}</Box>.
          </Typography>
        )}
        <Stack component="ol" spacing={0.75} aria-label="Standings" sx={{ m: 0, p: 0 }}>
          {items.map((item, i) =>
            item.kind === "player" ? (
              <PlayerRow key={item.row.userId} row={item.row} sinceLabel={sinceLabel} href={`/communities/${slug}/players/${item.row.userId}${past ? seasonQuery(setCode) : ""}`} open={openRow === item.row.userId} onToggle={() => setOpenRow((cur) => (cur === item.row.userId ? null : item.row.userId))} />
            ) : item.kind === "mind" && s.groupMind ? (
              <GroupMindRow key="mind" mind={s.groupMind} sinceLabel={sinceLabel} />
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
            {joinNames(noEntry.map((p) => displayName(p)))}{" "}
            {s.isFinal ? "didn't make picks this season." : `${noEntry.length === 1 && !noEntry[0].isViewer ? "is" : "are"} following along.`}
          </Typography>
        )}
        {lateJoiners.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: noEntry.length > 0 ? 0.5 : 1.5 }}>
            {joinNames(lateJoiners.map((p) => displayName(p)))} joined after picks locked, so{" "}
            {lateJoiners.length === 1 ? (lateJoiners[0].isViewer ? "you play" : "they play") : lateJoiners.some((p) => p.isViewer) ? "you all play" : "they all play"} from the next season.
          </Typography>
        )}
        </>
      )}
    </AppCard>
  );
}
