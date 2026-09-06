/**
 * Kudos catalogue. One place, served to the web app through the wrap-up
 * payload (the picker) and the public profile endpoint (the shelf), so the
 * client never carries its own copy of the labels.
 *
 * The tags are deliberately universal across hobbies and read as props
 * rather than ratings: nothing here can be read as a mark against someone.
 * Wording chosen by Rob, 2026-09-06, extended the same evening to 64 tags
 * ("Sweaty", "Salt Miner" and friends are in-jokes his crowd uses). Users
 * see these as "tags"; kudos stays the internal name (table, routes,
 * preference key). The picker sorts alphabetically and has a search box,
 * so definition order here does not matter. Slugs are stable once shipped:
 * they are stored on kudos rows.
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
  { tag: "human_wd_40", label: "Human WD-40", emoji: "🛢️" },
  { tag: "hype_person", label: "Hype Person", emoji: "📣" },
  { tag: "comedy_relief", label: "Comedy Relief", emoji: "🎭" },
  { tag: "laughs_at_their_own_jokes", label: "Laughs at Their Own Jokes", emoji: "🤭" },
  { tag: "instigator", label: "Instigator", emoji: "🧨" },
  { tag: "plot_complicator", label: "Plot Complicator", emoji: "🌀" },
  { tag: "dangerously_persuasive", label: "Dangerously Persuasive", emoji: "🪄" },
  { tag: "terrible_influence", label: "Terrible Influence", emoji: "😈" },
  { tag: "makes_plans_happen", label: "Makes Plans Happen", emoji: "📅" },
  { tag: "built_for_shenanigans", label: "Built for Shenanigans", emoji: "🐒" },
  { tag: "brought_snacks", label: "Brought Snacks", emoji: "🍿" },
  { tag: "knows_a_guy", label: "Knows a Guy", emoji: "🕶️" },
  { tag: "reads_the_instructions", label: "Reads the Instructions", emoji: "📖" },
  { tag: "actually_made_a_reservation", label: "Actually Made a Reservation", emoji: "📞" },
  { tag: "functional_adult", label: "Functional Adult", emoji: "🧾" },
  { tag: "problem_solver", label: "Problem Solver", emoji: "🔧" },
  { tag: "hot_take_machine", label: "Hot Take Machine", emoji: "🌶️" },
  { tag: "never_boring", label: "Never Boring", emoji: "🎢" },
  { tag: "makes_you_think", label: "Makes You Think", emoji: "💭" },
  { tag: "strong_opinions", label: "Strong Opinions", emoji: "📢" },
  { tag: "excellent_rant", label: "Excellent Rant", emoji: "🎙️" },
  { tag: "shows_up", label: "Shows Up", emoji: "📍" },
  { tag: "came_in_clutch", label: "Came in Clutch", emoji: "🎯" },
  { tag: "solid_human", label: "Solid Human", emoji: "🪨" },
  { tag: "good_under_pressure", label: "Good Under Pressure", emoji: "🧊" },
  { tag: "actually_helps", label: "Actually Helps", emoji: "🙌" },
  { tag: "trusted_with_the_keys", label: "Trusted With the Keys", emoji: "🔑" },
  { tag: "feeds_the_group", label: "Feeds the Group", emoji: "🍕" },
  { tag: "host_energy", label: "Host Energy", emoji: "🏠" },
  { tag: "table_captain", label: "Table Captain", emoji: "🧭" },
  { tag: "elite_host", label: "Elite Host", emoji: "👑" },
  { tag: "rules_lawyer", label: "Rules Lawyer", emoji: "⚖️" },
  { tag: "rng_god", label: "RNG God", emoji: "🎲" },
  { tag: "tactical_menace", label: "Tactical Menace", emoji: "♟️" },
  { tag: "table_politician", label: "Table Politician", emoji: "🗳️" },
  { tag: "button_pusher", label: "Button Pusher", emoji: "🔘" },
  { tag: "analysis_paralysis", label: "Analysis Paralysis", emoji: "⏳" },
  { tag: "salt_miner", label: "Salt Miner", emoji: "🧂" },
  { tag: "selective_hearing", label: "Selective Hearing", emoji: "🙉" },
  { tag: "needs_adult_supervision", label: "Needs Adult Supervision", emoji: "🚸" },
  { tag: "suspicious_character", label: "Suspicious Character", emoji: "🕵️" },
  { tag: "cannot_be_taken_anywhere", label: "Cannot Be Taken Anywhere", emoji: "🚫" },
  { tag: "menace", label: "Menace", emoji: "😼" },
  { tag: "enabler", label: "Enabler", emoji: "🍻" },
  { tag: "wildcard", label: "Wildcard", emoji: "🃏" },
  { tag: "brain_cell", label: "Brain Cell", emoji: "💡" },
  { tag: "good_egg", label: "Good Egg", emoji: "🥚" },
  { tag: "absolute_unit", label: "Absolute Unit", emoji: "🐂" },
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
