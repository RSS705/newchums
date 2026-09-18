"use client";

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import { DndContext, KeyboardSensor, MouseSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type MtgCard, type MtgRarity, MTG_SLOTS_PER_RARITY } from "../mtgTypes";
import type { PickSlot } from "./pickUtils";

type Props = {
  rarity: MtgRarity;
  /** The rarity's list in order: the first five are picks, the rest the shortlist. */
  slots: PickSlot[];
  locked: boolean;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onOpenCard?: (card: MtgCard) => void;
  /** Desktop rail: one line per pick with compact controls. */
  dense?: boolean;
};

/**
 * Whether lists reorder with up and down buttons instead of dragging: on
 * phones and narrow windows (below the breakpoint where the pick rail gives
 * way to the bottom bar), and on any touch screen. Dragging a row by a small
 * handle is unreliable under a thumb, and it fights the page's own scrolling.
 */
export function useArrowReorder(): boolean {
  const narrow = useMediaQuery((t: Theme) => t.breakpoints.down("md"));
  const coarse = useMediaQuery("(pointer: coarse)");
  return narrow || coarse;
}

/**
 * One rarity's list. With a mouse, drag a card by its handle to reorder it
 * (or focus the handle, press Space, then the arrow keys). On phones and
 * touch screens each row has up and down buttons instead. The first five are
 * the picks and stay numbered #1 to #5, with empty slots showing until they're
 * filled; anything below them is the shortlist, set apart by a divider, and a
 * card moved above the divider becomes a pick. Tapping a card opens it large.
 */
export default function PickList({ rarity, slots, locked, onReorder, onRemove, onOpenCard, dense }: Props) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const arrows = useArrowReorder();

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = slots.findIndex((s) => s.card.id === active.id);
    const to = slots.findIndex((s) => s.card.id === over.id);
    if (from >= 0 && to >= 0) onReorder(from, to);
  };

  const empties = Math.max(0, MTG_SLOTS_PER_RARITY - slots.length);
  const row = (slot: PickSlot, i: number) => (
    <SortableRow
      key={slot.card.id}
      slot={slot}
      index={i}
      count={slots.length}
      locked={locked}
      dense={!!dense}
      arrows={arrows}
      onReorder={onReorder}
      onRemove={onRemove}
      onOpenCard={onOpenCard}
    />
  );

  return (
    <Stack spacing={dense ? 0.75 : 1}>
      <DndContext id={`mtg-picks-${rarity}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={slots.map((s) => s.card.id)} strategy={verticalListSortingStrategy}>
          {slots.slice(0, MTG_SLOTS_PER_RARITY).map(row)}
          {slots.length > MTG_SLOTS_PER_RARITY && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ pt: 0.5 }} role="separator" aria-label="Shortlist, not scored">
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ whiteSpace: "nowrap" }}>Shortlist, not scored</Typography>
              <Box aria-hidden sx={{ flex: 1, borderTop: "1px dashed", borderColor: "divider" }} />
            </Stack>
          )}
          {slots.slice(MTG_SLOTS_PER_RARITY).map((slot, k) => row(slot, MTG_SLOTS_PER_RARITY + k))}
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
            sx={{ px: 1, py: dense ? 0.75 : 1, minHeight: dense ? 40 : 48, borderRadius: 2, border: "1px dashed", borderColor: "divider", color: "text.disabled" }}
          >
            <Typography sx={{ fontWeight: 800, minWidth: 28, textAlign: "center" }}>#{n}</Typography>
            <Typography variant="body2">Empty</Typography>
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
  arrows: boolean;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onOpenCard?: (card: MtgCard) => void;
};

function SortableRow({ slot, index, count, locked, dense, arrows, onReorder, onRemove, onOpenCard }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: slot.card.id, disabled: locked || arrows });
  const { card } = slot;
  const shortlisted = index >= MTG_SLOTS_PER_RARITY;
  // The desktop rail is narrow, so its controls are smaller and names get two lines.
  const control = dense ? { width: 28, height: 28 } : { width: { xs: 40, sm: 32 }, height: { xs: 40, sm: 32 } };
  // Thumb-sized, and a little narrower than tall so a 320px row keeps room for the name.
  const arrowButton = { width: 36, height: 40, color: "text.secondary", flexShrink: 0 };
  const twoLines = dense || arrows;

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
        {!locked && !arrows && (
          <IconButton
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Drag ${card.name} to reorder`}
            sx={{ ...control, cursor: "grab", touchAction: "none", color: "text.disabled", flexShrink: 0, "&:active": { cursor: "grabbing" } }}
          >
            <DragIndicatorRoundedIcon fontSize="small" />
          </IconButton>
        )}
        <Typography sx={{ fontWeight: 800, color: shortlisted ? "text.disabled" : "primary.main", lineHeight: 1, minWidth: dense ? 24 : 30, fontSize: dense ? "0.9375rem" : undefined, textAlign: "center", pl: locked || arrows ? 0.5 : 0, flexShrink: 0 }}>
          #{index + 1}
        </Typography>
        <Box
          component={onOpenCard ? "button" : "div"}
          type={onOpenCard ? "button" : undefined}
          onClick={onOpenCard ? () => onOpenCard(card) : undefined}
          aria-label={onOpenCard ? `Open ${card.name}` : undefined}
          sx={{
            display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1, minHeight: 40, p: 0, border: 0, bgcolor: "transparent",
            textAlign: "left", font: "inherit", color: "inherit", borderRadius: 1.5,
            cursor: onOpenCard ? "pointer" : "default",
            ...(onOpenCard && {
              "&:hover .pick-name": { textDecoration: "underline" },
              "&:hover .pick-thumb": { boxShadow: "0 0 0 2px", color: "primary.main" },
              "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }),
          }}
        >
          {/* Below 360px the thumbnail gives its room to the name and the buttons. */}
          <Box className="pick-thumb" sx={{ width: dense ? 26 : 36, aspectRatio: "488 / 680", borderRadius: "6%", overflow: "hidden", bgcolor: "grey.100", flexShrink: 0, transition: "box-shadow 120ms ease", opacity: shortlisted ? 0.85 : 1, ...(arrows && !locked && { "@media (max-width: 359.95px)": { display: "none" } }) }}>
            {card.imageNormal && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.imageNormal} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            )}
          </Box>
          <Typography
            className="pick-name"
            variant="body2"
            title={card.name}
            sx={{
              fontWeight: 600, minWidth: 0, color: shortlisted ? "text.secondary" : "text.primary", overflow: "hidden",
              ...(twoLines
                ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.25, fontSize: dense ? "0.8125rem" : "0.875rem", overflowWrap: "anywhere" }
                : { textOverflow: "ellipsis", whiteSpace: "nowrap" }),
            }}
          >
            {card.name}
          </Typography>
        </Box>
        {!locked && arrows && (
          <Stack direction="row" sx={{ flexShrink: 0 }}>
            <IconButton aria-label={`Move ${card.name} up`} disabled={index === 0} onClick={() => onReorder(index, index - 1)} sx={arrowButton}>
              <ArrowUpwardRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
            <IconButton aria-label={`Move ${card.name} down`} disabled={index === count - 1} onClick={() => onReorder(index, index + 1)} sx={arrowButton}>
              <ArrowDownwardRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Stack>
        )}
        {!locked && (
          // Set a little apart from the move buttons, so a slip doesn't remove a card.
          <IconButton aria-label={`Remove ${card.name}`} onClick={() => onRemove(index)} sx={{ ...(arrows ? { width: 36, height: 40 } : control), ml: arrows ? "6px !important" : undefined, color: "text.secondary", flexShrink: 0 }}>
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Stack>
    </Box>
  );
}
