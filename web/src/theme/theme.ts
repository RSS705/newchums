import { createTheme } from "@mui/material/styles";
import { tokens } from "./tokens";

export const theme = createTheme({
  palette: tokens.palette,

  typography: {
    fontFamily: '"Roboto","Helvetica","Arial",sans-serif',
    h1: { fontSize: "2.5rem", fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: "2rem", fontWeight: 700, lineHeight: 1.25 },
    h3: { fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.3 },
    h4: { fontSize: "1.75rem", fontWeight: 700, lineHeight: 1.3 },
    h5: { fontSize: "1.35rem", fontWeight: 700, lineHeight: 1.35 },
    button: { textTransform: "none", fontWeight: 700, letterSpacing: "0.01em" },
  },

  shape: {
    borderRadius: tokens.shape.borderRadius,
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          height: "100%",
        },
        body: {
          minHeight: "100%",
          backgroundColor: tokens.palette.background.default,
        },
      },
    },

    MuiButton: {
      defaultProps: {
        disableElevation: true,
        size: "medium",
      },
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: tokens.shape.borderRadius,
          paddingInline: 18,
          paddingBlock: 10,
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: tokens.shape.panelRadius,
          boxShadow: tokens.shadows.subtle,
          backgroundImage: "none",
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: tokens.shape.panelRadius,
          border: `1px solid ${tokens.palette.divider}`,
          boxShadow: tokens.shadows.subtle,
        },
      },
    },

    MuiTextField: {
      defaultProps: {
        variant: "outlined",
        size: "medium",
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: tokens.shape.borderRadius,
          backgroundColor: tokens.palette.background.paper,
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: tokens.shape.panelRadius,
          padding: 8,
        },
      },
    },

    MuiDialogContent: {
      styleOverrides: {
        root: {
          paddingTop: 8,
        },
      },
    },

    MuiSnackbar: {
      defaultProps: {
        anchorOrigin: { vertical: "bottom", horizontal: "center" },
      },
    },

    MuiAlert: {
      defaultProps: {
        variant: "filled",
      },
      styleOverrides: {
        root: {
          borderRadius: tokens.shape.borderRadius,
          alignItems: "center",
        },
      },
    },
  },
});
