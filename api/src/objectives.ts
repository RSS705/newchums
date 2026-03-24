/**
 * Objectives / nudge framework — catalog + evaluation logic.
 *
 * Each objective has a durable key, user-facing copy, ordering, and a
 * SQL-evaluable completion condition.  The `evaluateObjectives` function
 * runs a single query to check all signals and returns the ordered list
 * with completion state, plus the "next best step."
 */

// ── Catalog types ────────────────────────────────────────────────────────────

export type ObjectiveCategory = "profile" | "social" | "plans" | "engagement";

export type ObjectiveDefinition = {
  key: string;
  title: string;
  description: string;
  category: ObjectiveCategory;
  /** Global sequence for next-best-step ordering (lower = earlier). */
  sequence: number;
  /** Where the user should go to complete this objective. */
  actionUrl: string;
  actionLabel: string;
};

export type ObjectiveStatus = {
  key: string;
  title: string;
  description: string;
  category: ObjectiveCategory;
  sequence: number;
  actionUrl: string;
  actionLabel: string;
  completed: boolean;
  completedAt: string | null;
};

// ── Objective catalog ────────────────────────────────────────────────────────
//
// Sequence numbers use gaps to allow future insertion.
// The order reflects the most natural activation path:
//   1. Core identity (name)
//   2. Discovery setup (hobbies → location → travel distance)
//   3. Profile depth (bio → avatar)
//   4. Activation (join → attend → chat → feedback → create → connect)

export const OBJECTIVES: ObjectiveDefinition[] = [
  {
    key: "add_display_name",
    title: "Add your name",
    description: "Let people know who you are by adding your display name.",
    category: "profile",
    sequence: 10,
    actionUrl: "/profile",
    actionLabel: "Edit profile",
  },
  {
    key: "add_hobbies",
    title: "Add your hobbies",
    description: "Tell NewChums what you enjoy so we can show you relevant plans.",
    category: "profile",
    sequence: 20,
    actionUrl: "/profile",
    actionLabel: "Add hobbies",
  },
  {
    key: "set_location",
    title: "Set your location",
    description: "Help us find plans near you by setting your home area.",
    category: "profile",
    sequence: 30,
    actionUrl: "/profile",
    actionLabel: "Set location",
  },
  {
    key: "set_travel_distance",
    title: "Set your travel distance",
    description: "Choose how far you're willing to travel so we recommend the right plans.",
    category: "profile",
    sequence: 40,
    actionUrl: "/profile",
    actionLabel: "Set distance",
  },
  {
    key: "add_bio",
    title: "Write a short bio",
    description: "A few words about yourself help others feel comfortable connecting.",
    category: "profile",
    sequence: 50,
    actionUrl: "/profile",
    actionLabel: "Write bio",
  },
  {
    key: "add_avatar",
    title: "Add a profile picture",
    description: "A profile picture helps people recognize you at gatherings.",
    category: "profile",
    sequence: 60,
    actionUrl: "/profile",
    actionLabel: "Add picture",
  },
  {
    key: "join_first_plan",
    title: "Join your first plan",
    description: "Browse plans and RSVP to something that interests you.",
    category: "plans",
    sequence: 70,
    actionUrl: "/",
    actionLabel: "Explore plans",
  },
  {
    key: "attend_first_plan",
    title: "Attend your first plan",
    description: "Show up to a plan you joined — that's what NewChums is all about.",
    category: "plans",
    sequence: 80,
    actionUrl: "/your-plans",
    actionLabel: "Your plans",
  },
  {
    key: "send_first_message",
    title: "Say hello in a plan chat",
    description: "Introduce yourself in a plan's group chat before meeting up.",
    category: "engagement",
    sequence: 90,
    actionUrl: "/your-plans",
    actionLabel: "Your plans",
  },
  {
    key: "give_first_feedback",
    title: "Give feedback after a plan",
    description: "Quick feedback helps NewChums improve your future matches.",
    category: "engagement",
    sequence: 100,
    actionUrl: "/your-plans",
    actionLabel: "Your plans",
  },
  {
    key: "create_first_plan",
    title: "Create your first plan",
    description: "Organize a gathering around something you enjoy.",
    category: "plans",
    sequence: 110,
    actionUrl: "/events/create",
    actionLabel: "Create a plan",
  },
  {
    key: "add_first_chum",
    title: "Add your first chum",
    description: "Save someone to your connections so you can plan together easily.",
    category: "social",
    sequence: 120,
    actionUrl: "/chum-groups",
    actionLabel: "Find people",
  },
];

// ── Evaluation ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlFn = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

/**
 * Evaluate all objectives for a user in a single query, record any
 * newly-detected completions, and return the full status list plus
 * the next best step.
 */
export async function evaluateObjectives(
  sql: SqlFn,
  userId: string,
): Promise<{
  objectives: ObjectiveStatus[];
  nextStep: ObjectiveStatus | null;
  tutorialOff: boolean;
}> {
  // 1. Check all completion signals + user prefs in one round-trip
  const rows = (await sql`
    SELECT
      COALESCE(NULLIF(TRIM(u.name), ''), NULL) IS NOT NULL                AS has_name,
      u.avatar_key IS NOT NULL                                             AS has_avatar,
      EXISTS (SELECT 1 FROM newchums.user_interests ui WHERE ui.user_id = u.id) AS has_hobbies,
      (
        SELECT (p.home_lat IS NOT NULL AND p.home_lng IS NOT NULL)
          OR COALESCE(NULLIF(TRIM(p.home_city), ''), NULL) IS NOT NULL
        FROM newchums.user_profile p WHERE p.user_id = u.id
      )                                                                    AS has_location,
      (
        SELECT p.travel_radius_km IS NOT NULL AND p.travel_radius_km != 200
        FROM newchums.user_profile p WHERE p.user_id = u.id
      )                                                                    AS has_travel_distance,
      (
        SELECT COALESCE(NULLIF(TRIM(p.bio), ''), NULL) IS NOT NULL
        FROM newchums.user_profile p WHERE p.user_id = u.id
      )                                                                    AS has_bio,
      EXISTS (
        SELECT 1 FROM newchums.event_rsvps r
        WHERE r.user_id = u.id AND r.status = 'going'
      )                                                                    AS has_joined_plan,
      EXISTS (
        SELECT 1 FROM newchums.user_contacts uc WHERE uc.user_id = u.id
      )                                                                    AS has_chum,
      EXISTS (
        SELECT 1 FROM newchums.event_rsvps r
        JOIN newchums.events e ON e.id = r.event_id
        WHERE r.user_id = u.id AND r.status = 'going'
          AND e.host_user_id != u.id
          AND e.status != 'canceled'
          AND e.starts_at < now()
      )                                                                    AS has_attended,
      EXISTS (
        SELECT 1 FROM newchums.event_chat_messages m WHERE m.user_id = u.id
      )                                                                    AS has_sent_message,
      EXISTS (
        SELECT 1 FROM newchums.plan_feedback pf WHERE pf.reviewer_user_id = u.id
      )                                                                    AS has_given_feedback,
      EXISTS (
        SELECT 1 FROM newchums.events e
        WHERE e.host_user_id = u.id AND e.status IN ('published', 'canceled')
      )                                                                    AS has_created_plan,
      COALESCE(u.tutorial_nudges_off, false)                               AS tutorial_off
    FROM newchums.users u
    WHERE u.id = ${userId}
    LIMIT 1
  `) as Array<{
    has_name: boolean;
    has_avatar: boolean;
    has_hobbies: boolean;
    has_location: boolean | null;
    has_travel_distance: boolean | null;
    has_bio: boolean | null;
    has_chum: boolean;
    has_joined_plan: boolean;
    has_attended: boolean;
    has_sent_message: boolean;
    has_given_feedback: boolean;
    has_created_plan: boolean;
    tutorial_off: boolean;
  }>;

  const signals = rows[0];
  if (!signals) {
    return { objectives: [], nextStep: null, tutorialOff: false };
  }

  const signalMap: Record<string, boolean> = {
    add_display_name: signals.has_name,
    add_avatar: signals.has_avatar,
    add_hobbies: signals.has_hobbies,
    set_location: signals.has_location ?? false,
    set_travel_distance: signals.has_travel_distance ?? false,
    add_bio: signals.has_bio ?? false,
    join_first_plan: signals.has_joined_plan,
    add_first_chum: signals.has_chum,
    attend_first_plan: signals.has_attended,
    send_first_message: signals.has_sent_message,
    give_first_feedback: signals.has_given_feedback,
    create_first_plan: signals.has_created_plan,
  };

  // 2. Load existing completion records
  const completions = (await sql`
    SELECT objective_key, completed_at
    FROM newchums.user_objective_completions
    WHERE user_id = ${userId}
  `) as Array<{ objective_key: string; completed_at: string | Date }>;

  const completionMap = new Map<string, string>();
  for (const c of completions) {
    completionMap.set(
      c.objective_key,
      typeof c.completed_at === "string"
        ? c.completed_at
        : (c.completed_at as Date).toISOString(),
    );
  }

  // 3. Detect newly completed objectives and record them
  const newlyCompleted: string[] = [];
  for (const obj of OBJECTIVES) {
    if (signalMap[obj.key] && !completionMap.has(obj.key)) {
      newlyCompleted.push(obj.key);
    }
  }

  if (newlyCompleted.length > 0) {
    const now = new Date().toISOString();
    for (const key of newlyCompleted) {
      await sql`
        INSERT INTO newchums.user_objective_completions (user_id, objective_key, completed_at)
        VALUES (${userId}, ${key}, ${now})
        ON CONFLICT (user_id, objective_key) DO NOTHING
      `;
      completionMap.set(key, now);
    }
  }

  // 4. Build the full status list
  const objectives: ObjectiveStatus[] = OBJECTIVES.map((obj) => ({
    key: obj.key,
    title: obj.title,
    description: obj.description,
    category: obj.category,
    sequence: obj.sequence,
    actionUrl: obj.actionUrl,
    actionLabel: obj.actionLabel,
    completed: signalMap[obj.key] ?? false,
    completedAt: completionMap.get(obj.key) ?? null,
  }));

  // 5. Find next best step (first incomplete in sequence order)
  const sorted = [...objectives].sort((a, b) => a.sequence - b.sequence);
  const nextStep = sorted.find((o) => !o.completed) ?? null;

  return { objectives, nextStep, tutorialOff: signals.tutorial_off };
}
