import type { ThemeOptions } from "@mui/material/styles";

/**
 * Typography scale matching template Typography.tsx.
 * Uses CSS variable for font (set by layout).
 */
export const typography: ThemeOptions["typography"] = {
  fontFamily: "var(--font-gabarito), system-ui, -apple-system, sans-serif",
  h1: {
    fontFamily: "var(--font-honk), sans-serif",
    fontWeight: 400,
    fontSize: "4rem",
    lineHeight: 1.15,
    letterSpacing: "-0.02em",
  },
  h2: {
    fontWeight: 600,
    fontSize: "1.875rem",
    lineHeight: "2.25rem",
    letterSpacing: "-0.02em",
  },
  h3: {
    fontWeight: 600,
    fontSize: "1.5rem",
    lineHeight: "1.75rem",
    letterSpacing: "-0.02em",
  },
  h4: {
    fontWeight: 600,
    fontSize: "1.3125rem",
    lineHeight: "1.6rem",
    letterSpacing: "-0.01em",
  },
  h5: {
    fontWeight: 600,
    fontSize: "1.125rem",
    lineHeight: "1.6rem",
  },
  h6: {
    fontWeight: 600,
    fontSize: "1rem",
    lineHeight: "1.2rem",
  },
  body1: {
    fontSize: "1.15rem",
    fontWeight: 400,
    lineHeight: 1.5,
  },
  body2: {
    fontSize: "1rem",
    letterSpacing: "0rem",
    fontWeight: 400,
    lineHeight: "1.65rem",
  },
  button: {
    fontSize: "1rem",
    textTransform: "capitalize",
    fontWeight: 600,
  },
  subtitle1: {
    fontSize: "0.9375rem",
    fontWeight: 400,
    lineHeight: 1.5,
  },
  subtitle2: {
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: 1.5,
  },
};
