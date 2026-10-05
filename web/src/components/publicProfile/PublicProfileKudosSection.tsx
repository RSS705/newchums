"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import Tooltip from "@mui/material/Tooltip";
import { AppButton, AppCard, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { SECTION_SCROLL_MARGIN } from "@/lib/scrollOffsets";
import ProfileSectionHeader from "./ProfileSectionHeader";

type KudosItem = {
  tag: string;
  label: string;
  emoji: string;
  count: number;
  /** Only sent to the profile owner. True when the tag is hidden from visitors. */
  hidden?: boolean;
};

type PublicProfileKudosSectionProps = {
  /** Handle (without leading @) for the profile being viewed. */
  handle: string;
  /** True when the logged-in viewer is the profile owner. Unlocks the
   *  per-tag hide control; everyone else sees only the visible tags. */
  isOwner: boolean;
  /** Forwards auth on the fetch so the API can detect the owner. */
  viewerLoggedIn: boolean;
};

/** Space between tiles, in px. */
const GAP = 10;
/** The narrowest a tile may get: three fit across a 375 px phone, two at 320. */
const MIN_TILE = 96;
/** The width a tile keeps when there is room for more than three across. */
const PREFERRED_TILE = 132;
/** Rows shown before "Show more", and how many each press adds. */
const ROWS_PER_PAGE = 3;
/** A tile narrower than this uses the smaller type. */
const COMPACT_BELOW = PREFERRED_TILE;
/** A tile's height when it is wider than it is tall. Narrower tiles are squares. */
const TILE_HEIGHT = { xs: 124, sm: 140 };

/** How the tiles are laid out in a grid `width` px wide. The width is the
 *  grid's own, measured, not the viewport's: the profile column changes
 *  width with the sidebar, so a breakpoint can't know how many fit. */
function layoutFor(width: number, count: number) {
  // How many tiles fit across. A phone gets up to three at the narrowest
  // width; a wider column adds a tile for every PREFERRED_TILE of room, so
  // the tiles stay about as wide as they are tall instead of shrinking to
  // the phone's size or stretching into bars.
  const fit = (tile: number) => Math.floor((width + GAP) / (tile + GAP));
  const capacity = width > 0 ? Math.max(1, Math.min(fit(MIN_TILE), Math.max(3, fit(PREFERRED_TILE)))) : 3;
  const pageSize = capacity * ROWS_PER_PAGE;
  const paged = count > pageSize;
  // Up to three rows, the tiles spread evenly over them, so four tags on a
  // phone are two and two instead of three and one, and a few tags fill the
  // row at the size the first three always had. Past three rows every row
  // is full, so "Show more" never changes the size of a tile.
  const rows = Math.max(1, Math.ceil(count / capacity));
  const columns = paged ? capacity : Math.max(1, Math.ceil(count / rows));
  const tileWidth = width > 0 ? (width - (columns - 1) * GAP) / columns : 0;
  return { capacity, pageSize, paged, columns, tileWidth };
}

/** Public Tags section on /u/<handle> (kudos internally). Aggregated
 *  counts per tag, never who gave what, shown to anyone who can see the
 *  profile, even a tag given once. Every tag is a tile of the same size
 *  (Rob, 2026-10-05: the fourth tag used to drop into a chip): a few tags
 *  fill the row, more shrink the tiles to squares, and after three rows a
 *  button shows three more. Renders nothing when there are no tags, so a
 *  profile without any carries no empty stub.
 *
 *  The owner gets a small eye button on each tag: hiding one takes it off
 *  the public profile and out of the total, and the owner keeps seeing it
 *  dimmed so it can be put back. Hiding is presentation only, the tags
 *  themselves are never deleted. */
export default function PublicProfileKudosSection({ handle, isOwner, viewerLoggedIn }: PublicProfileKudosSectionProps) {
  // No handle means nothing to fetch; start resolved so the effect never
  // has to set state synchronously.
  const [items, setItems] = useState<KudosItem[] | null>(handle ? null : []);
  const [width, setWidth] = useState(0);
  const [rowsShown, setRowsShown] = useState(ROWS_PER_PAGE);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  // The grid's width, read as the grid mounts (so the first paint already
  // has the right columns) and again whenever it changes.
  const measureGrid = useCallback((node: HTMLUListElement | null) => {
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/public/users/${encodeURIComponent(handle)}/kudos`, { auth: viewerLoggedIn });
        if (!res.ok) { if (!cancelled) setItems([]); return; }
        const data = (await res.json()) as { ok?: boolean; items?: KudosItem[] };
        if (cancelled) return;
        setItems(data.ok && Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [handle, viewerLoggedIn]);

  /** Flip one tag's visibility. Optimistic, reverted if the call fails. */
  const toggleHidden = useCallback(async (tag: string, nextHidden: boolean) => {
    setItems((prev) => (prev ? prev.map((it) => (it.tag === tag ? { ...it, hidden: nextHidden } : it)) : prev));
    try {
      const res = await apiFetch(`/me/kudos/${encodeURIComponent(tag)}`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: nextHidden }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) throw new Error("failed");
      toast.success(nextHidden ? "Hidden from your profile" : "Back on your profile");
    } catch {
      setItems((prev) => (prev ? prev.map((it) => (it.tag === tag ? { ...it, hidden: !nextHidden } : it)) : prev));
      toast.error("Couldn't change that tag");
    }
  }, [toast]);

  if (!items || items.length === 0) return null;

  // The owner's total mirrors what a visitor would count, so a hidden tag
  // stops contributing the moment it is hidden.
  const total = items.reduce((sum, it) => (it.hidden ? sum : sum + it.count), 0);
  const { capacity, pageSize, paged, columns, tileWidth } = layoutFor(width, items.length);
  const shown = paged ? items.slice(0, capacity * rowsShown) : items;
  const remaining = items.length - shown.length;
  const compact = tileWidth > 0 && tileWidth < COMPACT_BELOW;
  const tileHeight = (cap: number) => (tileWidth > 0 ? Math.min(Math.round(tileWidth), cap) : cap);

  /** Back to three rows, with the section brought back into view: the list
   *  above the button just got shorter, and the page would otherwise be left
   *  showing whatever comes after it. */
  const showFewer = () => {
    setRowsShown(ROWS_PER_PAGE);
    requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ block: "nearest" }));
  };

  /** Hover hint for the eye. Plain Tooltip, not TapTooltip: it is a
   *  button, so a tap should act rather than open an explanation. */
  const hideHint = (hidden: boolean) =>
    hidden ? "Hidden from your profile. Tap to show it again." : "Hide this tag from your profile";

  const tileHideButton = (it: KudosItem) => {
    if (!isOwner) return null;
    const hidden = it.hidden === true;
    return (
      <Tooltip title={hideHint(hidden)} placement="top">
        <IconButton
          size="small"
          aria-label={hidden ? `Show ${it.label} on your profile` : `Hide ${it.label} from your profile`}
          onClick={(e) => { e.stopPropagation(); toggleHidden(it.tag, !hidden); }}
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 30,
            height: 30,
            color: hidden ? "primary.main" : "text.disabled",
            opacity: hidden ? 1 : 0.45,
            "&:hover": { opacity: 1, color: "text.secondary", bgcolor: "transparent" },
            "&:active": { opacity: 1 },
          }}
        >
          {hidden
            ? <VisibilityOffOutlinedIcon sx={{ fontSize: 15 }} />
            : <VisibilityOutlinedIcon sx={{ fontSize: 15 }} />}
        </IconButton>
      </Tooltip>
    );
  };

  return (
    <Box id="kudos" ref={sectionRef} sx={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}>
      <AppCard>
        <ProfileSectionHeader
          icon={<WorkspacePremiumRoundedIcon sx={{ fontSize: 20 }} />}
          title="Tags"
          meta={<Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>{total}</Typography>}
          subtitle={
            isOwner
              ? "Tags received from others. You can hide any tag using the eye icon."
              : "Given by people they've been on plans with."
          }
        />

        <Box
          component="ul"
          ref={measureGrid}
          aria-label="Tags"
          sx={{
            listStyle: "none",
            m: 0,
            mt: 2,
            p: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            // Every row as tall as the tallest, so a label on three lines
            // never leaves one row of tiles bigger than the others.
            gridAutoRows: "1fr",
            gap: `${GAP}px`,
          }}
        >
          {shown.map((it) => (
            <Box
              component="li"
              key={it.tag}
              sx={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: compact ? 0.25 : 0.5,
                py: compact ? 0.75 : { xs: 1.25, sm: 1.5 },
                px: compact ? 0.5 : 1,
                borderRadius: 2.5,
                border: "1px solid",
                borderColor: it.hidden ? "text.disabled" : "divider",
                borderStyle: it.hidden ? "dashed" : "solid",
                bgcolor: (theme) => (theme.palette.mode === "light" ? "grey.50" : "rgba(255,255,255,0.04)"),
                minWidth: 0,
                minHeight: { xs: tileHeight(TILE_HEIGHT.xs), sm: tileHeight(TILE_HEIGHT.sm) },
              }}
            >
              {tileHideButton(it)}
              <Typography component="span" sx={{ fontSize: compact ? "1.5rem" : { xs: "1.75rem", sm: "2rem" }, lineHeight: 1, opacity: it.hidden ? 0.45 : 1 }} aria-hidden>
                {it.emoji}
              </Typography>
              <Typography component="span" fontWeight={800} sx={{ fontSize: compact ? "1rem" : { xs: "1.125rem", sm: "1.25rem" }, lineHeight: 1.1, letterSpacing: "-0.01em", opacity: it.hidden ? 0.45 : 1 }}>
                ×{it.count}
              </Typography>
              {/* A word too long for a narrow tile breaks rather than spilling out of it. */}
              <Typography component="span" fontWeight={600} color="text.secondary" sx={{ fontSize: compact ? "0.6875rem" : "0.75rem", lineHeight: compact ? 1.25 : 1.3, maxWidth: "100%", overflowWrap: "break-word", opacity: it.hidden ? 0.45 : 1 }}>
                {it.label}
              </Typography>
              {/* The owner's tiles always keep the line's room, so hiding or
                  showing one tag never resizes the grid. */}
              {isOwner && (
                <Typography component="span" sx={{ fontSize: compact ? "0.5625rem" : "0.625rem", lineHeight: 1.2, fontWeight: 700, color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.04em", visibility: it.hidden ? "visible" : "hidden" }}>
                  Hidden
                </Typography>
              )}
            </Box>
          ))}
        </Box>

        {paged && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 1.5 }}>
            {remaining > 0 ? (
              <AppButton size="small" variant="outlined" endIcon={<ExpandMoreRoundedIcon />} onClick={() => setRowsShown((r) => r + ROWS_PER_PAGE)} sx={{ textTransform: "none" }}>
                Show {Math.min(remaining, pageSize)} more
              </AppButton>
            ) : (
              <AppButton size="small" variant="outlined" endIcon={<ExpandLessRoundedIcon />} onClick={showFewer} sx={{ textTransform: "none" }}>
                Show fewer
              </AppButton>
            )}
          </Box>
        )}
        {/* For screen readers, since the button's own words change under their focus. */}
        {paged && (
          <Box role="status" sx={{ position: "absolute", width: "1px", height: "1px", m: "-1px", p: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>
            Showing {shown.length} of {items.length} tags
          </Box>
        )}
      </AppCard>
    </Box>
  );
}
