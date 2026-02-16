export const tokens = {
  palette: {
    primary: {
      main: "#FF6B35",
      light: "#FF8F66",
      dark: "#E55A2B",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#2EC4B6",
      light: "#5DD4C8",
      dark: "#25A99D",
      contrastText: "#FFFFFF",
    },
    error: { main: "#E63946" },
    warning: { main: "#F4A261" },
    info: { main: "#277DA1" },
    success: { main: "#2A9D8F" },
    background: {
      default: "#F6F7F9",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1A1A2E",
      secondary: "#4A4A68",
    },
    divider: "#E3E6EB",
  },
  shape: {
    borderRadius: 14,
    panelRadius: 18,
  },
  shadows: {
    subtle: "0 8px 24px rgba(21, 31, 54, 0.06)",
  },
  layout: {
    appBarHeight: 64,
    appBarHeightMobile: 56,
    drawerWidth: 248,
    contentMaxWidth: "lg" as const,
  },
  spacing: {
    section: 3,
    cardPadding: 3,
  },
} as const;

