"use client";

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type MtgCard, type MtgRarity, MTG_NOTE_MAX, MTG_SLOTS_PER_RARITY, SLOT_MULTIPLIERS } from "../mtgTypes";
import { type PickSlot, noteLength } from "./pickUtils";

type Props = {
  rarity: MtgRarity;
  slots: PickSlot[];
  locked: boolean;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onOpenCard?: (card: MtgCard) => void;
  /** Review step: a Receipts field under each pick. */
  onNoteChange?: (index: number, note: string) => void;
  dense?: boolean;
};

/**
 * Five numbered slots for one rarity. Drag by the handle to reorder (dnd-kit
 * handles mouse, touch and keyboard), with up and down buttons as a fallback
 * for anyone who would rather tap. Empty slots stay visible so the ranking
 * always reads #1 to #5.
 */
export default function PickList({ rarity, slots, locked, onReorder, onRemove, onOpenCard, onNoteChange, dense }: Props) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short press before a touch drag starts, so a thumb scrolling the
    // page does not grab a card.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = slots.findIndex((s) => s.card.id === active.id);
    const to = slots.findIndex((s) => s.card.id === over.id);
    if (from >= 0 && to >= 0) onReorder(from, to);
  };

  const empties = Math.max(0, MTG_SLOTS_PER_RARITY - slots.length);

  return (
    <Stack spacing={dense ? 0.75 : 1}>
      <DndContext id={`mtg-picks-${rarity}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={slots.map((s) => s.card.id)} strategy={verticalListSortingStrategy}>
          {slots.map((slot, i) => (
            <SortableRow
              key={slot.card.id}
              slot={slot}
              index={i}
              count={slots.length}
              locked={locked}
              dense={!!dense}
              onReorder={onReorder}
              onRemove={onRemove}
              onOpenCard={onOpenCard}
              onNoteChange={onNoteChange}
            />
          ))}
        </SortableContext>
      </DndContext>
      {Array.from({ length: empties }, (_, k) => {
        const n = slots.length + k + 1;
        return (
          <Stack
            key={`empty-${n}`}
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ px: 1, py: dense ? 0.75 : 1, borderRadius: 2, border: "1px dashed", borderColor: "divider", color: "text.disabled" }}
          >
            <Typography sx={{ fontWeight: 800, minWidth: 28, textAlign: "center" }}>#{n}</Typography>
            <Typography variant="body2">Empty</Typography>
            <Typography variant="caption" sx={{ ml: "auto" }}>{SLOT_MULTIPLIERS[n - 1]}×</Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

type RowProps = {
  slot: PickSlot;
  index: number;
  count: number;
  locked: boolean;
  dense: boolean;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onOpenCard?: (card: MtgCard) => void;
  onNoteChange?: (index: number, note: string) => void;
};

function SortableRow({ slot, index, count, locked, dense, onReorder, onRemove, onOpenCard, onNoteChange }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: slot.card.id, disabled: locked });
  const { card } = slot;
  const noteLen = noteLength(slot.note);

  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{
        position: "relative",
        zIndex: isDragging ? 2 : "auto",
        borderRadius: 2,
        border: "1px solid",
        borderColor: isDragging ? "primary.main" : "divider",
        bgcolor: "background.paper",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.18)" : "none",
        px: 0.5,
        py: dense ? 0.5 : 0.75,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {!locked && (
          <IconButton
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            size="small"
            aria-label={`Drag ${card.name} to reorder`}
            sx={{ cursor: "grab", touchAction: "none", color: "text.disabled", "&:active": { cursor: "grabbing" } }}
          >
            <DragIndicatorRoundedIcon fontSize="small" />
          </IconButton>
        )}
        <Stack alignItems="center" sx={{ minWidth: 30, pl: locked ? 0.75 : 0 }}>
          <Typography sx={{ fontWeight: 800, color: "primary.main", lineHeight: 1 }}>#{index + 1}</Typography>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.625rem", lineHeight: 1.2 }}>{SLOT_MULTIPLIERS[index]}×</Typography>
        </Stack>
        <Box
          component={onOpenCard ? "button" : "div"}
          type={onOpenCard ? "button" : undefined}
          onClick={onOpenCard ? () => onOpenCard(card) : undefined}
          sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1, p: 0, border: 0, bgcolor: "transparent", textAlign: "left", font: "inherit", color: "inherit", cursor: onOpenCard ? "pointer" : "default" }}
        >
          <Box sx={{ width: dense ? 30 : 36, aspectRatio: "488 / 680", borderRadius: "6%", overflow: "hidden", bgcolor: "grey.100", flexShrink: 0 }}>
            {card.imageNormal && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.imageNormal} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            )}
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{card.name}</Typography>
        </Box>
        {!locked && (
          <Stack direction="row" sx={{ flexShrink: 0 }}>
            <IconButton size="small" aria-label={`Move ${card.name} up`} disabled={index === 0} onClick={() => onReorder(index, index - 1)} sx={{ p: 0.5 }}>
              <ArrowUpwardRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" aria-label={`Move ${card.name} down`} disabled={index === count - 1} onClick={() => onReorder(index, index + 1)} sx={{ p: 0.5 }}>
              <ArrowDownwardRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" aria-label={`Remove ${card.name}`} onClick={() => onRemove(index)} sx={{ p: 0.5 }}>
              <CloseRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Stack>
        )}
      </Stack>
      {onNoteChange && (
        <TextField
          value={slot.note}
          onChange={(e) => onNoteChange(index, e.target.value)}
          placeholder={locked ? "No Receipts note" : "Receipts: why this card? (optional)"}
          size="small"
          fullWidth
          disabled={locked}
          helperText={!locked && noteLen > 0 ? `${noteLen}/${MTG_NOTE_MAX}` : undefined}
          slotProps={{ htmlInput: { "aria-label": `Receipts note for ${card.name}` }, formHelperText: { sx: { textAlign: "right", mr: 0.5 } } }}
          sx={{ mt: 0.75, px: 0.5, "& .MuiOutlinedInput-root": { borderRadius: 1.5, fontSize: "0.875rem" } }}
        />
      )}
    </Box>
  );
}
