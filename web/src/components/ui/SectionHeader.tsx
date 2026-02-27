"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import * as React from "react";

type SectionEmphasis = "primary" | "secondary" | "subdued";

export type SectionHeaderProps = {
  title: string;
  emphasis?: SectionEmphasis;
};

const FALLBACK_UNDERLINE_WIDTH = 56;

/**
 * Reusable section header with accent bar. Use across dashboard, profile, and other pages.
 * Spacing below the header is controlled here for consistent rhythm system-wide.
 * On mobile: centered title with dynamic underline (50% of title width).
 */
export default function SectionHeader({ title, emphasis = "secondary" }: SectionHeaderProps) {
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const [underlineWidth, setUnderlineWidth] = React.useState(FALLBACK_UNDERLINE_WIDTH);

  React.useEffect(() => {
    const el = titleRef.current;
    if (!el) return;

    const updateWidth = () => {
      const w = el.offsetWidth;
      setUnderlineWidth(w > 0 ? Math.round(w * 0.5) : FALLBACK_UNDERLINE_WIDTH);
    };

    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [title]);

  const isPrimary = emphasis === "primary";
  const accentWidth = isPrimary ? 4 : 3;
  const accentColor =
    isPrimary ? "primary.main" : emphasis === "secondary" ? "primary.light" : "grey.300";
  const variant = emphasis === "subdued" ? "h6" : "h5";
  const color = emphasis === "subdued" ? "text.secondary" : "text.primary";
  const fontWeight = isPrimary ? 700 : 600;
  const fontSize =
    isPrimary
      ? { xs: "1.2rem", sm: "1.375rem" }
      : emphasis === "secondary"
        ? { xs: "1.0625rem", sm: "1.125rem" }
        : undefined;

  return (
    <Box
      component="header"
      sx={{
        display: "block",
        mb: { xs: 2.5, sm: 3 },
      }}
    >
      <Box
        sx={{
          borderLeft: { xs: 0, sm: accentWidth },
          borderColor: accentColor,
          pl: { xs: 0, sm: 2 },
          pt: { xs: 0, sm: 0.25 },
          pb: { xs: 0, sm: 0.25 },
          display: "flex",
          flexDirection: "column",
          alignItems: { xs: "center", sm: "flex-start" },
          textAlign: { xs: "center", sm: "left" },
        }}
      >
        <Typography
          ref={titleRef}
          component="h2"
          variant={variant}
          fontWeight={fontWeight}
          color={color}
          sx={{ letterSpacing: "-0.015em", ...(fontSize && { fontSize }) }}
        >
          {title}
        </Typography>
        <Box
          sx={{
            display: { xs: "block", sm: "none" },
            width: underlineWidth,
            minWidth: FALLBACK_UNDERLINE_WIDTH,
            height: 3.5,
            borderRadius: 2,
            bgcolor: accentColor,
            mt: 1.25,
            mb: 0.5,
          }}
        />
      </Box>
    </Box>
  );
}
