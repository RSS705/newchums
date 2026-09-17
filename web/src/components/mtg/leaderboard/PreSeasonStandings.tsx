"use client";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import LeaderboardRoundedIcon from "@mui/icons-material/LeaderboardRounded";
import { AppCard } from "@/components/ui";
import { getAvatarBaseUrl } from "@/lib/apiClient";
import { srOnly } from "../pageBits";
import { MTG_TOTAL_PICKS, formatWhenZoned, type MtgProgressMember } from "../mtgTypes";

const displayName = (p: { name: string | null; username: string | null; isViewer: boolean }) => (p.isViewer ? "You" : p.name || (p.username ? `@${p.username}` : "Member"));

/** A row's status in place of points. Longer ones come in two parts, which
 *  share a line on wider screens and stack on phones, so a 320 px row keeps
 *  room for the name. */
function statusParts(m: MtgProgressMember, locked: boolean): { lead: string; rest?: string; done: boolean } {
  if (locked) {
    if (m.picked === 0) return { lead: "Following", rest: "along", done: false };
    return { lead: `${m.picked} ${m.picked === 1 ? "pick" : "picks"}`, rest: "locked", done: false };
  }
  if (m.complete) return { lead: `All ${MTG_TOTAL_PICKS}`, rest: "picked", done: true };
  if (m.picked === 0) return { lead: "Not started", done: false };
  return { lead: "Picking,", rest: `${m.picked} of ${MTG_TOTAL_PICKS}`, done: false };
}

function MemberRow({ member, locked }: { member: MtgProgressMember; locked: boolean }) {
  const name = displayName(member);
  const { lead, rest, done } = statusParts(member, locked);
  const line = { display: { xs: "block", sm: "inline" }, whiteSpace: "nowrap" } as const;
  return (
    <Box
      component="li"
      sx={{
        listStyle: "none", position: "relative", display: "flex", alignItems: "center", gap: { xs: 1, sm: 1.5 }, px: { xs: 1, sm: 1.5 }, py: 1, minHeight: 56,
        borderRadius: 2, border: "1px solid", borderColor: member.isViewer ? "primary.main" : "divider", bgcolor: "background.paper",
      }}
    >
      {/* No rank until the first standings; the caption says when. */}
      <Typography aria-hidden sx={{ width: 28, flexShrink: 0, textAlign: "center", fontWeight: 800, fontSize: "1rem", color: "text.disabled" }}>?</Typography>
      <Avatar aria-hidden src={member.avatarUrl ? `${getAvatarBaseUrl()}${member.avatarUrl}` : undefined} sx={{ width: 32, height: 32, fontSize: "0.875rem", bgcolor: "grey.300", flexShrink: 0 }}>
        {(member.name || member.username || "?").charAt(0).toUpperCase()}
      </Avatar>
      <Typography variant="body2" fontWeight={700} noWrap sx={{ minWidth: 0, flex: 1 }}>
        {name}
        <Box component="span" sx={srOnly}>, </Box>
      </Typography>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0, color: done ? "success.dark" : "text.secondary" }}>
        {done && <CheckCircleRoundedIcon aria-hidden sx={{ fontSize: 18, color: "success.main" }} />}
        <Typography variant="caption" fontWeight={700} sx={{ color: "inherit", textAlign: "right", lineHeight: 1.25 }}>
          <Box component="span" sx={line}>{lead}</Box>
          {rest && <>{" "}<Box component="span" sx={line}>{rest}</Box></>}
        </Typography>
      </Stack>
    </Box>
  );
}

/**
 * The Standings card before the season goes live (spec 10.2 and 10.5). For
 * members it lists everyone in the group the way the live board will, with a
 * "?" for rank and, in place of points, how far along their picks are, or
 * after the lock how many picks they locked in. Counts only: nobody's cards
 * show before the lock. A non-member sees when standings start and that
 * joining gets them on the board, and nothing once picks have locked, since
 * they play from the next season.
 */
export default function PreSeasonStandings({ members, isMember, locked, firstStandingsAt, failed, onRetry }: {
  /** Every member's pick count, or null while it loads. */
  members: MtgProgressMember[] | null;
  isMember: boolean;
  locked: boolean;
  firstStandingsAt: string | null;
  /** The pick counts didn't load. */
  failed: boolean;
  onRetry: () => void;
}) {
  if (!isMember && locked) return null;
  const when = firstStandingsAt ? formatWhenZoned(firstStandingsAt) : "the morning after the Arena launch";
  const caption = !isMember
    ? `Standings start ${when}. Join to make your picks and get on the board.`
    : locked
      ? `Picks are locked. Scores start ${when}.`
      : `Scores start ${when}. Until then, here's how everyone's picks are coming along. Nobody sees anyone's cards until picks lock.`;

  return (
    <AppCard>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: isMember ? 1.5 : 0 }}>
        <Box aria-hidden sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <LeaderboardRoundedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>Standings</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{caption}</Typography>
        </Box>
      </Stack>
      {isMember && (
        members ? (
          members.length > 0 && (
            <Stack component="ol" spacing={0.75} aria-label="Standings" sx={{ m: 0, p: 0 }}>
              {members.map((m) => <MemberRow key={m.userId} member={m} locked={locked} />)}
            </Stack>
          )
        ) : failed ? (
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="body2" color="text.secondary" role="alert">We couldn&apos;t load everyone&apos;s picks.</Typography>
            <Button variant="text" size="small" onClick={onRetry} sx={{ textTransform: "none", fontWeight: 700, minHeight: 40 }}>Try again</Button>
          </Stack>
        ) : (
          <Stack spacing={0.75} aria-busy="true" aria-label="Loading the standings">
            {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={56} sx={{ borderRadius: 2 }} />)}
          </Stack>
        )
      )}
    </AppCard>
  );
}
