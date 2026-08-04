/**
 * Curated palette for public profile card themes.
 *
 * Saturated in Aug 2026: the previous values were near-white washes (most
 * sat 90%+ but lightness ~97%), so a chosen theme barely read as a colour.
 * These sit around the Tailwind-200 level: genuinely coloured, still light
 * enough that the profile header's text clears WCAG AA comfortably. Every
 * value is verified against both text colours that render on the card,
 * text.primary #1F2937 (worst case 9.5:1) and the darkened muted grey
 * #374151 that PublicProfileView applies inside a themed card (worst case
 * 6.7:1). If you add or change a colour, check BOTH; the muted grey is the
 * binding constraint, and it is why these cannot go darker without also
 * changing the text.
 *
 * `default` matches the standard card background (#FFFFFF) and leaves the
 * card's normal text colours alone.
 *
 * This file is the single source of truth for allowed values, display labels,
 * and resolved colors, shared across the API worker type-hints and the web app.
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
  blush:     { label: "Blush",     color: "#FBCFE8" },
  peach:     { label: "Peach",     color: "#FED7AA" },
  honey:     { label: "Honey",     color: "#FDE68A" },
  warm_sand: { label: "Warm sand", color: "#F2DFC0" },
  stone:     { label: "Stone",     color: "#E3DAC9" },
  sage:      { label: "Sage",      color: "#BBF7D0" },
  forest:    { label: "Forest",    color: "#A7F3D0" },
  sky:       { label: "Sky",       color: "#BAE6FD" },
  ocean:     { label: "Ocean",     color: "#A5F3FC" },
  soft_blue: { label: "Soft blue", color: "#BFDBFE" },
  slate:     { label: "Slate",     color: "#CFDBEA" },
  steel:     { label: "Steel",     color: "#C3D2E3" },
  lavender:  { label: "Lavender",  color: "#DDD6FE" },
  dusk:      { label: "Dusk",      color: "#F5D0FE" },
  graphite:  { label: "Graphite",  color: "#D5D8DF" },
};

/** Muted text colour to use INSIDE a themed profile card. The app-wide
 *  text.secondary (#6B7280) only clears 4.5:1 on near-white, which is what
 *  kept this palette washed out; on these accents it lands at 3.1-4.0:1.
 *  Darkening just this one card keeps the colours and the contrast. */
export const PROFILE_THEMED_MUTED_TEXT = "#374151";

/** True when a stored theme key resolves to something other than the plain
 *  white card, i.e. when the themed-card text rules apply. */
export function isThemedProfile(theme: string | null | undefined): boolean {
  return !!theme && theme in PROFILE_THEMES && theme !== "default";
}

/** Resolve a stored theme key (including null/undefined/unknown) to a CSS color string. */
export function getProfileCardBg(theme: string | null | undefined): string {
  if (!theme || !(theme in PROFILE_THEMES)) {
    return PROFILE_THEMES.default.color;
  }
  return PROFILE_THEMES[theme as ProfileThemeKey].color;
}
