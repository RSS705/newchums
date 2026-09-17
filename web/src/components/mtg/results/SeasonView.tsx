"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { useParams, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { loadChallengeGroup, type ChallengeGroupRef } from "../challengeGroup";
import Leaderboard from "../leaderboard/Leaderboard";
import { MTG_ATTRIBUTION, seasonPageHref, seasonQuery, type MtgSeasonRef } from "../mtgTypes";
import SeasonResults from "./SeasonResults";

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string; group: ChallengeGroupRef | null; retry: boolean }
  | { kind: "ready"; group: ChallengeGroupRef; seasons: MtgSeasonRef[] };

/**
 * A season a group played (spec 10.8): the podium, the final standings, every
 * badge and a way into everyone's picks, with a switcher between the group's
 * seasons. For the group's members and super admins.
 */
export default function SeasonView() {
  const params = useParams<{ slug: string; code: string }>();
  const slug = params?.slug ?? "";
  const code = (params?.code ?? "").toLowerCase();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  // Bumped by Try again, which reruns the load below.
  const [attempt, setAttempt] = useState(0);
  // The board only uses the clock to tell stale standings from late ones; a finished season is neither.
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      let group: ChallengeGroupRef | null = null;
      try {
        group = await loadChallengeGroup(slug);
        if (cancelled) return;
        if (!group) { setLoad({ kind: "error", message: "We couldn't find that challenge group.", group: null, retry: false }); return; }
        const res = await apiFetch(`/mtg/communities/${group.id}/seasons`, { auth: true });
        const body = await res.json();
        if (cancelled) return;
        if (res.status === 403) { setLoad({ kind: "error", message: `Join ${group.name} to see its seasons.`, group, retry: false }); return; }
        if (!res.ok || !body.ok) { setLoad({ kind: "error", message: "We couldn't load this season right now.", group, retry: true }); return; }
        setLoad({ kind: "ready", group, seasons: body.seasons as MtgSeasonRef[] });
      } catch {
        if (!cancelled) setLoad({ kind: "error", message: "We couldn't load this season. Check your connection.", group, retry: true });
      }
    })();
    return () => { cancelled = true; };
  }, [slug, attempt]);

  const group = load.kind === "ready" || load.kind === "error" ? load.group : null;
  const back = (
    <Button component={NextLink} href={`/communities/${slug}`} variant="text" size="small" startIcon={<ArrowBackRoundedIcon />}
      sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary", ml: -1, mb: 0.5, minHeight: 40, boxShadow: "none" }}>
      {group?.name ?? "Back"}
    </Button>
  );

  if (load.kind === "loading") return <Typography variant="body2" color="text.secondary" sx={{ py: 8, textAlign: "center" }}>Loading…</Typography>;
  if (load.kind === "error") {
    return (
      <Stack spacing={2}>
        <Box>{back}</Box>
        <AppCard>
          <Typography variant="body1" fontWeight={700}>{load.message}</Typography>
          {load.retry && (
            <Button variant="outlined" onClick={() => { setLoad({ kind: "loading" }); setAttempt((n) => n + 1); }} sx={{ mt: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 2.5, minHeight: 44 }}>
              Try again
            </Button>
          )}
        </AppCard>
      </Stack>
    );
  }

  const { seasons } = load;
  const season = seasons.find((s) => s.code === code);
  const switcher = seasons.length > 1 && (
    <TextField
      select
      size="small"
      label="Season"
      // The theme makes fields full width, which on wider screens squeezed the title beside it.
      fullWidth={false}
      value={season ? season.code : ""}
      onChange={(e) => {
        const next = seasons.find((s) => s.code === e.target.value);
        if (next) router.push(seasonPageHref(slug, next));
      }}
      sx={{ width: { xs: "100%", sm: 240 }, flexShrink: 0 }}
    >
      {seasons.map((s) => (
        <MenuItem key={s.code} value={s.code}>{s.name}{s.isCurrent && !s.final ? " (being played)" : ""}</MenuItem>
      ))}
    </TextField>
  );

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      <Box>
        {back}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "flex-start", sm: "flex-end" }} justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "1.75rem", sm: "2.25rem" }, lineHeight: 1.1, overflowWrap: "anywhere" }}>
              {season?.name ?? "Season"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {season?.final ? `A finished season of ${load.group.name}.` : season ? "This season is still being played." : `${load.group.name} didn't play this season.`}
            </Typography>
          </Box>
          {switcher}
        </Stack>
      </Box>

      {!season || !season.final ? (
        <AppCard>
          <Typography variant="body2" color="text.secondary">
            {season ? "Its standings are on the group's page until the final day." : seasons.length > 1 ? "Pick a season the group played, or go back to the group." : "Go back to the group to see its season."}
          </Typography>
          <Button component={NextLink} href={`/communities/${slug}`} variant="contained" sx={{ mt: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none", minHeight: 44 }}>
            Go to {load.group.name}
          </Button>
        </AppCard>
      ) : (
        <>
          <SeasonResults
            communityId={load.group.id}
            communityName={load.group.name}
            slug={slug}
            setCode={season.code}
            past
            between={<Leaderboard communityId={load.group.id} slug={slug} setCode={season.code} nowMs={nowMs} firstStandingsAt={null} past />}
          />
          <AppCard>
            <Typography variant="body2" color="text.secondary">Everyone&apos;s picks for {season.name}, side by side, with the Group Mind.</Typography>
            <Button component={NextLink} href={`/communities/${slug}/reveal${seasonQuery(season.code)}`} variant="outlined" startIcon={<VisibilityRoundedIcon />} sx={{ mt: 1.5, textTransform: "none", fontWeight: 700, borderRadius: 2.5, minHeight: 44 }}>
              See everyone&apos;s picks
            </Button>
          </AppCard>
        </>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.5, px: 0.5 }}>{MTG_ATTRIBUTION}</Typography>
    </Stack>
  );
}
