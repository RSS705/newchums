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
        root: ({ ownerState }) => {
          const base = {
            borderRadius: theme.shape.borderRadius,
            boxShadow: "none",
            textTransform: "none",
            fontWeight: 600,
            minHeight: 44,
          };
          if (ownerState.color === "onPrimary" && ownerState.variant === "contained") {
            return {
              ...base,
              backgroundColor: theme.palette.onPrimary.main,
              color: theme.palette.onPrimary.contrastText,
              "&:hover": {
                backgroundColor: theme.palette.onPrimary.dark,
                color: theme.palette.onPrimary.contrastText,
              },
            };
          }
          return base;
        },
        containedPrimary: {
          color: theme.palette.common.white,
          fontWeight: 600,
          textTransform: "none",
          "&:hover": {
            backgroundColor: theme.palette.primary.dark,
            color: theme.palette.common.white,
          },
          "&.Mui-disabled": {
            color: theme.palette.common.white,
            opacity: 0.6,
          },
        },
        containedSecondary: {
          color: theme.palette.common.white,
          fontWeight: 600,
          textTransform: "none",
          "&:hover": {
            backgroundColor: theme.palette.secondary.dark,
            color: theme.palette.common.white,
          },
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
            backgroundColor: `${theme.palette.primary.main}18`,
            color: theme.palette.primary.dark,
          },
        },
        textSecondary: {
          backgroundColor: theme.palette.secondary.light,
          "&:hover": {
            backgroundColor: `${theme.palette.secondary.main}18`,
            color: theme.palette.secondary.dark,
          },
        },
        outlinedPrimary: {
          color: theme.palette.primary.main,
          borderColor: theme.palette.primary.main,
          "&:hover": {
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.common.white,
            borderColor: theme.palette.primary.main,
          },
        },
        /* Social/ghost outlined buttons: keep text visible on hover (no fill) */
        outlinedInherit: {
          "&:hover": {
            backgroundColor: theme.palette.action.hover,
            color: theme.palette.text.primary,
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
          minWidth: 44,
          minHeight: 44,
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
          borderRadius: Number(theme.shape.borderRadius) + 2,
          backgroundImage: "none",
          boxShadow:
            "0px 1px 3px rgba(0,0,0,0.04), 0px 4px 12px rgba(0,0,0,0.04)",
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          padding: "14px 16px",
          [`@media (min-width:${theme.breakpoints.values.sm}px)`]: {
            padding: "16px 24px",
          },
        },
        title: {
          fontSize: "1.125rem",
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: "20px 16px",
          "&:last-child": {
            paddingBottom: "20px",
          },
          [`@media (min-width:${theme.breakpoints.values.sm}px)`]: {
            padding: "24px 28px",
            "&:last-child": {
              paddingBottom: "28px",
            },
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
          [`@media (max-width:${theme.breakpoints.values.sm - 1}px)`]: {
            borderRadius: 0,
            margin: 0,
            width: "100%",
            maxWidth: "100%",
            height: "100dvh",
            maxHeight: "100dvh",
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          padding: theme.spacing(2.5, 2, 1),
          fontWeight: 700,
          fontSize: "1.25rem",
          [`@media (min-width:${theme.breakpoints.values.sm}px)`]: {
            padding: theme.spacing(3, 3, 1.5),
          },
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: theme.spacing(1.5, 2),
          [`@media (min-width:${theme.breakpoints.values.sm}px)`]: {
            padding: theme.spacing(1.5, 3),
          },
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: theme.spacing(1.5, 2, 2),
          gap: theme.spacing(1),
          [`@media (min-width:${theme.breakpoints.values.sm}px)`]: {
            padding: theme.spacing(1.5, 3, 3),
          },
        },
      },
    },
    MuiSnackbar: {
      defaultProps: {
        anchorOrigin: { vertical: "bottom", horizontal: "right" },
      },
      styleOverrides: {
        root: {
          [`@media (max-width:${theme.breakpoints.values.sm - 1}px)`]: {
            left: "50%",
            right: "auto",
            transform: "translateX(-50%)",
          },
        },
      },
    },
    MuiSkeleton: {
      defaultProps: {
        animation: "wave",
      },
      styleOverrides: {
        root: {
          borderRadius: theme.shape.borderRadius,
          backgroundColor: theme.palette.grey[200],
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          fontSize: "0.75rem",
          borderRadius: "999px",
        },
        sizeSmall: {
          height: 32,
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
      defaultProps: {
        // Touch users tap a help icon expecting to read the tooltip — MUI's
        // 1500ms default closes it almost immediately on mobile. Hold it
        // visible for 8s after the tap so the copy is actually readable.
        // (Per-instance enterTouchDelay/leaveTouchDelay still override this.)
        leaveTouchDelay: 8000,
        enterTouchDelay: 0,
      },
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
            "0px 2px 8px rgba(0,0,0,0.08), 0px 8px 24px rgba(0,0,0,0.06)",
          borderRadius: Number(theme.shape.borderRadius) + 2,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: Number(theme.shape.borderRadius),
          transition: "background-color 0.15s ease, color 0.15s ease",
          "&.Mui-selected": {
            backgroundColor: `${theme.palette.primary.main}0F`,
            color: theme.palette.primary.dark,
            "&:hover": {
              backgroundColor: `${theme.palette.primary.main}1A`,
            },
            "& .MuiListItemIcon-root": {
              color: theme.palette.primary.main,
            },
          },
          "&:hover": {
            backgroundColor: theme.palette.action.hover,
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          fontSize: "0.8125rem",
          minHeight: 40,
          minWidth: 0,
          paddingLeft: 12,
          paddingRight: 12,
          [`@media (min-width:${theme.breakpoints.values.sm}px)`]: {
            fontSize: "0.9375rem",
            minHeight: 44,
            paddingLeft: 16,
            paddingRight: 16,
          },
        },
      },
    },
  };
}
