"use client";

import Box from "@mui/material/Box";
import { useEffect, type ReactNode } from "react";

/**
 * Shared auth layout: full-height content, no header bar.
 * Used by login, signup, forgot-password, reset-password.
 * Zeroes the #app-scroll-root header offset while mounted so there's no gap.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.getElementById("app-scroll-root");
    if (!root) return;
    root.style.setProperty("--header-h", "0px");
    root.style.marginTop = "0";
    root.style.height = "100%";
    return () => {
      root.style.removeProperty("--header-h");
      root.style.marginTop = "";
      root.style.height = "";
    };
  }, []);

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
