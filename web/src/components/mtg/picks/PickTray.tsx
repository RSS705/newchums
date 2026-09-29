"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { keyframes } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloudOffRoundedIcon from "@mui/icons-material/CloudOffRounded";
import LockClockOutlinedIcon from "@mui/icons-material/LockClockOutlined";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import { AppCard } from "@/components/ui";
import { type MtgCard, type MtgRarity, MTG_LIST_MAX, MTG_SLOTS_PER_RARITY, RARITY_LABEL } from "../mtgTypes";
import PickList, { useArrowReorder } from "./PickList";
import { type PickSlot, scoredCount, shortlistCount } from "./pickUtils";

export type SaveState = "idle" | "saving" | "saved" | "error" | "locked" | "signedOut";

type Props = {
  rarity: MtgRarity;
  slots: PickSlot[];
  locked: boolean;
  saveState: SaveState;
  lockCountdown: string | null;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onOpenCard: (card: MtgCard) => void;
  /** What each pick counts, #1 first (the season's slot multipliers). */
  weights?: readonly number[];
};

const STATUS: Record<SaveState, { icon: React.ReactNode; text: string; color: string }> = {
  idle: { icon: null, text: "", color: "text.secondary" },
  saving: { icon: <SyncRoundedIcon sx={{ fontSize: 15 }} />, text: "Saving…", color: "text.secondary" },
  saved: { icon: <CheckRoundedIcon sx={{ fontSize: 15 }} />, text: "Saved", color: "success.main" },
  error: { icon: <CloudOffRoundedIcon sx={{ fontSize: 15 }} />, text: "Not saved, retrying", color: "error.main" },
  locked: { icon: <LockRoundedIcon sx={{ fontSize: 15 }} />, text: "Locked", color: "text.secondary" },
  signedOut: { icon: <CloudOffRoundedIcon sx={{ fontSize: 15 }} />, text: "Signed out", color: "error.main" },
};

/** Room left under the desktop rail, and the least height it is given, in a window too short for more. */
const RAIL_GAP = 24;
const RAIL_MIN = 220;

/** "Saved" shows for four seconds, then fades; the space it took stays, so nothing beside it moves. */
const fadeAway = keyframes`
  from { opacity: 1; }
  to { opacity: 0; visibility: hidden; }
`;

/** Visual save indicator. The wizard announces status once, in a single
 *  live region, so these stay hidden from screen readers. `compact` shows
 *  just the icon, for the narrow phone bar. Keyed by state, so each new
 *  "Saved" starts its fade again. Problems stay on screen. */
export function SaveStatus({ state, compact = false }: { state: SaveState; compact?: boolean }) {
  const s = STATUS[state];
  if (!s.text) return null;
  return (
    <Stack
      key={state}
      direction="row"
      spacing={0.5}
      alignItems="center"
      sx={{ color: s.color, minWidth: 0, ...(state === "saved" && { animation: `${fadeAway} 600ms ease 4s forwards` }) }}
      aria-hidden
      title={s.text}
    >
      {s.icon}
      {!compact && <Typography variant="caption" sx={{ fontWeight: 700, color: "inherit", whiteSpace: "nowrap", lineHeight: 1 }}>{s.text}</Typography>}
    </Stack>
  );
}

/**
 * The list for the rarity being picked: five picks, then up to fifteen more on
 * a shortlist to compare, put into order. A sticky rail beside the grid on
 * desktop, never taller than the window: a long list scrolls inside it, so
 * its last card is always in reach. On phones a slim bar pinned to the bottom
 * of the screen whose Reorder button (or the row of picks itself) opens the
 * full list in a sheet, where each card moves with up and down buttons, so the
 * grid keeps the whole width. The sheet stays open under a card opened from
 * it, so closing the card comes back to the list. The bar is hidden once picks
 * are read-only.
 */
export default function PickTray({ rarity, slots, locked, saveState, lockCountdown, onReorder, onRemove, onOpenCard, weights }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // The rail gets the room between its top and the bottom of the window, so
  // it ends on screen wherever the page is scrolled to: lower down at the top
  // of the page, then pinned under the header. The height goes straight onto
  // the element as a CSS variable, since the page scrolling shouldn't redraw
  // the list.
  const railRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.getElementById("app-scroll-root");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rail = railRef.current;
      if (!rail || rail.offsetParent === null) return;
      const room = window.innerHeight - Math.max(0, rail.getBoundingClientRect().top) - RAIL_GAP;
      rail.style.setProperty("--rail-max", `${Math.max(RAIL_MIN, Math.round(room))}px`);
    };
    const onChange = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    root?.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    // Notices above the rail come and go, which moves it without any scrolling.
    const page = railRef.current?.closest("[data-pick-wizard]") ?? null;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onChange);
    if (observer && page) observer.observe(page);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      root?.removeEventListener("scroll", onChange);
      window.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
      observer?.disconnect();
    };
  }, []);

  const arrows = useArrowReorder();
  const label = RARITY_LABEL[rarity].toLowerCase();
  const picked = scoredCount(slots);
  const extra = shortlistCount(slots);
  const header = (
    <Box sx={{ mb: 1.25 }}>
      {/* The save status sits on the title's own line, so it lines up with it. */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ minHeight: 22 }}>
        <Typography variant="body2" fontWeight={800} sx={{ lineHeight: 1.3 }}>Your {label}</Typography>
        <SaveStatus state={saveState} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {picked} of {MTG_SLOTS_PER_RARITY} picked{extra > 0 ? `, ${extra} on your shortlist` : ""}
      </Typography>
    </Box>
  );
  const hint = !locked && (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.25, lineHeight: 1.45 }}>
      {slots.length < MTG_LIST_MAX
        ? `List up to ${MTG_LIST_MAX} ${label} and ${arrows ? "move" : "drag"} your best five to the top. Only the top five score.`
        : `Your list is full. Only the top five score.`}
    </Typography>
  );
  const countdown = lockCountdown && !locked && (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1.25, color: "text.secondary" }}>
      <LockClockOutlinedIcon sx={{ fontSize: 15 }} />
      <Typography variant="caption" fontWeight={600}>Locks in {lockCountdown}</Typography>
    </Stack>
  );

  return (
    <>
      {/* In a short window (a laptop zoomed in, a phone on its side) the rail sits closer to the header, to keep its room. */}
      <Box ref={railRef} sx={{ display: { xs: "none", md: "block" }, position: "sticky", top: 96, "@media (max-height: 640px)": { top: 16 } }}>
        {/* The card is as tall as the window allows below it, and the list scrolls within it. */}
        <AppCard
          sx={{
            display: "flex",
            flexDirection: "column",
            maxHeight: "var(--rail-max, calc(100dvh - var(--header-h, 80px) - 120px))",
            "& > .MuiCardContent-root": { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
          }}
        >
          {header}
          {/* The list itself clips a dragged card, so dragging past its end can't stretch what scrolls. */}
          <Box data-testid="pick-rail-list" sx={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "hidden", mr: -1, pr: 1, "& > .MuiStack-root": { overflow: "clip" } }}>
            <PickList rarity={rarity} slots={slots} locked={locked} onReorder={onReorder} onRemove={onRemove} onOpenCard={onOpenCard} dense weights={weights} />
          </Box>
          {hint}
          {countdown}
        </AppCard>
      </Box>

      {!locked && (
        <Box
          sx={{
            display: { xs: "block", md: "none" },
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: (t) => t.zIndex.appBar,
            bgcolor: "background.paper",
            borderTop: "1px solid",
            borderColor: "divider",
            boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
            px: 1.5,
            pt: 1,
            pb: "calc(8px + env(safe-area-inset-bottom))",
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            {/* The row of picks opens the list too, not just the button beside it. */}
            <ButtonBase
              onClick={() => setSheetOpen(true)}
              aria-label={`${picked} of ${MTG_SLOTS_PER_RARITY} ${label} picked${extra > 0 ? `, ${extra} on your shortlist` : ""}. Open your list`}
              sx={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 0.5, borderRadius: 1.5, py: 0.25, "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}
            >
              {Array.from({ length: MTG_SLOTS_PER_RARITY }, (_, i) => {
                const s = slots[i];
                return (
                  <Box key={i} sx={{ position: "relative", flex: "0 1 34px", minWidth: 22, aspectRatio: "488 / 680", borderRadius: "8%", overflow: "hidden", border: "1px solid", borderColor: s ? "primary.main" : "divider", borderStyle: s ? "solid" : "dashed", bgcolor: "grey.100" }}>
                    {s?.card.imageNormal ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.card.imageNormal} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <Typography variant="caption" sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "text.disabled", fontSize: "0.6875rem" }}>{i + 1}</Typography>
                    )}
                  </Box>
                );
              })}
              {extra > 0 && (
                <Typography aria-hidden variant="caption" fontWeight={800} color="text.secondary" sx={{ flexShrink: 0, pl: 0.25 }}>+{extra}</Typography>
              )}
            </ButtonBase>
            <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0, minWidth: 0 }}>
              <SaveStatus state={saveState} compact />
              {lockCountdown && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6875rem", whiteSpace: "nowrap", display: "none", "@media (min-width: 380px)": { display: "block" } }}>
                  Locks in {lockCountdown}
                </Typography>
              )}
            </Stack>
            <Button
              variant="contained"
              size="small"
              onClick={() => setSheetOpen(true)}
              startIcon={<SwapVertRoundedIcon sx={{ fontSize: 18 }} />}
              aria-label={`Reorder your ${label}, ${picked} of ${MTG_SLOTS_PER_RARITY} picked`}
              sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, boxShadow: "none", flexShrink: 0, minHeight: 40, px: 1.5, "& .MuiButton-startIcon": { mr: 0.5 } }}
            >
              Reorder
            </Button>
          </Stack>
        </Box>
      )}

      <Drawer
        anchor="bottom"
        open={sheetOpen && !locked}
        onClose={() => setSheetOpen(false)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85dvh", display: "flex", flexDirection: "column", overflow: "hidden", px: 2, pt: 2, pb: "calc(16px + env(safe-area-inset-bottom))" } } }}
      >
        {header}
        {/* The list scrolls between the title and Done, which stay put. A card
            opens over the sheet, and closing it comes back here. */}
        <Box data-testid="pick-sheet-list" sx={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", mx: -2, px: 2, pb: 0.5 }}>
          <PickList
            rarity={rarity}
            slots={slots}
            locked={locked}
            onReorder={onReorder}
            onRemove={onRemove}
            onOpenCard={onOpenCard}
            weights={weights}
          />
          {hint}
          {countdown}
        </Box>
        <Button variant="outlined" onClick={() => setSheetOpen(false)} fullWidth sx={{ mt: 1.5, flexShrink: 0, textTransform: "none", fontWeight: 700, borderRadius: 2.5, minHeight: 44 }}>Done</Button>
      </Drawer>
    </>
  );
}
