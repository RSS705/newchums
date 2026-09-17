"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import PsychologyAltRoundedIcon from "@mui/icons-material/PsychologyAltRounded";
import { AppCard } from "@/components/ui";
import ConfettiBurst from "@/components/ui/ConfettiBurst";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import CardViewer from "../picks/CardViewer";
import { BackButton } from "../pageBits";
import {
  MTG_ATTRIBUTION, MTG_RARITIES, MTG_SLOTS_PER_RARITY, RARITY_LABEL, RARITY_PLURAL,
  type MtgCard, type MtgRarity, type MtgRevealPayload, type MtgRevealPlayer, formatWhenZoned, seasonFromSearch, seasonQuery,
} from "../mtgTypes";
import BadgeChip from "./BadgeChip";

type GroupRef = { name: string; slug: string };

type Load =
  | { kind: "loading" }
  | { kind: "sealed"; lockAt: string | null; group: GroupRef }
  | { kind: "error"; message: string; group: GroupRef | null }
  | { kind: "ready"; data: MtgRevealPayload; celebrate: boolean };

type Viewer = { list: MtgCard[]; index: number };

/** Solo markers: 5.8:1 on white. */
const SOLO_COLOR = "#B83A0B";

const captionSx = { display: "block", fontSize: { xs: "0.625rem", sm: "0.6875rem" }, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

const displayName = (p: { name: string | null; username: string | null }) => p.name || (p.username ? `@${p.username}` : "Member");

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Ann", "Ann and Bo", "Ann, Bo and Cy". */
function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * A card thumbnail that opens the viewer, with its slot number in the
 * corner. A solo pick gets an orange frame and its label under the image:
 * Scryfall's images are never covered, and their artist and copyright line
 * runs along the bottom.
 */
function Thumb({ card, slot, onOpen, marker, detail, detailLabel }: {
  card: MtgCard;
  slot: number;
  onOpen: () => void;
  marker?: string;
  detail?: React.ReactNode;
  detailLabel?: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      aria-label={[`#${slot} ${card.name}`, marker, detailLabel].filter(Boolean).join(", ")}
      sx={{ display: "block", width: "100%", p: 0, border: 0, bgcolor: "transparent", cursor: "pointer", minWidth: 0, textAlign: "left", font: "inherit", color: "inherit", "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2, borderRadius: 1 } }}
    >
      <Box sx={{ position: "relative", aspectRatio: "488 / 680", borderRadius: "4.5% / 3.2%", overflow: "hidden", bgcolor: "grey.100", border: marker ? "2px solid" : "1px solid", borderColor: marker ? SOLO_COLOR : "divider" }}>
        {card.imageNormal ? (
          // Scryfall art is shown whole, never cropped or covered.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageNormal} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        ) : (
          <Stack sx={{ height: "100%", p: 0.5 }} alignItems="center" justifyContent="center">
            <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 700, textAlign: "center", lineHeight: 1.1 }}>{card.name}</Typography>
          </Stack>
        )}
        <Box sx={{ position: "absolute", top: 3, left: 3, minWidth: 20, height: 20, px: 0.5, borderRadius: 10, bgcolor: "rgba(17,24,39,0.82)", color: "#fff", fontSize: "0.6875rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {slot}
        </Box>
      </Box>
      <Typography variant="caption" title={card.name} sx={{ ...captionSx, mt: 0.25, fontWeight: 600 }}>
        {card.name}
      </Typography>
      {marker && (
        <Typography variant="caption" sx={{ ...captionSx, fontWeight: 800, color: SOLO_COLOR }}>
          {marker}
        </Typography>
      )}
      {detail}
    </Box>
  );
}

/** One player's picks at a rarity, their Receipts, then their lock badges.
 *  Memoised, so paging through the card viewer doesn't re-render every
 *  player. */
const PlayerRow = memo(function PlayerRow({ player, rarity, onOpen }: { player: MtgRevealPlayer; rarity: MtgRarity; onOpen: (list: MtgCard[], index: number) => void }) {
  const picks = player.picks[rarity];
  const display = displayName(player);
  const list = picks.map((p) => p.card);
  const notes = picks.filter((p) => p.note);
  return (
    <AppCard sx={player.isViewer ? { border: "2px solid", borderColor: "primary.main" } : undefined}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25, minWidth: 0 }}>
        <Avatar src={player.avatarUrl ? `${getAvatarBaseUrl()}${player.avatarUrl}` : undefined} sx={{ width: 34, height: 34, fontSize: "0.875rem", bgcolor: "grey.300" }}>
          {display.replace(/^@/, "").charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="body1" fontWeight={700} sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display}</Typography>
            {player.isViewer && <Chip label="You" size="small" color="primary" sx={{ height: 20, fontSize: "0.6875rem", fontWeight: 700 }} />}
          </Stack>
          <Typography variant="caption" color="text.secondary">{player.pickCount} of 20 picks</Typography>
        </Box>
      </Stack>
      {picks.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No {RARITY_PLURAL[rarity]} picked.</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${MTG_SLOTS_PER_RARITY}, minmax(0, 1fr))`, gap: { xs: 0.75, sm: 1.25 } }}>
          {Array.from({ length: MTG_SLOTS_PER_RARITY }, (_, i) => {
            const pick = picks.find((p) => p.slot === i + 1);
            if (!pick) {
              return (
                <Box key={i} aria-hidden sx={{ aspectRatio: "488 / 680", borderRadius: "4.5% / 3.2%", border: "1px dashed", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "center", color: "text.disabled", fontWeight: 800, fontSize: "0.75rem" }}>
                  {i + 1}
                </Box>
              );
            }
            return (
              <Thumb
                key={pick.card.id}
                card={pick.card}
                slot={pick.slot}
                onOpen={() => onOpen(list, list.findIndex((c) => c.id === pick.card.id))}
                marker={pick.onlyYou ? (player.isViewer ? "Only you" : "Solo") : undefined}
              />
            );
          })}
        </Box>
      )}
      {notes.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 1.25 }}>
          {notes.map((p) => (
            <Typography key={p.card.id} variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
              <Box component="span" sx={{ fontWeight: 800, color: "text.primary" }}>#{p.slot}</Box> {p.card.name}: <Box component="span" sx={{ fontStyle: "italic" }}>&ldquo;{p.note}&rdquo;</Box>
            </Typography>
          ))}
        </Stack>
      )}
      {player.badges.length > 0 && (
        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
          {player.badges.map((b) => <BadgeChip key={`${b.code}-${b.name}`} badge={b} />)}
        </Stack>
      )}
    </AppCard>
  );
});

/** The page's shape while it loads: the title, the rarity tabs, the Group Mind
 *  and the first player's picks. */
function RevealSkeleton() {
  const fiveCards = (
    <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${MTG_SLOTS_PER_RARITY}, minmax(0, 1fr))`, gap: { xs: 0.75, sm: 1.25 } }}>
      {Array.from({ length: MTG_SLOTS_PER_RARITY }, (_, i) => (
        <Skeleton key={i} variant="rounded" sx={{ width: "100%", height: "auto", aspectRatio: "488 / 680" }} />
      ))}
    </Box>
  );
  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }} aria-busy="true" aria-label="Loading the Reveal">
      <Box>
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "1.75rem", sm: "2.25rem" }, lineHeight: 1.1 }}>The Reveal</Typography>
        <Skeleton variant="text" sx={{ width: { xs: "90%", sm: 460 }, fontSize: "0.875rem", mt: 0.5 }} />
        <Skeleton variant="rounded" width={150} height={36} sx={{ mt: 1.25 }} />
      </Box>
      <Stack direction="row" spacing={1.5} sx={{ borderBottom: "1px solid", borderColor: "divider", pb: 1.25 }}>
        {[72, 60, 84, 76].map((w, i) => <Skeleton key={i} variant="rounded" width={w} height={24} />)}
      </Stack>
      <AppCard>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
          <Skeleton variant="circular" width={32} height={32} sx={{ flexShrink: 0, borderRadius: "50%" }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Skeleton variant="text" sx={{ width: { xs: "45%", sm: 140 }, fontSize: "1.0625rem" }} />
            <Skeleton variant="text" sx={{ width: { xs: "90%", sm: 420 }, fontSize: "0.75rem" }} />
          </Box>
        </Stack>
        {fiveCards}
      </AppCard>
      <AppCard>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
          <Skeleton variant="circular" width={34} height={34} sx={{ flexShrink: 0, borderRadius: "50%" }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Skeleton variant="text" sx={{ width: { xs: "50%", sm: 180 }, fontSize: "1rem" }} />
            <Skeleton variant="text" width={80} sx={{ fontSize: "0.75rem" }} />
          </Box>
        </Stack>
        {fiveCards}
      </AppCard>
    </Stack>
  );
}

/**
 * The Reveal (spec 10.4): opened at the lock. For one rarity at a time, the
 * Group Mind, the most-picked cards, then every player's five picks side by
 * side with solo markers, their Receipts and their lock badges. Players
 * without picks are listed at the end as following along. The first visit
 * each season opens with a burst of confetti.
 */
export default function RevealView() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  // A past season's Reveal, opened from its season page.
  const season = seasonFromSearch(useSearchParams());
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [rarity, setRarity] = useState<MtgRarity>("mythic");
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      let group: GroupRef | null = null;
      try {
        const cRes = await apiFetch(`/communities/${encodeURIComponent(slug)}`, { auth: true });
        const cData = await cRes.json();
        if (cancelled) return;
        if (!cData.ok || !cData.community || cData.community.specialization !== "mtg_prediction_challenge") {
          setLoad({ kind: "error", message: "We couldn't find that challenge group.", group: null });
          return;
        }
        group = { name: cData.community.name, slug };
        const rRes = await apiFetch(`/mtg/communities/${cData.community.id}/reveal${seasonQuery(season)}`, { auth: true });
        const rData = await rRes.json();
        if (cancelled) return;
        if (rRes.status === 403 && rData.error === "SEALED") { setLoad({ kind: "sealed", lockAt: rData.lockAt ?? null, group }); return; }
        if (rRes.status === 403) { setLoad({ kind: "error", message: `Join ${group.name} to see its Reveal.`, group }); return; }
        if (!rRes.ok || !rData.ok) { setLoad({ kind: "error", message: "We couldn't load the Reveal. Try again in a moment.", group }); return; }
        const data = rData as MtgRevealPayload;
        let celebrate = false;
        if (data.entries > 0 && !season) {
          try {
            const key = `mtg-reveal-seen:${data.set.code}`;
            if (!window.localStorage.getItem(key)) {
              window.localStorage.setItem(key, "1");
              celebrate = true;
            }
          } catch { /* no storage, no confetti */ }
        }
        setLoad({ kind: "ready", data, celebrate });
      } catch {
        if (!cancelled) setLoad({ kind: "error", message: "We couldn't load the Reveal. Check your connection and try again.", group });
      }
    })();
    return () => { cancelled = true; };
  }, [slug, season]);

  const openViewer = useCallback((list: MtgCard[], index: number) => setViewer({ list, index: Math.max(0, index) }), []);
  const data = load.kind === "ready" ? load.data : null;
  const withEntries = useMemo(() => (data ? data.players.filter((p) => p.pickCount > 0) : []), [data]);
  const noEntry = useMemo(() => (data ? data.players.filter((p) => p.pickCount === 0) : []), [data]);
  const groupName = data ? data.community.name : load.kind === "sealed" || load.kind === "error" ? load.group?.name : undefined;

  const back = <BackButton href={season ? `/communities/${slug}/seasons/${season}` : `/communities/${slug}`} label={season && data ? data.set.name : groupName ?? "Back"} />;

  if (load.kind === "loading") return <RevealSkeleton />;
  if (load.kind !== "ready" || !data) {
    return (
      <AppCard>
        <Typography variant="body1" fontWeight={700}>
          {load.kind === "sealed" ? "Everyone's picks show here once picks lock" : load.kind === "error" ? load.message : ""}
        </Typography>
        {load.kind === "sealed" && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Everyone&apos;s picks in {load.group.name} are revealed when picks lock{load.lockAt ? `, ${formatWhenZoned(load.lockAt)}` : ""}.
          </Typography>
        )}
        <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 2 }}>
          {load.kind === "sealed" && (
            <Button component={Link} href={`/communities/${slug}/picks`} variant="contained" sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none" }}>
              Make your picks
            </Button>
          )}
          {back}
        </Stack>
      </AppCard>
    );
  }

  const mind = data.mind[rarity];
  const most = data.mostPicked[rarity];
  const mindNote = data.mindAtLock
    ? `It was set at the lock${data.mindEntries !== data.entries ? ` from ${plural(data.mindEntries, "player's picks", "players' picks")}` : ""}, and it's on the standings all season as if it were another player.`
    : "It's worked out from the picks of everyone playing this season in the group.";

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {load.celebrate && <ConfettiBurst />}
      <Box>
        <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "1.75rem", sm: "2.25rem" }, lineHeight: 1.1 }}>The Reveal</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          The picks are in for {data.set.name}: {plural(data.entries, "player", "players")} in {data.community.name}, locked {formatWhenZoned(data.set.lockAt)}.
        </Typography>
        <Box sx={{ mt: 1.25 }}>{back}</Box>
      </Box>

      <Box sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Tabs value={rarity} onChange={(_, v) => setRarity(v as MtgRarity)} variant="scrollable" allowScrollButtonsMobile aria-label="Rarity" sx={{ minHeight: 44, "& .MuiTabs-indicator": { height: 3, borderRadius: 2 } }}>
          {[...MTG_RARITIES].reverse().map((r) => (
            <Tab key={r} value={r} label={RARITY_LABEL[r]} sx={{ textTransform: "none", fontWeight: 700, minHeight: 44 }} />
          ))}
        </Tabs>
      </Box>

      <AppCard>
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <PsychologyAltRoundedIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="h2" fontWeight={800} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>Group Mind</Typography>
            <Typography variant="caption" color="text.secondary">
              The group&apos;s consensus {RARITY_PLURAL[rarity]}: 5 votes for every #1 down to 1 for a #5. {mindNote}
            </Typography>
          </Box>
        </Stack>
        {mind.length === 0 ? (
          <Typography variant="body2" color="text.secondary">The Group Mind needs picks from at least two players.</Typography>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${MTG_SLOTS_PER_RARITY}, minmax(0, 1fr))`, gap: { xs: 0.75, sm: 1.25 } }}>
            {mind.map((m) => (
              <Thumb
                key={m.card.id}
                card={m.card}
                slot={m.slot}
                onOpen={() => openViewer(mind.map((x) => x.card), m.slot - 1)}
                detailLabel={`${plural(m.votes, "vote", "votes")}, ${plural(m.pickers, "player", "players")}`}
                detail={
                  <Typography variant="caption" color="text.secondary" sx={captionSx}>
                    {plural(m.votes, "vote", "votes")}
                    <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}> · {plural(m.pickers, "player", "players")}</Box>
                  </Typography>
                }
              />
            ))}
          </Box>
        )}
        {most.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>Most picked</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
              {most.map((m) => (
                <Chip
                  key={m.card.id}
                  label={`${m.card.name} ×${m.count}`}
                  variant="outlined"
                  onClick={() => openViewer(most.map((x) => x.card), most.findIndex((x) => x.card.id === m.card.id))}
                  sx={{ fontWeight: 700, maxWidth: "100%", height: { xs: 40, sm: 32 }, borderRadius: 20 }}
                />
              ))}
            </Stack>
          </Box>
        )}
      </AppCard>

      <Box sx={{ pt: 0.5 }}>
        <Typography variant="h6" component="h2" fontWeight={800} sx={{ fontSize: "1.125rem" }}>Everyone&apos;s {RARITY_PLURAL[rarity]}</Typography>
        {withEntries.length > 1 && (
          <Typography variant="caption" color="text.secondary">
            &ldquo;Only you&rdquo; and &ldquo;Solo&rdquo; mark a card nobody else in the group picked.
          </Typography>
        )}
      </Box>
      {withEntries.length === 0 && (
        <AppCard><Typography variant="body2" color="text.secondary">Nobody in this group locked in picks.</Typography></AppCard>
      )}
      <Stack spacing={{ xs: 1.5, sm: 2 }}>
        {withEntries.map((p) => <PlayerRow key={p.userId} player={p} rarity={rarity} onOpen={openViewer} />)}
      </Stack>

      {noEntry.length > 0 && (
        <AppCard>
          <Typography variant="body2" component="h2" fontWeight={700} sx={{ mb: 0.5 }}>No picks</Typography>
          <Typography variant="body2" color="text.secondary">
            {joinNames(noEntry.map((p) => (p.isViewer ? "You" : displayName(p))))}{" "}
            {season
              ? `didn't make picks for ${data.set.name}.`
              : `${noEntry.length === 1 && !noEntry[0].isViewer ? "is" : "are"} following along this season.`}
          </Typography>
        </AppCard>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.5, px: 0.5 }}>{MTG_ATTRIBUTION}</Typography>

      {viewer && (
        <CardViewer
          open
          cards={viewer.list}
          index={viewer.index}
          onIndexChange={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
          onClose={() => setViewer(null)}
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
