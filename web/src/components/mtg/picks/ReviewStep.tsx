"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import PlaylistAddCheckRoundedIcon from "@mui/icons-material/PlaylistAddCheckRounded";
import { AppCard } from "@/components/ui";
import { Notice } from "../pageBits";
import { type MtgCard, MTG_RARITIES, MTG_SLOTS_PER_RARITY, MTG_TOTAL_PICKS, RARITY_LABEL, type MtgRarity } from "../mtgTypes";
import PickList from "./PickList";
import { type PickState, scoredCount, totalPicked } from "./pickUtils";

type Props = {
  picks: PickState;
  locked: boolean;
  onReorder: (rarity: MtgRarity, from: number, to: number) => void;
  onRemove: (rarity: MtgRarity, index: number) => void;
  onNote: (rarity: MtgRarity, index: number, note: string) => void;
  onEdit: (rarity: MtgRarity) => void;
  onOpenCard: (card: MtgCard) => void;
};

/** All twenty picks in order, reorderable, each with an optional field for
 *  the player's thoughts on it, which nobody else sees until picks lock. A
 *  rarity's shortlist isn't scored, so it's only named here, with a way back
 *  to that rarity to sort it out. */
export default function ReviewStep({ picks, locked, onReorder, onRemove, onNote, onEdit, onOpenCard }: Props) {
  const total = totalPicked(picks);
  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {total === MTG_TOTAL_PICKS ? (
        <Notice tone="success" icon={<CheckCircleRoundedIcon />}>
          {locked ? "All 20 picks are in, and picks are locked." : "All 20 picks are in. You can keep changing them until picks lock."}
        </Notice>
      ) : (
        <Notice icon={<PlaylistAddCheckRoundedIcon />}>
          {total} of {MTG_TOTAL_PICKS} picked. Empty slots score 0, so fill every rarity before picks lock.
        </Notice>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        Drag to reorder. Nobody sees your picks, or your thoughts on them, until picks lock.
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" }, gap: { xs: 2, sm: 2.5 } }}>
        {MTG_RARITIES.map((rarity) => {
          const list = picks[rarity];
          const shortlist = list.slice(MTG_SLOTS_PER_RARITY);
          return (
            <AppCard key={rarity}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                <Box>
                  <Typography variant="h6" fontWeight={800} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>{RARITY_LABEL[rarity]}</Typography>
                  <Typography variant="caption" color="text.secondary">{scoredCount(list)} of {MTG_SLOTS_PER_RARITY}</Typography>
                </Box>
                {!locked && (
                  <Button size="small" variant="outlined" onClick={() => onEdit(rarity)} sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, boxShadow: "none" }}>
                    {scoredCount(list) < MTG_SLOTS_PER_RARITY ? "Add picks" : "Change"}
                  </Button>
                )}
              </Stack>
              {/* The five picks only: indexes match the whole list, so a
                  removal here lets the first shortlisted card move up. */}
              <PickList
                rarity={rarity}
                slots={list.slice(0, MTG_SLOTS_PER_RARITY)}
                locked={locked}
                onReorder={(from, to) => onReorder(rarity, from, to)}
                onRemove={(i) => onRemove(rarity, i)}
                onOpenCard={onOpenCard}
                onNoteChange={(i, note) => onNote(rarity, i, note)}
              />
              {shortlist.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.25, lineHeight: 1.45 }}>
                  Also on your shortlist, not scored: {shortlist.map((s) => s.card.name).join(", ")}.
                </Typography>
              )}
            </AppCard>
          );
        })}
      </Box>
    </Stack>
  );
}
