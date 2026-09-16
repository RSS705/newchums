"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import FlipRoundedIcon from "@mui/icons-material/FlipRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import { AppCard } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import HistoryLineChart from "../charts/HistoryLineChart";
import { loadChallengeGroup, type ChallengeGroupRef } from "../challengeGroup";
import { IconTitle, StatTile, srOnly } from "../pageBits";
import {
  MTG_ATTRIBUTION, RARITY_PLURAL, RARITY_SINGULAR, SLOT_MULTIPLIERS,
  formatCount, formatDayKey, formatWinRate, ordinal, type MtgCardPagePayload,
} from "../mtgTypes";

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string; group: ChallengeGroupRef | null; retry: boolean }
  | { kind: "ready"; data: MtgCardPagePayload };

const displayName = (p: { name: string | null; username: string | null }) => p.name || (p.username ? `@${p.username}` : "Member");
const tenths = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A card's page in a challenge group (spec 10.7): the card whole, with a flip
 * for double-faced cards; its latest win rate, games in hand, ALSA, Card
 * Score and rank; its rank on every published day; who in the group picked
 * it and at which slot, from the lock on; and links to Scryfall and 17Lands.
 */
export default function CardPageView() {
  const params = useParams<{ slug: string; cardId: string }>();
  const slug = params?.slug ?? "";
  const cardId = params?.cardId ?? "";
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [showBack, setShowBack] = useState(false);
  // Bumped by Try again, which reruns the load below.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!slug || !cardId) return;
    let cancelled = false;
    (async () => {
      let group: ChallengeGroupRef | null = null;
      try {
        group = await loadChallengeGroup(slug);
        if (cancelled) return;
        if (!group) { setLoad({ kind: "error", message: "We couldn't find that challenge group.", group: null, retry: false }); return; }
        const res = await apiFetch(`/mtg/communities/${group.id}/cards/${encodeURIComponent(cardId)}`, { auth: true });
        const body = await res.json();
        if (cancelled) return;
        if (res.status === 403) { setLoad({ kind: "error", message: `Join ${group.name} to see its cards.`, group, retry: false }); return; }
        if (res.status === 404) { setLoad({ kind: "error", message: "That card isn't in this season.", group, retry: false }); return; }
        if (!res.ok || !body.ok) { setLoad({ kind: "error", message: "We couldn't load this card right now.", group, retry: true }); return; }
        setLoad({ kind: "ready", data: body as MtgCardPagePayload });
      } catch {
        if (!cancelled) setLoad({ kind: "error", message: "We couldn't load this card. Check your connection.", group, retry: true });
      }
    })();
    return () => { cancelled = true; };
  }, [slug, cardId, attempt]);

  const data = load.kind === "ready" ? load.data : null;
  const groupName = data ? data.community.name : load.kind === "error" ? load.group?.name : undefined;
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
          <Typography variant="body1" fontWeight={700}>{load.kind === "error" ? load.message : ""}</Typography>
          {load.kind === "error" && load.retry && (
            <Button variant="outlined" onClick={() => { setLoad({ kind: "loading" }); setAttempt((n) => n + 1); }} sx={{ mt: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 2.5, minHeight: 44 }}>
              Try again
            </Button>
          )}
        </AppCard>
      </Stack>
    );
  }

  const { card, latest } = data;
  const rarity = card.rarity;
  // The normal scan (488 px) covers the 220 to 260 px image on most screens; the large one (672 px) is there for sharper ones.
  const normal = showBack ? card.imageBackNormal ?? card.imageBackLarge : card.imageNormal ?? card.imageLarge;
  const large = showBack ? card.imageBackLarge : card.imageLarge;
  const image = normal ?? large;
  const hasBack = !!(card.imageBackLarge || card.imageBackNormal);
  const rankedDays = data.history.filter((h) => h.rank !== null);
  const mostRanked = Math.max(1, ...data.history.map((h) => h.rankedCount ?? 0));
  const lastRanked = rankedDays[rankedDays.length - 1];

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      <Box>
        {back}
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "1.5rem", sm: "2rem" }, lineHeight: 1.15, overflowWrap: "anywhere" }}>{card.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {capitalize(RARITY_SINGULAR[rarity])}{card.typeLine ? ` · ${card.typeLine}` : ""} · {data.set.name}{card.voided ? " · Removed from scoring" : ""}
        </Typography>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "220px minmax(0, 1fr)", md: "260px minmax(0, 1fr)" }, gap: { xs: 2, sm: 2.5 }, alignItems: "start" }}>
        <Box sx={{ width: "100%", maxWidth: { xs: 260, sm: "none" }, mx: { xs: "auto", sm: 0 } }}>
          <Box sx={{ aspectRatio: "488 / 680", borderRadius: "4.5% / 3.2%", overflow: "hidden", bgcolor: "grey.100", border: "1px solid", borderColor: "divider" }}>
            {image && (
              // Scryfall art is shown whole, never cropped or covered.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                srcSet={normal && large && normal !== large ? `${normal} 488w, ${large} 672w` : undefined}
                sizes="(min-width: 900px) 260px, (min-width: 600px) 220px, 260px"
                alt={showBack ? `${card.name}, back face` : card.name}
                width={488}
                height={680}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
            )}
          </Box>
          {hasBack && (
            <Button onClick={() => setShowBack((b) => !b)} startIcon={<FlipRoundedIcon />} fullWidth variant="text" sx={{ mt: 0.75, textTransform: "none", fontWeight: 700, minHeight: 40 }}>
              {showBack ? "Show the front" : "Show the back"}
            </Button>
          )}
        </Box>

        <AppCard>
          <IconTitle
            icon={<QueryStatsRoundedIcon sx={{ fontSize: 18 }} />}
            title="17Lands numbers"
            caption={latest ? `${formatDayKey(latest.date)} · Premier Draft, all users` : undefined}
          />
          {latest ? (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: { xs: 0.75, sm: 1.25 } }}>
              <StatTile label="Rank" value={latest.rank !== null ? ordinal(latest.rank) : "–"} sub={latest.rank !== null && latest.rankedCount !== null ? `of ${latest.rankedCount} ${RARITY_PLURAL[rarity]}` : "not ranked yet"} />
              <StatTile label="Card Score" value={tenths(latest.cardScore)} sub="out of 100" />
              <StatTile label="Win rate in hand" value={formatWinRate(latest.gihWr)} sub={latest.gihWr === null ? "not published yet" : "GIH WR"} />
              <StatTile label="Games in hand" value={formatCount(latest.gihGames)} sub="games" />
              {/* The fifth tile spans the row, so no empty cell sits beside it. */}
              <Box sx={{ gridColumn: "1 / -1", display: "grid" }}>
                <StatTile label="Last seen in packs" value={latest.alsa === null ? "–" : `Pick ${latest.alsa.toFixed(1)}`} sub="on average (ALSA); later means drafters pass it" />
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {card.voided
                ? "This card was removed from scoring, so it has no numbers. A pick of it scores 50."
                : !card.inPool
                  ? "This card isn't in the pool this season, so it isn't scored."
                  : data.history.length > 0
                  ? "This card has no numbers on the latest day."
                  : "Numbers arrive with the first standings, the morning after the Arena launch."}
            </Typography>
          )}
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
            <Button component="a" href={data.links.scryfall} target="_blank" rel="noopener noreferrer" variant="outlined" size="small" endIcon={<OpenInNewRoundedIcon />}
              sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, minHeight: 44 }}>
              Scryfall<Box component="span" sx={srOnly}> (opens in a new tab)</Box>
            </Button>
            <Button component="a" href={data.links.seventeenLands} target="_blank" rel="noopener noreferrer" variant="outlined" size="small" endIcon={<OpenInNewRoundedIcon />}
              sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, minHeight: 44 }}>
              17Lands card data<Box component="span" sx={srOnly}> (opens in a new tab)</Box>
            </Button>
          </Stack>
        </AppCard>
      </Box>

      {data.history.length > 0 && (
        <AppCard>
          <IconTitle icon={<ShowChartRoundedIcon sx={{ fontSize: 18 }} />} title="Rank over time" caption={`Its rank among ${RARITY_PLURAL[rarity]} each morning. First is at the top.`} />
          {rankedDays.length > 0 && lastRanked ? (
            <HistoryLineChart
              valueName="Rank"
              detailName="Card Score"
              points={rankedDays.map((h) => ({ key: h.date, label: formatDayKey(h.date), value: h.rank as number, detail: tenths(h.cardScore) }))}
              format={(v) => `#${Math.round(v)}`}
              invert
              domain={[1, mostRanked]}
              summary={`${card.name}'s rank among ${RARITY_PLURAL[rarity]} on ${rankedDays.length === 1 ? "1 day" : `each of ${rankedDays.length} days`}, ${ordinal(lastRanked.rank as number)} on the latest.`}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">Not ranked on any day yet: 17Lands doesn&apos;t publish a win rate until a card has enough games in hand.</Typography>
          )}
        </AppCard>
      )}

      <AppCard>
        <IconTitle icon={<GroupsRoundedIcon sx={{ fontSize: 18 }} />} title="Picked by" caption={`In ${data.community.name}`} />
        {data.pickedBy === null ? (
          <Typography variant="body2" color="text.secondary">Who picked this card shows here once picks lock.</Typography>
        ) : data.pickedBy.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Nobody in {data.community.name} picked this card.</Typography>
        ) : (
          <Stack component="ul" spacing={0.5} sx={{ m: 0, p: 0 }}>
            {data.pickedBy.map((p) => {
              const who = p.isViewer ? "You" : displayName(p);
              return (
                // The whole row opens the player's page.
                <Box component="li" key={p.userId} sx={{ listStyle: "none", position: "relative", display: "flex", gap: 1.25, alignItems: "flex-start", minWidth: 0, minHeight: 48, py: 0.75 }}>
                  <Avatar src={p.avatarUrl ? `${getAvatarBaseUrl()}${p.avatarUrl}` : undefined} sx={{ width: 32, height: 32, fontSize: "0.875rem", bgcolor: "grey.300" }}>
                    {who.replace(/^@/, "").charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Link component={NextLink} href={`/communities/${slug}/players/${p.userId}`} underline="hover" color="text.primary"
                      sx={{ fontWeight: 700, fontSize: "0.9375rem", overflowWrap: "anywhere", "&::after": { content: '""', position: "absolute", inset: 0, borderRadius: 1.5 }, "&:focus-visible": { outline: "none" }, "&:focus-visible::after": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}>
                      {who}
                    </Link>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.35 }}>
                      #{p.slot} {RARITY_SINGULAR[rarity]} · ×{SLOT_MULTIPLIERS[p.slot - 1]}
                    </Typography>
                    {p.note && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontStyle: "italic", overflowWrap: "anywhere" }}>&ldquo;{p.note}&rdquo;</Typography>}
                  </Box>
                  <ChevronRightRoundedIcon aria-hidden sx={{ fontSize: 18, color: "text.disabled", alignSelf: "center", flexShrink: 0 }} />
                </Box>
              );
            })}
          </Stack>
        )}
      </AppCard>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.5, px: 0.5 }}>{MTG_ATTRIBUTION}</Typography>
    </Stack>
  );
}
