/**
 * Travel radius options (km). Shared between Profile and Explore filter.
 */

export const TRAVEL_RADIUS_OPTIONS = [
  { value: 1, label: "Within 1 km" },
  { value: 2, label: "Within 2 km" },
  { value: 5, label: "Within 5 km" },
  { value: 10, label: "Within 10 km" },
  { value: 25, label: "Within 25 km" },
  { value: 50, label: "Within 50 km" },
  { value: 100, label: "Within 100 km" },
  { value: 200, label: "Anywhere" },
] as const;

export type TravelRadiusKm = (typeof TRAVEL_RADIUS_OPTIONS)[number]["value"];
