import type { Theme } from "@mui/material/styles";

/**
 * MUI component overrides matching template Components.tsx.
 * Receives theme so overrides can use palette, spacing, etc.
 */
export function getComponents(theme: Theme): Theme["components"] {
  return {
    MuiCssBaseline: {
      styleOverrides: {
        "*": { boxSizing: "border-box" },
        html: { height: "100%", width: "100%" },
        body: { height: "100%", margin: 0, padding: 0 },
        a: { textDecoration: "none" },
        "#root": { height: "100%" },
        hr: {
          height: 1,
          border: 0,
          borderTop: `1px solid ${theme.palette.divider}`,
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          "&:before": { backgroundColor: theme.palette.grey[100] },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiStepConnector: {
      styleOverrides: {
        line: { borderColor: theme.palette.divider },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: { boxShadow: "none" },
        sizeSmall: { width: 30, height: 30, minHeight: 30 },
      },
    },
    MuiButtonGroup: {
      styleOverrides: {
        root: { boxShadow: "none" },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        variant: "contained",
      },
      styleOverrides: {
        root: {
          borderRadius: theme.shape.borderRadius,
          boxShadow: "none",
          textTransform: "none",
          fontWeight: 600,
        },
        text: {
          padding: "5px 15px",
          "&:hover": {
            backgroundColor: theme.palette.primary.light,
            color: theme.palette.primary.main,
          },
        },
        textPrimary: {
          backgroundColor: theme.palette.primary.light,
          "&:hover": {
            backgroundColor: theme.palette.primary.main,
            color: "white",
          },
        },
        textSecondary: {
          backgroundColor: theme.palette.secondary.light,
          "&:hover": {
            backgroundColor: theme.palette.secondary.main,
            color: "white",
          },
        },
        outlinedPrimary: {
          "&:hover": {
            backgroundColor: theme.palette.primary.main,
            color: "white",
          },
        },
        outlinedSecondary: {
          "&:hover": {
            backgroundColor: theme.palette.secondary.main,
            color: "white",
          },
        },
        outlinedError: {
          "&:hover": {
            backgroundColor: theme.palette.error.main,
            color: "white",
          },
        },
        outlinedSuccess: {
          "&:hover": {
            backgroundColor: theme.palette.success.main,
            color: "white",
          },
        },
        outlinedInfo: {
          "&:hover": {
            backgroundColor: theme.palette.info.main,
            color: "white",
          },
        },
        outlinedWarning: {
          "&:hover": {
            backgroundColor: theme.palette.warning.main,
            color: "white",
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: theme.palette.primary.light,
            color: theme.palette.primary.main,
          },
        },
        colorPrimary: {
          "&:hover": {
            backgroundColor: theme.palette.primary.main,
            color: "white",
          },
        },
        colorSecondary: {
          "&:hover": {
            backgroundColor: theme.palette.secondary.main,
            color: "white",
          },
        },
        colorSuccess: {
          "&:hover": {
            backgroundColor: theme.palette.success.main,
            color: "white",
          },
        },
        colorError: {
          "&:hover": {
            backgroundColor: theme.palette.error.main,
            color: "white",
          },
        },
        colorWarning: {
          "&:hover": {
            backgroundColor: theme.palette.warning.main,
            color: "white",
          },
        },
        colorInfo: {
          "&:hover": {
            backgroundColor: theme.palette.info.main,
            color: "white",
          },
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          width: "100%",
          borderRadius: theme.shape.borderRadius,
          backgroundImage: "none",
          boxShadow:
            "rgb(145 158 171 / 30%) 0px 0px 2px 0px, rgb(145 158 171 / 12%) 0px 12px 24px -4px",
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          padding: "16px 24px",
        },
        title: {
          fontSize: "1.125rem",
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: "24px",
          "&:last-child": {
            paddingBottom: "24px",
          },
        },
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
        root: {
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor:
              theme.palette.mode === "dark"
                ? theme.palette.grey[200]
                : (theme.palette.grey[300] ?? theme.palette.divider),
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline, &:hover .MuiOutlinedInput-notchedOutline":
            {
              borderColor: theme.palette.primary.main,
            },
        },
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
        root: {
          color: theme.palette.text.secondary,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: theme.palette.divider,
        },
      },
    },
    MuiAppBar: {
      defaultProps: {
        color: "transparent",
        elevation: 0,
      },
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${theme.palette.divider}`,
          backgroundImage: "none",
          backdropFilter: "blur(10px)",
        },
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
        paper: {
          borderRadius: Number(theme.shape.borderRadius) + 6,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          padding: theme.spacing(3, 3, 1.5),
          fontWeight: 700,
          fontSize: "1.25rem",
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: theme.spacing(1.5, 3),
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: theme.spacing(1.5, 3, 3),
          gap: theme.spacing(1),
        },
      },
    },
    MuiSnackbar: {
      defaultProps: {
        anchorOrigin: { vertical: "bottom", horizontal: "right" },
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
    MuiAlert: {
      styleOverrides: {
        filledSuccess: { color: "white" },
        filledInfo: { color: "white" },
        filledError: { color: "white" },
        filledWarning: { color: "white" },
        standardSuccess: {
          backgroundColor: theme.palette.success.light,
          color: theme.palette.success.main,
        },
        standardError: {
          backgroundColor: theme.palette.error.light,
          color: theme.palette.error.main,
        },
        standardWarning: {
          backgroundColor: theme.palette.warning.light,
          color: theme.palette.warning.main,
        },
        standardInfo: {
          backgroundColor: theme.palette.info.light,
          color: theme.palette.info.main,
        },
        outlinedSuccess: {
          borderColor: theme.palette.success.main,
          color: theme.palette.success.main,
        },
        outlinedWarning: {
          borderColor: theme.palette.warning.main,
          color: theme.palette.warning.main,
        },
        outlinedError: {
          borderColor: theme.palette.error.main,
          color: theme.palette.error.main,
        },
        outlinedInfo: {
          borderColor: theme.palette.info.main,
          color: theme.palette.info.main,
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": { padding: "4px 9px" },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          color: theme.palette.background.paper,
          background: theme.palette.text.primary,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderColor: theme.palette.divider,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${theme.palette.divider}`,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:last-child td": { borderBottom: 0 },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: theme.palette.grey[200],
          borderRadius: "6px",
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          boxShadow:
            "rgb(145 158 171 / 30%) 0px 0px 2px 0px, rgb(145 158 171 / 12%) 0px 12px 24px -4px",
        },
      },
    },
  };
}
