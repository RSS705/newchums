/**
 * Postgres-backed sliding-window rate limiter (migration 104,
 * newchums.auth_rate_events).
 *
 * Exists because the KV limiter in contactRateLimit.ts silently no-ops when
 * the CONTACT_RATELIMIT_KV binding is absent, and the binding is not
 * provisioned in production. Security-relevant limits (plan-signup issuance,
 * OTP verify attempts per IP, resend cooldown) must not depend on it.
 * Repo-wide adoption for the remaining KV call sites is roadmap item A3.
 *
 * Semantics mirror checkRateLimit: a marker row is recorded only when the
 * request is allowed, so denied requests do not extend the window. The
 * check-and-record is a single INSERT ... SELECT ... WHERE count < limit
 * statement, so concurrent requests cannot both slip past the boundary by
 * more than the usual read-skew of one row.
 *
 * Fail-open on database error (matching the KV limiter's degraded mode):
 * a limiter outage must not take signups down with it. Callers that need
 * fail-closed behavior should catch at their own layer.
 */

import type { getSql } from "../db";

type Sql = ReturnType<typeof getSql>;

/**
 * Atomically record-if-allowed. Returns { allowed: false } when the bucket
 * already holds `limit` events inside the trailing window.
 */
export async function checkDbRateLimit(
  sql: Sql,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean }> {
  try {
    const windowStart = new Date(Date.now() - windowMs).toISOString();
    const rows = (await sql`
      INSERT INTO newchums.auth_rate_events (bucket)
      SELECT ${bucket}
      WHERE (
        SELECT COUNT(*) FROM newchums.auth_rate_events
        WHERE bucket = ${bucket} AND created_at >= ${windowStart}::timestamptz
      ) < ${limit}
      RETURNING id
    `) as { id: string }[];
    return { allowed: rows.length > 0 };
  } catch (err) {
    console.error("[db-rate-limit] check failed, failing open", err);
    return { allowed: true };
  }
}

/**
 * Read-only variant: is the bucket currently at or over its limit? Records
 * nothing. Used for cooldowns that should only be charged after the guarded
 * action actually succeeds (e.g. the resend cooldown starts when the email
 * sends, not when the request validates).
 */
export async function isDbRateLimited(
  sql: Sql,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - windowMs).toISOString();
    const rows = (await sql`
      SELECT COUNT(*)::int AS c FROM newchums.auth_rate_events
      WHERE bucket = ${bucket} AND created_at >= ${windowStart}::timestamptz
    `) as { c: number }[];
    return (rows[0]?.c ?? 0) >= limit;
  } catch (err) {
    console.error("[db-rate-limit] read failed, failing open", err);
    return false;
  }
}

/** Record a marker without checking. Pairs with isDbRateLimited. */
export async function recordDbRateEvent(sql: Sql, bucket: string): Promise<void> {
  try {
    await sql`INSERT INTO newchums.auth_rate_events (bucket) VALUES (${bucket})`;
  } catch (err) {
    console.error("[db-rate-limit] record failed", err);
  }
}
