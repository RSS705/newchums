/**
 * Centralized location formatting for emails + other outbound contexts.
 *
 * The plan-detail page applies a layered privacy contract on location
 * fields: `location_visibility` (`exact_everyone` | `exact_joined_only` |
 * `approximate_only`) combined with the viewer's role on the plan. Before
 * this file existed, every email call site reconstructed that logic
 * ad-hoc, usually as `location_type === "online" ? (online_link || "Online")
 * : [location_name, location_address].filter(Boolean).join(", ")`, which
 * leaked the full street address to every recipient regardless of the
 * plan's visibility setting. The helper below moves that decision to one
 * place so emails never learn more than the plan page would allow.
 *
 * Contract (mirrors the plan page):
 *   role=host        -> exact always (host owns the plan)
 *   role=joined      -> exact when visibility is exact_everyone OR
 *                       exact_joined_only; approximate when approximate_only
 *   role=not_joined  -> exact when visibility is exact_everyone;
 *                       approximate when exact_joined_only OR
 *                       approximate_only
 *   role=declined    -> approximate ALWAYS, regardless of visibility
 *                       (a declined requester must not learn the exact
 *                       address via email)
 *
 * Online plans:
 *   role=host or joined -> include online_link
 *   role=not_joined or declined -> "Online" only (never the link)
 */

export type EmailLocationRole =
  /** Plan owner. Always sees everything. */
  | "host"
  /** Attending the plan (going / maybe / approved-and-RSVPd). */
  | "joined"
  /** Invited but not yet RSVPd, or otherwise not attending. */
  | "not_joined"
  /** Join request was declined, or attendee was removed. */
  | "declined";

export type EmailLocationInput = {
  location_type: string | null;
  location_visibility: string | null;
  location_name: string | null;
  location_address: string | null;
  /** Pre-derived approximate label (city / area). When null we fall back
   *  to deriveApproxArea(location_address). */
  location_area: string | null;
  online_link: string | null;
};

/**
 * Combine a venue/place name and a postal address into a single display
 * string without duplicating overlapping segments. Three overlap shapes
 * are handled:
 *
 *  1. Exact equality. `name === address` returns the value once.
 *  2. Address starts with the name (e.g. plain street pick where Google
 *     returned just the street as `name`, "123 Main St", and the
 *     formatted address as "123 Main St, City, State"): we return the
 *     address since it already includes the name.
 *  3. Name ends with the address (e.g. the Add/Edit Plan forms store the
 *     autocomplete input's combined display string in `location_name` -
 *     "Gamers Emporium, 1634 Hyde Park Rd, London, ON N6H 0L5, Canada" -
 *     while `location_address` holds just the formatted address; without
 *     this branch the previous join produced
 *     "Gamers Emporium, 1634 Hyde Park Rd, ..., 1634 Hyde Park Rd, ..."):
 *     we return the name as the already-complete presentation.
 *
 * Both inputs are nullable. Callers decide what to do with the empty-string
 * result; this helper is intentionally agnostic about fallback labels like
 * "TBD" so it can be used from email and UI formatters that render empty
 * locations differently.
 */
export function joinNameAndAddress(
  name: string | null | undefined,
  address: string | null | undefined,
): string {
  const n = (name ?? "").trim();
  const a = (address ?? "").trim();
  if (!n && !a) return "";
  if (!a) return n;
  if (!n) return a;
  if (a === n) return a;
  if (a.startsWith(n + ", ") || a.startsWith(n + " ")) return a;
  if (n.endsWith(", " + a) || n.endsWith(" " + a)) return n;
  return `${n}, ${a}`;
}

/**
 * Strip street-level detail out of a full postal address and return the
 * "city, region" suffix. Kept in sync with the plan detail page's
 * approximate-area derivation. Pre-existing logic previously lived in
 * `api/src/index.ts`; moved here so both the API and the email helper
 * share one implementation.
 */
export function deriveApproxArea(address: string | null): string | null {
  if (!address) return null;
  const skipCountry = new Set([
    "canada",
    "united states",
    "usa",
    "united kingdom",
    "uk",
    "australia",
    "new zealand",
  ]);
  const stripped = address
    .replace(/\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/g, "") // Canadian postal codes
    .replace(/\b\d{5}(-\d{4})?\b/g, ""); // US zip codes
  const parts = stripped
    .split(",")
    .map((s) => s.trim())
    .filter((p) => p && !skipCountry.has(p.toLowerCase()));
  if (parts.length === 0) return null;
  // Skip first segment (street address); everything else is area/city/province.
  const areaParts = parts.length > 1 ? parts.slice(1) : parts;
  return areaParts.filter(Boolean).join(", ") || null;
}

/** Normalize an unknown visibility string to one of the three canonical
 *  values. Unrecognized or null values default to `exact_everyone` to
 *  match what the create/edit endpoints actually store when a caller
 *  omits the field. */
function normalizeVisibility(
  v: string | null | undefined,
): "exact_everyone" | "exact_joined_only" | "approximate_only" {
  if (v === "exact_joined_only") return "exact_joined_only";
  if (v === "approximate_only") return "approximate_only";
  return "exact_everyone";
}

/**
 * Build a display-ready location string suitable for an email body,
 * respecting the plan's visibility setting and the recipient's role.
 *
 * Returns an empty string only when the plan has no usable location data
 * at all (e.g. online plan with no online_link for a not-joined recipient
 * yields "Online"; an in-person plan with no fields yields ""). Callers
 * should pass the result through `hasContent(x) ? x : null` before it
 * reaches a Postmark TemplateModel so empty values use the standard
 * optional-block suppression pattern.
 */
export function buildEmailEventLocation(
  plan: EmailLocationInput,
  role: EmailLocationRole,
): string {
  const locationType = plan.location_type ?? "in_person";

  // Online plans: the online_link is the "exact" detail. Hosts and joined
  // attendees see it; not-joined invitees and declined users see only
  // that the plan is online.
  if (locationType === "online") {
    if ((role === "host" || role === "joined") && plan.online_link) {
      return plan.online_link;
    }
    return "Online";
  }

  const visibility = normalizeVisibility(plan.location_visibility);

  // Decide whether the recipient is allowed to see the exact address.
  const allowExact = (() => {
    if (role === "declined") return false;
    if (role === "host") return true;
    if (role === "joined") {
      return visibility !== "approximate_only";
    }
    // role === "not_joined"
    return visibility === "exact_everyone";
  })();

  if (allowExact) {
    return joinNameAndAddress(plan.location_name, plan.location_address);
  }

  const derivedArea = (plan.location_area || "").trim() || deriveApproxArea(plan.location_address) || "";
  return joinNameAndAddress(plan.location_name, derivedArea);
}
