/**
 * System banner presets for NewChums events.
 * Each preset is a named gradient. Presets can be extended later to include
 * real photographic banners stored in R2 without changing the contract.
 */

export type BannerPreset = {
  slug: string;
  label: string;
  /** CSS linear-gradient value */
  gradient: string;
  /** Hobby slug keywords that suggest this preset */
  hobbyKeywords: string[];
};

export const BANNER_PRESETS: BannerPreset[] = [
  {
    slug: "indigo",
    label: "Indigo",
    gradient: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
    hobbyKeywords: [],
  },
  {
    slug: "teal",
    label: "Teal",
    gradient: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
    hobbyKeywords: ["swim", "sail", "fish", "kayak", "canoe", "water", "surf", "scuba", "dive"],
  },
  {
    slug: "amber",
    label: "Amber",
    gradient: "linear-gradient(135deg, #b45309 0%, #c2410c 100%)",
    hobbyKeywords: ["cook", "bak", "food", "coffee", "wine", "beer", "brew", "eat", "dining"],
  },
  {
    slug: "forest",
    label: "Forest",
    gradient: "linear-gradient(135deg, #15803d 0%, #166534 100%)",
    hobbyKeywords: ["hik", "garden", "camp", "nature", "run", "cycl", "bike", "tennis", "golf", "trail", "walk"],
  },
  {
    slug: "rose",
    label: "Rose",
    gradient: "linear-gradient(135deg, #be185d 0%, #9f1239 100%)",
    hobbyKeywords: ["art", "craft", "potter", "paint", "music", "danc", "yoga", "sing", "draw", "sketch"],
  },
  {
    slug: "slate",
    label: "Slate",
    gradient: "linear-gradient(135deg, #475569 0%, #1e293b 100%)",
    hobbyKeywords: ["tech", "cod", "program", "board", "game", "read", "book", "study", "chess", "puzzle"],
  },
  {
    slug: "sky",
    label: "Sky",
    gradient: "linear-gradient(135deg, #0284c7 0%, #6d28d9 100%)",
    hobbyKeywords: ["photo", "travel", "language", "film", "video", "podcast"],
  },
  {
    slug: "sunset",
    label: "Sunset",
    gradient: "linear-gradient(135deg, #ea580c 0%, #eab308 100%)",
    hobbyKeywords: ["volley", "soccer", "football", "baseball", "basketball", "sport", "frisbee", "cricket"],
  },
];

/** Fallback gradient used when no preset matches */
const FALLBACK_GRADIENT = BANNER_PRESETS[0].gradient;

/** Return the gradient string for a given preset slug, falling back to default. */
export function getGradientForSlug(slug: string): string {
  return BANNER_PRESETS.find((p) => p.slug === slug)?.gradient ?? FALLBACK_GRADIENT;
}

/**
 * Deterministically pick a gradient for an event using its UUID.
 * The same event always gets the same colour so the card looks consistent
 * even before a banner is uploaded.
 */
export function getGradientForEventId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) >>> 0;
  }
  return BANNER_PRESETS[hash % BANNER_PRESETS.length].gradient;
}

/**
 * Suggest a preset slug based on a list of hobby slugs.
 * Returns the first matching preset, or undefined if none matches.
 */
export function suggestPreset(hobbySlugs: string[]): string | undefined {
  for (const hobbySlug of hobbySlugs) {
    const lower = hobbySlug.toLowerCase();
    for (const preset of BANNER_PRESETS) {
      if (preset.hobbyKeywords.some((kw) => lower.includes(kw))) {
        return preset.slug;
      }
    }
  }
  return undefined;
}

/**
 * Render a banner preset gradient to a 1200×400 canvas and return a Blob.
 * Only available in browser contexts.
 */
export function renderBannerPreset(slug: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const preset = BANNER_PRESETS.find((p) => p.slug === slug);
    if (!preset) { reject(new Error("Unknown preset slug")); return; }

    const colors = [...preset.gradient.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})/g)].map((m) => m[0]);
    if (colors.length < 2) { reject(new Error("Could not parse gradient colors")); return; }

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) { reject(new Error("No canvas context")); return; }

    // 135deg diagonal: top-right → bottom-left
    const grd = ctx.createLinearGradient(canvas.width, 0, 0, canvas.height);
    grd.addColorStop(0, colors[0]);
    grd.addColorStop(1, colors[colors.length - 1]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      0.85,
    );
  });
}
