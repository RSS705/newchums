/**
 * Travel radius options (km). Shared between Profile, Explore, and
 * Communities discovery filters. The server treats radius_km >= 20000 as
 * "no distance filter", so "Anywhere" uses 20000 (anything that far away is
 * effectively half-the-globe; the server short-circuits). Previously the
 * "Anywhere" label was mapped to 200, which silently clipped discovery to
 * a 200 km radius; that was a bug.
 */

export const ANYWHERE_RADIUS_KM = 20000;

export const TRAVEL_RADIUS_OPTIONS = [
  { value: 1, label: "Within 1 km" },
  { value: 2, label: "Within 2 km" },
  { value: 5, label: "Within 5 km" },
  { value: 10, label: "Within 10 km" },
  { value: 25, label: "Within 25 km" },
  { value: 50, label: "Within 50 km" },
  { value: 100, label: "Within 100 km" },
  { value: 200, label: "Within 200 km" },
  { value: ANYWHERE_RADIUS_KM, label: "Anywhere" },
] as const;

export type TravelRadiusKm = (typeof TRAVEL_RADIUS_OPTIONS)[number]["value"];
