import type { PaletteMode, PaletteOptions } from "@mui/material/styles";

/**
 * Base palette tokens for NewChums brand.
 * Cobalt blue primary, gold secondary accent.
 */
export function getPalette(mode: PaletteMode): PaletteOptions {
  const light = {
    mode: "light" as const,
    primary: {
      main: "#E65B13",
      light: "#FCE4D6",
      dark: "#C44D10",
      contrastText: "#ffffff",
    },
    /** Used for buttons/elements on primary (E65B13) background */
    onPrimary: {
      main: "#F7CE16",
      light: "#FAE066",
      dark: "#D4AD0F",
      contrastText: "#1F2937",
    },
    secondary: {
      main: "#68315A",
      light: "#E8DCE4",
      dark: "#4A2340",
      contrastText: "#ffffff",
    },
    success: {
      main: "#059669",
      light: "#ECFDF5",
      dark: "#047857",
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
      main: "#E65B13",
      light: "#8B380C",
      dark: "#C44D10",
      contrastText: "#ffffff",
    },
    onPrimary: {
      main: "#F7CE16",
      light: "#FAE066",
      dark: "#D4AD0F",
      contrastText: "#1F2937",
    },
    secondary: {
      main: "#68315A",
      light: "#3D2640",
      dark: "#8B4A7D",
      contrastText: "#ffffff",
    },
    success: {
      main: "#10B981",
      light: "#1B3C48",
      dark: "#059669",
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
