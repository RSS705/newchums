"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

export type ProfileSectionHeaderProps = {
  /** Heading icon. Rendered inside the orb at fontSize 20. */
  icon: ReactNode;
  title: string;
  /** Optional supporting line under the title. */
  subtitle?: string;
  /** Optional small count or label (e.g. total chums). Sits inline with the title. */
  meta?: ReactNode;
  /** Optional trailing slot, right-aligned. Useful for owner inline toggles. */
  action?: ReactNode;
  /** Color of the orb. Defaults to primary. */
  tone?: "primary" | "secondary";
};

/**
 * Unified section header for public profile cards. Matches the icon-orb
 * pattern AttendanceRecordSection ships with so every dossier card on the
 * profile reads as part of the same product surface, instead of every
 * section reinventing its own heading shape.
 *
 * Used by About, Hobbies, Chums, Communities, and Shout-outs.
 */
export default function ProfileSectionHeader({
  icon,
  title,
  subtitle,
  meta,
  action,
  tone = "primary",
}: ProfileSectionHeaderProps) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          bgcolor: `${tone}.light`,
          color: `${tone}.main`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="baseline" useFlexGap>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
          >
            {title}
          </Typography>
          {meta != null && (
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                fontVariantNumeric: "tabular-nums",
                fontSize: "0.8125rem",
              }}
            >
              {meta}
            </Typography>
          )}
        </Stack>
        {subtitle && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ fontSize: "0.75rem", display: "block", lineHeight: 1.35 }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Stack>
  );
}
