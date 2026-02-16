import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
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
    success: { main: "#2A9D8F" },
    background: {
      default: "#FAFAFA",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1A1A2E",
      secondary: "#4A4A68",
    },
    divider: "#E8E8E8",
  },

  typography: {
    fontFamily: '"Roboto","Helvetica","Arial",sans-serif',
    h1: { fontSize: "2.5rem", fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: "2rem", fontWeight: 700, lineHeight: 1.25 },
    h3: { fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.3 },
    button: { textTransform: "none", fontWeight: 700 },
  },

  shape: {
    borderRadius: 14, // friendly, modern
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#FAFAFA",
        },
      },
    },

    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingLeft: 16,
          paddingRight: 16,
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          border: "1px solid #E8E8E8",
        },
      },
    },

    MuiTextField: {
      defaultProps: {
        variant: "outlined",
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          backgroundColor: "#FFFFFF",
        },
      },
    },
  },
});
