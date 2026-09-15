"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloudOffRoundedIcon from "@mui/icons-material/CloudOffRounded";
import LockClockOutlinedIcon from "@mui/icons-material/LockClockOutlined";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import { AppCard } from "@/components/ui";
import { type MtgCard, type MtgRarity, MTG_SLOTS_PER_RARITY, RARITY_LABEL } from "../mtgTypes";
import PickList from "./PickList";
import type { PickSlot } from "./pickUtils";

export type SaveState = "idle" | "saving" | "saved" | "error" | "locked";

type Props = {
  rarity: MtgRarity;
  slots: PickSlot[];
  locked: boolean;
  saveState: SaveState;
  lockCountdown: string | null;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onOpenCard: (card: MtgCard) => void;
};

export function SaveStatus({ state }: { state: SaveState }) {
  const map: Record<SaveState, { icon: React.ReactNode; text: string; color: string }> = {
    idle: { icon: null, text: "", color: "text.secondary" },
    saving: { icon: <SyncRoundedIcon sx={{ fontSize: 15 }} />, text: "Saving…", color: "text.secondary" },
    saved: { icon: <CheckRoundedIcon sx={{ fontSize: 15 }} />, text: "Saved", color: "success.main" },
    error: { icon: <CloudOffRoundedIcon sx={{ fontSize: 15 }} />, text: "Not saved, retrying", color: "error.main" },
    locked: { icon: <LockRoundedIcon sx={{ fontSize: 15 }} />, text: "Locked", color: "text.secondary" },
  };
  const s = map[state];
  if (!s.text) return null;
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: s.color }} role="status" aria-live="polite">
      {s.icon}
      <Typography variant="caption" sx={{ fontWeight: 700, color: "inherit" }}>{s.text}</Typography>
    </Stack>
  );
}

/**
 * The five slots for the rarity being picked. A sticky rail beside the grid
 * on desktop; on phones a slim bar pinned to the bottom of the screen that
 * opens the full list in a sheet, so the grid keeps the whole width.
 */
export default function PickTray({ rarity, slots, locked, saveState, lockCountdown, onReorder, onRemove, onOpenCard }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const header = (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1.25 }}>
      <Box>
        <Typography variant="body2" fontWeight={800}>Your {RARITY_LABEL[rarity].toLowerCase()}</Typography>
        <Typography variant="caption" color="text.secondary">{slots.length} of {MTG_SLOTS_PER_RARITY} picked</Typography>
      </Box>
      <SaveStatus state={saveState} />
    </Stack>
  );
  const countdown = lockCountdown && !locked && (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1.25, color: "text.secondary" }}>
      <LockClockOutlinedIcon sx={{ fontSize: 15 }} />
      <Typography variant="caption" fontWeight={600}>Locks in {lockCountdown}</Typography>
    </Stack>
  );

  return (
    <>
      <Box sx={{ display: { xs: "none", md: "block" }, position: "sticky", top: 96 }}>
        <AppCard>
          {header}
          <PickList rarity={rarity} slots={slots} locked={locked} onReorder={onReorder} onRemove={onRemove} onOpenCard={onOpenCard} dense />
          {countdown}
        </AppCard>
      </Box>

      {/* Phone bar. Sits above the page bottom; the wizard pads its content
          so the bar never covers the step buttons. */}
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
          <Stack direction="row" spacing={0.5} sx={{ flex: 1, minWidth: 0 }} aria-label={`${slots.length} of ${MTG_SLOTS_PER_RARITY} ${RARITY_LABEL[rarity].toLowerCase()} picked`}>
            {Array.from({ length: MTG_SLOTS_PER_RARITY }, (_, i) => {
              const s = slots[i];
              return (
                <Box key={i} sx={{ position: "relative", width: 34, aspectRatio: "488 / 680", borderRadius: "8%", overflow: "hidden", border: "1px solid", borderColor: s ? "primary.main" : "divider", borderStyle: s ? "solid" : "dashed", bgcolor: "grey.100", flexShrink: 0 }}>
                  {s?.card.imageNormal ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.card.imageNormal} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <Typography variant="caption" sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "text.disabled", fontSize: "0.6875rem" }}>{i + 1}</Typography>
                  )}
                </Box>
              );
            })}
          </Stack>
          <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0 }}>
            <SaveStatus state={saveState} />
            {lockCountdown && !locked && <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6875rem" }}>Locks in {lockCountdown}</Typography>}
          </Stack>
          <Button variant="contained" size="small" onClick={() => setSheetOpen(true)} sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, boxShadow: "none", flexShrink: 0, minHeight: 36 }}>
            {slots.length}/{MTG_SLOTS_PER_RARITY}
          </Button>
        </Stack>
      </Box>

      <Drawer
        anchor="bottom"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85dvh", px: 2, pt: 2, pb: "calc(16px + env(safe-area-inset-bottom))" } } }}
      >
        {header}
        <PickList
          rarity={rarity}
          slots={slots}
          locked={locked}
          onReorder={onReorder}
          onRemove={onRemove}
          onOpenCard={(card) => { setSheetOpen(false); onOpenCard(card); }}
        />
        {countdown}
        <Button variant="text" onClick={() => setSheetOpen(false)} fullWidth sx={{ mt: 1.5, textTransform: "none", fontWeight: 600 }}>Done</Button>
      </Drawer>
    </>
  );
}
