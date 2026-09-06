"use client";

import { useState } from "react";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Tooltip from "@mui/material/Tooltip";
import type { TooltipProps } from "@mui/material/Tooltip";
import useMediaQuery from "@mui/material/useMediaQuery";

/** Tooltip for informational chips and badges that must stay readable on
 *  touch screens. The theme disables MUI's touch listener globally (a
 *  touch-opened tooltip also fires on the touch that starts a scroll), so
 *  this wrapper supplies the deliberate path: a tap toggles the tooltip,
 *  tapping anywhere else closes it, and desktop hover keeps working.
 *
 *  Use it for non-interactive elements whose tooltip IS the explanation
 *  (status chips, record counts). Interactive elements whose tooltip is a
 *  hover hint (buttons with visible labels) should keep a plain Tooltip:
 *  their tap already performs an action, and the hint is desktop-only by
 *  design.
 */
export default function TapTooltip({
  title,
  children,
  placement = "top",
  block = false,
}: {
  title: React.ReactNode;
  children: React.ReactElement;
  placement?: TooltipProps["placement"];
  /** Fill the parent's slot instead of hugging the child. Needed when the
   *  child is a grid or flex item (stat tiles): the wrapper span becomes the
   *  item, and an inline-flex span would shrink the tile to its content. A
   *  single-cell grid stretches the child both ways, so equal-height rows
   *  survive. */
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // On touch-primary devices the tap that opens the tooltip is followed by
  // a synthetic mouseleave, which would fire onClose and shut it straight
  // back down. Disabling the hover listeners there makes tap/tap-away the
  // only controls; desktop keeps hover.
  const touchPrimary = useMediaQuery("(hover: none)");

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      {/* The span exists to catch taps and to give ClickAwayListener a
          stable DOM node. Inline-flex hugs the child so surrounding layout
          keeps its metrics; `block` swaps in a single-cell grid so a grid or
          flex child fills its slot instead. */}
      <span
        style={block ? { display: "grid", minWidth: 0 } : { display: "inline-flex" }}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Tooltip
          title={title}
          arrow
          placement={placement}
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          disableHoverListener={touchPrimary}
        >
          {children}
        </Tooltip>
      </span>
    </ClickAwayListener>
  );
}
