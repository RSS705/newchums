"use client";

import Chip from "@mui/material/Chip";
import { TapTooltip } from "@/components/ui";
import { BADGE_TIER_STYLE, type MtgBadge } from "../mtgTypes";

/** A badge in its tier colors. Its reason shows on hover, tap or keyboard
 *  focus, and screen readers hear it as the chip's description. */
export default function BadgeChip({ badge, size = "small" }: { badge: MtgBadge; size?: "small" | "medium" }) {
  const style = BADGE_TIER_STYLE[badge.tier] ?? BADGE_TIER_STYLE.common;
  return (
    <TapTooltip title={badge.description} placement="top" describeChild>
      <Chip
        label={badge.name}
        size={size}
        tabIndex={0}
        sx={{
          height: size === "small" ? { xs: 30, sm: 24 } : 30,
          fontWeight: 700,
          fontSize: size === "small" ? "0.6875rem" : "0.8125rem",
          bgcolor: style.bg,
          color: style.fg,
          border: "1px solid",
          borderColor: style.border,
          borderStyle: badge.tier === "shame" ? "dashed" : "solid",
          "& .MuiChip-label": { px: 1 },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
        }}
      />
    </TapTooltip>
  );
}
