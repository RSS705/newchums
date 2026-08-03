"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { AppCard } from "@/components/ui";

type CollapsibleSectionProps = {
  /** Stable key, used for the aria-controls wiring. */
  sectionKey: string;
  /** 22px icon element rendered inside the 40px circle, matching the
   *  always-open section headers. */
  icon: ReactNode;
  title: string;
  /** Summary of the section's current value, shown while collapsed
   *  ("Visibility: Public" style). Keep it short; it renders clamped to at
   *  most two lines. */
  summary: string;
  /** Descriptive helper shown in place of the summary while expanded, same
   *  role as the caption the always-open section headers carry. */
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/**
 * A plan-form section that is collapsed by default.
 *
 * The create form is the longest single screen in the product and the person
 * most likely to be on it has known about NewChums for about ninety seconds.
 * The two-tier structure keeps the minimum viable plan (title, when, where,
 * seats) always visible and folds everything optional into these: still on
 * the page, discoverable at a glance via the summary line, one tap away.
 *
 * Children stay mounted while collapsed (MUI Collapse hides by height), so
 * field refs used by scroll-to-first-error keep registering and expanding
 * never re-initializes editor state.
 */
export default function CollapsibleSection({
  sectionKey,
  icon,
  title,
  summary,
  subtitle,
  expanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const regionId = `plan-section-${sectionKey}`;
  return (
    <AppCard>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={regionId}
        sx={{
          width: "100%",
          textAlign: "left",
          borderRadius: 1.5,
          // Enlarge the tap target beyond the row content without changing
          // the card's visual inset.
          m: -0.5,
          p: 0.5,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: "100%" }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              bgcolor: "primary.light",
              color: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
            >
              {title}
            </Typography>
            {expanded && subtitle ? (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                {subtitle}
              </Typography>
            ) : (
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  fontWeight: 500,
                  fontSize: "0.75rem",
                  lineHeight: 1.35,
                  // Two-line clamp instead of single-line ellipsis: the
                  // header is only ~160px wide at 320px viewports, where a
                  // one-line summary cannot carry a whole fact (the hobbies
                  // "you're opting out of nearby notifications" line was the
                  // forcing case). Most summaries still fit one line; the
                  // clamp only spends the second when squeezed.
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {summary}
              </Typography>
            )}
          </Box>
          <ExpandMoreRoundedIcon
            sx={{
              color: "text.secondary",
              flexShrink: 0,
              transition: "transform 0.2s ease",
              transform: expanded ? "rotate(180deg)" : "none",
            }}
          />
        </Stack>
      </ButtonBase>
      <Collapse in={expanded} timeout={220}>
        <Box id={regionId} sx={{ pt: 2.5 }}>
          {children}
        </Box>
      </Collapse>
    </AppCard>
  );
}
