/**
 * Interest slug/name normalization. Used for search and create.
 */

const MAX_NAME_LENGTH = 50;

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
