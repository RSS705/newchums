"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import LockClockOutlinedIcon from "@mui/icons-material/LockClockOutlined";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import SeasonTimeline from "./SeasonTimeline";
import { rememberChallengeGroup } from "./challengeGroup";
import RevealSummary from "./reveal/RevealSummary";
import Leaderboard from "./leaderboard/Leaderboard";
import PreSeasonStandings from "./leaderboard/PreSeasonStandings";
import SeasonResults from "./results/SeasonResults";
import {
  MTG_ATTRIBUTION, MTG_TOTAL_PICKS,
  type MtgProgressMember, type MtgSeasonRef, type MtgSetPayload, countdown, formatWhen, seasonPageHref,
} from "./mtgTypes";

type Props = {
  communityId: string;
  /** For the group's player and card pages, which otherwise look it up again. */
  communityName: string;
  slug: string;
  isMember: boolean;
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

const buttonSx = { textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none" } as const;

function IconDisc({ children }: { children: React.ReactNode }) {
  return (
    <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {children}
    </Box>
  );
}

/**
 * The challenge view on a specialized community's Challenge tab, in place of
 * Plans (the community header, and the Members and Requests tabs, stay
 * around it): the phase card with the lock countdown and the picks and
 * scoring buttons; the standings, which until the season goes live list
 * every member with how far along their picks are (counts only, never
 * cards) and a "?" for rank; after the lock, the Reveal summary below them;
 * past seasons; and the season timeline.
 */
export default function MtgChallengeHome({ communityId, communityName, slug, isMember, isAuthenticated }: Props) {
  const [set, setSet] = useState<MtgSetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  // The season didn't load (a network or server error), as opposed to there
  // being no season yet, which the API answers with a 404.
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Bumped by Try again, which reruns the season load below.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { rememberChallengeGroup({ id: communityId, name: communityName, slug }); }, [communityId, communityName, slug]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [progress, setProgress] = useState<MtgProgressMember[] | null>(null);
  // The pick counts didn't load; the standings' Try again bumps the attempt.
  const [progressFailed, setProgressFailed] = useState(false);
  const [progressAttempt, setProgressAttempt] = useState(0);
  // The seasons this group has played, for past seasons and last season's results.
  const [seasons, setSeasons] = useState<MtgSeasonRef[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/mtg/sets/current", { auth: !!isAuthenticated });
        const d = (await res.json()) as { ok?: boolean; set?: MtgSetPayload | null; error?: string };
        if (cancelled) return;
        if (d.ok || (res.status === 404 && d.error === "NOT_FOUND")) {
          setSet(d.ok && d.set ? d.set : null);
          setLoadFailed(false);
        } else {
          setLoadFailed(true);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) { setLoading(false); setRetrying(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, attempt]);

  // Live countdown to the lock, ticking once a minute, and every second in
  // the last two minutes so the page switches to the Reveal at the lock itself.
  const lockMs = set ? Date.parse(set.dates.lockAt) : null;
  const closeToLock = lockMs !== null && lockMs - nowMs < 120000 && nowMs < lockMs + 5000;
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), closeToLock ? 1000 : 60000);
    return () => clearInterval(t);
  }, [closeToLock]);

  // The group's progress, for the standings before the season goes live, and
  // the viewer's own count for the button label. Deliberately not the entry
  // route: that one tidies picks whose card left the pool and reports it
  // once, and the wizard should be the one to tell the player.
  const setCode = set?.code ?? null;
  useEffect(() => {
    if (!setCode || !isMember || !isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const pRes = await apiFetch(`/mtg/communities/${communityId}/progress`, { auth: true });
        const pData = (await pRes.json()) as { ok?: boolean; members?: MtgProgressMember[] };
        if (cancelled) return;
        if (pData.ok && Array.isArray(pData.members)) {
          setProgress(pData.members);
          setProgressFailed(false);
        } else {
          setProgressFailed(true);
        }
      } catch {
        // The rest of the page works without progress; the standings offer to try again.
        if (!cancelled) setProgressFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [setCode, communityId, isMember, isAuthenticated, progressAttempt]);
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

  const lockIn = useMemo(() => (set ? countdown(set.dates.lockAt, nowMs) : null), [set, nowMs]);

  if (loading) return null;
  if (!set && loadFailed) {
    return (
      <AppCard>
        <Typography variant="body1" fontWeight={600} role="alert">We couldn&apos;t load the challenge.</Typography>
        {/* The button stays put while it retries, so keyboard focus stays on it. */}
        <Button
          variant="outlined"
          aria-disabled={retrying}
          onClick={() => { if (retrying) return; setRetrying(true); setAttempt((n) => n + 1); }}
          sx={{ ...buttonSx, mt: 1.5, minHeight: 44 }}
        >
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      </AppCard>
    );
  }
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

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {/* Phase card: what is happening, and the one number people care about. */}
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
      </AppCard>

      {/* Until the season goes live, the standings list every member and how
          far along their picks are, with ranks and points to come. Counts
          only: nobody's cards leave the server before the lock. */}
      {!standingsLive && (
        <PreSeasonStandings
          members={progress}
          isMember={isMember}
          locked={revealOpen}
          firstStandingsAt={firstStandingsAt}
          failed={progressFailed}
          onRetry={() => setProgressAttempt((n) => n + 1)}
        />
      )}

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
    </Stack>
  );
}
