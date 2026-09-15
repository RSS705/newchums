"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppCard } from "@/components/ui";
import { MTG_RARITIES, MTG_SLOTS_PER_RARITY, MTG_TOTAL_PICKS, RARITY_LABEL, type MtgRarity } from "../mtgTypes";
import PickList from "./PickList";
import { type PickState, totalPicked } from "./pickUtils";

type Props = {
  picks: PickState;
  locked: boolean;
  onReorder: (rarity: MtgRarity, from: number, to: number) => void;
  onRemove: (rarity: MtgRarity, index: number) => void;
  onNote: (rarity: MtgRarity, index: number, note: string) => void;
  onEdit: (rarity: MtgRarity) => void;
};

/** All twenty picks in order, reorderable, with the optional Receipts note on
 *  each. Receipts stay sealed until the lock. */
export default function ReviewStep({ picks, locked, onReorder, onRemove, onNote, onEdit }: Props) {
  const total = totalPicked(picks);
  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {total === MTG_TOTAL_PICKS ? (
        <Alert severity="success" sx={{ borderRadius: 2.5 }}>
          {locked ? "Your entry is complete and locked." : "Your entry is complete. You can keep changing it until the lock."}
        </Alert>
      ) : (
        <Alert severity="info" sx={{ borderRadius: 2.5 }}>
          {total} of {MTG_TOTAL_PICKS} picked. Empty slots score 0, so fill every rarity before the lock.
        </Alert>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        Drag to reorder. Receipts are an optional note of up to 140 characters on any pick, like &ldquo;this common is a house.&rdquo; They stay sealed until the lock, then sit beside that card&apos;s results all season.
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: { xs: 2, sm: 2.5 } }}>
        {MTG_RARITIES.map((rarity) => (
          <AppCard key={rarity}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
              <Box>
                <Typography variant="h6" fontWeight={800} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>{RARITY_LABEL[rarity]}</Typography>
                <Typography variant="caption" color="text.secondary">{picks[rarity].length} of {MTG_SLOTS_PER_RARITY}</Typography>
              </Box>
              {!locked && (
                <Button size="small" variant="text" onClick={() => onEdit(rarity)} sx={{ textTransform: "none", fontWeight: 700, boxShadow: "none" }}>
                  {picks[rarity].length < MTG_SLOTS_PER_RARITY ? "Add picks" : "Change"}
                </Button>
              )}
            </Stack>
            <PickList
              rarity={rarity}
              slots={picks[rarity]}
              locked={locked}
              onReorder={(from, to) => onReorder(rarity, from, to)}
              onRemove={(i) => onRemove(rarity, i)}
              onNoteChange={(i, note) => onNote(rarity, i, note)}
            />
          </AppCard>
        ))}
      </Box>
    </Stack>
  );
}
