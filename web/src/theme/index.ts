import { createTheme, type PaletteMode } from "@mui/material/styles";
import { getPalette } from "./palette";
import { typography } from "./typography";
import { shadows } from "./shadows";
import { getComponents } from "./components";

/**
 * Build the theme following template architecture.
 * Single entry point: palette, typography, shadows, and components are composed here.
 *
 * Template pattern:
 * - palette from DefaultColors
 * - typography from Typography.tsx
 * - shadows from Shadows.tsx
 * - components from Components.tsx (function receiving theme)
 */
export function buildTheme(mode: PaletteMode = "light") {
  const base = {
    palette: getPalette(mode),
    spacing: 8,
    shape: {
      borderRadius: 10,
    },
    typography,
    shadows,
  };

  const theme = createTheme(base);
  theme.components = getComponents(theme) as typeof theme.components;

  return theme;
}

export const theme = buildTheme("light");

// Re-export for consumers that need getDesignTokens compatibility
export { getPalette } from "./palette";
export { typography } from "./typography";
export { shadows } from "./shadows";
export { getComponents } from "./components";
