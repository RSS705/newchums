import type { PaletteMode, PaletteOptions } from "@mui/material/styles";

/**
 * Base palette tokens for NewChums brand.
 * Cobalt blue primary, gold secondary accent.
 */
export function getPalette(mode: PaletteMode): PaletteOptions {
  const light = {
    mode: "light" as const,
    primary: {
      main: "#2563EB",
      light: "#DBEAFE",
      dark: "#1D4ED8",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#F4B400",
      light: "#FEF3C7",
      dark: "#D97706",
      contrastText: "#111827",
    },
    success: {
      main: "#13DEB9",
      light: "#E6FFFA",
      dark: "#02b3a9",
      contrastText: "#ffffff",
    },
    info: {
      main: "#539BFF",
      light: "#EBF3FE",
      dark: "#1682d4",
      contrastText: "#ffffff",
    },
    error: {
      main: "#FA896B",
      light: "#FDEDE8",
      dark: "#f3704d",
      contrastText: "#ffffff",
    },
    warning: {
      main: "#FFAE1F",
      light: "#FEF5E5",
      dark: "#ae8e59",
      contrastText: "#ffffff",
    },
    background: {
      default: "#F9FAFB",
      paper: "#FFFFFF",
    },
    grey: {
      100: "#F9FAFB",
      200: "#E5E7EB",
      300: "#D1D5DB",
      400: "#9CA3AF",
      500: "#6B7280",
      600: "#4B5563",
    },
    text: {
      primary: "#1F2937",
      secondary: "#4B5563",
    },
    action: {
      disabledBackground: "rgba(17,24,39,0.12)",
      hoverOpacity: 0.02,
      hover: "#F3F4F6",
    },
    divider: "#E5E7EB",
  };

  const dark = {
    mode: "dark" as const,
    primary: {
      main: "#2563EB",
      light: "#1E3A8A",
      dark: "#1D4ED8",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#F4B400",
      light: "#422006",
      dark: "#D97706",
      contrastText: "#111827",
    },
    success: {
      main: "#13DEB9",
      light: "#1B3C48",
      dark: "#02b3a9",
      contrastText: "#ffffff",
    },
    info: {
      main: "#539BFF",
      light: "#223662",
      dark: "#1682d4",
      contrastText: "#ffffff",
    },
    error: {
      main: "#FA896B",
      light: "#4B313D",
      dark: "#f3704d",
      contrastText: "#ffffff",
    },
    warning: {
      main: "#FFAE1F",
      light: "#4D3A2A",
      dark: "#ae8e59",
      contrastText: "#ffffff",
    },
    background: {
      default: "#171c23",
      paper: "#171c23",
    },
    grey: {
      100: "#333F55",
      200: "#465670",
      300: "#7C8FAC",
      400: "#DFE5EF",
      500: "#EAEFF4",
      600: "#F2F6FA",
    },
    text: {
      primary: "#EAEFF4",
      secondary: "#7C8FAC",
    },
    action: {
      disabledBackground: "rgba(73,82,88,0.12)",
      hoverOpacity: 0.02,
      hover: "#333F55",
    },
    divider: "#374151",
  };

  return mode === "dark" ? dark : light;
}
