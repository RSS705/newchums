/**
 * Client-side interest slug/name normalization. Must match API logic.
 */

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

export function isDuplicate(a: { slug: string }, b: { slug: string }): boolean {
  return a.slug.toLowerCase() === b.slug.toLowerCase();
}
