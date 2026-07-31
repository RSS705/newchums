/**
 * Super-admin hard delete for test-data hygiene (users and plans), plus the
 * shared impact-preview counting.
 *
 * Purpose: real accounts and plans created while testing in production
 * contaminate KPIs and the funnel. QA-flagged plans are excluded up front;
 * this is the after-the-fact cleanup for everything else.
 *
 * Design rules (enforced here and at the endpoints):
 * - The cascade runs as ONE non-interactive Postgres transaction
 *   (sql.transaction), whose FIRST statement writes the admin_audit row
 *   (migration 105), so the audit record commits atomically with the
 *   deletion and survives it.
 * - No notification emails of any kind: these functions execute raw SQL
 *   only and never touch the email layer.
 * - product_events rows for the subject are deleted explicitly (their FKs
 *   are ON DELETE SET NULL by design, which preserves funnel counts for
 *   real users; test cleanup must remove them outright).
 * - The FK graph below is enumerated from the live catalog, not assumed.
 *   users(id) is referenced with ON DELETE CASCADE by: password_reset_tokens,
 *   user_interests, user_profile, email_verification_tokens,
 *   email_change_requests, user_chums(x2), notifications.user_id,
 *   chum_invites.inviter_user_id, events.host_user_id, event_invites(x2),
 *   event_rsvps, event_alt_times, event_chat_messages, event_chat_reads,
 *   event_join_requests, host_attendee_removals(x2), event_confirmations,
 *   admin_view_timestamps, roadmap_items/votes/follows/comments/admin_notes,
 *   user_contacts(x2), attendance_issues(x2),
 *   conduct_reports(x2),
 *   user_objective_completions, community_members.user_id,
 *   community_join_requests.user_id, plan_feedback_dismissals (wrap-up
 *   dismissals; historical table name), user_badges,
 *   shoutouts(x2), subscription_plan_history.user_id,
 *   community_announcements.author, community_announcement_seen/mutes,
 *   event_chat_notify_sends.recipient, user_activity_log,
 *   dm_conversations(x3), dm_messages.sender, dm_participant_state,
 *   user_blocks(x2). ON DELETE SET NULL: notifications.actor_user_id,
 *   chum_invites.accepted_user_id, shoutouts.reviewed_by_user_id,
 *   community_schedule_blocks.created_by_user_id, product_events.user_id.
 *   ON DELETE NO ACTION (handled explicitly below): communities.owner_user_id
 *   (owned communities are deleted as part of the cascade),
 *   community_members.removed_by_user_id and
 *   community_join_requests.reviewed_by_user_id (nulled), and
 *   subscription_plan_history.assigned_by / qr_redirects.created_by (only
 *   ever set to admin accounts, which cannot be hard-deleted; if a row
 *   somehow exists the transaction aborts atomically).
 *   events(id) is referenced with CASCADE by: event_invites, event_rsvps,
 *   event_alt_times, event_interests, event_chat_messages, event_chat_reads,
 *   event_join_requests, host_attendee_removals, event_confirmations,
 *   attendance_issues, conduct_reports,
 *   plan_feedback_dismissals, shoutouts, event_communities,
 *   event_chat_notify_sends; and with SET NULL by
 *   email_verification_tokens.event_id and product_events.event_id.
 */

import type { getSql } from "../db";

type Sql = ReturnType<typeof getSql>;

export type UserDeleteImpact = {
  hostedPlans: number;
  rsvps: number;
  confirmations: number;
  chatMessages: number;
  productEventsUser: number;
  productEventsHostedPlans: number;
  communityMemberships: number;
  ownedCommunities: number;
  dmConversations: number;
  tokens: number;
  notifications: number;
};

export type PlanDeleteImpact = {
  rsvps: number;
  confirmations: number;
  chatMessages: number;
  invites: number;
  altTimes: number;
  joinRequests: number;
  shoutouts: number;
  productEvents: number;
};

const n = (rows: unknown, key = "c"): number =>
  Number((rows as Record<string, unknown>[])[0]?.[key] ?? 0);

export async function computeUserDeleteImpact(
  sql: Sql,
  userId: string,
): Promise<{ impact: UserDeleteImpact; hostedPlanIds: string[] }> {
  const hostedRows = (await sql`
    SELECT id FROM newchums.events WHERE host_user_id = ${userId}
  `) as { id: string }[];
  const hostedPlanIds = hostedRows.map((r) => r.id);

  const [
    rsvps, confirmations, chatMessages, peUser, pePlans, memberships,
    owned, dms, evTokens, prTokens, notifications,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int AS c FROM newchums.event_rsvps WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*)::int AS c FROM newchums.event_confirmations WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*)::int AS c FROM newchums.event_chat_messages WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*)::int AS c FROM newchums.product_events WHERE user_id = ${userId}`,
    hostedPlanIds.length > 0
      ? sql`SELECT COUNT(*)::int AS c FROM newchums.product_events WHERE event_id = ANY(${hostedPlanIds}::uuid[]) AND (user_id IS DISTINCT FROM ${userId} OR user_id IS NULL)`
      : Promise.resolve([{ c: 0 }]),
    sql`SELECT COUNT(*)::int AS c FROM newchums.community_members WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*)::int AS c FROM newchums.communities WHERE owner_user_id = ${userId}`,
    sql`SELECT COUNT(*)::int AS c FROM newchums.dm_conversations WHERE user_a = ${userId} OR user_b = ${userId}`,
    sql`SELECT COUNT(*)::int AS c FROM newchums.email_verification_tokens WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*)::int AS c FROM newchums.password_reset_tokens WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*)::int AS c FROM newchums.notifications WHERE user_id = ${userId}`,
  ]);

  return {
    hostedPlanIds,
    impact: {
      hostedPlans: hostedPlanIds.length,
      rsvps: n(rsvps),
      confirmations: n(confirmations),
      chatMessages: n(chatMessages),
      productEventsUser: n(peUser),
      productEventsHostedPlans: n(pePlans),
      communityMemberships: n(memberships),
      ownedCommunities: n(owned),
      dmConversations: n(dms),
      tokens: n(evTokens) + n(prTokens),
      notifications: n(notifications),
    },
  };
}

export async function computePlanDeleteImpact(sql: Sql, eventId: string): Promise<PlanDeleteImpact> {
  const [rsvps, confirmations, chat, invites, altTimes, joinRequests, shoutouts, pe] =
    await Promise.all([
      sql`SELECT COUNT(*)::int AS c FROM newchums.event_rsvps WHERE event_id = ${eventId}`,
      sql`SELECT COUNT(*)::int AS c FROM newchums.event_confirmations WHERE event_id = ${eventId}`,
      sql`SELECT COUNT(*)::int AS c FROM newchums.event_chat_messages WHERE event_id = ${eventId}`,
      sql`SELECT COUNT(*)::int AS c FROM newchums.event_invites WHERE event_id = ${eventId}`,
      sql`SELECT COUNT(*)::int AS c FROM newchums.event_alt_times WHERE event_id = ${eventId}`,
      sql`SELECT COUNT(*)::int AS c FROM newchums.event_join_requests WHERE event_id = ${eventId}`,
      sql`SELECT COUNT(*)::int AS c FROM newchums.shoutouts WHERE plan_id = ${eventId}`,
      sql`SELECT COUNT(*)::int AS c FROM newchums.product_events WHERE event_id = ${eventId}`,
    ]);
  return {
    rsvps: n(rsvps),
    confirmations: n(confirmations),
    chatMessages: n(chat),
    invites: n(invites),
    altTimes: n(altTimes),
    joinRequests: n(joinRequests),
    shoutouts: n(shoutouts),
    productEvents: n(pe),
  };
}

/**
 * Run the user hard-delete transaction. Caller has already verified the
 * actor is a super admin and the target is neither a super admin nor the
 * actor. Returns the audit detail that was committed.
 */
export async function hardDeleteUser(
  sql: Sql,
  args: {
    actorUserId: string;
    targetUserId: string;
    targetLabel: string;
    impact: UserDeleteImpact;
    hostedPlanIds: string[];
  },
): Promise<void> {
  const detail = JSON.stringify({ impact: args.impact, hostedPlanIds: args.hostedPlanIds });
  const queries = [
    sql`
      INSERT INTO newchums.admin_audit (actor_user_id, action, subject_type, subject_id, subject_label, detail)
      VALUES (${args.actorUserId}, 'user_hard_delete', 'user', ${args.targetUserId}, ${args.targetLabel}, ${detail}::jsonb)
    `,
    sql`DELETE FROM newchums.product_events WHERE user_id = ${args.targetUserId}`,
    ...(args.hostedPlanIds.length > 0
      ? [sql`DELETE FROM newchums.product_events WHERE event_id = ANY(${args.hostedPlanIds}::uuid[])`]
      : []),
    sql`UPDATE newchums.community_members SET removed_by_user_id = NULL WHERE removed_by_user_id = ${args.targetUserId}`,
    sql`UPDATE newchums.community_join_requests SET reviewed_by_user_id = NULL WHERE reviewed_by_user_id = ${args.targetUserId}`,
    sql`DELETE FROM newchums.communities WHERE owner_user_id = ${args.targetUserId}`,
    sql`DELETE FROM newchums.users WHERE id = ${args.targetUserId}`,
  ];
  await sql.transaction(queries);
}

/** Run the plan hard-delete transaction. Same contract as hardDeleteUser. */
export async function hardDeletePlan(
  sql: Sql,
  args: {
    actorUserId: string;
    eventId: string;
    planTitle: string;
    impact: PlanDeleteImpact;
  },
): Promise<void> {
  const detail = JSON.stringify({ impact: args.impact });
  await sql.transaction([
    sql`
      INSERT INTO newchums.admin_audit (actor_user_id, action, subject_type, subject_id, subject_label, detail)
      VALUES (${args.actorUserId}, 'plan_hard_delete', 'event', ${args.eventId}, ${args.planTitle}, ${detail}::jsonb)
    `,
    sql`DELETE FROM newchums.product_events WHERE event_id = ${args.eventId}`,
    sql`DELETE FROM newchums.events WHERE id = ${args.eventId}`,
  ]);
}
