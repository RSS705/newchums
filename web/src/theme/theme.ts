import { createTheme, type PaletteMode, type ThemeOptions } from "@mui/material/styles";

const paletteByMode: Record<PaletteMode, ThemeOptions["palette"]> = {
  light: {
    mode: "light",
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
    success: { main: "#2A9D8F" },
    background: {
      default: "#F5F7FA",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1A1A2E",
      secondary: "#4A4A68",
    },
    divider: "#E4E8EF",
  },
  dark: {
    mode: "dark",
    primary: {
      main: "#FF8F66",
      light: "#FFB095",
      dark: "#E8744A",
      contrastText: "#1A1A2E",
    },
    secondary: {
      main: "#5DD4C8",
      light: "#82E0D6",
      dark: "#2DAA9D",
      contrastText: "#0C1E1B",
    },
    error: { main: "#FF6B7A" },
    warning: { main: "#FFC078" },
    success: { main: "#52C9BA" },
    background: {
      default: "#0F1420",
      paper: "#161E2D",
    },
    text: {
      primary: "#F4F6FB",
      secondary: "#AEB8CD",
    },
    divider: "#2B3448",
  },
};

export function getDesignTokens(mode: PaletteMode): ThemeOptions {
  return {
    palette: paletteByMode[mode],
    spacing: 8,
    shape: {
      borderRadius: 14,
    },
    typography: {
      fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
      h1: { fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" },
      h2: { fontWeight: 700, lineHeight: 1.24, letterSpacing: "-0.02em" },
      h3: { fontWeight: 700, lineHeight: 1.28, letterSpacing: "-0.02em" },
      h4: { fontWeight: 700, lineHeight: 1.32, letterSpacing: "-0.01em" },
      h5: { fontWeight: 700, lineHeight: 1.36 },
      h6: { fontWeight: 700, lineHeight: 1.4 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true,
          variant: "contained",
        },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 999,
            paddingInline: theme.spacing(2.5),
            paddingBlock: theme.spacing(1.1),
            fontWeight: 600,
          }),
        },
      },
      MuiCard: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: Number(theme.shape.borderRadius) + 4,
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: mode === "light" ? "0 8px 22px rgba(26, 26, 46, 0.06)" : "none",
          }),
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: ({ theme }) => ({
            padding: theme.spacing(3),
            "&:last-child": {
              paddingBottom: theme.spacing(3),
            },
          }),
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: "outlined",
          size: "medium",
          fullWidth: true,
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.shape.borderRadius,
            backgroundColor: theme.palette.background.paper,
          }),
          notchedOutline: ({ theme }) => ({
            borderColor: theme.palette.divider,
          }),
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: ({ theme }) => ({
            color: theme.palette.text.secondary,
          }),
        },
      },
      MuiAppBar: {
        defaultProps: {
          color: "transparent",
          elevation: 0,
        },
        styleOverrides: {
          root: ({ theme }) => ({
            borderBottom: `1px solid ${theme.palette.divider}`,
            backgroundImage: "none",
            backdropFilter: "blur(10px)",
          }),
        },
      },
      MuiContainer: {
        defaultProps: {
          maxWidth: "lg",
        },
      },
      MuiDialog: {
        defaultProps: {
          fullWidth: true,
          maxWidth: "sm",
        },
        styleOverrides: {
          paper: ({ theme }) => ({
            borderRadius: Number(theme.shape.borderRadius) + 6,
          }),
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: ({ theme }) => ({
            padding: theme.spacing(3, 3, 1.5),
            fontWeight: 700,
          }),
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: ({ theme }) => ({
            padding: theme.spacing(1.5, 3),
          }),
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: ({ theme }) => ({
            padding: theme.spacing(1.5, 3, 3),
            gap: theme.spacing(1),
          }),
        },
      },
      MuiSnackbar: {
        defaultProps: {
          anchorOrigin: { vertical: "bottom", horizontal: "right" },
        },
      },
    },
  };
}

export const theme = createTheme(getDesignTokens("light"));
