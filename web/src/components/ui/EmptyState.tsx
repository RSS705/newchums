"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

type EmptyStateProps = {
  /** Icon element displayed above the headline. Rendered at 56px. */
  icon?: ReactNode;
  /** Primary headline. Keep it short and friendly. */
  title: string;
  /** Supporting copy. One or two sentences max. */
  description?: string;
  /** CTA area: buttons, links, etc. */
  action?: ReactNode;
  /** Optional small note below the actions (e.g. a caption hint). */
  footnote?: string;
};

/**
 * Shared empty-state block used across logged-in pages.
 *
 * Visual spec (derived from the Communities benchmark):
 *  - Centered layout inside a Stack with spacing={2}
 *  - Icon: 56px, text.disabled at 0.5 opacity
 *  - Title: h6, fontWeight 600
 *  - Description: body2, text.secondary, maxWidth 400
 *  - Actions: row on sm+, column on xs, with mt:1
 *  - Padding: py 5/6 to stay compact
 *
 * This component renders only the inner content. The caller decides
 * whether to wrap it in an AppCard or leave it bare.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  footnote,
}: EmptyStateProps) {
  return (
    <Stack spacing={2} alignItems="center" sx={{ py: { xs: 5, sm: 6 } }}>
      {icon && (
        <Box sx={{ color: "text.disabled", opacity: 0.5, lineHeight: 0 }}>
          {icon}
        </Box>
      )}
      <Box sx={{ textAlign: "center" }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        {description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 400, mx: "auto", lineHeight: 1.6 }}
          >
            {description}
          </Typography>
        )}
      </Box>
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
      {footnote && (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ maxWidth: 340, textAlign: "center" }}
        >
          {footnote}
        </Typography>
      )}
    </Stack>
  );
}
