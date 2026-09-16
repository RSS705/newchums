"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import { AppCard } from "@/components/ui";
import BadgeChip from "@/components/mtg/reveal/BadgeChip";
import type { MtgTrophyCasePayload } from "@/components/mtg/mtgTypes";
import { apiFetch } from "@/lib/apiClient";
import ProfileSectionHeader from "./ProfileSectionHeader";

type Season = MtgTrophyCasePayload["seasons"][number];
type Badge = Season["badges"][number];

type Props = {
  handle: string;
  viewerLoggedIn: boolean;
};

/** A season's badges split by where they were earned: the player's own
 *  picks first, then each group's honors under its name, or "a private
 *  group" when the viewer may not see which. */
function bySource(badges: Badge[]) {
  const own = badges.filter((b) => b.group === null);
  const groups = new Map<string, { label: { name: string; slug: string } | null; badges: Badge[] }>();
  for (const b of badges) {
    if (b.group === null) continue;
    const key = "slug" in b.group ? b.group.slug : "private";
    const entry = groups.get(key) ?? { label: "slug" in b.group ? b.group : null, badges: [] };
    entry.badges.push(b);
    groups.set(key, entry);
  }
  return { own, groups: [...groups.values()] };
}

/**
 * The trophy case (spec 10.8): every MTG Card Evaluation Challenge badge the
 * player has earned, grouped by set, newest season first. Visible to anyone
 * who can see the profile; renders nothing for someone who hasn't played.
 */
export default function ProfileMtgBadgesSection({ handle, viewerLoggedIn }: Props) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/public/users/${encodeURIComponent(handle.replace(/^@/, ""))}/mtg-badges`, { auth: viewerLoggedIn })
      .then((r) => r.json())
      .then((d: { ok?: boolean } & Partial<MtgTrophyCasePayload>) => { if (!cancelled) setSeasons(d.ok && Array.isArray(d.seasons) ? d.seasons : []); })
      .catch(() => { if (!cancelled) setSeasons([]); });
    return () => { cancelled = true; };
  }, [handle, viewerLoggedIn]);

  if (!seasons || seasons.length === 0) return null;
  const total = seasons.reduce((n, s) => n + s.badges.reduce((m, b) => m + (b.count ?? 1), 0), 0);

  return (
    <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
      <Stack spacing={2}>
        {/* The count sits in the subtitle, not beside the title, so the title keeps two lines at 320 px. */}
        <ProfileSectionHeader
          icon={<EmojiEventsRoundedIcon sx={{ fontSize: 20 }} />}
          title="MTG Card Evaluation Challenge"
          subtitle={`${total} ${total === 1 ? "badge" : "badges"}, by season. Tap a badge to see why.`}
        />
        {seasons.map((season) => {
          const { own, groups } = bySource(season.badges);
          return (
            <Box key={season.set.code}>
              <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                {season.set.name}
                {!season.set.final && <Box component="span" sx={{ color: "text.secondary", fontWeight: 600 }}> · season in progress</Box>}
              </Typography>
              <Stack spacing={1.25} sx={{ mt: 1 }}>
                {own.length > 0 && (
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                    {own.map((b) => <BadgeChip key={`${b.code}-${b.name}`} badge={b} />)}
                  </Stack>
                )}
                {groups.map((g, i) => (
                  <Box key={g.label?.slug ?? `private-${i}`}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, overflowWrap: "anywhere" }}>
                      {g.label ? (
                        <>In <MuiLink component={Link} href={`/communities/${g.label.slug}`} underline="hover" sx={{ fontWeight: 700 }}>{g.label.name}</MuiLink></>
                      ) : "In a private group"}
                    </Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      {/* Private groups share one list, so a badge can appear once per group. */}
                      {g.badges.map((b, j) => <BadgeChip key={`${b.code}-${b.name}-${j}`} badge={b} />)}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </AppCard>
  );
}
