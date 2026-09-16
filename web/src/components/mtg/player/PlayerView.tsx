"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import LeaderboardRoundedIcon from "@mui/icons-material/LeaderboardRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import { AppCard } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import HistoryLineChart from "../charts/HistoryLineChart";
import { loadChallengeGroup, type ChallengeGroupRef } from "../challengeGroup";
import { IconTitle, StatTile, srOnly } from "../pageBits";
import BadgeChip from "../reveal/BadgeChip";
import {
  MTG_ATTRIBUTION, MTG_RARITIES, MTG_SLOTS_PER_RARITY, MTG_TOTAL_PICKS, RARITY_LABEL, RARITY_PLURAL, SLOT_MULTIPLIERS,
  formatCount, formatDayKey, formatWhen, formatWinRate, ordinal, smallCardImage,
  type MtgBadge, type MtgCard, type MtgPlayerPayload, type MtgPlayerPick, type MtgRarity, type MtgTopCard,
} from "../mtgTypes";

type Load =
  | { kind: "loading" }
  | { kind: "sealed"; lockAt: string | null; group: ChallengeGroupRef }
  | { kind: "error"; message: string; group: ChallengeGroupRef | null; retry: boolean }
  | { kind: "ready"; data: MtgPlayerPayload };

/** Movement colors, as on the leaderboard: 5.0:1 and 6.5:1 on white. */
const UP = "#15803D";
const DOWN = "#B91C1C";
/** A link whose tap area is its whole row: the row is `position: relative`,
 *  and only the name is announced as the link. */
const stretchedLink = {
  "&::after": { content: '""', position: "absolute", inset: 0, borderRadius: 1.5 },
  "&:focus-visible": { outline: "none" },
  "&:focus-visible::after": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
} as const;

/** Up to two lines, then an ellipsis: card names matter more than row height. */
const clampTwo = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" } as const;
const displayName = (p: { name: string | null; username: string | null }) => p.name || (p.username ? `@${p.username}` : "Member");
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const tenths = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signedWhole = (n: number) => (Math.round(n) > 0 ? `+${whole(n)}` : Math.round(n) < 0 ? `−${whole(-n)}` : "±0");
const days = (n: number) => (n === 1 ? "1 day" : `each of ${n} days`);
const shiftDay = (key: string, days: number) => new Date(Date.parse(`${key}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const weekday = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(new Date(`${key}T12:00:00Z`));

/** Earned badges, then the ones the latest standings put the player on track
 *  for, drawn as outlines and explained, since they can still slip away. */
function BadgesCard({ badges, isViewer, name }: { badges: MtgBadge[]; isViewer: boolean; name: string }) {
  const earned = badges.filter((b) => !b.onTrack);
  const onTrack = badges.filter((b) => b.onTrack);
  const chips = (list: MtgBadge[]) => (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
      {list.map((b) => <BadgeChip key={`${b.code}-${b.name}`} badge={b} />)}
    </Stack>
  );
  return (
    <AppCard>
      <IconTitle icon={<EmojiEventsRoundedIcon sx={{ fontSize: 18 }} />} title="Badges" caption="Tap a badge to see why." />
      {earned.length > 0 && (
        <Box>
          <Typography variant="body2" component="h3" fontWeight={700} sx={{ mb: 0.75 }}>Earned</Typography>
          {chips(earned)}
        </Box>
      )}
      {onTrack.length > 0 && (
        <Box sx={{ mt: earned.length > 0 ? 2 : 0 }}>
          <Typography variant="body2" component="h3" fontWeight={700}>On track</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
            {isViewer ? "You earn these" : `${name} earns these`} on the final day if the standings stay this way.
          </Typography>
          {chips(onTrack)}
        </Box>
      )}
    </AppCard>
  );
}

/** A card image, shown whole: Scryfall's art is never cropped or covered.
 *  Thumbnails load Scryfall's small image, a sixth the size of the normal one. */
function CardThumb({ card, width }: { card: MtgCard; width: number }) {
  const src = smallCardImage(card.imageNormal);
  return (
    <Box sx={{ width, flexShrink: 0, aspectRatio: "488 / 680", borderRadius: "4.5% / 3.2%", overflow: "hidden", bgcolor: "grey.100", border: "1px solid", borderColor: "divider" }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" width={146} height={204} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      )}
    </Box>
  );
}

/** Card Score change since the day before: ▲ green, ▼ red, ±0 when flat, to the same decimal as the score. */
function Trend({ value }: { value: number | null }) {
  if (value === null) return null;
  const r = Math.round(value * 10) / 10;
  if (r === 0) return <Box component="span" sx={{ color: "text.secondary", fontWeight: 700 }}>&nbsp;<span aria-hidden>±0</span><Box component="span" sx={srOnly}>, unchanged since the day before</Box></Box>;
  return (
    <Box component="span" sx={{ color: r > 0 ? UP : DOWN, fontWeight: 800 }}>
      &nbsp;<span aria-hidden>{r > 0 ? "▲" : "▼"}{tenths(Math.abs(r))}</span>
      <Box component="span" sx={srOnly}>, {r > 0 ? "up" : "down"} {tenths(Math.abs(r))} since the day before</Box>
    </Box>
  );
}

function PickNumbers({ pick, rarity }: { pick: MtgPlayerPick; rarity: MtgRarity }) {
  const s = pick.stats;
  if (!s) {
    return pick.cardScore === null ? null : (
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
        {pick.voided ? "Removed from scoring, so it scores 50" : "No 17Lands data yet, so it scores 50"}
      </Typography>
    );
  }
  const ranked = s.rank !== null && s.rankedCount !== null;
  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
        {/* Each figure stays whole when the line wraps on a narrow phone. */}
        {s.gihWr === null
          ? <><Box component="span" sx={{ whiteSpace: "nowrap" }}>{formatCount(s.gihGames)} games</Box> · no win rate yet</>
          : <><Box component="span" sx={{ whiteSpace: "nowrap" }}>{formatWinRate(s.gihWr)} GIH WR</Box> · <Box component="span" sx={{ whiteSpace: "nowrap" }}>{formatCount(s.gihGames)} games</Box></>}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
        <Box component="span" sx={{ whiteSpace: "nowrap" }}>{ranked ? `${ordinal(s.rank as number)} of ${s.rankedCount} ${RARITY_PLURAL[rarity]}` : "Not ranked yet"}</Box> ·{" "}
        {/* The score and its change wrap as one piece. */}
        <Box component="span" sx={{ whiteSpace: "nowrap" }}>Score {tenths(pick.cardScore ?? 50)}<Trend value={ranked ? pick.trend : null} /></Box>
      </Typography>
    </>
  );
}

/** One slot of a rarity block: the pick with its numbers and Receipt, and the viewer's own pick at that slot when comparing. */
const SlotRow = memo(function SlotRow({ slot, pick, rarity, cardHref, comparing, mine }: {
  slot: number;
  pick: MtgPlayerPick | undefined;
  rarity: MtgRarity;
  cardHref: (id: string) => string;
  comparing: boolean;
  mine: MtgPlayerPick | undefined;
}) {
  const multiplier = SLOT_MULTIPLIERS[slot - 1];
  return (
    <Box component="li" sx={{ listStyle: "none", position: "relative", py: 1.25, borderTop: "1px solid", borderColor: "divider", "&:first-of-type": { borderTop: 0, pt: 0.25 }, "@media (hover: hover)": { "&:hover .pick-chevron": { color: "primary.main" } } }}>
      {!pick ? (
        <Typography variant="body2" color="text.secondary">#{slot} · ×{multiplier} · No pick</Typography>
      ) : (
        // The whole row opens the card's page; the chevron says so on phones, which have no hover.
        <Box sx={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) auto 18px", columnGap: { xs: 1, sm: 1.25 }, alignItems: "start" }}>
          <CardThumb card={pick.card} width={44} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 700, lineHeight: 1.3 }}>#{slot} · ×{multiplier}</Typography>
            <Link component={NextLink} href={cardHref(pick.card.id)} underline="hover" color="text.primary" title={pick.card.name}
              sx={{ ...clampTwo, ...stretchedLink, fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.3 }}>
              {pick.card.name}
            </Link>
            <PickNumbers pick={pick} rarity={rarity} />
            {pick.note && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontStyle: "italic", overflowWrap: "anywhere", lineHeight: 1.45 }}>&ldquo;{pick.note}&rdquo;</Typography>
            )}
          </Box>
          {pick.points !== null ? (
            <Box sx={{ textAlign: "right" }}>
              <Typography sx={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{tenths(pick.points)}</Typography>
              <Typography variant="caption" color="text.secondary">points</Typography>
            </Box>
          ) : <span />}
          <ChevronRightRoundedIcon className="pick-chevron" aria-hidden sx={{ fontSize: 18, color: "text.disabled", alignSelf: "center" }} />
        </Box>
      )}
      {comparing && (
        // Above the row's link, so its own link stays tappable.
        <Box sx={{ position: "relative", zIndex: 1, mt: 1, ml: { xs: 0, sm: "56px" }, px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: "grey.50", border: "1px solid", borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
            <Box component="span" sx={{ fontWeight: 800, color: "text.primary" }}>You:</Box>{" "}
            {!mine ? "no pick" : mine.card.id === pick?.card.id ? "the same card" : (
              <Link component={NextLink} href={cardHref(mine.card.id)} underline="hover" sx={{ fontWeight: 700 }}>{mine.card.name}</Link>
            )}
            {mine && mine.points !== null ? ` · ${tenths(mine.points)} points` : ""}
          </Typography>
        </Box>
      )}
    </Box>
  );
});

function TopFive({ top, picks, rarity, cardHref, whose }: { top: MtgTopCard[]; picks: MtgPlayerPick[]; rarity: MtgRarity; cardHref: (id: string) => string; whose: "Your" | "Their" }) {
  const [open, setOpen] = useState(false);
  if (top.length === 0) return null;
  return (
    <Box sx={{ mt: 0.5 }}>
      <Button
        variant="text"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        endIcon={<ExpandMoreRoundedIcon sx={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }} />}
        sx={{ textTransform: "none", fontWeight: 700, ml: -1, minHeight: 44 }}
      >
        {/* One inline span: a button lays its children out as flex items, which would drop the spaces. */}
        <span>Actual top 5<Box component="span" sx={srOnly}> {RARITY_PLURAL[rarity]}</Box> right now</span>
      </Button>
      <Collapse in={open} unmountOnExit>
        <Stack component="ol" spacing={0.5} aria-label={`The top 5 ${RARITY_PLURAL[rarity]} right now`} sx={{ m: 0, p: 0, pt: 0.5 }}>
          {top.map((t) => {
            const picked = picks.find((p) => p.card.id === t.card.id);
            return (
              <Box component="li" key={t.card.id} sx={{ listStyle: "none", position: "relative", display: "grid", gridTemplateColumns: "18px 32px minmax(0, 1fr) auto 18px", columnGap: 1, alignItems: "center", minHeight: 48, py: 0.25 }}>
                <Typography sx={{ fontWeight: 800, fontSize: "0.875rem", textAlign: "right" }}>{t.rank}</Typography>
                <CardThumb card={t.card} width={32} />
                <Box sx={{ minWidth: 0 }}>
                  <Link component={NextLink} href={cardHref(t.card.id)} underline="hover" color="text.primary" title={t.card.name}
                    sx={{ ...clampTwo, ...stretchedLink, fontWeight: 700, fontSize: "0.875rem", lineHeight: 1.3 }}>
                    {t.card.name}
                  </Link>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.35 }}>
                    {t.gihWr === null ? "no win rate yet" : `${formatWinRate(t.gihWr)} GIH WR`} · {formatCount(t.gihGames)} games
                  </Typography>
                </Box>
                {picked ? <Chip size="small" color="primary" variant="outlined" label={`${whose} #${picked.slot}`} sx={{ fontWeight: 700 }} /> : <span />}
                <ChevronRightRoundedIcon aria-hidden sx={{ fontSize: 18, color: "text.disabled" }} />
              </Box>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
  );
}

/**
 * A player's page in a challenge group (spec 10.6): their standing and points
 * over time, their badges, and each rarity's five picks with the card's win
 * rate, games, rank, Card Score, points, trend and Receipt. Each rarity folds
 * out the actual top five right now, and can set the viewer's own picks
 * alongside. Another player's page opens at the lock; your own before it.
 */
export default function PlayerView() {
  const params = useParams<{ slug: string; userId: string }>();
  const slug = params?.slug ?? "";
  const userId = params?.userId ?? "";
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [comparing, setComparing] = useState<MtgRarity[]>([]);
  // Bumped by Try again, which reruns the load below.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!slug || !userId) return;
    let cancelled = false;
    (async () => {
      let group: ChallengeGroupRef | null = null;
      try {
        group = await loadChallengeGroup(slug);
        if (cancelled) return;
        if (!group) { setLoad({ kind: "error", message: "We couldn't find that challenge group.", group: null, retry: false }); return; }
        const res = await apiFetch(`/mtg/communities/${group.id}/players/${encodeURIComponent(userId)}`, { auth: true });
        const body = await res.json();
        if (cancelled) return;
        if (res.status === 403 && body.error === "SEALED") { setLoad({ kind: "sealed", lockAt: body.lockAt ?? null, group }); return; }
        if (res.status === 403) { setLoad({ kind: "error", message: `Join ${group.name} to see its players.`, group, retry: false }); return; }
        if (res.status === 404) { setLoad({ kind: "error", message: "That player isn't in this group.", group, retry: false }); return; }
        if (!res.ok || !body.ok) { setLoad({ kind: "error", message: "We couldn't load this player right now.", group, retry: true }); return; }
        setLoad({ kind: "ready", data: body as MtgPlayerPayload });
      } catch {
        if (!cancelled) setLoad({ kind: "error", message: "We couldn't load this player. Check your connection.", group, retry: true });
      }
    })();
    return () => { cancelled = true; };
  }, [slug, userId, attempt]);

  const cardHref = useCallback((id: string) => `/communities/${slug}/cards/${id}`, [slug]);
  const data = load.kind === "ready" ? load.data : null;
  const chartPoints = useMemo(
    () => (data ? data.history.map((h) => ({ key: h.date, label: formatDayKey(h.date), value: h.total, detail: h.rank !== null ? ordinal(h.rank) : undefined })) : []),
    [data],
  );

  const groupName = data ? data.community.name : load.kind === "sealed" || load.kind === "error" ? load.group?.name : undefined;
  const back = (
    <Button component={NextLink} href={`/communities/${slug}`} variant="text" size="small" startIcon={<ArrowBackRoundedIcon />}
      sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary", ml: -1, mb: 0.5, minHeight: 40, boxShadow: "none" }}>
      {groupName ?? "Back"}
    </Button>
  );

  if (load.kind === "loading") return <Typography variant="body2" color="text.secondary" sx={{ py: 8, textAlign: "center" }}>Loading…</Typography>;
  if (!data) {
    return (
      <Stack spacing={2}>
        <Box>{back}</Box>
        <AppCard>
          <Typography variant="body1" fontWeight={700}>{load.kind === "sealed" ? "Other players' picks show here once picks lock" : load.kind === "error" ? load.message : ""}</Typography>
          {load.kind === "sealed" && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {load.lockAt ? `Picks lock ${formatWhen(load.lockAt)}. ` : ""}Then everyone&apos;s picks in {load.group.name} are revealed.
            </Typography>
          )}
          {load.kind === "error" && load.retry && (
            <Button variant="outlined" onClick={() => { setLoad({ kind: "loading" }); setAttempt((n) => n + 1); }} sx={{ mt: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 2.5, minHeight: 44 }}>
              Try again
            </Button>
          )}
        </AppCard>
      </Stack>
    );
  }

  const { player, standing } = data;
  const name = displayName(player);
  const moved = standing && standing.previousRank !== null ? standing.previousRank - standing.rank : 0;
  const sinceLabel = standing && standing.previousDate && shiftDay(standing.previousDate, 1) !== standing.date ? `since ${weekday(standing.previousDate)}` : "today";
  const lastPoint = data.history[data.history.length - 1];

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      <Box>
        {back}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
          <Avatar src={player.avatarUrl ? `${getAvatarBaseUrl()}${player.avatarUrl}` : undefined} sx={{ width: 56, height: 56, fontSize: "1.375rem", bgcolor: "grey.300" }}>
            {name.replace(/^@/, "").charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
              <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "1.5rem", sm: "2rem" }, lineHeight: 1.15, overflowWrap: "anywhere" }}>{name}</Typography>
              {player.isViewer && <Chip label="You" size="small" color="primary" sx={{ height: 22, fontSize: "0.75rem", fontWeight: 700 }} />}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {player.name && player.username ? `@${player.username} · ` : ""}{data.set.name} · {player.pickCount} of {MTG_TOTAL_PICKS} picks
            </Typography>
          </Box>
        </Stack>
      </Box>

      {standing && (
        <AppCard>
          <IconTitle
            icon={<LeaderboardRoundedIcon sx={{ fontSize: 18 }} />}
            title={`Standing in ${data.community.name}`}
            caption={`${standing.day !== null && standing.totalDays !== null ? `Day ${standing.day} of ${standing.totalDays} · ` : ""}${formatDayKey(standing.date)}${standing.isFinal ? " · Final" : ""} · 17Lands Premier Draft`}
          />
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: { xs: 0.75, sm: 1.25 } }}>
            <StatTile
              label="Rank"
              value={ordinal(standing.rank)}
              sub={
                <>
                  of {standing.players}
                  {moved !== 0 && (
                    <Box component="span" sx={{ color: moved > 0 ? UP : DOWN, fontWeight: 800 }}>
                      {" "}<span aria-hidden>{moved > 0 ? "▲" : "▼"}{Math.abs(moved)}</span>
                      <Box component="span" sx={srOnly}>, {moved > 0 ? "up" : "down"} {Math.abs(moved)}</Box>
                    </Box>
                  )}
                </>
              }
            />
            <StatTile
              label="Points"
              value={whole(standing.total)}
              sub={standing.change === null ? "First standings" : (
                <><Box component="span" sx={{ color: Math.round(standing.change) > 0 ? UP : Math.round(standing.change) < 0 ? DOWN : "text.secondary", fontWeight: 700 }}>{signedWhole(standing.change)}</Box> {sinceLabel}</>
              )}
            />
            <StatTile label="Behind 1st" value={standing.rank === 1 ? "0" : whole(standing.behind)} sub={standing.rank === 1 ? "in the lead" : "points"} />
          </Box>
        </AppCard>
      )}

      {data.history.length > 0 && lastPoint && (
        <AppCard>
          <IconTitle icon={<ShowChartRoundedIcon sx={{ fontSize: 18 }} />} title="Points over time" caption="Each morning's standing, recalculated from the season so far." />
          <HistoryLineChart
            valueName="Points"
            detailName="Group rank"
            points={chartPoints}
            format={whole}
            reference={{ value: 1000, label: "Random picks ≈ 1,000" }}
            summary={`${name}'s points on ${days(data.history.length)}, ${whole(lastPoint.total)} on the latest.`}
          />
        </AppCard>
      )}

      {data.badges.length > 0 && <BadgesCard badges={data.badges} isViewer={player.isViewer} name={name} />}

      {!player.hasEntry || player.pickCount === 0 ? (
        <AppCard>
          <Typography variant="body2" color="text.secondary">
            {data.set.phase === "upcoming" || data.set.phase === "previews" || data.set.phase === "open"
              ? player.isViewer ? "You haven't made any picks yet." : `${name} hasn't made any picks yet.`
              : player.isViewer ? "You didn't make picks this season, so you're following along." : `${name} didn't make picks this season, so they're following along.`}
          </Typography>
          {player.isViewer && data.set.phase !== "locked" && data.set.phase !== "live" && data.set.phase !== "final" && (
            <Button component={NextLink} href={`/communities/${slug}/picks`} variant="contained" sx={{ mt: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none" }}>
              Make your picks
            </Button>
          )}
        </AppCard>
      ) : (
        <>
          {!standing && (
            <AppCard>
              <Typography variant="body2" color="text.secondary">
                {data.set.phase === "upcoming" || data.set.phase === "previews" || data.set.phase === "open"
                  ? "Only you can see your picks until picks lock. Card numbers and points start the morning after the Arena launch."
                  : "Card numbers and points arrive with the first standings, the morning after the Arena launch."}
              </Typography>
            </AppCard>
          )}
          {MTG_RARITIES.map((rarity) => {
            const picks = data.picks[rarity];
            const mine = data.compare?.[rarity] ?? [];
            const on = comparing.includes(rarity);
            const subtotal = standing?.subtotals[rarity] ?? null;
            const mineTotal = mine.reduce((n, p) => n + (p.points ?? 0), 0);
            return (
              <AppCard key={rarity}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" component="h2" fontWeight={800} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>{RARITY_LABEL[rarity]}</Typography>
                    {subtotal !== null && (
                      <Typography variant="caption" color="text.secondary">
                        {tenths(subtotal)} points{on && data.compare ? ` · you ${tenths(mineTotal)}` : ""}
                      </Typography>
                    )}
                  </Box>
                  {data.compare && (
                    <FormControlLabel
                      control={<Switch size="small" checked={on} onChange={(e) => setComparing((cur) => (e.target.checked ? [...cur, rarity] : cur.filter((r) => r !== rarity)))} />}
                      label={<>Compare<Box component="span" sx={srOnly}> {RARITY_PLURAL[rarity]}</Box> with me</>}
                      sx={{ mr: 0, minHeight: 44, "& .MuiFormControlLabel-label": { fontSize: "0.8125rem", fontWeight: 600 } }}
                    />
                  )}
                </Stack>
                <Box component="ol" sx={{ m: 0, p: 0 }}>
                  {Array.from({ length: MTG_SLOTS_PER_RARITY }, (_, i) => i + 1).map((slot) => (
                    <SlotRow
                      key={slot}
                      slot={slot}
                      rarity={rarity}
                      pick={picks.find((p) => p.slot === slot)}
                      cardHref={cardHref}
                      comparing={on}
                      mine={mine.find((p) => p.slot === slot)}
                    />
                  ))}
                </Box>
                <TopFive top={data.top[rarity]} picks={picks} rarity={rarity} cardHref={cardHref} whose={player.isViewer ? "Your" : "Their"} />
              </AppCard>
            );
          })}
        </>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.5, px: 0.5 }}>{MTG_ATTRIBUTION}</Typography>
    </Stack>
  );
}
