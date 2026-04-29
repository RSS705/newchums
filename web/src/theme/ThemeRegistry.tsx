"use client";

import * as React from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { theme } from "./index";
import ToastProvider from "@/components/ui/toast/ToastProvider";
import ScrollToTopOnRouteChange from "@/components/layout/ScrollToTopOnRouteChange";

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ enableCssLayer: true }}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider
          dateAdapter={AdapterDayjs}
          dateFormats={{ hours12h: "h", fullTime12h: "h:mm A", keyboardDateTime12h: "L h:mm A" }}
        >
          <CssBaseline />
          {/* Suspense is required because ScrollToTopOnRouteChange uses
              `useSearchParams`, which Next.js needs to render inside a
              boundary so the surrounding tree can be statically rendered
              up to that point. The component itself returns null, so
              there's no fallback UI to show. */}
          <React.Suspense fallback={null}>
            <ScrollToTopOnRouteChange />
          </React.Suspense>
          <div id="app-scroll-root">
            <ToastProvider>{children}</ToastProvider>
          </div>
        </LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
