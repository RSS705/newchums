"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import MilitaryTechRoundedIcon from "@mui/icons-material/MilitaryTechRounded";
import { AppCard } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { BadgeIcon } from "../badgeIcons";
import { IconTitle, srOnly } from "../pageBits";
import ShareResultsImage from "./ShareResultsImage";
import { ordinal, seasonQuery, type MtgBadgeTier, type MtgCeremonyBadge, type MtgResultsPayload } from "../mtgTypes";

type Results = NonNullable<MtgResultsPayload["results"]>;
type Load = { kind: "loading" } | { kind: "error"; retrying: boolean } | { kind: "ready"; data: MtgResultsPayload };

const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const personName = (p: { name: string | null; username: string | null }) => p.name?.trim() || (p.username ? `@${p.username}` : "Member");
/** A phone's podium column fits a first name; the standings below give the full one. */
const firstName = (p: { name: string | null; username: string | null }) => p.name?.trim().split(/\s+/)[0] || personName(p);
/** A YYYY-MM-DD day as "Friday, November 13, 2026": results outlive their season, in chats and on past-season pages. */
const longDay = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${key}T12:00:00Z`));
/** A whole podium column as the link's target: the link's box covers its step. */
const stretched = {
  "&::after": { content: '""', position: "absolute", inset: 0, borderRadius: "10px" },
  "&:focus-visible": { outline: "none" },
  "&:focus-visible::after": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
} as const;
const clampTwo = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" } as const;

/** Podium steps in medal colors; each label is 4.5:1 or better on its step. */
const STEPS: Record<number, { bg: string; fg: string; border: string; height: { xs: string; sm: string } }> = {
  1: { bg: "#FFF7DB", fg: "#8A6200", border: "#A87A00", height: { xs: "64px", sm: "88px" } },
  2: { bg: "#EEF1F4", fg: "#4B5563", border: "#6B7280", height: { xs: "46px", sm: "62px" } },
  3: { bg: "#F8EDE3", fg: "#8A4B1F", border: "#B87333", height: { xs: "34px", sm: "46px" } },
};
const TIER_LABEL: Record<MtgBadgeTier, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", mythic: "Mythic", shame: "Hall of Shame" };
/** Badges shown before *Show all*: the rarest, which is where the story is. */
const CEREMONY_FIRST = 8;

/**
 * The top three as a podium, first in the middle, second on the left and
 * third on the right, the middle a little wider. Tied players share a step.
 * The list is in rank order for screen readers; only the grid moves the
 * steps into place. Phones show first names, with the full name to screen readers.
 * A step with one player is a link as a whole, not just its name.
 */
function Podium({ podium, hrefFor }: { podium: Results["podium"]; hrefFor: (userId: string) => string }) {
  const ranks = [...new Set(podium.map((p) => p.rank))].sort((a, b) => a - b);
  return (
    <Box component="ol" aria-label="Podium" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr)", alignItems: "end", columnGap: { xs: 0.75, sm: 1.5 } }}>
      {ranks.map((rank, i) => {
        const people = podium.filter((p) => p.rank === rank);
        const step = STEPS[rank] ?? STEPS[3];
        const avatar = rank === 1 ? { xs: "44px", sm: "56px" } : { xs: "36px", sm: "44px" };
        return (
          <Box
            component="li"
            key={rank}
            sx={{
              gridColumn: [2, 1, 3][i], gridRow: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
              position: people.length === 1 ? "relative" : undefined, borderRadius: "10px",
              "@media (hover: hover)": people.length === 1 ? { "&:hover": { bgcolor: "action.hover" } } : {},
            }}
          >
            <Box component="span" sx={srOnly}>{ordinal(rank)} place: </Box>
            <Stack direction="row" justifyContent="center" aria-hidden sx={{ mb: 0.75 }}>
              {people.slice(0, 3).map((p, j) => (
                <Avatar
                  key={p.userId}
                  src={p.avatarUrl ? `${getAvatarBaseUrl()}${p.avatarUrl}` : undefined}
                  sx={{ width: avatar, height: avatar, ml: j === 0 ? 0 : "-10px", border: "2px solid", borderColor: "background.paper", bgcolor: "grey.300", fontSize: rank === 1 ? "1.125rem" : "0.9375rem" }}
                >
                  {personName(p).replace(/^@/, "").charAt(0).toUpperCase()}
                </Avatar>
              ))}
            </Stack>
            <Box sx={{ width: "100%", minWidth: 0, px: 0.25 }}>
              {people.map((p, j) => (
                <Typography key={p.userId} variant="body2" fontWeight={700} sx={{ lineHeight: 1.25, fontSize: { xs: "0.8125rem", sm: "0.875rem" }, ...clampTwo }}>
                  {j > 0 && <Box component="span" sx={srOnly}>and </Box>}
                  <Link component={NextLink} href={hrefFor(p.userId)} underline="hover" color="text.primary" aria-label={p.isViewer ? "You" : personName(p)} sx={people.length === 1 ? stretched : undefined}>
                    <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{p.isViewer ? "You" : personName(p)}</Box>
                    <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>{p.isViewer ? "You" : firstName(p)}</Box>
                  </Link>
                </Typography>
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 600, lineHeight: 1.3, mt: 0.25 }}>
                {whole(people[0].total)} points
              </Typography>
            </Box>
            <Box
              aria-hidden
              sx={{
                mt: 0.75, width: "100%", height: step.height, bgcolor: step.bg, color: step.fg, border: "1px solid", borderColor: step.border,
                borderBottomWidth: 0, borderRadius: "10px 10px 0 0", display: "flex", justifyContent: "center", pt: { xs: 0.5, sm: 0.75 },
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: rank === 1 ? { xs: "1.0625rem", sm: "1.25rem" } : { xs: "0.875rem", sm: "1rem" }, color: "inherit", lineHeight: 1.2 }}>
                {ordinal(rank)}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Every badge the group's players earned in the season, rarest first, each
 *  with who earned it. A badge one player earned gives that player's reason. */
function BadgeCeremony({ badges, hrefFor }: { badges: MtgCeremonyBadge[]; hrefFor: (userId: string) => string }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? badges : badges.slice(0, CEREMONY_FIRST);
  return (
    <AppCard>
      <IconTitle icon={<MilitaryTechRoundedIcon sx={{ fontSize: 18 }} />} title="Badges" caption="Every badge earned in the group this season, the rarest first." />
      {badges.length === 0 ? (
        <Typography variant="body2" color="text.secondary">Nobody in the group earned a badge this season.</Typography>
      ) : (
        <Stack component="ul" spacing={1.75} sx={{ m: 0, p: 0, listStyle: "none" }}>
          {shown.map((b) => (
            <Stack component="li" key={`${b.code}-${b.name}`} direction="row" spacing={1.25} alignItems="flex-start">
              <BadgeIcon badge={b} size={{ xs: 32, sm: 36 }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" component="h3" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                  {b.name}
                  <Box component="span" sx={{ color: "text.secondary", fontWeight: 600 }}> · {TIER_LABEL[b.tier]}</Box>
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.45 }}>
                  {b.recipients.length === 1 ? b.recipients[0].reason : b.description}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                  {b.recipients.map((p, i) => (
                    <Fragment key={p.userId}>
                      {i > 0 ? ", " : ""}
                      <Link component={NextLink} href={hrefFor(p.userId)} underline="hover" sx={{ fontWeight: 600 }}>{p.isViewer ? "You" : personName(p)}</Link>
                      {p.count > 1 ? ` ×${p.count}` : ""}
                    </Fragment>
                  ))}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      )}
      {badges.length > CEREMONY_FIRST && (
        <Button variant="text" size="small" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} sx={{ mt: 1.5, ml: -1, minHeight: 40, textTransform: "none", fontWeight: 700 }}>
          {showAll ? "Show fewer badges" : `Show all ${badges.length} badges`}
        </Button>
      )}
    </AppCard>
  );
}

type Props = {
  communityId: string;
  communityName: string;
  slug: string;
  setCode: string;
  /** A season other than the current one, so links to players carry `?set=`. */
  past?: boolean;
  /** The podium card's title; "<Set> results" by default. */
  heading?: string;
  /** Adds a button to the season's own page, for the group home between seasons. */
  seasonHref?: string;
  /** Shown between the podium and the badges: the final standings, in the spec's order. */
  between?: React.ReactNode;
};

/**
 * A finished season in a group (spec 10.2 and 10.5): the podium, the
 * viewer's own finish, the share image and the badge ceremony. The final
 * standings (`between`) show whatever happens to the podium's request; the
 * podium card says when it's loading or failed. Nothing else shows for a
 * season that isn't over.
 */
export default function SeasonResults({ communityId, communityName, slug, setCode, past = false, heading, seasonHref, between }: Props) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  // Bumped by each request, so a slow answer for an earlier season never replaces a newer one.
  const requestRef = useRef(0);

  const fetchResults = useCallback(async () => {
    const id = ++requestRef.current;
    try {
      const res = await apiFetch(`/mtg/communities/${communityId}/results${seasonQuery(setCode)}`, { auth: true });
      const body = await res.json();
      if (id !== requestRef.current) return;
      setLoad(res.ok && body.ok ? { kind: "ready", data: body as MtgResultsPayload } : { kind: "error", retrying: false });
    } catch {
      if (id === requestRef.current) setLoad({ kind: "error", retrying: false });
    }
  }, [communityId, setCode]);

  // Leaving the season (or the page) drops any answer still on its way.
  const dropPending = useCallback(() => { requestRef.current += 1; }, []);
  useEffect(() => {
    const t = setTimeout(() => { fetchResults(); }, 0);
    return () => { clearTimeout(t); dropPending(); };
  }, [fetchResults, dropPending]);

  const icon = <EmojiEventsRoundedIcon sx={{ fontSize: 18 }} />;
  if (load.kind !== "ready") {
    return (
      <>
        <AppCard>
          <IconTitle icon={icon} title={heading ?? "Season results"} />
          {load.kind === "loading" ? (
            <Typography variant="body2" color="text.secondary">Loading the podium…</Typography>
          ) : (
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography variant="body2" color="text.secondary" role="alert">We couldn&apos;t load the podium.</Typography>
              {/* The button stays put while it retries, so keyboard focus stays on it. */}
              <Button
                variant="text"
                size="small"
                aria-disabled={load.retrying}
                onClick={() => { if (load.retrying) return; setLoad({ kind: "error", retrying: true }); fetchResults(); }}
                sx={{ textTransform: "none", fontWeight: 700, minHeight: 40 }}
              >
                {load.retrying ? "Trying again…" : "Try again"}
              </Button>
            </Stack>
          )}
        </AppCard>
        {between}
      </>
    );
  }
  const { set, results: r } = load.data;
  if (!r) return <>{between}</>;

  const hrefFor = (userId: string) => `/communities/${slug}/players/${userId}${past ? seasonQuery(set.code) : ""}`;
  const v = r.viewer;
  const caption = `Final standings from ${longDay(r.date)} · ${r.players} ${r.players === 1 ? "player" : "players"}`;

  return (
    <>
      <AppCard>
        <IconTitle icon={<EmojiEventsRoundedIcon sx={{ fontSize: 18 }} />} title={heading ?? `${set.name} results`} caption={caption} />
        {r.podium.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Nobody in this group played the season.</Typography>
        ) : (
          <Box sx={{ pt: 1 }}>
            <Podium podium={r.podium} hrefFor={hrefFor} />
            <Box aria-hidden sx={{ borderTop: "2px solid", borderColor: "divider" }} />
          </Box>
        )}
        {v && (
          <Typography variant="body2" sx={{ mt: 2, lineHeight: 1.55 }}>
            {v.champion ? `You're the champion of ${communityName}, with ${whole(v.total)} points.` : `You finished ${ordinal(v.rank)} of ${r.players} with ${whole(v.total)} points.`}
            {v.badgeCount > 0 ? ` You earned ${v.badgeCount} ${v.badgeCount === 1 ? "badge" : "badges"}.` : ""}
          </Typography>
        )}
        <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 2 }}>
          {r.podium.length > 0 && (
            <ShareResultsImage
              setCode={set.code}
              setName={set.name}
              groupName={communityName}
              finalDateLabel={longDay(r.date)}
              players={r.players}
              podium={r.podium.map((p) => ({ rank: p.rank, name: personName(p), total: p.total }))}
              viewer={v ? { name: v.name, rank: v.rank, total: v.total, badgeCount: v.badgeCount, topBadges: v.topBadges } : null}
            />
          )}
          {seasonHref && (
            <Button component={NextLink} href={seasonHref} variant="text" endIcon={<ChevronRightRoundedIcon />} sx={{ textTransform: "none", fontWeight: 700, minHeight: 44 }}>
              See the final standings
            </Button>
          )}
        </Stack>
      </AppCard>
      {between}
      <BadgeCeremony badges={r.badges} hrefFor={hrefFor} />
    </>
  );
}
