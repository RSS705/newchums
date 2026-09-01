"use client";

import { useState } from "react";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { SxProps, Theme } from "@mui/material/styles";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";

/** Shared "?" help-icon tooltip.
 *
 *  Behaviour:
 *    - Desktop hover opens / leaving closes (MUI default).
 *    - Clicking or tapping the icon **toggles** the tooltip. On touch this
 *      is the ONLY way it opens: the theme disables MUI's touch listener
 *      globally because a touch-opened tooltip also fires on the touch
 *      that starts a scroll, which sprayed tooltips while scrolling on
 *      phones. A tap lands here as a synthetic click, so deliberate
 *      presses still work.
 *    - Tapping anywhere else closes an open tooltip (ClickAwayListener),
 *      since touch never delivers the mouse-leave that closes it on
 *      desktop.
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
  // Touch-primary devices: the tap that opens the tooltip is followed by a
  // synthetic mouseleave that would immediately fire onClose. Hover
  // listeners are disabled there; tap toggles and tap-away closes.
  const touchPrimary = useMediaQuery("(hover: none)");

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      {/* inline-flex span hugs the IconButton exactly, so layouts that
          size around HelpTooltip (e.g. the bell row) keep their metrics;
          it exists to give ClickAwayListener a stable DOM node. */}
      <span style={{ display: "inline-flex" }}>
        <Tooltip
          title={title}
          arrow
          placement="top"
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          disableHoverListener={touchPrimary}
        >
          <IconButton
            size="small"
            aria-label={ariaLabel}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((prev) => !prev);
            }}
            sx={{ p: 0.25, color: "text.disabled", ...sx }}
          >
            <HelpOutlineRoundedIcon sx={{ fontSize: iconSize }} />
          </IconButton>
        </Tooltip>
      </span>
    </ClickAwayListener>
  );
}
