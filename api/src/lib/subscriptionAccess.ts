/**
 * Subscription plan access helpers.
 *
 * Three plans:  free | super_host | community_pro
 *
 * - super_host: unlocks advanced plan/event-level functionality for the user wherever they host.
 * - community_pro: unlocks advanced community-level functionality for communities the user owns,
 *   and includes all Super Host benefits.
 * - Community Pro covers up to 5 owned communities (product rule, not yet enforced at DB level).
 *
 * Access resolution:
 *   hasSuperHostAccess  = plan is super_host OR community_pro
 *   hasCommunityProAccess = plan is community_pro
 *   communityInheritsProAccess = the community's owner has community_pro
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type SubscriptionPlan = "free" | "super_host" | "community_pro";

export const VALID_SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  "free",
  "super_host",
  "community_pro",
] as const;

/**
 * Maximum number of communities a single user may own.
 *
 * Applies to all users regardless of plan. Community Pro covers all five.
 * Enforced at community creation time in POST /communities.
 */
export const MAX_OWNED_COMMUNITIES = 5;

// ── Pure access checks (no DB) ─────────────────────────────────────────────

/** Does the given plan grant Super Host access? (super_host or community_pro) */
export function hasSuperHostAccess(plan: string | null | undefined): boolean {
  return plan === "super_host" || plan === "community_pro";
}

/** Does the given plan grant Community Pro access? */
export function hasCommunityProAccess(plan: string | null | undefined): boolean {
  return plan === "community_pro";
}

/** Is the provided string a valid subscription plan value? */
export function isValidSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return typeof value === "string" && VALID_SUBSCRIPTION_PLANS.includes(value as SubscriptionPlan);
}

// ── DB-backed helpers ───────────────────────────────────────────────────────

type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
};

/** Load subscription_plan for a user. Returns 'free' when not set or user not found. */
export async function getUserSubscriptionPlan(
  sql: SqlClient,
  userId: string,
): Promise<SubscriptionPlan> {
  const rows = (await sql`
    SELECT subscription_plan FROM newchums.users WHERE id = ${userId} LIMIT 1
  `) as { subscription_plan: string }[];
  const plan = rows[0]?.subscription_plan;
  return isValidSubscriptionPlan(plan) ? plan : "free";
}

/**
 * Does a community inherit Community Pro access from its owner?
 * Resolves ownership from communities.owner_user_id, then checks the owner's plan.
 */
export async function communityInheritsProAccess(
  sql: SqlClient,
  communityId: string,
): Promise<boolean> {
  const rows = (await sql`
    SELECT u.subscription_plan
    FROM newchums.communities c
    JOIN newchums.users u ON u.id = c.owner_user_id
    WHERE c.id = ${communityId}
    LIMIT 1
  `) as { subscription_plan: string }[];
  return hasCommunityProAccess(rows[0]?.subscription_plan);
}

/**
 * Count how many communities a user owns.
 * Useful for checking whether the user is at the Community Pro cap.
 */
export async function countOwnedCommunities(
  sql: SqlClient,
  userId: string,
): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM newchums.communities
    WHERE owner_user_id = ${userId}
      AND COALESCE(status, 'active') != 'closed'
  `) as { count: number }[];
  return rows[0]?.count ?? 0;
}
