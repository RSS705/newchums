/**
 * Kudos catalogue. One place, served to the web app through the wrap-up
 * payload (the picker) and the public profile endpoint (the shelf), so the
 * client never carries its own copy of the labels.
 *
 * The tags are deliberately universal across hobbies and read as props
 * rather than ratings: nothing here can be read as a mark against someone.
 * Wording chosen by Rob, 2026-09-06 (second pass the same day: the more
 * heartfelt ones went, "Sweaty" is an in-joke his crowd uses). No kudos rows
 * existed on prod at the swap, so no tag remapping was needed.
 */
export const KUDOS_TAGS = [
  { tag: "good_energy", label: "Good Energy", emoji: "⚡" },
  { tag: "quick_wit", label: "Quick Wit", emoji: "😏" },
  { tag: "banter_merchant", label: "Banter Merchant", emoji: "🗣️" },
  { tag: "social_glue", label: "Social Glue", emoji: "🧲" },
  { tag: "side_quest_energy", label: "Side-Quest Energy", emoji: "🗺️" },
  { tag: "good_sport", label: "Good Sport", emoji: "🤝" },
  { tag: "knows_cool_stuff", label: "Knows Cool Stuff", emoji: "🧠" },
  { tag: "great_taste", label: "Great Taste", emoji: "👌" },
  { tag: "refreshingly_normal", label: "Refreshingly Normal", emoji: "😌" },
  { tag: "delightfully_unhinged", label: "Delightfully Unhinged", emoji: "🤪" },
  { tag: "weird_in_a_good_way", label: "Weird in a Good Way", emoji: "🦄" },
  { tag: "sweaty", label: "Sweaty", emoji: "🥵" },
  { tag: "glad_you_came", label: "Glad You Came", emoji: "🎉" },
  { tag: "would_hang_again", label: "Would Hang Again", emoji: "🔁" },
  { tag: "would_recommend", label: "Would Recommend", emoji: "⭐" },
  { tag: "group_mvp", label: "Group MVP", emoji: "🏆" },
] as const;

export type KudosTag = (typeof KUDOS_TAGS)[number]["tag"];

const BY_TAG = new Map<string, (typeof KUDOS_TAGS)[number]>(KUDOS_TAGS.map((t) => [t.tag, t]));

export function isKudosTag(value: unknown): value is KudosTag {
  return typeof value === "string" && BY_TAG.has(value);
}

export function kudosTagInfo(tag: string): (typeof KUDOS_TAGS)[number] | null {
  return BY_TAG.get(tag) ?? null;
}

/** Each giver hands out at most this many kudos per plan. Keeps them scarce
 *  enough to mean something and stops a table of eight from awarding
 *  everyone everything. */
export const KUDOS_MAX_PER_PLAN = 3;

/** Kudos can be given for a week after the plan starts, the same window the
 *  wrap-up card already uses. */
export const KUDOS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A tag shows on the public profile only once this many different people
 *  have given it, so a lone giver stays anonymous. The owner sees everything. */
export const KUDOS_PUBLIC_MIN_GIVERS = 2;
