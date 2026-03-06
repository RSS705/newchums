/**
 * Curated palette for public profile card themes.
 * Colors are subtle light tints chosen to preserve strong text contrast
 * and complement the NewChums cobalt-blue/gold brand palette.
 *
 * `default` matches the standard card background (#FFFFFF).
 * All other values are gentle tints with 18:1+ contrast against #111827.
 *
 * This file is the single source of truth for allowed values, display labels,
 * and resolved colors — shared across the API worker type-hints and the web app.
 */

export type ProfileThemeKey =
  | "default"
  | "blush"
  | "peach"
  | "honey"
  | "warm_sand"
  | "stone"
  | "sage"
  | "forest"
  | "sky"
  | "ocean"
  | "soft_blue"
  | "slate"
  | "steel"
  | "lavender"
  | "dusk"
  | "graphite";

/**
 * Keys ordered along the color wheel, warm → cool, with `default` first.
 * This order is used directly by the swatch picker UI.
 *
 * Warm/feminine lean: blush, peach, honey, warm_sand
 * Neutral warm:       stone
 * Greens:             sage, forest
 * Cyans/blues:        sky, ocean, soft_blue, slate, steel
 * Purples:            lavender, dusk
 * Greys:              graphite
 */
export const PROFILE_THEME_KEYS: readonly ProfileThemeKey[] = [
  "default",
  // warm / pink-orange-yellow
  "blush",
  "peach",
  "honey",
  "warm_sand",
  // earthy neutrals
  "stone",
  // greens
  "sage",
  "forest",
  // cyans + blues
  "sky",
  "ocean",
  "soft_blue",
  "slate",
  "steel",
  // purples
  "lavender",
  "dusk",
  // greys
  "graphite",
] as const;

export const PROFILE_THEMES: Record<
  ProfileThemeKey,
  { label: string; color: string }
> = {
  default:   { label: "Default",   color: "#FFFFFF" },
  blush:     { label: "Blush",     color: "#FFF0F2" },
  peach:     { label: "Peach",     color: "#FFF4ED" },
  honey:     { label: "Honey",     color: "#FFFBEB" },
  warm_sand: { label: "Warm sand", color: "#FFF8F0" },
  stone:     { label: "Stone",     color: "#F2EFE9" },
  sage:      { label: "Sage",      color: "#F0FDF4" },
  forest:    { label: "Forest",    color: "#E8F5EC" },
  sky:       { label: "Sky",       color: "#ECFEFF" },
  ocean:     { label: "Ocean",     color: "#E3F2FD" },
  soft_blue: { label: "Soft blue", color: "#EFF6FF" },
  slate:     { label: "Slate",     color: "#F8FAFF" },
  steel:     { label: "Steel",     color: "#EBF0F6" },
  lavender:  { label: "Lavender",  color: "#F5F3FF" },
  dusk:      { label: "Dusk",      color: "#FDF4FF" },
  graphite:  { label: "Graphite",  color: "#EEEEF2" },
};

/** Resolve a stored theme key (including null/undefined/unknown) to a CSS color string. */
export function getProfileCardBg(theme: string | null | undefined): string {
  if (!theme || !(theme in PROFILE_THEMES)) {
    return PROFILE_THEMES.default.color;
  }
  return PROFILE_THEMES[theme as ProfileThemeKey].color;
}
