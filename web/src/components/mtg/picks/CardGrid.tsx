"use client";

import { memo, useState } from "react";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import type { MtgCardWithNew } from "../mtgTypes";
import { COLOR_FILTERS, MV_FILTERS, TYPE_FILTERS, type CardFilters, type SortKey, EMPTY_FILTERS, activeFilterCount } from "./pickUtils";

type Props = {
  cards: MtgCardWithNew[] | undefined;
  visible: MtgCardWithNew[];
  filters: CardFilters;
  onFiltersChange: (next: CardFilters) => void;
  pickedSlotById: Map<string, number>;
  onOpen: (visibleIndex: number) => void;
  pluralLabel: string;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Search, filters and the card grid for one rarity. */
export default function CardGrid({ cards, visible, filters, onFiltersChange, pickedSlotById, onOpen, pluralLabel }: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const narrow = useMediaQuery(useTheme().breakpoints.down("sm"), { noSsr: true });
  const active = activeFilterCount(filters);
  const set = (patch: Partial<CardFilters>) => onFiltersChange({ ...filters, ...patch });

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          fullWidth
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          // A phone's field shows about ten letters beside the Filters button.
          placeholder={narrow ? "Search" : `Search ${pluralLabel} by name or rules text`}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 20 }} /></InputAdornment> },
            htmlInput: { "aria-label": `Search ${pluralLabel}` },
          }}
          // The theme's input padding also overrides MUI's zero left padding
          // beside an icon, which left a wide gap before the placeholder.
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 }, "& .MuiInputBase-inputAdornedStart": { pl: 0 } }}
        />
        <Badge color="primary" badgeContent={active} invisible={active === 0}>
          <Button
            variant={showFilters ? "contained" : "outlined"}
            onClick={() => setShowFilters((s) => !s)}
            startIcon={<TuneRoundedIcon />}
            aria-expanded={showFilters}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, whiteSpace: "nowrap", boxShadow: "none", minHeight: 40 }}
          >
            Filters
          </Button>
        </Badge>
      </Stack>

      <Collapse in={showFilters} unmountOnExit>
        <Stack spacing={1.5} sx={{ mt: 1.5, p: 1.5, borderRadius: 2.5, border: "1px solid", borderColor: "divider", bgcolor: (t) => (t.palette.mode === "light" ? "grey.50" : "rgba(255,255,255,0.03)") }}>
          <FilterRow label="Color">
            {COLOR_FILTERS.map((c) => (
              <Chip key={c.key} label={c.label} size="small" onClick={() => set({ colors: toggle(filters.colors, c.key) })}
                color={filters.colors.includes(c.key) ? "primary" : "default"} variant={filters.colors.includes(c.key) ? "filled" : "outlined"} />
            ))}
          </FilterRow>
          <FilterRow label="Type">
            {TYPE_FILTERS.map((t) => (
              <Chip key={t} label={t} size="small" onClick={() => set({ types: toggle(filters.types, t) })}
                color={filters.types.includes(t) ? "primary" : "default"} variant={filters.types.includes(t) ? "filled" : "outlined"} />
            ))}
          </FilterRow>
          <FilterRow label="Mana value">
            {MV_FILTERS.map((m) => (
              <Chip key={m} label={m} size="small" onClick={() => set({ mvs: toggle(filters.mvs, m) })} sx={{ minWidth: 40 }}
                color={filters.mvs.includes(m) ? "primary" : "default"} variant={filters.mvs.includes(m) ? "filled" : "outlined"} />
            ))}
          </FilterRow>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.5, sm: 2 }} alignItems={{ xs: "flex-start", sm: "center" }} useFlexGap flexWrap="wrap">
            <FormControlLabel control={<Switch size="small" checked={filters.newOnly} onChange={(e) => set({ newOnly: e.target.checked })} />} label={<Typography variant="body2">New only</Typography>} />
            <FormControlLabel control={<Switch size="small" checked={filters.hidePicked} onChange={(e) => set({ hidePicked: e.target.checked })} />} label={<Typography variant="body2">Hide picked</Typography>} />
            <TextField select size="small" label="Sort" value={filters.sort} onChange={(e) => set({ sort: e.target.value as SortKey })} sx={{ minWidth: 170 }}>
              <MenuItem value="number">Collector number</MenuItem>
              <MenuItem value="color">Color</MenuItem>
              <MenuItem value="mv">Mana value</MenuItem>
            </TextField>
            {active > 0 && (
              <Button size="small" variant="text" onClick={() => onFiltersChange({ ...EMPTY_FILTERS, search: filters.search, sort: filters.sort })} sx={{ textTransform: "none", color: "text.secondary" }}>
                Clear filters
              </Button>
            )}
          </Stack>
        </Stack>
      </Collapse>

      {!cards && <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>Loading cards…</Typography>}
      {cards && cards.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>No {pluralLabel} revealed yet. Check back as previews continue.</Typography>
      )}
      {cards && cards.length > 0 && visible.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>No {pluralLabel} match those filters.</Typography>
      )}
      {visible.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5, mb: 1 }}>
            {visible.length === cards?.length ? `${visible.length} ${pluralLabel}` : `${visible.length} of ${cards?.length ?? 0} ${pluralLabel}`}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", sm: "repeat(auto-fill, minmax(112px, 1fr))" },
              gap: { xs: 0.75, sm: 1.25 },
            }}
          >
            {visible.map((card, i) => (
              <CardTile key={card.id} card={card} index={i} slot={pickedSlotById.get(card.id) ?? null} onOpen={onOpen} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: "block", mb: 0.5, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.6875rem" }}>{label}</Typography>
      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">{children}</Stack>
    </Box>
  );
}

/** One card in the grid. Memoised: a pick changes one tile's badge, and the
 *  other hundred should not re-render for it. */
const CardTile = memo(function CardTile({ card, index, slot, onOpen }: { card: MtgCardWithNew; index: number; slot: number | null; onOpen: (index: number) => void }) {
  const label = `${card.name}${slot ? `, your #${slot}` : ""}${card.isNew ? ", new" : ""}`;
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(index)}
      aria-label={label}
      sx={{
        p: 0,
        m: 0,
        border: 0,
        bgcolor: "transparent",
        cursor: "pointer",
        textAlign: "left",
        minWidth: 0,
        font: "inherit",
        color: "inherit",
        borderRadius: 1.5,
        "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
      }}
    >
      <Box
        sx={{
          position: "relative",
          aspectRatio: "488 / 680",
          borderRadius: "4.5% / 3.2%",
          overflow: "hidden",
          bgcolor: "grey.100",
          border: "2px solid",
          borderColor: slot ? "primary.main" : "transparent",
          boxShadow: slot ? "0 0 0 1px rgba(230,91,19,0.25)" : "none",
          transition: "border-color 120ms ease",
        }}
      >
        {card.imageNormal ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageNormal} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        ) : (
          <Stack sx={{ height: "100%", p: 0.75 }} alignItems="center" justifyContent="center">
            <Typography variant="caption" fontWeight={700} textAlign="center" sx={{ lineHeight: 1.2 }}>{card.name}</Typography>
          </Stack>
        )}
        {slot && (
          <Box sx={{ position: "absolute", top: 4, left: 4, minWidth: 26, height: 26, px: 0.75, borderRadius: 13, bgcolor: "primary.main", color: "#fff", fontWeight: 800, fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
            #{slot}
          </Box>
        )}
        {card.isNew && (
          <Box sx={{ position: "absolute", top: 6, right: -22, transform: "rotate(35deg)", bgcolor: "#1E8E5A", color: "#fff", fontSize: "0.625rem", fontWeight: 800, letterSpacing: "0.06em", px: 3, py: "1px", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }}>
            NEW
          </Box>
        )}
      </Box>
      <Typography variant="caption" sx={{ display: "block", mt: 0.5, fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={card.name}>
        {card.name}
      </Typography>
    </Box>
  );
});
