/**
 * Interest slug/name normalization. Used for search and create.
 * Seed list: single source of truth for default suggestions (see web/sql/008_interests_seed.sql).
 */

const MAX_NAME_LENGTH = 50;

/** New generic seed list for suggestions. Kept in sync with migration 008. */
export const SEED_INTERESTS: ReadonlyArray<{ name: string }> = [
  // Arts & Crafts
  { name: "Drawing" },
  { name: "Painting" },
  { name: "Pottery" },
  { name: "Photography" },
  { name: "Knitting" },
  { name: "Crafts" },
  // Games & Social
  { name: "Board games" },
  { name: "Card games" },
  { name: "D&D" },
  { name: "Tabletop RPGs" },
  { name: "Chess" },
  { name: "Trivia" },
  // Food & Drink
  { name: "Coffee" },
  { name: "Cooking" },
  { name: "Baking" },
  { name: "Restaurants" },
  { name: "Wine tasting" },
  { name: "Breweries" },
  // Outdoors
  { name: "Walking" },
  { name: "Hiking" },
  { name: "Camping" },
  { name: "Cycling" },
  { name: "Fishing" },
  { name: "Picnics" },
  // Fitness / Sports
  { name: "Gym" },
  { name: "Yoga" },
  { name: "Running" },
  { name: "Swimming" },
  { name: "Tennis" },
  { name: "Pickleball" },
  { name: "Basketball" },
  { name: "Soccer" },
  // Learning / Culture
  { name: "Book club" },
  { name: "Language exchange" },
  { name: "Museums" },
  { name: "Live music" },
  { name: "Concerts" },
  { name: "Volunteering" },
  // Video games
  { name: "Video games" },
] as const;

/** Legacy seed slugs to remove when applying new seed list. Extend if more legacy slugs are found. */
export const OLD_SEED_SLUGS_TO_REMOVE: ReadonlyArray<string> = [
  "esports",
  "maker-diy",
  "d-and-d-one-shot",
  "board-games-casual",
  "tech-meetups",
];

export function nameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

export function validateInterestName(name: string): { valid: boolean; error?: string } {
  const t = name.trim();
  if (!t) return { valid: false, error: "Interest cannot be empty" };
  if (t.length > MAX_NAME_LENGTH) return { valid: false, error: `Max ${MAX_NAME_LENGTH} characters` };
  return { valid: true };
}
