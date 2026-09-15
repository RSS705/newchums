"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FlipCameraAndroidRoundedIcon from "@mui/icons-material/FlipCameraAndroidRounded";
import { type MtgCard, type MtgCardWithNew, SLOT_MULTIPLIERS, MTG_SLOTS_PER_RARITY } from "../mtgTypes";
import ManaCost from "./ManaCost";
import { type PickSlot, formatPreviewDate } from "./pickUtils";

type Props = {
  open: boolean;
  cards: MtgCardWithNew[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  picks: PickSlot[];
  locked: boolean;
  onAdd: (card: MtgCard) => void;
  onRemove: (cardId: string) => void;
  onReplace: (card: MtgCard, slotIndex: number) => void;
  /** Read-only browsing (the Reveal): no add, remove or locked button. */
  hideAction?: boolean;
};

/**
 * Tap a card to see it large (spec 10.3): flip for double-faced cards, the
 * rules text, who previewed it, previous and next with arrows, arrow keys or
 * a swipe, and one big action. When all five slots are full the action asks
 * which pick to replace instead of failing.
 */
export default function CardViewer({ open, cards, index, onIndexChange, onClose, picks, locked, onAdd, onRemove, onReplace, hideAction = false }: Props) {
  const card = cards[index];
  const hasPrev = index > 0;
  const hasNext = index < cards.length - 1;
  // The body remounts for each card, so the Previous or Next button that was
  // used gets focus again on the new card; arrow keys and swipes leave focus
  // where it was.
  const [navButton, setNavButton] = useState<"prev" | "next" | null>(null);
  const prev = (via: "prev" | null = null) => { setNavButton(via); if (hasPrev) onIndexChange(index - 1); };
  const next = (via: "next" | null = null) => { setNavButton(via); if (hasNext) onIndexChange(index + 1); };

  return (
    <Dialog
      open={open && !!card}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { "aria-label": card ? card.name : "Card" } }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
        if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      }}
    >
      {card && (
        <ViewerBody
          key={card.id}
          card={card}
          position={`${index + 1} of ${cards.length}`}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrev={prev}
          onNext={next}
          navButton={navButton}
          onClose={onClose}
          picks={picks}
          locked={locked}
          onAdd={onAdd}
          onRemove={onRemove}
          onReplace={onReplace}
          hideAction={hideAction}
        />
      )}
    </Dialog>
  );
}

type BodyProps = {
  card: MtgCardWithNew;
  position: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: (via?: "prev" | null) => void;
  onNext: (via?: "next" | null) => void;
  onClose: () => void;
  /** The navigation button that brought this card up, to focus again. */
  navButton: "prev" | "next" | null;
  picks: PickSlot[];
  locked: boolean;
  onAdd: (card: MtgCard) => void;
  onRemove: (cardId: string) => void;
  onReplace: (card: MtgCard, slotIndex: number) => void;
  hideAction: boolean;
};

/** Keyed by card id, so flipping and the replace sheet reset on each card. */
function ViewerBody({ card, position, hasPrev, hasNext, onPrev, onNext, onClose, picks, locked, onAdd, onRemove, onReplace, hideAction, navButton }: BodyProps) {
  const [flipped, setFlipped] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const prevRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (navButton === "prev") prevRef.current?.focus();
    if (navButton === "next") nextRef.current?.focus();
  }, [navButton]);

  const front = card.imageLarge ?? card.imageNormal;
  const back = card.imageBackLarge ?? card.imageBackNormal;
  const image = flipped && back ? back : front;
  const pickedIndex = picks.findIndex((p) => p.card.id === card.id);
  const full = picks.length >= MTG_SLOTS_PER_RARITY;
  const previewDate = formatPreviewDate(card.previewedAt);

  return (
    <Box sx={{ position: "relative", display: "flex", flexDirection: "column", minHeight: 0, height: { xs: "100%", sm: "auto" } }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: { xs: 1, sm: 2 }, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 44, height: 44 }}><CloseRoundedIcon /></IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, textAlign: "center", fontWeight: 600 }}>{position}</Typography>
        <IconButton ref={prevRef} onClick={() => onPrev("prev")} disabled={!hasPrev} aria-label="Previous card" sx={{ width: 44, height: 44 }}><ChevronLeftRoundedIcon /></IconButton>
        <IconButton ref={nextRef} onClick={() => onNext("next")} disabled={!hasNext} aria-label="Next card" sx={{ width: 44, height: 44 }}><ChevronRightRoundedIcon /></IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflowY: "auto", px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 3 } }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 2, md: 3 }} alignItems={{ xs: "center", md: "flex-start" }}>
          <Box
            onTouchStart={(e) => { const t = e.touches[0]; touchStart.current = { x: t.clientX, y: t.clientY }; }}
            onTouchEnd={(e) => {
              const start = touchStart.current;
              touchStart.current = null;
              if (!start) return;
              const t = e.changedTouches[0];
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) onNext(); else onPrev(); }
            }}
            sx={{ width: { xs: "min(100%, 340px)", md: 340 }, flexShrink: 0, position: "relative" }}
          >
            <Box sx={{ aspectRatio: "488 / 680", borderRadius: "4.5% / 3.2%", overflow: "hidden", bgcolor: "grey.100", border: "1px solid", borderColor: "divider" }}>
              {image ? (
                // Scryfall images are shown whole, never cropped or covered.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={flipped ? `${card.name}, back face` : card.name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              ) : (
                <Stack sx={{ height: "100%", p: 2 }} alignItems="center" justifyContent="center">
                  <Typography fontWeight={700} textAlign="center">{card.name}</Typography>
                  <Typography variant="caption" color="text.secondary">Image not available yet</Typography>
                </Stack>
              )}
            </Box>
            {back && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<FlipCameraAndroidRoundedIcon />}
                onClick={() => setFlipped((f) => !f)}
                sx={{ mt: 1, textTransform: "none", fontWeight: 600, borderRadius: 2, width: "100%" }}
              >
                {flipped ? "Show front" : "Flip card"}
              </Button>
            )}
          </Box>

          <Box sx={{ minWidth: 0, flex: 1, width: "100%" }}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: "1.25rem", sm: "1.5rem" }, lineHeight: 1.2 }}>{card.name}</Typography>
              <ManaCost cost={card.manaCost} size={20} />
            </Stack>
            {card.typeLine && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 600 }}>{card.typeLine}</Typography>}
            {card.oracleText && (
              <Typography variant="body2" sx={{ mt: 1.5, whiteSpace: "pre-line", lineHeight: 1.6 }}>{card.oracleText}</Typography>
            )}
            {(card.previewSource || previewDate) && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                Previewed{card.previewSource ? " by " : ""}
                {card.previewSource && card.previewSourceUri ? (
                  <Link href={card.previewSourceUri} target="_blank" rel="noopener noreferrer" underline="hover">{card.previewSource}</Link>
                ) : card.previewSource}
                {previewDate ? ` on ${previewDate}` : ""}
              </Typography>
            )}
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>#{card.collectorNumber}</Typography>

            {replacing ? (
              <Box sx={{ mt: 2.5, p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Replace which pick?</Typography>
                <Stack spacing={0.75}>
                  {picks.map((p, i) => (
                    <Button
                      key={p.card.id}
                      variant="text"
                      onClick={() => { onReplace(card, i); setReplacing(false); }}
                      sx={{ justifyContent: "flex-start", textTransform: "none", borderRadius: 2, color: "text.primary", gap: 1.25, py: 0.75 }}
                    >
                      <Typography component="span" sx={{ fontWeight: 800, color: "primary.main", minWidth: 24 }}>#{i + 1}</Typography>
                      <Typography component="span" sx={{ fontWeight: 600, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.card.name}</Typography>
                    </Button>
                  ))}
                </Stack>
                <Button size="small" variant="text" onClick={() => setReplacing(false)} sx={{ mt: 1, textTransform: "none", color: "text.secondary" }}>Cancel</Button>
              </Box>
            ) : null}
          </Box>
        </Stack>
      </Box>

      {!hideAction && (
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
        {locked ? (
          <Button fullWidth variant="contained" disabled sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, py: 1.25 }}>Picks are locked</Button>
        ) : pickedIndex >= 0 ? (
          <Button fullWidth variant="outlined" color="inherit" onClick={() => onRemove(card.id)} sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, py: 1.25 }}>
            Remove #{pickedIndex + 1}
          </Button>
        ) : full ? (
          <Button fullWidth variant="contained" onClick={() => setReplacing(true)} disabled={replacing} sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, py: 1.25, boxShadow: "none" }}>
            All five picked. Replace one…
          </Button>
        ) : (
          <Button fullWidth variant="contained" onClick={() => onAdd(card)} sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, py: 1.25, boxShadow: "none" }}>
            Add as #{picks.length + 1}
            <Typography component="span" sx={{ ml: 1, fontWeight: 600, opacity: 0.8, fontSize: "0.8125rem" }}>counts {SLOT_MULTIPLIERS[picks.length]}×</Typography>
          </Button>
        )}
      </Box>
      )}
    </Box>
  );
}
