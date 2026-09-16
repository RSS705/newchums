"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import LockClockOutlinedIcon from "@mui/icons-material/LockClockOutlined";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import { AppCard } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import SeasonTimeline from "./SeasonTimeline";
import RevealSummary from "./reveal/RevealSummary";
import Leaderboard from "./leaderboard/Leaderboard";
import {
  MTG_ATTRIBUTION, MTG_RARITIES, MTG_TOTAL_PICKS, RARITY_LABEL,
  type MtgCard, type MtgProgressMember, type MtgRarity, type MtgSetPayload, countdown, formatWhen,
} from "./mtgTypes";

type Props = {
  communityId: string;
  slug: string;
  isMember: boolean;
  isOwner: boolean;
  isAuthenticated: boolean | null;
};

const PHASE_COPY: Record<MtgSetPayload["phase"], { title: string; body: string }> = {
  upcoming: { title: "Next season is on the way", body: "Dates are set. Cards start appearing, and picks open, when previews begin." },
  previews: { title: "Previews are running", body: "New cards land every day as they're revealed. You can start picking now and change anything until the lock." },
  open: { title: "Picks are open", body: "Pick the five cards you think will post the highest win rate at each rarity, in order. Everything saves as you go." },
  locked: { title: "Picks are locked", body: "Entries are sealed and everyone's picks are revealed to the group. Standings start the morning after the Arena launch." },
  live: { title: "The season is live", body: "Standings update every morning from 17Lands Premier Draft data." },
  final: { title: "Season complete", body: "The last standings of the season are in." },
};

/**
 * The challenge view that replaces a specialized community's body (the
 * community header stays above it): the phase card with the lock countdown
 * and the picks button, who in the group has finished (counts only, never
 * cards) or, after the lock, the Reveal summary (below the standings once
 * they start), the pool, and the season timeline.
 */
export default function MtgChallengeHome({ communityId, slug, isMember, isAuthenticated }: Props) {
  const [set, setSet] = useState<MtgSetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [rarity, setRarity] = useState<MtgRarity>("common");
  const [cards, setCards] = useState<Record<string, MtgCard[]>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [progress, setProgress] = useState<MtgProgressMember[] | null>(null);
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

  // Live countdown to the lock, ticking once a minute.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

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

  // The clock can pass the lock while the page is open; the minute tick then
  // switches the home to the Reveal without a reload.
  const pastLock = !!set && nowMs >= Date.parse(set.dates.lockAt);
  const setLocked = !!set && (set.revealOpen || pastLock || set.phase === "locked" || set.phase === "live" || set.phase === "final");
  const gridShown = !setLocked || poolOpen;

  useEffect(() => {
    if (!set || !gridShown || cards[rarity]) return;
    let cancelled = false;
    apiFetch(`/mtg/sets/${set.code}/cards?rarity=${rarity}`, { auth: false })
      .then((r) => r.json())
      .then((d: { ok?: boolean; cards?: MtgCard[] }) => { if (!cancelled) setCards((prev) => ({ ...prev, [rarity]: d.ok && d.cards ? d.cards : [] })); })
      .catch(() => { if (!cancelled) setCards((prev) => ({ ...prev, [rarity]: [] })); });
    return () => { cancelled = true; };
  }, [set, rarity, cards, gridShown]);

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

  const copy = PHASE_COPY[pastLock && (set.phase === "upcoming" || set.phase === "previews" || set.phase === "open") ? "locked" : set.phase];
  const list = cards[rarity];
  const picksHref = `/communities/${slug}/picks`;
  const afterLock = pastLock || set.phase === "locked" || set.phase === "live" || set.phase === "final";
  const revealOpen = set.revealOpen || afterLock;

  let cta: React.ReactNode = null;
  if (set.picksOpen && !pastLock) {
    cta = isMember ? (
      <Button component={Link} href={picksHref} variant="contained" size="large" sx={{ mt: 2, textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none", width: { xs: "100%", sm: "auto" } }}>
        {myPicked ? `Edit your picks (${myPicked} of ${MTG_TOTAL_PICKS})` : "Make your picks"}
      </Button>
    ) : (
      <Button variant="contained" disabled sx={{ mt: 2, textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none" }}>
        Join to make your picks
      </Button>
    );
  } else if (afterLock && isMember && myPicked) {
    cta = (
      <Button component={Link} href={picksHref} variant="outlined" sx={{ mt: 2, textTransform: "none", fontWeight: 700, borderRadius: 2.5 }}>
        View your picks
      </Button>
    );
  } else if (set.phase === "upcoming") {
    cta = (
      <Button variant="contained" disabled sx={{ mt: 2, textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none" }}>
        {set.dates.previewsStartAt ? `Picks open ${formatWhen(set.dates.previewsStartAt)}` : "Picks open soon"}
      </Button>
    );
  }

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {/* Phase card: what is happening and the one number people care about. */}
      <AppCard>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }} justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
              <Chip label="MTG Prediction Challenge" size="small" sx={{ fontWeight: 700, bgcolor: "primary.light", color: "primary.dark", height: 22, fontSize: "0.6875rem" }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600}>{set.name}</Typography>
            </Stack>
            <Typography component="h2" sx={{ fontWeight: 700, fontSize: { xs: "1.25rem", sm: "1.375rem" }, lineHeight: 1.2 }}>{copy.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.55 }}>{copy.body}</Typography>
            <Typography component={Link} href="/mtg/how-scoring-works" variant="body2" sx={{ display: "inline-block", mt: 0.75, fontWeight: 700, color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
              How scoring works
            </Typography>
          </Box>
          {!afterLock && set.phase !== "final" && (
            <Box
              sx={{
                flexShrink: 0, px: 2, py: 1.5, borderRadius: 2.5, border: "1px solid", borderColor: "divider",
                bgcolor: (theme) => (theme.palette.mode === "light" ? "grey.50" : "rgba(255,255,255,0.04)"),
                textAlign: { xs: "left", sm: "center" }, minWidth: { sm: 170 },
              }}
            >
              <Stack direction="row" spacing={0.75} alignItems="center" justifyContent={{ xs: "flex-start", sm: "center" }}>
                <LockClockOutlinedIcon sx={{ fontSize: 18, color: "primary.main" }} />
                <Typography variant="caption" fontWeight={700} color="text.secondary">Picks lock in</Typography>
              </Stack>
              <Typography sx={{ fontWeight: 800, fontSize: "1.375rem", lineHeight: 1.1, letterSpacing: "-0.01em" }}>{lockIn ?? "now"}</Typography>
              <Typography variant="caption" color="text.disabled">{formatWhen(set.dates.lockAt)}</Typography>
            </Box>
          )}
        </Stack>
        {cta}
        {revealOpen && !isMember && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Join the group to see everyone&apos;s picks.
          </Typography>
        )}
      </AppCard>

      {/* From the Arena launch the standings lead (waiting for the first day at
          first), and the Reveal sits one tap below. */}
      {isMember && (set.standings || set.phase === "live" || set.phase === "final") && <Leaderboard communityId={communityId} nowMs={nowMs} />}
      {revealOpen && isMember && <RevealSummary communityId={communityId} slug={slug} />}

      {/* Who has finished. Counts only: nobody's cards leave the server
          before the lock. */}
      {!revealOpen && isMember && progress && progress.length > 0 && (
        <AppCard>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <GroupsRoundedIcon sx={{ fontSize: 18 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>Who&apos;s finished</Typography>
              <Typography variant="caption" color="text.secondary">
                {progress.filter((m) => m.complete).length} of {progress.length} done. Picks stay sealed until the lock.
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
          <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <StyleRoundedIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>The card pool</Typography>
            <Typography variant="caption" color="text.secondary">
              {set.galleryComplete ? "The full card list is in." : "Filling up as cards are revealed."}
              {set.lastCardSyncAt ? ` Last checked ${formatWhen(set.lastCardSyncAt)}.` : ""}
            </Typography>
          </Box>
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
          {MTG_RARITIES.map((r) => (
            <Box key={r} sx={{ textAlign: "center", py: 1.25, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: "1.125rem", sm: "1.375rem" }, lineHeight: 1.1 }}>{set.pool[r]}</Typography>
              <Typography variant="caption" fontWeight={600} color="text.secondary">{RARITY_LABEL[r]}</Typography>
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
          {!list && <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Loading cards…</Typography>}
          {list && list.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              No {RARITY_LABEL[rarity].toLowerCase()} revealed yet.
            </Typography>
          )}
          {list && list.length > 0 && (
            <Box
              sx={{
                mt: 2,
                display: "grid",
                gridTemplateColumns: { xs: "repeat(3, 1fr)", sm: "repeat(5, 1fr)", md: "repeat(6, 1fr)", lg: "repeat(7, 1fr)" },
                gap: { xs: 0.75, sm: 1 },
              }}
            >
              {list.map((card) => (
                <Box key={card.id} sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      position: "relative", aspectRatio: "488 / 680", borderRadius: "4.5% / 3.2%", overflow: "hidden",
                      bgcolor: "grey.100", border: "1px solid", borderColor: "divider",
                    }}
                  >
                    {card.imageNormal ? (
                      // Scryfall art is shown whole, never cropped, per their rules.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.imageNormal} alt={card.name} loading="lazy" style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }} />
                    ) : (
                      <Box sx={{ p: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Typography variant="caption" fontWeight={600} sx={{ textAlign: "center" }}>{card.name}</Typography>
                      </Box>
                    )}
                  </Box>
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

      <SeasonTimeline entries={set.timeline} setName={set.name} setCode={set.code} />

      <Typography variant="caption" color="text.disabled" sx={{ display: "block", lineHeight: 1.5, px: 0.5 }}>
        {MTG_ATTRIBUTION}
      </Typography>
    </Stack>
  );
}
