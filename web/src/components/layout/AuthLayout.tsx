"use client";

import Box from "@mui/material/Box";
import type { ReactNode } from "react";

/**
 * Shared auth layout: full-height content, no header bar.
 * Used by login, signup, forgot-password, reset-password.
 * Provides clean split layout (template-style) without top banner.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </Box>
  );
}
