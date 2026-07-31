/**
 * First-party product analytics events (funnel mirror).
 *
 * GA (gtag) only runs in production and is partially eaten by ad blockers,
 * so the server-detectable funnel steps are mirrored into
 * newchums.product_events (migration 103). The table is append-only:
 * application logic never updates or deletes rows.
 *
 * Invariants:
 * - A failed event write must NEVER fail the parent request. Every exported
 *   helper swallows its own errors (console.error only) and the returned
 *   promise never rejects.
 * - Call sites hand the returned promise to runAfterResponse() so the write
 *   happens off the request's critical path (executionCtx.waitUntil on
 *   Workers).
 * - QA plans (events.is_qa = true) never produce product events, matching
 *   the standing rule that QA activity stays out of KPI metrics.
 * - Once-per-subject events (rsvp_verified, signup_completed,
 *   first_plan_created, second_plan_created, plan_reached_3_rsvps) are
 *   enforced by partial unique indexes; inserts use a bare ON CONFLICT DO
 *   NOTHING so concurrent double-fires resolve to exactly one row.
 *   Repeatable events (signup_email_sent, rsvp_recorded, plan_copied) have
 *   no unique index, so no schema change is needed to add one.
 * - params stay small, flat, and PII-free (internal ids are fine, email
 *   addresses and names are not).
 *
 * The full event catalogue (including the client-side GA events) lives in
 * docs/Technical_Specs.md, section 12, "Product analytics events".
 */

import type { getSql } from "../db";

type Sql = ReturnType<typeof getSql>;

export type ProductEventName =
  | "rsvp_verified"
  | "rsvp_recorded"
  | "signup_completed"
  | "signup_email_sent"
  | "first_plan_created"
  | "second_plan_created"
  | "plan_reached_3_rsvps"
  | "plan_copied";

export type ProductEvent = {
  name: ProductEventName;
  userId?: string | null;
  /** Plan (events.id) the event is about, when there is one. */
  eventId?: string | null;
  /** Small, flat, PII-free. */
  params?: Record<string, string | number | boolean>;
};

/**
 * Insert one product event. Never throws; unique-index conflicts (the
 * once-per-subject events) are silently absorbed by ON CONFLICT DO NOTHING.
 */
export async function recordProductEvent(sql: Sql, evt: ProductEvent): Promise<void> {
  try {
    await sql`
      INSERT INTO newchums.product_events (event_name, user_id, event_id, params)
      VALUES (${evt.name}, ${evt.userId ?? null}, ${evt.eventId ?? null}, ${JSON.stringify(evt.params ?? {})}::jsonb)
      ON CONFLICT DO NOTHING
    `;
  } catch (err) {
    console.error(`[product-events] insert failed for ${evt.name}`, err);
  }
}

/**
 * Fired when a plan-signup magic-link verification completes, i.e. the
 * consume endpoint is about to flip email_verified_at from NULL. This is
 * both the invitee-funnel "verified" step and a signup completion.
 */
export async function recordPlanSignupVerified(sql: Sql, userId: string): Promise<void> {
  await recordProductEvent(sql, { name: "rsvp_verified", userId });
  await recordProductEvent(sql, {
    name: "signup_completed",
    userId,
    params: { method: "plan_signup" },
  });
}

/**
 * Host-loop events derived from a plan insert. Runs after the insert has
 * committed, so the count includes the new plan: 1 means this was the
 * host's first plan, 2 the second (the real retention signal). QA plans
 * are excluded from both the trigger (call sites skip is_qa inserts) and
 * the count itself. Drafts are counted, but the product UI only creates
 * published plans, so in practice every insert is a published plan.
 */
export async function recordPlanCreationFunnelEvents(
  sql: Sql,
  args: { planId: string; hostUserId: string },
): Promise<void> {
  try {
    const rows = (await sql`
      SELECT COUNT(*)::int AS c
      FROM newchums.events
      WHERE host_user_id = ${args.hostUserId}
        AND COALESCE(is_qa, false) = false
    `) as { c: number }[];
    const planCount = rows[0]?.c ?? 0;
    if (planCount === 1) {
      await recordProductEvent(sql, {
        name: "first_plan_created",
        userId: args.hostUserId,
        eventId: args.planId,
      });
    } else if (planCount === 2) {
      await recordProductEvent(sql, {
        name: "second_plan_created",
        userId: args.hostUserId,
        eventId: args.planId,
      });
    }
  } catch (err) {
    console.error("[product-events] plan-creation funnel events failed", err);
  }
}

/**
 * Funnel events derived from an RSVP write. Call from every code path that
 * creates or upgrades event_rsvps rows (direct RSVP endpoint, join-request
 * approval).
 *
 * - rsvp_recorded: fires when a new RSVP row was created by a user who
 *   entered via the plan-signup flow (detected by their rsvp_verified
 *   product event, so only post-instrumentation cohorts count).
 * - plan_reached_3_rsvps: fires the moment the plan has 3 or more non-host
 *   "going" RSVPs. The partial unique index keeps it once per plan.
 */
export async function recordRsvpFunnelEvents(
  sql: Sql,
  args: {
    planId: string;
    hostUserId: string;
    isQa: boolean;
    rsvpUserId: string;
    rsvpStatus: string;
    /** True when the write created a new event_rsvps row (vs. updating one). */
    rsvpRowCreated: boolean;
  },
): Promise<void> {
  try {
    if (args.isQa) return;

    if (args.rsvpRowCreated && args.rsvpUserId !== args.hostUserId) {
      const verified = (await sql`
        SELECT 1 AS one FROM newchums.product_events
        WHERE event_name = 'rsvp_verified' AND user_id = ${args.rsvpUserId}
        LIMIT 1
      `) as unknown[];
      if (verified.length > 0) {
        await recordProductEvent(sql, {
          name: "rsvp_recorded",
          userId: args.rsvpUserId,
          eventId: args.planId,
          params: { status: args.rsvpStatus },
        });
      }
    }

    if (args.rsvpStatus === "going") {
      const rows = (await sql`
        SELECT COUNT(*)::int AS c
        FROM newchums.event_rsvps
        WHERE event_id = ${args.planId}
          AND status = 'going'
          AND user_id IS DISTINCT FROM ${args.hostUserId}
      `) as { c: number }[];
      if ((rows[0]?.c ?? 0) >= 3) {
        await recordProductEvent(sql, {
          name: "plan_reached_3_rsvps",
          userId: args.hostUserId,
          eventId: args.planId,
        });
      }
    }
  } catch (err) {
    console.error("[product-events] rsvp funnel events failed", err);
  }
}

/**
 * Run analytics work off the request's critical path. On Workers this is
 * executionCtx.waitUntil; in environments without an execution context
 * (vitest), the promise is left to run on its own. Helpers in this module
 * never reject, so a floating promise is safe.
 */
export function runAfterResponse(
  c: { executionCtx: { waitUntil(promise: Promise<unknown>): void } },
  work: Promise<unknown>,
): void {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // Hono throws on executionCtx access when none exists; the work still
    // runs as a floating promise.
  }
}
