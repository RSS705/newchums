"use client";

import { useRef, useState } from "react";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import type { SxProps, Theme } from "@mui/material/styles";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";

/** Shared "?" help-icon tooltip.
 *
 *  Behaviour:
 *    - Desktop hover opens / leaving closes (MUI default).
 *    - Clicking the icon **toggles** the tooltip, so a re-click on an
 *      already-open tip closes it instead of leaving it stuck on. Clicks
 *      originating from touch (tap-to-open on mobile) are ignored so the
 *      tap doesn't immediately close the tooltip it just opened.
 *
 *  Kept as a single source of truth so "?" tooltips behave the same
 *  wherever they appear (plan form, settings, etc.).
 */
export default function HelpTooltip({
  title,
  iconSize = 16,
  sx,
  ariaLabel = "More info",
}: {
  title: React.ReactNode;
  iconSize?: number;
  sx?: SxProps<Theme>;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // Records the pointer type of the most recent press so the click handler
  // can distinguish a real mouse click from the synthetic click that fires
  // after a touch tap. Without this, the tap that opens the tooltip would
  // immediately close it again on mobile.
  const lastPointerType = useRef<"mouse" | "pen" | "touch" | null>(null);

  return (
    <Tooltip
      title={title}
      arrow
      placement="top"
      enterTouchDelay={0}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    >
      <IconButton
        size="small"
        aria-label={ariaLabel}
        onPointerDown={(e) => {
          lastPointerType.current = (e.pointerType as typeof lastPointerType.current) ?? "mouse";
        }}
        onClick={(e) => {
          if (lastPointerType.current === "touch") {
            lastPointerType.current = null;
            return;
          }
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        sx={{ p: 0.25, color: "text.disabled", ...sx }}
      >
        <HelpOutlineRoundedIcon sx={{ fontSize: iconSize }} />
      </IconButton>
    </Tooltip>
  );
}
