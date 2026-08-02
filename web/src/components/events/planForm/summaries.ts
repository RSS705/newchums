import { BANNER_PRESETS } from "@/lib/eventBanners";

/**
 * Collapsed-header summary lines for the two-tier plan form.
 *
 * One module, imported by both CreateEventClient and EditEventClient, so the
 * copy for "what is this section currently set to" cannot drift between the
 * Add and Edit forms (see AGENTS.md, Add Plan / Edit Plan Parity Rule).
 * Keep every string short enough to survive a single ellipsized line at
 * 390px wide.
 */

export function describeDescription(html: string): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "None yet";
  return text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text;
}

export function describeBanner(presetSlug: string | null, hasImage: boolean): string {
  if (presetSlug) {
    const preset = BANNER_PRESETS.find((p) => p.slug === presetSlug);
    return preset ? `Colour theme: ${preset.label}` : "Colour theme";
  }
  if (hasImage) return "Custom photo";
  return "None yet, we'll use a colour wash";
}

export function describeHobbies(hobbies: Array<{ name: string }>): string {
  if (hobbies.length === 0) return "None yet";
  const names = hobbies.map((h) => h.name);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")}, +${names.length - 2} more`;
}

export function describeAltTimes(mode: "off" | "suggest" | "availability"): string {
  if (mode === "availability") return "Requesting availability first";
  if (mode === "off") return "Off, the listed time is fixed";
  return "Attendees can suggest other times";
}

export function describeVisibility(
  visibility: "public" | "chums_only" | "invite_only",
  locationType: "in_person" | "online",
  locationVisibility: "exact_everyone" | "exact_joined_only" | "approximate_only",
): string {
  const base =
    visibility === "chums_only" ? "Chums only" : visibility === "invite_only" ? "Invite only" : "Public";
  if (locationType !== "in_person" || locationVisibility === "exact_everyone") return base;
  return locationVisibility === "exact_joined_only"
    ? `${base}, exact spot shown after joining`
    : `${base}, general area only`;
}
