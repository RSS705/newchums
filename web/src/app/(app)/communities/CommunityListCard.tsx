"use client";

import { useRouter } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import { AppCard } from "@/components/ui";
import { getAvatarBaseUrl } from "@/lib/apiClient";

/**
 * Shared shape for a community row in any discovery feed. Matches the response
 * of `GET /communities` and `GET /public/communities` exactly, so the same
 * card can render for authenticated and logged-out surfaces. Viewer-scoped
 * fields (`viewer_role`, `hobby_match_count`) are nullable / zero on the
 * public endpoint and the card handles both cases gracefully.
 */
export type CommunityListItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: string;
  join_mode: string;
  avatar_key: string | null;
  member_count: number;
  location_name: string | null;
  owner_user_id: string;
  created_at: string;
  is_online: boolean;
  viewer_role: string | null;
  upcoming_plan_count: number;
  hobby_match_count: number;
  distance_km: number | null;
  hobbies: { name: string; slug: string }[] | null;
};

type CommunityListCardProps = {
  community: CommunityListItem;
  /** Set of the viewer's hobby categories so hobby chips matching them can
   *  be tinted. Public / logged-out surfaces pass `undefined`. */
  viewerHobbyCategories?: Set<string> | undefined;
  /** Controls whether the "Joined" chip appears next to the name for member
   *  viewers. On the public surface there's no viewer, so pass false. The
   *  "Owner" chip is keyed off `viewer_role` directly and stays suppressed
   *  on the public path as a consequence of the endpoint returning null. */
  showJoinedChip?: boolean;
  /**
   * Visual layout variant.
   *
   * `"list"` (default) keeps the card tight so it reads well in a vertical
   * feed, matching the authenticated `/communities` page. Uses a CSS grid
   * where the avatar spans both content rows on `sm+`.
   *
   * `"grid"` restyles the card into three zones stacked vertically: a
   * clean **header** (logo + name + hobby chips) separated from the
   * body by a hairline divider, a **body** (readable description
   * excerpt, 3-line clamp), and a **grey.50 footer** (member count,
   * upcoming plans, location). Resting surface stays plain white so a
   * grid of many cards doesn't read as striped; character comes from
   * the logo ring + shadow + gradient fallback, a faint resting
   * shadow, and a brand-tinted hover lift rather than from repeated
   * background tints on each card. Reuses the Participant-hero avatar
   * convention from `docs/UI_Patterns.md`.
   *
   * Used by the public `/communities` discovery feed.
   */
  layout?: "list" | "grid";
};

/** Maximum hobby chips rendered inline before the "+N more" overflow
 *  label. List mode gets 5 (cards are full width and room is cheap);
 *  grid mode gets 3 because the header column is narrower and 4+ chips
 *  wrap into two rows, which throws the card's internal rhythm off. */
const HOBBY_CHIP_CAP_LIST = 5;
const HOBBY_CHIP_CAP_GRID = 3;

export default function CommunityListCard({
  community: c,
  viewerHobbyCategories,
  showJoinedChip = false,
  layout = "list",
}: CommunityListCardProps) {
  const router = useRouter();
  const hobbies = Array.isArray(c.hobbies) ? c.hobbies : [];
  const isGrid = layout === "grid";
  const hobbyCap = isGrid ? HOBBY_CHIP_CAP_GRID : HOBBY_CHIP_CAP_LIST;
  const visibleHobbies = hobbies.slice(0, hobbyCap);
  const overflowHobbies = Math.max(0, hobbies.length - visibleHobbies.length);

  const avatarEl = (
    <Avatar
      variant="rounded"
      src={c.avatar_key ? `${getAvatarBaseUrl()}/communities/${c.id}/avatar` : undefined}
      sx={{
        alignSelf: "flex-start",
        width: isGrid ? { xs: 52, sm: 56 } : 48,
        height: isGrid ? { xs: 52, sm: 56 } : 48,
        borderRadius: 2,
        // With an uploaded logo we use a neutral grey background so a
        // PNG's transparent corners don't bleed a loud brand-orange
        // tint through the rounded-square frame. The fallback-letter
        // case keeps the solid primary fill so the initial stays
        // legible and on-brand; no gradient backdrop on either branch,
        // the earlier diagonal primary gradient caused the "red
        // corners" artifact on logos with transparent corners.
        bgcolor: c.avatar_key ? "grey.100" : "primary.main",
        color: "primary.contrastText",
        fontWeight: 700,
        fontSize: isGrid ? { xs: "1.25rem", sm: "1.375rem" } : "1.1rem",
        flexShrink: 0,
        // Grid mode: container treatment only, no tinted backdrop.
        // White ring + faint shadow echoes the Participant-hero avatar
        // convention so the logo reads as a framed piece of the card.
        ...(isGrid && {
          border: "2px solid #fff",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
        }),
      }}
    >
      {c.name.charAt(0).toUpperCase()}
    </Avatar>
  );

  const nameRow = (
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
      <Typography
        fontWeight={700}
        sx={{
          fontSize: isGrid ? { xs: "1.1875rem", sm: "1.25rem" } : "1.0625rem",
          lineHeight: 1.2,
          letterSpacing: "-0.02em",
          color: "text.primary",
        }}
        noWrap
      >
        {c.name}
      </Typography>
      {c.visibility === "private" && (
        <LockRoundedIcon sx={{ fontSize: 15, color: "text.disabled" }} />
      )}
      {c.viewer_role === "owner" && (
        <Chip label="Owner" size="small" sx={{ height: 20, fontSize: "0.6875rem", fontWeight: 600, borderRadius: 1, bgcolor: "primary.light", color: "primary.dark" }} />
      )}
      {c.viewer_role === "member" && showJoinedChip && (
        <Chip label="Joined" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.6875rem", fontWeight: 500, borderRadius: 1, borderColor: "divider", color: "text.secondary" }} />
      )}
    </Stack>
  );

  const hobbyChipsEl = hobbies.length > 0 && (
    <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap>
      {visibleHobbies.map((h) => {
        const isMatch = viewerHobbyCategories?.has(h.name.toLowerCase()) || viewerHobbyCategories?.has(h.slug.toLowerCase());
        return (
          <Chip
            key={h.slug}
            label={h.name}
            size="small"
            color={isMatch ? "primary" : "default"}
            variant={isMatch ? "filled" : "outlined"}
            sx={{
              height: 22,
              fontSize: "0.6875rem",
              fontWeight: 500,
              borderRadius: 1.5,
              ...(isMatch
                ? { bgcolor: "primary.light", color: "primary.dark" }
                : { borderColor: "divider", color: "text.secondary" }),
            }}
          />
        );
      })}
      {overflowHobbies > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: "22px", fontWeight: 500 }}>
          +{overflowHobbies} more
        </Typography>
      )}
    </Stack>
  );

  // Description stays at the default body-2 size in both modes so the
  // excerpt is comfortably readable (the previous caption-sized grid
  // variant felt like microcopy). Grid mode gets a slightly more
  // generous line-height for breathability and a 3-line clamp so the
  // body zone feels like a real excerpt, not a teaser line; list mode
  // keeps the existing 2-line clamp the authenticated feed has shipped
  // with.
  const descriptionEl = c.description && (
    <Typography
      sx={{
        display: "-webkit-box",
        WebkitLineClamp: isGrid ? 3 : 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        fontSize: "0.875rem",
        lineHeight: isGrid ? 1.65 : 1.6,
        color: "text.secondary",
      }}
    >
      {c.description.replace(/<[^>]*>/g, "")}
    </Typography>
  );

  const metaEl = (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <PeopleRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
          {c.member_count} {c.member_count === 1 ? "member" : "members"}
        </Typography>
      </Stack>
      {c.upcoming_plan_count > 0 && (
        <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap>
          <Typography variant="body2" color="text.disabled" sx={{ display: { xs: "none", sm: "inline" } }}>·</Typography>
          <EventNoteRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
            {c.upcoming_plan_count} upcoming {c.upcoming_plan_count === 1 ? "plan" : "plans"}
          </Typography>
        </Stack>
      )}
      {c.is_online ? (
        <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap>
          <Typography variant="body2" color="text.disabled" sx={{ display: { xs: "none", sm: "inline" } }}>·</Typography>
          <LanguageRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
            Online
          </Typography>
        </Stack>
      ) : c.location_name ? (
        <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap sx={{ minWidth: 0, flex: { xs: "1 1 100%", sm: "0 1 auto" } }}>
          <Typography variant="body2" color="text.disabled" sx={{ display: { xs: "none", sm: "inline" } }}>·</Typography>
          <PlaceRoundedIcon sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }} />
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", minWidth: 0 }}>
            {c.location_name}
          </Typography>
          {c.distance_km != null && (
            <Chip
              label={c.distance_km < 1 ? "< 1 km" : `${Math.round(c.distance_km)} km`}
              size="small"
              sx={{ height: 20, fontSize: "0.6875rem", fontWeight: 500, borderRadius: 1, bgcolor: "grey.100", color: "text.secondary", flexShrink: 0 }}
            />
          )}
        </Stack>
      ) : null}
      {c.join_mode === "approval_required" && (
        <Chip label="Approval required" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: "0.6875rem" }} />
      )}
    </Stack>
  );

  // ── Grid layout ───────────────────────────────────────────────
  // Three vertically banded zones (header / body / footer) with
  // bespoke surface treatment per zone. The outer card clips its
  // rounded corners (`overflow: hidden`) so the header gradient and
  // footer grey.50 fill extend cleanly to the card border radius.
  // Card-level resting shadow + hover lift + primary-tinted hover
  // border give the grid a premium, browseable feel.
  if (isGrid) {
    return (
      <AppCard
        sx={{
          cursor: "pointer",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          transition: "box-shadow 0.22s ease, transform 0.18s ease, border-color 0.22s ease",
          "& > .MuiCardContent-root": {
            flex: 1,
            display: "flex",
            flexDirection: "column",
            p: 0,
            "&:last-child": { pb: 0 },
          },
          "&:hover": {
            boxShadow: "0 10px 28px rgba(234, 88, 12, 0.10), 0 4px 10px rgba(0, 0, 0, 0.04)",
            transform: "translateY(-2px)",
            borderColor: "primary.light",
          },
        }}
        onClick={() => router.push(`/communities/${c.slug}`)}
      >
        {/* Header zone: logo + name + hobby chips. Plain white surface
            separated from the body by a hairline divider, decorative
            tint was pulled out after it read as striped / repetitive
            across a grid of many cards. Character comes from the logo
            treatment, the card's resting shadow, and the hover lift
            below, not from a repeated background wash on every card. */}
        <Box
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: { xs: 2.25, sm: 2.5 },
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack direction="row" spacing={{ xs: 1.75, sm: 2 }} alignItems="flex-start">
            {avatarEl}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {nameRow}
              {hobbyChipsEl}
            </Box>
          </Stack>
        </Box>

        {/* Body zone: description excerpt. `flex: 1` so the body absorbs
            any slack when sibling cards in the same row are taller; the
            2-line clamp + caption-weight body keeps the excerpt visually
            secondary to the header identity. */}
        <Box
          sx={{
            px: { xs: 2, sm: 2.5 },
            pt: 1.75,
            pb: 1.75,
            flex: 1,
          }}
        >
          {descriptionEl}
        </Box>

        {/* Footer zone: meta row in a grey.50 well with a 1px divider on
            top. Reads as a footer band rather than as trailing body
            text. */}
        <Box
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: 1.5,
            bgcolor: "grey.50",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          {metaEl}
        </Box>
      </AppCard>
    );
  }

  // ── List layout ──────────────────────────────────────────────
  // Unchanged from the shipped authenticated-feed behavior. Avatar
  // spans both content rows on sm+ via CSS named grid areas; body
  // holds the description + meta in one flex column.
  return (
    <AppCard
      sx={{
        cursor: "pointer",
        transition: "box-shadow 0.15s, transform 0.15s, border-color 0.15s",
        "&:hover": { boxShadow: "0 4px 16px rgba(0,0,0,0.08)", transform: "translateY(-1px)" },
      }}
      onClick={() => router.push(`/communities/${c.slug}`)}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gridTemplateAreas: {
            xs: '"avatar title" "body body"',
            sm: '"avatar title" "avatar body"',
          },
          columnGap: { xs: 1.5, sm: 2 },
          rowGap: { xs: 1, sm: 0.75 },
        }}
      >
        <Box sx={{ gridArea: "avatar" }}>{avatarEl}</Box>
        <Box sx={{ gridArea: "title", minWidth: 0, alignSelf: "flex-start" }}>
          {nameRow}
          {hobbyChipsEl}
        </Box>
        <Box
          sx={{
            gridArea: "body",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {descriptionEl}
          {metaEl}
        </Box>
      </Box>
    </AppCard>
  );
}
