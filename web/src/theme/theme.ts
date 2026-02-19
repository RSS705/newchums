import { createTheme, type PaletteMode, type ThemeOptions } from "@mui/material/styles";

// Shadow scale from template reference (soft, modern elevation)
const shadows: ThemeOptions["shadows"] = [
  "none",
  "0px 2px 3px rgba(0,0,0,0.10)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 2px 2px -2px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 3px 4px -2px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 3px 4px -2px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 4px 6px -2px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 4px 6px -2px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 4px 8px -2px rgba(0,0,0,0.25)",
  "0 9px 17.5px rgb(0,0,0,0.05)",
  "rgb(145 158 171 / 30%) 0px 0px 2px 0px, rgb(145 158 171 / 12%) 0px 12px 24px -4px",
  "0px 6px 12px rgba(127, 145, 156, 0.12)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 6px 16px -4px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 7px 16px -4px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 8px 18px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 9px 18px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 10px 20px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 11px 20px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 12px 22px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 13px 22px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 14px 24px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 16px 28px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 18px 30px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 20px 32px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 22px 34px -8px rgba(0,0,0,0.25)",
  "0 0 1px 0 rgba(0,0,0,0.31), 0 24px 36px -8px rgba(0,0,0,0.25)",
];

// Template palette (DefaultColors.tsx)
const paletteByMode: Record<PaletteMode, ThemeOptions["palette"]> = {
  light: {
    mode: "light",
    primary: {
      main: "#5D87FF",
      light: "#ECF2FF",
      dark: "#4570EA",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#49BEFF",
      light: "#E8F7FF",
      dark: "#23afdb",
      contrastText: "#ffffff",
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
      default: "#F2F6FA",
      paper: "#FFFFFF",
    },
    grey: {
      100: "#F2F6FA",
      200: "#EAEFF4",
      300: "#DFE5EF",
      400: "#7C8FAC",
      500: "#5A6A85",
      600: "#2A3547",
    },
    text: {
      primary: "#2A3547",
      secondary: "#7C8FAC",
    },
    divider: "#e5eaef",
  },
  dark: {
    mode: "dark",
    primary: {
      main: "#5D87FF",
      light: "#ECF2FF",
      dark: "#4570EA",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#777e89",
      light: "#1C455D",
      dark: "#173f98",
      contrastText: "#ffffff",
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
    divider: "#333F55",
  },
};

export function getDesignTokens(mode: PaletteMode): ThemeOptions {
  return {
    palette: paletteByMode[mode],
    spacing: 8,
    shadows,
    shape: {
      borderRadius: 7,
    },
    typography: {
      fontFamily: "var(--font-plus-jakarta), system-ui, -apple-system, sans-serif",
      h1: { fontWeight: 600, fontSize: "2.25rem", lineHeight: "2.75rem", letterSpacing: "-0.02em" },
      h2: { fontWeight: 600, fontSize: "1.875rem", lineHeight: "2.25rem", letterSpacing: "-0.02em" },
      h3: { fontWeight: 600, fontSize: "1.5rem", lineHeight: "1.75rem", letterSpacing: "-0.02em" },
      h4: { fontWeight: 600, fontSize: "1.3125rem", lineHeight: "1.6rem", letterSpacing: "-0.01em" },
      h5: { fontWeight: 600, fontSize: "1.125rem", lineHeight: "1.6rem" },
      h6: { fontWeight: 600, fontSize: "1rem", lineHeight: "1.2rem" },
      body1: { fontSize: "0.875rem", fontWeight: 400, lineHeight: "1.334rem" },
      body2: { fontSize: "0.75rem", fontWeight: 400, lineHeight: "1rem" },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "*": { boxSizing: "border-box" },
          html: { height: "100%", width: "100%" },
          body: { height: "100%", margin: 0, padding: 0 },
          a: { textDecoration: "none" },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
          variant: "contained",
        },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.shape.borderRadius,
            boxShadow: "none",
            textTransform: "none",
            fontWeight: 600,
          }),
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            "&:hover": {
              backgroundColor: theme.palette.primary.light,
              color: theme.palette.primary.main,
            },
          }),
        },
      },
      MuiCard: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: theme.shape.borderRadius,
            backgroundImage: "none",
            boxShadow: "rgb(145 158 171 / 30%) 0px 0px 2px 0px, rgb(145 158 171 / 12%) 0px 12px 24px -4px",
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
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: theme.palette.grey[300] ?? theme.palette.divider,
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline, &:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: theme.palette.primary.main,
            },
          }),
          input: {
            padding: "12px 14px",
          },
          inputSizeSmall: {
            padding: "8px 14px",
          },
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
      MuiDivider: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderColor: theme.palette.divider,
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            fontSize: "0.75rem",
          },
        },
      },
    },
  };
}

export const theme = createTheme(getDesignTokens("light"));
