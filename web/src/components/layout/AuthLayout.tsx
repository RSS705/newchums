import Box from "@mui/material/Box";
import type { ReactNode } from "react";

/**
 * Shared auth layout: full-height content, no header bar.
 * Used by login, signup, forgot-password, reset-password.
 *
 * The inline <style> zeroes the global #app-scroll-root header offset
 * (globals.css sets margin-top: var(--header-h) on every route). It runs in
 * the SSR HTML so the override is in place on first paint — doing this in a
 * useEffect produced a visible grey flash at the top of auth pages on cold
 * loads (direct nav, email-link redirects).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        #app-scroll-root {
          --header-h: 0px !important;
          margin-top: 0 !important;
          height: 100% !important;
        }
      `}</style>
      <Box
        sx={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </Box>
    </>
  );
}
