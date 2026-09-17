"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import LeaderboardRoundedIcon from "@mui/icons-material/LeaderboardRounded";
import LockClockOutlinedIcon from "@mui/icons-material/LockClockOutlined";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import { AppCard } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import SeasonTimeline from "./SeasonTimeline";
import { rememberChallengeGroup } from "./challengeGroup";
import RevealSummary from "./reveal/RevealSummary";
import Leaderboard from "./leaderboard/Leaderboard";
import SeasonResults from "./results/SeasonResults";
import CardViewer from "./picks/CardViewer";
import {
  MTG_ATTRIBUTION, MTG_RARITIES, MTG_TOTAL_PICKS, RARITY_LABEL,
  type MtgCard, type MtgProgressMember, type MtgRarity, type MtgSeasonRef, type MtgSetPayload, countdown, formatWhen, seasonPageHref,
} from "./mtgTypes";

type Props = {
  communityId: string;
  /** For the group's player and card pages, which otherwise look it up again. */
  communityName: string;
  slug: string;
  isMember: boolean;
  isOwner: boolean;
  isAuthenticated: boolean | null;
};

const PHASE_COPY: Record<MtgSetPayload["phase"], { title: string; body: string }> = {
  upcoming: { title: "Next season is on the way", body: "Dates are set. Cards start appearing, and picks open, when previews begin." },
  previews: { title: "Previews are running", body: "New cards land every day as they're revealed. You can start picking now and change anything until the lock." },
  open: { title: "Picks are open", body: "Pick the five cards you think will post the highest win rate at each rarity, in order. Everything saves as you go." },
  locked: { title: "Picks are locked", body: "Nobody can change their picks now, and everyone's picks are revealed to the group. Standings start the morning after the Arena launch." },
  live: { title: "The season is live", body: "Standings update every morning from 17Lands Premier Draft data." },
  final: { title: "Season complete", body: "The final standings are in, with the podium, every badge the group earned, and a results image to share." },
};
/** From the final day until the season is finalized: the clock says final, the data doesn't yet.
 *  When 17Lands misses the final day, the next day's attempts keep trying (spec 9.1). */
const FINAL_PENDING = {
  today: { title: "Final day", body: "The last standings of the season appear as soon as 17Lands' data is in, then the podium, everyone's badges and an email with the results for everyone who played." },
  late: { title: "Final standings on the way", body: "17Lands' data for the final day is late. The last standings appear as soon as it's in, then the podium, everyone's badges and an email with the results for everyone who played." },
};
const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** Grey placeholder widths for the blank standings' player names. */
const BLANK_ROWS = ["58%", "44%", "36%"];
const buttonSx = { textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none" } as const;

function IconDisc({ children }: { children: React.ReactNode }) {
  return (
    <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {children}
    </Box>
  );
}

/**
 * The leaderboard as it will look, before there is anything to rank: column
 * headers, three placeholder rows and the random-picks line. It sits under the
 * phase copy until the real standings replace it at the Arena launch.
 */
function BlankStandings({ firstStandingsAt, picksOpen }: { firstStandingsAt: string | null; picksOpen: boolean }) {
  return (
    <Box sx={{ mt: 2.5, pt: 2.5, borderTop: "1px solid", borderColor: "divider" }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
        <IconDisc><LeaderboardRoundedIcon sx={{ fontSize: 18 }} /></IconDisc>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h3" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>Standings</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {firstStandingsAt ? `The first standings arrive ${formatWhen(firstStandingsAt)}.` : "The first standings arrive the morning after the Arena launch."}
            {picksOpen ? " Make your picks to get on the board." : ""}
          </Typography>
        </Box>
      </Stack>
      <Box aria-hidden>
        <Box sx={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) 64px", alignItems: "center", px: { xs: 1, sm: 1.5 }, pb: 0.75 }}>
          {["Rank", "Player", "Points"].map((h, i) => (
            <Typography key={h} variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.6875rem", textAlign: i === 2 ? "right" : "left" }}>
              {h}
            </Typography>
          ))}
        </Box>
        <Stack spacing={0.75}>
          {BLANK_ROWS.map((width, i) => (
            <Box key={width} sx={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) 64px", alignItems: "center", px: { xs: 1, sm: 1.5 }, minHeight: 52, borderRadius: 2, border: "1px dashed", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 800, color: "text.disabled" }}>{i + 1}</Typography>
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: "grey.200", flexShrink: 0 }} />
                <Box sx={{ height: 10, width, borderRadius: 5, bgcolor: "grey.200" }} />
              </Stack>
              <Typography sx={{ fontWeight: 800, color: "text.disabled", textAlign: "right" }}>–</Typography>
            </Box>
          ))}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1, mt: 1.25 }}>
          <Box sx={{ flex: 1, borderTop: "2px dashed", borderColor: "divider" }} />
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>Random picks ≈ 1,000</Typography>
          <Box sx={{ flex: 1, borderTop: "2px dashed", borderColor: "divider" }} />
        </Stack>
      </Box>
    </Box>
  );
}

/**
 * The challenge view that replaces a specialized community's body (the
 * community header stays above it): the phase card with the lock countdown,
 * the picks and scoring buttons, and until the season goes live a blank
 * leaderboard; every member's pick status (counts only, never cards) or,
 * after the lock, the Reveal summary (below the standings once they start);
 * the card pool, whose cards open large; and the season timeline.
 */
export default function MtgChallengeHome({ communityId, communityName, slug, isMember, isAuthenticated }: Props) {
  const [set, setSet] = useState<MtgSetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { rememberChallengeGroup({ id: communityId, name: communityName, slug }); }, [communityId, communityName, slug]);
  const [rarity, setRarity] = useState<MtgRarity>("common");
  // Every rarity at once, so switching tabs never waits on the network.
  const [pool, setPool] = useState<MtgCard[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [progress, setProgress] = useState<MtgProgressMember[] | null>(null);
  // The seasons this group has played, for past seasons and last season's results.
  const [seasons, setSeasons] = useState<MtgSeasonRef[] | null>(null);
  // After the lock the pool grid starts folded away, so the Reveal leads.
  const [poolOpen, setPoolOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/mtg/sets/current", { auth: !!isAuthenticated })
      .then((r) => r.json())
      .then((d: { ok?: boolean; set?: MtgSetPayload }) => { if (!cancelled) setSet(d.ok && d.set ? d.set : null); })
      .catch(() => { if (!cancelled) setSet(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Live countdown to the lock, ticking once a minute, and every second in
  // the last two minutes so the page switches to the Reveal at the lock itself.
  const lockMs = set ? Date.parse(set.dates.lockAt) : null;
  const closeToLock = lockMs !== null && lockMs - nowMs < 120000 && nowMs < lockMs + 5000;
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), closeToLock ? 1000 : 60000);
    return () => clearInterval(t);
  }, [closeToLock]);

  // The group's progress, which also carries the viewer's own count for the
  // button label. Deliberately not the entry route: that one tidies picks
  // whose card left the pool and reports it once, and the wizard should be
  // the one to tell the player.
  const setCode = set?.code ?? null;
  useEffect(() => {
    if (!setCode || !isMember || !isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const pRes = await apiFetch(`/mtg/communities/${communityId}/progress`, { auth: true });
        const pData = (await pRes.json()) as { ok?: boolean; members?: MtgProgressMember[] };
        if (cancelled) return;
        if (pData.ok && Array.isArray(pData.members)) setProgress(pData.members);
      } catch { /* the page still works without progress */ }
    })();
    return () => { cancelled = true; };
  }, [setCode, communityId, isMember, isAuthenticated]);
  const myPicked = progress?.find((m) => m.isViewer)?.picked ?? null;

  useEffect(() => {
    if (!setCode || !isMember || !isAuthenticated) return;
    let cancelled = false;
    apiFetch(`/mtg/communities/${communityId}/seasons`, { auth: true })
      .then((r) => r.json())
      .then((d: { ok?: boolean; seasons?: MtgSeasonRef[] }) => { if (!cancelled && d.ok && Array.isArray(d.seasons)) setSeasons(d.seasons); })
      .catch(() => { /* past seasons are extra; the page works without them */ });
    return () => { cancelled = true; };
  }, [setCode, communityId, isMember, isAuthenticated]);

  // The clock can pass the lock while the page is open; the minute tick then
  // switches the home to the Reveal without a reload.
  const pastLock = !!set && nowMs >= Date.parse(set.dates.lockAt);
  const setLocked = !!set && (set.revealOpen || pastLock || set.phase === "locked" || set.phase === "live" || set.phase === "final");
  const gridShown = !setLocked || poolOpen;

  useEffect(() => {
    if (!setCode || !gridShown || pool) return;
    let cancelled = false;
    apiFetch(`/mtg/sets/${setCode}/cards`, { auth: false })
      .then((r) => r.json())
      .then((d: { ok?: boolean; cards?: MtgCard[] }) => { if (!cancelled) setPool(d.ok && d.cards ? d.cards : []); })
      .catch(() => { if (!cancelled) setPool([]); });
    return () => { cancelled = true; };
  }, [setCode, gridShown, pool]);

  const byRarity = useMemo(() => {
    const out: Record<MtgRarity, MtgCard[]> = { common: [], uncommon: [], rare: [], mythic: [] };
    for (const card of pool ?? []) out[card.rarity]?.push(card);
    return out;
  }, [pool]);

  const lockIn = useMemo(() => (set ? countdown(set.dates.lockAt, nowMs) : null), [set, nowMs]);

  if (loading) return null;
  if (!set) {
    return (
      <AppCard>
        <Typography variant="body1" fontWeight={600}>No season is set up yet.</Typography>
        <Typography variant="body2" color="text.secondary">The next Magic set&apos;s dates will appear here once they are entered.</Typography>
      </AppCard>
    );
  }

  const finalized = set.phase === "final" && !!set.finalizedAt;
  const copy = set.phase === "final" && !finalized
    ? EASTERN_DAY.format(new Date(nowMs)) > EASTERN_DAY.format(new Date(set.dates.finalAt)) ? FINAL_PENDING.late : FINAL_PENDING.today
    : PHASE_COPY[pastLock && (set.phase === "upcoming" || set.phase === "previews" || set.phase === "open") ? "locked" : set.phase];
  const list = pool ? byRarity[rarity] : null;
  const picksHref = `/communities/${slug}/picks`;
  const afterLock = pastLock || set.phase === "locked" || set.phase === "live" || set.phase === "final";
  const revealOpen = set.revealOpen || afterLock;
  const standingsLive = !!set.standings || set.phase === "live" || set.phase === "final";
  const firstStandingsAt = set.timeline.find((e) => e.key === "first_standings")?.at ?? null;
  const picksOpenNow = set.picksOpen && !pastLock;
  // Until the next season locks, the last one's podium and badges stay on the home (spec 10.2).
  const lastSeason = !afterLock ? seasons?.find((s) => s.final && !s.isCurrent) ?? null : null;
  const pastSeasons = (seasons ?? []).filter((s) => !s.isCurrent && s.final);

  let cta: React.ReactNode = null;
  if (picksOpenNow) {
    cta = isMember ? (
      <Button component={Link} href={picksHref} variant="contained" size="large" sx={buttonSx}>
        {myPicked ? `Edit your picks (${myPicked} of ${MTG_TOTAL_PICKS})` : "Make your picks"}
      </Button>
    ) : (
      <Button variant="contained" size="large" disabled sx={buttonSx}>
        Join to make your picks
      </Button>
    );
  } else if (afterLock && isMember && myPicked) {
    cta = (
      <Button component={Link} href={picksHref} variant="outlined" size="large" sx={buttonSx}>
        View your picks
      </Button>
    );
  } else if (set.phase === "upcoming") {
    cta = (
      <Button variant="contained" size="large" disabled sx={buttonSx}>
        {set.dates.previewsStartAt ? `Picks open ${formatWhen(set.dates.previewsStartAt)}` : "Picks open soon"}
      </Button>
    );
  }

  const done = progress ? progress.filter((m) => m.complete).length : 0;

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {/* Phase card: what is happening, the one number people care about, and
          until the season goes live, the standings as they will look. */}
      <AppCard>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }} justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1.25 }}>
              <Chip label="MTG Card Evaluation Challenge" size="small" sx={{ fontWeight: 700, bgcolor: "primary.light", color: "primary.dark", height: 22, fontSize: "0.6875rem" }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600}>Current Set: {set.name}</Typography>
            </Stack>
            <Typography component="h2" sx={{ fontWeight: 700, fontSize: { xs: "1.25rem", sm: "1.375rem" }, lineHeight: 1.2 }}>{copy.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.55 }}>{copy.body}</Typography>
          </Box>
          {!afterLock && set.phase !== "final" && (
            <Box
              sx={{
                flexShrink: 0, px: 2, py: 1.5, borderRadius: 2.5, border: "1px solid", borderColor: "divider",
                bgcolor: (theme) => (theme.palette.mode === "light" ? "grey.50" : "rgba(255,255,255,0.04)"),
                textAlign: { xs: "left", sm: "center" }, minWidth: { sm: 170 },
              }}
            >
              <Stack direction="row" spacing={0.75} alignItems="center" justifyContent={{ xs: "flex-start", sm: "center" }} sx={{ mb: 0.75 }}>
                <LockClockOutlinedIcon sx={{ fontSize: 18, color: "primary.main" }} />
                <Typography variant="caption" fontWeight={700} color="text.secondary">Picks lock in</Typography>
              </Stack>
              <Typography sx={{ fontWeight: 800, fontSize: "1.375rem", lineHeight: 1.1, letterSpacing: "-0.01em" }}>{lockIn ?? "now"}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>{formatWhen(set.dates.lockAt)}</Typography>
            </Box>
          )}
        </Stack>
        <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 2 }}>
          {cta}
          <Button component={Link} href="/mtg/how-scoring-works" variant="outlined" size="large" startIcon={<MenuBookRoundedIcon />} sx={buttonSx}>
            How scoring works
          </Button>
        </Stack>
        {revealOpen && !isMember && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            {set.phase === "final"
              ? "Join the group to see the final standings and everyone's picks, and to play next season."
              : `Picks for ${set.name} are locked, so new members follow this season and play from the next one. Join to see everyone's picks and the standings.`}
          </Typography>
        )}
        {!standingsLive && <BlankStandings firstStandingsAt={firstStandingsAt} picksOpen={picksOpenNow} />}
      </AppCard>

      {/* Between seasons, last season's podium and badges until this one locks. */}
      {isMember && lastSeason && (
        <SeasonResults
          communityId={communityId}
          communityName={communityName}
          slug={slug}
          setCode={lastSeason.code}
          past
          heading={`Last season: ${lastSeason.name}`}
          seasonHref={seasonPageHref(slug, lastSeason)}
        />
      )}

      {/* From the Arena launch the standings lead (waiting for the first day at
          first), and the Reveal sits one tap below. Once the season is over the
          podium comes first, then the final standings, then every badge. */}
      {isMember && finalized ? (
        <SeasonResults
          communityId={communityId}
          communityName={communityName}
          slug={slug}
          setCode={set.code}
          between={<Leaderboard communityId={communityId} slug={slug} setCode={set.code} nowMs={nowMs} firstStandingsAt={firstStandingsAt} />}
        />
      ) : isMember && standingsLive && <Leaderboard communityId={communityId} slug={slug} setCode={set.code} nowMs={nowMs} firstStandingsAt={firstStandingsAt} />}
      {revealOpen && isMember && <RevealSummary communityId={communityId} slug={slug} />}

      {/* Every member and how far along their picks are. Counts only: nobody's
          cards leave the server before the lock. */}
      {!revealOpen && isMember && progress && progress.length > 0 && (
        <AppCard>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
            <IconDisc><GroupsRoundedIcon sx={{ fontSize: 18 }} /></IconDisc>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" component="h2" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>Pick status</Typography>
              <Typography variant="caption" color="text.secondary">
                {done} of {progress.length} finished. Everyone&apos;s picks stay private until picks lock, then they&apos;re revealed to the group.
              </Typography>
            </Box>
          </Stack>
          <Stack spacing={0.75}>
            {progress.map((m) => (
              <Stack key={m.userId} direction="row" spacing={1.25} alignItems="center" sx={{ py: 0.5 }}>
                <Avatar src={m.avatarUrl ? `${getAvatarBaseUrl()}${m.avatarUrl}` : undefined} sx={{ width: 32, height: 32, fontSize: "0.875rem", bgcolor: "grey.300" }}>
                  {(m.name || m.username || "?").charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={600} sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.isViewer ? "You" : m.name || (m.username ? `@${m.username}` : "Member")}
                  </Typography>
                </Box>
                {m.complete ? (
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "success.main", flexShrink: 0 }}>
                    <CheckCircleRoundedIcon sx={{ fontSize: 18 }} />
                    <Typography variant="caption" fontWeight={700} sx={{ color: "inherit" }}>Done</Typography>
                  </Stack>
                ) : (
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ flexShrink: 0 }}>
                    {m.picked === 0 ? "Not started" : `${m.picked} of ${MTG_TOTAL_PICKS}`}
                  </Typography>
                )}
              </Stack>
            ))}
          </Stack>
        </AppCard>
      )}

      {/* Pool as it fills during previews. */}
      <AppCard>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
          <IconDisc><StyleRoundedIcon sx={{ fontSize: 18 }} /></IconDisc>
          <Box>
            <Typography variant="h6" component="h2" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>The card pool</Typography>
            <Typography variant="caption" color="text.secondary">
              {set.galleryComplete ? "The full card list is in." : "Automatically updates as cards are revealed."}
              {set.lastCardSyncAt ? ` Last checked ${formatWhen(set.lastCardSyncAt)}.` : ""}
            </Typography>
          </Box>
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
          {MTG_RARITIES.map((r) => (
            <Box key={r} sx={{ textAlign: "center", py: 1, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: "1.125rem", sm: "1.375rem" }, lineHeight: 1.1 }}>{set.pool[r]}</Typography>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: "block", lineHeight: 1.2, mt: 0.25 }}>{RARITY_LABEL[r]}</Typography>
            </Box>
          ))}
        </Box>
        {revealOpen && (
          <Button
            variant="text"
            size="small"
            onClick={() => setPoolOpen((open) => !open)}
            aria-expanded={poolOpen}
            sx={{ mt: 1.5, ml: -1, minHeight: 40, textTransform: "none", fontWeight: 700, boxShadow: "none" }}
          >
            {poolOpen ? "Hide the cards" : "Browse the cards"}
          </Button>
        )}
        {gridShown && (
          <>
          <Tabs
            value={rarity}
            onChange={(_, v) => setRarity(v as MtgRarity)}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{ mt: 2, minHeight: 40, borderBottom: "1px solid", borderColor: "divider", "& .MuiTabs-indicator": { height: 3, borderRadius: 2 } }}
          >
            {MTG_RARITIES.map((r) => (
              <Tab key={r} value={r} label={`${RARITY_LABEL[r]} (${set.pool[r]})`} sx={{ textTransform: "none", fontWeight: 600, minHeight: 40, fontSize: "0.875rem" }} />
            ))}
          </Tabs>
          {list && list.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              No {RARITY_LABEL[rarity].toLowerCase()} revealed yet.
            </Typography>
          )}
          {(!list || list.length > 0) && (
            <Box
              aria-busy={!list}
              sx={{
                mt: 2,
                display: "grid",
                gridTemplateColumns: { xs: "repeat(3, 1fr)", sm: "repeat(5, 1fr)", md: "repeat(6, 1fr)", lg: "repeat(7, 1fr)" },
                gap: { xs: 0.75, sm: 1 },
              }}
            >
              {!list
                ? Array.from({ length: 7 }, (_, i) => (
                    // Placeholders the size of cards, so the first load doesn't jump.
                    <Box key={i} aria-hidden sx={{ aspectRatio: "488 / 680", borderRadius: "4.5% / 3.2%", bgcolor: "grey.100" }} />
                  ))
                : list.map((card, i) => (
                    <Box key={card.id} sx={{ minWidth: 0 }}>
                      <ButtonBase
                        onClick={() => setViewerIndex(i)}
                        aria-label={`Open ${card.name}`}
                        sx={{
                          display: "block", width: "100%", position: "relative", aspectRatio: "488 / 680", borderRadius: "4.5% / 3.2%", overflow: "hidden",
                          bgcolor: "grey.100", border: "1px solid", borderColor: "divider",
                          "&.Mui-focusVisible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
                        }}
                      >
                        {card.imageNormal ? (
                          // Scryfall art is shown whole, never cropped, per their rules.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={card.imageNormal} alt="" loading="lazy" style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }} />
                        ) : (
                          <Box sx={{ p: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Typography variant="caption" fontWeight={600} sx={{ textAlign: "center" }}>{card.name}</Typography>
                          </Box>
                        )}
                      </ButtonBase>
                      <Typography variant="caption" sx={{ display: "block", mt: 0.5, fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={card.name}>
                        {card.name}
                      </Typography>
                    </Box>
                  ))}
            </Box>
          )}
          </>
        )}
      </AppCard>

      {isMember && pastSeasons.length > 0 && (
        <AppCard>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
            <IconDisc><HistoryRoundedIcon sx={{ fontSize: 18 }} /></IconDisc>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" component="h2" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>Past seasons</Typography>
              <Typography variant="caption" color="text.secondary">Final standings, badges and everyone&apos;s picks from each season the group played.</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {pastSeasons.map((s) => (
              <Button key={s.code} component={Link} href={seasonPageHref(slug, s)} variant="outlined" sx={{ ...buttonSx, minHeight: 44 }}>
                {s.name}
              </Button>
            ))}
          </Stack>
        </AppCard>
      )}

      <SeasonTimeline entries={set.timeline} setName={set.name} />

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.5, px: 0.5 }}>
        {MTG_ATTRIBUTION}
      </Typography>

      {viewerIndex !== null && list && list.length > 0 && (
        <CardViewer
          open
          cards={list}
          index={Math.min(viewerIndex, list.length - 1)}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          picks={[]}
          locked
          hideAction
          onAdd={() => {}}
          onRemove={() => {}}
          onReplace={() => {}}
        />
      )}
    </Stack>
  );
}
