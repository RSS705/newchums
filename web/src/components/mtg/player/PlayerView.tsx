"use client";

import { memo, useEffect, useState } from "react";
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
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import LeaderboardRoundedIcon from "@mui/icons-material/LeaderboardRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import { AppCard } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import HistoryLineChart from "../charts/HistoryLineChart";
import { loadChallengeGroup, type ChallengeGroupRef } from "../challengeGroup";
import { IconTitle, StatTile } from "../pageBits";
import BadgeChip from "../reveal/BadgeChip";
import {
  MTG_ATTRIBUTION, MTG_RARITIES, MTG_SLOTS_PER_RARITY, MTG_TOTAL_PICKS, RARITY_LABEL, RARITY_PLURAL, SLOT_MULTIPLIERS,
  formatCount, formatDayKey, formatWhen, formatWinRate, ordinal,
  type MtgBadge, type MtgCard, type MtgPlayerPayload, type MtgPlayerPick, type MtgRarity, type MtgTopCard,
} from "../mtgTypes";

type Load =
  | { kind: "loading" }
  | { kind: "sealed"; lockAt: string | null; group: ChallengeGroupRef }
  | { kind: "error"; message: string; group: ChallengeGroupRef | null }
  | { kind: "ready"; data: MtgPlayerPayload };

/** Movement colors, as on the leaderboard: 5.0:1 and 6.5:1 on white. */
const UP = "#15803D";
const DOWN = "#B91C1C";
// Visually hidden text for screen readers. Pixel strings on purpose: in sx a bare 1 means 100%.
const srOnly = { position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 } as const;

/** Up to two lines, then an ellipsis: card names matter more than row height. */
const clampTwo = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" } as const;
const displayName = (p: { name: string | null; username: string | null }) => p.name || (p.username ? `@${p.username}` : "Member");
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const tenths = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signedWhole = (n: number) => (Math.round(n) > 0 ? `+${whole(n)}` : Math.round(n) < 0 ? `−${whole(-n)}` : "±0");
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

/** A card image, shown whole: Scryfall's art is never cropped or covered. */
function CardThumb({ card, width }: { card: MtgCard; width: number }) {
  return (
    <Box sx={{ width, flexShrink: 0, aspectRatio: "488 / 680", borderRadius: "4.5% / 3.2%", overflow: "hidden", bgcolor: "grey.100", border: "1px solid", borderColor: "divider" }}>
      {card.imageNormal && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageNormal} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      )}
    </Box>
  );
}

/** Card Score change since the day before: ▲ green, ▼ red, – when flat. */
function Trend({ value }: { value: number | null }) {
  if (value === null) return null;
  const r = Math.round(value * 10) / 10;
  if (r === 0) return <Box component="span" sx={{ color: "text.secondary", fontWeight: 700, whiteSpace: "nowrap" }}>&nbsp;–<Box component="span" sx={srOnly}>, unchanged since the day before</Box></Box>;
  return (
    <Box component="span" sx={{ color: r > 0 ? UP : DOWN, fontWeight: 800, whiteSpace: "nowrap" }}>
      &nbsp;<span aria-hidden>{r > 0 ? "▲" : "▼"}{Math.abs(r).toLocaleString("en-US")}</span>
      <Box component="span" sx={srOnly}>, {r > 0 ? "up" : "down"} {Math.abs(r)} since the day before</Box>
    </Box>
  );
}

function PickNumbers({ pick, rarity }: { pick: MtgPlayerPick; rarity: MtgRarity }) {
  const s = pick.stats;
  if (!s) {
    return pick.cardScore === null ? null : (
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>No 17Lands numbers today · a neutral 50</Typography>
    );
  }
  const ranked = s.rank !== null && s.rankedCount !== null;
  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
        {s.gihWr === null ? `${formatCount(s.gihGames)} games · no win rate yet` : `${formatWinRate(s.gihWr)} GIH WR · ${formatCount(s.gihGames)} games`}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
        {ranked ? `${ordinal(s.rank as number)} of ${s.rankedCount} ${RARITY_PLURAL[rarity]}` : "Not ranked yet"} · Score {tenths(pick.cardScore ?? 50)}
        <Trend value={ranked ? pick.trend : null} />
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
    <Box component="li" sx={{ listStyle: "none", py: 1.25, borderTop: "1px solid", borderColor: "divider", "&:first-of-type": { borderTop: 0, pt: 0.25 } }}>
      {!pick ? (
        <Typography variant="body2" color="text.secondary">#{slot} · ×{multiplier} · No pick</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) auto", columnGap: 1.25, alignItems: "start" }}>
          <Box component={NextLink} href={cardHref(pick.card.id)} aria-hidden tabIndex={-1} sx={{ display: "block" }}>
            <CardThumb card={pick.card} width={44} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 700, lineHeight: 1.3 }}>#{slot} · ×{multiplier}</Typography>
            <Link component={NextLink} href={cardHref(pick.card.id)} underline="hover" color="text.primary" title={pick.card.name}
              sx={{ ...clampTwo, fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.3 }}>
              {pick.card.name}
            </Link>
            <PickNumbers pick={pick} rarity={rarity} />
            {pick.note && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontStyle: "italic", overflowWrap: "anywhere", lineHeight: 1.45 }}>&ldquo;{pick.note}&rdquo;</Typography>
            )}
          </Box>
          {pick.points !== null && (
            <Box sx={{ textAlign: "right" }}>
              <Typography sx={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{tenths(pick.points)}</Typography>
              <Typography variant="caption" color="text.secondary">points</Typography>
            </Box>
          )}
        </Box>
      )}
      {comparing && (
        <Box sx={{ mt: 1, ml: { xs: 0, sm: "56px" }, px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: "grey.50", border: "1px solid", borderColor: "divider" }}>
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

function TopFive({ top, picks, rarity, cardHref }: { top: MtgTopCard[]; picks: MtgPlayerPick[]; rarity: MtgRarity; cardHref: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  if (top.length === 0) return null;
  return (
    <Box sx={{ mt: 0.5 }}>
      <Button
        variant="text"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        endIcon={<ExpandMoreRoundedIcon sx={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }} />}
        sx={{ textTransform: "none", fontWeight: 700, ml: -1, minHeight: 40 }}
      >
        Actual top 5 right now
      </Button>
      <Collapse in={open} unmountOnExit>
        <Stack component="ol" spacing={1} aria-label={`The top 5 ${RARITY_PLURAL[rarity]} right now`} sx={{ m: 0, p: 0, pt: 0.5 }}>
          {top.map((t) => {
            const picked = picks.find((p) => p.card.id === t.card.id);
            return (
              <Box component="li" key={t.card.id} sx={{ listStyle: "none", display: "grid", gridTemplateColumns: "18px 32px minmax(0, 1fr) auto", columnGap: 1, alignItems: "center" }}>
                <Typography sx={{ fontWeight: 800, fontSize: "0.875rem", textAlign: "right" }}>{t.rank}</Typography>
                <CardThumb card={t.card} width={32} />
                <Box sx={{ minWidth: 0 }}>
                  <Link component={NextLink} href={cardHref(t.card.id)} underline="hover" color="text.primary" title={t.card.name}
                    sx={{ ...clampTwo, fontWeight: 700, fontSize: "0.875rem", lineHeight: 1.3 }}>
                    {t.card.name}
                  </Link>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.35 }}>
                    {formatWinRate(t.gihWr)} · {formatCount(t.gihGames)} games
                  </Typography>
                </Box>
                {picked ? <Chip size="small" color="primary" variant="outlined" label={`Picked #${picked.slot}`} sx={{ fontWeight: 700 }} /> : <span />}
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

  useEffect(() => {
    if (!slug || !userId) return;
    let cancelled = false;
    (async () => {
      let group: ChallengeGroupRef | null = null;
      try {
        group = await loadChallengeGroup(slug);
        if (cancelled) return;
        if (!group) { setLoad({ kind: "error", message: "We couldn't find that challenge group.", group: null }); return; }
        const res = await apiFetch(`/mtg/communities/${group.id}/players/${encodeURIComponent(userId)}`, { auth: true });
        const body = await res.json();
        if (cancelled) return;
        if (res.status === 403 && body.error === "SEALED") { setLoad({ kind: "sealed", lockAt: body.lockAt ?? null, group }); return; }
        if (res.status === 403) { setLoad({ kind: "error", message: `Join ${group.name} to see its players.`, group }); return; }
        if (res.status === 404) { setLoad({ kind: "error", message: "That player isn't in this group.", group }); return; }
        if (!res.ok || !body.ok) { setLoad({ kind: "error", message: "We couldn't load this player. Try again in a moment.", group }); return; }
        setLoad({ kind: "ready", data: body as MtgPlayerPayload });
      } catch {
        if (!cancelled) setLoad({ kind: "error", message: "We couldn't load this player. Check your connection and try again.", group });
      }
    })();
    return () => { cancelled = true; };
  }, [slug, userId]);

  const data = load.kind === "ready" ? load.data : null;
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
          <Typography variant="body1" fontWeight={700}>{load.kind === "sealed" ? "Picks are sealed until the lock" : load.kind === "error" ? load.message : ""}</Typography>
          {load.kind === "sealed" && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Everyone&apos;s picks in {load.group.name} are revealed when picks lock{load.lockAt ? `, ${formatWhen(load.lockAt)}` : ""}.
            </Typography>
          )}
        </AppCard>
      </Stack>
    );
  }

  const { player, standing } = data;
  const name = displayName(player);
  const cardHref = (id: string) => `/communities/${slug}/cards/${id}`;
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
            points={data.history.map((h) => ({ key: h.date, label: formatDayKey(h.date), value: h.total, detail: h.rank !== null ? ordinal(h.rank) : undefined }))}
            format={whole}
            reference={{ value: 1000, label: "Random picks ≈ 1,000" }}
            summary={`${name}'s points on each of ${data.history.length} ${data.history.length === 1 ? "day" : "days"}, ${whole(lastPoint.total)} on the latest.`}
          />
        </AppCard>
      )}

      {data.badges.length > 0 && <BadgesCard badges={data.badges} isViewer={player.isViewer} name={name} />}

      {!player.hasEntry ? (
        <AppCard>
          <Typography variant="body2" color="text.secondary">
            {player.isViewer ? "You haven't made any picks this season." : `${name} didn't lock in picks this season, so they're following along.`}
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
                {data.set.phase === "locked" || data.set.phase === "live"
                  ? "Card numbers and points arrive with the first standings, the morning after the Arena launch."
                  : "Your picks stay private until the lock. Card numbers and points start the morning after the Arena launch."}
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
                      label="Compare with me"
                      sx={{ mr: 0, minHeight: 40, "& .MuiFormControlLabel-label": { fontSize: "0.8125rem", fontWeight: 600 } }}
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
                <TopFive top={data.top[rarity]} picks={picks} rarity={rarity} cardHref={cardHref} />
              </AppCard>
            );
          })}
        </>
      )}

      <Typography variant="caption" color="text.disabled" sx={{ display: "block", lineHeight: 1.5, px: 0.5 }}>{MTG_ATTRIBUTION}</Typography>
    </Stack>
  );
}
