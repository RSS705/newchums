"use client";

import Chip from "@mui/material/Chip";
import { TapTooltip } from "@/components/ui";
import { BadgeGlyph } from "../badgeIcons";
import { BADGE_TIER_STYLE, type MtgBadge } from "../mtgTypes";

/** A badge in its tier colors with its icon: filled when earned, a dashed
 *  outline when the player is only on track for it, and "×2" when it stacks.
 *  Its reason shows on hover, tap or keyboard focus, and screen readers hear
 *  it as the chip's description. */
export default function BadgeChip({ badge, size = "small" }: { badge: MtgBadge; size?: "small" | "medium" }) {
  const style = BADGE_TIER_STYLE[badge.tier] ?? BADGE_TIER_STYLE.common;
  const count = badge.count && badge.count > 1 ? ` \u00d7${badge.count}` : "";
  return (
    <TapTooltip title={badge.description} placement="top" describeChild>
      <Chip
        icon={<BadgeGlyph code={badge.code} />}
        label={`${badge.name}${count}`}
        size={size}
        tabIndex={0}
        sx={{
          height: size === "small" ? { xs: 30, sm: 24 } : 30,
          fontWeight: 700,
          fontSize: size === "small" ? "0.6875rem" : "0.8125rem",
          bgcolor: badge.onTrack ? "background.paper" : style.bg,
          color: style.fg,
          border: "1px solid",
          borderColor: style.border,
          borderStyle: badge.onTrack || badge.tier === "shame" ? "dashed" : "solid",
          "& .MuiChip-icon": { color: style.fg, fontSize: size === "small" ? "0.875rem" : "1rem", ml: "6px", mr: "-2px" },
          "& .MuiChip-label": { px: 1 },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
        }}
      />
    </TapTooltip>
  );
}
