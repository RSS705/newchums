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

/**
 * Effective category for an interest used as the unit of matching across the
 * system (digests, explore ranking, hobby chip highlighting, etc.).
 *
 *   - If the interest has a non-empty `category`, use that.
 *   - Otherwise fall back to the interest `name`.
 *
 * The result is trimmed and lower-cased so callers can compare with `===` or
 * `Set.has`. Two interests are considered to match when their effective
 * categories are equal.
 *
 * Examples:
 *   { name: "MTG Draft",     category: "MTG"  } → "mtg"
 *   { name: "MTG Commander", category: "MTG"  } → "mtg"
 *   { name: "Dog walking",   category: null   } → "dog walking"
 *   { name: "Pottery",       category: ""     } → "pottery"
 *
 * Must stay in sync with the SQL expression used in the API:
 *   LOWER(COALESCE(NULLIF(TRIM(<alias>.category), ''), <alias>.name))
 */
export function effectiveCategoryOf(interest: {
  name: string;
  category?: string | null;
}): string {
  const cat = (interest.category ?? "").trim();
  const source = cat !== "" ? cat : (interest.name ?? "");
  return source.trim().toLowerCase();
}

/**
 * Build a Set of effective categories from a list of interests. Useful for
 * passing the viewer's hobby fingerprint into components that need to highlight
 * matching hobbies.
 */
export function effectiveCategorySet(
  interests: ReadonlyArray<{ name: string; category?: string | null }>,
): Set<string> {
  const out = new Set<string>();
  for (const i of interests) {
    const ec = effectiveCategoryOf(i);
    if (ec) out.add(ec);
  }
  return out;
}
