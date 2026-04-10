import * as Sentry from "@sentry/cloudflare";
import { compareSync, hashSync } from "bcryptjs";
import { Hono } from "hono";
import { inspectRoutes } from "hono/dev";
import { isAtLeast18, parseDateOnly } from "./ageValidation";
import { SignJWT, jwtVerify } from "jose";
import { getBearerToken, verifyAuthToken } from "./auth";
import { DATABASE_URL_HINT, type Bindings, getSql } from "./db";
import { evaluateObjectives, OBJECTIVES } from "./objectives";
import {
  sendAttendeeRemovedEmail,
  sendChumInviteEmail,
  sendContactFormEmail,
  sendEmailChangeConfirmEmail,
  sendEmailChangeNotifyOldEmail,
  sendEmailChangeSuccessEmail,
  sendEventCanceledEmail,
  sendEventChangedEmail,
  type PlanChangeItem,
  sendEventInviteEmail,
  sendEventJoinEmail,
  sendEventLeaveEmail,
  sendEventMaybeEmail,
  sendEventRsvpUpdateEmail,
  sendJoinRequestApprovedEmail,
  sendJoinRequestDeclinedEmail,
  sendJoinRequestEmail,
  sendPasswordResetEmail,
  sendRsvpConfirmationEmail,
  sendUnreadChatDigestEmail,
  sendEventMatchDigestEmail,
  formatEventMatchSeatLine,
  sendGuestVerifyCodeEmail,
  sendVerificationEmail,
  sendConfirmationRequestEmail,
  sendGuestConfirmationRequestEmail,
  sendPlanAtRiskEmail,
  sendPlanAutoCancelledEmail,
  sendPlanRemovedByAdminEmail,
  sendRoadmapUpdateEmail,
  sendPlanFeedbackEmail,
  sendConcernReportAlert,
  sendCommunityJoinRequestEmail,
  sendCommunityJoinApprovedEmail,
  sendCommunityJoinDeclinedEmail,
} from "./email/send";
import { canAccessInternalTestRoute, notFound } from "./internalAccess";
import { nameToSlug, slugToName, validateInterestName } from "./interests";
import { ensureAppUserId } from "./profile";
import { generateResetToken, hashResetToken } from "./resetTokens";
import { isValidContactSubject } from "./lib/contact";
import { computeAge } from "./lib/publicProfile";
import {
  AGE_PREF_YEAR_OPTIONS,
  type ChumPrefsRow,
  DEFAULT_CHUM_PREFS,
  evaluateChumPreferences,
  METRIC_BASELINE,
  parsePrefOverrides,
  PREF_LEVELS,
  type PrefLevel,
  type PrefOverrides,
  resolveEffectiveHostPrefs,
  type UserMetricsMap,
} from "./lib/chumPreferences";
import { checkContactRateLimit } from "./lib/contactRateLimit";
import { validateCleanText } from "./lib/contentSafety";
import { sanitizeDescriptionHtml } from "./lib/sanitizeHtml";
import { verifyTurnstileToken } from "./lib/turnstile";
import {
  getDefaultPrefsJson,
  isValidKey,
  normalizeNotificationPrefs,
  validateAndMergeInput,
  VALID_KEYS,
} from "./lib/notificationPrefs";
import {
  MAX_AVATAR_BYTES,
  MAX_EVENT_BANNER_BYTES,
  MAX_ROADMAP_ATTACHMENT_BYTES,
  buildObjectKey,
  createUploadToken,
  validateMediaInit,
  verifyUploadToken,
} from "./media";
import {
  normalizeUsernameDisplay,
  normalizeUsernameForUniq,
  validateUsername,
} from "./username";

const app = new Hono<{ Bindings: Bindings }>();

const axiomIngest = async (
  env: Bindings,
  events: Array<Record<string, unknown>>,
) => {
  if (!env.AXIOM_TOKEN || !env.AXIOM_DATASET || events.length === 0) {
    return;
  }

  try {
    await fetch(
      `https://api.axiom.co/v1/datasets/${env.AXIOM_DATASET}/ingest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AXIOM_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(events),
      },
    );
  } catch {
    return;
  }
};

type ResolvedInterestsOk = { ok: true; slugs: string[] };
type ResolvedInterestsErr = {
  ok: false;
  error: { code: string; field?: string; message?: string };
};

async function resolveInterestSlugs(
  sql: ReturnType<typeof getSql>,
  userId: string,
  rawSlugs: string[],
  rawItems: Array<{ slug?: string; name?: string }> | null,
): Promise<ResolvedInterestsOk | ResolvedInterestsErr> {
  const nameBySlug = new Map<string, string>();
  if (Array.isArray(rawItems)) {
    for (const it of rawItems) {
      const slug = it?.slug != null ? nameToSlug(String(it.slug).trim()) : "";
      const name = it?.name != null ? String(it.name).trim() : "";
      if (slug && name) nameBySlug.set(slug.toLowerCase(), name);
    }
  }

  const normalized = rawSlugs
    .map((s) => nameToSlug(String(s).trim()))
    .filter((s) => s.length > 0);
  let finalSlugs = [...new Set(normalized)];

  for (const slug of finalSlugs) {
    const nameForValidation = nameBySlug.get(slug.toLowerCase()) ?? slugToName(slug);
    const v = validateInterestName(nameForValidation);
    if (!v.valid) {
      return { ok: false, error: { code: "INVALID_INPUT", message: v.error } };
    }
    const hobbyCheck = validateCleanText(nameForValidation, "hobby");
    if (!hobbyCheck.ok) {
      return {
        ok: false,
        error: { code: "INAPPROPRIATE_TEXT", field: "hobby", message: hobbyCheck.reason },
      };
    }
  }

  const existingRows = (await sql`
    SELECT id, name, slug, is_deleted, merged_into_interest_id
    FROM interests
    WHERE LOWER(slug) = ANY(${finalSlugs.map((s) => s.toLowerCase())})
  `) as { id: string; name: string; slug: string; is_deleted: boolean; merged_into_interest_id: string | null }[];
  const existingBySlug = new Map(existingRows.map((r) => [r.slug.toLowerCase(), r]));

  const mergeTargetIds = [...new Set(
    existingRows
      .filter((r) => r.is_deleted && r.merged_into_interest_id)
      .map((r) => r.merged_into_interest_id as string),
  )];
  const mergeTargetRows = mergeTargetIds.length > 0
    ? (await sql`
        SELECT id, slug, is_deleted FROM interests WHERE id = ANY(${mergeTargetIds})
      `) as { id: string; slug: string; is_deleted: boolean }[]
    : [];
  const mergeTargetById = new Map(mergeTargetRows.map((r) => [r.id, r]));

  const resolvedSlugs: string[] = [];
  for (const slug of finalSlugs) {
    const existing = existingBySlug.get(slug.toLowerCase());
    if (!existing) {
      const name = (nameBySlug.get(slug.toLowerCase()) ?? slugToName(slug)).trim().replace(/\s+/g, " ");
      try {
        await sql`
          INSERT INTO interests (name, category, slug, sort_order, is_seed, created_by_user_id)
          VALUES (${name}, '', ${slug}, 0, false, ${userId})
        `;
      } catch { /* duplicate race */ }
      resolvedSlugs.push(slug);
    } else if (!existing.is_deleted) {
      resolvedSlugs.push(existing.slug);
    } else if (existing.merged_into_interest_id) {
      const target = mergeTargetById.get(existing.merged_into_interest_id);
      if (target && !target.is_deleted) {
        resolvedSlugs.push(target.slug);
      } else {
        return {
          ok: false,
          error: { code: "INTEREST_DELETED", field: "hobby", message: "That hobby is not available. Please choose a different hobby." },
        };
      }
    } else {
      return {
        ok: false,
        error: { code: "INTEREST_DELETED", field: "hobby", message: "That hobby is not available. Please choose a different hobby." },
      };
    }
  }

  finalSlugs = [...new Set(resolvedSlugs)];
  return { ok: true, slugs: finalSlugs };
}

const DEV_USER_RETURN_COLUMNS = `
  id,
  email,
  name,
  created_at
`;

const CORS_ALLOWED_ORIGINS = new Set([
  "https://newchums.com",
  "https://www.newchums.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");

  if (origin && CORS_ALLOWED_ORIGINS.has(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    c.header("Access-Control-Max-Age", "86400");
  }

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
});

// ─── Suspension guard ────────────────────────────────────────────────────────
// Any authenticated request from a suspended user returns 403 immediately.
// Public routes (no Bearer token) are unaffected.
app.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    await next();
    return;
  }
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    await next();
    return;
  }
  try {
    const sql = getSql(c.env);
    const rows = (await sql`
      SELECT is_suspended, last_active_at FROM users WHERE email = ${payload.email} LIMIT 1
    `) as { is_suspended: boolean; last_active_at: string | null }[];
    if (rows[0]?.is_suspended === true) {
      return c.json(
        { ok: false, error: { code: "USER_SUSPENDED", message: "Your account has been suspended." } },
        403,
      );
    }
    // Throttled activity tracking, at most once per hour per user
    const lastActive = rows[0]?.last_active_at ? new Date(rows[0].last_active_at).getTime() : 0;
    if (Date.now() - lastActive > 3_600_000) {
      sql`UPDATE newchums.users SET last_active_at = NOW() WHERE email = ${payload.email}`.catch(() => {});
    }
  } catch {
    // If DB lookup fails, allow the request through, individual routes will fail safely.
  }
  await next();
});

app.get("/", (c) => c.text("NewChums API is live"));

// Public profile by handle (no auth). Returns age only, never DOB.
// TODO: If users.is_hidden_from_search is true, consider 404 or allow direct-link only.
// is_hidden_from_external_indexing returned for profile pages to emit noindex meta.
app.get("/public/users/:handle", async (c) => {
  const handleParam = c.req.param("handle")?.trim();
  if (!handleParam) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Profile not found" }, 404);
  }
  const handleNorm = handleParam.toLowerCase().trim();

  // Determine if the viewer is authenticated
  const authPayload = await requireAuth(c);
  const viewerAuthenticated = !!authPayload?.email;

  try {
    const sql = getSql(c.env);
    const userRows = (await sql`
      SELECT u.id, u.name, u.username, u.date_of_birth, u.gender, u.profile_theme,
        u.avatar_key, u.avatar_updated_at,
        COALESCE(u.is_hidden_age, false) AS is_hidden_age,
        COALESCE(u.is_hidden_from_external_indexing, false) AS is_hidden_from_external_indexing,
        COALESCE(u.is_hidden_chum_list, false) AS is_hidden_chum_list,
        COALESCE(u.is_hidden_shoutouts, false) AS is_hidden_shoutouts
      FROM newchums.users u
      WHERE u.username_norm = ${handleNorm}
        AND u.username IS NOT NULL
      LIMIT 1
    `) as Array<{
      id: string;
      name: string | null;
      username: string | null;
      date_of_birth: string | Date | null;
      gender: string | null;
      profile_theme: string | null;
      avatar_key: string | null;
      avatar_updated_at: string | Date | null;
      is_hidden_age: boolean;
      is_hidden_from_external_indexing: boolean;
      is_hidden_chum_list: boolean;
      is_hidden_shoutouts: boolean;
    }>;
    const user = userRows[0];
    if (!user) {
      return c.json({ ok: false, error: "NOT_FOUND", message: "Profile not found" }, 404);
    }
    const profileRows = (await sql`
      SELECT bio FROM user_profile WHERE user_id = ${user.id} LIMIT 1
    `) as Array<{ bio: string | null }>;
    const profile = profileRows[0];
    const interestRows = (await sql`
      SELECT i.name
      FROM user_interests ui
      JOIN interests i ON i.id = ui.interest_id
      WHERE ui.user_id = ${user.id}
      ORDER BY i.sort_order, i.name
    `) as { name: string }[];
    const dobStr = user.date_of_birth
      ? typeof user.date_of_birth === "string"
        ? user.date_of_birth
        : (user.date_of_birth as Date).toISOString().slice(0, 10)
      : null;
    const avatarKey = user.avatar_key ?? null;
    const avatarUpdatedAt = user.avatar_updated_at;
    const avatarUrl =
      avatarKey && c.env.MEDIA_BUCKET
        ? `/users/${user.id}/avatar?v=${avatarUpdatedAt ? new Date(avatarUpdatedAt as Date).getTime() : 0}`
        : null;
    const rawUsername = (user.username ?? "").trim().replace(/^@/, "");
    const handleStr = (user.username ?? "").trim();
    const publicGender =
      user.gender && user.gender !== "prefer_not_to_say" ? user.gender : null;

    // Logged-out viewers: username only, no real name, no age
    const displayName = viewerAuthenticated
      ? (user.name?.trim() || rawUsername || "NewChums user")
      : (rawUsername || "NewChums user");
    const age = viewerAuthenticated
      ? (user.is_hidden_age === true ? null : computeAge(dobStr))
      : null;

    return c.json({
      ok: true,
      user: {
        userId: user.id,
        displayName,
        handle: handleStr ? (handleStr.startsWith("@") ? handleStr : `@${handleStr}`) : null,
        age,
        gender: viewerAuthenticated ? publicGender : null,
        profile_theme: user.profile_theme ?? null,
        bio: profile?.bio ?? null,
        hobbies: interestRows.map((r) => r.name),
        avatarUrl,
        is_hidden_from_external_indexing: user.is_hidden_from_external_indexing ?? false,
        is_hidden_chum_list: user.is_hidden_chum_list ?? false,
        is_hidden_shoutouts: user.is_hidden_shoutouts ?? false,
      },
    });
  } catch (err) {
    console.error("[GET /public/users/:handle]", err);
    return c.json(
      { ok: false, error: "SERVER_ERROR", message: "Failed to fetch profile" },
      500,
    );
  }
});

/** GET /public/users/:handle/shoutouts
 *  Approved shout-outs for the recipient's public profile section.
 *  Auth is optional. If the recipient has hidden the section
 *  (`users.is_hidden_shoutouts = true`) and the viewer is not the recipient
 *  themselves, returns `{ ok: true, items: [], hidden: true }`. The owner
 *  always gets their items so the inline owner-only toggle on the public
 *  profile can render the dimmed "hidden from visitors" preview state. */
app.get("/public/users/:handle/shoutouts", async (c) => {
  const handleParam = c.req.param("handle")?.trim();
  if (!handleParam) {
    return c.json({ ok: false, error: "NOT_FOUND", message: "Profile not found" }, 404);
  }
  const handleNorm = handleParam.toLowerCase().trim();

  // Auth is optional but we use it to detect the profile owner so they can
  // see their own hidden section.
  const authPayload = await requireAuth(c);
  const viewerEmail = authPayload?.email && typeof authPayload.email === "string" ? authPayload.email : null;

  try {
    const sql = getSql(c.env);
    const userRows = (await sql`
      SELECT id, COALESCE(is_hidden_shoutouts, false) AS is_hidden_shoutouts
      FROM newchums.users
      WHERE username_norm = ${handleNorm}
        AND username IS NOT NULL
      LIMIT 1
    `) as Array<{ id: string; is_hidden_shoutouts: boolean }>;
    const target = userRows[0];
    if (!target) {
      return c.json({ ok: false, error: "NOT_FOUND", message: "Profile not found" }, 404);
    }

    let viewerUserId: string | null = null;
    if (viewerEmail) {
      try {
        viewerUserId = await ensureAppUserId(sql, viewerEmail, (authPayload as { name?: string | null }).name);
      } catch {
        viewerUserId = null;
      }
    }
    const isOwner = viewerUserId !== null && viewerUserId === target.id;

    if (target.is_hidden_shoutouts && !isOwner) {
      return c.json({ ok: true, items: [], hidden: true });
    }

    const rows = (await sql`
      SELECT
        s.id, s.message, s.created_at, s.reviewed_at,
        COALESCE(s.hidden_by_recipient, false) AS hidden_by_recipient,
        s.plan_id, e.title AS plan_title, e.starts_at AS plan_starts_at,
        s.sender_user_id, u.name AS sender_name, u.username AS sender_username
      FROM newchums.shoutouts s
      JOIN newchums.events e ON e.id = s.plan_id
      JOIN newchums.users u ON u.id = s.sender_user_id
      WHERE s.recipient_user_id = ${target.id} AND s.status = 'approved'
      ORDER BY COALESCE(s.reviewed_at, s.created_at) DESC
      LIMIT 100
    `) as Array<{
      id: string;
      message: string;
      created_at: string;
      reviewed_at: string | null;
      hidden_by_recipient: boolean;
      plan_id: string;
      plan_title: string;
      plan_starts_at: string;
      sender_user_id: string;
      sender_name: string | null;
      sender_username: string | null;
    }>;

    // Per-card visibility: non-owners only see rows the recipient has left
    // visible. Owners see everything so they can re-show rows they previously
    // hid; the per-item flag is surfaced to the client so it can render the
    // dimmed state and the toggle label.
    const visibleRows = isOwner ? rows : rows.filter((r) => !r.hidden_by_recipient);

    return c.json({
      ok: true,
      hidden: target.is_hidden_shoutouts,
      items: visibleRows.map((r) => ({
        id: r.id,
        message: r.message,
        receivedAt: r.reviewed_at ?? r.created_at,
        planId: r.plan_id,
        planTitle: r.plan_title,
        planStartsAt: r.plan_starts_at,
        hiddenByRecipient: r.hidden_by_recipient,
        sender: {
          userId: r.sender_user_id,
          displayName: r.sender_name?.trim() || (r.sender_username ? `@${r.sender_username.replace(/^@/, "")}` : "Someone"),
          username: r.sender_username,
        },
      })),
    });
  } catch (err) {
    console.error("[GET /public/users/:handle/shoutouts]", err);
    return c.json({ ok: false, error: "SERVER_ERROR", message: "Failed to fetch shout-outs" }, 500);
  }
});

/** PATCH /shoutouts/:id
 *  Per-shout-out visibility toggle. Only the recipient may flip their own
 *  `hidden_by_recipient` flag. Returns the new flag so the client can
 *  reconcile with the server after an optimistic UI update. */
app.patch("/shoutouts/:id", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const shoutoutId = c.req.param("id")?.trim();
  if (!shoutoutId) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "INVALID_JSON" }, 400);
  }
  // `hidden` is the only field this endpoint accepts. Anything else is
  // ignored so the surface stays tight.
  if (typeof body.hidden !== "boolean")
    return c.json({ ok: false, error: "VALIDATION", message: "`hidden` must be a boolean" }, 400);
  const hidden = body.hidden;

  try {
    const sql = getSql(c.env);
    const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

    const rows = (await sql`
      SELECT recipient_user_id FROM newchums.shoutouts WHERE id = ${shoutoutId} LIMIT 1
    `) as { recipient_user_id: string }[];
    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (rows[0].recipient_user_id !== userId)
      return c.json({ ok: false, error: "FORBIDDEN" }, 403);

    await sql`
      UPDATE newchums.shoutouts
      SET hidden_by_recipient = ${hidden},
          updated_at = NOW()
      WHERE id = ${shoutoutId}
    `;
    return c.json({ ok: true, hidden });
  } catch (err) {
    console.error("[PATCH /shoutouts/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ---- Attendance record (public) ----
app.get("/public/users/:userId/attendance-record", async (c) => {
  const targetUserId = c.req.param("userId")?.trim();
  if (!targetUserId) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

  const authPayload = await requireAuth(c);
  const viewerAuthenticated = !!authPayload?.email;

  try {
    const sql = getSql(c.env);
    const now = new Date().toISOString();
    const zeroRatio = { numerator: 0, denominator: 0 };

    // Plans attended: past non-canceled events where RSVP = 'going' and NOT the host.
    const attended = (await sql`
      SELECT COUNT(*)::int AS c
      FROM newchums.event_rsvps r
      JOIN newchums.events e ON e.id = r.event_id
      WHERE r.user_id = ${targetUserId}
        AND r.status = 'going'
        AND e.host_user_id != ${targetUserId}
        AND e.status != 'canceled'
        AND e.starts_at < ${now}
    `) as { c: number }[];

    // Plans hosted: past non-canceled events where user IS the host.
    const hosted = (await sql`
      SELECT COUNT(*)::int AS c
      FROM newchums.events e
      WHERE e.host_user_id = ${targetUserId}
        AND e.status != 'canceled'
        AND COALESCE(e.is_qa, false) = false
        AND e.starts_at < ${now}
    `) as { c: number }[];

    // Member since (for context)
    const memberSince = (await sql`
      SELECT created_at FROM newchums.users WHERE id = ${targetUserId} LIMIT 1
    `) as { created_at: string | Date }[];

    // ─── Local recognition badges (precomputed hourly by cron) ─────────────────
    let badges: { type: string; tier: string; count: number; rank: number; totalInArea: number }[] = [];
    try {
      badges = (await sql`
        SELECT badge_type AS type, tier, count, rank, total_in_area AS "totalInArea"
        FROM newchums.user_badges
        WHERE user_id = ${targetUserId}
      `) as typeof badges;
    } catch { /* table may not exist yet before migration 070 runs */ }

    // Reliability metrics are only returned for authenticated viewers
    if (!viewerAuthenticated) {
      return c.json({
        ok: true,
        record: {
          goingFollowThrough: zeroRatio,
          followThrough: zeroRatio,
          confirmationRate: zeroRatio,
          plansAttended: attended[0]?.c ?? 0,
          plansHosted: hosted[0]?.c ?? 0,
          hostCompletion: zeroRatio,
          memberSince: memberSince[0]?.created_at ?? null,
          reliabilityHidden: true,
          badges,
        },
      });
    }

    // Computes both follow-through metrics from the same base scan:
    // - followed_through: still "going" AND no attendance issues (measures actually showing up)
    // - going_kept: still "going" regardless of attendance issues (measures commitment honoured)
    // Includes both hosted and attended plans — the host committed to being there too.
    const followThrough = (await sql`
      SELECT
        COUNT(*) FILTER (
          WHERE r.status = 'going'
          AND NOT EXISTS (
            SELECT 1 FROM newchums.attendance_issues ai
            WHERE ai.plan_id = e.id
              AND ai.reported_user_id = r.user_id
              AND ai.issue_type IN ('no_show', 'very_late')
              AND COALESCE(ai.status, 'active') != 'dismissed'
          )
        )::int AS followed_through,
        COUNT(*) FILTER (WHERE r.status = 'going')::int AS going_kept,
        COUNT(*)::int AS total_committed
      FROM newchums.event_rsvps r
      JOIN newchums.events e ON e.id = r.event_id
      WHERE r.user_id = ${targetUserId}
        AND r.committed_at IS NOT NULL
        AND e.status != 'canceled'
        AND e.starts_at < ${now}
    `) as { followed_through: number; going_kept: number; total_committed: number }[];

    const confirmation = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE ec.status IN ('confirmed', 'declined'))::int AS responded,
        COUNT(*)::int AS total_requested
      FROM newchums.event_confirmations ec
      JOIN newchums.events e ON e.id = ec.event_id
      WHERE ec.user_id = ${targetUserId}
        AND e.starts_at < ${now}
    `) as { responded: number; total_requested: number }[];

    const hostCompletion = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE e.status != 'canceled')::int AS completed,
        COUNT(*)::int AS total_hosted
      FROM newchums.events e
      WHERE e.host_user_id = ${targetUserId}
        AND e.status IN ('published', 'canceled')
        AND COALESCE(e.is_qa, false) = false
        AND e.starts_at < ${now}
        AND EXISTS (
          SELECT 1 FROM newchums.event_rsvps er
          WHERE er.event_id = e.id
            AND er.user_id != e.host_user_id
            AND er.committed_at IS NOT NULL
        )
        AND COALESCE(e.cancellation_reason, '') != 'no_attendees'
    `) as { completed: number; total_hosted: number }[];

    return c.json({
      ok: true,
      record: {
        goingFollowThrough: {
          numerator: followThrough[0]?.going_kept ?? 0,
          denominator: followThrough[0]?.total_committed ?? 0,
        },
        followThrough: {
          numerator: followThrough[0]?.followed_through ?? 0,
          denominator: followThrough[0]?.total_committed ?? 0,
        },
        confirmationRate: {
          numerator: confirmation[0]?.responded ?? 0,
          denominator: confirmation[0]?.total_requested ?? 0,
        },
        plansAttended: attended[0]?.c ?? 0,
        plansHosted: hosted[0]?.c ?? 0,
        hostCompletion: {
          numerator: hostCompletion[0]?.completed ?? 0,
          denominator: hostCompletion[0]?.total_hosted ?? 0,
        },
        memberSince: memberSince[0]?.created_at ?? null,
        badges,
      },
    });
  } catch (err) {
    console.error("[GET /public/users/:userId/attendance-record]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.get("/health", (c) =>
  c.json({ ok: true, service: "api", ts: new Date().toISOString() }),
);
app.get("/health/env", (c) => {
  if (!canAccessInternalTestRoute(c)) {
    return notFound();
  }
  const env = c.env;
  return c.json({
    ok: true,
    bindings: {
      DATABASE_URL: !!env.DATABASE_URL,
      NEXTAUTH_SECRET: !!env.NEXTAUTH_SECRET,
      WEB_BASE_URL: !!env.WEB_BASE_URL,
      MEDIA_BUCKET: !!env.MEDIA_BUCKET,
    },
    app_env: env.APP_ENV ?? undefined,
  });
});
app.get("/health/db", async (c) => {
  if (!canAccessInternalTestRoute(c)) {
    return notFound();
  }

  try {
    const startedAt = Date.now();
    const sql = getSql(c.env);
    await sql`select 1 as ok`;
    return c.json({
      ok: true,
      service: "api",
      ts: new Date().toISOString(),
      latency_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error(err);
    return c.json(
      {
        ok: false,
        service: "api",
        ts: new Date().toISOString(),
      },
      500,
    );
  }
});
app.get("/__routes", (c) => {
  if (!canAccessInternalTestRoute(c)) {
    return notFound();
  }
  const routeData = inspectRoutes(app);
  const routes = routeData.map((r) => ({
    method: r.method,
    path: r.path,
    name: r.name,
    isMiddleware: r.isMiddleware,
  }));
  return c.json({
    ok: true,
    routes: routes.sort((a, b) =>
      a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    ),
    app_env: c.env.APP_ENV,
  });
});

app.get("/__sentry-test", (c) => {
  if (!canAccessInternalTestRoute(c)) {
    return notFound();
  }

  throw new Error("API Sentry test error");
});
app.get("/__log-test", async (c) => {
  if (!canAccessInternalTestRoute(c)) {
    return notFound();
  }

  await axiomIngest(c.env, [{ message: "axiom test log", level: "info" }]);
  return c.json({ ok: true });
});

app.onError((err, c) => {
  console.error(err);
  Sentry.captureException(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

app.get("/db/ping", async (c) => {
  try {
    const sql = getSql(c.env);
    const rows = await sql<{ now: string }[]>`select now() as now`;
    const now = rows[0]?.now ?? null;
    return c.json({ ok: true, now });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: message, hint: DATABASE_URL_HINT }, 500);
  }
});

app.get("/db/postgis", async (c) => {
  try {
    const sql = getSql(c.env);
    const rows = await sql<{ meters: number | string }[]>`
      select
        st_distance(
          st_makepoint(0, 0)::geography,
          st_makepoint(0, 1)::geography
        ) as meters
    `;
    const rawMeters = rows[0]?.meters ?? 0;
    const meters =
      typeof rawMeters === "number" ? rawMeters : Number.parseFloat(rawMeters);
    return c.json({ ok: true, meters });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: message, hint: DATABASE_URL_HINT }, 500);
  }
});

// NOTE: Legacy GET /events (unqualified "events" table with creator_id) removed.
// Use GET /events/explore or GET /events/mine for event listing. See migration 024 (newchums.events).

// ---- Auth & user routes (migrated from web) ----

app.post("/auth/signup", async (c) => {
  try {
    const body = await c.req.json<{
      email?: string;
      password?: string;
      name?: string;
      username?: string;
      date_of_birth?: string;
      interest_slugs?: string[];
      interest_items?: Array<{ slug?: string; name?: string }>;
      home_city?: string;
      home_lat?: number;
      home_lng?: number;
      travel_radius_km?: number;
      accepted_terms_version?: string;
      accepted_privacy_version?: string;
    }>();

    const normalizedEmail = body.email?.trim().toLowerCase();
    const normalizedName = body.name?.trim() || null;

    const usernameValidation = validateUsername(body.username ?? "");
    if (!usernameValidation.valid) {
      return c.json({ ok: false, error: usernameValidation.error }, 400);
    }
    const signupContentCheck = validateCleanText(body.username ?? "", "username");
    if (!signupContentCheck.ok) {
      return c.json(
        { ok: false, error: "INAPPROPRIATE_TEXT", code: "INAPPROPRIATE_TEXT", field: "handle" },
        400,
      );
    }

    const trimmedDob = body.date_of_birth?.trim() ?? "";
    if (!trimmedDob) {
      return c.json({ ok: false, error: "REQUIRED", code: "REQUIRED" }, 400);
    }
    const parts = parseDateOnly(trimmedDob);
    if (!parts) {
      return c.json(
        { ok: false, error: "INVALID_DATE", code: "INVALID_DATE" },
        400,
      );
    }
    const today = new Date();
    const birth = new Date(parts.y, parts.m - 1, parts.d);
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    if (birth > todayMidnight) {
      return c.json(
        { ok: false, error: "FUTURE_DATE", code: "FUTURE_DATE" },
        400,
      );
    }
    if (!isAtLeast18(trimmedDob)) {
      return c.json(
        {
          ok: false,
          error: "UNDERAGE",
          code: "UNDERAGE",
          message: "NewChums is currently available to people 18 and older.",
        },
        400,
      );
    }
    const parsedDob = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;

    const usernameDisplay = normalizeUsernameDisplay(body.username!);
    const usernameNorm = normalizeUsernameForUniq(body.username!);

    if (!normalizedEmail || !body.password || body.password.length < 8) {
      return c.json({ ok: false, error: "INVALID_INPUT" }, 400);
    }

    const sql = getSql(c.env);
    const existingEmail = (await sql`
      SELECT id, is_suspended FROM users WHERE email = ${normalizedEmail} LIMIT 1
    `) as { id: string; is_suspended: boolean }[];
    if (existingEmail.length > 0) {
      if (existingEmail[0].is_suspended) {
        return c.json({ ok: false, error: "EMAIL_SUSPENDED", code: "EMAIL_SUSPENDED" }, 409);
      }
      return c.json({ ok: false, error: "EMAIL_EXISTS" }, 409);
    }

    const existingUsername = (await sql`
      SELECT id FROM users WHERE username_norm = ${usernameNorm} LIMIT 1
    `) as { id: string }[];
    if (existingUsername.length > 0) {
      return c.json({ ok: false, error: "USERNAME_TAKEN" }, 409);
    }

    const passwordHash = hashSync(body.password, 10);
    const acceptedTerms = body.accepted_terms_version?.trim() || null;
    const acceptedPrivacy = body.accepted_privacy_version?.trim() || null;
    const acceptedLegalAt = acceptedTerms || acceptedPrivacy ? new Date().toISOString() : null;
    const inserted = (await sql`
      INSERT INTO users (email, name, username, username_norm, password_hash, date_of_birth, email_verified_at,
                         accepted_terms_version, accepted_privacy_version, accepted_legal_at)
      VALUES (${normalizedEmail}, ${normalizedName}, ${usernameDisplay}, ${usernameNorm}, ${passwordHash}, ${parsedDob}, NULL,
              ${acceptedTerms}, ${acceptedPrivacy}, ${acceptedLegalAt})
      RETURNING id
    `) as { id: string }[];
    const newUserId = inserted[0]?.id;
    if (newUserId) {
      const defaultPrefsJson = getDefaultPrefsJson();
      const hasLocation =
        body.home_lat != null &&
        body.home_lng != null &&
        Number.isFinite(body.home_lat) &&
        Number.isFinite(body.home_lng);
      const profileCity = hasLocation ? (body.home_city?.trim() || null) : null;
      const profileLat = hasLocation ? body.home_lat! : null;
      const profileLng = hasLocation ? body.home_lng! : null;
      const profileRadius =
        body.travel_radius_km != null && Number.isFinite(body.travel_radius_km)
          ? body.travel_radius_km
          : null;

      if (hasLocation) {
        await sql`
          INSERT INTO user_profile (user_id, home_city, home_lat, home_lng, home_location, travel_radius_km, email_chat_digest, email_new_events, bio, notification_prefs)
          VALUES (${newUserId}, ${profileCity}, ${profileLat}, ${profileLng}, ST_SetSRID(ST_MakePoint(${profileLng}, ${profileLat}), 4326)::geography, ${profileRadius}, true, true, NULL, ${defaultPrefsJson}::jsonb)
        `;
      } else {
        await sql`
          INSERT INTO user_profile (user_id, home_city, home_lat, home_lng, home_location, travel_radius_km, email_chat_digest, email_new_events, bio, notification_prefs)
          VALUES (${newUserId}, NULL, NULL, NULL, NULL, ${profileRadius}, true, true, NULL, ${defaultPrefsJson}::jsonb)
        `;
      }

      if (Array.isArray(body.interest_slugs) && body.interest_slugs.length > 0) {
        const interestResult = await resolveInterestSlugs(
          sql,
          newUserId,
          body.interest_slugs,
          Array.isArray(body.interest_items) ? body.interest_items : null,
        );
        if (interestResult.ok && interestResult.slugs.length > 0) {
          await sql`
            INSERT INTO user_interests (user_id, interest_id)
            SELECT ${newUserId}, i.id FROM interests i
            WHERE i.slug = ANY(${interestResult.slugs}) AND i.is_deleted = false
          `;
        }
      }

      // Adopt orphaned guest records (RSVPs, invites, alt-times, confirmations) for this email
      try {
        await sql`UPDATE newchums.event_rsvps SET user_id = ${newUserId}, guest_email = NULL, guest_name = NULL WHERE guest_email = ${normalizedEmail} AND user_id IS NULL`;
        await sql`UPDATE newchums.event_invites SET user_id = ${newUserId} WHERE LOWER(email) = ${normalizedEmail} AND user_id IS NULL AND NOT EXISTS (SELECT 1 FROM newchums.event_invites i2 WHERE i2.event_id = event_invites.event_id AND i2.user_id = ${newUserId})`;
        await sql`UPDATE newchums.event_alt_times SET user_id = ${newUserId}, guest_email = NULL WHERE guest_email = ${normalizedEmail} AND user_id IS NULL`;
        await sql`UPDATE newchums.event_confirmations SET user_id = ${newUserId}, guest_email = NULL WHERE guest_email = ${normalizedEmail} AND user_id IS NULL AND NOT EXISTS (SELECT 1 FROM newchums.event_confirmations ec2 WHERE ec2.event_id = event_confirmations.event_id AND ec2.user_id = ${newUserId})`;
      } catch { /* non-fatal */ }
    }
    return c.json({ ok: true }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isMissingColumn =
      msg.includes('column "date_of_birth"') ||
      msg.includes('column "username_norm"') ||
      msg.includes('column "username"');
    if (isMissingColumn) {
      console.error(
        "Signup error: missing column. Apply migrations 003, 004, 005.",
        err,
      );
      return c.json(
        {
          ok: false,
          error: "SERVER_ERROR",
          ...(c.env.APP_ENV !== "production" ? { debug: msg } : {}),
        },
        500,
      );
    }
    const isEmailUniqueViolation =
      msg.includes("users_email_key") ||
      (msg.includes("email") &&
        (msg.includes("duplicate key value") ||
          msg.includes("unique constraint")));
    if (isEmailUniqueViolation) {
      return c.json({ ok: false, error: "EMAIL_EXISTS" }, 409);
    }
    const isUsernameUniqueViolation =
      msg.includes("idx_users_username_norm") ||
      msg.includes("users_username_norm") ||
      (msg.includes("username_norm") &&
        (msg.includes("duplicate key value") ||
          msg.includes("unique constraint")));
    if (isUsernameUniqueViolation) {
      return c.json({ ok: false, error: "USERNAME_TAKEN" }, 409);
    }
    console.error("Signup error:", err);
    return c.json(
      {
        ok: false,
        error: "SERVER_ERROR",
        ...(c.env.APP_ENV !== "production" ? { debug: msg } : {}),
      },
      500,
    );
  }
});

const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

app.post("/auth/password-reset/request", async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const normalizedEmail = body.email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return c.json({ ok: false, error: "EMAIL_REQUIRED" }, 400);
  }

  const sql = getSql(c.env);
  const users = (await sql`
    SELECT id, password_hash, name FROM users WHERE email = ${normalizedEmail} LIMIT 1
  `) as { id: string; password_hash: string | null; name: string | null }[];
  const user = users[0];

  if (!user) {
    return c.json({ ok: false, error: "EMAIL_NOT_FOUND" }, 404);
  }
  if (!user.password_hash) {
    return c.json({ ok: false, error: "OAUTH_ACCOUNT", message: "This account uses Google sign-in. We cannot reset its password. Please sign in with Google instead." }, 409);
  }

  await sql`
    UPDATE password_reset_tokens SET used_at = NOW()
    WHERE user_id = ${user.id} AND used_at IS NULL
  `;

  const rawToken = generateResetToken();
  const tokenHash = await hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MS);
  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${tokenHash}, ${expiresAt})
  `;

  const resetUrl = `${c.env.WEB_BASE_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await sendPasswordResetEmail(c.env, {
    to: normalizedEmail,
    name: user.name ?? undefined,
    resetUrl,
  });

  return c.json({ ok: true });
});

app.post("/auth/password-reset/confirm", async (c) => {
  const body = await c.req.json<{ token?: string; password?: string }>();
  const tokenRaw = body.token?.trim();
  const password = body.password?.trim();
  if (!tokenRaw) {
    return c.json({ ok: false, error: "INVALID_INPUT", message: "Token is required." }, 400);
  }
  if (!password || password.length < 8) {
    return c.json(
      { ok: false, error: "INVALID_INPUT", message: "Password must be at least 8 characters." },
      400
    );
  }

  const tokenHash = await hashResetToken(tokenRaw);
  const sql = getSql(c.env);
  const tokens = (await sql`
    SELECT id, user_id
    FROM password_reset_tokens
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `) as { id: string; user_id: string }[];
  const record = tokens[0];
  if (!record) {
    return c.json(
      { ok: false, error: "INVALID_OR_EXPIRED", message: "Reset link is invalid or has expired." },
      400
    );
  }

  const passwordHash = hashSync(password, 10);
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${record.user_id}`;
  await sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${record.id}`;
  await sql`
    UPDATE password_reset_tokens SET used_at = NOW()
    WHERE user_id = ${record.user_id} AND used_at IS NULL AND id != ${record.id}
  `;
  return c.json({ ok: true });
});

// ---- Record legal acceptance (Google OAuth users) ----
app.post("/auth/record-legal-acceptance", async (c) => {
  try {
    const payload = await requireAuth(c);
    if (!payload?.email || typeof payload.email !== "string") {
      return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
    }

    const body = await c.req.json<{
      accepted_terms_version?: string;
      accepted_privacy_version?: string;
    }>();
    const termsV = body.accepted_terms_version?.trim() || null;
    const privacyV = body.accepted_privacy_version?.trim() || null;
    if (!termsV && !privacyV) {
      return c.json({ ok: false, error: "NO_VERSIONS" }, 400);
    }

    const sql = getSql(c.env);
    const normalized = payload.email.trim().toLowerCase();
    await sql`
      UPDATE users
      SET accepted_terms_version  = COALESCE(accepted_terms_version, ${termsV}),
          accepted_privacy_version = COALESCE(accepted_privacy_version, ${privacyV}),
          accepted_legal_at        = COALESCE(accepted_legal_at, NOW())
      WHERE email = ${normalized}
        AND accepted_legal_at IS NULL
    `;
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ---- Email verification (Credentials only) ----
const VERIFY_EXPIRY_MS = 24 * 60 * 60 * 1000;

app.post("/auth/email-verify/request", async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const normalizedEmail = body.email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return c.json({ ok: true, message: "If an account exists, a verification email was sent." });
  }

  const sql = getSql(c.env);
  const users = (await sql`
    SELECT id, email_verified_at, password_hash
    FROM users
    WHERE email = ${normalizedEmail}
    LIMIT 1
  `) as { id: string; email_verified_at: string | null; password_hash: string | null }[];

  if (users.length === 0) {
    return c.json({ ok: true, message: "If an account exists, a verification email was sent." });
  }

  const user = users[0];
  if (user.email_verified_at) {
    return c.json({ ok: true, message: "If an account exists, a verification email was sent." });
  }

  await sql`
    UPDATE email_verification_tokens SET used_at = NOW()
    WHERE user_id = ${user.id} AND used_at IS NULL
  `;

  const rawToken = generateResetToken();
  const tokenHash = await hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFY_EXPIRY_MS);
  await sql`
    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${tokenHash}, ${expiresAt})
  `;

  const verifyUrl = `${c.env.WEB_BASE_URL}/auth/verify?email=${encodeURIComponent(normalizedEmail)}&token=${encodeURIComponent(rawToken)}`;
  const nameRows = (await sql`SELECT name FROM users WHERE id = ${user.id} LIMIT 1`) as { name: string | null }[];
  const name = nameRows[0]?.name ?? null;
  await sendVerificationEmail(c.env, {
    to: normalizedEmail,
    name: name ?? undefined,
    verifyUrl,
  });

  return c.json({ ok: true, message: "If an account exists, a verification email was sent." });
});

app.post("/auth/email-verify/confirm", async (c) => {
  const body = await c.req.json<{ email?: string; token?: string }>();
  const normalizedEmail = body.email?.trim().toLowerCase();
  const tokenRaw = body.token?.trim();
  if (!normalizedEmail || !tokenRaw) {
    return c.json({ ok: false, error: "INVALID_INPUT" }, 400);
  }

  const tokenHash = await hashResetToken(tokenRaw);
  const sql = getSql(c.env);
  const users = (await sql`
    SELECT id FROM users WHERE email = ${normalizedEmail} LIMIT 1
  `) as { id: string }[];
  if (users.length === 0) {
    return c.json({ ok: false, error: "INVALID_OR_EXPIRED" }, 400);
  }

  const tokens = (await sql`
    SELECT id
    FROM email_verification_tokens
    WHERE user_id = ${users[0].id}
      AND token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `) as { id: string }[];

  if (tokens.length === 0) {
    return c.json({ ok: false, error: "INVALID_OR_EXPIRED" }, 400);
  }

  await sql`UPDATE users SET email_verified_at = NOW() WHERE id = ${users[0].id}`;
  await sql`UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ${tokens[0].id}`;
  return c.json({ ok: true });
});

app.get("/auth/email-verify/status", async (c) => {
  const email = c.req.query("email")?.trim().toLowerCase();
  if (!email) {
    return c.json({ verified: false, exists: false });
  }

  const sql = getSql(c.env);
  const rows = (await sql`
    SELECT email_verified_at FROM users WHERE email = ${email} LIMIT 1
  `) as { email_verified_at: string | null }[];
  if (rows.length === 0) {
    return c.json({ verified: false, exists: false });
  }
  return c.json({ verified: !!rows[0].email_verified_at, exists: true });
});

app.post("/auth/email-verify/mark-oauth", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const provider = (payload as { provider?: string }).provider;
  if (provider !== "google") {
    return c.json({ ok: true });
  }

  const sql = getSql(c.env);
  const normalized = payload.email.trim().toLowerCase();
  await sql`
    UPDATE users
    SET email_verified_at = COALESCE(email_verified_at, NOW())
    WHERE email = ${normalized} AND email_verified_at IS NULL
  `;
  return c.json({ ok: true });
});

// ---- Email change ----
const EMAIL_CHANGE_EXPIRY_MS = 60 * 60 * 1000; // 60 min
const EMAIL_CHANGE_RATE_LIMIT_PER_HOUR = 3;

app.post("/account/email-change/request", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const body = await c.req.json<{ newEmail?: string }>();
  const newEmailRaw = body.newEmail?.trim().toLowerCase() ?? "";
  if (!newEmailRaw) {
    return c.json(
      { ok: false, error: "INVALID_INPUT", message: "New email is required." },
      400
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmailRaw)) {
    return c.json(
      { ok: false, error: "INVALID_INPUT", message: "Please enter a valid email address." },
      400
    );
  }

  const currentEmail = payload.email.trim().toLowerCase();
  if (newEmailRaw === currentEmail) {
    return c.json(
      { ok: false, error: "SAME_EMAIL", message: "New email is the same as your current email." },
      400
    );
  }

  const sql = getSql(c.env);
  const appUserId = await ensureAppUserId(
    sql,
    currentEmail,
    (payload as { name?: string | null }).name,
  );

  const existingNew = (await sql`
    SELECT id FROM newchums.users WHERE email = ${newEmailRaw} LIMIT 1
  `) as { id: string }[];
  if (existingNew.length > 0) {
    return c.json(
      { ok: false, error: "EMAIL_IN_USE", message: "This email is already in use by another account." },
      409
    );
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = (await sql`
    SELECT COUNT(*)::int as c
    FROM newchums.email_change_requests
    WHERE user_id = ${appUserId} AND created_at > ${oneHourAgo}
  `) as { c: number }[];
  if (recentCount[0]?.c >= EMAIL_CHANGE_RATE_LIMIT_PER_HOUR) {
    return c.json(
      { ok: false, error: "RATE_LIMIT", message: "Too many requests. Please try again later." },
      429
    );
  }

  await sql`
    UPDATE newchums.email_change_requests
    SET consumed_at = NOW()
    WHERE user_id = ${appUserId} AND consumed_at IS NULL
  `;

  const rawToken = generateResetToken();
  const tokenHash = await hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_EXPIRY_MS);
  const requestIp = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  const inserted = (await sql`
    INSERT INTO newchums.email_change_requests
      (user_id, new_email, token_hash, expires_at, request_ip, user_agent)
    VALUES (${appUserId}, ${newEmailRaw}, ${tokenHash}, ${expiresAt}, ${requestIp}, ${userAgent})
    RETURNING id
  `) as { id: string }[];

  const requestId = inserted[0]?.id;
  if (!requestId) {
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }

  const confirmUrl = `${c.env.WEB_BASE_URL}/auth/email-change/confirm?token=${encodeURIComponent(rawToken)}&rid=${encodeURIComponent(requestId)}`;

  const userName = (await sql`
    SELECT name FROM newchums.users WHERE id = ${appUserId} LIMIT 1
  `) as { name: string | null }[];
  const name = userName[0]?.name ?? undefined;

  try {
    await sendEmailChangeConfirmEmail(c.env, {
      to: newEmailRaw,
      name,
      confirmUrl,
    });
    await sendEmailChangeNotifyOldEmail(c.env, {
      to: currentEmail,
      name,
      newEmail: newEmailRaw,
    });
  } catch (err) {
    console.error("[POST /account/email-change/request] send failed", err);
    return c.json({ ok: false, error: "EMAIL_SEND_FAILED", message: "Failed to send confirmation email." }, 500);
  }

  try {
    await axiomIngest(c.env, [
      {
        message: "email_change_requested",
        userId: appUserId,
        newEmailHash: "**", // never log email
        requestId,
      },
    ]);
  } catch {
    /* ignore */
  }

  return c.json({ ok: true, message: "Check your new email to confirm the change." });
});

app.post("/account/email-change/confirm", async (c) => {
  const body = await c.req.json<{ token?: string; rid?: string }>();
  const tokenRaw = (body.token ?? "").trim();
  const rid = (body.rid ?? "").trim();
  if (!tokenRaw || !rid) {
    return c.json(
      { ok: false, error: "INVALID_INPUT", message: "Token and request ID are required." },
      400
    );
  }

  const tokenHash = await hashResetToken(tokenRaw);
  const sql = getSql(c.env);

  const requests = (await sql`
    SELECT id, user_id, new_email
    FROM newchums.email_change_requests
    WHERE id = ${rid}
      AND token_hash = ${tokenHash}
      AND consumed_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `) as { id: string; user_id: string; new_email: string }[];

  const req = requests[0];
  if (!req) {
    return c.json(
      { ok: false, error: "INVALID_OR_EXPIRED", message: "This link is invalid or has expired." },
      400
    );
  }

  const stillAvailable = (await sql`
    SELECT id FROM newchums.users WHERE email = ${req.new_email} LIMIT 1
  `) as { id: string }[];
  if (stillAvailable.length > 0) {
    return c.json(
      { ok: false, error: "EMAIL_IN_USE", message: "This email is now in use by another account." },
      409
    );
  }

  const oldUser = (await sql`
    SELECT email, name FROM newchums.users WHERE id = ${req.user_id} LIMIT 1
  `) as { email: string; name: string | null }[];
  const oldEmail = oldUser[0]?.email ?? null;
  const name = oldUser[0]?.name ?? undefined;

  await sql`UPDATE newchums.users SET email = ${req.new_email} WHERE id = ${req.user_id}`;
  await sql`UPDATE newchums.email_change_requests SET consumed_at = NOW() WHERE id = ${req.id}`;

  try {
    await sendEmailChangeSuccessEmail(c.env, { to: req.new_email, name });
  } catch (err) {
    console.error("[POST /account/email-change/confirm] success email failed", err);
  }

  try {
    await axiomIngest(c.env, [
      {
        message: "email_change_confirmed",
        userId: req.user_id,
        requestId: req.id,
      },
    ]);
  } catch {
    /* ignore */
  }

  return c.json({
    ok: true,
    redirectTo: `${c.env.WEB_BASE_URL}/login?emailChanged=1`,
    message: "Your email has been updated. Please sign in with your new email.",
  });
});

app.post("/account/password-change", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>();
  const currentPassword = body.currentPassword?.trim() ?? "";
  const newPassword = body.newPassword?.trim() ?? "";

  if (!currentPassword) {
    return c.json(
      { ok: false, error: "INVALID_INPUT", code: "INVALID_INPUT", message: "Current password is required." },
      400
    );
  }
  if (!newPassword) {
    return c.json(
      { ok: false, error: "WEAK_PASSWORD", code: "WEAK_PASSWORD", message: "New password is required." },
      400
    );
  }

  if (newPassword.length < 8) {
    return c.json(
      { ok: false, error: "WEAK_PASSWORD", code: "WEAK_PASSWORD", message: "Use at least 8 characters." },
      400
    );
  }
  if (newPassword.length > 72) {
    return c.json(
      { ok: false, error: "WEAK_PASSWORD", code: "WEAK_PASSWORD", message: "Password must be 72 characters or less." },
      400
    );
  }

  const sql = getSql(c.env);
  const appUserId = await ensureAppUserId(
    sql,
    payload.email,
    (payload as { name?: string | null }).name,
  );

  const userRows = (await sql`
    SELECT password_hash FROM newchums.users WHERE id = ${appUserId} LIMIT 1
  `) as { password_hash: string | null }[];

  const user = userRows[0];
  if (!user) {
    return c.json({ ok: false, error: "USER_NOT_FOUND" }, 404);
  }

  if (!user.password_hash) {
    return c.json(
      { ok: false, error: "OAUTH_ACCOUNT", code: "OAUTH_ACCOUNT", message: "This account signs in with Google. Password changes aren't available." },
      409
    );
  }

  if (!compareSync(currentPassword, user.password_hash)) {
    return c.json(
      { ok: false, error: "INVALID_PASSWORD", code: "INVALID_PASSWORD", message: "Current password is incorrect." },
      400
    );
  }

  const passwordHash = hashSync(newPassword, 10);
  await sql`UPDATE newchums.users SET password_hash = ${passwordHash} WHERE id = ${appUserId}`;

  return c.json({ ok: true });
});

app.delete("/account", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const sql = getSql(c.env);
  const appUserId = await ensureAppUserId(
    sql,
    payload.email,
    (payload as { name?: string | null }).name,
  );

  const userRows = (await sql`
    SELECT password_hash FROM newchums.users WHERE id = ${appUserId} LIMIT 1
  `) as { password_hash: string | null }[];
  const user = userRows[0];
  if (!user) {
    return c.json({ ok: false, error: "USER_NOT_FOUND" }, 404);
  }

  const hasPassword = user.password_hash != null && user.password_hash.length > 0;
  if (hasPassword) {
    let body: { password?: string } = {};
    try {
      const raw = await c.req.json();
      if (raw && typeof raw === "object") body = raw as { password?: string };
    } catch {
      /* empty body allowed for OAuth; credentials users need password */
    }
    const password = body?.password?.trim() ?? "";
    if (!password) {
      return c.json(
        { ok: false, error: "INVALID_INPUT", code: "PASSWORD_REQUIRED", message: "Password is required." },
        400,
      );
    }
    const match = compareSync(password, user.password_hash);
    if (!match) {
      return c.json(
        { ok: false, error: "INVALID_PASSWORD", code: "INVALID_PASSWORD", message: "Incorrect password." },
        400,
      );
    }
  }

  try {
    const txQueries = [
      sql`DELETE FROM user_interests WHERE user_id = ${appUserId}`,
      sql`DELETE FROM user_profile WHERE user_id = ${appUserId}`,
      sql`DELETE FROM newchums.users WHERE id = ${appUserId}`,
    ];
    await sql.transaction(txQueries);
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /account] Transaction error:", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.get("/interests", async (c) => {
  try {
    const sql = getSql(c.env);
    const q = c.req.query("q")?.trim();
    const likePattern = q ? `%${q.toLowerCase()}%` : null;
    const rows = likePattern
      ? ((await sql`
          SELECT id, name, category, slug
          FROM interests
          WHERE LOWER(name) LIKE ${likePattern}
            AND (is_deleted IS NULL OR is_deleted = false)
          ORDER BY name ASC
          LIMIT 20
        `) as { id: string; name: string; category: string | null; slug: string }[])
      : ((await sql`
          SELECT id, name, category, slug, sort_order
          FROM interests
          WHERE is_deleted IS NULL OR is_deleted = false
          ORDER BY sort_order ASC, name ASC
        `) as {
          id: string;
          name: string;
          category: string | null;
          slug: string;
          sort_order: number;
        }[]);
    return c.json({
      ok: true,
      interests: rows.map((r) =>
        "sort_order" in r
          ? { id: r.id, name: r.name, category: r.category, slug: r.slug, sort_order: r.sort_order }
          : { id: r.id, name: r.name, category: r.category, slug: r.slug },
      ),
    });
  } catch (err) {
    console.error(err);
    return c.json(
      {
        ok: false,
        error: { code: "SERVER_ERROR", message: "Failed to fetch interests" },
      },
      500,
    );
  }
});

// Simple email format check (RFC 5322-ish, permissive)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/contact", async (c) => {
  let body: {
    name?: string;
    email?: string;
    message?: string;
    website?: string;
    subject?: string;
    turnstileToken?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { ok: false, error: "INVALID_INPUT", message: "Invalid JSON body" },
      400
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const website = typeof body.website === "string" ? body.website.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "";

  // Honeypot: if website is non-empty, pretend success without sending
  if (website !== "") {
    return c.json({ ok: true });
  }

  // Validation
  if (!isValidContactSubject(subject)) {
    return c.json(
      { ok: false, error: "INVALID_INPUT", message: "Please select a subject" },
      400
    );
  }
  if (name.length < 1 || name.length > 80) {
    return c.json(
      { ok: false, error: "INVALID_INPUT", message: "Name must be 1–80 characters" },
      400
    );
  }
  if (!EMAIL_REGEX.test(email)) {
    return c.json(
      { ok: false, error: "INVALID_INPUT", message: "Please enter a valid email address" },
      400
    );
  }
  if (message.length < 10 || message.length > 2000) {
    return c.json(
      { ok: false, error: "INVALID_INPUT", message: "Message must be at least 10 characters" },
      400
    );
  }

  const requestIp =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    null;

  const rateLimit = await checkContactRateLimit(
    c.env.CONTACT_RATELIMIT_KV,
    requestIp ?? "unknown"
  );
  if (!rateLimit.allowed) {
    return c.json(
      { ok: false, error: "RATE_LIMITED", message: "Too many submissions. Please try again later." },
      429
    );
  }

  let userId: string | undefined;
  let username: string | undefined;
  const authToken = getBearerToken(c.req);
  const payload =
    authToken && c.env.NEXTAUTH_SECRET
      ? await verifyAuthToken(authToken, c.env.NEXTAUTH_SECRET)
      : null;
  const isLoggedIn = Boolean(payload?.email && typeof payload.email === "string");

  // Turnstile required for logged-out users when secret is configured
  if (!isLoggedIn && c.env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return c.json(
        { ok: false, error: "TURNSTILE_REQUIRED", message: "Please complete the verification." },
        400
      );
    }
    const verifyResult = await verifyTurnstileToken(
      turnstileToken,
      c.env.TURNSTILE_SECRET_KEY,
      requestIp
    );
    if (!verifyResult.success) {
      return c.json(
        { ok: false, error: "TURNSTILE_FAILED", message: "Verification failed. Please try again." },
        400
      );
    }
  }

  if (payload?.email && typeof payload.email === "string") {
    try {
      const sql = getSql(c.env);
      const appUserId = await ensureAppUserId(
        sql,
        payload.email,
        (payload as { name?: string | null }).name
      );
      userId = appUserId;
      const row = (await sql`
        SELECT username FROM newchums.users WHERE id = ${appUserId} LIMIT 1
      `) as { username: string | null }[];
      if (row[0]?.username) {
        username = row[0].username.replace(/^@/, "");
      }
    } catch {
      // Ignore; we still send the email without user context
    }
  }

  try {
    await sendContactFormEmail(c.env, {
      name,
      email,
      subject,
      message,
      requestIp,
      userId,
      username,
    });
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /contact] send failed", err);
    Sentry.captureException(err);
    return c.json(
      { ok: false, error: "EMAIL_SEND_FAILED", message: "Failed to send message. Please try again." },
      500
    );
  }
});

async function requireAuth(c: { req: Request; env: Bindings }) {
  const token = getBearerToken(c.req);
  if (!token || !c.env.NEXTAUTH_SECRET) {
    return null;
  }
  return verifyAuthToken(token, c.env.NEXTAUTH_SECRET);
}

// Invite tokens, allow one-click RSVP from email without requiring login.
// Token encodes the eventId + invitee identifier (userId or email) and is
// signed with NEXTAUTH_SECRET. Valid for 30 days.
const INVITE_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60;

async function createInviteToken(
  secret: string,
  payload: { eventId: string; userId?: string | null; email?: string | null },
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + INVITE_TOKEN_EXPIRY_SECONDS;
  return new SignJWT({ eid: payload.eventId, uid: payload.userId ?? undefined, em: payload.email ?? undefined, purpose: "invite_rsvp" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

async function verifyInviteToken(
  token: string,
  secret: string,
): Promise<{ eventId: string; userId?: string; email?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.purpose !== "invite_rsvp") return null;
    const eventId = payload.eid as string | undefined;
    if (!eventId) return null;
    return {
      eventId,
      userId: payload.uid as string | undefined,
      email: payload.em as string | undefined,
    };
  } catch {
    return null;
  }
}

// Public RSVP participation tokens, issued after email verification via 6-digit code.
// Structurally similar to invite tokens but with purpose "public_rsvp".
// Valid for 30 days (same as invite tokens).

const CHALLENGE_TOKEN_EXPIRY_SECONDS = 10 * 60; // 10 minutes

async function hmacDigest(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function createChallengeToken(
  secret: string,
  payload: { email: string; eventId: string; code: string },
): Promise<string> {
  const digest = await hmacDigest(secret, `${payload.email}|${payload.eventId}|${payload.code}`);
  const exp = Math.floor(Date.now() / 1000) + CHALLENGE_TOKEN_EXPIRY_SECONDS;
  return new SignJWT({ em: payload.email, eid: payload.eventId, d: digest, purpose: "guest_challenge" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

async function verifyChallengeToken(
  token: string,
  secret: string,
  submittedCode: string,
): Promise<{ email: string; eventId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.purpose !== "guest_challenge") return null;
    const email = payload.em as string | undefined;
    const eventId = payload.eid as string | undefined;
    const storedDigest = payload.d as string | undefined;
    if (!email || !eventId || !storedDigest) return null;
    const expectedDigest = await hmacDigest(secret, `${email}|${eventId}|${submittedCode}`);
    if (storedDigest !== expectedDigest) return null;
    return { email, eventId };
  } catch {
    return null;
  }
}

async function createParticipationToken(
  secret: string,
  payload: { eventId: string; email: string; name?: string },
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + INVITE_TOKEN_EXPIRY_SECONDS;
  return new SignJWT({
    eid: payload.eventId,
    em: payload.email,
    nm: payload.name ?? undefined,
    purpose: "public_rsvp",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

/** Verify a token with purpose "invite_rsvp", "public_rsvp", or "share". */
function verifyParticipationOrInviteToken(
  token: string,
  secret: string,
): Promise<{ eventId: string; userId?: string; email?: string; purpose: string; name?: string } | null> {
  return jwtVerify(token, new TextEncoder().encode(secret))
    .then(({ payload }) => {
      const purpose = payload.purpose as string | undefined;
      if (purpose !== "invite_rsvp" && purpose !== "public_rsvp" && purpose !== "share") return null;
      const eventId = payload.eid as string | undefined;
      if (!eventId) return null;
      return {
        eventId,
        userId: payload.uid as string | undefined,
        email: payload.em as string | undefined,
        purpose,
        name: payload.nm as string | undefined,
      };
    })
    .catch(() => null);
}

// Share tokens, plan-level tokens for Copy Link / share URLs.
// Not user-specific; anyone with the token can view the full plan detail
// and use the public RSVP flow. Deterministic per event (no expiry).
// Uses a short HMAC instead of a full JWT to keep share URLs compact.
async function createShareToken(eventId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`share:${eventId}`));
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 16);
}

async function verifyShareToken(token: string, eventId: string, secret: string): Promise<boolean> {
  const expected = await createShareToken(eventId, secret);
  return token === expected;
}

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Unsubscribe tokens, allow one-click email preference opt-out without requiring login.
// Token encodes the userId + notification key and is signed with NEXTAUTH_SECRET.
// Valid for 90 days.
const UNSUBSCRIBE_TOKEN_EXPIRY_SECONDS = 90 * 24 * 60 * 60;

async function createUnsubscribeToken(
  secret: string,
  userId: string,
  key: string,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + UNSUBSCRIBE_TOKEN_EXPIRY_SECONDS;
  return new SignJWT({ uid: userId, key, purpose: "unsubscribe" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

async function verifyUnsubscribeToken(
  token: string,
  secret: string,
): Promise<{ userId: string; key: string } | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.purpose !== "unsubscribe") return null;
    const userId = payload.uid as string | undefined;
    const key = payload.key as string | undefined;
    if (!userId || !key) return null;
    return { userId, key };
  } catch {
    return null;
  }
}

// Guest confirmation tokens: allow one-click attendance confirmation from email
// for guest attendees (no account). Token encodes eventId + guest email.
// Valid for 7 days.
const GUEST_CONFIRMATION_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

async function createGuestConfirmationToken(
  secret: string,
  eventId: string,
  email: string,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + GUEST_CONFIRMATION_TOKEN_EXPIRY_SECONDS;
  return new SignJWT({ eid: eventId, em: email, purpose: "guest_confirmation" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

async function verifyGuestConfirmationToken(
  token: string,
  secret: string,
): Promise<{ eventId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.purpose !== "guest_confirmation") return null;
    const eventId = payload.eid as string | undefined;
    const email = payload.em as string | undefined;
    if (!eventId || !email) return null;
    return { eventId, email };
  } catch {
    return null;
  }
}

/** Marks unread attendance-request bell notifications for this user+plan as read. Idempotent; safe if none exist or already read. */
async function markConfirmationRequestedNotificationsRead(
  sql: ReturnType<typeof getSql>,
  userId: string,
  eventId: string,
): Promise<void> {
  await sql`
    UPDATE newchums.notifications
    SET read_at = NOW()
    WHERE user_id = ${userId}
      AND type = 'confirmation_requested'
      AND entity_id = ${eventId}
      AND read_at IS NULL
  `;
}

app.get("/handles/available", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const handleParam = c.req.query("handle");
  const trimmed = (handleParam ?? "").trim();
  if (!trimmed) {
    return c.json({ available: false });
  }
  const validation = validateUsername(trimmed);
  if (!validation.valid) {
    return c.json({ available: false });
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(
      sql,
      payload.email,
      (payload as { name?: string | null }).name,
    );
    const usernameNorm = normalizeUsernameForUniq(trimmed);
    const existing = (await sql`
      SELECT id FROM newchums.users WHERE username_norm = ${usernameNorm} LIMIT 1
    `) as { id: string }[];
    if (existing.length === 0) {
      return c.json({ available: true });
    }
    return c.json({ available: existing[0].id === appUserId });
  } catch {
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.get("/notification-preferences", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(
      sql,
      payload.email,
      (payload as { name?: string | null }).name,
    );
    const rows = (await sql`
      SELECT notification_prefs FROM user_profile WHERE user_id = ${appUserId} LIMIT 1
    `) as { notification_prefs: unknown }[];
    const raw = rows[0]?.notification_prefs;
    const prefs = normalizeNotificationPrefs(raw);
    const storedItems =
      raw && typeof raw === "object" && (raw as { items?: Record<string, unknown> }).items;
    const keysInStored = storedItems && typeof storedItems === "object" ? Object.keys(storedItems) : [];
    const hasAllKeys = VALID_KEYS.every((k) => keysInStored.includes(k));
    if (!hasAllKeys && rows.length > 0) {
      const prefsJson = JSON.stringify(prefs);
      await sql`
        UPDATE user_profile SET notification_prefs = ${prefsJson}::jsonb
        WHERE user_id = ${appUserId}
      `;
    }
    return c.json({ ok: true, prefs });
  } catch (err) {
    console.error("[GET /notification-preferences]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.put("/notification-preferences", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const body = await c.req.json();
    const prefs = validateAndMergeInput(body);
    if (!prefs) {
      return c.json(
        { ok: false, error: "INVALID_INPUT", code: "INVALID_INPUT" },
        400,
      );
    }
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(
      sql,
      payload.email,
      (payload as { name?: string | null }).name,
    );
    const prefsJson = JSON.stringify(prefs);
    const updated = (await sql`
      UPDATE user_profile SET notification_prefs = ${prefsJson}::jsonb
      WHERE user_id = ${appUserId}
      RETURNING 1
    `) as { notification_prefs?: unknown }[];
    if (updated.length === 0) {
      await sql`
        INSERT INTO user_profile (user_id, home_city, home_lat, home_lng, home_location, travel_radius_km, email_chat_digest, email_new_events, bio, notification_prefs)
        VALUES (${appUserId}, NULL, NULL, NULL, NULL, NULL, true, true, NULL, ${prefsJson}::jsonb)
        ON CONFLICT (user_id) DO UPDATE SET notification_prefs = EXCLUDED.notification_prefs
      `;
    }
    return c.json({ ok: true, prefs });
  } catch (err) {
    console.error("[PUT /notification-preferences]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /email/unsubscribe, one-click unsubscribe from a specific notification type via token.
 *  No authentication required; the signed JWT token is the credential.
 */
app.post("/email/unsubscribe", async (c) => {
  try {
    const body = await c.req.json();
    const token = typeof body.token === "string" ? body.token.trim() : null;
    if (!token) return c.json({ ok: false, error: "INVALID_TOKEN" }, 400);

    const data = await verifyUnsubscribeToken(token, c.env.NEXTAUTH_SECRET);
    if (!data) return c.json({ ok: false, error: "INVALID_TOKEN" }, 400);

    const { userId, key } = data;
    if (!isValidKey(key)) return c.json({ ok: false, error: "INVALID_KEY" }, 400);

    const sql = getSql(c.env);
    const rows = (await sql`
      SELECT notification_prefs FROM user_profile WHERE user_id = ${userId} LIMIT 1
    `) as { notification_prefs: unknown }[];

    if (rows.length === 0) {
      const prefs = normalizeNotificationPrefs(undefined);
      prefs.items[key] = { enabled: false };
      await sql`
        INSERT INTO user_profile (user_id, notification_prefs)
        VALUES (${userId}, ${JSON.stringify(prefs)}::jsonb)
        ON CONFLICT (user_id) DO UPDATE SET notification_prefs = EXCLUDED.notification_prefs
      `;
    } else {
      const prefs = normalizeNotificationPrefs(rows[0].notification_prefs);
      prefs.items[key] = { enabled: false };
      await sql`
        UPDATE user_profile SET notification_prefs = ${JSON.stringify(prefs)}::jsonb
        WHERE user_id = ${userId}
      `;
    }

    return c.json({ ok: true, key });
  } catch (err) {
    console.error("[POST /email/unsubscribe]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.get("/profile", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json(
      {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Missing session email" },
      },
      401,
    );
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(
      sql,
      payload.email,
      (payload as { name?: string | null }).name,
    );
    const userRows = (await sql`
      SELECT name, username, email, date_of_birth, gender, profile_theme, avatar_key, avatar_updated_at, role,
        (password_hash IS NOT NULL) AS has_password,
        COALESCE(is_hidden_from_search, false) AS is_hidden_from_search,
        COALESCE(is_hidden_from_external_indexing, false) AS is_hidden_from_external_indexing,
        COALESCE(is_hidden_age, false) AS is_hidden_age,
        COALESCE(is_hidden_chum_list, false) AS is_hidden_chum_list,
        COALESCE(is_hidden_from_chum_lists, false) AS is_hidden_from_chum_lists,
        COALESCE(is_hidden_shoutouts, false) AS is_hidden_shoutouts,
        COALESCE(tutorial_nudges_off, false) AS tutorial_nudges_off
      FROM newchums.users WHERE id = ${appUserId} LIMIT 1
    `) as Array<{
      name: string | null;
      username: string | null;
      email: string;
      date_of_birth: string | Date | null;
      gender: string | null;
      profile_theme: string | null;
      avatar_key: string | null;
      avatar_updated_at: string | Date | null;
      role: string | null;
      has_password: boolean;
      is_hidden_from_search: boolean;
      is_hidden_from_external_indexing: boolean;
      is_hidden_age: boolean;
      is_hidden_chum_list: boolean;
      is_hidden_from_chum_lists: boolean;
      is_hidden_shoutouts: boolean;
      tutorial_nudges_off: boolean;
    }>;
    const userInfo = userRows[0];
    const profileRows = (await sql`
      SELECT home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events, bio
      FROM user_profile WHERE user_id = ${appUserId} LIMIT 1
    `) as Array<{
      home_city: string | null;
      home_lat: number | null;
      home_lng: number | null;
      travel_radius_km: number | null;
      email_chat_digest: boolean;
      email_new_events: boolean;
      bio?: string | null;
    }>;
    const profile = profileRows[0];
    const interestRows = (await sql`
      SELECT i.slug, i.name, i.category
      FROM user_interests ui
      JOIN interests i ON i.id = ui.interest_id
      WHERE ui.user_id = ${appUserId}
      ORDER BY i.sort_order, i.name
    `) as { slug: string; name: string; category: string | null }[];
    const interest_items = interestRows.map((r) => ({ slug: r.slug, name: r.name, category: r.category }));
    const displayName = userInfo?.name ?? null;
    const handle = userInfo?.username ?? null;
    const email = userInfo?.email ?? payload.email ?? null;
    const dateOfBirth = userInfo?.date_of_birth
      ? (typeof userInfo.date_of_birth === "string"
          ? userInfo.date_of_birth
          : (userInfo.date_of_birth as Date).toISOString().slice(0, 10))
      : null;
    const bio = profile?.bio ?? null;
    const avatarKey = userInfo?.avatar_key ?? null;
    const avatarUpdatedAt = userInfo?.avatar_updated_at;
    // Return avatar_url when avatar_key is set. Client uses getAvatarBaseUrl() which may point to a
    // different API (e.g. prod when sharing DB), so we don't check R2 here; avoids empty avatar_url
    // when local API has different R2 than where uploads were written.
    const avatarUrl =
      avatarKey && c.env.MEDIA_BUCKET
        ? `/users/${appUserId}/avatar?v=${avatarUpdatedAt ? new Date(avatarUpdatedAt as Date).getTime() : 0}`
        : null;

    const hasPassword = userInfo?.has_password ?? false;
    const isHiddenFromSearch = userInfo?.is_hidden_from_search ?? false;
    const isHiddenFromExternalIndexing = userInfo?.is_hidden_from_external_indexing ?? false;
    const isHiddenAge = userInfo?.is_hidden_age ?? false;
    const isHiddenChumList = userInfo?.is_hidden_chum_list ?? false;
    const isHiddenFromChumLists = userInfo?.is_hidden_from_chum_lists ?? false;
    const isHiddenShoutouts = userInfo?.is_hidden_shoutouts ?? false;
    const tutorialNudgesOff = userInfo?.tutorial_nudges_off ?? false;
    const role = userInfo?.role ?? null;
    const gender = userInfo?.gender ?? null;
    const profileTheme = userInfo?.profile_theme ?? null;

    if (!profile) {
      return c.json({
        ok: true,
        profile: {
          userId: appUserId,
          name: displayName,
          username: handle,
          email,
          date_of_birth: dateOfBirth,
          gender,
          profile_theme: profileTheme,
          bio: null,
          home_city: null,
          home_lat: null,
          home_lng: null,
          travel_radius_km: null,
          interest_slugs: [] as string[],
          interest_items: [] as { slug: string; name: string }[],
          email_chat_digest: true,
          email_new_events: true,
          avatar_url: avatarUrl,
          has_password: hasPassword,
          is_hidden_from_search: isHiddenFromSearch,
          is_hidden_from_external_indexing: isHiddenFromExternalIndexing,
          is_hidden_age: isHiddenAge,
          is_hidden_chum_list: isHiddenChumList,
          is_hidden_from_chum_lists: isHiddenFromChumLists,
          is_hidden_shoutouts: isHiddenShoutouts,
          tutorial_nudges_off: tutorialNudgesOff,
          role,
        },
      });
    }
    return c.json({
      ok: true,
      profile: {
        userId: appUserId,
        name: displayName,
        username: handle,
        email,
        date_of_birth: dateOfBirth,
        gender,
        profile_theme: profileTheme,
        bio,
        home_city: profile.home_city,
        home_lat: profile.home_lat,
        home_lng: profile.home_lng,
        travel_radius_km: profile.travel_radius_km,
        interest_slugs: interestRows.map((r) => r.slug),
        interest_items,
        email_chat_digest: profile.email_chat_digest,
        email_new_events: profile.email_new_events,
        avatar_url: avatarUrl,
        has_password: hasPassword,
        is_hidden_from_search: isHiddenFromSearch,
        is_hidden_from_external_indexing: isHiddenFromExternalIndexing,
        is_hidden_age: isHiddenAge,
        is_hidden_chum_list: isHiddenChumList,
        is_hidden_from_chum_lists: isHiddenFromChumLists,
        is_hidden_shoutouts: isHiddenShoutouts,
        tutorial_nudges_off: tutorialNudgesOff,
        role,
      },
    });
  } catch (err) {
    console.error(err);
    return c.json(
      {
        ok: false,
        error: { code: "SERVER_ERROR", message: "Failed to fetch profile" },
      },
      500,
    );
  }
});

app.put("/profile", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json(
      {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Missing session email" },
      },
      401,
    );
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(
      sql,
      payload.email,
      (payload as { name?: string | null }).name,
    );
    const body = (await c.req.json()) as {
      name?: string | null;
      bio?: string | null;
      date_of_birth?: string | null;
      gender?: string | null;
      profile_theme?: string | null;
      home_city?: string | null;
      home_lat?: number | string | null;
      home_lng?: number | string | null;
      travel_radius_km?: number;
      interest_slugs?: string[];
      email_chat_digest?: boolean;
      email_new_events?: boolean;
      is_hidden_from_search?: boolean;
      is_hidden_from_external_indexing?: boolean;
      is_hidden_age?: boolean;
      is_hidden_chum_list?: boolean;
      is_hidden_from_chum_lists?: boolean;
      is_hidden_shoutouts?: boolean;
    };

    if ("date_of_birth" in body && body.date_of_birth !== undefined) {
      const trimmedDob = body.date_of_birth != null ? String(body.date_of_birth).trim() : "";
      if (trimmedDob) {
        const parts = parseDateOnly(trimmedDob);
        if (!parts) {
          return c.json(
            { ok: false, error: { code: "INVALID_DATE", message: "Invalid date format" } },
            400,
          );
        }
        const today = new Date();
        const birth = new Date(parts.y, parts.m - 1, parts.d);
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (birth > todayMidnight) {
          return c.json(
            { ok: false, error: { code: "FUTURE_DATE", message: "Date cannot be in the future" } },
            400,
          );
        }
        if (!isAtLeast18(trimmedDob)) {
          return c.json(
            {
              ok: false,
              error: { code: "UNDERAGE", message: "NewChums is currently available to people 18 and older." },
            },
            400,
          );
        }
      }
    }

    const ALLOWED_GENDERS = new Set(["male", "female", "other", "prefer_not_to_say"]);
    if ("gender" in body && body.gender != null && body.gender !== "") {
      if (!ALLOWED_GENDERS.has(String(body.gender))) {
        return c.json(
          { ok: false, error: { code: "INVALID_GENDER", message: "Invalid gender value" } },
          400,
        );
      }
    }

    const ALLOWED_PROFILE_THEMES = new Set([
      "default",
      "blush", "peach", "honey", "warm_sand", "stone",
      "sage", "forest",
      "sky", "ocean", "soft_blue", "slate", "steel",
      "lavender", "dusk",
      "graphite",
    ]);
    if ("profile_theme" in body && body.profile_theme != null && body.profile_theme !== "") {
      if (!ALLOWED_PROFILE_THEMES.has(String(body.profile_theme))) {
        return c.json(
          { ok: false, error: { code: "INVALID_PROFILE_THEME", message: "Invalid profile theme value" } },
          400,
        );
      }
    }

    const BIO_MAX_LENGTH = 500;
    if ("bio" in body && body.bio != null && String(body.bio).length > BIO_MAX_LENGTH) {
      return c.json(
        { ok: false, error: { code: "INVALID_INPUT", message: `Bio must be ${BIO_MAX_LENGTH} characters or less` } },
        400,
      );
    }

    if ("name" in body && body.name != null && String(body.name).trim() !== "") {
      const nameCheck = validateCleanText(String(body.name).trim(), "display_name");
      if (!nameCheck.ok) {
        return c.json(
          { ok: false, error: { code: "INAPPROPRIATE_TEXT", field: "display_name", message: nameCheck.reason } },
          400,
        );
      }
    }

    const existingRows = (await sql`
      SELECT home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events, bio
      FROM user_profile WHERE user_id = ${appUserId} LIMIT 1
    `) as Array<{
      home_city: string | null;
      home_lat: number | null;
      home_lng: number | null;
      travel_radius_km: number | null;
      email_chat_digest: boolean;
      email_new_events: boolean;
      bio?: string | null;
    }>;
    const existing = existingRows[0];
    const travel_radius_km =
      "travel_radius_km" in body && body.travel_radius_km != null
        ? Number(body.travel_radius_km)
        : (existing?.travel_radius_km ?? null);
    if (
      travel_radius_km != null &&
      (!Number.isFinite(travel_radius_km) ||
      travel_radius_km < 1 ||
      travel_radius_km > 200)
    ) {
      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "travel_radius_km must be between 1 and 200",
          },
        },
        400,
      );
    }
    const updatingLocation = "home_lat" in body || "home_lng" in body;
    const latRaw = body.home_lat;
    const lngRaw = body.home_lng;
    const latCoerced =
      latRaw != null && String(latRaw).trim() !== "" ? Number(latRaw) : null;
    const lngCoerced =
      lngRaw != null && String(lngRaw).trim() !== "" ? Number(lngRaw) : null;
    if (updatingLocation) {
      const bothPresent =
        latCoerced != null &&
        lngCoerced != null &&
        Number.isFinite(latCoerced) &&
        Number.isFinite(lngCoerced);
      const bothAbsent =
        (latCoerced == null || !Number.isFinite(latCoerced)) &&
        (lngCoerced == null || !Number.isFinite(lngCoerced));
      if (!bothPresent && !bothAbsent) {
        return c.json(
          {
            ok: false,
            error: {
              code: "INVALID_INPUT",
              message:
                "home_lat and home_lng must both be present and valid, or both be null/empty",
            },
          },
          400,
        );
      }
      if (bothPresent) {
        if (latCoerced! < -90 || latCoerced! > 90) {
          return c.json(
            {
              ok: false,
              error: {
                code: "INVALID_INPUT",
                message: "home_lat must be between -90 and 90",
              },
            },
            400,
          );
        }
        if (lngCoerced! < -180 || lngCoerced! > 180) {
          return c.json(
            {
              ok: false,
              error: {
                code: "INVALID_INPUT",
                message: "home_lng must be between -180 and 180",
              },
            },
            400,
          );
        }
      }
    }
    const home_lat = updatingLocation
      ? Number.isFinite(latCoerced)
        ? latCoerced
        : null
      : (existing?.home_lat ?? null);
    const home_lng = updatingLocation
      ? Number.isFinite(lngCoerced)
        ? lngCoerced
        : null
      : (existing?.home_lng ?? null);
    let finalInterestSlugs: string[] = [];
    const rawInterestSlugs = "interest_slugs" in body ? (body.interest_slugs ?? []) : null;
    const rawInterestItems = "interest_items" in body
      ? (body.interest_items as Array<{ slug?: string; name?: string }> | null)
      : null;
    if (rawInterestSlugs !== null) {
      const result = await resolveInterestSlugs(sql, appUserId, rawInterestSlugs, rawInterestItems ?? null);
      if (!result.ok) {
        return c.json({ ok: false, error: result.error }, 400);
      }
      finalInterestSlugs = result.slugs;
    }
    const home_city =
      "home_city" in body
        ? (body.home_city ?? null)
        : (existing?.home_city ?? null);
    const bio =
      "bio" in body && body.bio !== undefined
        ? (body.bio != null && String(body.bio).trim() !== ""
            ? String(body.bio).trim().slice(0, BIO_MAX_LENGTH)
            : null)
        : (existing?.bio ?? null);
    const email_chat_digest =
      "email_chat_digest" in body
        ? (body.email_chat_digest ?? true)
        : (existing?.email_chat_digest ?? true);
    const email_new_events =
      "email_new_events" in body
        ? (body.email_new_events ?? true)
        : (existing?.email_new_events ?? true);
    const hasLocation =
      home_lat != null &&
      home_lng != null &&
      Number.isFinite(home_lat) &&
      Number.isFinite(home_lng);
    const defaultPrefsJson = getDefaultPrefsJson();
    const upsertQuery = hasLocation
      ? sql`
          INSERT INTO user_profile (user_id, home_city, home_lat, home_lng, home_location, travel_radius_km, email_chat_digest, email_new_events, bio, notification_prefs)
          VALUES (${appUserId}, ${home_city}, ${home_lat}, ${home_lng}, ST_SetSRID(ST_MakePoint(${home_lng}, ${home_lat}), 4326)::geography, ${travel_radius_km}, ${email_chat_digest}, ${email_new_events}, ${bio}, ${defaultPrefsJson}::jsonb)
          ON CONFLICT (user_id) DO UPDATE SET
            home_city = EXCLUDED.home_city,
            home_lat = EXCLUDED.home_lat,
            home_lng = EXCLUDED.home_lng,
            home_location = ST_SetSRID(ST_MakePoint(${home_lng}, ${home_lat}), 4326)::geography,
            travel_radius_km = EXCLUDED.travel_radius_km,
            email_chat_digest = EXCLUDED.email_chat_digest,
            email_new_events = EXCLUDED.email_new_events,
            bio = EXCLUDED.bio
        `
      : sql`
          INSERT INTO user_profile (user_id, home_city, home_lat, home_lng, home_location, travel_radius_km, email_chat_digest, email_new_events, bio, notification_prefs)
          VALUES (${appUserId}, ${home_city}, ${home_lat}, ${home_lng}, NULL, ${travel_radius_km}, ${email_chat_digest}, ${email_new_events}, ${bio}, ${defaultPrefsJson}::jsonb)
          ON CONFLICT (user_id) DO UPDATE SET
            home_city = EXCLUDED.home_city,
            home_lat = EXCLUDED.home_lat,
            home_lng = EXCLUDED.home_lng,
            home_location = NULL,
            travel_radius_km = EXCLUDED.travel_radius_km,
            email_chat_digest = EXCLUDED.email_chat_digest,
            email_new_events = EXCLUDED.email_new_events,
            bio = EXCLUDED.bio
        `;
    const txQueries: unknown[] = [upsertQuery];
    if ("name" in body && body.name !== undefined) {
      const nameVal = body.name != null && String(body.name).trim() !== "" ? String(body.name).trim() : null;
      txQueries.push(sql`UPDATE newchums.users SET name = ${nameVal} WHERE id = ${appUserId}`);
    }
    if ("date_of_birth" in body && body.date_of_birth !== undefined) {
      const trimmedDob = body.date_of_birth != null ? String(body.date_of_birth).trim() : "";
      const parts = trimmedDob ? parseDateOnly(trimmedDob) : null;
      const dobVal = parts
        ? `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`
        : null;
      if (dobVal !== null) {
        txQueries.push(sql`UPDATE newchums.users SET date_of_birth = ${dobVal} WHERE id = ${appUserId}`);
      }
    }
    if ("is_hidden_from_search" in body && body.is_hidden_from_search !== undefined) {
      const val = body.is_hidden_from_search === true;
      txQueries.push(sql`UPDATE newchums.users SET is_hidden_from_search = ${val} WHERE id = ${appUserId}`);
    }
    if ("is_hidden_from_external_indexing" in body && body.is_hidden_from_external_indexing !== undefined) {
      const val = body.is_hidden_from_external_indexing === true;
      txQueries.push(sql`UPDATE newchums.users SET is_hidden_from_external_indexing = ${val} WHERE id = ${appUserId}`);
    }
    if ("is_hidden_age" in body && body.is_hidden_age !== undefined) {
      const val = body.is_hidden_age === true;
      txQueries.push(sql`UPDATE newchums.users SET is_hidden_age = ${val} WHERE id = ${appUserId}`);
    }
    if ("is_hidden_chum_list" in body && body.is_hidden_chum_list !== undefined) {
      const val = body.is_hidden_chum_list === true;
      txQueries.push(sql`UPDATE newchums.users SET is_hidden_chum_list = ${val} WHERE id = ${appUserId}`);
    }
    if ("is_hidden_from_chum_lists" in body && body.is_hidden_from_chum_lists !== undefined) {
      const val = body.is_hidden_from_chum_lists === true;
      txQueries.push(sql`UPDATE newchums.users SET is_hidden_from_chum_lists = ${val} WHERE id = ${appUserId}`);
    }
    if ("is_hidden_shoutouts" in body && body.is_hidden_shoutouts !== undefined) {
      const val = body.is_hidden_shoutouts === true;
      txQueries.push(sql`UPDATE newchums.users SET is_hidden_shoutouts = ${val} WHERE id = ${appUserId}`);
    }
    if ("gender" in body && body.gender !== undefined) {
      const genderVal = body.gender != null && body.gender !== "" ? String(body.gender) : null;
      txQueries.push(sql`UPDATE newchums.users SET gender = ${genderVal} WHERE id = ${appUserId}`);
    }
    if ("profile_theme" in body && body.profile_theme !== undefined) {
      const themeVal = body.profile_theme != null && body.profile_theme !== "" ? String(body.profile_theme) : null;
      txQueries.push(sql`UPDATE newchums.users SET profile_theme = ${themeVal} WHERE id = ${appUserId}`);
    }
    if (rawInterestSlugs !== null) {
      txQueries.push(
        sql`DELETE FROM user_interests WHERE user_id = ${appUserId}`,
      );
      txQueries.push(
        finalInterestSlugs.length > 0
          ? sql`
              INSERT INTO user_interests (user_id, interest_id)
              SELECT ${appUserId}, i.id FROM interests i
              WHERE i.slug = ANY(${finalInterestSlugs}) AND i.is_deleted = false
            `
          : sql`SELECT 1`,
      );
    }
    await sql.transaction(txQueries);
    const userRowsAfter = (await sql`
      SELECT name, username, email, date_of_birth, gender, profile_theme, avatar_key, avatar_updated_at, (password_hash IS NOT NULL) AS has_password,
        COALESCE(is_hidden_from_search, false) AS is_hidden_from_search,
        COALESCE(is_hidden_from_external_indexing, false) AS is_hidden_from_external_indexing,
        COALESCE(is_hidden_age, false) AS is_hidden_age,
        COALESCE(is_hidden_chum_list, false) AS is_hidden_chum_list,
        COALESCE(is_hidden_from_chum_lists, false) AS is_hidden_from_chum_lists,
        COALESCE(is_hidden_shoutouts, false) AS is_hidden_shoutouts
      FROM newchums.users WHERE id = ${appUserId} LIMIT 1
    `) as Array<{
      name: string | null;
      username: string | null;
      email: string;
      date_of_birth: string | Date | null;
      gender: string | null;
      profile_theme: string | null;
      avatar_key: string | null;
      avatar_updated_at: string | Date | null;
      has_password: boolean;
      is_hidden_from_search: boolean;
      is_hidden_from_external_indexing: boolean;
      is_hidden_age: boolean;
      is_hidden_chum_list: boolean;
      is_hidden_from_chum_lists: boolean;
      is_hidden_shoutouts: boolean;
    }>;
    const userAfter = userRowsAfter[0];
    const profileRows = (await sql`
      SELECT home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events, bio
      FROM user_profile WHERE user_id = ${appUserId} LIMIT 1
    `) as Array<{
      home_city: string | null;
      home_lat: number | null;
      home_lng: number | null;
      travel_radius_km: number | null;
      email_chat_digest: boolean;
      email_new_events: boolean;
      bio?: string | null;
    }>;
    const interestRows = (await sql`
      SELECT i.slug FROM user_interests ui
      JOIN interests i ON i.id = ui.interest_id
      WHERE ui.user_id = ${appUserId}
      ORDER BY i.sort_order, i.name
    `) as { slug: string }[];
    const profile = profileRows[0]!;
    const dateOfBirthAfter = userAfter?.date_of_birth
      ? (typeof userAfter.date_of_birth === "string"
          ? userAfter.date_of_birth
          : (userAfter.date_of_birth as Date).toISOString().slice(0, 10))
      : null;
    const avatarKey = userAfter?.avatar_key ?? null;
    const avatarUpdatedAt = userAfter?.avatar_updated_at;
    const avatarUrl =
      avatarKey && c.env.MEDIA_BUCKET
        ? `/users/${appUserId}/avatar?v=${avatarUpdatedAt ? new Date(avatarUpdatedAt as Date).getTime() : 0}`
        : null;
    return c.json({
      ok: true,
      profile: {
        name: userAfter?.name ?? null,
        username: userAfter?.username ?? null,
        email: userAfter?.email ?? null,
        date_of_birth: dateOfBirthAfter,
        gender: userAfter?.gender ?? null,
        profile_theme: userAfter?.profile_theme ?? null,
        bio: profile.bio ?? null,
        avatar_url: avatarUrl,
        home_city: profile.home_city,
        home_lat: profile.home_lat,
        home_lng: profile.home_lng,
        travel_radius_km: profile.travel_radius_km,
        interest_slugs: interestRows.map((r) => r.slug),
        interest_items: interestRows.map((r) => ({ slug: r.slug, name: slugToName(r.slug) })),
        email_chat_digest: profile.email_chat_digest,
        email_new_events: profile.email_new_events,
        has_password: userAfter?.has_password ?? false,
        is_hidden_from_search: userAfter?.is_hidden_from_search ?? false,
        is_hidden_from_external_indexing: userAfter?.is_hidden_from_external_indexing ?? false,
        is_hidden_age: userAfter?.is_hidden_age ?? false,
        is_hidden_chum_list: userAfter?.is_hidden_chum_list ?? false,
        is_hidden_from_chum_lists: userAfter?.is_hidden_from_chum_lists ?? false,
        is_hidden_shoutouts: userAfter?.is_hidden_shoutouts ?? false,
      },
    });
  } catch (err) {
    console.error(err);
    return c.json(
      {
        ok: false,
        error: { code: "SERVER_ERROR", message: "Failed to update profile" },
      },
      500,
    );
  }
});

// ---- Media upload (R2, short-lived tokens) ----

app.post("/media/init", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  if (!c.env.MEDIA_BUCKET || !c.env.NEXTAUTH_SECRET) {
    return c.json({ ok: false, error: "MEDIA_NOT_CONFIGURED" }, 503);
  }
  try {
    const body = (await c.req.json()) as {
      purpose?: string;
      contentType?: string;
      contentLength?: number;
    };
    const purpose = (body.purpose ?? "avatar") as "avatar" | "event_banner" | "roadmap_attachment";
    const contentType = (body.contentType ?? "").trim().toLowerCase();
    const contentLength = typeof body.contentLength === "number" ? body.contentLength : 0;

    const validation = validateMediaInit(purpose, contentType, contentLength);
    if (!validation.ok) {
      return c.json(
        { ok: false, error: validation.error ?? "Invalid media request" },
        400,
      );
    }

    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(
      sql,
      payload.email,
      (payload as { name?: string | null }).name,
    );

    const objectKey = buildObjectKey(appUserId, purpose, contentType);
    const uploadToken = await createUploadToken(
      {
        userId: appUserId,
        objectKey,
        purpose,
        contentType,
        contentLength,
      },
      c.env.NEXTAUTH_SECRET,
    );

    const maxBytes = purpose === "roadmap_attachment" ? MAX_ROADMAP_ATTACHMENT_BYTES : purpose === "event_banner" ? MAX_EVENT_BANNER_BYTES : MAX_AVATAR_BYTES;
    return c.json({
      ok: true,
      uploadToken,
      objectKey,
      uploadUrl: `/media/upload/${uploadToken}`,
      viewUrl: purpose === "avatar" ? `/users/${appUserId}/avatar` : undefined,
      constraints: { maxBytes, allowedTypes: ["image/jpeg", "image/png", "image/webp"] },
    });
  } catch (err) {
    console.error("[POST /media/init]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.put("/media/upload/:token", async (c) => {
  const tokenParam = c.req.param("token");
  if (!tokenParam || !c.env.NEXTAUTH_SECRET || !c.env.MEDIA_BUCKET) {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const payload = await verifyUploadToken(tokenParam, c.env.NEXTAUTH_SECRET);
  if (!payload) {
    return c.json({ ok: false, error: "INVALID_OR_EXPIRED_TOKEN" }, 401);
  }
  const contentType = payload.contentType;
  const contentLength = payload.contentLength;
  const objectKey = payload.objectKey;

  const reqLen = c.req.header("Content-Length");
  const actualLen = reqLen ? parseInt(reqLen, 10) : 0;
  if (contentLength > 0 && actualLen > contentLength) {
    return c.json({ ok: false, error: "FILE_TOO_LARGE" }, 413);
  }

  try {
    const body = c.req.raw.body;
    if (!body) {
      return c.json({ ok: false, error: "NO_BODY" }, 400);
    }
    await c.env.MEDIA_BUCKET.put(objectKey, body, {
      httpMetadata: { contentType },
    });
    return c.json({ ok: true });
  } catch (err) {
    console.error("[PUT /media/upload]", err);
    return c.json({ ok: false, error: "UPLOAD_FAILED" }, 500);
  }
});

app.post("/media/finalize", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  if (!c.env.MEDIA_BUCKET) {
    return c.json({ ok: false, error: "MEDIA_NOT_CONFIGURED" }, 503);
  }
  try {
    const body = (await c.req.json()) as { objectKey?: string; purpose?: string; eventId?: string; communityId?: string };
    const objectKey = (body.objectKey ?? "").trim();
    const purpose = (body.purpose ?? "avatar") as "avatar" | "event_banner" | "roadmap_attachment" | "community_avatar";

    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(
      sql,
      payload.email,
      (payload as { name?: string | null }).name,
    );

    if (purpose === "roadmap_attachment") {
      const expectedPrefix = `roadmap_attachments/${appUserId}/`;
      if (!objectKey.startsWith(expectedPrefix)) {
        return c.json({ ok: false, error: "FORBIDDEN" }, 403);
      }
      const obj = await c.env.MEDIA_BUCKET.head(objectKey);
      if (!obj) {
        return c.json({ ok: false, error: "OBJECT_NOT_FOUND" }, 404);
      }
      return c.json({ ok: true, objectKey });
    }

    if (purpose === "event_banner") {
      const expectedPrefix = `event_banners/${appUserId}/`;
      if (!objectKey.startsWith(expectedPrefix)) {
        return c.json({ ok: false, error: "FORBIDDEN" }, 403);
      }
      const eventId = body.eventId?.trim();
      if (!eventId) {
        return c.json({ ok: false, error: "MISSING_EVENT_ID" }, 400);
      }
      const obj = await c.env.MEDIA_BUCKET.head(objectKey);
      if (!obj) {
        return c.json({ ok: false, error: "OBJECT_NOT_FOUND" }, 404);
      }
      const ev = (await sql`SELECT id FROM newchums.events WHERE id = ${eventId} AND host_user_id = ${appUserId}`) as { id: string }[];
      if (ev.length === 0) {
        return c.json({ ok: false, error: "FORBIDDEN" }, 403);
      }
      await sql`UPDATE newchums.events SET banner_key = ${objectKey} WHERE id = ${eventId}`;
      return c.json({ ok: true, bannerUrl: `/events/${eventId}/banner?v=${Date.now()}` });
    }

    if (purpose === "community_avatar") {
      const expectedPrefix = `community_avatars/${appUserId}/`;
      if (!objectKey.startsWith(expectedPrefix)) {
        return c.json({ ok: false, error: "FORBIDDEN" }, 403);
      }
      const communityId = body.communityId?.trim();
      if (!communityId) {
        return c.json({ ok: false, error: "MISSING_COMMUNITY_ID" }, 400);
      }
      const obj = await c.env.MEDIA_BUCKET.head(objectKey);
      if (!obj) {
        return c.json({ ok: false, error: "OBJECT_NOT_FOUND" }, 404);
      }
      const cm = (await sql`SELECT id, owner_user_id FROM newchums.communities WHERE id = ${communityId}`) as { id: string; owner_user_id: string }[];
      if (cm.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
      const isSuperAdmin = ((await sql`SELECT role FROM newchums.users WHERE id = ${appUserId} LIMIT 1`) as { role: string | null }[])[0]?.role === "super_admin";
      if (cm[0].owner_user_id !== appUserId && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
      await sql`UPDATE newchums.communities SET avatar_key = ${objectKey}, updated_at = now() WHERE id = ${communityId}`;
      return c.json({ ok: true, avatarUrl: `/communities/${communityId}/avatar?v=${Date.now()}` });
    }

    if (!objectKey.startsWith("avatars/")) {
      return c.json({ ok: false, error: "INVALID_OBJECT_KEY" }, 400);
    }

    const expectedPrefix = `avatars/${appUserId}/`;
    if (!objectKey.startsWith(expectedPrefix)) {
      return c.json({ ok: false, error: "FORBIDDEN" }, 403);
    }

    const obj = await c.env.MEDIA_BUCKET.head(objectKey);
    if (!obj) {
      return c.json({ ok: false, error: "OBJECT_NOT_FOUND" }, 404);
    }

    await sql`
      UPDATE newchums.users
      SET avatar_key = ${objectKey}, avatar_updated_at = NOW()
      WHERE id = ${appUserId}
    `;

    const avatarUrl = `/users/${appUserId}/avatar?v=${Date.now()}`;
    return c.json({ ok: true, avatarUrl });
  } catch (err) {
    console.error("[POST /media/finalize]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.delete("/profile/avatar", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(
      sql,
      payload.email,
      (payload as { name?: string | null }).name,
    );
    await sql`
      UPDATE newchums.users
      SET avatar_key = NULL, avatar_updated_at = NULL
      WHERE id = ${appUserId}
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /profile/avatar]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.get("/users/:userId/avatar", async (c) => {
  const userId = c.req.param("userId");
  if (!userId || !c.env.MEDIA_BUCKET) {
    return c.notFound();
  }
  try {
    const sql = getSql(c.env);
    const rows = (await sql`
      SELECT avatar_key FROM newchums.users WHERE id = ${userId} LIMIT 1
    `) as { avatar_key: string | null }[];
    const avatarKey = rows[0]?.avatar_key ?? null;
    if (!avatarKey) {
      return c.notFound();
    }
    const obj = await c.env.MEDIA_BUCKET.get(avatarKey);
    if (!obj) {
      return c.notFound();
    }
    const body = obj.body;
    const headers = new Headers();
    const ct = obj.httpMetadata?.contentType ?? "image/jpeg";
    headers.set("Content-Type", ct);
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(body, { headers, status: 200 });
  } catch {
    return c.notFound();
  }
});

app.get("/events/:eventId/banner", async (c) => {
  const eventId = c.req.param("eventId");
  if (!eventId || !c.env.MEDIA_BUCKET) {
    console.warn(`[GET /events/${eventId}/banner] missing eventId or MEDIA_BUCKET binding`);
    return c.notFound();
  }
  try {
    const sql = getSql(c.env);
    const rows = (await sql`
      SELECT banner_key FROM newchums.events WHERE id = ${eventId} LIMIT 1
    `) as { banner_key: string | null }[];
    const bannerKey = rows[0]?.banner_key ?? null;
    if (!bannerKey) {
      return c.notFound();
    }
    const obj = await c.env.MEDIA_BUCKET.get(bannerKey);
    if (!obj) {
      console.warn(`[GET /events/${eventId}/banner] R2 object not found for key: ${bannerKey}`);
      return c.notFound();
    }
    const body = obj.body;
    const headers = new Headers();
    const ct = obj.httpMetadata?.contentType ?? "image/jpeg";
    headers.set("Content-Type", ct);
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(body, { headers, status: 200 });
  } catch (err) {
    console.error(`[GET /events/${eventId}/banner]`, err);
    return c.notFound();
  }
});

app.get("/communities/:communityId/avatar", async (c) => {
  const communityId = c.req.param("communityId");
  if (!communityId || !c.env.MEDIA_BUCKET) return c.notFound();
  try {
    const sql = getSql(c.env);
    const rows = (await sql`SELECT avatar_key FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { avatar_key: string | null }[];
    const avatarKey = rows[0]?.avatar_key ?? null;
    if (!avatarKey) return c.notFound();
    const obj = await c.env.MEDIA_BUCKET.get(avatarKey);
    if (!obj) return c.notFound();
    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(obj.body, { headers, status: 200 });
  } catch {
    return c.notFound();
  }
});

// ---- User routes ----

app.post("/user/username", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const body = await c.req.json<{ username?: string }>();
    const usernameValidation = validateUsername(body.username ?? "");
    if (!usernameValidation.valid) {
      return c.json({ ok: false, error: usernameValidation.error }, 400);
    }
    const contentCheck = validateCleanText(body.username ?? "", "username");
    if (!contentCheck.ok) {
      return c.json(
        { ok: false, error: "INAPPROPRIATE_TEXT", code: "INAPPROPRIATE_TEXT", field: "handle" },
        400,
      );
    }
    const usernameDisplay = normalizeUsernameDisplay(body.username!);
    const usernameNorm = normalizeUsernameForUniq(body.username!);
    const sql = getSql(c.env);
    const normalizedEmail = payload.email.trim().toLowerCase();
    const existingUser = (await sql`
      SELECT id, username FROM newchums.users
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `) as { id: string; username: string | null }[];
    if (existingUser.length === 0) {
      return c.json({ ok: false, error: "USER_NOT_FOUND" }, 404);
    }
    const existingUsername = (await sql`
      SELECT id FROM newchums.users
      WHERE username_norm = ${usernameNorm} AND id != ${existingUser[0].id}
      LIMIT 1
    `) as { id: string }[];
    if (existingUsername.length > 0) {
      return c.json({ ok: false, error: "USERNAME_TAKEN" }, 409);
    }
    await sql`
      UPDATE newchums.users
      SET username = ${usernameDisplay}, username_norm = ${usernameNorm}
      WHERE id = ${existingUser[0].id}
    `;
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /user/username]", msg, err);
    if (msg.includes("username_norm") && msg.includes("does not exist")) {
      return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
    }
    if (
      msg.includes("idx_users_username_norm") ||
      msg.includes("users_username_norm") ||
      msg.includes("duplicate key value") ||
      msg.includes("unique constraint")
    ) {
      return c.json({ ok: false, error: "USERNAME_TAKEN" }, 409);
    }
    if (msg.includes('relation "users" does not exist') || msg.includes('relation "newchums.users" does not exist')) {
      return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
    }
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.post("/user/date-of-birth", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const body = await c.req.json<{ date_of_birth?: string }>();
    const trimmedDob = body.date_of_birth?.trim() ?? "";
    if (!trimmedDob) {
      return c.json({ ok: false, error: "REQUIRED", code: "REQUIRED" }, 400);
    }
    const parts = parseDateOnly(trimmedDob);
    if (!parts) {
      return c.json(
        { ok: false, error: "INVALID_DATE", code: "INVALID_DATE" },
        400,
      );
    }
    const today = new Date();
    const birth = new Date(parts.y, parts.m - 1, parts.d);
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    if (birth > todayMidnight) {
      return c.json(
        { ok: false, error: "FUTURE_DATE", code: "FUTURE_DATE" },
        400,
      );
    }
    if (!isAtLeast18(trimmedDob)) {
      return c.json(
        {
          ok: false,
          error: "UNDERAGE",
          code: "UNDERAGE",
          message: "NewChums is currently available to people 18 and older.",
        },
        400,
      );
    }
    const parsedDob = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
    const normalizedEmail = payload.email.trim().toLowerCase();
    const sql = getSql(c.env);
    const existingUser = (await sql`
      SELECT id FROM newchums.users WHERE email = ${normalizedEmail} LIMIT 1
    `) as { id: string }[];
    if (existingUser.length === 0) {
      return c.json({ ok: false, error: "USER_NOT_FOUND" }, 404);
    }
    await sql`
      UPDATE newchums.users SET date_of_birth = ${parsedDob}
      WHERE id = ${existingUser[0].id}
    `;
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /user/date-of-birth]", msg, err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ---- End auth & user routes ----

// NOTE: Legacy POST /events (unqualified "events" table with creator_id) removed.
// Use the auth-protected POST /events below (newchums.events with host_user_id). See migration 024.

app.post("/dev/users", async (c) => {
  try {
    const body = await c.req.json<{
      email?: string;
      name?: string;
      password_hash?: string | null;
    }>();

    if (!body.email) {
      return c.json({ ok: false, error: "email is required" }, 400);
    }

    const sql = getSql(c.env);
    const columns: string[] = ["email", "name"];
    const params: Array<string | number | boolean | null> = [
      body.email,
      body.name ?? null,
    ];

    if (body.password_hash !== undefined) {
      columns.push("password_hash");
      params.push(body.password_hash ?? null);
    }

    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const query = `
      insert into newchums.users (${columns.join(", ")})
      values (${placeholders})
      returning ${DEV_USER_RETURN_COLUMNS}
    `;

    const rows = await sql.query(query, params);
    return c.json({ ok: true, user: rows[0] ?? null }, 201);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: message }, 500);
  }
});

app.get("/dev/users/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const sql = getSql(c.env);
    const rows = await sql.query(
      `select ${DEV_USER_RETURN_COLUMNS} from newchums.users where id = $1`,
      [id],
    );

    if (rows.length === 0) {
      return c.json({ ok: false, error: "User not found" }, 404);
    }

    return c.json({ ok: true, user: rows[0] });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: message }, 500);
  }
});

app.patch("/dev/users/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json<{
      name?: string;
      password_hash?: string | null;
    }>();

    const updates: Array<{ column: string; value: unknown }> = [];
    if (body.name !== undefined)
      updates.push({ column: "name", value: body.name });
    if (body.password_hash !== undefined) {
      updates.push({ column: "password_hash", value: body.password_hash });
    }

    if (updates.length === 0) {
      return c.json({ ok: false, error: "No valid fields to update" }, 400);
    }

    const setClauses = updates.map(
      (update, i) => `${update.column} = $${i + 1}`,
    );
    const params = updates.map((update) => update.value);
    params.push(id);

    const sql = getSql(c.env);
    const query = `
      update newchums.users
      set ${setClauses.join(", ")}
      where id = $${updates.length + 1}
      returning ${DEV_USER_RETURN_COLUMNS}
    `;
    const rows = await sql.query(query, params);

    if (rows.length === 0) {
      return c.json({ ok: false, error: "User not found" }, 404);
    }

    return c.json({ ok: true, user: rows[0] });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: message }, 500);
  }
});

app.delete("/dev/users/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const sql = getSql(c.env);
    const rows = await sql.query(
      "delete from newchums.users where id = $1 returning id",
      [id],
    );

    if (rows.length === 0) {
      return c.json({ ok: false, error: "User not found" }, 404);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: message }, 500);
  }
});

app.post("/email/verification", async (c) => {
  try {
    const body = await c.req.json<{
      to?: string;
      name?: string;
      verifyUrl?: string;
    }>();

    if (!body.to || !body.verifyUrl) {
      return c.json({ ok: false, error: "to and verifyUrl are required" }, 400);
    }

    await sendVerificationEmail(c.env, {
      to: body.to,
      name: body.name,
      verifyUrl: body.verifyUrl,
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: message }, 502);
  }
});

app.post("/email/password-reset", async (c) => {
  try {
    const body = await c.req.json<{
      to?: string;
      name?: string;
      resetUrl?: string;
    }>();

    if (!body.to || !body.resetUrl) {
      return c.json({ ok: false, error: "to and resetUrl are required" }, 400);
    }

    await sendPasswordResetEmail(c.env, {
      to: body.to,
      name: body.name,
      resetUrl: body.resetUrl,
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: message }, 502);
  }
});

app.post("/email/rsvp-confirmation", async (c) => {
  try {
    const body = await c.req.json<{
      to?: string;
      name?: string;
      eventTitle?: string;
      eventStartsAtISO?: string;
      eventLocation?: string;
      eventUrl?: string;
    }>();

    if (
      !body.to ||
      !body.eventTitle ||
      !body.eventStartsAtISO ||
      !body.eventUrl
    ) {
      return c.json(
        {
          ok: false,
          error: "to, eventTitle, eventStartsAtISO, and eventUrl are required",
        },
        400,
      );
    }

    await sendRsvpConfirmationEmail(c.env, {
      to: body.to,
      name: body.name,
      eventTitle: body.eventTitle,
      eventStartsAtISO: body.eventStartsAtISO,
      eventLocation: body.eventLocation,
      eventUrl: body.eventUrl,
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: message }, 502);
  }
});

app.post("/email/test", async (c) => {
  try {
    const body = await c.req.json<{ to?: string }>();
    if (!body.to) {
      return c.json({ ok: false, error: "to is required" }, 400);
    }

    const resetUrl = `${c.env.WEB_BASE_URL}/reset-password?token=dummy-token`;
    await sendPasswordResetEmail(c.env, { to: body.to, resetUrl });
    return c.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ ok: false, error: message }, 502);
  }
});

// ─── Admin helpers ───────────────────────────────────────────────────────────

/** Check if a user ID belongs to a super_admin. Used for QA plan access checks. */
async function checkIsSuperAdmin(
  sql: ReturnType<typeof getSql>,
  userId: string,
): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM newchums.users WHERE id = ${userId} AND role = 'super_admin' LIMIT 1
  `) as { "?column?": number }[];
  return rows.length > 0;
}

/** Batch-load super admin status for multiple user IDs. Returns a Set of super admin user IDs. */
async function batchLoadSuperAdminIds(
  sql: ReturnType<typeof getSql>,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = (await sql`
    SELECT id FROM newchums.users WHERE id = ANY(${userIds}::uuid[]) AND role = 'super_admin'
  `) as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

async function requireSuperAdmin(
  c: { req: Request; env: Bindings },
): Promise<{ id: string; email: string } | null> {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") return null;
  const sql = getSql(c.env);
  const rows = (await sql`
    SELECT id FROM users WHERE email = ${payload.email} AND role = 'super_admin' LIMIT 1
  `) as { id: string }[];
  if (rows.length === 0) return null;
  return { id: rows[0].id, email: payload.email };
}

type AdminInterestRow = {
  id: string;
  name: string;
  slug: string;
  category: string;
  created_at: string | null;
  is_deleted: boolean;
  created_by_user_id: string | null;
  username: string | null;
};

// ─── GET /admin/interests/categories ─────────────────────────────────────────

/** Returns distinct non-empty category values for the category combo-box. */
app.get("/admin/interests/categories", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  try {
    const sql = getSql(c.env);
    const rows = (await sql`
      SELECT DISTINCT category FROM newchums.interests
      WHERE category IS NOT NULL AND category != '' AND is_deleted = false
      ORDER BY category ASC
    `) as { category: string }[];
    return c.json({ ok: true, categories: rows.map((r) => r.category) });
  } catch (err) {
    console.error(err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ─── GET /admin/interests ────────────────────────────────────────────────────

app.get("/admin/interests", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  try {
    const sql = getSql(c.env);
    const q = c.req.query("q")?.trim();
    const likePattern = q ? `%${q.toLowerCase()}%` : null;

    const rows = likePattern
      ? ((await sql`
          SELECT i.id, i.name, i.slug, i.category, i.created_at, i.is_deleted,
                 i.created_by_user_id, u.username
          FROM interests i
          LEFT JOIN users u ON u.id = i.created_by_user_id
          WHERE LOWER(i.name) LIKE ${likePattern}
          ORDER BY i.name ASC
        `) as AdminInterestRow[])
      : ((await sql`
          SELECT i.id, i.name, i.slug, i.category, i.created_at, i.is_deleted,
                 i.created_by_user_id, u.username
          FROM interests i
          LEFT JOIN users u ON u.id = i.created_by_user_id
          ORDER BY i.name ASC
        `) as AdminInterestRow[]);

    return c.json({ ok: true, interests: rows });
  } catch (err) {
    console.error(err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ─── PATCH /admin/interests/:id ──────────────────────────────────────────────

app.patch("/admin/interests/:id", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "id required" } }, 400);

  let body: { name?: string; category?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "Invalid JSON" } }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const category = typeof body.category === "string" ? body.category.trim() : undefined;

  if (name !== undefined) {
    if (!name) return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "name cannot be empty" } }, 400);
    const v = validateInterestName(name);
    if (!v.valid) return c.json({ ok: false, error: { code: "INVALID_INPUT", message: v.error } }, 400);
  }

  if (name === undefined && category === undefined) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "Nothing to update" } }, 400);
  }

  try {
    const sql = getSql(c.env);

    const existing = (await sql`
      SELECT id FROM interests WHERE id = ${id} LIMIT 1
    `) as { id: string }[];
    if (existing.length === 0) {
      return c.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
    }

    if (name !== undefined && category !== undefined) {
      await sql`
        UPDATE interests
        SET name = ${name}, category = ${category},
            updated_at = now(), updated_by_user_id = ${admin.id}
        WHERE id = ${id}
      `;
    } else if (name !== undefined) {
      await sql`
        UPDATE interests
        SET name = ${name},
            updated_at = now(), updated_by_user_id = ${admin.id}
        WHERE id = ${id}
      `;
    } else if (category !== undefined) {
      await sql`
        UPDATE interests
        SET category = ${category},
            updated_at = now(), updated_by_user_id = ${admin.id}
        WHERE id = ${id}
      `;
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error(err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ─── POST /admin/interests/merge ─────────────────────────────────────────────

app.post("/admin/interests/merge", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  let body: { sourceInterestId?: string; targetInterestId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "Invalid JSON" } }, 400);
  }

  const { sourceInterestId, targetInterestId } = body;
  if (!sourceInterestId || !targetInterestId) {
    return c.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "sourceInterestId and targetInterestId are required" } },
      400,
    );
  }
  if (sourceInterestId === targetInterestId) {
    return c.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "Source and target must be different interests" } },
      400,
    );
  }

  try {
    const sql = getSql(c.env);

    // Validate both interests exist and neither is deleted (target must be active)
    const interests = (await sql`
      SELECT id, name, is_deleted FROM interests
      WHERE id = ANY(${[sourceInterestId, targetInterestId]})
    `) as { id: string; name: string; is_deleted: boolean }[];

    const sourceRow = interests.find((r) => r.id === sourceInterestId);
    const targetRow = interests.find((r) => r.id === targetInterestId);

    if (!sourceRow) return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Source interest not found" } }, 404);
    if (!targetRow) return c.json({ ok: false, error: { code: "NOT_FOUND", message: "Target interest not found" } }, 404);
    if (targetRow.is_deleted) return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "Target interest is deleted" } }, 400);

    // ── 1. Migrate user_interests ────────────────────────────────────────────
    const sourceUserRows = (await sql`
      SELECT user_id FROM user_interests WHERE interest_id = ${sourceInterestId}
    `) as { user_id: string }[];

    let movedCount = 0;
    let dedupedCount = 0;

    if (sourceUserRows.length > 0) {
      const sourceUserIds = sourceUserRows.map((r) => r.user_id);
      const alreadyHaveTarget = (await sql`
        SELECT user_id FROM user_interests
        WHERE interest_id = ${targetInterestId}
          AND user_id = ANY(${sourceUserIds})
      `) as { user_id: string }[];
      const alreadyHaveTargetSet = new Set(alreadyHaveTarget.map((r) => r.user_id));

      const toUpdate = sourceUserIds.filter((uid) => !alreadyHaveTargetSet.has(uid));
      const toDelete = sourceUserIds.filter((uid) => alreadyHaveTargetSet.has(uid));

      if (toUpdate.length > 0) {
        await sql`
          UPDATE user_interests
          SET interest_id = ${targetInterestId}
          WHERE interest_id = ${sourceInterestId}
            AND user_id = ANY(${toUpdate})
        `;
      }
      if (toDelete.length > 0) {
        await sql`
          DELETE FROM user_interests
          WHERE interest_id = ${sourceInterestId}
            AND user_id = ANY(${toDelete})
        `;
      }
      movedCount = toUpdate.length;
      dedupedCount = toDelete.length;
    }

    // ── 2. Migrate events (legacy single-interest FK) ─────────────────────────
    // Update the denormalised interest_id column on any event that still
    // points directly at the source.
    await sql`
      UPDATE newchums.events
      SET interest_id = ${targetInterestId}
      WHERE interest_id = ${sourceInterestId}
    `;

    // ── 3. Migrate event_interests (many-to-many) ─────────────────────────────
    const sourceEventRows = (await sql`
      SELECT event_id FROM newchums.event_interests
      WHERE interest_id = ${sourceInterestId}
    `) as { event_id: string }[];

    let eventsMovedCount = 0;
    let eventsDedupedCount = 0;

    if (sourceEventRows.length > 0) {
      const sourceEventIds = sourceEventRows.map((r) => r.event_id);

      // Which of those events already have the target interest linked?
      const alreadyHaveTargetEvents = (await sql`
        SELECT event_id FROM newchums.event_interests
        WHERE interest_id = ${targetInterestId}
          AND event_id = ANY(${sourceEventIds})
      `) as { event_id: string }[];
      const alreadyHaveTargetEventSet = new Set(alreadyHaveTargetEvents.map((r) => r.event_id));

      const eventsToUpdate = sourceEventIds.filter((eid) => !alreadyHaveTargetEventSet.has(eid));
      const eventsToDedup  = sourceEventIds.filter((eid) =>  alreadyHaveTargetEventSet.has(eid));

      // Remap events that don't yet have the target
      if (eventsToUpdate.length > 0) {
        await sql`
          UPDATE newchums.event_interests
          SET interest_id = ${targetInterestId}
          WHERE interest_id = ${sourceInterestId}
            AND event_id = ANY(${eventsToUpdate})
        `;
        eventsMovedCount = eventsToUpdate.length;
      }

      // Remove the now-duplicate source link for events that already have target
      if (eventsToDedup.length > 0) {
        await sql`
          DELETE FROM newchums.event_interests
          WHERE interest_id = ${sourceInterestId}
            AND event_id = ANY(${eventsToDedup})
        `;
        eventsDedupedCount = eventsToDedup.length;
      }
    }

    // ── 4. Soft-delete source interest ────────────────────────────────────────
    await sql`
      UPDATE interests
      SET is_deleted = true,
          deleted_at = now(),
          deleted_by_user_id = ${admin.id},
          merged_into_interest_id = ${targetInterestId}
      WHERE id = ${sourceInterestId}
    `;

    return c.json({
      ok: true,
      movedCount,
      dedupedCount,
      eventsMovedCount,
      eventsDedupedCount,
      sourceId: sourceInterestId,
      targetId: targetInterestId,
    });
  } catch (err) {
    console.error(err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ─── DELETE /admin/interests/:id (soft delete) ───────────────────────────────

app.delete("/admin/interests/:id", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "id required" } }, 400);

  try {
    const sql = getSql(c.env);

    const existing = (await sql`
      SELECT id, is_deleted FROM interests WHERE id = ${id} LIMIT 1
    `) as { id: string; is_deleted: boolean }[];
    if (existing.length === 0) {
      return c.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
    }
    if (existing[0].is_deleted) {
      return c.json({ ok: false, error: { code: "ALREADY_DELETED" } }, 409);
    }

    await sql`
      UPDATE interests
      SET is_deleted = true,
          deleted_at = now(),
          deleted_by_user_id = ${admin.id}
      WHERE id = ${id}
    `;

    // Remove all user connections, caller should merge first if they want to preserve them
    await sql`DELETE FROM user_interests WHERE interest_id = ${id}`;

    return c.json({ ok: true });
  } catch (err) {
    console.error(err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ─── POST /admin/interests/:id/restore ───────────────────────────────────────

app.post("/admin/interests/:id/restore", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "id required" } }, 400);

  try {
    const sql = getSql(c.env);

    const existing = (await sql`
      SELECT id, is_deleted FROM interests WHERE id = ${id} LIMIT 1
    `) as { id: string; is_deleted: boolean }[];
    if (existing.length === 0) {
      return c.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
    }
    if (!existing[0].is_deleted) {
      return c.json({ ok: false, error: { code: "NOT_DELETED", message: "Interest is not deleted" } }, 409);
    }

    await sql`
      UPDATE interests
      SET is_deleted = false,
          deleted_at = NULL,
          deleted_by_user_id = NULL,
          merged_into_interest_id = NULL,
          updated_at = now(),
          updated_by_user_id = ${admin.id}
      WHERE id = ${id}
    `;

    return c.json({ ok: true });
  } catch (err) {
    console.error(err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ─── GET /admin/users ─────────────────────────────────────────────────────────

type AdminUserRow = {
  id: string;
  created_at: string | null;
  last_active_at: string | null;
  email: string;
  username: string | null;
  name: string | null;
  role: string | null;
  is_suspended: boolean;
  suspended_at: string | null;
};

app.get("/admin/users", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  try {
    const sql = getSql(c.env);
    const q = c.req.query("q")?.trim();
    const likePattern = q ? `%${q.toLowerCase()}%` : null;

    const rows = likePattern
      ? ((await sql`
          SELECT id, created_at, last_active_at, email, username, name, role, is_suspended, suspended_at
          FROM users
          WHERE
            LOWER(email) LIKE ${likePattern}
            OR LOWER(COALESCE(username, '')) LIKE ${likePattern}
            OR LOWER(COALESCE(name, '')) LIKE ${likePattern}
            OR CAST(id AS TEXT) LIKE ${likePattern}
          ORDER BY created_at DESC NULLS LAST
        `) as AdminUserRow[])
      : ((await sql`
          SELECT id, created_at, last_active_at, email, username, name, role, is_suspended, suspended_at
          FROM users
          ORDER BY created_at DESC NULLS LAST
        `) as AdminUserRow[]);

    return c.json({ ok: true, users: rows });
  } catch (err) {
    console.error("[GET /admin/users]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ─── POST /admin/users/:id/suspend ───────────────────────────────────────────

app.post("/admin/users/:id/suspend", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "id required" } }, 400);

  let reason: string | null = null;
  try {
    const body = await c.req.json<{ reason?: string }>();
    reason = typeof body.reason === "string" ? body.reason.trim() || null : null;
  } catch {
    // reason is optional; proceed without it
  }

  try {
    const sql = getSql(c.env);

    const existing = (await sql`
      SELECT id, is_suspended FROM users WHERE id = ${id} LIMIT 1
    `) as { id: string; is_suspended: boolean }[];
    if (existing.length === 0) {
      return c.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
    }
    if (existing[0].is_suspended) {
      return c.json({ ok: false, error: { code: "ALREADY_SUSPENDED" } }, 409);
    }
    if (id === admin.id) {
      return c.json({ ok: false, error: { code: "CANNOT_SUSPEND_SELF" } }, 400);
    }

    await sql`
      UPDATE users
      SET is_suspended = true,
          suspended_at = now(),
          suspended_by_user_id = ${admin.id},
          suspension_reason = ${reason}
      WHERE id = ${id}
    `;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /admin/users/:id/suspend]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ─── POST /admin/users/:id/unsuspend ─────────────────────────────────────────

app.post("/admin/users/:id/unsuspend", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "id required" } }, 400);

  try {
    const sql = getSql(c.env);

    const existing = (await sql`
      SELECT id, is_suspended FROM users WHERE id = ${id} LIMIT 1
    `) as { id: string; is_suspended: boolean }[];
    if (existing.length === 0) {
      return c.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
    }
    if (!existing[0].is_suspended) {
      return c.json({ ok: false, error: { code: "NOT_SUSPENDED" } }, 409);
    }

    await sql`
      UPDATE users
      SET is_suspended = false,
          suspended_at = NULL,
          suspended_by_user_id = NULL,
          suspension_reason = NULL
      WHERE id = ${id}
    `;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /admin/users/:id/unsuspend]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ─── Admin user diagnostics (chum metrics / feedback inspection) ─────────────

/** GET /admin/users/:id/diagnostics, super-admin-only per-user metric diagnostics */
app.get("/admin/users/:id/diagnostics", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const userId = c.req.param("id");
  const sql = getSql(c.env);

  try {
    const userRows = (await sql`
      SELECT id, email, username, name, created_at, last_active_at, role, is_suspended
      FROM users WHERE id = ${userId} LIMIT 1
    `) as { id: string; email: string; username: string | null; name: string | null; created_at: string; last_active_at: string | null; role: string | null; is_suspended: boolean }[];
    if (userRows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const user = userRows[0];

    const metrics = (await sql`
      SELECT metric, score, signal_count, updated_at
      FROM newchums.user_metrics
      WHERE user_id = ${userId}
      ORDER BY metric
    `) as { metric: string; score: string; signal_count: number; updated_at: string }[];

    const preferences = (await sql`
      SELECT reliability_level, sociability_level, presentation_level, hosting_level, age_pref_years, updated_at
      FROM newchums.chum_preferences
      WHERE user_id = ${userId}
      LIMIT 1
    `) as { reliability_level: string; sociability_level: string; presentation_level: string; hosting_level: string; age_pref_years: number | null; updated_at: string }[];

    const attendanceIssues = (await sql`
      SELECT
        ai.id,
        ai.plan_id,
        ai.issue_type,
        ai.is_host_report,
        ai.confidence,
        ai.applied_penalty,
        ai.status,
        ai.created_at,
        ai.reporter_user_id,
        e.title AS plan_title,
        ru.name AS reporter_name,
        ru.username AS reporter_username
      FROM newchums.attendance_issues ai
      LEFT JOIN newchums.events e ON e.id = ai.plan_id
      LEFT JOIN newchums.users ru ON ru.id = ai.reporter_user_id
      WHERE ai.reported_user_id = ${userId}
      ORDER BY ai.created_at DESC
    `) as {
      id: string;
      plan_id: string;
      issue_type: string;
      is_host_report: boolean;
      confidence: string;
      applied_penalty: string;
      status: string;
      created_at: string;
      reporter_user_id: string;
      plan_title: string | null;
      reporter_name: string | null;
      reporter_username: string | null;
    }[];

    const conductReports = (await sql`
      SELECT reason, COUNT(*)::int AS count
      FROM newchums.conduct_reports
      WHERE reported_user_id = ${userId}
      GROUP BY reason
      ORDER BY reason
    `) as { reason: string; count: number }[];

    // Feedback received (anonymized, no reporter identity)
    const feedbackReceived = (await sql`
      SELECT prompt, response, COUNT(*)::int AS count
      FROM newchums.plan_feedback
      WHERE reviewee_user_id = ${userId}
      GROUP BY prompt, response
      ORDER BY prompt, response
    `) as { prompt: string; response: string; count: number }[];

    // Recent feedback timeline (includes reviewer identity for super-admin diagnostics)
    const recentFeedback = (await sql`
      SELECT
        pf.prompt,
        pf.response,
        pf.created_at,
        e.title AS plan_title,
        e.starts_at AS plan_date,
        ru.id AS reviewer_user_id,
        ru.name AS reviewer_name,
        ru.username AS reviewer_username
      FROM newchums.plan_feedback pf
      JOIN newchums.events e ON e.id = pf.plan_id
      JOIN newchums.users ru ON ru.id = pf.reviewer_user_id
      WHERE pf.reviewee_user_id = ${userId}
      ORDER BY pf.created_at DESC
      LIMIT 50
    `) as {
      prompt: string;
      response: string;
      created_at: string;
      plan_title: string;
      plan_date: string;
      reviewer_user_id: string;
      reviewer_name: string | null;
      reviewer_username: string | null;
    }[];

    // Plans attended count for context
    const planStats = (await sql`
      SELECT
        (SELECT COUNT(*)::int FROM newchums.event_rsvps WHERE user_id = ${userId} AND status = 'going') AS plans_going,
        (SELECT COUNT(*)::int FROM newchums.events WHERE host_user_id = ${userId} AND COALESCE(is_qa, false) = false) AS plans_hosted
    `) as { plans_going: number; plans_hosted: number }[];

    const objectivesResult = await evaluateObjectives(sql, userId);
    const objectivesData = {
      tutorialOff: objectivesResult.tutorialOff,
      nextStepKey: objectivesResult.nextStep?.key ?? null,
      completed: objectivesResult.objectives.filter((o) => o.completed).map((o) => ({
        key: o.key,
        title: o.title,
        completedAt: o.completedAt,
      })),
      incomplete: objectivesResult.objectives.filter((o) => !o.completed).map((o) => ({
        key: o.key,
        title: o.title,
      })),
    };

    return c.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        createdAt: user.created_at,
        lastActiveAt: user.last_active_at,
        role: user.role,
        isSuspended: user.is_suspended,
      },
      metrics: metrics.map((m) => ({
        metric: m.metric,
        score: parseFloat(m.score),
        signalCount: m.signal_count,
        updatedAt: m.updated_at,
      })),
      preferences: preferences.length > 0
        ? {
            reliability: preferences[0].reliability_level,
            sociability: preferences[0].sociability_level,
            presentation: preferences[0].presentation_level,
            hosting: preferences[0].hosting_level,
            ageYears: preferences[0].age_pref_years ?? null,
            updatedAt: preferences[0].updated_at,
          }
        : null,
      attendanceIssues: attendanceIssues.map((ai) => ({
        id: ai.id,
        planId: ai.plan_id,
        planTitle: ai.plan_title,
        issueType: ai.issue_type,
        isHostReport: ai.is_host_report,
        confidence: parseFloat(ai.confidence),
        appliedPenalty: parseFloat(ai.applied_penalty),
        status: ai.status,
        createdAt: ai.created_at,
        reporterUserId: ai.reporter_user_id,
        reporterLabel:
          (ai.reporter_name && ai.reporter_name.trim()) ||
          (ai.reporter_username && `@${ai.reporter_username.replace(/^@/, "")}`) ||
          "Unknown user",
      })),
      conductReports,
      feedbackReceived,
      recentFeedback: recentFeedback.map((f) => {
        const reporterLabel =
          (f.reviewer_name && f.reviewer_name.trim()) ||
          (f.reviewer_username && `@${f.reviewer_username.replace(/^@/, "")}`) ||
          "Unknown user";
        return {
          prompt: f.prompt,
          response: f.response,
          createdAt: f.created_at,
          planTitle: f.plan_title,
          planDate: f.plan_date,
          reviewerUserId: f.reviewer_user_id,
          reporterLabel,
        };
      }),
      planStats: planStats[0] ?? { plans_going: 0, plans_hosted: 0 },
      objectives: objectivesData,
    });
  } catch (err) {
    console.error("[GET /admin/users/:id/diagnostics]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** PUT /admin/users/:id/metrics, super-admin-only: manually set a user's hidden metric score */
app.put("/admin/users/:id/metrics", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const userId = c.req.param("id");
  const sql = getSql(c.env);

  const body = await c.req.json<{ metric?: string; score?: number; signalCount?: number }>();
  const { metric, score, signalCount } = body;

  const validMetrics = ["reliability", "sociability", "presentation", "hosting_skills", "match_quality"];
  if (!metric || !validMetrics.includes(metric)) {
    return c.json({ ok: false, error: "INVALID_METRIC" }, 400);
  }
  if (typeof score !== "number" || score < 0 || score > 100) {
    return c.json({ ok: false, error: "INVALID_SCORE" }, 400);
  }

  const sc = typeof signalCount === "number" && signalCount >= 0 ? Math.floor(signalCount) : undefined;

  try {
    const userCheck = (await sql`SELECT id FROM newchums.users WHERE id = ${userId}`) as { id: string }[];
    if (userCheck.length === 0) return c.json({ ok: false, error: "USER_NOT_FOUND" }, 404);

    if (sc !== undefined) {
      await sql`
        INSERT INTO newchums.user_metrics (user_id, metric, score, signal_count, updated_at)
        VALUES (${userId}, ${metric}, ${score.toFixed(2)}, ${sc}, NOW())
        ON CONFLICT (user_id, metric) DO UPDATE SET
          score = ${score.toFixed(2)},
          signal_count = ${sc},
          updated_at = NOW()
      `;
    } else {
      await sql`
        INSERT INTO newchums.user_metrics (user_id, metric, score, signal_count, updated_at)
        VALUES (${userId}, ${metric}, ${score.toFixed(2)}, 0, NOW())
        ON CONFLICT (user_id, metric) DO UPDATE SET
          score = ${score.toFixed(2)},
          updated_at = NOW()
      `;
    }

    console.log(`[PUT /admin/users/:id/metrics] admin=${admin.email} set ${metric}=${score.toFixed(2)} for user=${userId}`);

    return c.json({ ok: true, metric, score: parseFloat(score.toFixed(2)) });
  } catch (err) {
    console.error("[PUT /admin/users/:id/metrics]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PUT /admin/attendance-issues/:id/status, super-admin: dismiss or confirm an attendance issue */
app.put("/admin/attendance-issues/:id/status", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const issueId = c.req.param("id");
  const body = await c.req.json<{ status: string }>();

  if (!["dismissed", "confirmed"].includes(body.status))
    return c.json({ ok: false, error: "INVALID_STATUS" }, 400);

  try {
    const existing = (await sql`
      SELECT id, status FROM newchums.attendance_issues WHERE id = ${issueId}
    `) as { id: string; status: string }[];
    if (existing.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (existing[0].status === body.status)
      return c.json({ ok: true, status: body.status });

    const newConfidence = body.status === "dismissed" ? 0 : 1.0;
    await adjustReliabilityPenalty(sql, issueId, newConfidence, body.status);

    console.log(`[PUT /admin/attendance-issues/:id/status] admin=${admin.email} set issue=${issueId} to ${body.status}`);
    return c.json({ ok: true, status: body.status });
  } catch (err) {
    console.error("[PUT /admin/attendance-issues/:id/status]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Admin concern reports ───────────────────────────────────────────────────

/** GET /admin/concern-reports, list all concern/conduct reports */
app.get("/admin/concern-reports", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  try {
    const reports = (await sql`
      SELECT
        cr.id,
        cr.plan_id,
        cr.reason,
        cr.details,
        cr.status,
        cr.created_at,
        e.title AS plan_title,
        reporter.id AS reporter_id,
        reporter.name AS reporter_name,
        reporter.username AS reporter_username,
        reporter.email AS reporter_email,
        reported.id AS reported_id,
        reported.name AS reported_name,
        reported.username AS reported_username,
        reported.email AS reported_email
      FROM newchums.conduct_reports cr
      LEFT JOIN newchums.events e ON e.id = cr.plan_id
      LEFT JOIN newchums.users reporter ON reporter.id = cr.reporter_user_id
      LEFT JOIN newchums.users reported ON reported.id = cr.reported_user_id
      ORDER BY cr.created_at DESC
      LIMIT 200
    `) as {
      id: string;
      plan_id: string;
      reason: string;
      details: string | null;
      status: string;
      created_at: string;
      plan_title: string | null;
      reporter_id: string;
      reporter_name: string | null;
      reporter_username: string | null;
      reporter_email: string;
      reported_id: string;
      reported_name: string | null;
      reported_username: string | null;
      reported_email: string;
    }[];

    return c.json({
      ok: true,
      reports: reports.map((r) => ({
        id: r.id,
        planId: r.plan_id,
        planTitle: r.plan_title,
        reason: r.reason,
        details: r.details,
        status: r.status,
        createdAt: r.created_at,
        reporter: {
          id: r.reporter_id,
          name: r.reporter_name,
          username: r.reporter_username,
          email: r.reporter_email,
        },
        reported: {
          id: r.reported_id,
          name: r.reported_name,
          username: r.reported_username,
          email: r.reported_email,
        },
      })),
    });
  } catch (err) {
    console.error("[GET /admin/concern-reports]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PUT /admin/concern-reports/:id/status, update concern report status */
app.put("/admin/concern-reports/:id/status", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const reportId = c.req.param("id");
  const body = await c.req.json<{ status: string }>();

  if (!["new", "reviewed", "closed"].includes(body.status))
    return c.json({ ok: false, error: "INVALID_STATUS" }, 400);

  try {
    const result = (await sql`
      UPDATE newchums.conduct_reports SET status = ${body.status}
      WHERE id = ${reportId}
      RETURNING id
    `) as { id: string }[];
    if (result.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    console.log(`[PUT /admin/concern-reports/:id/status] admin=${admin.email} set report=${reportId} to ${body.status}`);
    return c.json({ ok: true, status: body.status });
  } catch (err) {
    console.error("[PUT /admin/concern-reports/:id/status]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Admin badge counts & mark-viewed ────────────────────────────────────────

/** GET /admin/badge-counts, returns new-item counts since admin last viewed each section */
app.get("/admin/badge-counts", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  try {
    const timestamps = (await sql`
      SELECT section, last_viewed_at FROM newchums.admin_view_timestamps
      WHERE admin_user_id = ${admin.id}
    `) as { section: string; last_viewed_at: string }[];
    const tsMap: Record<string, string> = {};
    for (const t of timestamps) tsMap[t.section] = t.last_viewed_at;

    const usersTs = tsMap["users"] ?? "1970-01-01T00:00:00Z";
    const interestsTs = tsMap["interests"] ?? "1970-01-01T00:00:00Z";
    const plansTs = tsMap["plans"] ?? "1970-01-01T00:00:00Z";
    const roadmapTs = tsMap["roadmap"] ?? "1970-01-01T00:00:00Z";
    const safetyTs = tsMap["safety"] ?? "1970-01-01T00:00:00Z";
    const communitiesTs = tsMap["communities"] ?? "1970-01-01T00:00:00Z";
    const shoutoutsTs = tsMap["shoutouts"] ?? "1970-01-01T00:00:00Z";

    const counts = (await sql`
      SELECT
        (SELECT COUNT(*)::int FROM newchums.users WHERE created_at > ${usersTs}) AS new_users,
        (SELECT COUNT(*)::int FROM newchums.interests WHERE created_at > ${interestsTs} AND is_deleted = false) AS new_interests,
        (SELECT COUNT(*)::int FROM newchums.events WHERE created_at > ${plansTs} AND status != 'draft' AND COALESCE(is_qa, false) = false) AS new_plans,
        (SELECT COUNT(*)::int FROM newchums.roadmap_items WHERE created_at > ${roadmapTs} AND is_removed = false) AS new_roadmap,
        (SELECT COUNT(*)::int FROM newchums.conduct_reports WHERE created_at > ${safetyTs}) AS new_safety,
        (SELECT COUNT(*)::int FROM newchums.communities WHERE created_at > ${communitiesTs}) AS new_communities,
        (SELECT COUNT(*)::int FROM newchums.shoutouts WHERE created_at > ${shoutoutsTs} AND status = 'pending') AS new_shoutouts
    `) as {
      new_users: number;
      new_interests: number;
      new_plans: number;
      new_roadmap: number;
      new_safety: number;
      new_communities: number;
      new_shoutouts: number;
    }[];

    return c.json({
      ok: true,
      users: counts[0].new_users,
      interests: counts[0].new_interests,
      plans: counts[0].new_plans,
      roadmap: counts[0].new_roadmap,
      safety: counts[0].new_safety,
      communities: counts[0].new_communities,
      shoutouts: counts[0].new_shoutouts,
    });
  } catch (err) {
    console.error("[GET /admin/badge-counts]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /admin/mark-viewed, mark a section as viewed */
app.post("/admin/mark-viewed", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const section = String(body.section ?? "");
  if (!["users", "interests", "plans", "roadmap", "safety", "communities", "shoutouts"].includes(section))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid section" }, 400);

  const sql = getSql(c.env);
  try {
    await sql`
      INSERT INTO newchums.admin_view_timestamps (admin_user_id, section, last_viewed_at)
      VALUES (${admin.id}, ${section}, NOW())
      ON CONFLICT (admin_user_id, section) DO UPDATE SET last_viewed_at = NOW()
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /admin/mark-viewed]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /admin/plans, list all plans for admin moderation */
app.get("/admin/plans", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const q = c.req.query("q")?.trim();
  const statusFilter = c.req.query("status") ?? "all";
  const likePattern = q ? `%${q.toLowerCase()}%` : null;

  try {
    const rows = (await sql`
      SELECT
        e.id, e.title, e.starts_at, e.status, e.visibility,
        e.host_user_id, e.created_at, e.canceled_at, e.max_seats,
        e.location_type, e.location_name, e.location_address,
        h.name AS host_name, h.username AS host_username, h.email AS host_email,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'going') AS going_count,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'maybe') AS maybe_count,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id) AS total_rsvps
      FROM newchums.events e
      LEFT JOIN newchums.users h ON h.id = e.host_user_id
      WHERE e.status != 'draft'
        ${likePattern ? sql`AND (LOWER(e.title) LIKE ${likePattern} OR LOWER(COALESCE(h.name, '')) LIKE ${likePattern} OR LOWER(COALESCE(h.email, '')) LIKE ${likePattern})` : sql``}
        ${statusFilter === "published" ? sql`AND e.status = 'published' AND e.canceled_at IS NULL` : sql``}
        ${statusFilter === "canceled" ? sql`AND e.status = 'canceled'` : sql``}
        ${statusFilter === "upcoming" ? sql`AND e.status = 'published' AND e.canceled_at IS NULL AND e.starts_at >= NOW()` : sql``}
        ${statusFilter === "past" ? sql`AND e.status = 'published' AND e.canceled_at IS NULL AND e.starts_at < NOW()` : sql``}
      ORDER BY e.created_at DESC
      LIMIT 200
    `) as Array<{
      id: string; title: string; starts_at: string; status: string; visibility: string;
      host_user_id: string; created_at: string; canceled_at: string | null; max_seats: number | null;
      location_type: string; location_name: string | null; location_address: string | null;
      host_name: string | null; host_username: string | null; host_email: string | null;
      going_count: number; maybe_count: number; total_rsvps: number;
    }>;

    return c.json({ ok: true, plans: rows });
  } catch (err) {
    console.error("[GET /admin/plans]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /admin/plans/:id/remove, admin hard-deletes an event and notifies the host */
app.post("/admin/plans/:id/remove", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const eventId = c.req.param("id");
  let reason = "";
  try { const body = await c.req.json<{ reason?: string }>(); reason = typeof body.reason === "string" ? body.reason.trim() : ""; } catch { /* no body is fine */ }

  const sql = getSql(c.env);
  try {
    const ev = (await sql`
      SELECT e.id, e.title, e.host_user_id, u.email AS host_email, u.name AS host_name, u.username AS host_username
      FROM newchums.events e
      JOIN newchums.users u ON u.id = e.host_user_id
      WHERE e.id = ${eventId}
    `) as { id: string; title: string; host_user_id: string; host_email: string; host_name: string | null; host_username: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const { title, host_email, host_name, host_username } = ev[0];

    await sql`DELETE FROM newchums.events WHERE id = ${eventId}`;

    const displayName = host_name || host_username?.replace(/^@/, "") || "there";
    try {
      await sendPlanRemovedByAdminEmail(c.env, {
        to: host_email,
        hostName: displayName,
        eventTitle: title,
        reason: reason || undefined,
      });
    } catch (emailErr) {
      console.error("[POST /admin/plans/:id/remove] email error (non-fatal):", emailErr);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /admin/plans/:id/remove]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── GET /admin/kpis ─────────────────────────────────────────────────────────

app.get("/admin/kpis", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const rawDays = c.req.query("days");
  const wantAll = rawDays === "0" || rawDays === "all";
  let rangeDays: number;
  let startDateIso: string;

  if (wantAll) {
    const [earliest] = (await sql`SELECT MIN(created_at) AS earliest FROM newchums.users`) as Array<{ earliest: string | null }>;
    const earliestMs = earliest?.earliest ? new Date(earliest.earliest).getTime() : Date.now();
    rangeDays = Math.max(7, Math.ceil((Date.now() - earliestMs) / 86_400_000));
    startDateIso = earliest?.earliest ? new Date(earliestMs).toISOString() : new Date().toISOString();
  } else {
    rangeDays = Math.max(Number(rawDays) || 90, 7);
    startDateIso = new Date(Date.now() - rangeDays * 86_400_000).toISOString();
  }

  // Auto-select granularity based on range length
  const growthGranularity = rangeDays <= 90 ? "day" : rangeDays <= 365 ? "week" : "month";
  const sampleInterval = rangeDays <= 90 ? "7 days" : rangeDays <= 365 ? "14 days" : "30 days";

  try {
    // ── Growth: signups + cumulative (adaptive granularity via DATE_TRUNC) ──
    const signupRows = (await sql`
      WITH bucketed AS (
        SELECT DATE(DATE_TRUNC(${growthGranularity}, created_at)) AS d, COUNT(*)::int AS cnt
        FROM newchums.users
        WHERE created_at >= ${startDateIso}::timestamptz
        GROUP BY 1
        ORDER BY d
      ),
      base AS (
        SELECT COUNT(*)::int AS cnt
        FROM newchums.users
        WHERE created_at < ${startDateIso}::timestamptz
      )
      SELECT d AS date, bucketed.cnt AS count,
             (SELECT cnt FROM base) + SUM(bucketed.cnt) OVER (ORDER BY d) AS cumulative
      FROM bucketed
      ORDER BY d
    `) as Array<{ date: string; count: number; cumulative: number }>;

    // ── Growth: plans created (adaptive granularity) ──
    const planRows = (await sql`
      SELECT DATE(DATE_TRUNC(${growthGranularity}, created_at)) AS date, COUNT(*)::int AS count
      FROM newchums.events
      WHERE status IN ('published', 'canceled')
        AND COALESCE(is_qa, false) = false
        AND created_at >= ${startDateIso}::timestamptz
      GROUP BY 1
      ORDER BY date
    `) as Array<{ date: string; count: number }>;

    // ── Participation (current snapshot) ──
    const [partRow] = (await sql`
      WITH total AS (
        SELECT COUNT(*)::int AS cnt FROM newchums.users
      ),
      participants AS (
        SELECT user_id, COUNT(DISTINCT plan_id)::int AS plan_count FROM (
          SELECT host_user_id AS user_id, id AS plan_id
          FROM newchums.events WHERE status IN ('published', 'canceled') AND COALESCE(is_qa, false) = false
          UNION ALL
          SELECT er.user_id, er.event_id AS plan_id
          FROM newchums.event_rsvps er
          WHERE er.user_id IS NOT NULL AND er.status = 'going'
        ) t
        GROUP BY user_id
      ),
      hosts AS (
        SELECT COUNT(DISTINCT host_user_id)::int AS cnt
        FROM newchums.events WHERE status IN ('published', 'canceled') AND COALESCE(is_qa, false) = false
      )
      SELECT
        (SELECT cnt FROM total) AS total_users,
        COUNT(*)::int AS participated_one,
        COUNT(*) FILTER (WHERE plan_count >= 2)::int AS participated_two,
        (SELECT cnt FROM hosts) AS hosted_one
      FROM participants
    `) as Array<{
      total_users: number;
      participated_one: number;
      participated_two: number;
      hosted_one: number;
    }>;

    // ── Participation over time (adaptive sample interval) ──
    const partSeries = (await sql`
      SELECT
        d::date AS date,
        (SELECT COUNT(*) FROM newchums.users WHERE created_at < d + INTERVAL '1 day')::int AS total_users,
        (SELECT COUNT(DISTINCT user_id) FROM (
          SELECT host_user_id AS user_id FROM newchums.events
            WHERE status IN ('published', 'canceled') AND COALESCE(is_qa, false) = false AND created_at < d + INTERVAL '1 day'
          UNION
          SELECT user_id FROM newchums.event_rsvps
            WHERE user_id IS NOT NULL AND status = 'going' AND created_at < d + INTERVAL '1 day'
        ) t)::int AS participated_one,
        (SELECT COUNT(*) FROM (
          SELECT user_id FROM (
            SELECT host_user_id AS user_id, id AS plan_id FROM newchums.events
              WHERE status IN ('published', 'canceled') AND COALESCE(is_qa, false) = false AND created_at < d + INTERVAL '1 day'
            UNION ALL
            SELECT user_id, event_id AS plan_id FROM newchums.event_rsvps
              WHERE user_id IS NOT NULL AND status = 'going' AND created_at < d + INTERVAL '1 day'
          ) t GROUP BY user_id HAVING COUNT(DISTINCT plan_id) >= 2
        ) t2)::int AS participated_two,
        (SELECT COUNT(DISTINCT host_user_id) FROM newchums.events
          WHERE status IN ('published', 'canceled') AND COALESCE(is_qa, false) = false AND created_at < d + INTERVAL '1 day')::int AS hosted_one
      FROM generate_series(
        ${startDateIso}::date,
        NOW()::date,
        ${sampleInterval}::interval
      ) d
      ORDER BY d
    `) as Array<{ date: string; total_users: number; participated_one: number; participated_two: number; hosted_one: number }>;

    // ── Activity (current snapshot) ──
    const [actRow] = (await sql`
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '7 days')::int  AS active_7d,
        COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '30 days')::int AS active_30d
      FROM newchums.users
    `) as Array<{ total_users: number; active_7d: number; active_30d: number }>;

    // ── Activity over time (adaptive sample interval) ──
    const actSeries = (await sql`
      SELECT
        d::date AS date,
        (SELECT COUNT(*) FROM newchums.users WHERE created_at < d + INTERVAL '1 day')::int AS total_users,
        (SELECT COUNT(*) FROM newchums.users
          WHERE last_active_at >= d - INTERVAL '29 days' AND last_active_at < d + INTERVAL '1 day')::int AS active_30d,
        (SELECT COUNT(*) FROM newchums.users
          WHERE last_active_at >= d - INTERVAL '6 days' AND last_active_at < d + INTERVAL '1 day')::int AS active_7d
      FROM generate_series(
        ${startDateIso}::date,
        NOW()::date,
        ${sampleInterval}::interval
      ) d
      ORDER BY d
    `) as Array<{ date: string; total_users: number; active_30d: number; active_7d: number }>;

    // ── Plan health (current snapshot) ──
    const [healthRow] = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE starts_at < NOW() AND status = 'published' AND canceled_at IS NULL)::int  AS completed,
        COUNT(*) FILTER (WHERE status = 'canceled' OR canceled_at IS NOT NULL)::int                       AS canceled,
        COUNT(*) FILTER (WHERE starts_at < NOW())::int                                                    AS total_past,
        COUNT(*)::int                                                                                     AS total_all
      FROM newchums.events
      WHERE status IN ('published', 'canceled')
    `) as Array<{ completed: number; canceled: number; total_past: number; total_all: number }>;

    // ── Average fill rate (only capped plans that already started) ──
    const [fillRow] = (await sql`
      SELECT
        COUNT(*)::int AS plan_count,
        ROUND(AVG(LEAST(1.0, going::numeric / max_seats)), 4) AS avg_fill
      FROM (
        SELECT e.id, e.max_seats,
               COUNT(*) FILTER (WHERE er.status = 'going')::int AS going
        FROM newchums.events e
        LEFT JOIN newchums.event_rsvps er ON er.event_id = e.id AND er.user_id IS NOT NULL
        WHERE e.max_seats IS NOT NULL AND e.max_seats > 0
          AND e.status IN ('published', 'canceled')
          AND e.starts_at < NOW()
        GROUP BY e.id, e.max_seats
      ) t
    `) as Array<{ plan_count: number; avg_fill: number | null }>;

    // ── Plan health over time (adaptive sample interval) ──
    const healthSeries = (await sql`
      SELECT
        d::date AS date,
        (SELECT COUNT(*) FROM newchums.events
          WHERE status IN ('published', 'canceled') AND starts_at < d + INTERVAL '1 day')::int AS total_past,
        (SELECT COUNT(*) FROM newchums.events
          WHERE status = 'published' AND canceled_at IS NULL AND starts_at < d + INTERVAL '1 day')::int AS completed,
        (SELECT COUNT(*) FROM newchums.events
          WHERE (status = 'canceled' OR canceled_at IS NOT NULL) AND created_at < d + INTERVAL '1 day')::int AS canceled,
        (SELECT COUNT(*) FROM newchums.events
          WHERE status IN ('published', 'canceled') AND created_at < d + INTERVAL '1 day')::int AS total_at_date
      FROM generate_series(
        ${startDateIso}::date,
        NOW()::date,
        ${sampleInterval}::interval
      ) d
      ORDER BY d
    `) as Array<{ date: string; total_past: number; completed: number; canceled: number; total_at_date: number }>;

    const totalPast = healthRow.total_past || 0;
    const totalAll = healthRow.total_all || 0;

    const safePct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 10000) / 10000 : null;

    return c.json({
      ok: true,
      data: {
        rangeDays,
        granularity: growthGranularity,
        growth: {
          totalUsers: (partRow.total_users ?? 0) as number,
          dailySignups: signupRows.map((r) => ({ date: r.date, count: Number(r.count) })),
          cumulativeUsers: signupRows.map((r) => ({ date: r.date, count: Number(r.cumulative) })),
          dailyPlans: planRows.map((r) => ({ date: r.date, count: Number(r.count) })),
        },
        participation: {
          totalUsers: Number(partRow.total_users ?? 0),
          participatedOne: Number(partRow.participated_one ?? 0),
          participatedTwo: Number(partRow.participated_two ?? 0),
          hostedOne: Number(partRow.hosted_one ?? 0),
          series: partSeries.map((r) => ({
            date: r.date,
            participatedOnePct: safePct(Number(r.participated_one), Number(r.total_users)),
            participatedTwoPct: safePct(Number(r.participated_two), Math.max(Number(r.participated_one), 1)),
            hostedOnePct: safePct(Number(r.hosted_one), Number(r.total_users)),
          })),
        },
        activity: {
          totalUsers: Number(actRow.total_users ?? 0),
          active7d: Number(actRow.active_7d ?? 0),
          active30d: Number(actRow.active_30d ?? 0),
          series: actSeries.map((r) => ({
            date: r.date,
            active30dPct: safePct(Number(r.active_30d), Number(r.total_users)),
            active7dPct: safePct(Number(r.active_7d), Number(r.total_users)),
          })),
        },
        planHealth: {
          completed: Number(healthRow.completed ?? 0),
          canceled: Number(healthRow.canceled ?? 0),
          totalPast,
          totalAll,
          completionRate: totalPast > 0 ? Number((healthRow.completed / totalPast).toFixed(4)) : null,
          cancellationRate: totalAll > 0 ? Number((healthRow.canceled / totalAll).toFixed(4)) : null,
          avgFillRate: fillRow.avg_fill != null ? Number(fillRow.avg_fill) : null,
          fillRatePlanCount: Number(fillRow.plan_count ?? 0),
          series: healthSeries.map((r) => ({
            date: r.date,
            completionPct: safePct(Number(r.completed), Math.max(Number(r.total_past), 1)),
            cancellationPct: safePct(Number(r.canceled), Math.max(Number(r.total_at_date), 1)),
          })),
        },
      },
    });
  } catch (err) {
    console.error("[GET /admin/kpis]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ── Growth loop KPI filters ──────────────────────────────────────────────────

app.get("/admin/kpis/growth-loop/filters", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  try {
    // Fetch raw location_area values, then normalize to city-level.
    // location_area can be "London, ON", "Old East Village, London, ON", etc.
    // We extract the trailing "City, Province" (last 2 segments) to group by city.
    const rawCities = (await sql`
      SELECT DISTINCT location_area FROM newchums.events
      WHERE location_area IS NOT NULL AND location_area != '' AND status IN ('published', 'canceled')
    `) as { location_area: string }[];

    const citySet = new Set<string>();
    for (const r of rawCities) {
      const parts = r.location_area.split(",").map((s) => s.trim()).filter(Boolean);
      // Take the last 2 segments as city-level (e.g. "London, ON" from "Byron, London, ON")
      const cityParts = parts.length >= 2 ? parts.slice(-2) : parts;
      citySet.add(cityParts.join(", "));
    }
    const cities = [...citySet].sort();

    const interests = (await sql`
      SELECT DISTINCT i.id, i.name FROM newchums.interests i
      JOIN newchums.event_interests ei ON ei.interest_id = i.id
      JOIN newchums.events e ON e.id = ei.event_id
      WHERE i.is_deleted = false AND e.status IN ('published', 'canceled')
      ORDER BY i.name
    `) as { id: string; name: string }[];
    const communities = (await sql`
      SELECT DISTINCT cm.id, cm.name FROM newchums.communities cm
      JOIN newchums.events e ON e.community_id = cm.id
      WHERE e.status IN ('published', 'canceled')
      ORDER BY cm.name
    `) as { id: string; name: string }[];
    return c.json({ ok: true, cities, interests, communities });
  } catch (err) {
    console.error("[GET /admin/kpis/growth-loop/filters]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ── Growth loop KPI metrics ─────────────────────────────────────────────────

app.get("/admin/kpis/growth-loop", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);

  const city = c.req.query("city")?.trim() || null;
  const interestId = c.req.query("interestId")?.trim() || null;
  const communityId = c.req.query("communityId")?.trim() || null;

  try {
    // Build filter clause fragments. The neon tagged template doesn't support
    // conditional WHERE parts elegantly, so we run a filtered_events CTE query
    // and then join against it for each metric.

    // Metric 1: First-plan activation (invite to first attendance)
    const m1 = (await sql`
      WITH fe AS (
        SELECT e.id, e.host_user_id, e.starts_at, e.status
        FROM newchums.events e
        WHERE e.status IN ('published', 'canceled')
          AND (${city}::text IS NULL OR e.location_area ILIKE '%' || ${city} || '%')
          AND (${interestId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_interests ei WHERE ei.event_id = e.id AND ei.interest_id = ${interestId}::uuid))
          AND (${communityId}::text IS NULL OR e.community_id = ${communityId}::uuid)
      ),
      invited_users AS (
        SELECT DISTINCT inv.user_id
        FROM newchums.event_invites inv
        JOIN fe ON fe.id = inv.event_id
        WHERE inv.user_id IS NOT NULL
      ),
      attended AS (
        SELECT DISTINCT r.user_id
        FROM newchums.event_rsvps r
        JOIN fe ON fe.id = r.event_id
        WHERE r.status = 'going' AND fe.status = 'published' AND fe.starts_at < NOW()
          AND r.user_id != fe.host_user_id
      )
      SELECT
        (SELECT COUNT(*)::int FROM invited_users) AS denominator,
        (SELECT COUNT(*)::int FROM invited_users iu WHERE EXISTS (SELECT 1 FROM attended a WHERE a.user_id = iu.user_id)) AS numerator
    `) as { denominator: number; numerator: number }[];

    // Metric 2: Repeat attendance (30d)
    const m2 = (await sql`
      WITH fe AS (
        SELECT e.id, e.host_user_id, e.starts_at, e.status
        FROM newchums.events e
        WHERE e.status = 'published' AND e.starts_at < NOW()
          AND (${city}::text IS NULL OR e.location_area ILIKE '%' || ${city} || '%')
          AND (${interestId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_interests ei WHERE ei.event_id = e.id AND ei.interest_id = ${interestId}::uuid))
          AND (${communityId}::text IS NULL OR e.community_id = ${communityId}::uuid)
      ),
      user_plans AS (
        SELECT r.user_id, fe.starts_at,
               ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY fe.starts_at) AS rn
        FROM newchums.event_rsvps r
        JOIN fe ON fe.id = r.event_id
        WHERE r.status = 'going' AND r.user_id != fe.host_user_id
      ),
      first_timers AS (
        SELECT user_id, starts_at AS first_at FROM user_plans WHERE rn = 1
          AND starts_at < NOW() - INTERVAL '30 days'
      ),
      repeaters AS (
        SELECT DISTINCT ft.user_id
        FROM first_timers ft
        JOIN user_plans up ON up.user_id = ft.user_id AND up.rn = 2
          AND up.starts_at <= ft.first_at + INTERVAL '30 days'
      )
      SELECT
        (SELECT COUNT(*)::int FROM first_timers) AS denominator,
        (SELECT COUNT(*)::int FROM repeaters) AS numerator
    `) as { denominator: number; numerator: number }[];

    // Metric 3a: Host conversion (30d)
    const m3a = (await sql`
      WITH fe AS (
        SELECT e.id, e.host_user_id, e.starts_at, e.status
        FROM newchums.events e
        WHERE e.status = 'published' AND e.starts_at < NOW()
          AND (${city}::text IS NULL OR e.location_area ILIKE '%' || ${city} || '%')
          AND (${interestId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_interests ei WHERE ei.event_id = e.id AND ei.interest_id = ${interestId}::uuid))
          AND (${communityId}::text IS NULL OR e.community_id = ${communityId}::uuid)
      ),
      user_plans AS (
        SELECT r.user_id, fe.starts_at,
               ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY fe.starts_at) AS rn
        FROM newchums.event_rsvps r
        JOIN fe ON fe.id = r.event_id
        WHERE r.status = 'going' AND r.user_id != fe.host_user_id
      ),
      first_timers AS (
        SELECT user_id, starts_at AS first_at FROM user_plans WHERE rn = 1
      ),
      converters AS (
        SELECT DISTINCT ft.user_id
        FROM first_timers ft
        JOIN newchums.events he ON he.host_user_id = ft.user_id
          AND he.status IN ('published', 'canceled')
          AND he.created_at <= ft.first_at + INTERVAL '30 days'
      )
      SELECT
        (SELECT COUNT(*)::int FROM first_timers) AS denominator,
        (SELECT COUNT(*)::int FROM converters) AS numerator
    `) as { denominator: number; numerator: number }[];

    // Metric 3b: Hosted a completed plan within 45d
    const m3b = (await sql`
      WITH fe AS (
        SELECT e.id, e.host_user_id, e.starts_at, e.status
        FROM newchums.events e
        WHERE e.status = 'published' AND e.starts_at < NOW()
          AND (${city}::text IS NULL OR e.location_area ILIKE '%' || ${city} || '%')
          AND (${interestId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_interests ei WHERE ei.event_id = e.id AND ei.interest_id = ${interestId}::uuid))
          AND (${communityId}::text IS NULL OR e.community_id = ${communityId}::uuid)
      ),
      user_plans AS (
        SELECT r.user_id, fe.starts_at,
               ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY fe.starts_at) AS rn
        FROM newchums.event_rsvps r
        JOIN fe ON fe.id = r.event_id
        WHERE r.status = 'going' AND r.user_id != fe.host_user_id
      ),
      first_timers AS (
        SELECT user_id, starts_at AS first_at FROM user_plans WHERE rn = 1
      ),
      converters AS (
        SELECT DISTINCT ft.user_id
        FROM first_timers ft
        JOIN newchums.events he ON he.host_user_id = ft.user_id
          AND he.status = 'published' AND he.starts_at < NOW()
          AND he.starts_at <= ft.first_at + INTERVAL '45 days'
      )
      SELECT
        (SELECT COUNT(*)::int FROM first_timers) AS denominator,
        (SELECT COUNT(*)::int FROM converters) AS numerator
    `) as { denominator: number; numerator: number }[];

    // Metric 4: First-time attendees per completed plan
    const m4 = (await sql`
      WITH fe AS (
        SELECT e.id, e.host_user_id, e.starts_at
        FROM newchums.events e
        WHERE e.status = 'published' AND e.starts_at < NOW()
          AND (${city}::text IS NULL OR e.location_area ILIKE '%' || ${city} || '%')
          AND (${interestId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_interests ei WHERE ei.event_id = e.id AND ei.interest_id = ${interestId}::uuid))
          AND (${communityId}::text IS NULL OR e.community_id = ${communityId}::uuid)
      ),
      completed_plans AS (
        SELECT id FROM fe
      ),
      user_first_plan AS (
        SELECT r.user_id, MIN(fe.starts_at) AS first_at
        FROM newchums.event_rsvps r
        JOIN fe ON fe.id = r.event_id
        WHERE r.status = 'going' AND r.user_id != fe.host_user_id
        GROUP BY r.user_id
      ),
      first_timers_per_plan AS (
        SELECT r.event_id, COUNT(*)::int AS cnt
        FROM newchums.event_rsvps r
        JOIN fe ON fe.id = r.event_id
        JOIN user_first_plan ufp ON ufp.user_id = r.user_id AND ufp.first_at = fe.starts_at
        WHERE r.status = 'going' AND r.user_id != fe.host_user_id
        GROUP BY r.event_id
      )
      SELECT
        (SELECT COUNT(*)::int FROM completed_plans) AS completed_plans,
        COALESCE((SELECT SUM(cnt)::int FROM first_timers_per_plan), 0) AS total_first_timers,
        CASE WHEN (SELECT COUNT(*) FROM completed_plans) > 0
          THEN ROUND((SELECT COALESCE(SUM(cnt), 0) FROM first_timers_per_plan)::numeric / (SELECT COUNT(*) FROM completed_plans), 2)
          ELSE NULL END AS avg_per_plan
    `) as { completed_plans: number; total_first_timers: number; avg_per_plan: number | null }[];

    // Metric 5: Hosts who reach a completed plan
    const m5 = (await sql`
      WITH fe AS (
        SELECT e.id, e.host_user_id, e.starts_at, e.status
        FROM newchums.events e
        WHERE e.status IN ('published', 'canceled')
          AND (${city}::text IS NULL OR e.location_area ILIKE '%' || ${city} || '%')
          AND (${interestId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_interests ei WHERE ei.event_id = e.id AND ei.interest_id = ${interestId}::uuid))
          AND (${communityId}::text IS NULL OR e.community_id = ${communityId}::uuid)
      ),
      all_hosts AS (
        SELECT DISTINCT host_user_id FROM fe
      ),
      successful_hosts AS (
        SELECT DISTINCT host_user_id FROM fe
        WHERE status = 'published' AND starts_at < NOW()
      )
      SELECT
        (SELECT COUNT(*)::int FROM all_hosts) AS denominator,
        (SELECT COUNT(*)::int FROM successful_hosts) AS numerator
    `) as { denominator: number; numerator: number }[];

    // Metric 6: Host follow-through
    const m6 = (await sql`
      WITH fe AS (
        SELECT e.id, e.host_user_id, e.starts_at, e.status, e.cancellation_reason
        FROM newchums.events e
        WHERE e.status IN ('published', 'canceled')
          AND e.starts_at < NOW()
          AND (${city}::text IS NULL OR e.location_area ILIKE '%' || ${city} || '%')
          AND (${interestId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_interests ei WHERE ei.event_id = e.id AND ei.interest_id = ${interestId}::uuid))
          AND (${communityId}::text IS NULL OR e.community_id = ${communityId}::uuid)
      ),
      with_attendees AS (
        SELECT fe.id, fe.status
        FROM fe
        WHERE EXISTS (
          SELECT 1 FROM newchums.event_rsvps er
          WHERE er.event_id = fe.id AND er.user_id != fe.host_user_id AND er.committed_at IS NOT NULL
        )
        AND COALESCE(fe.cancellation_reason, '') != 'no_attendees'
      )
      SELECT
        (SELECT COUNT(*)::int FROM with_attendees) AS denominator,
        (SELECT COUNT(*)::int FROM with_attendees WHERE status = 'published') AS numerator
    `) as { denominator: number; numerator: number }[];

    // Metric 7: Days to second attended plan (median)
    const m7 = (await sql`
      WITH fe AS (
        SELECT e.id, e.host_user_id, e.starts_at
        FROM newchums.events e
        WHERE e.status = 'published' AND e.starts_at < NOW()
          AND (${city}::text IS NULL OR e.location_area ILIKE '%' || ${city} || '%')
          AND (${interestId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_interests ei WHERE ei.event_id = e.id AND ei.interest_id = ${interestId}::uuid))
          AND (${communityId}::text IS NULL OR e.community_id = ${communityId}::uuid)
      ),
      user_plans AS (
        SELECT r.user_id, fe.starts_at,
               ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY fe.starts_at) AS rn
        FROM newchums.event_rsvps r
        JOIN fe ON fe.id = r.event_id
        WHERE r.status = 'going' AND r.user_id != fe.host_user_id
      ),
      gaps AS (
        SELECT p1.user_id, EXTRACT(EPOCH FROM (p2.starts_at - p1.starts_at)) / 86400.0 AS gap_days
        FROM user_plans p1
        JOIN user_plans p2 ON p2.user_id = p1.user_id AND p2.rn = 2
        WHERE p1.rn = 1
      )
      SELECT
        COUNT(*)::int AS sample_size,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_days) AS median_days
      FROM gaps
    `) as { sample_size: number; median_days: number | null }[];

    // Metric 8: Relevant plan opportunity (7d proxy)
    const m8 = (await sql`
      WITH upcoming AS (
        SELECT COUNT(*)::int AS cnt
        FROM newchums.events e
        WHERE e.status = 'published'
          AND e.starts_at > NOW() AND e.starts_at <= NOW() + INTERVAL '7 days'
          AND (${city}::text IS NULL OR e.location_area ILIKE '%' || ${city} || '%')
          AND (${interestId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_interests ei WHERE ei.event_id = e.id AND ei.interest_id = ${interestId}::uuid))
          AND (${communityId}::text IS NULL OR e.community_id = ${communityId}::uuid)
      ),
      active_users AS (
        SELECT COUNT(*)::int AS cnt
        FROM newchums.users u
        WHERE u.last_active_at >= NOW() - INTERVAL '30 days'
      )
      SELECT
        (SELECT cnt FROM upcoming) AS upcoming_plans,
        (SELECT cnt FROM active_users) AS active_users
    `) as { upcoming_plans: number; active_users: number }[];

    return c.json({
      ok: true,
      data: {
        firstPlanActivation: { numerator: Number(m1[0]?.numerator ?? 0), denominator: Number(m1[0]?.denominator ?? 0) },
        repeatAttendance: { numerator: Number(m2[0]?.numerator ?? 0), denominator: Number(m2[0]?.denominator ?? 0) },
        hostConversion: { numerator: Number(m3a[0]?.numerator ?? 0), denominator: Number(m3a[0]?.denominator ?? 0) },
        hostedCompleted: { numerator: Number(m3b[0]?.numerator ?? 0), denominator: Number(m3b[0]?.denominator ?? 0) },
        firstTimersPerPlan: {
          completedPlans: Number(m4[0]?.completed_plans ?? 0),
          totalFirstTimers: Number(m4[0]?.total_first_timers ?? 0),
          avgPerPlan: m4[0]?.avg_per_plan != null ? Number(m4[0].avg_per_plan) : null,
        },
        hostsReachCompleted: { numerator: Number(m5[0]?.numerator ?? 0), denominator: Number(m5[0]?.denominator ?? 0) },
        hostFollowThrough: { numerator: Number(m6[0]?.numerator ?? 0), denominator: Number(m6[0]?.denominator ?? 0) },
        daysToSecond: { sampleSize: Number(m7[0]?.sample_size ?? 0), medianDays: m7[0]?.median_days != null ? Number(Number(m7[0].median_days).toFixed(1)) : null },
        planOpportunity: { upcomingPlans: Number(m8[0]?.upcoming_plans ?? 0), activeUsers: Number(m8[0]?.active_users ?? 0) },
      },
    });
  } catch (err) {
    console.error("[GET /admin/kpis/growth-loop]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ---- Objectives / nudge framework ----

/** GET /objectives/next, returns the next best step for the authenticated user */
app.get("/objectives/next", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  try {
    const sql = getSql(c.env);
    const userRows = (await sql`
      SELECT id FROM newchums.users WHERE email = ${payload.email} LIMIT 1
    `) as { id: string }[];
    if (!userRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const { objectives, nextStep, tutorialOff } = await evaluateObjectives(sql, userRows[0].id);
    const completedCount = objectives.filter((o) => o.completed).length;
    const totalCount = objectives.length;

    return c.json({
      ok: true,
      tutorialOff,
      nextStep: tutorialOff ? null : nextStep,
      progress: { completed: completedCount, total: totalCount },
    });
  } catch (err) {
    console.error("[GET /objectives/next]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PUT /objectives/tutorial-off, permanently turn off tutorial nudges */
app.put("/objectives/tutorial-off", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  try {
    const sql = getSql(c.env);
    const body = (await c.req.json()) as { off?: boolean };
    const off = body.off !== false;
    await sql`
      UPDATE newchums.users SET tutorial_nudges_off = ${off} WHERE email = ${payload.email}
    `;
    return c.json({ ok: true, tutorialOff: off });
  } catch (err) {
    console.error("[PUT /objectives/tutorial-off]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PUT /share-link-modal-dismiss, permanently dismiss the share-link first-use info modal */
app.put("/share-link-modal-dismiss", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  try {
    const sql = getSql(c.env);
    await sql`
      UPDATE newchums.users SET share_link_modal_dismissed = true WHERE email = ${payload.email}
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[PUT /share-link-modal-dismiss]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /admin/objectives/kpi, aggregate objective completion metrics (super admin) */
app.get("/admin/objectives/kpi", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  try {
    const sql = getSql(c.env);

    // 1. Engagement rate: % of users who completed at least 1 objective
    const engagementRows = (await sql`
      SELECT
        (SELECT COUNT(*)::int FROM newchums.users) AS total_users,
        (SELECT COUNT(DISTINCT user_id)::int FROM newchums.user_objective_completions) AS engaged_users,
        (SELECT COUNT(*)::int FROM newchums.users WHERE tutorial_nudges_off = true) AS opted_out
    `) as { total_users: number; engaged_users: number; opted_out: number }[];
    const { total_users, engaged_users, opted_out } = engagementRows[0] ?? { total_users: 0, engaged_users: 0, opted_out: 0 };

    // 2. Average completion depth: avg objectives completed per engaged user
    const depthRows = (await sql`
      SELECT COALESCE(AVG(cnt), 0)::numeric(5,2) AS avg_depth
      FROM (
        SELECT COUNT(*) AS cnt
        FROM newchums.user_objective_completions
        GROUP BY user_id
      ) sub
    `) as { avg_depth: number }[];

    // 3. Per-objective completion funnel (for drop-off analysis)
    const funnelRows = (await sql`
      SELECT
        oc.objective_key,
        COUNT(*)::int AS completed_count
      FROM newchums.user_objective_completions oc
      GROUP BY oc.objective_key
      ORDER BY completed_count DESC
    `) as { objective_key: string; completed_count: number }[];

    const funnel = OBJECTIVES.map((obj) => {
      const row = funnelRows.find((r) => r.objective_key === obj.key);
      return {
        key: obj.key,
        title: obj.title,
        sequence: obj.sequence,
        completedCount: row?.completed_count ?? 0,
        completionRate: total_users > 0
          ? Math.round(((row?.completed_count ?? 0) / total_users) * 1000) / 10
          : 0,
      };
    }).sort((a, b) => a.sequence - b.sequence);

    return c.json({
      ok: true,
      kpi: {
        totalUsers: total_users,
        engagedUsers: engaged_users,
        engagementRate: total_users > 0 ? Math.round((engaged_users / total_users) * 1000) / 10 : 0,
        avgCompletionDepth: Number(depthRows[0]?.avg_depth ?? 0),
        optedOut: opted_out,
        funnel,
      },
    });
  } catch (err) {
    console.error("[GET /admin/objectives/kpi]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ---- Chums ----

/** Shared helper: build the avatar URL string used in chum responses. */
/** Format an ISO date string into a human-readable form for email templates.
 *  Uses the event's stored IANA timezone (e.g. "America/New_York") so the
 *  time matches what the host entered and what the plan details page shows. */
function formatEventDate(iso: string, timezone = "UTC"): string {
  try {
    const d = new Date(iso);
    // Validate the timezone; fall back to UTC if unsupported
    let tz = timezone;
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); } catch { tz = "UTC"; }
    return d.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });
  } catch {
    return iso;
  }
}

function buildAvatarUrl(
  userId: string,
  avatarKey: string | null,
  avatarUpdatedAt: string | Date | null,
  mediaBucket: unknown,
): string | null {
  if (!avatarKey || !mediaBucket) return null;
  const ts = avatarUpdatedAt ? new Date(avatarUpdatedAt as Date).getTime() : 0;
  return `/users/${userId}/avatar?v=${ts}`;
}

/** GET /chums, list all contacts for the authenticated user (private).
 *  Returns both On NewChums and Private Contact entries. */
app.get("/chums", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

    const onNcRows = (await sql`
      SELECT uc.id AS contact_id, u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at,
             u.date_of_birth, COALESCE(u.is_hidden_age, false) AS is_hidden_age,
             uc.created_at AS saved_at, uc.note
      FROM newchums.user_contacts uc
      JOIN newchums.users u ON u.id = uc.linked_user_id
      WHERE uc.user_id = ${appUserId} AND uc.type = 'on_newchums'
      ORDER BY uc.created_at DESC
    `) as { contact_id: string; id: string; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | Date | null; date_of_birth: string | Date | null; is_hidden_age: boolean; saved_at: string | Date; note: string | null }[];

    const onNewChums = onNcRows.map((r) => {
      const uname = r.username?.replace(/^@/, "") ?? null;
      let birthday: { month: number; day: number } | null = null;
      if (!r.is_hidden_age && r.date_of_birth) {
        const dobStr = typeof r.date_of_birth === "string" ? r.date_of_birth : (r.date_of_birth as Date).toISOString().slice(0, 10);
        const parts = dobStr.split("-");
        if (parts.length >= 3) birthday = { month: parseInt(parts[1], 10), day: parseInt(parts[2], 10) };
      }
      return {
        contactId: r.contact_id,
        userId: r.id,
        type: "on_newchums" as const,
        displayName: r.name?.trim() || uname || "NewChums user",
        handle: uname ? `@${uname}` : null,
        avatarUrl: buildAvatarUrl(r.id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
        savedAt: r.saved_at,
        note: r.note ?? null,
        birthday,
      };
    });

    const privateRows = (await sql`
      SELECT id AS contact_id, contact_email, contact_name, note, created_at AS saved_at
      FROM newchums.user_contacts
      WHERE user_id = ${appUserId} AND type = 'private'
      ORDER BY created_at DESC
    `) as { contact_id: string; contact_email: string | null; contact_name: string | null; note: string | null; saved_at: string | Date }[];

    const privateContacts = privateRows.map((r) => ({
      contactId: r.contact_id,
      type: "private" as const,
      displayName: r.contact_name?.trim() || r.contact_email || "Private contact",
      email: r.contact_email ?? null,
      savedAt: r.saved_at,
      note: r.note ?? null,
    }));

    return c.json({ ok: true, onNewChums, privateContacts });
  } catch (err) {
    console.error("[GET /chums]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** PATCH /chums/:contactId/note, save or clear the private note for any contact entry.
 *  Accepts a real contact UUID or a "temp-{userId}" style ID (optimistic frontend ID)
 *  and falls back to linked_user_id lookup when needed. */
app.patch("/chums/:contactId/note", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const contactId = c.req.param("contactId");
    const body = await c.req.json().catch(() => ({})) as { note?: unknown };
    const rawNote = body.note != null ? String(body.note).trim() : null;
    const note = rawNote && rawNote.length > 0 ? rawNote.slice(0, 500) : null;

    // Handle temp-{userId} IDs from optimistic frontend updates by extracting the linked user ID
    const tempPrefix = "temp-";
    const linkedUserId = contactId.startsWith(tempPrefix) ? contactId.slice(tempPrefix.length) : null;

    let result: { id: string }[];
    if (linkedUserId) {
      // Resolve via linked_user_id for temp-* optimistic IDs
      result = (await sql`
        UPDATE newchums.user_contacts SET note = ${note}
        WHERE linked_user_id = ${linkedUserId} AND user_id = ${appUserId}
        RETURNING id
      `) as { id: string }[];
    } else {
      // Primary path: resolve by contact row UUID, with linked_user_id fallback
      result = (await sql`
        UPDATE newchums.user_contacts SET note = ${note}
        WHERE (id = ${contactId} OR linked_user_id = ${contactId}) AND user_id = ${appUserId}
        RETURNING id
      `) as { id: string }[];
    }

    if (result.length === 0) {
      console.warn(`[PATCH /chums/:contactId/note] Contact not found: contactId=${contactId}, userId=${appUserId}`);
      return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    }
    return c.json({ ok: true, contactId: result[0].id });
  } catch (err) {
    console.error(`[PATCH /chums/:contactId/note] contactId=${c.req.param("contactId")}`, err);
    Sentry.captureException(err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET /chums/search?q=, search users to add as a connection or private contact.
 *  Excludes self and users with is_hidden_from_search = true.
 *  If q looks like an email, performs exact email lookup instead of name/handle search.
 *  Returns up to 10 results with isSaved; for email lookups also returns inviteEligible
 *  when the email doesn't belong to any eligible account. */
app.get("/chums/search", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) {
    return c.json({ ok: true, users: [], inviteEligible: false });
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

    // ── Email lookup path ──────────────────────────────────────────────────────
    if (EMAIL_RE.test(q)) {
      const emailNorm = q.toLowerCase();
      if (emailNorm === payload.email.toLowerCase()) {
        return c.json({ ok: true, users: [], inviteEligible: false });
      }
      const rows = (await sql`
        SELECT u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at,
               COALESCE(u.is_hidden_from_search, false) AS is_hidden,
               COALESCE(u.is_suspended, false) AS is_suspended,
               (uc.linked_user_id IS NOT NULL) AS is_saved
        FROM newchums.users u
        LEFT JOIN newchums.user_contacts uc ON uc.user_id = ${appUserId} AND uc.linked_user_id = u.id AND uc.type = 'on_newchums'
        WHERE LOWER(u.email) = ${emailNorm}
        LIMIT 1
      `) as {
        id: string;
        name: string | null;
        username: string | null;
        avatar_key: string | null;
        avatar_updated_at: string | Date | null;
        is_hidden: boolean;
        is_suspended: boolean;
        is_saved: boolean;
      }[];
      const match = rows[0];
      if (!match || match.is_hidden || match.is_suspended) {
        const inviteRows = (await sql`
          SELECT 1 FROM newchums.chum_invites
          WHERE inviter_user_id = ${appUserId}
            AND invitee_email = ${emailNorm}
            AND status = 'pending'
            AND expires_at > NOW()
          LIMIT 1
        `) as unknown[];
        const alreadyInvited = inviteRows.length > 0;
        // Check if already saved as private contact
        const privateRows = (await sql`
          SELECT 1 FROM newchums.user_contacts
          WHERE user_id = ${appUserId} AND LOWER(contact_email) = ${emailNorm} AND type = 'private'
          LIMIT 1
        `) as unknown[];
        const isPrivateContact = privateRows.length > 0;
        return c.json({ ok: true, users: [], inviteEligible: true, inviteeEmail: emailNorm, alreadyInvited, isPrivateContact });
      }
      const muname = match.username?.replace(/^@/, "") ?? null;
      const users = [{
        userId: match.id,
        displayName: match.name?.trim() || muname || "NewChums user",
        handle: muname ? `@${muname}` : null,
        avatarUrl: buildAvatarUrl(match.id, match.avatar_key, match.avatar_updated_at, c.env.MEDIA_BUCKET),
        isSaved: match.is_saved === true,
      }];
      return c.json({ ok: true, users, inviteEligible: false });
    }

    // ── Name / handle search path ─────────────────────────────────────────────
    const likePattern = `%${q.toLowerCase()}%`;
    const rows = (await sql`
      SELECT u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at,
             (uc.linked_user_id IS NOT NULL) AS is_saved
      FROM newchums.users u
      LEFT JOIN newchums.user_contacts uc
        ON uc.user_id = ${appUserId} AND uc.linked_user_id = u.id AND uc.type = 'on_newchums'
      WHERE u.id <> ${appUserId}
        AND u.username IS NOT NULL
        AND COALESCE(u.is_hidden_from_search, false) = false
        AND COALESCE(u.is_suspended, false) = false
        AND (
          LOWER(COALESCE(u.name, '')) LIKE ${likePattern}
          OR LOWER(COALESCE(u.username, '')) LIKE ${likePattern}
        )
      ORDER BY u.name ASC NULLS LAST
      LIMIT 10
    `) as {
      id: string;
      name: string | null;
      username: string | null;
      avatar_key: string | null;
      avatar_updated_at: string | Date | null;
      is_saved: boolean;
    }[];
    const users = rows.map((r) => {
      const uname = r.username?.replace(/^@/, "") ?? null;
      return {
        userId: r.id,
        displayName: r.name?.trim() || uname || "NewChums user",
        handle: uname ? `@${uname}` : null,
        avatarUrl: buildAvatarUrl(r.id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
        isSaved: r.is_saved === true,
      };
    });
    return c.json({ ok: true, users, inviteEligible: false });
  } catch (err) {
    console.error("[GET /chums/search]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** GET /chums/check/:userId, returns whether the authenticated user has this person saved. */
app.get("/chums/check/:userId", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const targetId = c.req.param("userId");
  if (!targetId) return c.json({ ok: false, error: "INVALID_ID" }, 400);
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const rows = (await sql`
      SELECT EXISTS(
        SELECT 1 FROM newchums.user_contacts
        WHERE user_id = ${appUserId} AND linked_user_id = ${targetId} AND type = 'on_newchums'
      ) AS is_saved
    `) as { is_saved: boolean }[];
    return c.json({ ok: true, isSaved: rows[0]?.is_saved === true });
  } catch (err) {
    console.error("[GET /chums/check/:userId]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** POST /chums/private, add a private contact (off-platform person for planning).
 *  If the email matches an existing user, auto-creates as on_newchums instead. */
app.post("/chums/private", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const body = await c.req.json().catch(() => ({})) as { email?: unknown; name?: unknown; note?: unknown };
  const contactEmail = typeof body.email === "string" ? body.email.toLowerCase().trim() : null;
  const contactName = typeof body.name === "string" ? body.name.trim().slice(0, 200) : null;
  const rawNote = body.note != null ? String(body.note).trim() : null;
  const note = rawNote && rawNote.length > 0 ? rawNote.slice(0, 500) : null;

  if (!contactEmail && !contactName) {
    return c.json({ ok: false, error: { code: "NEED_EMAIL_OR_NAME", message: "Provide an email or name." } }, 400);
  }
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return c.json({ ok: false, error: { code: "INVALID_EMAIL" } }, 400);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

    if (contactEmail && contactEmail === payload.email.toLowerCase()) {
      return c.json({ ok: false, error: { code: "CANNOT_ADD_SELF" } }, 400);
    }

    // If email matches an existing user, auto-create as on_newchums
    if (contactEmail) {
      const existingRows = (await sql`
        SELECT id FROM newchums.users
        WHERE LOWER(email) = ${contactEmail}
          AND COALESCE(is_suspended, false) = false
        LIMIT 1
      `) as { id: string }[];
      if (existingRows.length > 0) {
        const linkedId = existingRows[0].id;
        if (linkedId === appUserId) {
          return c.json({ ok: false, error: { code: "CANNOT_ADD_SELF" } }, 400);
        }
        await sql`
          INSERT INTO newchums.user_contacts (user_id, type, linked_user_id, note)
          VALUES (${appUserId}, 'on_newchums', ${linkedId}, ${note})
          ON CONFLICT (user_id, linked_user_id) WHERE linked_user_id IS NOT NULL DO NOTHING
        `;
        return c.json({ ok: true, autoLinked: true, type: "on_newchums" });
      }
    }

    await sql`
      INSERT INTO newchums.user_contacts (user_id, type, contact_email, contact_name, note)
      VALUES (${appUserId}, 'private', ${contactEmail}, ${contactName}, ${note})
      ON CONFLICT DO NOTHING
    `;
    return c.json({ ok: true, type: "private" });
  } catch (err) {
    console.error("[POST /chums/private]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** POST /chums/invite, send a NewChums invite email to an address not yet on NewChums.
 *  Also creates a Private Contact entry for the invitee if one doesn't exist.
 *  Prevents duplicate pending invites. Rate limit: 10 invites per inviter per 24 h. */
app.post("/chums/invite", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const body = await c.req.json().catch(() => ({})) as { email?: unknown };
  const inviteeEmail = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  if (!EMAIL_RE.test(inviteeEmail)) {
    return c.json({ ok: false, error: { code: "INVALID_EMAIL" } }, 400);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

    if (inviteeEmail === payload.email.toLowerCase()) {
      return c.json({ ok: false, error: { code: "CANNOT_INVITE_SELF" } }, 400);
    }

    const existingRows = (await sql`
      SELECT id FROM newchums.users
      WHERE LOWER(email) = ${inviteeEmail}
        AND COALESCE(is_hidden_from_search, false) = false
        AND COALESCE(is_suspended, false) = false
      LIMIT 1
    `) as { id: string }[];
    if (existingRows.length > 0) {
      return c.json({ ok: false, error: { code: "USER_ALREADY_EXISTS" } }, 409);
    }

    const pendingRows = (await sql`
      SELECT id FROM newchums.chum_invites
      WHERE inviter_user_id = ${appUserId}
        AND invitee_email = ${inviteeEmail}
        AND status = 'pending'
        AND expires_at > NOW()
      LIMIT 1
    `) as { id: string }[];
    if (pendingRows.length > 0) {
      return c.json({ ok: true, alreadyPending: true });
    }

    const recentRows = (await sql`
      SELECT COUNT(*)::int AS cnt FROM newchums.chum_invites
      WHERE inviter_user_id = ${appUserId}
        AND created_at > NOW() - INTERVAL '24 hours'
    `) as { cnt: number }[];
    if ((recentRows[0]?.cnt ?? 0) >= 10) {
      return c.json({ ok: false, error: { code: "RATE_LIMITED", message: "You've sent too many invites today. Try again tomorrow." } }, 429);
    }

    const { generateResetToken, hashResetToken } = await import("./resetTokens");
    const token = generateResetToken();
    const tokenHash = await hashResetToken(token);

    await sql`
      INSERT INTO newchums.chum_invites (inviter_user_id, invitee_email, token_hash)
      VALUES (${appUserId}, ${inviteeEmail}, ${tokenHash})
    `;

    // Also create a Private Contact entry for the invitee if one doesn't exist
    await sql`
      INSERT INTO newchums.user_contacts (user_id, type, contact_email)
      VALUES (${appUserId}, 'private', ${inviteeEmail})
      ON CONFLICT DO NOTHING
    `;

    const inviterRows = (await sql`
      SELECT name, username FROM newchums.users WHERE id = ${appUserId} LIMIT 1
    `) as { name: string | null; username: string | null }[];
    const inviter = inviterRows[0];
    const inviterName =
      inviter?.name?.trim() ||
      (inviter?.username ? (inviter.username.startsWith("@") ? inviter.username : `@${inviter.username}`) : null) ||
      "A NewChums member";

    const inviteUrl = `${c.env.WEB_BASE_URL}/signup?invite=${encodeURIComponent(token)}`;

    try {
      await sendChumInviteEmail(c.env, { to: inviteeEmail, inviterName, inviteUrl });
    } catch (emailErr) {
      console.error("[POST /chums/invite] email send failed:", emailErr);
    }

    return c.json({ ok: true, alreadyPending: false });
  } catch (err) {
    console.error("[POST /chums/invite]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** POST /chums/invite/accept, consume an invite token after account creation.
 *  Creates two independent on_newchums entries (inviter → new user, new user → inviter).
 *  Also auto-links any Private Contacts matching the new user's email across all users. */
app.post("/chums/invite/accept", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { token?: unknown; email?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const newUserEmail = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  if (!token || !newUserEmail) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT" } }, 400);
  }
  try {
    const sql = getSql(c.env);
    const { hashResetToken } = await import("./resetTokens");
    const tokenHash = await hashResetToken(token);

    const inviteRows = (await sql`
      SELECT id, inviter_user_id, invitee_email
      FROM newchums.chum_invites
      WHERE token_hash = ${tokenHash}
        AND status = 'pending'
        AND expires_at > NOW()
      LIMIT 1
    `) as { id: string; inviter_user_id: string; invitee_email: string }[];
    const invite = inviteRows[0];
    if (!invite) {
      return c.json({ ok: false, error: { code: "INVITE_NOT_FOUND" } }, 404);
    }

    if (invite.invitee_email !== newUserEmail) {
      return c.json({ ok: false, error: { code: "EMAIL_MISMATCH" } }, 400);
    }

    const newUserRows = (await sql`
      SELECT id FROM newchums.users WHERE LOWER(email) = ${newUserEmail} LIMIT 1
    `) as { id: string }[];
    const newUserId = newUserRows[0]?.id;
    if (!newUserId) {
      return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);
    }

    const inviterId = invite.inviter_user_id;

    await sql`
      UPDATE newchums.chum_invites
      SET status = 'accepted', accepted_at = NOW(), accepted_user_id = ${newUserId}
      WHERE id = ${invite.id}
    `;

    // Create two independent on_newchums entries (no mutual indicator)
    await sql`
      INSERT INTO newchums.user_contacts (user_id, type, linked_user_id)
      VALUES (${inviterId}, 'on_newchums', ${newUserId}), (${newUserId}, 'on_newchums', ${inviterId})
      ON CONFLICT (user_id, linked_user_id) WHERE linked_user_id IS NOT NULL DO NOTHING
    `;

    // Auto-link: promote all Private Contacts matching this email across all users
    await sql`
      UPDATE newchums.user_contacts
      SET type = 'on_newchums', linked_user_id = ${newUserId}
      WHERE LOWER(contact_email) = ${newUserEmail}
        AND type = 'private'
        AND linked_user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM newchums.user_contacts uc2
          WHERE uc2.user_id = user_contacts.user_id
            AND uc2.linked_user_id = ${newUserId}
        )
    `;
    // Clean up any remaining private-contact duplicates
    await sql`
      DELETE FROM newchums.user_contacts
      WHERE LOWER(contact_email) = ${newUserEmail}
        AND type = 'private'
        AND linked_user_id IS NULL
    `;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /chums/invite/accept]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** POST /chums/:userId, save an on-platform user to the authenticated user's connections. */
app.post("/chums/:userId", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const targetId = c.req.param("userId");
  if (!targetId) return c.json({ ok: false, error: "INVALID_ID" }, 400);
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    if (appUserId === targetId) {
      return c.json({ ok: false, error: { code: "CANNOT_ADD_SELF", message: "You cannot add yourself." } }, 400);
    }
    const targetRows = (await sql`
      SELECT id FROM newchums.users WHERE id = ${targetId} LIMIT 1
    `) as { id: string }[];
    if (targetRows.length === 0) {
      return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);
    }
    const insertResult = (await sql`
      INSERT INTO newchums.user_contacts (user_id, type, linked_user_id)
      VALUES (${appUserId}, 'on_newchums', ${targetId})
      ON CONFLICT (user_id, linked_user_id) WHERE linked_user_id IS NOT NULL
        DO UPDATE SET linked_user_id = EXCLUDED.linked_user_id
      RETURNING id
    `) as { id: string }[];
    return c.json({ ok: true, contactId: insertResult[0]?.id ?? null });
  } catch (err) {
    console.error("[POST /chums/:userId]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** DELETE /chums/:id, remove a contact entry by contact ID, linked user ID, or temp-{userId}. */
app.delete("/chums/:id", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: "INVALID_ID" }, 400);
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

    // Handle temp-{userId} IDs from optimistic frontend updates
    const tempPrefix = "temp-";
    const resolvedId = id.startsWith(tempPrefix) ? id.slice(tempPrefix.length) : id;

    // Try by contact row ID first, then by linked_user_id (for profile-page remove or temp IDs)
    const result = (await sql`
      DELETE FROM newchums.user_contacts
      WHERE user_id = ${appUserId} AND (id = ${resolvedId} OR linked_user_id = ${resolvedId})
      RETURNING id
    `) as { id: string }[];
    if (result.length === 0) {
      return c.json({ ok: true });
    }
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /chums/:id]", err);
    Sentry.captureException(err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** GET /notifications, fetch recent notifications for the authenticated user. */
app.get("/notifications", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const notifViewerIsSuperAdmin = await checkIsSuperAdmin(sql, appUserId);
    const rows = (await sql`
      SELECT
        n.id, n.type, n.actor_user_id, n.entity_id, n.metadata, n.read_at, n.created_at,
        u.name          AS actor_name,
        u.username      AS actor_username,
        u.avatar_key    AS actor_avatar_key,
        u.avatar_updated_at AS actor_avatar_updated_at
      FROM newchums.notifications n
      LEFT JOIN newchums.users u ON u.id = n.actor_user_id
      WHERE n.user_id = ${appUserId}
      ORDER BY n.created_at DESC
      LIMIT 50
    `) as {
      id: string;
      type: string;
      actor_user_id: string | null;
      entity_id: string | null;
      metadata: Record<string, unknown> | null;
      read_at: string | null;
      created_at: string;
      actor_name: string | null;
      actor_username: string | null;
      actor_avatar_key: string | null;
      actor_avatar_updated_at: string | null;
    }[];
    const notifications = rows.map((r) => ({
      id: r.id,
      type: r.type,
      actorUserId: r.actor_user_id,
      actorDisplayName: r.actor_name ?? null,
      actorHandle: r.actor_username
        ? r.actor_username.startsWith("@")
          ? r.actor_username
          : `@${r.actor_username}`
        : null,
      actorAvatarUrl: buildAvatarUrl(
        r.actor_user_id ?? "",
        r.actor_avatar_key,
        r.actor_avatar_updated_at,
        c.env.MEDIA_BUCKET,
      ),
      entityId: r.entity_id,
      metadata: r.metadata,
      readAt: r.read_at,
      createdAt: r.created_at,
    }));
    // Derive unread chat summaries from chat tables (host or going RSVP)
    const chatRows = (await sql`
      SELECT
        e.id        AS event_id,
        e.title     AS event_title,
        COUNT(cm.id)::int AS unread_count,
        MAX(cm.created_at) AS latest_at,
        latest_msg.body AS latest_body,
        latest_msg.sender_name AS latest_sender_name
      FROM newchums.event_chat_messages cm
      JOIN newchums.events e ON e.id = cm.event_id AND e.status != 'canceled' AND (COALESCE(e.is_qa, false) = false OR ${notifViewerIsSuperAdmin})
      LEFT JOIN newchums.event_chat_reads cr
        ON cr.event_id = cm.event_id AND cr.user_id = ${appUserId}
      LEFT JOIN LATERAL (
        SELECT cm2.body, u2.name AS sender_name
        FROM newchums.event_chat_messages cm2
        JOIN newchums.users u2 ON u2.id = cm2.user_id
        WHERE cm2.event_id = e.id
        ORDER BY cm2.created_at DESC LIMIT 1
      ) latest_msg ON true
      WHERE (
        e.host_user_id = ${appUserId}
        OR EXISTS (
          SELECT 1 FROM newchums.event_rsvps er
          WHERE er.event_id = e.id AND er.user_id = ${appUserId} AND er.status = 'going'
        )
      )
      AND cm.created_at > COALESCE(cr.last_read_at, '1970-01-01'::timestamptz)
      AND cm.user_id != ${appUserId}
      GROUP BY e.id, e.title, latest_msg.body, latest_msg.sender_name
      ORDER BY MAX(cm.created_at) DESC
      LIMIT 10
    `) as {
      event_id: string;
      event_title: string;
      unread_count: number;
      latest_at: string;
      latest_body: string | null;
      latest_sender_name: string | null;
    }[];

    const unreadChats = chatRows.map((r) => ({
      eventId: r.event_id,
      eventTitle: r.event_title,
      unreadCount: r.unread_count,
      latestAt: r.latest_at,
      latestMessageBody: r.latest_body ? (r.latest_body.length > 80 ? r.latest_body.slice(0, 80) + "..." : r.latest_body) : null,
      latestSenderName: r.latest_sender_name ?? null,
    }));

    return c.json({ ok: true, notifications, unreadChats });
  } catch (err) {
    console.error("[GET /notifications]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** POST /notifications/read, mark notifications as read.
 *  Body: { ids?: string[] }, if ids omitted or empty, marks all unread as read. */
app.post("/notifications/read", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const body = await c.req.json().catch(() => ({})) as { ids?: unknown };
    const ids: string[] = Array.isArray(body?.ids) ? (body.ids as string[]).filter((x) => typeof x === "string") : [];
    if (ids.length > 0) {
      await sql`
        UPDATE newchums.notifications
        SET read_at = NOW()
        WHERE user_id = ${appUserId}
          AND id = ANY(${ids}::uuid[])
          AND read_at IS NULL
      `;
    } else {
      await sql`
        UPDATE newchums.notifications
        SET read_at = NOW()
        WHERE user_id = ${appUserId} AND read_at IS NULL
      `;
    }
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /notifications/read]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** GET /public/users/:handle/chums, public-facing paginated Chum list for a profile.
 *  Respects owner's is_hidden_chum_list and each Chum's is_hidden_from_chum_lists flag. */
app.get("/public/users/:handle/chums", async (c) => {
  const handleParam = c.req.param("handle")?.trim();
  if (!handleParam) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  const handleNorm = handleParam.toLowerCase().trim();
  const offset = Math.max(0, parseInt(c.req.query("offset") ?? "0", 10) || 0);
  const limit = Math.min(20, Math.max(1, parseInt(c.req.query("limit") ?? "8", 10) || 8));
  try {
    const sql = getSql(c.env);
    const ownerRows = (await sql`
      SELECT id, COALESCE(is_hidden_chum_list, false) AS is_hidden_chum_list
      FROM newchums.users
      WHERE username_norm = ${handleNorm} AND username IS NOT NULL
      LIMIT 1
    `) as { id: string; is_hidden_chum_list: boolean }[];
    const owner = ownerRows[0];
    if (!owner) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (owner.is_hidden_chum_list) {
      return c.json({ ok: true, chums: [], total: 0, hasMore: false, hidden: true });
    }
    let viewerId: string | null = null;
    try {
      const authPayload = await requireAuth(c);
      if (authPayload?.email && typeof authPayload.email === "string") {
        const vId = await ensureAppUserId(sql, authPayload.email, null);
        if (vId !== owner.id) viewerId = vId;
      }
    } catch {
      // Non-critical; proceed without mutual indicators
    }
    const countRows = (await sql`
      SELECT COUNT(*) AS total
      FROM newchums.user_contacts uc
      JOIN newchums.users u ON u.id = uc.linked_user_id
      WHERE uc.user_id = ${owner.id}
        AND uc.type = 'on_newchums'
        AND COALESCE(u.is_hidden_from_chum_lists, false) = false
        AND u.username IS NOT NULL
    `) as { total: string }[];
    const total = parseInt(countRows[0]?.total ?? "0", 10);
    const rows = (await sql`
      SELECT u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at
      FROM newchums.user_contacts uc
      JOIN newchums.users u ON u.id = uc.linked_user_id
      WHERE uc.user_id = ${owner.id}
        AND uc.type = 'on_newchums'
        AND COALESCE(u.is_hidden_from_chum_lists, false) = false
        AND u.username IS NOT NULL
      ORDER BY uc.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as {
      id: string;
      name: string | null;
      username: string | null;
      avatar_key: string | null;
      avatar_updated_at: string | Date | null;
    }[];
    const chums = rows.map((r) => {
      const uname = r.username?.replace(/^@/, "") ?? null;
      return {
        userId: r.id,
        displayName: r.name?.trim() || uname || "NewChums user",
        handle: uname ? `@${uname}` : null,
        avatarUrl: buildAvatarUrl(r.id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
      };
    });
    return c.json({ ok: true, chums, total, hasMore: offset + limit < total });
  } catch (err) {
    console.error("[GET /public/users/:handle/chums]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS (plans)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Communities ─────────────────────────────────────────────────────────────

const VALID_COMMUNITY_VISIBILITY = ["public", "private"] as const;
const VALID_COMMUNITY_JOIN_MODE = ["open", "approval_required"] as const;
const COMMUNITY_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

/** POST /communities, create a community */
app.post("/communities", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const name = String(body.name ?? "").trim();
  if (!name || name.length > 100) return c.json({ ok: false, error: "VALIDATION", message: "Name is required (max 100 chars)", field: "name" }, 400);
  const nameCheck = validateCleanText(name, "title");
  if (!nameCheck.ok) return c.json({ ok: false, error: "INAPPROPRIATE_TEXT", field: "name" }, 400);

  const slug = String(body.slug ?? "").trim().toLowerCase();
  if (!COMMUNITY_SLUG_RE.test(slug)) return c.json({ ok: false, error: "VALIDATION", message: "Handle must be 3-50 chars, lowercase letters/numbers/hyphens", field: "slug" }, 400);
  const slugCheck = validateCleanText(slug, "username");
  if (!slugCheck.ok) return c.json({ ok: false, error: "INAPPROPRIATE_TEXT", field: "slug" }, 400);

  const description = body.description ? String(body.description).trim().slice(0, 2000) : null;
  const visibility = String(body.visibility ?? "public");
  if (!VALID_COMMUNITY_VISIBILITY.includes(visibility as typeof VALID_COMMUNITY_VISIBILITY[number]))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid visibility", field: "visibility" }, 400);
  const joinMode = String(body.join_mode ?? "open");
  if (!VALID_COMMUNITY_JOIN_MODE.includes(joinMode as typeof VALID_COMMUNITY_JOIN_MODE[number]))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid join mode", field: "join_mode" }, 400);
  const chatEnabled = body.chat_enabled !== false;
  const locationName = body.location_name ? String(body.location_name).trim().slice(0, 200) : null;
  const locationAddress = body.location_address ? String(body.location_address).trim().slice(0, 500) : null;
  const locationLat = body.location_lat != null ? Number(body.location_lat) : null;
  const locationLng = body.location_lng != null ? Number(body.location_lng) : null;

  try {
    const existing = (await sql`SELECT id FROM newchums.communities WHERE slug = ${slug}`) as { id: string }[];
    if (existing.length > 0) return c.json({ ok: false, error: "SLUG_TAKEN", message: "That handle is already taken" }, 409);

    const rows = (await sql`
      INSERT INTO newchums.communities (name, slug, description, visibility, join_mode, chat_enabled, location_name, location_address, location_lat, location_lng, owner_user_id)
      VALUES (${name}, ${slug}, ${description}, ${visibility}, ${joinMode}, ${chatEnabled}, ${locationName}, ${locationAddress}, ${locationLat}, ${locationLng}, ${userId})
      RETURNING id, slug, created_at
    `) as { id: string; slug: string; created_at: string }[];
    const community = rows[0];

    await sql`INSERT INTO newchums.community_members (community_id, user_id, role, status) VALUES (${community.id}, ${userId}, 'owner', 'active')`;

    return c.json({ ok: true, community: { id: community.id, slug: community.slug, created_at: community.created_at } }, 201);
  } catch (err) {
    console.error("[POST /communities]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /communities, list/search communities */
app.get("/communities", async (c) => {
  const payload = await requireAuth(c);
  const sql = getSql(c.env);
  const search = c.req.query("q")?.trim() ?? null;
  const mine = c.req.query("mine") === "1";
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 20), 1), 50);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  let userId: string | null = null;
  let isSuperAdmin = false;
  if (payload?.email) {
    const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
    if (userRows[0]) { userId = userRows[0].id; isSuperAdmin = userRows[0].role === "super_admin"; }
  }

  try {
    let communities;
    if (mine && userId) {
      communities = (await sql`
        SELECT c.id, c.slug, c.name, c.description, c.visibility, c.join_mode, c.avatar_key, c.banner_key,
          c.location_name, c.owner_user_id, c.created_at,
          (SELECT COUNT(*)::int FROM newchums.community_members cm WHERE cm.community_id = c.id AND cm.status = 'active') AS member_count,
          'member' AS viewer_role
        FROM newchums.communities c
        JOIN newchums.community_members cm ON cm.community_id = c.id AND cm.user_id = ${userId} AND cm.status = 'active'
        WHERE COALESCE(c.status, 'active') = 'active'
        ORDER BY c.name ASC LIMIT ${limit} OFFSET ${offset}
      `) as Record<string, unknown>[];
    } else {
      const q = search ? `%${search}%` : null;
      communities = (await sql`
        SELECT c.id, c.slug, c.name, c.description, c.visibility, c.join_mode, c.avatar_key, c.banner_key,
          c.location_name, c.owner_user_id, c.created_at,
          (SELECT COUNT(*)::int FROM newchums.community_members cm WHERE cm.community_id = c.id AND cm.status = 'active') AS member_count
        FROM newchums.communities c
        WHERE (${isSuperAdmin}::boolean OR c.visibility = 'public')
          AND COALESCE(c.status, 'active') = 'active'
          AND (${q}::text IS NULL OR c.name ILIKE ${q} OR c.slug ILIKE ${q})
        ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `) as Record<string, unknown>[];
    }

    return c.json({ ok: true, communities });
  } catch (err) {
    console.error("[GET /communities]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /communities/slug-available, check slug availability */
app.get("/communities/slug-available", async (c) => {
  const slug = (c.req.query("slug") ?? "").trim().toLowerCase();
  if (!COMMUNITY_SLUG_RE.test(slug)) return c.json({ ok: true, available: false });
  const sql = getSql(c.env);
  const rows = (await sql`SELECT 1 FROM newchums.communities WHERE slug = ${slug} LIMIT 1`) as unknown[];
  return c.json({ ok: true, available: rows.length === 0 });
});

/** GET /communities/:slug, community detail */
app.get("/communities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const payload = await requireAuth(c);
  const sql = getSql(c.env);

  let userId: string | null = null;
  let isSuperAdmin = false;
  if (payload?.email) {
    const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
    if (userRows[0]) { userId = userRows[0].id; isSuperAdmin = userRows[0].role === "super_admin"; }
  }

  try {
    const rows = (await sql`
      SELECT c.*, ou.name AS owner_name, ou.username AS owner_username, ou.avatar_key AS owner_avatar_key, ou.avatar_updated_at AS owner_avatar_updated_at,
        (SELECT COUNT(*)::int FROM newchums.community_members cm WHERE cm.community_id = c.id AND cm.status = 'active') AS member_count
      FROM newchums.communities c
      JOIN newchums.users ou ON ou.id = c.owner_user_id
      WHERE c.slug = ${slug} LIMIT 1
    `) as Record<string, unknown>[];
    if (!rows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const community = rows[0];

    if (community.status === "closed" && !isSuperAdmin) {
      return c.json({
        ok: true,
        community: { id: community.id, slug: community.slug, name: community.name, status: "closed" },
        viewerMembership: null,
        viewerPendingRequest: false,
        restricted: true,
      });
    }

    if (community.visibility === "private" && !isSuperAdmin) {
      if (!userId) return c.json({ ok: false, error: "PRIVATE_COMMUNITY" }, 403);
      const memberRows = (await sql`
        SELECT 1 FROM newchums.community_members WHERE community_id = ${community.id} AND user_id = ${userId} AND status = 'active' LIMIT 1
      `) as unknown[];
      if (memberRows.length === 0) {
        const pendingRows = (await sql`
          SELECT 1 FROM newchums.community_join_requests WHERE community_id = ${community.id} AND user_id = ${userId} AND status = 'pending' LIMIT 1
        `) as unknown[];
        return c.json({
          ok: true,
          community: { id: community.id, slug: community.slug, name: community.name, visibility: community.visibility, join_mode: community.join_mode, member_count: community.member_count },
          viewerMembership: null,
          viewerPendingRequest: pendingRows.length > 0,
          restricted: true,
        });
      }
    }

    let viewerMembership: { role: string; status: string } | null = null;
    let viewerPendingRequest = false;
    if (userId) {
      const memberRows = (await sql`
        SELECT role, status FROM newchums.community_members WHERE community_id = ${community.id} AND user_id = ${userId} AND status = 'active' LIMIT 1
      `) as { role: string; status: string }[];
      if (memberRows[0]) viewerMembership = memberRows[0];
      else {
        const pendingRows = (await sql`SELECT 1 FROM newchums.community_join_requests WHERE community_id = ${community.id} AND user_id = ${userId} AND status = 'pending' LIMIT 1`) as unknown[];
        viewerPendingRequest = pendingRows.length > 0;
      }
    }

    const ownerAvatarUrl = buildAvatarUrl(String(community.owner_user_id), community.owner_avatar_key as string | null, community.owner_avatar_updated_at as string | null, c.env.MEDIA_BUCKET);
    const isOwnerOrAdmin = isSuperAdmin || (viewerMembership?.role === "owner");

    let pendingRequests: unknown[] = [];
    if (isOwnerOrAdmin && community.join_mode === "approval_required") {
      pendingRequests = (await sql`
        SELECT cjr.id, cjr.user_id, cjr.created_at, u.name, u.username, u.avatar_key, u.avatar_updated_at
        FROM newchums.community_join_requests cjr
        JOIN newchums.users u ON u.id = cjr.user_id
        WHERE cjr.community_id = ${community.id} AND cjr.status = 'pending'
        ORDER BY cjr.created_at ASC
      `) as unknown[];
    }

    let shareToken: string | null = null;
    if (community.visibility === "private" && (isOwnerOrAdmin) && c.env.NEXTAUTH_SECRET) {
      shareToken = await new SignJWT({ cid: String(community.id), purpose: "community_share" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .sign(new TextEncoder().encode(c.env.NEXTAUTH_SECRET));
    }

    return c.json({
      ok: true,
      community: {
        ...community,
        owner_avatar_url: ownerAvatarUrl,
      },
      viewerMembership,
      viewerPendingRequest,
      pendingRequests: isOwnerOrAdmin ? pendingRequests : undefined,
      shareToken,
      restricted: false,
    });
  } catch (err) {
    console.error("[GET /communities/:slug]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PATCH /communities/:slug, update community (owner or super admin) */
app.patch("/communities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
  if (!userRows[0]) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const userId = userRows[0].id;
  const isSuperAdmin = userRows[0].role === "super_admin";

  const communityRows = (await sql`SELECT id, owner_user_id FROM newchums.communities WHERE slug = ${slug} LIMIT 1`) as { id: string; owner_user_id: string }[];
  if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  const community = communityRows[0];
  if (community.owner_user_id !== userId && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  try {
    const updates: string[] = [];
    const vals: unknown[] = [];

    if (body.name !== undefined) {
      const n = String(body.name).trim();
      if (!n || n.length > 100) return c.json({ ok: false, error: "VALIDATION", message: "Name is required (max 100)", field: "name" }, 400);
      const nc = validateCleanText(n, "title");
      if (!nc.ok) return c.json({ ok: false, error: "INAPPROPRIATE_TEXT", field: "name" }, 400);
      updates.push("name"); vals.push(n);
    }
    if (body.description !== undefined) { updates.push("description"); vals.push(body.description ? String(body.description).trim().slice(0, 2000) : null); }
    if (body.visibility !== undefined) {
      if (!VALID_COMMUNITY_VISIBILITY.includes(String(body.visibility) as typeof VALID_COMMUNITY_VISIBILITY[number]))
        return c.json({ ok: false, error: "VALIDATION", message: "Invalid visibility" }, 400);
      updates.push("visibility"); vals.push(String(body.visibility));
    }
    if (body.join_mode !== undefined) {
      if (!VALID_COMMUNITY_JOIN_MODE.includes(String(body.join_mode) as typeof VALID_COMMUNITY_JOIN_MODE[number]))
        return c.json({ ok: false, error: "VALIDATION", message: "Invalid join mode" }, 400);
      updates.push("join_mode"); vals.push(String(body.join_mode));
    }
    if (body.chat_enabled !== undefined) { updates.push("chat_enabled"); vals.push(body.chat_enabled !== false); }
    if (body.location_name !== undefined) { updates.push("location_name"); vals.push(body.location_name ? String(body.location_name).trim().slice(0, 200) : null); }
    if (body.location_address !== undefined) { updates.push("location_address"); vals.push(body.location_address ? String(body.location_address).trim().slice(0, 500) : null); }
    if (body.location_lat !== undefined) { updates.push("location_lat"); vals.push(body.location_lat != null ? Number(body.location_lat) : null); }
    if (body.location_lng !== undefined) { updates.push("location_lng"); vals.push(body.location_lng != null ? Number(body.location_lng) : null); }
    if (body.avatar_key !== undefined) { updates.push("avatar_key"); vals.push(body.avatar_key ? String(body.avatar_key) : null); }

    if (updates.length === 0) return c.json({ ok: true });

    const fieldMap = Object.fromEntries(updates.map((col, i) => [col, vals[i]]));
    const cid = community.id;
    if (fieldMap.name !== undefined) await sql`UPDATE newchums.communities SET name = ${fieldMap.name as string}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.description !== undefined) await sql`UPDATE newchums.communities SET description = ${fieldMap.description as string | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.visibility !== undefined) await sql`UPDATE newchums.communities SET visibility = ${fieldMap.visibility as string}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.join_mode !== undefined) await sql`UPDATE newchums.communities SET join_mode = ${fieldMap.join_mode as string}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.chat_enabled !== undefined) await sql`UPDATE newchums.communities SET chat_enabled = ${fieldMap.chat_enabled as boolean}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.location_name !== undefined) await sql`UPDATE newchums.communities SET location_name = ${fieldMap.location_name as string | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.location_address !== undefined) await sql`UPDATE newchums.communities SET location_address = ${fieldMap.location_address as string | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.location_lat !== undefined) await sql`UPDATE newchums.communities SET location_lat = ${fieldMap.location_lat as number | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.location_lng !== undefined) await sql`UPDATE newchums.communities SET location_lng = ${fieldMap.location_lng as number | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.avatar_key !== undefined) await sql`UPDATE newchums.communities SET avatar_key = ${fieldMap.avatar_key as string | null}, updated_at = now() WHERE id = ${cid}`;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /communities/:slug]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /communities/:slug/close, soft-close a community (owner or super admin) */
app.post("/communities/:slug/close", async (c) => {
  const slug = c.req.param("slug");
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
  if (!userRows[0]) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const isSuperAdmin = userRows[0].role === "super_admin";

  const communityRows = (await sql`SELECT id, owner_user_id, status FROM newchums.communities WHERE slug = ${slug} LIMIT 1`) as { id: string; owner_user_id: string; status: string }[];
  if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (communityRows[0].owner_user_id !== userRows[0].id && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  if (communityRows[0].status === "closed") return c.json({ ok: true, already: true });

  const cid = communityRows[0].id;
  try {
    await sql`UPDATE newchums.communities SET status = 'closed', updated_at = now() WHERE id = ${cid}`;
    await sql`UPDATE newchums.events SET community_id = NULL WHERE community_id = ${cid}`;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /communities/:slug/close]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** DELETE /communities/:slug, remove community (owner or super admin) */
app.delete("/communities/:slug", async (c) => {
  const slug = c.req.param("slug");
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
  if (!userRows[0]) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const isSuperAdmin = userRows[0].role === "super_admin";

  const communityRows = (await sql`SELECT id, owner_user_id FROM newchums.communities WHERE slug = ${slug} LIMIT 1`) as { id: string; owner_user_id: string }[];
  if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (communityRows[0].owner_user_id !== userRows[0].id && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  try {
    await sql`DELETE FROM newchums.communities WHERE id = ${communityRows[0].id}`;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /communities/:slug]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Community membership ───────────────────────────────────────────────────

/** POST /communities/:id/join, join or request to join */
app.post("/communities/:id/join", async (c) => {
  const communityId = c.req.param("id");
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

  try {
    const communityRows = (await sql`SELECT id, join_mode, visibility, owner_user_id, name FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string; join_mode: string; visibility: string; owner_user_id: string; name: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const community = communityRows[0];

    const existingMember = (await sql`
      SELECT 1 FROM newchums.community_members WHERE community_id = ${communityId} AND user_id = ${userId} AND status = 'active' LIMIT 1
    `) as unknown[];
    if (existingMember.length > 0) return c.json({ ok: true, status: "already_member" });

    if (community.join_mode === "approval_required") {
      const existingReq = (await sql`
        SELECT 1 FROM newchums.community_join_requests WHERE community_id = ${communityId} AND user_id = ${userId} AND status = 'pending' LIMIT 1
      `) as unknown[];
      if (existingReq.length > 0) return c.json({ ok: true, status: "already_pending" });

      await sql`INSERT INTO newchums.community_join_requests (community_id, user_id) VALUES (${communityId}, ${userId})`;

      // Notify owner
      const ownerRows = (await sql`SELECT email, name FROM newchums.users WHERE id = ${community.owner_user_id} LIMIT 1`) as { email: string; name: string | null }[];
      const requesterRows = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId} LIMIT 1`) as { name: string | null; username: string | null }[];
      if (ownerRows[0] && c.env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST) {
        c.executionCtx.waitUntil(sendCommunityJoinRequestEmail(c.env, {
          to: ownerRows[0].email,
          ownerName: ownerRows[0].name || "there",
          requesterName: requesterRows[0]?.name || requesterRows[0]?.username || "Someone",
          communityName: community.name,
          communityUrl: `${c.env.WEB_BASE_URL}/communities/${communityRows[0].id}`,
        }));
      }

      return c.json({ ok: true, status: "pending" });
    }

    // Open join
    await sql`
      INSERT INTO newchums.community_members (community_id, user_id, role, status) VALUES (${communityId}, ${userId}, 'member', 'active')
      ON CONFLICT (community_id, user_id) DO UPDATE SET status = 'active', role = 'member'
    `;
    return c.json({ ok: true, status: "joined" });
  } catch (err) {
    console.error("[POST /communities/:id/join]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /communities/:id/leave, leave community */
app.post("/communities/:id/leave", async (c) => {
  const communityId = c.req.param("id");
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

  try {
    const communityRows = (await sql`SELECT owner_user_id FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { owner_user_id: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (communityRows[0].owner_user_id === userId) return c.json({ ok: false, error: "OWNER_CANNOT_LEAVE", message: "Transfer ownership before leaving" }, 400);

    await sql`DELETE FROM newchums.community_members WHERE community_id = ${communityId} AND user_id = ${userId}`;
    // Also withdraw any pending requests
    await sql`UPDATE newchums.community_join_requests SET status = 'withdrawn' WHERE community_id = ${communityId} AND user_id = ${userId} AND status = 'pending'`;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /communities/:id/leave]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /communities/:id/members, list members */
app.get("/communities/:id/members", async (c) => {
  const communityId = c.req.param("id");
  const payload = await requireAuth(c);
  const sql = getSql(c.env);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 100);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  let userId: string | null = null;
  let isSuperAdmin = false;
  if (payload?.email) {
    const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
    if (userRows[0]) { userId = userRows[0].id; isSuperAdmin = userRows[0].role === "super_admin"; }
  }

  try {
    const communityRows = (await sql`SELECT id, visibility, COALESCE(status, 'active') AS status FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string; visibility: string; status: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    if (communityRows[0].visibility === "private" && !isSuperAdmin) {
      if (!userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
      const memberCheck = (await sql`SELECT 1 FROM newchums.community_members WHERE community_id = ${communityId} AND user_id = ${userId} AND status = 'active' LIMIT 1`) as unknown[];
      if (memberCheck.length === 0) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
    }

    const members = (await sql`
      SELECT cm.id, cm.user_id, cm.role, cm.created_at, u.name, u.username, u.avatar_key, u.avatar_updated_at
      FROM newchums.community_members cm
      JOIN newchums.users u ON u.id = cm.user_id
      WHERE cm.community_id = ${communityId} AND cm.status = 'active'
      ORDER BY cm.role = 'owner' DESC, cm.created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as Record<string, unknown>[];

    const membersWithAvatars = members.map((m) => ({
      ...m,
      avatar_url: buildAvatarUrl(String(m.user_id), m.avatar_key as string | null, m.avatar_updated_at as string | null, c.env.MEDIA_BUCKET),
    }));

    return c.json({ ok: true, members: membersWithAvatars });
  } catch (err) {
    console.error("[GET /communities/:id/members]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /communities/:id/members/:userId/remove, remove member (owner/super admin) */
app.post("/communities/:id/members/:userId/remove", async (c) => {
  const communityId = c.req.param("id");
  const targetUserId = c.req.param("userId");
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
  if (!userRows[0]) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const isSuperAdmin = userRows[0].role === "super_admin";

  try {
    const communityRows = (await sql`SELECT id, owner_user_id FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string; owner_user_id: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (communityRows[0].owner_user_id !== userRows[0].id && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
    if (targetUserId === communityRows[0].owner_user_id) return c.json({ ok: false, error: "CANNOT_REMOVE_OWNER" }, 400);

    await sql`UPDATE newchums.community_members SET status = 'removed' WHERE community_id = ${communityId} AND user_id = ${targetUserId}`;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /communities/:id/members/:userId/remove]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PUT /communities/:id/join-requests/:requestId, approve or decline */
app.put("/communities/:id/join-requests/:requestId", async (c) => {
  const communityId = c.req.param("id");
  const requestId = c.req.param("requestId");
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
  if (!userRows[0]) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const isSuperAdmin = userRows[0].role === "super_admin";

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }
  const action = String(body.action ?? "");
  if (action !== "approve" && action !== "decline") return c.json({ ok: false, error: "VALIDATION", message: "action must be 'approve' or 'decline'" }, 400);

  try {
    const communityRows = (await sql`SELECT id, owner_user_id, name, slug FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string; owner_user_id: string; name: string; slug: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (communityRows[0].owner_user_id !== userRows[0].id && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

    const reqRows = (await sql`
      SELECT id, user_id, status FROM newchums.community_join_requests WHERE id = ${requestId} AND community_id = ${communityId} LIMIT 1
    `) as { id: string; user_id: string; status: string }[];
    if (!reqRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (reqRows[0].status !== "pending") return c.json({ ok: false, error: "ALREADY_PROCESSED" }, 409);

    const newStatus = action === "approve" ? "approved" : "declined";
    await sql`UPDATE newchums.community_join_requests SET status = ${newStatus}, reviewed_by_user_id = ${userRows[0].id}, reviewed_at = now() WHERE id = ${requestId}`;

    if (action === "approve") {
      await sql`
        INSERT INTO newchums.community_members (community_id, user_id, role, status) VALUES (${communityId}, ${reqRows[0].user_id}, 'member', 'active')
        ON CONFLICT (community_id, user_id) DO UPDATE SET status = 'active', role = 'member'
      `;
    }

    // Send email notification to the requester
    const requesterRows = (await sql`SELECT email, name FROM newchums.users WHERE id = ${reqRows[0].user_id} LIMIT 1`) as { email: string; name: string | null }[];
    if (requesterRows[0]) {
      const community = communityRows[0];
      if (action === "approve" && c.env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_APPROVED) {
        c.executionCtx.waitUntil(sendCommunityJoinApprovedEmail(c.env, {
          to: requesterRows[0].email,
          userName: requesterRows[0].name || "there",
          communityName: community.name,
          communityUrl: `${c.env.WEB_BASE_URL}/communities/${community.slug}`,
        }));
      } else if (action === "decline" && c.env.POSTMARK_TEMPLATE_COMMUNITY_JOIN_DECLINED) {
        c.executionCtx.waitUntil(sendCommunityJoinDeclinedEmail(c.env, {
          to: requesterRows[0].email,
          userName: requesterRows[0].name || "there",
          communityName: community.name,
        }));
      }
    }

    return c.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error("[PUT /communities/:id/join-requests/:requestId]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /communities/:id/join-requests, list pending requests (owner/super admin) */
app.get("/communities/:id/join-requests", async (c) => {
  const communityId = c.req.param("id");
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
  if (!userRows[0]) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const isSuperAdmin = userRows[0].role === "super_admin";

  try {
    const communityRows = (await sql`SELECT id, owner_user_id FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string; owner_user_id: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (communityRows[0].owner_user_id !== userRows[0].id && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

    const requests = (await sql`
      SELECT cjr.id, cjr.user_id, cjr.created_at, u.name, u.username, u.avatar_key, u.avatar_updated_at
      FROM newchums.community_join_requests cjr
      JOIN newchums.users u ON u.id = cjr.user_id
      WHERE cjr.community_id = ${communityId} AND cjr.status = 'pending'
      ORDER BY cjr.created_at ASC
    `) as Record<string, unknown>[];

    return c.json({ ok: true, requests });
  } catch (err) {
    console.error("[GET /communities/:id/join-requests]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /communities/:id/events, community plan feed */
app.get("/communities/:id/events", async (c) => {
  const communityId = c.req.param("id");
  const payload = await requireAuth(c);
  const sql = getSql(c.env);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 12), 1), 50);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  let userId: string | null = null;
  let isSuperAdmin = false;
  if (payload?.email) {
    const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
    if (userRows[0]) { userId = userRows[0].id; isSuperAdmin = userRows[0].role === "super_admin"; }
  }

  try {
    const communityRows = (await sql`SELECT id, slug, name, visibility, COALESCE(status, 'active') AS status FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string; slug: string; name: string; visibility: string; status: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (communityRows[0].status === "closed" && !isSuperAdmin) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    if (communityRows[0].visibility === "private" && !isSuperAdmin) {
      if (!userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
      const memberCheck = (await sql`SELECT 1 FROM newchums.community_members WHERE community_id = ${communityId} AND user_id = ${userId} AND status = 'active' LIMIT 1`) as unknown[];
      if (memberCheck.length === 0) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
    }

    const communityInfo = { id: communityRows[0].id, slug: communityRows[0].slug, name: communityRows[0].name };

    const events = (await sql`
      SELECT e.id, e.title, e.description, e.starts_at, e.timezone, e.location_type, e.location_name, e.location_area,
        e.location_address, e.location_visibility, e.online_link, e.location_lat, e.location_lng,
        e.visibility, e.status, e.max_seats, e.banner_key, e.host_user_id, e.created_at, e.allow_alt_times,
        u.name AS host_name, u.username AS host_username, u.avatar_key AS host_avatar_key, u.avatar_updated_at AS host_avatar_updated_at,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going_count,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps r WHERE r.event_id = e.id AND r.status = 'maybe') AS maybe_count,
        (SELECT string_agg(i.name, ', ') FROM newchums.event_interests ei JOIN newchums.interests i ON i.id = ei.interest_id WHERE ei.event_id = e.id) AS hobby_names,
        COALESCE(
          (SELECT json_agg(json_build_object('name', ii.name, 'slug', ii.slug, 'category', ii.category))
           FROM newchums.event_interests ei2
           JOIN newchums.interests ii ON ii.id = ei2.interest_id
           WHERE ei2.event_id = e.id AND ii.is_deleted = false),
          '[]'::json
        ) AS hobbies,
        CASE WHEN e.host_user_id = ${userId} THEN true ELSE false END AS is_host,
        r_viewer.status AS my_rsvp_status
      FROM newchums.events e
      JOIN newchums.users u ON u.id = e.host_user_id
      LEFT JOIN newchums.event_rsvps r_viewer ON r_viewer.event_id = e.id AND r_viewer.user_id = ${userId}
      WHERE e.community_id = ${communityId} AND e.status = 'published' AND e.starts_at > now() - interval '24 hours' AND (COALESCE(e.is_qa, false) = false OR ${isSuperAdmin})
      ORDER BY e.starts_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as Record<string, unknown>[];

    // Chum-preference mismatch indicator for feed cards
    let viewerPrefs: ChumPrefsRow | null = null;
    let allMetrics = new Map<string, UserMetricsMap>();
    let dobByUserId = new Map<string, string | null>();
    let viewerDob: string | null = null;
    const attendeeIdsByEvent = new Map<string, string[]>();

    if (userId) {
      viewerPrefs = await loadChumPrefsForUser(sql, userId);

      if (viewerPrefs) {
        // Gather host + attendee IDs
        const nonHostEventIds = events.filter((ev) => String(ev.host_user_id) !== userId).map((ev) => String(ev.id));
        const hostIds = [...new Set(events.filter((ev) => String(ev.host_user_id) !== userId).map((ev) => String(ev.host_user_id)))];

        const attendeeRsvpRows = nonHostEventIds.length > 0 ? (await sql`
          SELECT er.event_id, er.user_id FROM newchums.event_rsvps er
          WHERE er.event_id = ANY(${nonHostEventIds}::uuid[]) AND er.status IN ('going', 'maybe')
        `) as { event_id: string; user_id: string }[] : [];

        const allUserIds = new Set(hostIds);
        for (const ar of attendeeRsvpRows) {
          if (ar.user_id === userId) continue;
          if (!attendeeIdsByEvent.has(ar.event_id)) attendeeIdsByEvent.set(ar.event_id, []);
          attendeeIdsByEvent.get(ar.event_id)!.push(ar.user_id);
          allUserIds.add(ar.user_id);
        }
        allMetrics = await batchLoadMetrics(sql, [...allUserIds]);

        // Only fetch DOBs if the viewer actually has an age preference set.
        if (viewerPrefs.age_pref_years != null) {
          dobByUserId = await batchLoadDobs(sql, [userId, ...allUserIds]);
          viewerDob = dobByUserId.get(userId) ?? null;
        }
      }
    }

    const eventsWithAvatars = events.map((ev) => {
      const isHost = String(ev.host_user_id) === userId;
      let hasPrefMismatch = false;

      if (!isHost && viewerPrefs) {
        // Check host
        const hMetrics = allMetrics.get(String(ev.host_user_id)) ?? {};
        const hostCompat = evaluateChumPreferences(viewerPrefs, hMetrics, true, {
          checkerDob: viewerDob,
          targetDob: dobByUserId.get(String(ev.host_user_id)) ?? null,
        });
        if (!hostCompat.passes) hasPrefMismatch = true;

        // Check attendees
        if (!hasPrefMismatch) {
          const attendees = attendeeIdsByEvent.get(String(ev.id)) ?? [];
          for (const uid of attendees) {
            const m = allMetrics.get(uid) ?? {};
            const isHostUser = uid === String(ev.host_user_id);
            const ac = evaluateChumPreferences(viewerPrefs, m, isHostUser, {
              checkerDob: viewerDob,
              targetDob: dobByUserId.get(uid) ?? null,
            });
            if (!ac.passes) { hasPrefMismatch = true; break; }
          }
        }
      }

      return {
        ...ev,
        host_avatar_url: buildAvatarUrl(String(ev.host_user_id), ev.host_avatar_key as string | null, ev.host_avatar_updated_at as string | null, c.env.MEDIA_BUCKET),
        community: communityInfo,
        hasPrefMismatch,
      };
    });

    return c.json({ ok: true, events: eventsWithAvatars });
  } catch (err) {
    console.error("[GET /communities/:id/events]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Admin communities ──────────────────────────────────────────────────────

/** GET /admin/communities, list all communities (super admin) */
app.get("/admin/communities", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const search = c.req.query("q")?.trim() ?? null;
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 100);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  try {
    const q = search ? `%${search}%` : null;
    const communities = (await sql`
      SELECT c.id, c.slug, c.name, c.visibility, c.join_mode, c.chat_enabled, c.owner_user_id, c.created_at,
        COALESCE(c.status, 'active') AS status, c.location_name,
        ou.name AS owner_name, ou.username AS owner_username, ou.email AS owner_email,
        (SELECT COUNT(*)::int FROM newchums.community_members cm WHERE cm.community_id = c.id AND cm.status = 'active') AS member_count,
        (SELECT COUNT(*)::int FROM newchums.events e WHERE e.community_id = c.id) AS plan_count
      FROM newchums.communities c
      JOIN newchums.users ou ON ou.id = c.owner_user_id
      WHERE (${q}::text IS NULL OR c.name ILIKE ${q} OR c.slug ILIKE ${q} OR ou.name ILIKE ${q} OR ou.email ILIKE ${q})
      ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `) as Record<string, unknown>[];

    return c.json({ ok: true, communities });
  } catch (err) {
    console.error("[GET /admin/communities]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /admin/communities/:id/remove, admin removes a community */
app.post("/admin/communities/:id/remove", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const communityId = c.req.param("id");
  const sql = getSql(c.env);

  try {
    const rows = (await sql`SELECT id FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string }[];
    if (!rows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    await sql`DELETE FROM newchums.communities WHERE id = ${communityId}`;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /admin/communities/:id/remove]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Events ─────────────────────────────────────────────────────────────────

const VALID_VISIBILITY = ["invite_only", "chums_only", "public"] as const;
const VALID_LOCATION_TYPE = ["in_person", "online"] as const;
const VALID_LOCATION_VISIBILITY = ["exact_everyone", "exact_joined_only", "approximate_only"] as const;
const VALID_RSVP_STATUS = ["going", "maybe", "cant_make_it"] as const;

/** Build location display without duplicating street/address when name is a prefix of address. */
function buildLocationDisplay(name: string | null, address: string | null): string {
  const n = name?.trim();
  const a = address?.trim();
  if (!n && !a) return "TBD";
  if (!a) return n!;
  if (!n) return a;
  if (a === n || a.startsWith(n + ", ") || a.startsWith(n + " ")) return a;
  return `${n}, ${a}`;
}

/** Location line for event-match digest emails, aligns with GET /events/:id display rules (non-host). */
function formatEventMatchDigestLocation(p: {
  locationName: string | null;
  locationAddress: string | null;
  locationArea: string;
  locationVisibility: string | null;
  recipientHasRsvp: boolean;
}): string {
  const locVis = p.locationVisibility ?? "exact_everyone";
  const canShowExactLocation =
    locVis === "exact_everyone" ||
    (locVis === "exact_joined_only" && p.recipientHasRsvp);
  const locArea =
    (p.locationArea && p.locationArea.trim()) || deriveApproxArea(p.locationAddress);
  const approxAreaText = locArea || "General area";
  if (canShowExactLocation) {
    return buildLocationDisplay(p.locationName, p.locationAddress);
  }
  return approxAreaText;
}

/**
 * Derive an approximate area description from a full address suitable for
 * display when the exact venue must remain hidden. Strips the street number
 * and name (first comma-separated segment), postal codes, and country, leaving
 * the neighbourhood/district, city, and province/state.
 *
 * Examples:
 *   "2295 Kains Rd, Byron, London, ON N6K 5E2, Canada" → "Byron, London, ON"
 *   "2295 Kains Rd, London, ON N6K 5E2, Canada"        → "London, ON"
 *   "123 Main St, Toronto, ON M5H 1A1, Canada"         → "Toronto, ON"
 */
function deriveApproxArea(address: string | null): string | null {
  if (!address) return null;
  const skipCountry = new Set(["canada", "united states", "usa", "united kingdom", "uk", "australia", "new zealand"]);
  const stripped = address
    .replace(/\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/g, "")  // Canadian postal codes
    .replace(/\b\d{5}(-\d{4})?\b/g, "");             // US zip codes
  const parts = stripped
    .split(",")
    .map((s) => s.trim())
    .filter((p) => p && !skipCountry.has(p.toLowerCase()));
  if (parts.length === 0) return null;
  // Skip first segment (street address); everything else is area/city/province
  const areaParts = parts.length > 1 ? parts.slice(1) : parts;
  return areaParts.filter(Boolean).join(", ") || null;
}

/** POST /events, create a new event/plan */
app.post("/events", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const title = String(body.title ?? "").trim();
  if (!title || title.length > 200) return c.json({ ok: false, error: "VALIDATION", message: "Title is required (max 200 chars)", field: "title" }, 400);

  const titleCheck = validateCleanText(title, "title");
  if (!titleCheck.ok) return c.json({ ok: false, error: "INAPPROPRIATE_TEXT", field: "title" }, 400);

  const description = body.description ? sanitizeDescriptionHtml(String(body.description).trim().slice(0, 5000)) || null : null;
  // Seed from any explicit UUIDs the client already knows
  const seedInterestIds: string[] = Array.isArray(body.interest_ids)
    ? (body.interest_ids as string[]).map(String).filter(Boolean).slice(0, 10)
    : body.interest_id ? [String(body.interest_id)] : [];

  // Parse interest_items ({slug, name}) so we can create-or-look-up interests
  // the same way the profile does, enabling new hobby creation from the plan form.
  const rawInterestItems = Array.isArray(body.interest_items)
    ? (body.interest_items as Array<{ slug?: string; name?: string }>).slice(0, 10)
    : [];

  const startsAt = body.starts_at ? String(body.starts_at) : null;
  if (!startsAt) return c.json({ ok: false, error: "VALIDATION", message: "Start date/time is required", field: "starts_at" }, 400);

  const startsDate = new Date(startsAt);
  if (isNaN(startsDate.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid start date/time", field: "starts_at" }, 400);

  const locationType = String(body.location_type ?? "in_person");
  if (!VALID_LOCATION_TYPE.includes(locationType as typeof VALID_LOCATION_TYPE[number]))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid location type", field: "location_type" }, 400);

  const visibility = String(body.visibility ?? "public");
  if (!VALID_VISIBILITY.includes(visibility as typeof VALID_VISIBILITY[number]))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid visibility", field: "visibility" }, 400);

  const maxSeats = body.max_seats != null ? Number(body.max_seats) : null;
  if (maxSeats !== null && (isNaN(maxSeats) || maxSeats < 1 || maxSeats > 500))
    return c.json({ ok: false, error: "VALIDATION", message: "Seats must be between 1 and 500", field: "max_seats" }, 400);

  const allowAltTimes = body.allow_alt_times !== false;
  const altTimesMode = body.alt_times_mode === "availability" ? "availability" : "suggest";
  let availabilityDeadlineAt: string | null = null;
  if (altTimesMode === "availability" && body.availability_deadline_at) {
    const dl = new Date(String(body.availability_deadline_at));
    if (!isNaN(dl.getTime())) {
      if (dl.getTime() >= startsDate.getTime())
        return c.json({ ok: false, error: "VALIDATION", message: "Availability deadline must be before the plan start time", field: "availability_deadline_at" }, 400);
      availabilityDeadlineAt = dl.toISOString();
    }
  }
  const allowAttendeeInvites = body.allow_attendee_invites !== false;
  const reserveSeats = body.reserve_seats === true;
  const requireReconfirmation = body.require_reconfirmation === true;
  const requireApproval = body.require_approval === true;
  const status = body.status === "draft" ? "draft" : "published";
  const timezone = body.timezone && typeof body.timezone === "string" ? body.timezone.trim().slice(0, 64) : "UTC";
  const prefOverrides = parsePrefOverrides(body.pref_overrides ?? null);
  const communityId = body.community_id ? String(body.community_id) : null;
  const hideFromExplore = body.hide_from_explore === true;

  // QA plan flag: only super_admins can create QA plans
  const isQa = body.is_qa === true;
  if (isQa) {
    const isSuperAdmin = await checkIsSuperAdmin(sql, userId);
    if (!isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN", message: "Only super admins can create QA plans" }, 403);
  }

  // Attendance assurance fields
  const minConfirmedAttendees = requireReconfirmation && body.min_confirmed_attendees != null
    ? Math.max(1, Math.min(500, Math.floor(Number(body.min_confirmed_attendees))))
    : null;
  const VALID_FALLBACK_POLICIES = ["proceed", "notify_host", "auto_cancel"] as const;
  const fallbackPolicy = requireReconfirmation && typeof body.fallback_policy === "string" && VALID_FALLBACK_POLICIES.includes(body.fallback_policy as typeof VALID_FALLBACK_POLICIES[number])
    ? body.fallback_policy as string
    : "notify_host";

  const locationName = body.location_name ? String(body.location_name).trim().slice(0, 200) : null;
  const locationAddress = body.location_address ? String(body.location_address).trim().slice(0, 500) : null;
  const locationPlaceId = body.location_place_id ? String(body.location_place_id) : null;
  const locationLat = body.location_lat != null ? Number(body.location_lat) : null;
  const locationLng = body.location_lng != null ? Number(body.location_lng) : null;
  const locationVisibility =
    locationType === "in_person"
      ? (VALID_LOCATION_VISIBILITY.includes(String(body.location_visibility ?? "exact_everyone") as typeof VALID_LOCATION_VISIBILITY[number])
          ? String(body.location_visibility)
          : "exact_everyone")
      : "exact_everyone";
  let locationArea = body.location_area ? String(body.location_area).trim().slice(0, 200) : null;
  if (!locationArea && (locationVisibility === "approximate_only" || locationVisibility === "exact_joined_only") && locationAddress) {
    locationArea = deriveApproxArea(locationAddress);
  }
  const onlineLink = body.online_link ? String(body.online_link).trim().slice(0, 500) : null;

  // Validate community_id if provided
  if (communityId) {
    try {
      const cmRows = (await sql`
        SELECT 1 FROM newchums.community_members WHERE community_id = ${communityId} AND user_id = ${userId} AND status = 'active' LIMIT 1
      `) as unknown[];
      if (cmRows.length === 0) return c.json({ ok: false, error: "VALIDATION", message: "You must be a member of the community", field: "community_id" }, 400);
    } catch { /* community validation failure is non-fatal, will fail at INSERT FK */ }
  }

  try {
    // --- Resolve interests (look up existing or create new) ---
    // Validate and canonicalise any explicitly provided UUIDs
    const resolvedInterestIds: string[] = [];
    for (const iid of seedInterestIds) {
      const rows = (await sql`SELECT id FROM newchums.interests WHERE id = ${iid} AND is_deleted = false`) as { id: string }[];
      if (rows.length > 0 && !resolvedInterestIds.includes(iid)) resolvedInterestIds.push(iid);
    }

    // Process interest_items, create missing interests then collect IDs
    if (rawInterestItems.length > 0) {
      const slugsToResolve: { slug: string; name: string }[] = [];
      for (const it of rawInterestItems) {
        const slug = it?.slug ? nameToSlug(String(it.slug).trim()) : "";
        const name = it?.name ? String(it.name).trim().replace(/\s+/g, " ") : "";
        if (!slug || !name) continue;
        if (name.length > 50)
          return c.json({ ok: false, error: "VALIDATION", message: "Hobby name must be 50 characters or less", field: "hobby" }, 400);
        const hobbyCheck = validateCleanText(name, "hobby");
        if (!hobbyCheck.ok)
          return c.json({ ok: false, error: "INAPPROPRIATE_TEXT", field: "hobby", message: hobbyCheck.reason ?? "That hobby name isn't allowed." }, 400);
        slugsToResolve.push({ slug, name });
      }

      if (slugsToResolve.length > 0) {
        const slugList = slugsToResolve.map((s) => s.slug.toLowerCase());
        const existingRows = (await sql`
          SELECT id, slug, is_deleted, merged_into_interest_id
          FROM newchums.interests WHERE LOWER(slug) = ANY(${slugList})
        `) as { id: string; slug: string; is_deleted: boolean; merged_into_interest_id: string | null }[];
        const existingBySlug = new Map(existingRows.map((r) => [r.slug.toLowerCase(), r]));

        const mergeTargetIds = [...new Set(
          existingRows.filter((r) => r.is_deleted && r.merged_into_interest_id).map((r) => r.merged_into_interest_id!),
        )];
        const mergeTargetRows = mergeTargetIds.length > 0
          ? (await sql`SELECT id, slug, is_deleted FROM newchums.interests WHERE id = ANY(${mergeTargetIds})`) as { id: string; slug: string; is_deleted: boolean }[]
          : [];
        const mergeTargetById = new Map(mergeTargetRows.map((r) => [r.id, r]));

        for (const { slug, name } of slugsToResolve) {
          const existing = existingBySlug.get(slug.toLowerCase());
          let resolvedId: string | null = null;

          if (!existing) {
            // New interest: create it, then fetch the id (handles race conditions)
            try {
              await sql`
                INSERT INTO newchums.interests (name, category, slug, sort_order, is_seed, created_by_user_id)
                VALUES (${name}, '', ${slug}, 0, false, ${userId})
                ON CONFLICT (slug) DO NOTHING
              `;
            } catch { /* ignore duplicate from concurrent insert */ }
            const fetched = (await sql`
              SELECT id FROM newchums.interests WHERE LOWER(slug) = LOWER(${slug}) AND is_deleted = false LIMIT 1
            `) as { id: string }[];
            resolvedId = fetched[0]?.id ?? null;
          } else if (!existing.is_deleted) {
            resolvedId = existing.id;
          } else if (existing.merged_into_interest_id) {
            const target = mergeTargetById.get(existing.merged_into_interest_id);
            if (target && !target.is_deleted) resolvedId = target.id;
            // else: merged target also gone, skip silently
          }
          // else: deleted with no merge target, skip silently

          if (resolvedId && !resolvedInterestIds.includes(resolvedId)) {
            resolvedInterestIds.push(resolvedId);
          }
        }
      }
    }

    if (resolvedInterestIds.length === 0)
      return c.json({ ok: false, error: "VALIDATION", message: "At least one hobby is required", field: "hobby" }, 400);

    const interestId = resolvedInterestIds[0] ?? null;

    const rows = (await sql`
      INSERT INTO newchums.events (
        host_user_id, title, description, interest_id, starts_at,
        location_type, location_name, location_address, location_place_id, location_lat, location_lng,
        location_visibility, location_area, online_link,
        max_seats, visibility, status, allow_alt_times, alt_times_mode, availability_deadline_at, allow_attendee_invites, reserve_seats, require_reconfirmation, require_approval, timezone,
        min_confirmed_attendees, fallback_policy, pref_overrides, community_id, hide_from_explore, is_qa
      ) VALUES (
        ${userId}, ${title}, ${description}, ${interestId}, ${startsDate.toISOString()},
        ${locationType}, ${locationName}, ${locationAddress}, ${locationPlaceId}, ${locationLat}, ${locationLng},
        ${locationVisibility}, ${locationArea}, ${onlineLink},
        ${maxSeats}, ${visibility}, ${status}, ${allowAltTimes}, ${altTimesMode}, ${availabilityDeadlineAt}, ${allowAttendeeInvites}, ${reserveSeats}, ${requireReconfirmation}, ${requireApproval}, ${timezone},
        ${minConfirmedAttendees}, ${fallbackPolicy}, ${prefOverrides ? JSON.stringify(prefOverrides) : null}, ${communityId}, ${hideFromExplore}, ${isQa}
      )
      RETURNING id, created_at
    `) as { id: string; created_at: string }[];

    const eventId = rows[0].id;

    if (resolvedInterestIds.length > 0) {
      try {
        await sql`
          INSERT INTO newchums.event_interests (event_id, interest_id)
          SELECT ${eventId}::uuid, unnest(${resolvedInterestIds}::uuid[])
          ON CONFLICT DO NOTHING
        `;
      } catch { /* skip invalid interest refs */ }
    }

    // Creator counts as attending: add host as RSVP "going" so they appear in participant counts and event details
    await sql`
      INSERT INTO newchums.event_rsvps (event_id, user_id, status, committed_at)
      VALUES (${eventId}, ${userId}, 'going', NOW())
      ON CONFLICT (event_id, user_id) DO NOTHING
    `;

    const invitees = Array.isArray(body.invitees) ? (body.invitees as Array<{ user_id?: string; email?: string }>) : [];
    if (invitees.length > 0 && status === "published") {
      // Pre-fetch host info once instead of per-invitee
      const hostUserRow = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
      const hostName = hostUserRow[0]?.name?.trim() || hostUserRow[0]?.username?.replace(/^@/, "") || "Someone";

      // Batch-load invitee notification prefs and user details
      const inviteeUserIds = invitees.slice(0, 50)
        .map((inv) => inv.user_id ? String(inv.user_id) : null)
        .filter((id): id is string => id !== null);
      const [invPrefsMap, invUserRowsBatch] = await Promise.all([
        batchLoadNotificationPrefs(sql, inviteeUserIds),
        inviteeUserIds.length > 0
          ? (sql`SELECT id, email, name FROM newchums.users WHERE id = ANY(${inviteeUserIds}::uuid[])` as Promise<{ id: string; email: string; name: string | null }[]>)
          : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
      ]);
      const invUserMap = new Map(invUserRowsBatch.map((r) => [r.id, r]));

      // QA plans: only send invite emails/notifications to super admin invitees
      const qaInviteAdminIds = isQa ? await batchLoadSuperAdminIds(sql, inviteeUserIds) : null;

      for (const inv of invitees.slice(0, 50)) {
        let invUserId = inv.user_id ? String(inv.user_id) : null;
        let invEmail = inv.email ? String(inv.email).trim().toLowerCase() : null;
        if (!invUserId && !invEmail) continue;

        // QA plans: skip non-super-admin registered-user invitees.
        // Email-only invites are allowed so QA plans can be tested through the guest flow.
        if (qaInviteAdminIds) {
          if (invUserId && !qaInviteAdminIds.has(invUserId)) continue;
        }

        // Normalize identity: if the inviter passed an email and a user with
        // that email already has an account, resolve to user_id (and clear
        // email) so the invite is stored against the canonical identity.
        // Mirrors the same normalization used in POST /events/:id/invite and
        // ensures creation-time invites land in a form that future dedup
        // checks can recognize.
        if (!invUserId && invEmail) {
          const lookup = (await sql`SELECT id FROM newchums.users WHERE LOWER(email) = ${invEmail} LIMIT 1`) as { id: string }[];
          if (lookup.length > 0) {
            invUserId = lookup[0].id;
            invEmail = null;
            if (qaInviteAdminIds && !qaInviteAdminIds.has(invUserId)) continue;
          }
        }

        try {
          await sql`
            INSERT INTO newchums.event_invites (event_id, user_id, email, invited_by)
            VALUES (${eventId}, ${invUserId}, ${invEmail}, ${userId})
            ON CONFLICT DO NOTHING
          `;

          if (invUserId) {
            await sql`
              INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
              VALUES (${invUserId}, 'event_invite', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: title })})
            `;
            const invPrefs = normalizeNotificationPrefs(invPrefsMap.get(invUserId));
            if (invPrefs.items.event_invite?.enabled !== false) {
              const invUser = invUserMap.get(invUserId);
              if (invUser) {
                try {
                  const iToken = await createInviteToken(c.env.NEXTAUTH_SECRET, { eventId, userId: invUserId });
                  const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, invUserId, "event_invite");
                  await sendEventInviteEmail(c.env, {
                    to: invUser.email,
                    recipientName: invUser.name?.trim() || "there",
                    hostName,
                    eventTitle: title,
                    eventDate: formatEventDate(startsDate.toISOString(), timezone),
                    eventLocation: locationType === "online" ? (onlineLink || "Online") : buildLocationDisplay(locationName, locationAddress),
                    eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
                    inviteToken: iToken,
                    unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
                  });
                } catch { /* noop if template missing */ }
              }
            }
          } else if (invEmail) {
            try {
              const iToken = await createInviteToken(c.env.NEXTAUTH_SECRET, { eventId, email: invEmail });
              await sendEventInviteEmail(c.env, {
                to: invEmail,
                recipientName: "there",
                hostName,
                eventTitle: title,
                eventDate: formatEventDate(startsDate.toISOString(), timezone),
                eventLocation: locationType === "online" ? (onlineLink || "Online") : buildLocationDisplay(locationName, locationAddress),
                eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
                inviteToken: iToken,
              });
            } catch { /* noop if template missing */ }
          }
        } catch { /* skip individual invite failures */ }
      }
    } else {
      // Draft status or no invitees - just insert invite records without sending emails
      for (const inv of invitees.slice(0, 50)) {
        let invUserId = inv.user_id ? String(inv.user_id) : null;
        let invEmail = inv.email ? String(inv.email).trim().toLowerCase() : null;
        if (!invUserId && !invEmail) continue;
        // Same email->user_id normalization as the published branch above so
        // draft invites land in canonical form too.
        if (!invUserId && invEmail) {
          const lookup = (await sql`SELECT id FROM newchums.users WHERE LOWER(email) = ${invEmail} LIMIT 1`) as { id: string }[];
          if (lookup.length > 0) {
            invUserId = lookup[0].id;
            invEmail = null;
          }
        }
        try {
          await sql`
            INSERT INTO newchums.event_invites (event_id, user_id, email, invited_by)
            VALUES (${eventId}, ${invUserId}, ${invEmail}, ${userId})
            ON CONFLICT DO NOTHING
          `;
        } catch { /* skip individual invite failures */ }
      }
    }

    return c.json({ ok: true, event: { id: eventId, created_at: rows[0].created_at } }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "42703" || msg.includes("does not exist")) {
      console.error("[POST /events] Schema mismatch:", msg, "Ensure migration 024 (newchums.events) is applied.");
    } else {
      console.error("[POST /events]", err);
    }
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /events/mine, list events I host or am invited to / RSVPd */
app.get("/events/mine", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const mineViewerIsSuperAdmin = await checkIsSuperAdmin(sql, userId);

  const filter = c.req.query("filter") ?? "upcoming";
  const now = new Date().toISOString();

  try {
    const rows = (await sql`
      SELECT
        e.id, e.title, e.description, e.starts_at, e.timezone, e.location_type,
        e.location_name, e.location_address, e.location_visibility, e.location_area, e.online_link,
        e.max_seats, e.visibility, e.status, e.allow_alt_times,
        e.host_user_id, e.created_at, e.canceled_at, e.cancellation_reason, e.banner_key,
        COALESCE(e.is_qa, false) AS is_qa,
        COALESCE(
          (SELECT json_agg(json_build_object('name', ii.name, 'slug', ii.slug, 'category', ii.category))
           FROM newchums.event_interests ei2
           JOIN newchums.interests ii ON ii.id = ei2.interest_id
           WHERE ei2.event_id = e.id AND ii.is_deleted = false),
          '[]'::json
        ) AS hobbies,
        i.name AS interest_name, i.slug AS interest_slug,
        h.name AS host_name, h.username AS host_username,
        r.status AS my_rsvp_status,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'going') AS going_count,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'maybe') AS maybe_count,
        CASE WHEN e.host_user_id = ${userId} THEN true ELSE false END AS is_host,
        CASE WHEN (
          e.host_user_id = ${userId}
          OR EXISTS (SELECT 1 FROM newchums.event_rsvps er2 WHERE er2.event_id = e.id AND er2.user_id = ${userId} AND er2.status = 'going')
        ) AND EXISTS (
          SELECT 1 FROM newchums.event_chat_messages cm
          WHERE cm.event_id = e.id
            AND cm.created_at > COALESCE(
              (SELECT cr.last_read_at FROM newchums.event_chat_reads cr WHERE cr.event_id = e.id AND cr.user_id = ${userId}),
              '1970-01-01'::timestamptz
            )
        ) THEN true ELSE false END AS has_unread_chat
      FROM newchums.events e
      LEFT JOIN newchums.interests i ON i.id = e.interest_id
      LEFT JOIN newchums.users h ON h.id = e.host_user_id
      LEFT JOIN newchums.event_rsvps r ON r.event_id = e.id AND r.user_id = ${userId}
      WHERE e.status != 'draft'
        AND (COALESCE(e.is_qa, false) = false OR ${mineViewerIsSuperAdmin})
        AND (
          e.host_user_id = ${userId}
          OR EXISTS (SELECT 1 FROM newchums.event_invites ei WHERE ei.event_id = e.id AND ei.user_id = ${userId})
          OR EXISTS (SELECT 1 FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.user_id = ${userId})
        )
        AND ${filter === "past" ? sql`e.starts_at < ${now}` : sql`e.starts_at >= ${now}`}
      ORDER BY ${filter === "past" ? sql`e.starts_at DESC` : sql`e.starts_at ASC`}
      LIMIT 50
    `) as Array<{
      id: string; title: string; description: string | null; starts_at: string;
      location_type: string; location_name: string | null; location_address: string | null;
      location_visibility: string | null; location_area: string | null; online_link: string | null;
      max_seats: number | null; visibility: string;
      status: string; allow_alt_times: boolean; host_user_id: string;
      created_at: string; canceled_at: string | null; cancellation_reason: string | null; banner_key: string | null;
      hobbies: Array<{ name: string; slug: string }> | string;
      interest_name: string | null; interest_slug: string | null;
      host_name: string | null; host_username: string | null;
      my_rsvp_status: string | null;
      going_count: number; maybe_count: number; is_host: boolean;
      has_unread_chat: boolean; is_qa: boolean;
    }>;

    const events = rows.map((r) => {
      const parsedHobbies = typeof r.hobbies === "string" ? JSON.parse(r.hobbies) : (r.hobbies ?? []);
      const hobbyList = Array.isArray(parsedHobbies) && parsedHobbies.length > 0
        ? parsedHobbies as Array<{ name: string; slug: string }>
        : r.interest_name ? [{ name: r.interest_name, slug: r.interest_slug ?? "" }] : [];
      const locVis = r.location_visibility ?? "exact_everyone";
      const hasRsvp = r.my_rsvp_status != null;
      const canShowExact =
        r.location_type !== "in_person" ||
        locVis === "exact_everyone" ||
        r.is_host ||
        (locVis === "exact_joined_only" && hasRsvp);
      const locationDisplay =
        r.location_type === "online"
          ? (r.online_link || "Online")
          : canShowExact
            ? buildLocationDisplay(r.location_name, r.location_address)
            : (r.location_area || "General area");
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        startsAt: r.starts_at,
        timezone: r.timezone,
        locationType: r.location_type,
        locationDisplay,
        locationName: canShowExact ? r.location_name : null,
        locationAddress: canShowExact ? r.location_address : null,
        onlineLink: r.online_link,
        maxSeats: r.max_seats,
        visibility: r.visibility,
        status: r.status,
        allowAltTimes: r.allow_alt_times,
        canceledAt: r.canceled_at,
        cancellationReason: r.cancellation_reason,
        createdAt: r.created_at,
        hobby: hobbyList[0]?.name ?? null,
        hobbySlug: hobbyList[0]?.slug ?? null,
        hobbies: hobbyList,
        hostName: (() => { const u = r.host_username?.replace(/^@/, ""); return u ? `@${u}` : (r.host_name?.trim() || "Someone"); })(),
        isHost: r.is_host,
        myRsvpStatus: r.my_rsvp_status,
        goingCount: r.going_count,
        maybeCount: r.maybe_count,
        bannerKey: r.banner_key ?? null,
        hasUnreadChat: r.has_unread_chat === true,
        isQa: r.is_qa || undefined,
      };
    });

    return c.json({ ok: true, events });
  } catch (err) {
    console.error("[GET /events/mine]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /events/explore/public, public event discovery feed for anonymous visitors.
 *  No auth required. Only returns public-visibility events with privacy-safe data. */
app.get("/events/explore/public", async (c) => {
  const sql = getSql(c.env);

  const hobbySlug = c.req.query("hobby") ?? null;
  const search = c.req.query("q")?.trim() ?? null;
  const pageLimit = Math.min(Math.max(Number(c.req.query("limit") ?? 12), 1), 50);
  const pageOffset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const sortParam = c.req.query("sort") ?? "upcoming";

  const timeRange = c.req.query("time_range") ?? "all";
  const now = new Date();
  let dateEnd: Date | null = null;
  if (timeRange === "this_week") {
    dateEnd = new Date(now);
    dateEnd.setDate(dateEnd.getDate() + (7 - dateEnd.getDay()));
    dateEnd.setHours(23, 59, 59, 999);
  } else if (timeRange === "this_weekend") {
    dateEnd = new Date(now);
    const dayOfWeek = dateEnd.getDay();
    const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    dateEnd.setDate(dateEnd.getDate() + daysToSunday);
    dateEnd.setHours(23, 59, 59, 999);
  } else if (timeRange === "next_30") {
    dateEnd = new Date(now);
    dateEnd.setDate(dateEnd.getDate() + 30);
  }

  const sortByNewest = sortParam === "newest";
  const orderClause = sortByNewest
    ? sql`e.created_at DESC, e.starts_at ASC`
    : sql`e.starts_at ASC`;

  try {
    const rows = (await sql`
      SELECT
        e.id, e.title, e.description, e.starts_at, e.timezone, e.location_type,
        e.location_area, e.online_link,
        e.max_seats, e.visibility, e.status, e.banner_key,
        COALESCE(
          (SELECT json_agg(json_build_object('name', ii.name, 'slug', ii.slug, 'category', ii.category))
           FROM newchums.event_interests ei2
           JOIN newchums.interests ii ON ii.id = ei2.interest_id
           WHERE ei2.event_id = e.id AND ii.is_deleted = false),
          '[]'::json
        ) AS hobbies,
        i.name AS interest_name, i.slug AS interest_slug,
        h.name AS host_name, h.username AS host_username,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'going') AS going_count,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'maybe') AS maybe_count
      FROM newchums.events e
      LEFT JOIN newchums.interests i ON i.id = e.interest_id
      LEFT JOIN newchums.users h ON h.id = e.host_user_id
      WHERE e.status = 'published'
        AND e.starts_at >= ${now.toISOString()}
        AND e.visibility = 'public'
        AND COALESCE(e.hide_from_explore, false) = false
        AND COALESCE(e.is_qa, false) = false
        ${hobbySlug ? sql`AND EXISTS (
          SELECT 1 FROM newchums.interests ii_pick
          WHERE ii_pick.slug = ${hobbySlug} AND ii_pick.is_deleted = false
            AND EXISTS (
              SELECT 1 FROM newchums.event_interests ei3
              JOIN newchums.interests ii3 ON ii3.id = ei3.interest_id AND ii3.is_deleted = false
              WHERE ei3.event_id = e.id
                AND LOWER(COALESCE(NULLIF(TRIM(ii3.category), ''), ii3.name))
                  = LOWER(COALESCE(NULLIF(TRIM(ii_pick.category), ''), ii_pick.name))
            )
        )` : sql``}
        ${search ? sql`AND (e.title ILIKE ${"%" + search + "%"} OR e.description ILIKE ${"%" + search + "%"})` : sql``}
        ${dateEnd ? sql`AND e.starts_at <= ${dateEnd.toISOString()}` : sql``}
      ORDER BY ${orderClause}
      LIMIT ${pageLimit + 1} OFFSET ${pageOffset}
    `) as Array<{
      id: string; title: string; description: string | null; starts_at: string; timezone: string | null;
      location_type: string; location_area: string | null; online_link: string | null;
      max_seats: number | null; visibility: string; status: string; banner_key: string | null;
      hobbies: Array<{ name: string; slug: string }> | string;
      interest_name: string | null; interest_slug: string | null;
      host_name: string | null; host_username: string | null;
      going_count: number; maybe_count: number;
    }>;

    const allMapped = rows.map((r) => {
      const parsedHobbies = typeof r.hobbies === "string" ? JSON.parse(r.hobbies) : (r.hobbies ?? []);
      const hobbyList = Array.isArray(parsedHobbies) && parsedHobbies.length > 0
        ? parsedHobbies as Array<{ name: string; slug: string }>
        : r.interest_name ? [{ name: r.interest_name, slug: r.interest_slug ?? "" }] : [];
      const locationDisplay =
        r.location_type === "online" ? "Online"
          : r.location_area || "General area";
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        startsAt: r.starts_at,
        timezone: r.timezone,
        locationType: r.location_type,
        locationDisplay,
        locationName: null,
        locationAddress: null,
        onlineLink: null,
        maxSeats: r.max_seats,
        visibility: r.visibility,
        status: r.status,
        hobby: hobbyList[0]?.name ?? null,
        hobbySlug: hobbyList[0]?.slug ?? null,
        hobbies: hobbyList,
        hostName: (() => { const u = r.host_username?.replace(/^@/, ""); return u ? `@${u}` : (r.host_name?.trim() || "Someone"); })(),
        isHost: false,
        myRsvpStatus: null,
        goingCount: r.going_count,
        maybeCount: r.maybe_count,
        distanceKm: null,
        bannerKey: r.banner_key ?? null,
      };
    });

    const hasMore = allMapped.length > pageLimit;
    const events = allMapped.slice(0, pageLimit);
    return c.json({ ok: true, events, hasMore });
  } catch (err) {
    console.error("[GET /events/explore/public]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /explore/local-signal — lightweight support signal for the bottom of the
 *  logged-in Explore feed. Returns one local-interest line when the count meets
 *  the minimum threshold.
 *
 *  Matching is done on **effective category** (see effectiveCategoryOf in
 *  web/src/lib/interestUtils.ts). Each candidate hobby contributes its
 *  effective category, and we count distinct local active users who have any
 *  interest sharing that effective category.
 *
 *  Selection logic:
 *  1. Build candidate categories: filter hobby's category first (if set),
 *     followed by the viewer's profile hobby categories in order.
 *  2. For each candidate (in priority order), count local active users with an
 *     interest in the same effective category.
 *  3. Pick the highest-count candidate that reaches MIN_COUNT (= 5).
 *  4. If nothing qualifies, return null.
 *
 *  "Active" = last_active_at within 6 months AND not suspended.
 *  "Local" = user has home_lat/lng and is within the viewer's travel radius.
 */
app.get("/explore/local-signal", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const MIN_COUNT = 5;
  const ACTIVE_MONTHS = 6;

  try {
    const sql = getSql(c.env);
    const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

    // Load viewer location + travel radius
    const profileRows = (await sql`
      SELECT home_lat, home_lng, travel_radius_km
      FROM newchums.user_profile WHERE user_id = ${userId} LIMIT 1
    `) as { home_lat: number | null; home_lng: number | null; travel_radius_km: number | null }[];
    const prof = profileRows[0];
    if (!prof?.home_lat || !prof?.home_lng) {
      return c.json({ ok: true, signal: null });
    }
    const lat = prof.home_lat;
    const lng = prof.home_lng;
    const radiusKm = prof.travel_radius_km ?? 200;

    // Active cutoff
    const activeSince = new Date(Date.now() - ACTIVE_MONTHS * 30 * 24 * 60 * 60 * 1000).toISOString();

    // Determine candidate hobby slugs: filtered hobby first, then viewer profile hobbies
    const filterHobbySlug = c.req.query("hobby")?.trim() || null;

    const viewerHobbyRows = (await sql`
      SELECT i.id, i.slug, i.name, i.category
      FROM newchums.user_interests ui
      JOIN newchums.interests i ON i.id = ui.interest_id AND i.is_deleted = false
      WHERE ui.user_id = ${userId}
      ORDER BY i.name
    `) as { id: string; slug: string; name: string; category: string | null }[];

    // Build ordered candidate list: filter hobby first (if any), then viewer's
    // hobbies. Each candidate is keyed by its **effective category**, which is
    // also the display label we'd show in the signal. We dedupe by effective
    // category so two interests in the same category contribute one candidate.
    type Candidate = { displayLabel: string; effectiveCategory: string };
    const candidates: Candidate[] = [];
    const seenCategories = new Set<string>();
    const pushCandidate = (name: string, category: string | null) => {
      const cat = (category ?? "").trim();
      const display = cat !== "" ? cat : name;
      const ec = display.trim().toLowerCase();
      if (!ec || seenCategories.has(ec)) return;
      seenCategories.add(ec);
      candidates.push({ displayLabel: display, effectiveCategory: ec });
    };

    if (filterHobbySlug) {
      const filterRows = (await sql`
        SELECT id, slug, name, category FROM newchums.interests
        WHERE slug = ${filterHobbySlug} AND is_deleted = false LIMIT 1
      `) as { id: string; slug: string; name: string; category: string | null }[];
      if (filterRows.length > 0) {
        pushCandidate(filterRows[0].name, filterRows[0].category);
      }
    }
    for (const h of viewerHobbyRows) {
      pushCandidate(h.name, h.category);
    }

    if (candidates.length === 0) {
      return c.json({ ok: true, signal: null });
    }

    // Count local active users per candidate effective category in one pass.
    const candidateCategories = candidates.map((c) => c.effectiveCategory);
    const counts = (await sql`
      SELECT
        LOWER(COALESCE(NULLIF(TRIM(i.category), ''), i.name)) AS effective_category,
        COUNT(DISTINCT ui.user_id)::int AS cnt
      FROM newchums.user_interests ui
      JOIN newchums.interests i ON i.id = ui.interest_id AND i.is_deleted = false
      JOIN newchums.users u ON u.id = ui.user_id
        AND u.id != ${userId}
        AND COALESCE(u.is_suspended, false) = false
        AND u.last_active_at >= ${activeSince}::timestamptz
      JOIN newchums.user_profile up ON up.user_id = u.id
        AND up.home_lat IS NOT NULL AND up.home_lng IS NOT NULL
        AND 6371 * acos(LEAST(1.0, GREATEST(-1.0,
          cos(radians(${lat})) * cos(radians(up.home_lat)) *
          cos(radians(up.home_lng) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(up.home_lat))
        ))) <= ${radiusKm}
      WHERE LOWER(COALESCE(NULLIF(TRIM(i.category), ''), i.name)) = ANY(${candidateCategories})
      GROUP BY effective_category
    `) as { effective_category: string; cnt: number }[];

    const countMap = new Map(counts.map((r) => [r.effective_category, r.cnt]));

    // Pick the highest-count candidate that reaches the minimum, breaking ties
    // by candidate priority order (filter hobby first, then viewer hobbies).
    let best: { displayLabel: string; count: number; priority: number } | null = null;
    candidates.forEach((cand, idx) => {
      const cnt = countMap.get(cand.effectiveCategory) ?? 0;
      if (cnt < MIN_COUNT) return;
      if (!best || cnt > best.count || (cnt === best.count && idx < best.priority)) {
        best = { displayLabel: cand.displayLabel, count: cnt, priority: idx };
      }
    });

    if (best) {
      const winner = best as { displayLabel: string; count: number; priority: number };
      return c.json({ ok: true, signal: { hobbyName: winner.displayLabel, count: winner.count } });
    }

    return c.json({ ok: true, signal: null });
  } catch (err) {
    console.error("[GET /explore/local-signal]", err);
    return c.json({ ok: true, signal: null }); // Degrade gracefully
  }
});

/** GET /events/explore, discoverable events for the logged-in user.
 *  MUST be registered before /events/:id to prevent "explore" being parsed as a UUID. */
app.get("/events/explore", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const viewerIsSuperAdmin = await checkIsSuperAdmin(sql, userId);

  const lat = c.req.query("lat") ? Number(c.req.query("lat")) : null;
  const lng = c.req.query("lng") ? Number(c.req.query("lng")) : null;
  const radiusKm = Math.min(Math.max(Number(c.req.query("radius_km") ?? 200), 1), 20000);
  const hobbySlug = c.req.query("hobby") ?? null;
  const search = c.req.query("q")?.trim() ?? null;
  const pageLimit = Math.min(Math.max(Number(c.req.query("limit") ?? 12), 1), 50);
  const pageOffset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const sortParam = c.req.query("sort") ?? "upcoming";
  const personalizeParam = c.req.query("personalize") ?? "1";
  const personalizeEnabled = personalizeParam !== "0";

  const timeRange = c.req.query("time_range") ?? "all";
  const now = new Date();
  let dateEnd: Date | null = null;
  if (timeRange === "this_week") {
    dateEnd = new Date(now);
    dateEnd.setDate(dateEnd.getDate() + (7 - dateEnd.getDay()));
    dateEnd.setHours(23, 59, 59, 999);
  } else if (timeRange === "this_weekend") {
    dateEnd = new Date(now);
    const dayOfWeek = dateEnd.getDay();
    const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    dateEnd.setDate(dateEnd.getDate() + daysToSunday);
    dateEnd.setHours(23, 59, 59, 999);
  } else if (timeRange === "next_30") {
    dateEnd = new Date(now);
    dateEnd.setDate(dateEnd.getDate() + 30);
  }

  const hasLocation = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng);

  try {
    // Hobby matching uses **effective category** (see effectiveCategoryOf in
    // web/src/lib/interestUtils.ts and the digest comment block above). Two
    // interests match when they share an effective category, so the viewer's
    // fingerprint is the set of distinct effective categories on their profile.
    const userHobbyRows = (await sql`
      SELECT DISTINCT
        LOWER(COALESCE(NULLIF(TRIM(ii.category), ''), ii.name)) AS effective_category
      FROM newchums.user_interests ui
      JOIN newchums.interests ii ON ii.id = ui.interest_id
      WHERE ui.user_id = ${userId} AND ii.is_deleted = false
    `) as { effective_category: string }[];
    const userEffectiveCategories = userHobbyRows.map((r) => r.effective_category);
    const hasUserHobbies = userEffectiveCategories.length > 0;

    // Pre-fetch viewer's metrics for host→viewer chum preference filtering
    const viewerMetricRows = (await sql`
      SELECT metric, score FROM newchums.user_metrics WHERE user_id = ${userId}
    `) as { metric: string; score: string }[];
    const viewerReliability = parseFloat(viewerMetricRows.find((r) => r.metric === "reliability")?.score ?? String(METRIC_BASELINE));
    const viewerSociability = parseFloat(viewerMetricRows.find((r) => r.metric === "sociability")?.score ?? String(METRIC_BASELINE));
    const viewerPresentation = parseFloat(viewerMetricRows.find((r) => r.metric === "presentation")?.score ?? String(METRIC_BASELINE));

    // Pre-fetch viewer's chum preferences for viewer→host compatibility notes
    const viewerPrefs = await loadChumPrefsForUser(sql, userId);

    // Pre-fetch viewer's DOB so the host→viewer age filter (in SQL below) and the
    // viewer→host age soft note (in JS post-pass) can both run.
    const viewerDobRows = (await sql`
      SELECT date_of_birth FROM newchums.users WHERE id = ${userId} LIMIT 1
    `) as { date_of_birth: string | Date | null }[];
    const viewerDob: string | null = viewerDobRows[0]?.date_of_birth
      ? typeof viewerDobRows[0].date_of_birth === "string"
        ? (viewerDobRows[0].date_of_birth as string)
        : (viewerDobRows[0].date_of_birth as Date).toISOString().slice(0, 10)
      : null;
    const viewerAge = computeAge(viewerDob);

    // Count distinct effective categories on the event that overlap with the
    // viewer's set. Distinct so an event tagged with both "MTG Draft" and
    // "MTG Commander" still contributes 1 to the score, not 2.
    const hobbyMatchSelectExpr = hasUserHobbies && personalizeEnabled
      ? sql`(
          SELECT COUNT(DISTINCT LOWER(COALESCE(NULLIF(TRIM(ii4.category), ''), ii4.name)))::int
          FROM newchums.event_interests ei4
          JOIN newchums.interests ii4 ON ii4.id = ei4.interest_id AND ii4.is_deleted = false
          WHERE ei4.event_id = e.id
            AND LOWER(COALESCE(NULLIF(TRIM(ii4.category), ''), ii4.name)) = ANY(${userEffectiveCategories})
        ) AS hobby_match_count`
      : sql`0 AS hobby_match_count`;

    const sortByNewest = sortParam === "newest";

    const orderClause = sortByNewest
      ? sql`
          e.created_at DESC,
          e.starts_at ASC
        `
      : hasLocation
        ? sql`
            hobby_match_count DESC,
            distance_km ASC NULLS LAST,
            e.starts_at ASC
          `
        : sql`
            hobby_match_count DESC,
            e.starts_at ASC
          `;

    const rows = (await sql`
      SELECT
        e.id, e.title, e.description, e.starts_at, e.timezone, e.location_type,
        e.location_name, e.location_address, e.location_visibility, e.location_area, e.online_link,
        e.location_lat, e.location_lng,
        e.max_seats, e.visibility, e.status, e.allow_alt_times,
        e.host_user_id, e.created_at, e.banner_key,
        COALESCE(e.is_qa, false) AS is_qa,
        ${hobbyMatchSelectExpr},
        COALESCE(
          (SELECT json_agg(json_build_object('name', ii.name, 'slug', ii.slug, 'category', ii.category))
           FROM newchums.event_interests ei2
           JOIN newchums.interests ii ON ii.id = ei2.interest_id
           WHERE ei2.event_id = e.id AND ii.is_deleted = false),
          '[]'::json
        ) AS hobbies,
        i.name AS interest_name, i.slug AS interest_slug,
        h.name AS host_name, h.username AS host_username,
        h.date_of_birth AS host_date_of_birth,
        r.status AS my_rsvp_status,
        COALESCE(rsvp_counts.going_count, 0) AS going_count,
        COALESCE(rsvp_counts.maybe_count, 0) AS maybe_count,
        CASE WHEN e.host_user_id = ${userId} THEN true ELSE false END AS is_host,
        CASE
          WHEN ${hasLocation} AND e.location_lat IS NOT NULL AND e.location_lng IS NOT NULL THEN
            6371 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians(${lat ?? 0})) * cos(radians(e.location_lat)) *
                cos(radians(e.location_lng) - radians(${lng ?? 0})) +
                sin(radians(${lat ?? 0})) * sin(radians(e.location_lat))
              ))
            )
          ELSE NULL
        END AS distance_km,
        cm_community.id AS community_id,
        cm_community.slug AS community_slug,
        cm_community.name AS community_name
      FROM newchums.events e
      LEFT JOIN newchums.interests i ON i.id = e.interest_id
      LEFT JOIN newchums.users h ON h.id = e.host_user_id
      LEFT JOIN newchums.event_rsvps r ON r.event_id = e.id AND r.user_id = ${userId}
      LEFT JOIN newchums.chum_preferences hp ON hp.user_id = e.host_user_id
      LEFT JOIN newchums.communities cm_community ON cm_community.id = e.community_id AND COALESCE(cm_community.status, 'active') = 'active'
      LEFT JOIN (
        SELECT event_id,
          COUNT(*) FILTER (WHERE status = 'going')::int AS going_count,
          COUNT(*) FILTER (WHERE status = 'maybe')::int AS maybe_count
        FROM newchums.event_rsvps
        GROUP BY event_id
      ) rsvp_counts ON rsvp_counts.event_id = e.id
      WHERE e.status = 'published'
        AND e.starts_at >= ${now.toISOString()}
        AND (COALESCE(e.is_qa, false) = false OR ${viewerIsSuperAdmin})
        AND (
          COALESCE(e.hide_from_explore, false) = false
          OR (e.community_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM newchums.community_members cm_viewer
            WHERE cm_viewer.community_id = e.community_id AND cm_viewer.user_id = ${userId} AND cm_viewer.status = 'active'
          ))
          OR EXISTS (SELECT 1 FROM newchums.event_rsvps er_hid WHERE er_hid.event_id = e.id AND er_hid.user_id = ${userId})
        )
        AND (e.visibility != 'invite_only'
          OR EXISTS (SELECT 1 FROM newchums.event_rsvps er_inv WHERE er_inv.event_id = e.id AND er_inv.user_id = ${userId})
        )
        AND (
          e.visibility = 'public'
          OR (e.visibility = 'chums_only' AND (
            e.host_user_id = ${userId}
            OR EXISTS (
              SELECT 1 FROM newchums.user_contacts uc_vis
              WHERE uc_vis.user_id = e.host_user_id
                AND uc_vis.linked_user_id = ${userId}
                AND uc_vis.type = 'on_newchums'
            )
            OR EXISTS (
              SELECT 1 FROM newchums.event_rsvps er_vis
              WHERE er_vis.event_id = e.id AND er_vis.user_id = ${userId}
            )
          ))
          OR (e.visibility = 'invite_only' AND EXISTS (
            SELECT 1 FROM newchums.event_rsvps er_inv2
            WHERE er_inv2.event_id = e.id AND er_inv2.user_id = ${userId}
          ))
        )
        AND (
          e.host_user_id = ${userId}
          OR EXISTS (SELECT 1 FROM newchums.event_rsvps er_pref WHERE er_pref.event_id = e.id AND er_pref.user_id = ${userId})
          OR (e.pref_overrides IS NOT NULL AND (e.pref_overrides->>'disabled')::boolean = true)
          OR (
            (COALESCE(hp.reliability_level, 'preferred') = 'open'
              OR (e.pref_overrides IS NOT NULL AND e.pref_overrides->'disabled_metrics' ? 'reliability')
              OR ${viewerReliability} >= CASE COALESCE(hp.reliability_level, 'preferred') WHEN 'preferred' THEN 35.0 WHEN 'important' THEN 45.0 WHEN 'required' THEN 55.0 ELSE 0.0 END)
            AND (COALESCE(hp.sociability_level, 'open') = 'open'
              OR (e.pref_overrides IS NOT NULL AND e.pref_overrides->'disabled_metrics' ? 'sociability')
              OR ${viewerSociability} >= CASE COALESCE(hp.sociability_level, 'open') WHEN 'preferred' THEN 35.0 WHEN 'important' THEN 45.0 WHEN 'required' THEN 55.0 ELSE 0.0 END)
            AND (COALESCE(hp.presentation_level, 'open') = 'open'
              OR (e.pref_overrides IS NOT NULL AND e.pref_overrides->'disabled_metrics' ? 'presentation')
              OR ${viewerPresentation} >= CASE COALESCE(hp.presentation_level, 'open') WHEN 'preferred' THEN 35.0 WHEN 'important' THEN 45.0 WHEN 'required' THEN 55.0 ELSE 0.0 END)
            AND (hp.age_pref_years IS NULL
              OR (e.pref_overrides IS NOT NULL AND e.pref_overrides->'disabled_metrics' ? 'age')
              OR h.date_of_birth IS NULL
              OR ${viewerAge === null}
              OR abs(EXTRACT(YEAR FROM age(h.date_of_birth))::int - ${viewerAge ?? 0}) <= hp.age_pref_years)
          )
        )
        ${hobbySlug ? sql`AND EXISTS (
          SELECT 1 FROM newchums.interests ii_pick
          WHERE ii_pick.slug = ${hobbySlug} AND ii_pick.is_deleted = false
            AND EXISTS (
              SELECT 1 FROM newchums.event_interests ei3
              JOIN newchums.interests ii3 ON ii3.id = ei3.interest_id AND ii3.is_deleted = false
              WHERE ei3.event_id = e.id
                AND LOWER(COALESCE(NULLIF(TRIM(ii3.category), ''), ii3.name))
                  = LOWER(COALESCE(NULLIF(TRIM(ii_pick.category), ''), ii_pick.name))
            )
        )` : sql``}
        ${search ? sql`AND (e.title ILIKE ${"%" + search + "%"} OR e.description ILIKE ${"%" + search + "%"})` : sql``}
        ${dateEnd ? sql`AND e.starts_at <= ${dateEnd.toISOString()}` : sql``}
        ${hasLocation && radiusKm < 20000 ? sql`AND (e.location_lat IS NULL OR e.location_lng IS NULL OR 6371 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(${lat ?? 0})) * cos(radians(e.location_lat)) * cos(radians(e.location_lng) - radians(${lng ?? 0})) + sin(radians(${lat ?? 0})) * sin(radians(e.location_lat))))) <= ${radiusKm})` : sql``}
      ORDER BY ${orderClause}
      LIMIT ${pageLimit + 1} OFFSET ${pageOffset}
    `) as Array<{
      id: string; title: string; description: string | null; starts_at: string;
      location_type: string; location_name: string | null; location_address: string | null;
      location_visibility: string | null; location_area: string | null; online_link: string | null;
      location_lat: number | null; location_lng: number | null;
      max_seats: number | null; visibility: string; status: string; allow_alt_times: boolean;
      host_user_id: string; created_at: string; banner_key: string | null;
      hobbies: Array<{ name: string; slug: string }> | string;
      interest_name: string | null; interest_slug: string | null;
      host_name: string | null; host_username: string | null;
      host_date_of_birth: string | Date | null;
      my_rsvp_status: string | null;
      going_count: number; maybe_count: number; is_host: boolean;
      distance_km: number | null; is_qa: boolean;
      community_id: string | null; community_slug: string | null; community_name: string | null;
    }>;

    // Batch-load host metrics for viewer→host compatibility notes
    const hostIds = [...new Set(rows.filter((r) => !r.is_host).map((r) => r.host_user_id))];
    const hostMetricsMap = await batchLoadMetrics(sql, hostIds);

    // Host DOBs come back inline on each row (no extra query needed). Normalize to YYYY-MM-DD.
    const hostDobById = new Map<string, string | null>();
    for (const r of rows) {
      if (hostDobById.has(r.host_user_id)) continue;
      const raw = r.host_date_of_birth;
      const dob = raw
        ? typeof raw === "string"
          ? raw
          : (raw as Date).toISOString().slice(0, 10)
        : null;
      hostDobById.set(r.host_user_id, dob);
    }

    // Batch-load attendee user IDs + metrics for viewer→attendee pref mismatch indicator
    const eventIds = rows.filter((r) => !r.is_host).map((r) => r.id);
    const attendeeRsvpRows = eventIds.length > 0 ? (await sql`
      SELECT er.event_id, er.user_id FROM newchums.event_rsvps er
      WHERE er.event_id = ANY(${eventIds}::uuid[]) AND er.status IN ('going', 'maybe')
    `) as { event_id: string; user_id: string }[] : [];
    const attendeeIdsByEvent = new Map<string, string[]>();
    const allAttendeeIds = new Set<string>();
    for (const ar of attendeeRsvpRows) {
      if (ar.user_id === userId) continue; // skip viewer
      if (!attendeeIdsByEvent.has(ar.event_id)) attendeeIdsByEvent.set(ar.event_id, []);
      attendeeIdsByEvent.get(ar.event_id)!.push(ar.user_id);
      allAttendeeIds.add(ar.user_id);
    }
    // Remove IDs already in hostMetricsMap to avoid re-fetching
    const extraAttendeeIds = [...allAttendeeIds].filter((id) => !hostMetricsMap.has(id));
    const attendeeMetricsMap = await batchLoadMetrics(sql, extraAttendeeIds);
    // Merge into a single lookup
    const allMetrics = new Map([...hostMetricsMap, ...attendeeMetricsMap]);

    // Batch-load attendee DOBs (host DOBs already inline). Only needed when the
    // viewer has an age preference set; otherwise the age check is a no-op.
    const attendeeDobMap = viewerPrefs?.age_pref_years != null
      ? await batchLoadDobs(sql, [...allAttendeeIds].filter((id) => !hostDobById.has(id)))
      : new Map<string, string | null>();
    const dobByUserId = new Map<string, string | null>([...hostDobById, ...attendeeDobMap]);

    const allMapped = rows.map((r) => {
      const parsedHobbies = typeof r.hobbies === "string" ? JSON.parse(r.hobbies) : (r.hobbies ?? []);
      const hobbyList = Array.isArray(parsedHobbies) && parsedHobbies.length > 0
        ? parsedHobbies as Array<{ name: string; slug: string }>
        : r.interest_name ? [{ name: r.interest_name, slug: r.interest_slug ?? "" }] : [];
      const locVis = r.location_visibility ?? "exact_everyone";
      const hasRsvp = r.my_rsvp_status != null;
      const canShowExact =
        r.location_type !== "in_person" ||
        locVis === "exact_everyone" ||
        r.is_host ||
        (locVis === "exact_joined_only" && hasRsvp);
      const locationDisplay =
        r.location_type === "online"
          ? (r.online_link || "Online")
          : canShowExact
            ? buildLocationDisplay(r.location_name, r.location_address)
            : (r.location_area || "General area");

      // Viewer→host compatibility: does the host meet the viewer's chum preferences?
      let prefNote: string[] | null = null;
      let hasPrefMismatch = false;
      if (!r.is_host && viewerPrefs) {
        const hMetrics = allMetrics.get(r.host_user_id) ?? {};
        const compat = evaluateChumPreferences(viewerPrefs, hMetrics, true, {
          checkerDob: viewerDob,
          targetDob: dobByUserId.get(r.host_user_id) ?? null,
        });
        if (!compat.passes) { prefNote = compat.failedMetrics; hasPrefMismatch = true; }

        // Also check attendees for the card-level mismatch indicator
        if (!hasPrefMismatch) {
          const attendees = attendeeIdsByEvent.get(r.id) ?? [];
          for (const uid of attendees) {
            const m = allMetrics.get(uid) ?? {};
            const isHostUser = uid === r.host_user_id;
            const ac = evaluateChumPreferences(viewerPrefs, m, isHostUser, {
              checkerDob: viewerDob,
              targetDob: dobByUserId.get(uid) ?? null,
            });
            if (!ac.passes) { hasPrefMismatch = true; break; }
          }
        }
      }

      return {
        id: r.id,
        title: r.title,
        description: r.description,
        startsAt: r.starts_at,
        timezone: r.timezone,
        locationType: r.location_type,
        locationDisplay,
        locationName: canShowExact ? r.location_name : null,
        locationAddress: canShowExact ? r.location_address : null,
        onlineLink: r.online_link,
        maxSeats: r.max_seats,
        visibility: r.visibility,
        status: r.status,
        hobby: hobbyList[0]?.name ?? null,
        hobbySlug: hobbyList[0]?.slug ?? null,
        hobbies: hobbyList,
        hostName: (() => { const u = r.host_username?.replace(/^@/, ""); return u ? `@${u}` : (r.host_name?.trim() || "Someone"); })(),
        isHost: r.is_host,
        myRsvpStatus: r.my_rsvp_status,
        goingCount: r.going_count,
        maybeCount: r.maybe_count,
        distanceKm: r.distance_km !== null ? Math.round(r.distance_km * 10) / 10 : null,
        bannerKey: r.banner_key ?? null,
        prefNote,
        hasPrefMismatch,
        community: r.community_id ? { id: r.community_id, slug: r.community_slug!, name: r.community_name! } : null,
        isQa: r.is_qa || undefined,
      };
    });

    const hasMore = allMapped.length > pageLimit;
    const events = allMapped.slice(0, pageLimit);
    return c.json({ ok: true, events, hasMore });
  } catch (err) {
    console.error("[GET /events/explore]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /events/:id, event details */
app.get("/events/:id", async (c) => {
  const eventId = c.req.param("id");
  const sql = getSql(c.env);

  let userId: string | null = null;
  const authPayload = await requireAuth(c);
  if (authPayload?.email) {
    userId = await ensureAppUserId(sql, authPayload.email, (authPayload as { name?: string | null }).name);
  }

  // Fetch share-link modal dismissed flag for authenticated users
  let shareLinkModalDismissed = false;
  if (userId) {
    const flagRows = (await sql`SELECT share_link_modal_dismissed FROM newchums.users WHERE id = ${userId} LIMIT 1`) as { share_link_modal_dismissed: boolean }[];
    shareLinkModalDismissed = flagRows[0]?.share_link_modal_dismissed ?? false;
  }

  // Token-based access for email invite recipients, public RSVP participants, or share-link visitors
  const inviteTokenParam = c.req.query("invite_token") ?? c.req.query("participation_token") ?? null;
  const shareTokenParam = c.req.query("share_token") ?? null;
  let tokenGuestEmail: string | null = null;
  let tokenGrantsAccess = false;
  let tokenPurpose: string | null = null;
  if (inviteTokenParam) {
    const decoded = await verifyParticipationOrInviteToken(inviteTokenParam, c.env.NEXTAUTH_SECRET);
    if (decoded && decoded.eventId === eventId) {
      tokenGrantsAccess = true;
      tokenPurpose = decoded.purpose ?? null;
      if (!userId) {
        if (decoded.email) {
          tokenGuestEmail = decoded.email.toLowerCase();
        } else if (decoded.userId) {
          // Invite token for a registered user opened while not logged in,
          // resolve their email so the guest-invite path can identify them.
          const tokenUserRows = (await sql`SELECT email FROM newchums.users WHERE id = ${decoded.userId} LIMIT 1`) as { email: string }[];
          if (tokenUserRows[0]) tokenGuestEmail = tokenUserRows[0].email.toLowerCase();
        }
      }
    }
  } else if (shareTokenParam) {
    // Try short HMAC token first, then fall back to legacy JWT
    if (await verifyShareToken(shareTokenParam, eventId, c.env.NEXTAUTH_SECRET)) {
      tokenGrantsAccess = true;
    } else {
      const decoded = await verifyParticipationOrInviteToken(shareTokenParam, c.env.NEXTAUTH_SECRET);
      if (decoded && decoded.eventId === eventId) {
        tokenGrantsAccess = true;
        if (!userId && decoded.email) tokenGuestEmail = decoded.email.toLowerCase();
      }
    }
  }

  // Adopt orphaned guest records: when a logged-in user views an event,
  // migrate any guest RSVP / invite / alt-time rows that match their email.
  if (userId && authPayload?.email) {
    const userEmail = (authPayload.email as string).toLowerCase();
    try {
      // Claim guest RSVP (only if no user-based RSVP already exists)
      await sql`
        UPDATE newchums.event_rsvps
        SET user_id = ${userId}, guest_email = NULL, guest_name = NULL
        WHERE event_id = ${eventId} AND guest_email = ${userEmail} AND user_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM newchums.event_rsvps r2 WHERE r2.event_id = ${eventId} AND r2.user_id = ${userId})
      `;
      // Claim email-only invite
      await sql`
        UPDATE newchums.event_invites
        SET user_id = ${userId}
        WHERE event_id = ${eventId} AND LOWER(email) = ${userEmail} AND user_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM newchums.event_invites i2 WHERE i2.event_id = ${eventId} AND i2.user_id = ${userId})
      `;
      // Claim guest alt-time suggestions
      await sql`
        UPDATE newchums.event_alt_times
        SET user_id = ${userId}, guest_email = NULL
        WHERE event_id = ${eventId} AND guest_email = ${userEmail} AND user_id IS NULL
      `;
      // Claim guest confirmation records
      await sql`
        UPDATE newchums.event_confirmations
        SET user_id = ${userId}, guest_email = NULL
        WHERE event_id = ${eventId} AND guest_email = ${userEmail} AND user_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM newchums.event_confirmations ec2 WHERE ec2.event_id = ${eventId} AND ec2.user_id = ${userId})
      `;
    } catch (adoptErr) {
      console.error("[GET /events/:id] guest record adoption error (non-fatal):", adoptErr);
    }
  }

  try {
    const rows = (await sql`
      SELECT
        e.*, i.name AS interest_name, i.slug AS interest_slug,
        h.name AS host_name, h.username AS host_username
      FROM newchums.events e
      LEFT JOIN newchums.interests i ON i.id = e.interest_id
      LEFT JOIN newchums.users h ON h.id = e.host_user_id
      WHERE e.id = ${eventId}
    `) as Array<Record<string, unknown>>;

    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const event = rows[0];

    // QA plan isolation: only super admins or valid token holders can access QA plans.
    // Tokenized access (share_token, invite_token, participation_token) is allowed so
    // that intentionally shared QA plans can be tested through the full guest flow.
    if (event.is_qa && !tokenGrantsAccess) {
      if (!userId) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
      const viewerIsSuperAdmin = await checkIsSuperAdmin(sql, userId);
      if (!viewerIsSuperAdmin) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    }

    const isHost = userId && event.host_user_id === userId;
    const rsvpRows = userId ? (await sql`SELECT 1 FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId}`) as unknown[] : [];
    const hasRsvp = rsvpRows.length > 0;
    const locVis = (event.location_visibility as string) ?? "exact_everyone";
    const locArea = (event.location_area as string | null) ||
      deriveApproxArea(event.location_address as string | null);
    const canShowExactLocation =
      event.location_type !== "in_person" ||
      locVis === "exact_everyone" ||
      isHost === true ||
      (locVis === "exact_joined_only" && hasRsvp === true);
    const approxAreaText = locArea || "General area";
    const locationDisplayText =
      event.location_type === "online"
        ? (event.online_link as string) || "Online"
        : canShowExactLocation
          ? buildLocationDisplay(event.location_name as string | null, event.location_address as string | null)
          : approxAreaText;

    if (event.status === "draft" && !isHost) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    // Visibility controls discoverability (explore feed, digests), not direct URL access.
    // Anyone with the plan URL can view it. Draft plans remain host-only (above).

    // Hobbies, needed by both public and non-public response paths
    const eventHobbies = (await sql`
      SELECT ii.name, ii.slug, ii.category
      FROM newchums.event_interests ei2
      JOIN newchums.interests ii ON ii.id = ei2.interest_id
      WHERE ei2.event_id = ${eventId} AND ii.is_deleted = false
      ORDER BY ei2.created_at ASC
    `) as Array<{ name: string; slug: string; category: string | null }>;

    const hobbyList = eventHobbies.length > 0
      ? eventHobbies
      : (event as Record<string, unknown>).interest_name
        ? [{ name: (event as Record<string, unknown>).interest_name as string, slug: ((event as Record<string, unknown>).interest_slug as string) ?? "", category: null }]
        : [];

    // Community info (if plan belongs to a community)
    let communityInfo: { id: string; slug: string; name: string } | null = null;
    if (event.community_id) {
      const cmRows = (await sql`SELECT id, slug, name FROM newchums.communities WHERE id = ${event.community_id} LIMIT 1`) as { id: string; slug: string; name: string }[];
      if (cmRows[0]) communityInfo = cmRows[0];
    }

    // --- Plan Access State ---
    // Determines the viewer's access level for data scoping and frontend rendering.
    const accessState: "public" | "invite" | "authenticated" | "attending" =
      userId && (isHost || hasRsvp) ? "attending"
        : userId ? "authenticated"
          : tokenGrantsAccess ? "invite"
            : "public";

    // Public access: return a limited payload, basic plan info, attendee counts,
    // approximate location only. No individual RSVPs, invites, alt-times, or join requests.
    if (accessState === "public") {
      const goingCount = ((await sql`SELECT COUNT(*) AS c FROM newchums.event_rsvps WHERE event_id = ${eventId} AND status = 'going'`) as Array<{ c: string }>)[0]?.c ?? "0";
      const maybeCount = ((await sql`SELECT COUNT(*) AS c FROM newchums.event_rsvps WHERE event_id = ${eventId} AND status = 'maybe'`) as Array<{ c: string }>)[0]?.c ?? "0";

      const pubLocArea = locArea || "General area";
      const pubLocationDisplay =
        event.location_type === "online" ? "Online"
          : pubLocArea;

      return c.json({
        ok: true,
        accessState: "public" as const,
        viewerUserId: null,
        viewerEmail: null,
        shareLinkModalDismissed: false,
        event: {
          id: event.id,
          title: event.title,
          description: event.description,
          startsAt: event.starts_at,
          locationType: event.location_type,
          locationDisplay: pubLocationDisplay,
          locationVisibility: locVis,
          locationExact: false,
          // Only expose a real approximate area; the literal "General area"
          // fallback is just label text, not something we want to map or to
          // advertise as "approximate area shown".
          locationArea: event.location_type === "online" ? null : (locArea || null),
          locationName: null,
          locationAddress: null,
          locationLat: null,
          locationLng: null,
          onlineLink: null,
          maxSeats: event.max_seats,
          visibility: event.visibility,
          status: event.status,
          allowAltTimes: event.allow_alt_times,
          altTimesMode: event.alt_times_mode ?? "suggest",
          availabilityDeadlineAt: (event.alt_times_mode === "availability" ? event.availability_deadline_at : null) ?? null,
          allowAttendeeInvites: false,
          requireReconfirmation: false,
          canceledAt: event.canceled_at,
          cancellationReason: (event as Record<string, unknown>).cancellation_reason ?? null,
          bannerKey: event.banner_key ?? null,
          hobby: hobbyList[0]?.name ?? null,
          hobbySlug: hobbyList[0]?.slug ?? null,
          hobbies: hobbyList,
          hostName: (() => { const u = ((event as Record<string, unknown>).host_username as string)?.replace(/^@/, ""); return u ? `@${u}` : (((event as Record<string, unknown>).host_name as string)?.trim() || "Someone"); })(),
          hostUserId: event.host_user_id,
          isHost: false,
          lockedAt: event.locked_at ?? null,
          requireApproval: event.require_approval === true,
          reserveSeats: false,
          isInvited: false,
          hasRsvp: false,
          goingCount: Number(goingCount),
          maybeCount: Number(maybeCount),
          minConfirmedAttendees: null,
          fallbackPolicy: null,
          confirmationWindowOpen: false,
          confirmationCutoffAt: null,
          confirmedCount: 0,
          pendingConfirmationCount: 0,
          myConfirmationStatus: null,
          planViability: null,
          community: communityInfo,
          hideFromExplore: false,
        },
        rsvps: [],
        altTimes: [],
        invites: [],
        joinRequests: [],
      });
    }

    const rsvps = (await sql`
      SELECT er.status, er.note, er.user_id, er.guest_email, er.guest_name, er.hide_name,
             u.name, u.username, u.avatar_key, u.avatar_updated_at
      FROM newchums.event_rsvps er
      LEFT JOIN newchums.users u ON u.id = er.user_id
      WHERE er.event_id = ${eventId}
      ORDER BY er.created_at ASC
    `) as Array<{ status: string; note: string | null; user_id: string | null; guest_email: string | null; guest_name: string | null; hide_name: boolean; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | Date | null }>;

    // Batch chum-status lookup: which RSVP'd users has the viewer already saved?
    const chumSavedSet = new Set<string>();
    if (userId) {
      const rsvpUserIds = rsvps.map((r) => r.user_id).filter((id): id is string => !!id && id !== userId);
      if (rsvpUserIds.length > 0) {
        const savedRows = (await sql`
          SELECT linked_user_id FROM newchums.user_contacts
          WHERE user_id = ${userId} AND type = 'on_newchums'
            AND linked_user_id = ANY(${rsvpUserIds})
        `) as { linked_user_id: string }[];
        for (const row of savedRows) chumSavedSet.add(row.linked_user_id);
      }
    }

    const altTimes = (await sql`
      SELECT eat.id, eat.suggested_at, eat.ends_at, eat.note, eat.user_id, eat.guest_email, u.name, u.username
      FROM newchums.event_alt_times eat
      LEFT JOIN newchums.users u ON u.id = eat.user_id
      WHERE eat.event_id = ${eventId}
      ORDER BY eat.created_at ASC
    `) as Array<{ id: string; suggested_at: string; ends_at: string | null; note: string | null; user_id: string | null; guest_email: string | null; name: string | null; username: string | null }>;

    const invites = (await sql`
      SELECT ei.user_id, ei.email, u.name, u.username
      FROM newchums.event_invites ei
      LEFT JOIN newchums.users u ON u.id = ei.user_id
      WHERE ei.event_id = ${eventId}
      ORDER BY ei.created_at ASC
    `) as Array<{ user_id: string | null; email: string | null; name: string | null; username: string | null }>;

    // Join requests, return all for host, or just the viewer's own request
    let joinRequests: Array<{
      id: string; user_id: string; status: string;
      message: string | null; host_message: string | null;
      decided_at: string | null; created_at: string;
      name: string | null; username: string | null;
      avatar_key: string | null; avatar_updated_at: string | Date | null;
    }> = [];
    if (isHost) {
      joinRequests = (await sql`
        SELECT jr.id, jr.user_id, jr.status, jr.message, jr.host_message,
               jr.decided_at, jr.created_at,
               u.name, u.username, u.avatar_key, u.avatar_updated_at
        FROM newchums.event_join_requests jr
        JOIN newchums.users u ON u.id = jr.user_id
        WHERE jr.event_id = ${eventId}
        ORDER BY jr.created_at ASC
      `) as typeof joinRequests;
    } else if (userId) {
      joinRequests = (await sql`
        SELECT jr.id, jr.user_id, jr.status, jr.message, jr.host_message,
               jr.decided_at, jr.created_at,
               u.name, u.username, u.avatar_key, u.avatar_updated_at
        FROM newchums.event_join_requests jr
        JOIN newchums.users u ON u.id = jr.user_id
        WHERE jr.event_id = ${eventId} AND jr.user_id = ${userId}
        ORDER BY jr.created_at DESC
        LIMIT 1
      `) as typeof joinRequests;
    }

    // Check if current viewer is invited (needed by frontend for request-to-join gating)
    const isInvited = userId
      ? ((await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId} LIMIT 1`) as unknown[]).length > 0
      : (tokenGuestEmail && tokenPurpose === "invite_rsvp")
        ? ((await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND LOWER(email) = ${tokenGuestEmail} LIMIT 1`) as unknown[]).length > 0
        : false;

    // Attendance assurance, confirmation state
    const requiresConfirmation = event.require_reconfirmation === true;
    let confirmations: Array<{ user_id: string | null; guest_email: string | null; status: string; responded_at: string | null }> = [];
    let confirmationWindowOpen = false;
    let confirmationCutoffAt: string | null = null;
    let confirmedCount = 0;
    let pendingConfirmationCount = 0;
    let myConfirmationStatus: string | null = null;
    let planViability: string | null = null;

    if (requiresConfirmation) {
      const windowHours = Number(event.confirmation_window_hours ?? 24);
      const cutoffHours = Number(event.confirmation_cutoff_hours ?? 2);
      const startsAtMs = new Date(event.starts_at).getTime();
      const windowOpensAt = startsAtMs - windowHours * 60 * 60 * 1000;
      const cutoffAt = startsAtMs - cutoffHours * 60 * 60 * 1000;
      confirmationCutoffAt = new Date(cutoffAt).toISOString();
      confirmationWindowOpen = Date.now() >= windowOpensAt && event.status === "published";

      confirmations = (await sql`
        SELECT user_id, guest_email, status, responded_at
        FROM newchums.event_confirmations
        WHERE event_id = ${eventId}
      `) as typeof confirmations;

      confirmedCount = confirmations.filter((c) => c.status === "confirmed").length;
      pendingConfirmationCount = confirmations.filter((c) => c.status === "pending").length;
      if (userId) {
        myConfirmationStatus = confirmations.find((c) => c.user_id === userId)?.status ?? null;
      } else if (tokenGuestEmail) {
        myConfirmationStatus = confirmations.find((c) => c.guest_email === tokenGuestEmail)?.status ?? null;
      }

      const minRequired = event.min_confirmed_attendees ? Number(event.min_confirmed_attendees) : null;
      if (minRequired != null && confirmationWindowOpen) {
        if (confirmedCount >= minRequired) {
          planViability = "viable";
        } else if (confirmedCount + pendingConfirmationCount >= minRequired) {
          planViability = "at_risk";
        } else {
          planViability = "below_minimum";
        }
      }
    }

    // Build confirmation lookup for enriching rsvps
    const confirmationByUserId = new Map(confirmations.filter((c) => c.user_id).map((c) => [c.user_id, c.status]));
    const confirmationByGuestEmail = new Map(confirmations.filter((c) => c.guest_email).map((c) => [c.guest_email, c.status]));

    // Generate a share token so the "Copy link" button produces URLs with access context.
    // Only generated for non-public access states; public visitors don't get share tokens.
    const shareToken = await createShareToken(eventId, c.env.NEXTAUTH_SECRET!);

    // Chum preference compatibility notes for the viewer.
    // Checks host and each attendee against the viewer's preferences (informational, not blocking).
    let prefNote: string[] | null = null;
    const attendeePrefNotes = new Map<string, string[]>();
    if (userId && !isHost) {
      const attendeeUserIds = rsvps
        .filter((r) => r.user_id && r.user_id !== userId)
        .map((r) => r.user_id as string);
      const allUserIds = [event.host_user_id as string, ...attendeeUserIds.filter((id) => id !== event.host_user_id)];
      // Include the viewer in the DOB lookup so the age check has both sides.
      const allDobUserIds = Array.from(new Set([userId, ...allUserIds]));
      const [vPrefs, metricsMap, dobMap] = await Promise.all([
        loadChumPrefsForUser(sql, userId),
        batchLoadMetrics(sql, allUserIds),
        batchLoadDobs(sql, allDobUserIds),
      ]);
      if (vPrefs) {
        const viewerDob = dobMap.get(userId) ?? null;
        const hostDob = dobMap.get(event.host_user_id as string) ?? null;
        const hMetrics = metricsMap.get(event.host_user_id as string) ?? {};
        const hostCompat = evaluateChumPreferences(vPrefs, hMetrics, true, {
          checkerDob: viewerDob,
          targetDob: hostDob,
        });
        if (!hostCompat.passes) prefNote = hostCompat.failedMetrics;
        for (const uid of attendeeUserIds) {
          const m = metricsMap.get(uid) ?? {};
          const isHostUser = uid === event.host_user_id;
          const compat = evaluateChumPreferences(vPrefs, m, isHostUser, {
            checkerDob: viewerDob,
            targetDob: dobMap.get(uid) ?? null,
          });
          if (!compat.passes) attendeePrefNotes.set(uid, compat.failedMetrics);
        }
      }
    }

    return c.json({
      ok: true,
      accessState,
      shareToken,
      prefNote,
      viewerUserId: userId ?? null,
      viewerEmail: authPayload?.email ? (authPayload.email as string).toLowerCase() : null,
      shareLinkModalDismissed,
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        startsAt: event.starts_at,
        locationType: event.location_type,
        locationDisplay: locationDisplayText,
        locationVisibility: locVis,
        locationExact: canShowExactLocation,
        locationArea: !canShowExactLocation ? approxAreaText : null,
        locationName: canShowExactLocation ? event.location_name : null,
        locationAddress: canShowExactLocation ? event.location_address : null,
        locationLat: canShowExactLocation ? (event.location_lat ?? null) : null,
        locationLng: canShowExactLocation ? (event.location_lng ?? null) : null,
        onlineLink: event.online_link,
        maxSeats: event.max_seats,
        visibility: event.visibility,
        status: event.status,
        allowAltTimes: event.allow_alt_times,
        altTimesMode: event.alt_times_mode ?? "suggest",
        availabilityDeadlineAt: (event.alt_times_mode === "availability" ? event.availability_deadline_at : null) ?? null,
        allowAttendeeInvites: event.allow_attendee_invites !== false,
        requireReconfirmation: event.require_reconfirmation === true,
        canceledAt: event.canceled_at,
        cancellationReason: (event as Record<string, unknown>).cancellation_reason ?? null,
        createdAt: event.created_at,
        bannerKey: event.banner_key ?? null,
        hobby: hobbyList[0]?.name ?? null,
        hobbySlug: hobbyList[0]?.slug ?? null,
        hobbies: hobbyList,
        hostName: (() => { const u = ((event as Record<string, unknown>).host_username as string)?.replace(/^@/, ""); if (u) return `@${u}`; if (accessState === "attending") return ((event as Record<string, unknown>).host_name as string)?.trim() || "Someone"; return "Someone"; })(),
        hostUserId: event.host_user_id,
        isHost: isHost === true,
        lockedAt: event.locked_at ?? null,
        requireApproval: event.require_approval === true,
        reserveSeats: event.reserve_seats === true,
        isInvited,
        hasRsvp,
        guestInvite: tokenGuestEmail ? true : undefined,
        guestEmail: tokenGuestEmail || undefined,
        guestRsvpStatus: tokenGuestEmail
          ? (rsvps.find((r) => !r.user_id && r.guest_email === tokenGuestEmail)?.status ?? null)
          : undefined,
        // Attendance assurance
        minConfirmedAttendees: event.min_confirmed_attendees ? Number(event.min_confirmed_attendees) : null,
        fallbackPolicy: requiresConfirmation ? (event.fallback_policy ?? "notify_host") : null,
        confirmationWindowOpen,
        confirmationCutoffAt,
        confirmedCount,
        pendingConfirmationCount,
        myConfirmationStatus,
        guestConfirmToken: (tokenGuestEmail && confirmationWindowOpen && myConfirmationStatus)
          ? await createGuestConfirmationToken(c.env.NEXTAUTH_SECRET, eventId, tokenGuestEmail)
          : undefined,
        planViability,
        prefOverrides: isHost ? (event.pref_overrides ?? null) : undefined,
        community: communityInfo,
        hideFromExplore: isHost ? (event.hide_from_explore === true) : undefined,
        isQa: event.is_qa === true ? true : undefined,
      },
      // Non-attending viewers (authenticated, invite) see handles instead of real names
      // to protect user privacy. Attending viewers (host, RSVP'd) see real names.
      rsvps: rsvps.map((r) => {
        const rHandle = r.username?.replace(/^@/, "") ?? null;
        const rPrefNotes = r.user_id ? (attendeePrefNotes.get(r.user_id) ?? null) : null;
        const nameHidden = r.hide_name === true;
        const displayName = nameHidden
          ? (rHandle || "Someone")
          : accessState === "attending"
            ? (r.name?.trim() || rHandle || r.guest_name || r.guest_email || "Someone")
            : (rHandle || r.guest_name || r.guest_email || "Someone");
        return {
          userId: r.user_id ?? r.guest_email ?? "guest",
          name: displayName,
          handle: rHandle ? `@${rHandle}` : null,
          status: r.status,
          note: r.note,
          avatarUrl: r.user_id ? buildAvatarUrl(r.user_id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET) : null,
          isGuest: !r.user_id,
          guestEmail: r.guest_email ?? null,
          confirmationStatus: r.user_id
            ? (confirmationByUserId.get(r.user_id) ?? null)
            : (r.guest_email ? (confirmationByGuestEmail.get(r.guest_email) ?? null) : null),
          ...(rPrefNotes ? { prefNotes: rPrefNotes } : {}),
          ...(userId && r.user_id && r.user_id !== userId ? { isChumSaved: chumSavedSet.has(r.user_id) } : {}),
          // Only tell the viewer about their own hide_name state
          ...(userId && r.user_id === userId ? { hideName: nameHidden } : {}),
        };
      }),
      altTimes: altTimes.map((a) => {
        const aHandle = a.username?.replace(/^@/, "") ?? null;
        const guestLabel = a.guest_email ? a.guest_email.split("@")[0] : null;
        const displayName = accessState === "attending"
          ? (a.name?.trim() || aHandle || guestLabel || "Someone")
          : (aHandle || guestLabel || "Someone");
        return {
          id: a.id,
          userId: a.user_id,
          name: displayName,
          handle: aHandle ? `@${aHandle}` : null,
          suggestedAt: a.suggested_at,
          endsAt: a.ends_at,
          note: a.note,
          guestEmail: a.guest_email ?? null,
        };
      }),
      invites: invites.map((inv) => {
        const invHandle = inv.username?.replace(/^@/, "") ?? null;
        const displayName = accessState === "attending"
          ? (inv.name?.trim() || invHandle || inv.email || "Invited")
          : (invHandle || inv.email || "Invited");
        return {
          userId: inv.user_id,
          email: inv.email,
          name: displayName,
          handle: invHandle ? `@${invHandle}` : null,
        };
      }),
      joinRequests: joinRequests.map((jr) => {
        const jrHandle = jr.username?.replace(/^@/, "") ?? null;
        return {
          id: jr.id,
          userId: jr.user_id,
          status: jr.status,
          message: jr.message,
          hostMessage: jr.host_message,
          decidedAt: jr.decided_at,
          createdAt: jr.created_at,
          name: jr.name?.trim() || jrHandle || "Someone",
          handle: jrHandle ? `@${jrHandle}` : null,
          avatarUrl: buildAvatarUrl(jr.user_id, jr.avatar_key, jr.avatar_updated_at, c.env.MEDIA_BUCKET),
        };
      }),
    });
  } catch (err) {
    console.error("[GET /events/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/rsvp, RSVP to an event */
app.post("/events/:id/rsvp", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const status = String(body.status ?? "going");
  if (!VALID_RSVP_STATUS.includes(status as typeof VALID_RSVP_STATUS[number]))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid RSVP status", field: "status" }, 400);

  const note = body.note ? String(body.note).trim().slice(0, 500) : null;

  try {
    const ev = (await sql`SELECT id, host_user_id, visibility, status, max_seats, title, locked_at, require_approval, reserve_seats, require_reconfirmation, confirmation_sent_at, starts_at, timezone, location_type, location_name, location_address, online_link, is_qa FROM newchums.events WHERE id = ${eventId} AND status = 'published'`) as { id: string; host_user_id: string; visibility: string; status: string; max_seats: number | null; title: string; locked_at: string | null; require_approval: boolean; reserve_seats: boolean; require_reconfirmation: boolean; confirmation_sent_at: string | null; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; online_link: string | null; is_qa: boolean }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const event = ev[0];

    // QA plan isolation
    if (event.is_qa) {
      const isSuperAdmin = await checkIsSuperAdmin(sql, userId);
      if (!isSuperAdmin) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    }

    if (event.host_user_id === userId) return c.json({ ok: false, error: "VALIDATION", message: "Hosts cannot RSVP to their own event" }, 400);

    const existingRsvp = (await sql`SELECT id FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId}`) as { id: string }[];

    if (event.locked_at) {
      if (existingRsvp.length === 0)
        return c.json({ ok: false, error: "EVENT_LOCKED", message: "This plan is locked and not accepting new participants" }, 403);
    }

    // Invite-only gate: non-invited users cannot RSVP to invite-only plans
    // A valid share_token in the request body bypasses this gate (user accessed via share link)
    if (event.visibility === "invite_only" && existingRsvp.length === 0) {
      const invited = (await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId} LIMIT 1`) as unknown[];
      if (invited.length === 0) {
        const shareToken = typeof body.share_token === "string" ? body.share_token : null;
        const hasValidShareToken = shareToken ? await verifyShareToken(shareToken, eventId, c.env.NEXTAUTH_SECRET) : false;
        if (!hasValidShareToken)
          return c.json({ ok: false, error: "INVITE_ONLY", message: "This plan is invite only. Ask the host for a share link or invite." }, 403);
      }
    }

    // Require-approval gate: non-invited users without an existing RSVP must go through the request flow
    if (event.require_approval && existingRsvp.length === 0) {
      const invited = (await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId} LIMIT 1`) as unknown[];
      if (invited.length === 0)
        return c.json({ ok: false, error: "APPROVAL_REQUIRED", message: "This plan requires host approval before joining" }, 403);
    }

    if (status === "going" && event.max_seats) {
      const goingCount = (await sql`SELECT COUNT(*)::int AS c FROM newchums.event_rsvps WHERE event_id = ${eventId} AND status = 'going'`) as { c: number }[];
      let occupiedSeats = goingCount[0].c;
      // When reserve_seats is on, pending invites (no RSVP yet, not declined) hold a seat
      if (event.reserve_seats) {
        const reservedCount = (await sql`
          SELECT COUNT(*)::int AS c FROM newchums.event_invites ei
          WHERE ei.event_id = ${eventId}
            AND ei.user_id IS NOT NULL
            AND (
              NOT EXISTS (SELECT 1 FROM newchums.event_rsvps er WHERE er.event_id = ${eventId} AND er.user_id = ei.user_id)
              OR EXISTS (SELECT 1 FROM newchums.event_rsvps er2 WHERE er2.event_id = ${eventId} AND er2.user_id = ei.user_id AND er2.status = 'maybe')
            )
        `) as { c: number }[];
        occupiedSeats += reservedCount[0].c;
      }
      if (occupiedSeats >= event.max_seats)
        return c.json({ ok: false, error: "EVENT_FULL", message: "This gathering is full" }, 409);
    }

    const committedAt = status === "going" ? new Date().toISOString() : null;
    await sql`
      INSERT INTO newchums.event_rsvps (event_id, user_id, status, note, committed_at)
      VALUES (${eventId}, ${userId}, ${status}, ${note}, ${committedAt})
      ON CONFLICT (event_id, user_id) DO UPDATE SET status = ${status}, note = ${note}, updated_at = NOW(),
        committed_at = COALESCE(newchums.event_rsvps.committed_at, EXCLUDED.committed_at)
    `;

    // Sync confirmation state when RSVP changes during active confirmation window
    if (event.require_reconfirmation) {
      if (status === "cant_make_it") {
        await sql`
          UPDATE newchums.event_confirmations
          SET status = 'declined', responded_at = NOW(), updated_at = NOW()
          WHERE event_id = ${eventId} AND user_id = ${userId} AND status IN ('pending', 'confirmed')
        `;
      } else if (status === "going") {
        const hasConfirmation = (await sql`
          SELECT id FROM newchums.event_confirmations WHERE event_id = ${eventId} AND user_id = ${userId}
        `) as { id: string }[];
        if (hasConfirmation.length === 0 && event.confirmation_sent_at) {
          await sql`
            INSERT INTO newchums.event_confirmations (event_id, user_id, status)
            VALUES (${eventId}, ${userId}, 'pending')
            ON CONFLICT (event_id, user_id) DO NOTHING
          `;
        }
      }
    }

    const statusLabel = status === "going" ? "Going" : status === "maybe" ? "Maybe" : "Can't make it";
    await sql`
      INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
      VALUES (${event.host_user_id}, 'event_rsvp', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: event.title, rsvpStatus: statusLabel })})
    `;

    const hostUser = (await sql`SELECT email, name, username FROM newchums.users WHERE id = ${event.host_user_id}`) as { email: string; name: string | null; username: string | null }[];
    const attendeeUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
    if (hostUser.length > 0) {
      try {
        const hostProfileRows = (await sql`SELECT notification_prefs FROM user_profile WHERE user_id = ${event.host_user_id} LIMIT 1`) as { notification_prefs: unknown }[];
        const hostPrefs = normalizeNotificationPrefs(hostProfileRows[0]?.notification_prefs);
        const hostName = hostUser[0].name?.trim() || hostUser[0].username?.replace(/^@/, "") || "there";
        const attendeeName = attendeeUser[0]?.name?.trim() || attendeeUser[0]?.username?.replace(/^@/, "") || "Someone";
        const eventUrl = `${c.env.WEB_BASE_URL}/events/${eventId}`;
        const rsvpEventDate = formatEventDate(event.starts_at, event.timezone || "UTC");
        const rsvpEventLocation = event.location_type === "online" ? (event.online_link || "Online") : [event.location_name, event.location_address].filter(Boolean).join(", ") || "";
        const baseEmailArgs = { to: hostUser[0].email, hostName, attendeeName, eventTitle: event.title, eventUrl, attendeeMessage: note, eventDate: rsvpEventDate, eventLocation: rsvpEventLocation };

        if (status === "going" && hostPrefs.items.host_join?.enabled !== false) {
          const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, event.host_user_id, "host_join");
          await sendEventJoinEmail(c.env, { ...baseEmailArgs, unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}` });
        }
        if (status === "maybe" && hostPrefs.items.host_maybe?.enabled !== false) {
          const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, event.host_user_id, "host_maybe");
          await sendEventMaybeEmail(c.env, { ...baseEmailArgs, unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}` });
        }
        if (status === "cant_make_it" && hostPrefs.items.host_leave?.enabled !== false) {
          const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, event.host_user_id, "host_leave");
          await sendEventLeaveEmail(c.env, { ...baseEmailArgs, unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}` });
        }
      } catch { /* noop */ }
    }

    return c.json({ ok: true, status });
  } catch (err) {
    console.error("[POST /events/:id/rsvp]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/hide-name, toggle hide_name on the viewer's RSVP for this event */
app.post("/events/:id/hide-name", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);

  const sql = getSql(c.env);
  const eventId = c.req.param("id");
  const users = (await sql`SELECT id FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string }[];
  if (users.length === 0) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const userId = users[0].id;

  try {
    const rows = (await sql`
      UPDATE newchums.event_rsvps
      SET hide_name = NOT hide_name, updated_at = NOW()
      WHERE event_id = ${eventId} AND user_id = ${userId}
      RETURNING hide_name
    `) as { hide_name: boolean }[];

    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND", message: "No RSVP found for this event" }, 404);

    return c.json({ ok: true, hideName: rows[0].hide_name });
  } catch (err) {
    console.error("[POST /events/:id/hide-name]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/email-rsvp, RSVP via signed invite token or public participation token (no login required) */
app.post("/events/:id/email-rsvp", async (c) => {
  const eventId = c.req.param("id");
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const token = body.invite_token ? String(body.invite_token) : body.participation_token ? String(body.participation_token) : null;
  const guestName = body.guest_name ? String(body.guest_name).trim().slice(0, 100) : null;
  const status = body.status ? String(body.status) : null;
  if (!token) return c.json({ ok: false, error: "MISSING_TOKEN" }, 400);
  if (!status || !VALID_RSVP_STATUS.includes(status as typeof VALID_RSVP_STATUS[number]))
    return c.json({ ok: false, error: "INVALID_STATUS" }, 400);

  const decoded = await verifyParticipationOrInviteToken(token, c.env.NEXTAUTH_SECRET);
  if (!decoded || decoded.eventId !== eventId)
    return c.json({ ok: false, error: "INVALID_TOKEN", message: "This link has expired or is invalid." }, 403);

  const isPublicRsvp = decoded.purpose === "public_rsvp";
  const sql = getSql(c.env);

  try {
    const ev = (await sql`SELECT id, host_user_id, status, max_seats, title, locked_at, require_approval, reserve_seats, visibility, starts_at, timezone, location_type, location_name, location_address, online_link FROM newchums.events WHERE id = ${eventId} AND status = 'published'`) as { id: string; host_user_id: string; status: string; max_seats: number | null; title: string; locked_at: string | null; require_approval: boolean; reserve_seats: boolean; visibility: string; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; online_link: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const event = ev[0];

    let userId: string | null = decoded.userId ?? null;
    const guestEmail = decoded.email?.toLowerCase() ?? null;
    if (!userId && guestEmail) {
      const userRows = (await sql`SELECT id FROM newchums.users WHERE email = ${guestEmail} LIMIT 1`) as { id: string }[];
      userId = userRows[0]?.id ?? null;
    }

    const isGuest = !userId && !!guestEmail;

    if (!userId && !guestEmail)
      return c.json({ ok: false, error: "INVALID_TOKEN", message: "This invite link is invalid." }, 400);

    if (userId && event.host_user_id === userId)
      return c.json({ ok: false, error: "VALIDATION", message: "Hosts cannot RSVP to their own plan" }, 400);

    // For invite tokens, verify invitee is actually invited; public_rsvp tokens skip this check
    if (!isPublicRsvp) {
      const invited = userId
        ? (await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId} LIMIT 1`) as unknown[]
        : (await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND email = ${guestEmail} LIMIT 1`) as unknown[];
      if (invited.length === 0)
        return c.json({ ok: false, error: "NOT_INVITED", message: "This invite link is no longer valid." }, 403);
    }

    if (isGuest) {
      // Guest RSVP path, no user account
      const existingGuest = (await sql`SELECT id FROM newchums.event_rsvps WHERE event_id = ${eventId} AND guest_email = ${guestEmail} AND user_id IS NULL`) as { id: string }[];

      if (event.locked_at && existingGuest.length === 0)
        return c.json({ ok: false, error: "EVENT_LOCKED", message: "This plan is locked and not accepting new participants" }, 403);

      if (status === "going" && event.max_seats) {
        const goingCount = (await sql`SELECT COUNT(*)::int AS c FROM newchums.event_rsvps WHERE event_id = ${eventId} AND status = 'going'`) as { c: number }[];
        if (goingCount[0].c >= event.max_seats)
          return c.json({ ok: false, error: "EVENT_FULL", message: "This plan is full" }, 409);
      }

      const resolvedGuestName = guestName || decoded.name || guestEmail;
      if (existingGuest.length > 0) {
        await sql`UPDATE newchums.event_rsvps SET status = ${status}, guest_name = COALESCE(${guestName}, guest_name), updated_at = NOW() WHERE event_id = ${eventId} AND guest_email = ${guestEmail} AND user_id IS NULL`;
      } else {
        await sql`INSERT INTO newchums.event_rsvps (event_id, user_id, guest_email, guest_name, status) VALUES (${eventId}, ${null}, ${guestEmail}, ${resolvedGuestName}, ${status})`;
      }
    } else {
      // Registered user RSVP path
      const existingRsvp = (await sql`SELECT id FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId}`) as { id: string }[];

      if (event.locked_at && existingRsvp.length === 0)
        return c.json({ ok: false, error: "EVENT_LOCKED", message: "This plan is locked and not accepting new participants" }, 403);

      if (status === "going" && event.max_seats) {
        const goingCount = (await sql`SELECT COUNT(*)::int AS c FROM newchums.event_rsvps WHERE event_id = ${eventId} AND status = 'going'`) as { c: number }[];
        let occupiedSeats = goingCount[0].c;
        if (event.reserve_seats) {
          const reservedCount = (await sql`
            SELECT COUNT(*)::int AS c FROM newchums.event_invites ei
            WHERE ei.event_id = ${eventId}
              AND ei.user_id IS NOT NULL
              AND (
                NOT EXISTS (SELECT 1 FROM newchums.event_rsvps er WHERE er.event_id = ${eventId} AND er.user_id = ei.user_id)
                OR EXISTS (SELECT 1 FROM newchums.event_rsvps er2 WHERE er2.event_id = ${eventId} AND er2.user_id = ei.user_id AND er2.status = 'maybe')
              )
          `) as { c: number }[];
          occupiedSeats += reservedCount[0].c;
        }
        if (occupiedSeats >= event.max_seats)
          return c.json({ ok: false, error: "EVENT_FULL", message: "This plan is full" }, 409);
      }

      const inviteCommittedAt = status === "going" ? new Date().toISOString() : null;
      await sql`
        INSERT INTO newchums.event_rsvps (event_id, user_id, status, committed_at)
        VALUES (${eventId}, ${userId}, ${status}, ${inviteCommittedAt})
        ON CONFLICT (event_id, user_id) DO UPDATE SET status = ${status}, updated_at = NOW(),
          committed_at = COALESCE(newchums.event_rsvps.committed_at, EXCLUDED.committed_at)
      `;
    }

    // Notify the host
    const attendeeName = isGuest
      ? (guestEmail ?? "Someone")
      : await (async () => {
          const rows = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
          return rows[0]?.name?.trim() || rows[0]?.username?.replace(/^@/, "") || "Someone";
        })();

    const statusLabel = status === "going" ? "Going" : status === "maybe" ? "Maybe" : "Can't make it";
    if (userId) {
      await sql`
        INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
        VALUES (${event.host_user_id}, 'event_rsvp', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: event.title, rsvpStatus: statusLabel })})
      `;
    }

    try {
      const hostUser = (await sql`SELECT email, name, username FROM newchums.users WHERE id = ${event.host_user_id}`) as { email: string; name: string | null; username: string | null }[];
      if (hostUser.length > 0) {
        const hostProfileRows = (await sql`SELECT notification_prefs FROM user_profile WHERE user_id = ${event.host_user_id} LIMIT 1`) as { notification_prefs: unknown }[];
        const hostPrefs = normalizeNotificationPrefs(hostProfileRows[0]?.notification_prefs);
        const hostName = hostUser[0].name?.trim() || hostUser[0].username?.replace(/^@/, "") || "there";
        const eventUrl = `${c.env.WEB_BASE_URL}/events/${eventId}`;
        const emailRsvpDate = formatEventDate(event.starts_at, event.timezone || "UTC");
        const emailRsvpLocation = event.location_type === "online" ? (event.online_link || "Online") : [event.location_name, event.location_address].filter(Boolean).join(", ") || "";
        const emailArgs = { to: hostUser[0].email, hostName, attendeeName, eventTitle: event.title, eventUrl, eventDate: emailRsvpDate, eventLocation: emailRsvpLocation };

        if (status === "going" && hostPrefs.items.host_join?.enabled !== false) {
          await sendEventJoinEmail(c.env, emailArgs);
        }
        if (status === "maybe" && hostPrefs.items.host_maybe?.enabled !== false) {
          await sendEventMaybeEmail(c.env, emailArgs);
        }
        if (status === "cant_make_it" && hostPrefs.items.host_leave?.enabled !== false) {
          await sendEventLeaveEmail(c.env, emailArgs);
        }
      }
    } catch { /* noop */ }

    return c.json({ ok: true, status, isGuest });
  } catch (err) {
    console.error("[POST /events/:id/email-rsvp]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Public RSVP (share-link visitors) ────────────────────────────────────────

/** POST /events/:id/public-rsvp/request-code, send a 6-digit verification code to the visitor's email */
app.post("/events/:id/public-rsvp/request-code", async (c) => {
  const eventId = c.req.param("id");
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const rawEmail = body.email ? String(body.email).trim().toLowerCase() : null;
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail))
    return c.json({ ok: false, error: "VALIDATION", message: "Please enter a valid email address" }, 400);

  // Validate share token if provided, allows the public RSVP flow for
  // non-public-visibility plans when the user has a valid share link.
  const shareTokenParam = typeof body.share_token === "string" ? body.share_token : null;
  let hasShareAccess = false;
  if (shareTokenParam) {
    if (await verifyShareToken(shareTokenParam, eventId, c.env.NEXTAUTH_SECRET)) {
      hasShareAccess = true;
    } else {
      const decoded = await verifyParticipationOrInviteToken(shareTokenParam, c.env.NEXTAUTH_SECRET);
      if (decoded && decoded.eventId === eventId) hasShareAccess = true;
    }
  }

  const sql = getSql(c.env);

  try {
    const ev = (await sql`SELECT id, title, status, visibility FROM newchums.events WHERE id = ${eventId}`) as { id: string; title: string; status: string; visibility: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const event = ev[0];
    if (event.status !== "published") return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    // Without a valid share token, require the plan to have public visibility
    if (!hasShareAccess && event.visibility !== "public")
      return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const existingUser = (await sql`SELECT id FROM newchums.users WHERE email = ${rawEmail} LIMIT 1`) as { id: string }[];
    if (existingUser.length > 0) return c.json({ ok: true, existing_account: true });

    const code = generateSixDigitCode();
    const challenge = await createChallengeToken(c.env.NEXTAUTH_SECRET!, { email: rawEmail, eventId, code });

    await sendGuestVerifyCodeEmail(c.env, { to: rawEmail, code, planTitle: event.title });

    return c.json({ ok: true, challenge });
  } catch (err) {
    console.error("[POST /events/:id/public-rsvp/request-code]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/public-rsvp/confirm-code, verify the 6-digit code and issue a participation token */
app.post("/events/:id/public-rsvp/confirm-code", async (c) => {
  const eventId = c.req.param("id");
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const challenge = body.challenge ? String(body.challenge) : null;
  const code = body.code ? String(body.code).trim() : null;
  const name = body.name ? String(body.name).trim().slice(0, 100) : undefined;
  if (!challenge || !code) return c.json({ ok: false, error: "VALIDATION", message: "Challenge and code are required" }, 400);

  try {
    const verified = await verifyChallengeToken(challenge, c.env.NEXTAUTH_SECRET!, code);
    if (!verified || verified.eventId !== eventId)
      return c.json({ ok: false, error: "INVALID_CODE", message: "Incorrect or expired code. Please try again." }, 403);

    const token = await createParticipationToken(c.env.NEXTAUTH_SECRET!, {
      eventId,
      email: verified.email,
      name,
    });

    return c.json({ ok: true, token, email: verified.email });
  } catch (err) {
    console.error("[POST /events/:id/public-rsvp/confirm-code]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/confirm, logged-in user confirms or declines attendance */
app.post("/events/:id/confirm", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const action = typeof body.action === "string" ? body.action : null;
  if (!action || !["confirm", "decline"].includes(action))
    return c.json({ ok: false, error: "INVALID_ACTION", message: "Action must be 'confirm' or 'decline'." }, 400);

  try {
    const ev = (await sql`
      SELECT id, status, host_user_id, require_reconfirmation, starts_at,
             confirmation_window_hours, confirmation_cutoff_hours
      FROM newchums.events WHERE id = ${eventId} AND status = 'published'
    `) as { id: string; status: string; host_user_id: string; require_reconfirmation: boolean; starts_at: string; confirmation_window_hours: number; confirmation_cutoff_hours: number }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const newStatus = action === "confirm" ? "confirmed" : "declined";

    const updated = (await sql`
      UPDATE newchums.event_confirmations
      SET status = ${newStatus}, responded_at = NOW(), updated_at = NOW()
      WHERE event_id = ${eventId} AND user_id = ${userId}
        AND status IN ('pending', 'expired')
      RETURNING id, status
    `) as { id: string; status: string }[];

    if (updated.length === 0) {
      const existing = (await sql`SELECT status FROM newchums.event_confirmations WHERE event_id = ${eventId} AND user_id = ${userId}`) as { status: string }[];
      if (existing.length > 0 && existing[0].status === newStatus) {
        await markConfirmationRequestedNotificationsRead(sql, userId, eventId);
        return c.json({ ok: true, status: newStatus, alreadySet: true });
      }

      if (ev[0].require_reconfirmation) {
        const startsAtMs = new Date(ev[0].starts_at).getTime();
        const windowHours = Number(ev[0].confirmation_window_hours) || 24;
        const windowOpensAt = startsAtMs - windowHours * 60 * 60 * 1000;
        const isWindowOpen = Date.now() >= windowOpensAt;

        if (isWindowOpen) {
          const isGoingOrHost = ev[0].host_user_id === userId || ((await sql`
            SELECT status FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId}
          `) as { status: string }[]).some((r) => r.status === "going");

          if (isGoingOrHost) {
            await sql`
              INSERT INTO newchums.event_confirmations (event_id, user_id, status, responded_at)
              VALUES (${eventId}, ${userId}, ${newStatus}, NOW())
              ON CONFLICT (event_id, user_id) DO UPDATE
              SET status = ${newStatus}, responded_at = NOW(), updated_at = NOW()
            `;
            await markConfirmationRequestedNotificationsRead(sql, userId, eventId);
            return c.json({ ok: true, status: newStatus });
          }
        }
      }

      return c.json({ ok: false, error: "NO_CONFIRMATION", message: "No pending confirmation found for this plan." }, 404);
    }

    // If host declines, that's effectively a cancel intent, but don't auto-cancel here.
    // The host can use the cancel flow separately.

    await markConfirmationRequestedNotificationsRead(sql, userId, eventId);
    return c.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error("[POST /events/:id/confirm]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/guest-confirm — token-based attendance confirmation for guest attendees (no login required) */
app.post("/events/:id/guest-confirm", async (c) => {
  const eventId = c.req.param("id");
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const token = typeof body.token === "string" ? body.token.trim() : null;
  const action = typeof body.action === "string" ? body.action : null;
  if (!token) return c.json({ ok: false, error: "MISSING_TOKEN" }, 400);
  if (!action || !["confirm", "decline"].includes(action))
    return c.json({ ok: false, error: "INVALID_ACTION" }, 400);

  const decoded = await verifyGuestConfirmationToken(token, c.env.NEXTAUTH_SECRET);
  if (!decoded || decoded.eventId !== eventId)
    return c.json({ ok: false, error: "INVALID_TOKEN", message: "This link has expired or is invalid." }, 403);

  const sql = getSql(c.env);
  const guestEmail = decoded.email.toLowerCase();
  const newStatus = action === "confirm" ? "confirmed" : "declined";

  try {
    const ev = (await sql`
      SELECT id, status, require_reconfirmation, starts_at,
             confirmation_window_hours, confirmation_cutoff_hours
      FROM newchums.events WHERE id = ${eventId} AND status = 'published'
    `) as { id: string; status: string; require_reconfirmation: boolean; starts_at: string; confirmation_window_hours: number; confirmation_cutoff_hours: number }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    // Check if the guest email has since registered; if so, update by user_id
    const userRows = (await sql`SELECT id FROM newchums.users WHERE email = ${guestEmail} LIMIT 1`) as { id: string }[];
    if (userRows.length > 0) {
      const userId = userRows[0].id;
      const updated = (await sql`
        UPDATE newchums.event_confirmations
        SET status = ${newStatus}, responded_at = NOW(), updated_at = NOW()
        WHERE event_id = ${eventId} AND user_id = ${userId}
          AND status IN ('pending', 'expired', 'confirmed', 'declined')
          AND status != ${newStatus}
        RETURNING id, status
      `) as { id: string; status: string }[];
      if (updated.length > 0) return c.json({ ok: true, status: newStatus });
      const existing = (await sql`SELECT status FROM newchums.event_confirmations WHERE event_id = ${eventId} AND user_id = ${userId}`) as { status: string }[];
      if (existing.length > 0 && existing[0].status === newStatus)
        return c.json({ ok: true, status: newStatus, alreadySet: true });
    }

    // Guest path: update by guest_email (allow changing between confirmed/declined)
    const updated = (await sql`
      UPDATE newchums.event_confirmations
      SET status = ${newStatus}, responded_at = NOW(), updated_at = NOW()
      WHERE event_id = ${eventId} AND guest_email = ${guestEmail}
        AND status IN ('pending', 'expired', 'confirmed', 'declined')
        AND status != ${newStatus}
      RETURNING id, status
    `) as { id: string; status: string }[];

    if (updated.length > 0) return c.json({ ok: true, status: newStatus });

    // Idempotent check
    const existing = (await sql`SELECT status FROM newchums.event_confirmations WHERE event_id = ${eventId} AND guest_email = ${guestEmail}`) as { status: string }[];
    if (existing.length > 0 && existing[0].status === newStatus)
      return c.json({ ok: true, status: newStatus, alreadySet: true });

    // No existing row; create one if window is open and guest has a going RSVP
    if (ev[0].require_reconfirmation) {
      const startsAtMs = new Date(ev[0].starts_at).getTime();
      const windowHours = Number(ev[0].confirmation_window_hours) || 24;
      const windowOpensAt = startsAtMs - windowHours * 60 * 60 * 1000;
      if (Date.now() >= windowOpensAt) {
        const hasRsvp = (await sql`SELECT 1 FROM newchums.event_rsvps WHERE event_id = ${eventId} AND guest_email = ${guestEmail} AND user_id IS NULL AND status = 'going' LIMIT 1`) as unknown[];
        if (hasRsvp.length > 0) {
          await sql`
            INSERT INTO newchums.event_confirmations (event_id, user_id, guest_email, status, responded_at)
            VALUES (${eventId}, ${null}, ${guestEmail}, ${newStatus}, NOW())
            ON CONFLICT DO NOTHING
          `;
          return c.json({ ok: true, status: newStatus });
        }
      }
    }

    return c.json({ ok: false, error: "NO_CONFIRMATION", message: "No pending confirmation found." }, 404);
  } catch (err) {
    console.error("[POST /events/:id/guest-confirm]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PATCH /events/:id/alt-time/:altTimeId, edit own alternate time entry */
app.patch("/events/:id/alt-time/:altTimeId", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const altTimeId = c.req.param("altTimeId");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  try {
    const row = (await sql`SELECT id, user_id, suggested_at, ends_at, note FROM newchums.event_alt_times WHERE id = ${altTimeId}`) as { id: string; user_id: string; suggested_at: string; ends_at: string | null; note: string | null }[];
    if (row.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (row[0].user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

    let suggestedAt: Date | null = null;
    if (body.suggested_at != null) {
      suggestedAt = new Date(String(body.suggested_at));
      if (isNaN(suggestedAt.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid start date/time", field: "suggested_at" }, 400);
    }

    let endsAt: Date | null | undefined = undefined;
    if (body.ends_at !== undefined) {
      if (body.ends_at === null || body.ends_at === "") {
        endsAt = null;
      } else {
        endsAt = new Date(String(body.ends_at));
        if (isNaN(endsAt.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid end date/time", field: "ends_at" }, 400);
      }
    }

    const effectiveStart = suggestedAt ?? new Date(row[0].suggested_at);
    const effectiveEnd = endsAt !== undefined ? endsAt : (row[0].ends_at ? new Date(row[0].ends_at) : null);
    if (effectiveEnd && effectiveEnd.getTime() <= effectiveStart.getTime())
      return c.json({ ok: false, error: "VALIDATION", message: "End time must be after start time", field: "ends_at" }, 400);

    const finalNote = body.note !== undefined ? (body.note ? String(body.note).trim().slice(0, 500) : null) : row[0].note;

    await sql`
      UPDATE newchums.event_alt_times SET
        suggested_at = ${suggestedAt ? suggestedAt.toISOString() : row[0].suggested_at},
        ends_at      = ${endsAt !== undefined ? (endsAt ? endsAt.toISOString() : null) : row[0].ends_at},
        note         = ${finalNote}
      WHERE id = ${altTimeId}
    `;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /events/:id/alt-time/:altTimeId]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** DELETE /events/:id/alt-time/:altTimeId, delete own entry (or host can delete any) */
app.delete("/events/:id/alt-time/:altTimeId", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");
  const altTimeId = c.req.param("altTimeId");

  try {
    const row = (await sql`
      SELECT eat.id, eat.user_id, e.host_user_id
      FROM newchums.event_alt_times eat
      JOIN newchums.events e ON e.id = eat.event_id
      WHERE eat.id = ${altTimeId} AND eat.event_id = ${eventId}
    `) as { id: string; user_id: string; host_user_id: string }[];
    if (row.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (row[0].user_id !== userId && row[0].host_user_id !== userId)
      return c.json({ ok: false, error: "FORBIDDEN" }, 403);

    await sql`DELETE FROM newchums.event_alt_times WHERE id = ${altTimeId}`;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /events/:id/alt-time/:altTimeId]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/alt-time, add an alternate time */
app.post("/events/:id/alt-time", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const suggestedAt = body.suggested_at ? String(body.suggested_at) : null;
  if (!suggestedAt) return c.json({ ok: false, error: "VALIDATION", message: "Start date/time is required", field: "suggested_at" }, 400);

  const suggestedDate = new Date(suggestedAt);
  if (isNaN(suggestedDate.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid date/time", field: "suggested_at" }, 400);

  let endsAtDate: Date | null = null;
  if (body.ends_at) {
    endsAtDate = new Date(String(body.ends_at));
    if (isNaN(endsAtDate.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid end date/time", field: "ends_at" }, 400);
    if (endsAtDate.getTime() <= suggestedDate.getTime())
      return c.json({ ok: false, error: "VALIDATION", message: "End time must be after start time", field: "ends_at" }, 400);
  }

  const note = body.note ? String(body.note).trim().slice(0, 500) : null;

  try {
    const ev = (await sql`SELECT id, host_user_id, allow_alt_times, title FROM newchums.events WHERE id = ${eventId} AND status = 'published'`) as { id: string; host_user_id: string; allow_alt_times: boolean; title: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (!ev[0].allow_alt_times) return c.json({ ok: false, error: "VALIDATION", message: "This plan does not accept alternate times" }, 400);

    const isHost = ev[0].host_user_id === userId;
    if (!isHost) {
      const hasRelation = (await sql`
        SELECT 1 FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId}
        UNION ALL
        SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId}
        LIMIT 1
      `) as unknown[];
      if (hasRelation.length === 0)
        return c.json({ ok: false, error: "FORBIDDEN", message: "You must be part of this plan to add alternate times" }, 403);
    }

    await sql`
      INSERT INTO newchums.event_alt_times (event_id, user_id, suggested_at, ends_at, note)
      VALUES (${eventId}, ${userId}, ${suggestedDate.toISOString()}, ${endsAtDate ? endsAtDate.toISOString() : null}, ${note})
    `;

    const participants = (await sql`
      SELECT DISTINCT u.id
      FROM (
        SELECT user_id AS id FROM newchums.event_rsvps
        WHERE event_id = ${eventId} AND status IN ('going', 'maybe')
        UNION
        SELECT ${ev[0].host_user_id}::uuid AS id
      ) sub
      JOIN newchums.users u ON u.id = sub.id
      WHERE sub.id != ${userId}
    `) as { id: string }[];

    if (participants.length > 0) {
      const meta = JSON.stringify({ eventTitle: ev[0].title, suggestedAt: suggestedDate.toISOString() });
      for (const p of participants) {
        await sql`
          INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
          VALUES (${p.id}, 'event_alt_time', ${userId}, ${eventId}, ${meta})
        `;
      }
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/alt-time]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/guest-alt-time, guest (invite-token or participation token) alternate time suggestion */
app.post("/events/:id/guest-alt-time", async (c) => {
  const eventId = c.req.param("id");
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const token = body.invite_token ? String(body.invite_token) : body.participation_token ? String(body.participation_token) : null;
  if (!token) return c.json({ ok: false, error: "MISSING_TOKEN" }, 400);

  const decoded = await verifyParticipationOrInviteToken(token, c.env.NEXTAUTH_SECRET);
  if (!decoded || decoded.eventId !== eventId)
    return c.json({ ok: false, error: "INVALID_TOKEN", message: "This link has expired or is invalid." }, 403);

  const isPublicRsvp = decoded.purpose === "public_rsvp";
  const guestEmail = decoded.email?.toLowerCase() ?? null;
  if (!guestEmail)
    return c.json({ ok: false, error: "INVALID_TOKEN", message: "This invite link is invalid." }, 400);

  const suggestedAt = body.suggested_at ? String(body.suggested_at) : null;
  if (!suggestedAt) return c.json({ ok: false, error: "VALIDATION", message: "Start date/time is required", field: "suggested_at" }, 400);
  const suggestedDate = new Date(suggestedAt);
  if (isNaN(suggestedDate.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid date/time", field: "suggested_at" }, 400);

  let endsAtDate: Date | null = null;
  if (body.ends_at) {
    endsAtDate = new Date(String(body.ends_at));
    if (isNaN(endsAtDate.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid end date/time", field: "ends_at" }, 400);
    if (endsAtDate.getTime() <= suggestedDate.getTime())
      return c.json({ ok: false, error: "VALIDATION", message: "End time must be after start time", field: "ends_at" }, 400);
  }

  const note = body.note ? String(body.note).trim().slice(0, 500) : null;
  const sql = getSql(c.env);

  try {
    const ev = (await sql`SELECT id, host_user_id, allow_alt_times, title FROM newchums.events WHERE id = ${eventId} AND status = 'published'`) as { id: string; host_user_id: string; allow_alt_times: boolean; title: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (!ev[0].allow_alt_times) return c.json({ ok: false, error: "VALIDATION", message: "This plan does not accept alternate times" }, 400);

    // For invite tokens, verify invitee is invited; public RSVP tokens need an existing RSVP instead
    if (isPublicRsvp) {
      const hasRsvp = (await sql`SELECT 1 FROM newchums.event_rsvps WHERE event_id = ${eventId} AND guest_email = ${guestEmail} AND user_id IS NULL LIMIT 1`) as unknown[];
      if (hasRsvp.length === 0)
        return c.json({ ok: false, error: "FORBIDDEN", message: "You must RSVP before suggesting alternate times" }, 403);
    } else {
      const guestInvited = (await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND email = ${guestEmail} LIMIT 1`) as unknown[];
      if (guestInvited.length === 0)
        return c.json({ ok: false, error: "FORBIDDEN", message: "You must be invited to suggest alternate times" }, 403);
    }

    const guestAltCount = (await sql`SELECT COUNT(*)::int AS c FROM newchums.event_alt_times WHERE event_id = ${eventId} AND guest_email = ${guestEmail} AND user_id IS NULL`) as { c: number }[];
    if (guestAltCount[0].c >= 10)
      return c.json({ ok: false, error: "VALIDATION", message: "You can suggest up to 10 alternate times" }, 400);

    await sql`
      INSERT INTO newchums.event_alt_times (event_id, user_id, guest_email, suggested_at, ends_at, note)
      VALUES (${eventId}, ${null}, ${guestEmail}, ${suggestedDate.toISOString()}, ${endsAtDate ? endsAtDate.toISOString() : null}, ${note})
    `;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/guest-alt-time]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/promote-alt-time, host promotes an alternate time to official starts_at */
app.post("/events/:id/promote-alt-time", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const startsAtRaw = body.starts_at ? String(body.starts_at) : null;
  if (!startsAtRaw) return c.json({ ok: false, error: "VALIDATION", message: "Start time is required" }, 400);
  const startsAt = new Date(startsAtRaw);
  if (isNaN(startsAt.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid date/time" }, 400);

  try {
    const ev = (await sql`
      SELECT id, host_user_id, status, title, starts_at, timezone FROM newchums.events WHERE id = ${eventId}
    `) as { id: string; host_user_id: string; status: string; title: string; starts_at: string; timezone: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (ev[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
    if (ev[0].status === "canceled") return c.json({ ok: false, error: "VALIDATION", message: "Cannot update a canceled plan" }, 400);

    const oldStartsAt = ev[0].starts_at;
    if (new Date(oldStartsAt).getTime() === startsAt.getTime()) return c.json({ ok: true });

    await sql`
      UPDATE newchums.events SET starts_at = ${startsAt.toISOString()}, updated_at = NOW() WHERE id = ${eventId}
    `;

    const effectiveTz = ev[0].timezone ?? "UTC";
    const changes: PlanChangeItem[] = [{
      fieldName: "Date & time",
      oldValue: formatEventDate(oldStartsAt, effectiveTz),
      newValue: formatEventDate(startsAt.toISOString(), effectiveTz),
    }];

    c.executionCtx.waitUntil(
      notifyAttendeesPlanChanged(sql, c.env, eventId, userId, ev[0].title, "updated", changes),
    );

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/promote-alt-time]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/**
 * Notify Going/Maybe attendees (excluding the host) that a plan was changed.
 * Respects each attendee's `event_changed_canceled` notification preference.
 * Used by: PATCH /events/:id (edit), POST /events/:id/lock, POST /events/:id/cancel.
 * The optional `changes` array is included in the email for the "updated" scenario.
 */
async function notifyAttendeesPlanChanged(
  sql: ReturnType<typeof getSql>,
  env: Bindings,
  eventId: string,
  hostUserId: string,
  eventTitle: string,
  changeType: "updated" | "locked" | "canceled",
  changes?: PlanChangeItem[],
): Promise<void> {
  if (!env.POSTMARK_TEMPLATE_EVENT_CHANGED || !env.NEXTAUTH_SECRET) return;
  const eventUrl = `${env.WEB_BASE_URL}/events/${eventId}`;

  // Fetch event details for date/location display in the email
  const evRows = (await sql`
    SELECT starts_at, timezone, location_type, location_name, location_address, online_link, COALESCE(is_qa, false) AS is_qa
    FROM newchums.events WHERE id = ${eventId} LIMIT 1
  `) as { starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; online_link: string | null; is_qa: boolean }[];
  const ev = evRows[0];
  const eventDate = ev ? formatEventDate(ev.starts_at, ev.timezone || "UTC") : "";
  const eventLocation = ev
    ? ev.location_type === "online" ? (ev.online_link || "Online") : [ev.location_name, ev.location_address].filter(Boolean).join(", ") || ""
    : "";

  const hostRows = (await sql`
    SELECT username, name FROM newchums.users WHERE id = ${hostUserId} LIMIT 1
  `) as { username: string | null; name: string | null }[];
  const host = hostRows[0];
  const hostUsernameSlug = host?.username?.replace(/^@/, "").trim() || null;
  const hostNameTrimmed = host?.name?.trim() || null;
  const notificationMetadata = {
    eventTitle,
    ...(hostUsernameSlug ? { hostUsername: hostUsernameSlug } : {}),
    ...(hostNameTrimmed ? { hostName: hostNameTrimmed } : {}),
  };

  const attendees = (await sql`
    SELECT u.id, u.email, u.name, u.username
    FROM newchums.event_rsvps er
    JOIN newchums.users u ON u.id = er.user_id
    WHERE er.event_id = ${eventId}
      AND er.status IN ('going', 'maybe')
      AND er.user_id != ${hostUserId}
  `) as Array<{ id: string; email: string; name: string | null; username: string | null }>;

  const notifType = changeType === "canceled" ? "event_canceled"
    : changeType === "locked" ? "event_locked"
    : "event_updated";

  // QA plans: only notify super admin attendees
  const qaChangeAdminIds = ev?.is_qa ? await batchLoadSuperAdminIds(sql, attendees.map((a) => a.id)) : null;

  for (const att of attendees) {
    if (qaChangeAdminIds && !qaChangeAdminIds.has(att.id)) continue;
    try {
      await sql`
        INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
        VALUES (${att.id}, ${notifType}, ${hostUserId}, ${eventId}, ${JSON.stringify(notificationMetadata)})
      `;

      const profileRows = (await sql`
        SELECT notification_prefs FROM newchums.user_profile WHERE user_id = ${att.id} LIMIT 1
      `) as Array<{ notification_prefs: unknown }>;
      const prefs = normalizeNotificationPrefs(profileRows[0]?.notification_prefs);
      if (prefs.items.event_changed_canceled?.enabled === false) continue;

      const unsubToken = await createUnsubscribeToken(env.NEXTAUTH_SECRET, att.id, "event_changed_canceled");
      const unsubscribeUrl = `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
      const recipientName = att.name?.trim() || att.username?.replace(/^@/, "") || "there";

      await sendEventChangedEmail(env, {
        to: att.email,
        recipientName,
        eventTitle,
        eventUrl,
        changeType,
        changes,
        eventDate,
        eventLocation,
        unsubscribeUrl,
      });
    } catch { /* noop, never let email failure break the host's action */ }
  }
}

/** PATCH /events/:id, edit core event fields (host only, published events) */
app.patch("/events/:id", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  try {
    const rows = (await sql`
      SELECT id, host_user_id, status, title, description, starts_at, timezone, max_seats, visibility,
             require_reconfirmation, min_confirmed_attendees, fallback_policy, alt_times_mode, availability_deadline_at,
             location_type, location_name, location_address, location_place_id, location_lat, location_lng,
             location_visibility, location_area, online_link
      FROM newchums.events WHERE id = ${eventId}
    `) as { id: string; host_user_id: string; status: string; title: string; description: string | null; starts_at: string; timezone: string | null; max_seats: number | null; visibility: string; require_reconfirmation: boolean; min_confirmed_attendees: number | null; fallback_policy: string; alt_times_mode: string | null; availability_deadline_at: string | null; location_type: string; location_name: string | null; location_address: string | null; location_place_id: string | null; location_lat: number | null; location_lng: number | null; location_visibility: string; location_area: string | null; online_link: string | null }[];
    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (rows[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
    if (rows[0].status === "canceled") return c.json({ ok: false, error: "VALIDATION", message: "Cannot edit a canceled plan" }, 400);

    const rawTitle = body.title != null ? String(body.title).trim() : null;
    if (!rawTitle) return c.json({ ok: false, error: "VALIDATION", message: "Title is required", field: "title" }, 400);
    if (rawTitle.length > 200) return c.json({ ok: false, error: "VALIDATION", message: "Title must be 200 characters or less", field: "title" }, 400);

    const description = body.description != null ? sanitizeDescriptionHtml(String(body.description).trim().slice(0, 5000)) || null : null;

    const startsAtRaw = body.starts_at ? String(body.starts_at) : null;
    if (!startsAtRaw) return c.json({ ok: false, error: "VALIDATION", message: "Date and time are required", field: "starts_at" }, 400);
    const startsAt = new Date(startsAtRaw);
    if (isNaN(startsAt.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid date/time", field: "starts_at" }, 400);

    const rawMaxSeats = body.max_seats != null ? Number(body.max_seats) : null;
    const maxSeats = rawMaxSeats != null && !isNaN(rawMaxSeats) && rawMaxSeats >= 1 ? Math.floor(rawMaxSeats) : null;

    const VALID_VISIBILITIES = ["public", "chums_only", "invite_only"];
    const visibility = body.visibility && VALID_VISIBILITIES.includes(String(body.visibility))
      ? String(body.visibility)
      : null;
    if (!visibility) return c.json({ ok: false, error: "VALIDATION", message: "Invalid visibility", field: "visibility" }, 400);

    const patchRequireReconfirmation = body.require_reconfirmation === true;
    const patchRequireApproval = body.require_approval === true;
    const patchAllowAttendeeInvites = body.allow_attendee_invites != null ? body.allow_attendee_invites !== false : undefined;
    const patchAllowAltTimes = body.allow_alt_times != null ? body.allow_alt_times === true : undefined;
    const patchAltTimesMode = body.alt_times_mode === "suggest" || body.alt_times_mode === "availability" ? body.alt_times_mode : undefined;
    // Availability deadline: only meaningful when mode is "availability"
    const effectiveAltTimesMode = patchAltTimesMode ?? rows[0].alt_times_mode ?? "suggest";
    let patchAvailabilityDeadlineAt: string | null | undefined = undefined;
    if (effectiveAltTimesMode === "availability" && "availability_deadline_at" in body) {
      if (body.availability_deadline_at) {
        const dl = new Date(String(body.availability_deadline_at));
        if (!isNaN(dl.getTime())) {
          if (dl.getTime() >= startsAt.getTime())
            return c.json({ ok: false, error: "VALIDATION", message: "Availability deadline must be before the plan start time", field: "availability_deadline_at" }, 400);
          patchAvailabilityDeadlineAt = dl.toISOString();
        }
      } else {
        patchAvailabilityDeadlineAt = null; // explicitly cleared
      }
    } else if (effectiveAltTimesMode !== "availability") {
      // Clear deadline when mode is not availability
      patchAvailabilityDeadlineAt = null;
    }
    const patchReserveSeats = body.reserve_seats != null ? body.reserve_seats === true : undefined;

    // Location fields (optional, only processed if location_type is present in the body)
    const hasLocationUpdate = "location_type" in body;
    let patchLocationType: string | undefined;
    let patchLocationName: string | null | undefined;
    let patchLocationAddress: string | null | undefined;
    let patchLocationPlaceId: string | null | undefined;
    let patchLocationLat: number | null | undefined;
    let patchLocationLng: number | null | undefined;
    let patchLocationVisibility: string | undefined;
    let patchLocationArea: string | null | undefined;
    let patchOnlineLink: string | null | undefined;
    if (hasLocationUpdate) {
      const lt = String(body.location_type ?? "in_person");
      if (!VALID_LOCATION_TYPE.includes(lt as typeof VALID_LOCATION_TYPE[number]))
        return c.json({ ok: false, error: "VALIDATION", message: "Invalid location type", field: "location_type" }, 400);
      patchLocationType = lt;
      patchLocationName = body.location_name ? String(body.location_name).trim().slice(0, 200) : null;
      patchLocationAddress = body.location_address ? String(body.location_address).trim().slice(0, 500) : null;
      patchLocationPlaceId = body.location_place_id ? String(body.location_place_id) : null;
      patchLocationLat = body.location_lat != null ? Number(body.location_lat) : null;
      patchLocationLng = body.location_lng != null ? Number(body.location_lng) : null;
      patchLocationVisibility = lt === "in_person"
        ? (VALID_LOCATION_VISIBILITY.includes(String(body.location_visibility ?? "exact_everyone") as typeof VALID_LOCATION_VISIBILITY[number])
            ? String(body.location_visibility)
            : "exact_everyone")
        : "exact_everyone";
      patchLocationArea = body.location_area ? String(body.location_area).trim().slice(0, 200) : null;
      if (!patchLocationArea && (patchLocationVisibility === "approximate_only" || patchLocationVisibility === "exact_joined_only") && patchLocationAddress) {
        patchLocationArea = deriveApproxArea(patchLocationAddress);
      }
      patchOnlineLink = lt === "online" ? (body.online_link ? String(body.online_link).trim().slice(0, 500) : null) : null;
    }

    const patchTimezone = body.timezone && typeof body.timezone === "string" ? body.timezone.trim().slice(0, 64) : null;
    const patchPrefOverrides = "pref_overrides" in body ? parsePrefOverrides(body.pref_overrides ?? null) : undefined;
    const patchCommunityId = "community_id" in body ? (body.community_id ? String(body.community_id) : null) : undefined;
    const patchHideFromExplore = "hide_from_explore" in body ? body.hide_from_explore === true : undefined;
    const patchIsQa = "is_qa" in body ? body.is_qa === true : undefined;
    // Only super admins can toggle the QA flag
    if (patchIsQa !== undefined) {
      const isSuperAdmin = await checkIsSuperAdmin(sql, userId);
      if (!isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN", message: "Only super admins can set QA flag" }, 403);
    }
    const patchBannerKey = "banner_key" in body ? (body.banner_key === null ? null : undefined) : undefined;

    // Attendance assurance fields
    const patchMinConfirmed = patchRequireReconfirmation && body.min_confirmed_attendees != null
      ? Math.max(1, Math.min(500, Math.floor(Number(body.min_confirmed_attendees))))
      : null;
    const PATCH_VALID_FALLBACKS = ["proceed", "notify_host", "auto_cancel"] as const;
    const patchFallbackPolicy = patchRequireReconfirmation && typeof body.fallback_policy === "string" && PATCH_VALID_FALLBACKS.includes(body.fallback_policy as typeof PATCH_VALID_FALLBACKS[number])
      ? body.fallback_policy as string
      : "notify_host";

    // Resolve and validate hobby tags (required, mirrors POST /events logic)
    const patchInterestItems = Array.isArray(body.interest_items)
      ? (body.interest_items as Array<{ slug?: string; name?: string }>).slice(0, 10)
      : [];

    if (patchInterestItems.length === 0)
      return c.json({ ok: false, error: "VALIDATION", message: "At least one hobby is required", field: "hobby" }, 400);

    const patchInterestIds: string[] = [];
    for (const it of patchInterestItems) {
      const slug = it?.slug ? nameToSlug(String(it.slug).trim()) : "";
      const name = it?.name ? String(it.name).trim().replace(/\s+/g, " ") : "";
      if (!slug || !name) continue;
      if (name.length > 50)
        return c.json({ ok: false, error: "VALIDATION", message: "Hobby name must be 50 characters or less", field: "hobby" }, 400);
      const hCheck = validateCleanText(name, "hobby");
      if (!hCheck.ok)
        return c.json({ ok: false, error: "INAPPROPRIATE_TEXT", field: "hobby", message: hCheck.reason ?? "That hobby name isn't allowed." }, 400);

      const existRows = (await sql`
        SELECT id, is_deleted FROM newchums.interests WHERE LOWER(slug) = LOWER(${slug}) LIMIT 1
      `) as { id: string; is_deleted: boolean }[];

      if (existRows[0] && !existRows[0].is_deleted) {
        if (!patchInterestIds.includes(existRows[0].id)) patchInterestIds.push(existRows[0].id);
      } else {
        try {
          await sql`INSERT INTO newchums.interests (name, category, slug, sort_order, is_seed, created_by_user_id) VALUES (${name}, '', ${slug}, 0, false, ${userId}) ON CONFLICT (slug) DO NOTHING`;
        } catch { /* ignore concurrent insert race */ }
        const fetched = (await sql`
          SELECT id FROM newchums.interests WHERE LOWER(slug) = LOWER(${slug}) AND is_deleted = false LIMIT 1
        `) as { id: string }[];
        if (fetched[0] && !patchInterestIds.includes(fetched[0].id)) patchInterestIds.push(fetched[0].id);
      }
    }

    if (patchInterestIds.length === 0)
      return c.json({ ok: false, error: "VALIDATION", message: "At least one valid hobby is required", field: "hobby" }, 400);

    const patchPrimaryInterestId = patchInterestIds[0];

    await sql`
      UPDATE newchums.events
      SET title                    = ${rawTitle},
          description              = ${description},
          starts_at                = ${startsAt.toISOString()},
          interest_id              = ${patchPrimaryInterestId},
          max_seats                = ${maxSeats},
          visibility               = ${visibility},
          require_reconfirmation   = ${patchRequireReconfirmation},
          require_approval         = ${patchRequireApproval},
          allow_attendee_invites   = COALESCE(${patchAllowAttendeeInvites ?? null}, allow_attendee_invites),
          allow_alt_times          = COALESCE(${patchAllowAltTimes ?? null}, allow_alt_times),
          alt_times_mode           = COALESCE(${patchAltTimesMode ?? null}, alt_times_mode),
          availability_deadline_at = CASE WHEN ${patchAvailabilityDeadlineAt !== undefined} THEN ${patchAvailabilityDeadlineAt !== undefined ? patchAvailabilityDeadlineAt : null}::timestamptz ELSE availability_deadline_at END,
          reserve_seats            = COALESCE(${patchReserveSeats ?? null}, reserve_seats),
          timezone                 = COALESCE(${patchTimezone}, timezone),
          min_confirmed_attendees  = ${patchMinConfirmed},
          fallback_policy          = ${patchFallbackPolicy},
          pref_overrides           = CASE WHEN ${patchPrefOverrides !== undefined} THEN ${patchPrefOverrides !== undefined ? (patchPrefOverrides ? JSON.stringify(patchPrefOverrides) : null) : null}::jsonb ELSE pref_overrides END,
          community_id             = CASE WHEN ${patchCommunityId !== undefined} THEN ${patchCommunityId !== undefined ? patchCommunityId : null}::uuid ELSE community_id END,
          hide_from_explore        = CASE WHEN ${patchHideFromExplore !== undefined} THEN ${patchHideFromExplore !== undefined ? patchHideFromExplore : false} ELSE hide_from_explore END,
          is_qa                    = CASE WHEN ${patchIsQa !== undefined} THEN ${patchIsQa !== undefined ? patchIsQa : false} ELSE is_qa END,
          banner_key               = CASE WHEN ${patchBannerKey !== undefined} THEN ${patchBannerKey !== undefined ? patchBannerKey : null} ELSE banner_key END,
          location_type            = CASE WHEN ${hasLocationUpdate} THEN ${patchLocationType ?? null} ELSE location_type END,
          location_name            = CASE WHEN ${hasLocationUpdate} THEN ${patchLocationName ?? null} ELSE location_name END,
          location_address         = CASE WHEN ${hasLocationUpdate} THEN ${patchLocationAddress ?? null} ELSE location_address END,
          location_place_id        = CASE WHEN ${hasLocationUpdate} THEN ${patchLocationPlaceId ?? null} ELSE location_place_id END,
          location_lat             = CASE WHEN ${hasLocationUpdate} THEN ${patchLocationLat ?? null} ELSE location_lat END,
          location_lng             = CASE WHEN ${hasLocationUpdate} THEN ${patchLocationLng ?? null} ELSE location_lng END,
          location_visibility      = CASE WHEN ${hasLocationUpdate} THEN ${patchLocationVisibility ?? null} ELSE location_visibility END,
          location_area            = CASE WHEN ${hasLocationUpdate} THEN ${patchLocationArea ?? null} ELSE location_area END,
          online_link              = CASE WHEN ${hasLocationUpdate} THEN ${patchOnlineLink ?? null} ELSE online_link END,
          updated_at               = NOW()
      WHERE id = ${eventId}
    `;

    await sql`DELETE FROM newchums.event_interests WHERE event_id = ${eventId}`;
    if (patchInterestIds.length > 0) {
      await sql`
        INSERT INTO newchums.event_interests (event_id, interest_id)
        SELECT ${eventId}::uuid, unnest(${patchInterestIds}::uuid[])
        ON CONFLICT DO NOTHING
      `;
    }

    // Build a human-readable diff for the email notification
    const before = rows[0];
    const effectiveTz = patchTimezone ?? before.timezone ?? "UTC";
    const changes: PlanChangeItem[] = [];
    const VIS_LABEL: Record<string, string> = { public: "Public", chums_only: "Chums only", invite_only: "Invite only" };
    const truncate = (s: string | null, n: number): string => s ? (s.length > n ? s.slice(0, n) + "…" : s) : "(none)";

    if (before.title !== rawTitle)
      changes.push({ fieldName: "Title", oldValue: before.title, newValue: rawTitle });

    if (new Date(before.starts_at).getTime() !== startsAt.getTime())
      changes.push({
        fieldName: "Date & time",
        oldValue: formatEventDate(before.starts_at, effectiveTz),
        newValue: formatEventDate(startsAt.toISOString(), effectiveTz),
      });

    if ((before.description ?? null) !== description)
      changes.push({ fieldName: "Description", oldValue: truncate(before.description, 150), newValue: truncate(description, 150) });

    if (before.max_seats !== maxSeats)
      changes.push({
        fieldName: "Capacity",
        oldValue: before.max_seats != null ? `${before.max_seats} people` : "No limit",
        newValue: maxSeats != null ? `${maxSeats} people` : "No limit",
      });

    if (before.visibility !== visibility)
      changes.push({
        fieldName: "Visibility",
        oldValue: VIS_LABEL[before.visibility] ?? before.visibility,
        newValue: VIS_LABEL[visibility] ?? visibility,
      });

    const FALLBACK_LABEL: Record<string, string> = { proceed: "Proceed", notify_host: "Notify host", auto_cancel: "Auto-cancel" };

    if (before.require_reconfirmation !== patchRequireReconfirmation)
      changes.push({
        fieldName: "Final confirmation",
        oldValue: before.require_reconfirmation ? "Enabled" : "Disabled",
        newValue: patchRequireReconfirmation ? "Enabled" : "Disabled",
      });

    if (patchRequireReconfirmation && (before.min_confirmed_attendees ?? null) !== patchMinConfirmed)
      changes.push({
        fieldName: "Minimum confirmed",
        oldValue: before.min_confirmed_attendees != null ? `${before.min_confirmed_attendees} attendees` : "No minimum",
        newValue: patchMinConfirmed != null ? `${patchMinConfirmed} attendees` : "No minimum",
      });

    if (patchRequireReconfirmation && (before.fallback_policy ?? "notify_host") !== patchFallbackPolicy)
      changes.push({
        fieldName: "If minimum not met",
        oldValue: FALLBACK_LABEL[before.fallback_policy ?? "notify_host"] ?? before.fallback_policy ?? "Notify host",
        newValue: FALLBACK_LABEL[patchFallbackPolicy] ?? patchFallbackPolicy,
      });

    // Availability deadline change detection
    if (patchAvailabilityDeadlineAt !== undefined) {
      const oldDl = before.availability_deadline_at;
      const newDl = patchAvailabilityDeadlineAt;
      const oldDlTime = oldDl ? new Date(oldDl).getTime() : null;
      const newDlTime = newDl ? new Date(newDl).getTime() : null;
      if (oldDlTime !== newDlTime) {
        changes.push({
          fieldName: "Availability deadline",
          oldValue: oldDl ? formatEventDate(oldDl, effectiveTz) : "None",
          newValue: newDl ? formatEventDate(newDl, effectiveTz) : "None",
        });
      }
    }

    // Location change detection
    if (hasLocationUpdate) {
      const LOC_TYPE_LABEL: Record<string, string> = { in_person: "In person", online: "Online" };
      if (before.location_type !== patchLocationType)
        changes.push({
          fieldName: "Location type",
          oldValue: LOC_TYPE_LABEL[before.location_type] ?? before.location_type,
          newValue: LOC_TYPE_LABEL[patchLocationType!] ?? patchLocationType!,
        });

      const oldLocDisplay = before.location_type === "online"
        ? (before.online_link || "Online")
        : buildLocationDisplay(before.location_name, before.location_address);
      const newLocDisplay = patchLocationType === "online"
        ? (patchOnlineLink || "Online")
        : buildLocationDisplay(patchLocationName ?? null, patchLocationAddress ?? null);
      if (oldLocDisplay !== newLocDisplay)
        changes.push({
          fieldName: "Location",
          oldValue: oldLocDisplay || "Not set",
          newValue: newLocDisplay || "Not set",
        });
    }

    console.log("[PATCH /events/:id] plan-change diff:", JSON.stringify({
      changesCount: changes.length,
      changes,
      beforeStartsAt: before.starts_at,
      newStartsAt: startsAt.toISOString(),
      beforeMaxSeats: before.max_seats,
      newMaxSeats: maxSeats,
      beforeTitle: before.title,
      newTitle: rawTitle,
    }));

    // Host can opt out of attendee notifications for this edit
    const shouldNotify = body.notify_attendees !== false;
    if (shouldNotify) {
      c.executionCtx.waitUntil(
        notifyAttendeesPlanChanged(sql, c.env, eventId, userId, rawTitle, "updated", changes),
      );
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /events/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/cancel, cancel an event (host only) */
app.post("/events/:id/cancel", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  try {
    const ev = (await sql`SELECT id, host_user_id, title, starts_at FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; title: string; starts_at: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (ev[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN", message: "Only the host can cancel" }, 403);

    await sql`UPDATE newchums.events SET status = 'canceled', canceled_at = NOW(), cancellation_reason = 'host_canceled', updated_at = NOW() WHERE id = ${eventId}`;

    c.executionCtx.waitUntil(
      notifyAttendeesPlanChanged(sql, c.env, eventId, userId, ev[0].title, "canceled"),
    );

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/cancel]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/remove-attendee, host removes an attendee from a plan */
app.post("/events/:id/remove-attendee", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const targetUserId = body.user_id ? String(body.user_id) : null;
  const targetGuestEmail = body.guest_email ? String(body.guest_email).toLowerCase().trim() : null;
  if (!targetUserId && !targetGuestEmail)
    return c.json({ ok: false, error: "VALIDATION", message: "user_id or guest_email is required" }, 400);
  const reason = body.reason ? String(body.reason).trim().slice(0, 500) : null;

  try {
    const ev = (await sql`SELECT id, host_user_id, title, status, starts_at, timezone, location_type, location_name, location_address, online_link FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; title: string; status: string; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; online_link: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const event = ev[0];

    if (event.host_user_id !== userId)
      return c.json({ ok: false, error: "FORBIDDEN", message: "Only the host can remove attendees" }, 403);

    if (new Date(event.starts_at) < new Date())
      return c.json({ ok: false, error: "VALIDATION", message: "Attendees cannot be removed from past events" }, 400);

    if (targetUserId && targetUserId === userId)
      return c.json({ ok: false, error: "VALIDATION", message: "You cannot remove yourself from your own plan" }, 400);

    // Guest RSVP removal (email-only, no account)
    if (targetGuestEmail) {
      const rsvpRows = (await sql`SELECT id, status FROM newchums.event_rsvps WHERE event_id = ${eventId} AND guest_email = ${targetGuestEmail} AND user_id IS NULL`) as { id: string; status: string }[];
      if (rsvpRows.length === 0)
        return c.json({ ok: false, error: "NOT_FOUND", message: "This person is not an attendee of this plan" }, 404);

      await sql`DELETE FROM newchums.event_rsvps WHERE event_id = ${eventId} AND guest_email = ${targetGuestEmail} AND user_id IS NULL`;
      return c.json({ ok: true });
    }

    // Registered user RSVP removal
    const rsvpRows = (await sql`SELECT id, status FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${targetUserId}`) as { id: string; status: string }[];
    if (rsvpRows.length === 0)
      return c.json({ ok: false, error: "NOT_FOUND", message: "This person is not an attendee of this plan" }, 404);

    const statusAtRemoval = rsvpRows[0].status;

    await sql`DELETE FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${targetUserId}`;

    await sql`
      INSERT INTO newchums.host_attendee_removals (event_id, host_user_id, removed_user_id, status_at_removal, reason)
      VALUES (${eventId}, ${userId}, ${targetUserId}, ${statusAtRemoval}, ${reason})
    `;

    const removedUser = (await sql`SELECT email, name, username FROM newchums.users WHERE id = ${targetUserId}`) as { email: string; name: string | null; username: string | null }[];
    const hostUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];

    if (removedUser.length > 0) {
      try {
        const removedProfileRows = (await sql`SELECT notification_prefs FROM user_profile WHERE user_id = ${targetUserId} LIMIT 1`) as { notification_prefs: unknown }[];
        const removedPrefs = normalizeNotificationPrefs(removedProfileRows[0]?.notification_prefs);
        if (removedPrefs.items.attendee_removed?.enabled !== false) {
          const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, targetUserId, "attendee_removed");
          await sendAttendeeRemovedEmail(c.env, {
            to: removedUser[0].email,
            recipientName: removedUser[0].name?.trim() || removedUser[0].username?.replace(/^@/, "") || "there",
            hostName: hostUser[0]?.name?.trim() || hostUser[0]?.username?.replace(/^@/, "") || "the host",
            eventTitle: event.title,
            eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
            eventDate: formatEventDate(event.starts_at, event.timezone || "UTC"),
            eventLocation: event.location_type === "online" ? (event.online_link || "Online") : [event.location_name, event.location_address].filter(Boolean).join(", ") || "",
            removalReason: reason,
            unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
          });
        }
      } catch { /* noop */ }
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/remove-attendee]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/remove-invite, host revokes a pending invite.
 *  Accepts either user_id (registered-user invite) or email (email-only invite). */
app.post("/events/:id/remove-invite", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const targetUserId = body.user_id ? String(body.user_id) : null;
  const targetEmail = body.email ? String(body.email).trim().toLowerCase() : null;
  if (!targetUserId && !targetEmail)
    return c.json({ ok: false, error: "VALIDATION", message: "user_id or email is required" }, 400);
  const reason = body.reason ? String(body.reason).trim().slice(0, 500) : null;

  try {
    const ev = (await sql`SELECT id, host_user_id, title, starts_at, timezone, location_type, location_name, location_address, online_link FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; title: string; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; online_link: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const event = ev[0];

    if (event.host_user_id !== userId)
      return c.json({ ok: false, error: "FORBIDDEN", message: "Only the host can remove invites" }, 403);

    if (new Date(event.starts_at) < new Date())
      return c.json({ ok: false, error: "VALIDATION", message: "Invites cannot be removed from past events" }, 400);

    if (targetUserId && targetUserId === userId)
      return c.json({ ok: false, error: "VALIDATION", message: "You cannot remove yourself from your own plan" }, 400);

    // Look up the invite by user_id if available, otherwise by email
    const inviteRows = targetUserId
      ? (await sql`SELECT id, email FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${targetUserId}`) as { id: string; email: string | null }[]
      : (await sql`SELECT id, email FROM newchums.event_invites WHERE event_id = ${eventId} AND LOWER(email) = ${targetEmail} AND user_id IS NULL`) as { id: string; email: string | null }[];
    if (inviteRows.length === 0)
      return c.json({ ok: false, error: "NOT_FOUND", message: "No pending invite found for this person" }, 404);

    // Delete the invite
    if (targetUserId) {
      await sql`DELETE FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${targetUserId}`;
    } else {
      await sql`DELETE FROM newchums.event_invites WHERE event_id = ${eventId} AND LOWER(email) = ${targetEmail} AND user_id IS NULL`;
    }

    // Record the removal (only if the target has a user account)
    if (targetUserId) {
      await sql`
        INSERT INTO newchums.host_attendee_removals (event_id, host_user_id, removed_user_id, status_at_removal, reason)
        VALUES (${eventId}, ${userId}, ${targetUserId}, ${"invited"}, ${reason})
      `;
    }

    // Send notification email
    const hostUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
    const hostName = hostUser[0]?.name?.trim() || hostUser[0]?.username?.replace(/^@/, "") || "the host";
    const eventLocation = event.location_type === "online" ? (event.online_link || "Online") : [event.location_name, event.location_address].filter(Boolean).join(", ") || "";

    if (targetUserId) {
      // Registered user: look up their details and check notification prefs
      const removedUser = (await sql`SELECT email, name, username FROM newchums.users WHERE id = ${targetUserId}`) as { email: string; name: string | null; username: string | null }[];
      if (removedUser.length > 0) {
        try {
          const removedProfileRows = (await sql`SELECT notification_prefs FROM user_profile WHERE user_id = ${targetUserId} LIMIT 1`) as { notification_prefs: unknown }[];
          const removedPrefs = normalizeNotificationPrefs(removedProfileRows[0]?.notification_prefs);
          if (removedPrefs.items.attendee_removed?.enabled !== false) {
            const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, targetUserId, "attendee_removed");
            await sendAttendeeRemovedEmail(c.env, {
              to: removedUser[0].email,
              recipientName: removedUser[0].name?.trim() || removedUser[0].username?.replace(/^@/, "") || "there",
              hostName,
              eventTitle: event.title,
              eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
              eventDate: formatEventDate(event.starts_at, event.timezone || "UTC"),
              eventLocation,
              removalReason: reason,
              unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
            });
          }
        } catch { /* noop */ }
      }
    } else if (targetEmail) {
      // Email-only invite: send directly to that email address
      try {
        await sendAttendeeRemovedEmail(c.env, {
          to: targetEmail,
          recipientName: targetEmail.split("@")[0] || "there",
          hostName,
          eventTitle: event.title,
          eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
          eventDate: formatEventDate(event.starts_at, event.timezone || "UTC"),
          eventLocation,
          removalReason: reason,
        });
      } catch { /* noop */ }
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/remove-invite]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/invite, add invitees to a published event (host or Going attendees) */
app.post("/events/:id/invite", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  try {
    const ev = (await sql`SELECT id, host_user_id, title, starts_at, status, timezone, location_type, location_name, location_address, online_link, allow_attendee_invites, allow_alt_times, alt_times_mode, availability_deadline_at FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; title: string; starts_at: string; status: string; timezone: string; location_type: string; location_name: string | null; location_address: string | null; online_link: string | null; allow_attendee_invites: boolean; allow_alt_times: boolean; alt_times_mode: string | null; availability_deadline_at: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const isHost = ev[0].host_user_id === userId;
    if (!isHost) {
      if (!ev[0].allow_attendee_invites)
        return c.json({ ok: false, error: "FORBIDDEN", message: "The host has disabled attendee invitations for this plan" }, 403);
      const goingCheck = (await sql`SELECT 1 FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId} AND status = 'going' LIMIT 1`) as unknown[];
      if (goingCheck.length === 0)
        return c.json({ ok: false, error: "FORBIDDEN", message: "Only Going attendees can invite others to this plan" }, 403);
    }

    const inviteLocationDisplay = ev[0].location_type === "online"
      ? (ev[0].online_link || "Online")
      : buildLocationDisplay(ev[0].location_name, ev[0].location_address);

    const invitees = Array.isArray(body.invitees) ? (body.invitees as Array<{ user_id?: string; email?: string }>) : [];
    const customMessage = typeof body.message === "string" ? body.message.slice(0, 500).trim() : "";
    let added = 0;
    // Counts invitees we silently skipped because they were already invited
    // to this plan (matched by user_id or email, in either direction so we
    // don't double-invite when the request and the existing row reference
    // the same person via different identity columns). Surfaced in the
    // response so the client can toast "Already invited to this plan".
    let alreadyInvited = 0;

    const inviterUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
    const inviterName = inviterUser[0]?.name?.trim() || inviterUser[0]?.username?.replace(/^@/, "") || "Someone";

    let suggestTimeNote = "";
    if (ev[0].allow_alt_times && (ev[0].alt_times_mode ?? "suggest") === "availability") {
      const dlNote = ev[0].availability_deadline_at
        ? ` Please share your availability by ${formatEventDate(ev[0].availability_deadline_at, ev[0].timezone)}.`
        : "";
      suggestTimeNote = `${inviterName} would also like you to share your availability for this plan! Once you join, please let them know when you're free.${dlNote}`;
    }

    for (const inv of invitees.slice(0, 50)) {
      let invUserId = inv.user_id ? String(inv.user_id) : null;
      let invEmail = inv.email ? String(inv.email).trim().toLowerCase() : null;
      if (!invUserId && !invEmail) continue;

      // Self-invite guard
      if (invEmail && invEmail === payload.email.toLowerCase())
        return c.json({ ok: false, error: "SELF_INVITE", message: "You can't invite yourself" }, 400);
      if (invUserId && invUserId === userId)
        return c.json({ ok: false, error: "SELF_INVITE", message: "You can't invite yourself" }, 400);

      // Normalize identity: if the inviter passed an email and a user with
      // that email already has an account, resolve to user_id (and clear
      // email) so the row is stored against the canonical identity. This
      // makes the dedup checks below trivially correct and avoids creating
      // a stranded email-only row that would re-fire when the user signs
      // up later.
      if (!invUserId && invEmail) {
        const lookup = (await sql`SELECT id FROM newchums.users WHERE LOWER(email) = ${invEmail} LIMIT 1`) as { id: string }[];
        if (lookup.length > 0) {
          invUserId = lookup[0].id;
          invEmail = null;
          // Re-check self-invite after the resolution
          if (invUserId === userId)
            return c.json({ ok: false, error: "SELF_INVITE", message: "You can't invite yourself" }, 400);
        }
      }

      // Cross-key duplicate check before insert. The partial unique indexes
      // in migration 024 only catch dups within a single identity column;
      // they miss the case where the existing row uses one identity and the
      // new row uses the other (e.g. existing email-only row vs incoming
      // user_id row, or vice versa via a stale account). Look up by both
      // pathways here so the result is correct regardless of which column
      // either row uses.
      const existingRows = invUserId
        ? (await sql`
            SELECT 1 FROM newchums.event_invites
            WHERE event_id = ${eventId}
              AND (
                user_id = ${invUserId}
                OR EXISTS (
                  SELECT 1 FROM newchums.users u
                  WHERE u.id = ${invUserId}
                    AND LOWER(u.email) = LOWER(newchums.event_invites.email)
                )
              )
            LIMIT 1
          `) as unknown[]
        : (await sql`
            SELECT 1 FROM newchums.event_invites
            WHERE event_id = ${eventId}
              AND (
                LOWER(email) = ${invEmail}
                OR EXISTS (
                  SELECT 1 FROM newchums.users u
                  WHERE u.id = newchums.event_invites.user_id
                    AND LOWER(u.email) = ${invEmail}
                )
              )
            LIMIT 1
          `) as unknown[];

      if (existingRows.length > 0) {
        alreadyInvited++;
        continue;
      }

      const result = (await sql`
        INSERT INTO newchums.event_invites (event_id, user_id, email, invited_by)
        VALUES (${eventId}, ${invUserId}, ${invEmail}, ${userId})
        ON CONFLICT DO NOTHING
        RETURNING id
      `) as { id: string }[];

      if (result.length === 0) {
        // Lost a race with another request that just inserted the same
        // invite. Treat as already-invited so the caller still gets a
        // coherent response.
        alreadyInvited++;
        continue;
      }

      added++;
      if (ev[0].status === "published") {
        if (invUserId) {
          await sql`
            INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
            VALUES (${invUserId}, 'event_invite', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: ev[0].title })})
          `;
          const invProfileRows = (await sql`SELECT notification_prefs FROM user_profile WHERE user_id = ${invUserId} LIMIT 1`) as { notification_prefs: unknown }[];
          const invPrefs = normalizeNotificationPrefs(invProfileRows[0]?.notification_prefs);
          if (invPrefs.items.event_invite?.enabled !== false) {
            const invUser = (await sql`SELECT email, name FROM newchums.users WHERE id = ${invUserId}`) as { email: string; name: string | null }[];
            if (invUser.length > 0) {
              try {
                const iToken = await createInviteToken(c.env.NEXTAUTH_SECRET, { eventId, userId: invUserId });
                const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, invUserId, "event_invite");
                await sendEventInviteEmail(c.env, {
                  to: invUser[0].email,
                  recipientName: invUser[0].name?.trim() || "there",
                  hostName: inviterName,
                  eventTitle: ev[0].title,
                  eventDate: formatEventDate(ev[0].starts_at, ev[0].timezone),
                  eventLocation: inviteLocationDisplay,
                  eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
                  inviteToken: iToken,
                  unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
                  suggestTimeNote,
                  customMessage,
                });
              } catch { /* noop */ }
            }
          }
        } else if (invEmail) {
          try {
            const iToken = await createInviteToken(c.env.NEXTAUTH_SECRET, { eventId, email: invEmail });
            await sendEventInviteEmail(c.env, {
              to: invEmail,
              recipientName: "there",
              hostName: inviterName,
              eventTitle: ev[0].title,
              eventDate: formatEventDate(ev[0].starts_at, ev[0].timezone),
              eventLocation: inviteLocationDisplay,
              eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
              inviteToken: iToken,
              suggestTimeNote,
              customMessage,
            });
          } catch { /* noop */ }
        }
      }
    }

    return c.json({ ok: true, added, alreadyInvited });
  } catch (err) {
    console.error("[POST /events/:id/invite]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ---- Chat access helper ----
async function checkChatAccess(
  sql: ReturnType<typeof getSql>,
  eventId: string,
  userId: string,
): Promise<{ allowed: boolean; event?: Record<string, unknown>; reason?: string }> {
  const ev = (await sql`
    SELECT id, host_user_id, status, starts_at, is_qa FROM newchums.events WHERE id = ${eventId}
  `) as Array<Record<string, unknown>>;
  if (ev.length === 0) return { allowed: false, reason: "NOT_FOUND" };
  const event = ev[0];
  // QA plan isolation
  if (event.is_qa) {
    const isSuperAdmin = await checkIsSuperAdmin(sql, userId);
    if (!isSuperAdmin) return { allowed: false, reason: "NOT_FOUND" };
  }
  if (event.status === "canceled") return { allowed: false, event, reason: "EVENT_CANCELED" };
  if (event.host_user_id === userId) return { allowed: true, event };
  const rsvp = (await sql`
    SELECT status FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId}
  `) as { status: string }[];
  if (rsvp.length > 0 && rsvp[0].status === "going") return { allowed: true, event };
  return { allowed: false, event, reason: "NOT_PARTICIPANT" };
}

/** GET /events/:id/chat/ws, WebSocket upgrade for real-time plan chat */
app.get("/events/:id/chat/ws", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    return c.json({ ok: false, error: "EXPECTED_WEBSOCKET" }, 426);
  }

  const token = c.req.query("token");
  if (!token || !c.env.NEXTAUTH_SECRET) {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const payload = await verifyAuthToken(token, c.env.NEXTAUTH_SECRET);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  const access = await checkChatAccess(sql, eventId, userId);
  if (!access.allowed) {
    const status = access.reason === "NOT_FOUND" ? 404 : 403;
    return c.json({ ok: false, error: access.reason }, status);
  }

  const user = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
  const userName = user[0]?.name?.trim() || user[0]?.username?.replace(/^@/, "") || "Someone";

  const doId = c.env.CHAT_ROOM.idFromName(eventId);
  const doStub = c.env.CHAT_ROOM.get(doId);

  const doRequest = new Request(c.req.url, {
    headers: new Headers({
      "Upgrade": "websocket",
      "X-User-Id": userId,
      "X-User-Name": userName,
    }),
  });

  return doStub.fetch(doRequest);
});

/** GET /events/:id/chat, fetch chat messages for a plan */
app.get("/events/:id/chat", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  try {
    const access = await checkChatAccess(sql, eventId, userId);
    if (!access.allowed) {
      const status = access.reason === "NOT_FOUND" ? 404 : 403;
      return c.json({ ok: false, error: access.reason }, status);
    }

    const before = c.req.query("before"); // ISO timestamp cursor for older messages
    const limitParam = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 100);

    const messages = (await sql`
      SELECT m.id, m.body, m.created_at, m.user_id,
             u.name AS sender_name, u.username AS sender_username,
             u.avatar_key, u.avatar_updated_at
      FROM newchums.event_chat_messages m
      JOIN newchums.users u ON u.id = m.user_id
      WHERE m.event_id = ${eventId}
        ${before ? sql`AND m.created_at < ${before}` : sql``}
      ORDER BY m.created_at DESC
      LIMIT ${limitParam + 1}
    `) as Array<{
      id: string; body: string; created_at: string; user_id: string;
      sender_name: string | null; sender_username: string | null;
      avatar_key: string | null; avatar_updated_at: string | Date | null;
    }>;

    const hasMore = messages.length > limitParam;
    if (hasMore) messages.pop();
    messages.reverse(); // Return in chronological order

    const readRow = (await sql`
      SELECT last_read_at FROM newchums.event_chat_reads
      WHERE event_id = ${eventId} AND user_id = ${userId}
    `) as { last_read_at: string }[];

    return c.json({
      ok: true,
      messages: messages.map((m) => {
        const handle = m.sender_username?.replace(/^@/, "") ?? null;
        return {
          id: m.id,
          body: m.body,
          createdAt: m.created_at,
          senderId: m.user_id,
          senderName: m.sender_name?.trim() || (handle || "Someone"),
          senderHandle: handle ? `@${handle}` : null,
          avatarUrl: buildAvatarUrl(m.user_id, m.avatar_key, m.avatar_updated_at, c.env.MEDIA_BUCKET),
        };
      }),
      hasMore,
      oldestCursor: messages.length > 0 ? messages[0].created_at : null,
      lastReadAt: readRow.length > 0 ? readRow[0].last_read_at : null,
    });
  } catch (err) {
    console.error("[GET /events/:id/chat]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/chat, send a chat message */
app.post("/events/:id/chat", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const messageBody = typeof body.body === "string" ? body.body.trim() : "";
  if (messageBody.length === 0) return c.json({ ok: false, error: "VALIDATION", message: "Message cannot be empty" }, 400);
  if (messageBody.length > 2000) return c.json({ ok: false, error: "VALIDATION", message: "Message is too long (max 2000 characters)" }, 400);

  try {
    const access = await checkChatAccess(sql, eventId, userId);
    if (!access.allowed) {
      const status = access.reason === "NOT_FOUND" ? 404 : 403;
      return c.json({ ok: false, error: access.reason }, status);
    }

    // Reject messages if the plan's chat lock window (3 days after event start) has passed
    if (access.event) {
      const startsAt = access.event.starts_at as string | null;
      if (startsAt) {
        const lockAt = new Date(startsAt).getTime() + 3 * 24 * 60 * 60 * 1000;
        if (Date.now() >= lockAt) {
          return c.json({ ok: false, error: "CHAT_LOCKED", message: "Chat is locked for this plan" }, 403);
        }
      }
    }

    const inserted = (await sql`
      INSERT INTO newchums.event_chat_messages (event_id, user_id, body)
      VALUES (${eventId}, ${userId}, ${messageBody})
      RETURNING id, created_at
    `) as { id: string; created_at: string }[];

    const user = (await sql`SELECT name, username, avatar_key, avatar_updated_at FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | Date | null }[];
    const handle = user[0]?.username?.replace(/^@/, "") ?? null;
    const avatarUrl = buildAvatarUrl(userId, user[0]?.avatar_key ?? null, user[0]?.avatar_updated_at ?? null, c.env.MEDIA_BUCKET);

    const chatMessage = {
      id: inserted[0].id,
      body: messageBody,
      createdAt: inserted[0].created_at,
      senderId: userId,
      senderName: user[0]?.name?.trim() || (handle || "Someone"),
      senderHandle: handle ? `@${handle}` : null,
      avatarUrl,
    };

    try {
      const doId = c.env.CHAT_ROOM.idFromName(eventId);
      const doStub = c.env.CHAT_ROOM.get(doId);
      c.executionCtx.waitUntil(
        doStub.fetch(new Request("https://do/broadcast", {
          method: "POST",
          body: JSON.stringify(chatMessage),
        }))
      );
    } catch { /* DO broadcast failure should not fail the API response */ }

    return c.json({ ok: true, message: chatMessage });
  } catch (err) {
    console.error("[POST /events/:id/chat]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/chat/read, mark chat as read */
app.post("/events/:id/chat/read", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  try {
    const access = await checkChatAccess(sql, eventId, userId);
    if (!access.allowed) {
      const status = access.reason === "NOT_FOUND" ? 404 : 403;
      return c.json({ ok: false, error: access.reason }, status);
    }

    await sql`
      INSERT INTO newchums.event_chat_reads (event_id, user_id, last_read_at)
      VALUES (${eventId}, ${userId}, NOW())
      ON CONFLICT (event_id, user_id) DO UPDATE SET last_read_at = NOW()
    `;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/chat/read]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/lock, toggle plan lock (host only) */
app.post("/events/:id/lock", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  try {
    const ev = (await sql`SELECT id, host_user_id, locked_at FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; locked_at: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (ev[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN", message: "Only the host can lock or unlock a plan" }, 403);

    const isCurrentlyLocked = ev[0].locked_at !== null;
    if (isCurrentlyLocked) {
      await sql`UPDATE newchums.events SET locked_at = NULL WHERE id = ${eventId}`;
    } else {
      await sql`UPDATE newchums.events SET locked_at = NOW() WHERE id = ${eventId}`;
    }

    const nowLocked = !isCurrentlyLocked;

    if (nowLocked) {
      const evDetails = (await sql`SELECT title FROM newchums.events WHERE id = ${eventId} LIMIT 1`) as { title: string }[];
      if (evDetails[0]) {
        c.executionCtx.waitUntil(
          notifyAttendeesPlanChanged(sql, c.env, eventId, userId, evDetails[0].title, "locked"),
        );
      }
    }

    return c.json({ ok: true, locked: nowLocked });
  } catch (err) {
    console.error("[POST /events/:id/lock]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/reserve-seats, toggle reserve seats for invites (host only) */
app.post("/events/:id/reserve-seats", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  try {
    const ev = (await sql`SELECT id, host_user_id, reserve_seats FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; reserve_seats: boolean }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (ev[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN", message: "Only the host can change this setting" }, 403);

    const newValue = !ev[0].reserve_seats;
    await sql`UPDATE newchums.events SET reserve_seats = ${newValue} WHERE id = ${eventId}`;

    return c.json({ ok: true, reserveSeats: newValue });
  } catch (err) {
    console.error("[POST /events/:id/reserve-seats]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/toggle-attendee-invites, host toggles whether Going attendees can invite */
app.post("/events/:id/toggle-attendee-invites", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  try {
    const ev = (await sql`SELECT id, host_user_id, allow_attendee_invites FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; allow_attendee_invites: boolean }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (ev[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN", message: "Only the host can change this setting" }, 403);

    const newValue = !ev[0].allow_attendee_invites;
    await sql`UPDATE newchums.events SET allow_attendee_invites = ${newValue} WHERE id = ${eventId}`;

    return c.json({ ok: true, allowAttendeeInvites: newValue });
  } catch (err) {
    console.error("[POST /events/:id/toggle-attendee-invites]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ── Join request endpoints ──────────────────────────────────────────────

/** POST /events/:id/join-request, submit a request to join a plan */
app.post("/events/:id/join-request", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const message = body.message ? String(body.message).trim().slice(0, 500) : null;

  try {
    const ev = (await sql`
      SELECT id, host_user_id, title, status, require_approval, locked_at, max_seats, starts_at, timezone, location_type, location_name, location_address, online_link
      FROM newchums.events WHERE id = ${eventId}
    `) as { id: string; host_user_id: string; title: string; status: string; require_approval: boolean; locked_at: string | null; max_seats: number | null; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; online_link: string | null }[];
    if (ev.length === 0 || ev[0].status !== "published")
      return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const event = ev[0];

    if (event.host_user_id === userId)
      return c.json({ ok: false, error: "VALIDATION", message: "Hosts cannot request to join their own plan" }, 400);
    if (!event.require_approval)
      return c.json({ ok: false, error: "VALIDATION", message: "This plan does not require approval to join" }, 400);
    if (event.locked_at)
      return c.json({ ok: false, error: "EVENT_LOCKED", message: "This plan is locked and not accepting new participants" }, 403);

    // Already invited → skip request flow
    const invited = (await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId} LIMIT 1`) as unknown[];
    if (invited.length > 0)
      return c.json({ ok: false, error: "ALREADY_INVITED", message: "You are already invited to this plan" }, 400);

    // Already RSVP'd
    const rsvp = (await sql`SELECT 1 FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId} LIMIT 1`) as unknown[];
    if (rsvp.length > 0)
      return c.json({ ok: false, error: "ALREADY_RSVPD", message: "You have already responded to this plan" }, 400);

    // Check for existing pending request (unique partial index prevents duplicates)
    try {
      await sql`
        INSERT INTO newchums.event_join_requests (event_id, user_id, message)
        VALUES (${eventId}, ${userId}, ${message})
      `;
    } catch (insertErr) {
      const errMsg = insertErr instanceof Error ? insertErr.message : String(insertErr);
      if (errMsg.includes("idx_event_join_requests_user_event") || errMsg.includes("duplicate")) {
        return c.json({ ok: false, error: "DUPLICATE_REQUEST", message: "You already have a pending request for this plan" }, 409);
      }
      throw insertErr;
    }

    // Notify host (in-app)
    const requesterUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
    const requesterName = requesterUser[0]?.name?.trim() || requesterUser[0]?.username?.replace(/^@/, "") || "Someone";

    await sql`
      INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
      VALUES (${event.host_user_id}, 'join_request', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: event.title, requesterName })})
    `;

    // Email host
    const hostUser = (await sql`SELECT email, name, username FROM newchums.users WHERE id = ${event.host_user_id}`) as { email: string; name: string | null; username: string | null }[];
    if (hostUser.length > 0) {
      const hostProfileRows = (await sql`SELECT notification_prefs FROM user_profile WHERE user_id = ${event.host_user_id} LIMIT 1`) as { notification_prefs: unknown }[];
      const hostPrefs = normalizeNotificationPrefs(hostProfileRows[0]?.notification_prefs);
      if (hostPrefs.items.join_request_received?.enabled !== false) {
        const hostName = hostUser[0].name?.trim() || hostUser[0].username?.replace(/^@/, "") || "there";
        const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, event.host_user_id, "join_request_received");
        c.executionCtx.waitUntil(
          sendJoinRequestEmail(c.env, {
            to: hostUser[0].email,
            hostName,
            requesterName,
            eventTitle: event.title,
            requestMessage: message || "",
            eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}?context=host_review`,
            eventDate: formatEventDate(event.starts_at, event.timezone || "UTC"),
            eventLocation: event.location_type === "online" ? (event.online_link || "Online") : [event.location_name, event.location_address].filter(Boolean).join(", ") || "",
            unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
          }).catch(() => {})
        );
      }
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/join-request]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/join-request/:requestId/approve, approve a join request (host only) */
app.post("/events/:id/join-request/:requestId/approve", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");
  const requestId = c.req.param("requestId");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }
  const hostMessage = body.message ? String(body.message).trim().slice(0, 500) : null;

  try {
    const ev = (await sql`
      SELECT id, host_user_id, title, max_seats, starts_at, timezone, location_type, location_name, location_address, online_link FROM newchums.events WHERE id = ${eventId} AND status = 'published'
    `) as { id: string; host_user_id: string; title: string; max_seats: number | null; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; online_link: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (ev[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

    const req = (await sql`
      SELECT id, user_id, status FROM newchums.event_join_requests WHERE id = ${requestId} AND event_id = ${eventId}
    `) as { id: string; user_id: string; status: string }[];
    if (req.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (req[0].status === "withdrawn")
      return c.json({ ok: false, error: "REQUEST_WITHDRAWN", message: "This request was withdrawn by the requester" }, 400);
    if (req[0].status !== "pending")
      return c.json({ ok: false, error: "ALREADY_DECIDED", message: `This request has already been ${req[0].status}` }, 400);

    // Check seat capacity before approving
    if (ev[0].max_seats) {
      const goingCount = (await sql`SELECT COUNT(*)::int AS c FROM newchums.event_rsvps WHERE event_id = ${eventId} AND status = 'going'`) as { c: number }[];
      if (goingCount[0].c >= ev[0].max_seats)
        return c.json({ ok: false, error: "EVENT_FULL", message: "This plan is full. Cannot approve more participants." }, 409);
    }

    // Mark approved
    await sql`
      UPDATE newchums.event_join_requests
      SET status = 'approved', host_message = ${hostMessage}, decided_at = NOW()
      WHERE id = ${requestId}
    `;

    // Add as Going
    await sql`
      INSERT INTO newchums.event_rsvps (event_id, user_id, status, committed_at)
      VALUES (${eventId}, ${req[0].user_id}, 'going', NOW())
      ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'going', updated_at = NOW(),
        committed_at = COALESCE(newchums.event_rsvps.committed_at, NOW())
    `;

    // Notify requester (in-app)
    await sql`
      INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
      VALUES (${req[0].user_id}, 'join_request_approved', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: ev[0].title })})
    `;

    // Email requester
    const requesterUser = (await sql`SELECT email, name, username FROM newchums.users WHERE id = ${req[0].user_id}`) as { email: string; name: string | null; username: string | null }[];
    const hostUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
    const hostName = hostUser[0]?.name?.trim() || hostUser[0]?.username?.replace(/^@/, "") || "the host";

    if (requesterUser.length > 0) {
      const requesterProfileRows = (await sql`SELECT notification_prefs FROM user_profile WHERE user_id = ${req[0].user_id} LIMIT 1`) as { notification_prefs: unknown }[];
      const requesterPrefs = normalizeNotificationPrefs(requesterProfileRows[0]?.notification_prefs);
      if (requesterPrefs.items.join_request_accepted?.enabled !== false) {
        const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, req[0].user_id, "join_request_accepted");
        c.executionCtx.waitUntil(
          sendJoinRequestApprovedEmail(c.env, {
            to: requesterUser[0].email,
            recipientName: requesterUser[0].name?.trim() || requesterUser[0].username?.replace(/^@/, "") || "there",
            hostName,
            eventTitle: ev[0].title,
            hostMessage,
            eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}?context=request_approved`,
            eventDate: formatEventDate(ev[0].starts_at, ev[0].timezone || "UTC"),
            eventLocation: ev[0].location_type === "online" ? (ev[0].online_link || "Online") : [ev[0].location_name, ev[0].location_address].filter(Boolean).join(", ") || "",
            unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
          }).catch(() => {})
        );
      }
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/join-request/:requestId/approve]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/join-request/:requestId/decline, decline a join request (host only) */
app.post("/events/:id/join-request/:requestId/decline", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");
  const requestId = c.req.param("requestId");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }
  const hostMessage = body.message ? String(body.message).trim().slice(0, 500) : null;

  try {
    const ev = (await sql`
      SELECT id, host_user_id, title, starts_at, timezone, location_type, location_name, location_address, online_link FROM newchums.events WHERE id = ${eventId} AND status = 'published'
    `) as { id: string; host_user_id: string; title: string; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; online_link: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (ev[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

    const req = (await sql`
      SELECT id, user_id, status FROM newchums.event_join_requests WHERE id = ${requestId} AND event_id = ${eventId}
    `) as { id: string; user_id: string; status: string }[];
    if (req.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (req[0].status === "withdrawn")
      return c.json({ ok: false, error: "REQUEST_WITHDRAWN", message: "This request was withdrawn by the requester" }, 400);
    if (req[0].status !== "pending")
      return c.json({ ok: false, error: "ALREADY_DECIDED", message: `This request has already been ${req[0].status}` }, 400);

    // Mark declined
    await sql`
      UPDATE newchums.event_join_requests
      SET status = 'declined', host_message = ${hostMessage}, decided_at = NOW()
      WHERE id = ${requestId}
    `;

    // Notify requester (in-app)
    await sql`
      INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
      VALUES (${req[0].user_id}, 'join_request_declined', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: ev[0].title })})
    `;

    // Email requester
    const requesterUser = (await sql`SELECT email, name, username FROM newchums.users WHERE id = ${req[0].user_id}`) as { email: string; name: string | null; username: string | null }[];
    const hostUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
    const hostName = hostUser[0]?.name?.trim() || hostUser[0]?.username?.replace(/^@/, "") || "the host";

    if (requesterUser.length > 0) {
      const requesterProfileRows = (await sql`SELECT notification_prefs FROM user_profile WHERE user_id = ${req[0].user_id} LIMIT 1`) as { notification_prefs: unknown }[];
      const requesterPrefs = normalizeNotificationPrefs(requesterProfileRows[0]?.notification_prefs);
      if (requesterPrefs.items.join_request_declined?.enabled !== false) {
        const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, req[0].user_id, "join_request_declined");
        c.executionCtx.waitUntil(
          sendJoinRequestDeclinedEmail(c.env, {
            to: requesterUser[0].email,
            recipientName: requesterUser[0].name?.trim() || requesterUser[0].username?.replace(/^@/, "") || "there",
            hostName,
            eventTitle: ev[0].title,
            hostMessage,
            eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
            eventDate: formatEventDate(ev[0].starts_at, ev[0].timezone || "UTC"),
            eventLocation: ev[0].location_type === "online" ? (ev[0].online_link || "Online") : [ev[0].location_name, ev[0].location_address].filter(Boolean).join(", ") || "",
            unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
          }).catch(() => {})
        );
      }
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/join-request/:requestId/decline]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/join-request/:requestId/withdraw, withdraw own pending join request */
app.post("/events/:id/join-request/:requestId/withdraw", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");
  const requestId = c.req.param("requestId");

  try {
    const req = (await sql`
      SELECT id, user_id, status FROM newchums.event_join_requests WHERE id = ${requestId} AND event_id = ${eventId}
    `) as { id: string; user_id: string; status: string }[];
    if (req.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (req[0].user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
    if (req[0].status !== "pending")
      return c.json({ ok: false, error: "NOT_PENDING", message: "Only pending requests can be withdrawn" }, 400);

    await sql`
      UPDATE newchums.event_join_requests
      SET status = 'withdrawn', decided_at = NOW()
      WHERE id = ${requestId}
    `;

    // Notify host (in-app only, no email to avoid noise)
    const ev = (await sql`
      SELECT host_user_id, title FROM newchums.events WHERE id = ${eventId}
    `) as { host_user_id: string; title: string }[];
    if (ev.length > 0) {
      const requesterUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
      const requesterName = requesterUser[0]?.name?.trim() || requesterUser[0]?.username?.replace(/^@/, "") || "Someone";
      await sql`
        INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
        VALUES (${ev[0].host_user_id}, 'join_request_withdrawn', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: ev[0].title, requesterName })})
      `;
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/join-request/:requestId/withdraw]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Plan Feedback ────────────────────────────────────────────────────────────

const FEEDBACK_PROMPTS = ["reliability", "sociability", "presentation", "match_quality", "hosting_skills"] as const;
const FEEDBACK_RESPONSES = ["agree", "maybe", "disagree"] as const;
const ATTENDANCE_ISSUE_TYPES = ["no_show", "late_cancel", "very_late"] as const;
const CONDUCT_REASONS = ["rude_aggressive", "harassment", "boundary_issue", "discriminatory", "unsafe_intoxicated", "disruptive", "property_damage", "other"] as const;
const SHOUTOUT_MAX_LENGTH = 280;

const FEEDBACK_RESPONSE_TARGETS: Record<string, number> = { agree: 80, maybe: 50, disagree: 20 };
const ATTENDANCE_PENALTIES: Record<string, number> = { no_show: -10, late_cancel: -5, very_late: -8 };

async function nudgeUserMetric(sql: ReturnType<typeof getSql>, userId: string, metric: string, response: string) {
  const target = FEEDBACK_RESPONSE_TARGETS[response];
  if (target === undefined) return;

  const rows = (await sql`
    SELECT score, signal_count FROM newchums.user_metrics
    WHERE user_id = ${userId} AND metric = ${metric}
  `) as { score: string; signal_count: number }[];

  let currentScore = METRIC_BASELINE;
  let signalCount = 0;
  if (rows.length > 0) {
    currentScore = parseFloat(rows[0].score);
    signalCount = rows[0].signal_count;
  }

  const nudge = (target - currentScore) / (signalCount + 5);
  const newScore = Math.max(0, Math.min(100, currentScore + nudge));
  const newSignalCount = signalCount + 1;

  await sql`
    INSERT INTO newchums.user_metrics (user_id, metric, score, signal_count, updated_at)
    VALUES (${userId}, ${metric}, ${newScore.toFixed(2)}, ${newSignalCount}, NOW())
    ON CONFLICT (user_id, metric) DO UPDATE SET
      score = ${newScore.toFixed(2)},
      signal_count = ${newSignalCount},
      updated_at = NOW()
  `;
}

async function penalizeReliability(
  sql: ReturnType<typeof getSql>,
  userId: string,
  issueType: string,
  confidence: number,
): Promise<number> {
  const rawPenalty = ATTENDANCE_PENALTIES[issueType];
  if (rawPenalty === undefined) return 0;
  const effectivePenalty = rawPenalty * confidence;

  const rows = (await sql`
    SELECT score, signal_count FROM newchums.user_metrics
    WHERE user_id = ${userId} AND metric = 'reliability'
  `) as { score: string; signal_count: number }[];

  let currentScore = METRIC_BASELINE;
  let signalCount = 0;
  if (rows.length > 0) {
    currentScore = parseFloat(rows[0].score);
    signalCount = rows[0].signal_count;
  }

  const newScore = Math.max(0, Math.min(100, currentScore + effectivePenalty));
  const newSignalCount = signalCount + 1;

  await sql`
    INSERT INTO newchums.user_metrics (user_id, metric, score, signal_count, updated_at)
    VALUES (${userId}, 'reliability', ${newScore.toFixed(2)}, ${newSignalCount}, NOW())
    ON CONFLICT (user_id, metric) DO UPDATE SET
      score = ${newScore.toFixed(2)},
      signal_count = ${newSignalCount},
      updated_at = NOW()
  `;
  return effectivePenalty;
}

async function adjustReliabilityPenalty(
  sql: ReturnType<typeof getSql>,
  issueId: string,
  newConfidence: number,
  newStatus: string,
) {
  const issueRows = (await sql`
    SELECT id, reported_user_id, issue_type, confidence, applied_penalty, status
    FROM newchums.attendance_issues WHERE id = ${issueId}
  `) as { id: string; reported_user_id: string; issue_type: string; confidence: string; applied_penalty: string; status: string }[];
  if (issueRows.length === 0) return;
  const issue = issueRows[0];

  const rawPenalty = ATTENDANCE_PENALTIES[issue.issue_type] ?? 0;
  const oldApplied = parseFloat(issue.applied_penalty);
  const newApplied = rawPenalty * newConfidence;
  const diff = newApplied - oldApplied;

  if (Math.abs(diff) > 0.001) {
    const metricRows = (await sql`
      SELECT score FROM newchums.user_metrics
      WHERE user_id = ${issue.reported_user_id} AND metric = 'reliability'
    `) as { score: string }[];
    const currentScore = metricRows.length > 0 ? parseFloat(metricRows[0].score) : METRIC_BASELINE;
    const adjusted = Math.max(0, Math.min(100, currentScore + diff));
    await sql`
      UPDATE newchums.user_metrics SET score = ${adjusted.toFixed(2)}, updated_at = NOW()
      WHERE user_id = ${issue.reported_user_id} AND metric = 'reliability'
    `;
  }

  await sql`
    UPDATE newchums.attendance_issues
    SET confidence = ${newConfidence.toFixed(2)}, applied_penalty = ${newApplied.toFixed(2)}, status = ${newStatus}
    WHERE id = ${issueId}
  `;
}

/** GET /events/:id/feedback, existing feedback by this user for this plan + eligible attendees */
app.get("/events/:id/feedback", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  // Check dismissal early, if the table doesn't exist yet, silently skip
  try {
    const dismissedRows = await sql`
      SELECT 1 FROM newchums.plan_feedback_dismissals
      WHERE plan_id = ${eventId} AND user_id = ${userId} LIMIT 1
    `;
    if (dismissedRows.length > 0) return c.json({ ok: true, dismissed: true, attendees: [], feedback: [], attendanceIssues: [], issuesAgainstMe: [] });
  } catch { /* table may not exist yet */ }

  try {
    const ev = (await sql`
      SELECT host_user_id, starts_at, status FROM newchums.events WHERE id = ${eventId}
    `) as { host_user_id: string; starts_at: string; status: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (new Date(ev[0].starts_at) > new Date())
      return c.json({ ok: false, error: "NOT_PAST" }, 400);

    const isHost = ev[0].host_user_id === userId;
    const hasRsvp = (await sql`
      SELECT 1 FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId} LIMIT 1
    `).length > 0;
    if (!isHost && !hasRsvp)
      return c.json({ ok: false, error: "NOT_PARTICIPANT" }, 403);

    const attendees = (await sql`
      SELECT u.id, u.name, u.username
      FROM newchums.event_rsvps er
      JOIN newchums.users u ON u.id = er.user_id
      WHERE er.event_id = ${eventId} AND er.status IN ('going', 'maybe')
      UNION
      SELECT u.id, u.name, u.username
      FROM newchums.events e
      JOIN newchums.users u ON u.id = e.host_user_id
      WHERE e.id = ${eventId}
    `) as { id: string; name: string | null; username: string | null }[];

    const otherAttendees = attendees
      .filter((a) => a.id !== userId)
      .map((a) => ({
        userId: a.id,
        displayName: a.username ? `@${a.username.replace(/^@/, "")}` : (a.name?.trim() || "Someone"),
        username: a.username ?? null,
        isHost: a.id === ev[0].host_user_id,
      }));

    const existing = (await sql`
      SELECT reviewee_user_id, prompt, response
      FROM newchums.plan_feedback
      WHERE plan_id = ${eventId} AND reviewer_user_id = ${userId}
    `) as { reviewee_user_id: string; prompt: string; response: string }[];

    const existingIssues = (await sql`
      SELECT reported_user_id, issue_type
      FROM newchums.attendance_issues
      WHERE plan_id = ${eventId} AND reporter_user_id = ${userId}
    `) as { reported_user_id: string; issue_type: string }[];

    const issuesAgainstMe = (await sql`
      SELECT id, issue_type, status
      FROM newchums.attendance_issues
      WHERE plan_id = ${eventId} AND reported_user_id = ${userId}
    `) as { id: string; issue_type: string; status: string }[];

    // Hydrate the per-attendee shout-out drafts the viewer has authored on
    // this plan so the form can show "Awaiting review" / "Sent" / "Not approved"
    // pills and pre-fill any pending message text.
    const existingShoutouts = (await sql`
      SELECT recipient_user_id, message, status
      FROM newchums.shoutouts
      WHERE plan_id = ${eventId} AND sender_user_id = ${userId}
    `) as { recipient_user_id: string; message: string; status: string }[];

    return c.json({
      ok: true,
      attendees: otherAttendees,
      feedback: existing,
      attendanceIssues: existingIssues,
      issuesAgainstMe: issuesAgainstMe.map((i) => ({
        id: i.id,
        issueType: i.issue_type,
        status: i.status,
      })),
      shoutouts: existingShoutouts.map((s) => ({
        recipientUserId: s.recipient_user_id,
        message: s.message,
        status: s.status,
      })),
    });
  } catch (err) {
    console.error("[GET /events/:id/feedback]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/feedback, submit feedback for attendees */
app.post("/events/:id/feedback", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  const body = await c.req.json<{
    entries: Array<{
      revieweeUserId: string;
      prompt: string;
      response: string;
    }>;
  }>();

  if (!Array.isArray(body.entries) || body.entries.length === 0)
    return c.json({ ok: false, error: "EMPTY_ENTRIES" }, 400);

  for (const entry of body.entries) {
    if (!FEEDBACK_PROMPTS.includes(entry.prompt as typeof FEEDBACK_PROMPTS[number]))
      return c.json({ ok: false, error: "INVALID_PROMPT", prompt: entry.prompt }, 400);
    if (!FEEDBACK_RESPONSES.includes(entry.response as typeof FEEDBACK_RESPONSES[number]))
      return c.json({ ok: false, error: "INVALID_RESPONSE", response: entry.response }, 400);
    if (entry.revieweeUserId === userId)
      return c.json({ ok: false, error: "CANNOT_RATE_SELF" }, 400);
  }

  try {
    const ev = (await sql`
      SELECT host_user_id, starts_at FROM newchums.events WHERE id = ${eventId}
    `) as { host_user_id: string; starts_at: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (new Date(ev[0].starts_at) > new Date())
      return c.json({ ok: false, error: "NOT_PAST" }, 400);

    for (const entry of body.entries) {
      if (entry.prompt === "hosting_skills" && entry.revieweeUserId !== ev[0].host_user_id)
        return c.json({ ok: false, error: "HOSTING_SKILLS_HOST_ONLY" }, 400);

      await sql`
        INSERT INTO newchums.plan_feedback (plan_id, reviewer_user_id, reviewee_user_id, prompt, response)
        VALUES (${eventId}, ${userId}, ${entry.revieweeUserId}, ${entry.prompt}, ${entry.response})
        ON CONFLICT (plan_id, reviewer_user_id, reviewee_user_id, prompt)
        DO UPDATE SET response = EXCLUDED.response, created_at = NOW()
      `;

      await nudgeUserMetric(sql, entry.revieweeUserId, entry.prompt, entry.response);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/feedback]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/feedback/dismiss, permanently dismiss the feedback prompt for this plan */
app.post("/events/:id/feedback/dismiss", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  try {
    await sql`
      INSERT INTO newchums.plan_feedback_dismissals (plan_id, user_id)
      VALUES (${eventId}, ${userId})
      ON CONFLICT DO NOTHING
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/feedback/dismiss]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/attendance-issue, report an attendance issue */
app.post("/events/:id/attendance-issue", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  const body = await c.req.json<{
    reportedUserId: string;
    issueType: string;
  }>();

  if (!ATTENDANCE_ISSUE_TYPES.includes(body.issueType as typeof ATTENDANCE_ISSUE_TYPES[number]))
    return c.json({ ok: false, error: "INVALID_ISSUE_TYPE" }, 400);
  if (body.reportedUserId === userId)
    return c.json({ ok: false, error: "CANNOT_REPORT_SELF" }, 400);

  try {
    const ev = (await sql`
      SELECT starts_at, host_user_id FROM newchums.events WHERE id = ${eventId}
    `) as { starts_at: string; host_user_id: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (new Date(ev[0].starts_at) > new Date())
      return c.json({ ok: false, error: "NOT_PAST" }, 400);

    const isHostReport = ev[0].host_user_id === userId;

    // Check for corroboration: other reporters for the same person + issue type on this plan
    const priorReports = (await sql`
      SELECT id, confidence FROM newchums.attendance_issues
      WHERE plan_id = ${eventId} AND reported_user_id = ${body.reportedUserId}
        AND issue_type = ${body.issueType} AND reporter_user_id != ${userId}
        AND status != 'dismissed'
    `) as { id: string; confidence: string }[];
    const corroborated = priorReports.length > 0;

    const confidence = isHostReport ? 1.0 : (corroborated ? 1.0 : 0.75);

    const inserted = (await sql`
      INSERT INTO newchums.attendance_issues (plan_id, reporter_user_id, reported_user_id, issue_type, is_host_report, confidence, status)
      VALUES (${eventId}, ${userId}, ${body.reportedUserId}, ${body.issueType}, ${isHostReport}, ${confidence.toFixed(2)}, 'active')
      ON CONFLICT (plan_id, reporter_user_id, reported_user_id, issue_type) DO NOTHING
      RETURNING id
    `) as { id: string }[];

    if (inserted.length > 0) {
      const appliedPenalty = await penalizeReliability(sql, body.reportedUserId, body.issueType, confidence);
      await sql`
        UPDATE newchums.attendance_issues SET applied_penalty = ${appliedPenalty.toFixed(2)}
        WHERE id = ${inserted[0].id}
      `;

      // Corroboration: boost prior uncorroborated non-host reports to full confidence
      if (corroborated) {
        for (const prior of priorReports) {
          if (parseFloat(prior.confidence) < 1.0) {
            await adjustReliabilityPenalty(sql, prior.id, 1.0, "active");
          }
        }
      }
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/attendance-issue]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/attendance-dispute, user disputes attendance issues on this plan */
app.post("/events/:id/attendance-dispute", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  try {
    const issues = (await sql`
      SELECT id, status FROM newchums.attendance_issues
      WHERE plan_id = ${eventId} AND reported_user_id = ${userId}
        AND status IN ('active')
    `) as { id: string; status: string }[];

    if (issues.length === 0)
      return c.json({ ok: false, error: "NO_ACTIVE_ISSUES" }, 404);

    for (const issue of issues) {
      await adjustReliabilityPenalty(sql, issue.id, 0.5, "disputed");
    }

    return c.json({ ok: true, disputedCount: issues.length });
  } catch (err) {
    console.error("[POST /events/:id/attendance-dispute]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

const CONDUCT_REASON_LABELS: Record<string, string> = {
  rude_aggressive: "Rude or aggressive behavior",
  harassment: "Harassment or inappropriate comments",
  boundary_issue: "Boundary issue",
  discriminatory: "Discriminatory behavior",
  unsafe_intoxicated: "Unsafe or intoxicated behavior",
  disruptive: "Disruptive behavior",
  property_damage: "Damage to property/items",
  other: "Other",
};

/** POST /events/:id/conduct-report, report a conduct / safety concern */
app.post("/events/:id/conduct-report", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  const body = await c.req.json<{
    reportedUserId: string;
    reason: string;
    details?: string;
  }>();

  if (!CONDUCT_REASONS.includes(body.reason as typeof CONDUCT_REASONS[number]))
    return c.json({ ok: false, error: "INVALID_REASON" }, 400);
  if (body.reportedUserId === userId)
    return c.json({ ok: false, error: "CANNOT_REPORT_SELF" }, 400);

  try {
    const ev = (await sql`
      SELECT starts_at, title FROM newchums.events WHERE id = ${eventId}
    `) as { starts_at: string; title: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const inserted = (await sql`
      INSERT INTO newchums.conduct_reports (plan_id, reporter_user_id, reported_user_id, reason, details)
      VALUES (${eventId}, ${userId}, ${body.reportedUserId}, ${body.reason}, ${body.details ?? null})
      RETURNING id, created_at
    `) as { id: string; created_at: string }[];

    // Send admin alert email (fire-and-forget, do not block the response)
    try {
      const [reporterRows, reportedRows] = await Promise.all([
        sql`SELECT name, email, username FROM newchums.users WHERE id = ${userId} LIMIT 1` as Promise<{ name: string | null; email: string; username: string | null }[]>,
        sql`SELECT name, email, username FROM newchums.users WHERE id = ${body.reportedUserId} LIMIT 1` as Promise<{ name: string | null; email: string; username: string | null }[]>,
      ]);
      const reporter = reporterRows[0];
      const reported = reportedRows[0];
      const reportId = inserted[0]?.id ?? "";
      const baseUrl = c.env.WEB_BASE_URL || "https://newchums.com";

      await sendConcernReportAlert(c.env, {
        reporterName: reporter?.name?.trim() || reporter?.username || reporter?.email || "Unknown",
        reporterEmail: reporter?.email || "unknown",
        reportedName: reported?.name?.trim() || reported?.username || reported?.email || "Unknown",
        reportedEmail: reported?.email || "unknown",
        planTitle: ev[0].title || "Untitled plan",
        concernReason: CONDUCT_REASON_LABELS[body.reason] ?? body.reason,
        details: body.details?.trim() || "(none provided)",
        submittedAt: inserted[0]?.created_at ? new Date(inserted[0].created_at).toUTCString() : new Date().toUTCString(),
        reportUrl: `${baseUrl}/admin/safety`,
        reporterProfileUrl: `${baseUrl}/admin/chums/${userId}`,
        reportedProfileUrl: `${baseUrl}/admin/chums/${body.reportedUserId}`,
        planUrl: `${baseUrl}/events/${eventId}`,
      });
    } catch (emailErr) {
      console.error("[POST /events/:id/conduct-report] alert email failed (report saved):", emailErr);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/conduct-report]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/shoutout, submit (or update) a pending shout-out for one
 *  attendee on a past plan. One shout-out per (plan, sender, recipient).
 *  Pending shout-outs can be edited freely; once moderated (approved or
 *  rejected) the slot is locked. */
app.post("/events/:id/shoutout", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
  const eventId = c.req.param("id");

  const body = await c.req.json<{
    recipientUserId: string;
    message: string;
  }>();

  const recipientUserId = String(body.recipientUserId ?? "");
  const message = String(body.message ?? "").trim();

  if (!recipientUserId)
    return c.json({ ok: false, error: "VALIDATION", message: "Recipient is required" }, 400);
  if (recipientUserId === userId)
    return c.json({ ok: false, error: "CANNOT_SHOUT_SELF" }, 400);
  if (message.length === 0)
    return c.json({ ok: false, error: "VALIDATION", message: "Shout-out cannot be empty" }, 400);
  if (message.length > SHOUTOUT_MAX_LENGTH)
    return c.json({ ok: false, error: "VALIDATION", message: `Shout-out must be ${SHOUTOUT_MAX_LENGTH} characters or less` }, 400);

  const safety = validateCleanText(message, "hobby");
  if (!safety.ok)
    return c.json({ ok: false, error: "INAPPROPRIATE_TEXT", message: safety.reason ?? "Please rephrase your shout-out." }, 400);

  try {
    // Plan must exist, must be in the past, and both parties must have been
    // participants (host or going/maybe RSVP).
    const ev = (await sql`
      SELECT host_user_id, starts_at FROM newchums.events WHERE id = ${eventId}
    `) as { host_user_id: string; starts_at: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (new Date(ev[0].starts_at) > new Date())
      return c.json({ ok: false, error: "NOT_PAST" }, 400);

    const isParticipant = async (uid: string): Promise<boolean> => {
      if (uid === ev[0].host_user_id) return true;
      const rows = (await sql`
        SELECT 1 FROM newchums.event_rsvps
        WHERE event_id = ${eventId} AND user_id = ${uid} AND status IN ('going', 'maybe')
        LIMIT 1
      `) as unknown[];
      return rows.length > 0;
    };
    if (!(await isParticipant(userId))) return c.json({ ok: false, error: "NOT_PARTICIPANT" }, 403);
    if (!(await isParticipant(recipientUserId))) return c.json({ ok: false, error: "RECIPIENT_NOT_PARTICIPANT" }, 400);

    // Upsert: only allow editing while still pending. ON CONFLICT updates the
    // row in place if a previous draft exists, but the WHERE clause keeps the
    // moderated state untouchable.
    const upserted = (await sql`
      INSERT INTO newchums.shoutouts
        (plan_id, sender_user_id, recipient_user_id, message, status)
      VALUES
        (${eventId}, ${userId}, ${recipientUserId}, ${message}, 'pending')
      ON CONFLICT (plan_id, sender_user_id, recipient_user_id)
        DO UPDATE SET message = EXCLUDED.message, updated_at = NOW()
        WHERE shoutouts.status = 'pending'
      RETURNING id, status
    `) as { id: string; status: string }[];

    if (upserted.length === 0) {
      // The row already exists in a moderated state; the upsert was a no-op.
      return c.json({ ok: false, error: "ALREADY_MODERATED" }, 409);
    }

    return c.json({ ok: true, status: upserted[0].status });
  } catch (err) {
    console.error("[POST /events/:id/shoutout]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /admin/shoutouts, list shout-outs for moderation. */
app.get("/admin/shoutouts", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const url = new URL(c.req.url);
  const statusParam = (url.searchParams.get("status") || "pending").toLowerCase();
  const search = url.searchParams.get("q")?.trim() || "";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  const allowed = ["pending", "approved", "rejected", "all"];
  if (!allowed.includes(statusParam))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid status" }, 400);

  const statusClause = statusParam === "all"
    ? sql``
    : sql`AND s.status = ${statusParam}`;
  const searchClause = search
    ? sql`AND (
        s.message ILIKE ${"%" + search + "%"}
        OR sender.name ILIKE ${"%" + search + "%"}
        OR sender.username ILIKE ${"%" + search + "%"}
        OR recipient.name ILIKE ${"%" + search + "%"}
        OR recipient.username ILIKE ${"%" + search + "%"}
        OR e.title ILIKE ${"%" + search + "%"}
      )`
    : sql``;

  try {
    const items = (await sql`
      SELECT
        s.id, s.message, s.status, s.created_at, s.reviewed_at,
        s.plan_id, e.title AS plan_title, e.starts_at AS plan_starts_at,
        s.sender_user_id, sender.name AS sender_name, sender.username AS sender_username,
        s.recipient_user_id, recipient.name AS recipient_name, recipient.username AS recipient_username,
        s.reviewed_by_user_id, reviewer.name AS reviewer_name, reviewer.username AS reviewer_username
      FROM newchums.shoutouts s
      JOIN newchums.events e ON e.id = s.plan_id
      JOIN newchums.users sender ON sender.id = s.sender_user_id
      JOIN newchums.users recipient ON recipient.id = s.recipient_user_id
      LEFT JOIN newchums.users reviewer ON reviewer.id = s.reviewed_by_user_id
      WHERE 1=1
        ${statusClause}
        ${searchClause}
      ORDER BY s.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as Array<{
      id: string;
      message: string;
      status: string;
      created_at: string;
      reviewed_at: string | null;
      plan_id: string;
      plan_title: string;
      plan_starts_at: string;
      sender_user_id: string;
      sender_name: string | null;
      sender_username: string | null;
      recipient_user_id: string;
      recipient_name: string | null;
      recipient_username: string | null;
      reviewed_by_user_id: string | null;
      reviewer_name: string | null;
      reviewer_username: string | null;
    }>;

    const totalRows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM newchums.shoutouts s
      JOIN newchums.events e ON e.id = s.plan_id
      JOIN newchums.users sender ON sender.id = s.sender_user_id
      JOIN newchums.users recipient ON recipient.id = s.recipient_user_id
      WHERE 1=1
        ${statusClause}
        ${searchClause}
    `) as { count: number }[];

    return c.json({
      ok: true,
      items: items.map((r) => ({
        id: r.id,
        message: r.message,
        status: r.status,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
        plan: { id: r.plan_id, title: r.plan_title, startsAt: r.plan_starts_at },
        sender: {
          userId: r.sender_user_id,
          displayName: r.sender_name?.trim() || (r.sender_username ? `@${r.sender_username.replace(/^@/, "")}` : "Someone"),
          username: r.sender_username,
        },
        recipient: {
          userId: r.recipient_user_id,
          displayName: r.recipient_name?.trim() || (r.recipient_username ? `@${r.recipient_username.replace(/^@/, "")}` : "Someone"),
          username: r.recipient_username,
        },
        reviewer: r.reviewed_by_user_id
          ? {
              userId: r.reviewed_by_user_id,
              displayName: r.reviewer_name?.trim() || (r.reviewer_username ? `@${r.reviewer_username.replace(/^@/, "")}` : "Admin"),
            }
          : null,
      })),
      total: totalRows[0].count,
    });
  } catch (err) {
    console.error("[GET /admin/shoutouts]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /admin/shoutouts/:id/status, approve or reject a shout-out.
 *  On approval, fires a bell notification to the recipient (no email). */
app.post("/admin/shoutouts/:id/status", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const shoutoutId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const newStatus = String(body.status ?? "");
  if (newStatus !== "approved" && newStatus !== "rejected")
    return c.json({ ok: false, error: "VALIDATION", message: "Status must be 'approved' or 'rejected'" }, 400);

  try {
    const updated = (await sql`
      UPDATE newchums.shoutouts
      SET status = ${newStatus},
          reviewed_at = NOW(),
          reviewed_by_user_id = ${admin.id},
          updated_at = NOW()
      WHERE id = ${shoutoutId}
      RETURNING id, sender_user_id, recipient_user_id, plan_id
    `) as { id: string; sender_user_id: string; recipient_user_id: string; plan_id: string }[];

    if (updated.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    if (newStatus === "approved") {
      const row = updated[0];
      const planRows = (await sql`
        SELECT title FROM newchums.events WHERE id = ${row.plan_id} LIMIT 1
      `) as { title: string }[];
      const planTitle = planRows[0]?.title ?? "your plan";
      await sql`
        INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
        VALUES (
          ${row.recipient_user_id},
          'shoutout_received',
          ${row.sender_user_id},
          ${row.id},
          ${JSON.stringify({ planTitle, planId: row.plan_id })}::jsonb
        )
      `;
    }

    return c.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error("[POST /admin/shoutouts/:id/status]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Chum Preferences ────────────────────────────────────────────────────────
//
// Pure evaluation helpers (evaluateChumPreferences, parsePrefOverrides,
// resolveEffectiveHostPrefs, ChumPrefsRow, DEFAULT_CHUM_PREFS, PREF_LEVELS,
// METRIC_BASELINE, etc) live in `./lib/chumPreferences.ts` so they can be unit
// tested without spinning up Hono. The DB-touching loaders below stay here.

async function loadChumPrefsForUser(
  sql: ReturnType<typeof getSql>,
  userId: string,
): Promise<ChumPrefsRow | null> {
  const rows = (await sql`
    SELECT reliability_level, sociability_level, presentation_level, hosting_level, age_pref_years
    FROM newchums.chum_preferences WHERE user_id = ${userId} LIMIT 1
  `) as ChumPrefsRow[];
  return rows.length > 0 ? rows[0] : null;
}

async function loadMetricsForUser(
  sql: ReturnType<typeof getSql>,
  userId: string,
): Promise<UserMetricsMap> {
  const rows = (await sql`
    SELECT metric, score FROM newchums.user_metrics WHERE user_id = ${userId}
  `) as { metric: string; score: string }[];
  const m: UserMetricsMap = {};
  for (const r of rows) m[r.metric] = parseFloat(r.score);
  return m;
}

async function batchLoadNotificationPrefs(
  sql: ReturnType<typeof getSql>,
  userIds: string[],
): Promise<Map<string, unknown>> {
  if (userIds.length === 0) return new Map();
  const rows = (await sql`
    SELECT user_id, notification_prefs
    FROM newchums.user_profile WHERE user_id = ANY(${userIds}::uuid[])
  `) as { user_id: string; notification_prefs: unknown }[];
  const map = new Map<string, unknown>();
  for (const r of rows) map.set(r.user_id, r.notification_prefs);
  return map;
}

async function batchLoadChumPrefs(
  sql: ReturnType<typeof getSql>,
  userIds: string[],
): Promise<Map<string, ChumPrefsRow>> {
  if (userIds.length === 0) return new Map();
  const rows = (await sql`
    SELECT user_id, reliability_level, sociability_level, presentation_level, hosting_level, age_pref_years
    FROM newchums.chum_preferences WHERE user_id = ANY(${userIds}::uuid[])
  `) as (ChumPrefsRow & { user_id: string })[];
  const map = new Map<string, ChumPrefsRow>();
  for (const r of rows) map.set(r.user_id, r);
  return map;
}

/** Batch-load `date_of_birth` for a list of user IDs. Returns YYYY-MM-DD strings (or null). */
async function batchLoadDobs(
  sql: ReturnType<typeof getSql>,
  userIds: string[],
): Promise<Map<string, string | null>> {
  if (userIds.length === 0) return new Map();
  const rows = (await sql`
    SELECT id, date_of_birth FROM newchums.users WHERE id = ANY(${userIds}::uuid[])
  `) as { id: string; date_of_birth: string | Date | null }[];
  const map = new Map<string, string | null>();
  for (const r of rows) {
    const dob = r.date_of_birth
      ? typeof r.date_of_birth === "string"
        ? r.date_of_birth
        : (r.date_of_birth as Date).toISOString().slice(0, 10)
      : null;
    map.set(r.id, dob);
  }
  return map;
}

async function batchLoadMetrics(
  sql: ReturnType<typeof getSql>,
  userIds: string[],
): Promise<Map<string, UserMetricsMap>> {
  if (userIds.length === 0) return new Map();
  const rows = (await sql`
    SELECT user_id, metric, score FROM newchums.user_metrics WHERE user_id = ANY(${userIds}::uuid[])
  `) as { user_id: string; metric: string; score: string }[];
  const map = new Map<string, UserMetricsMap>();
  for (const r of rows) {
    if (!map.has(r.user_id)) map.set(r.user_id, {});
    map.get(r.user_id)![r.metric] = parseFloat(r.score);
  }
  return map;
}

/** GET /chum-preferences, get current user's chum preference settings */
app.get("/chum-preferences", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

  try {
    const rows = (await sql`
      SELECT reliability_level, sociability_level, presentation_level, hosting_level, age_pref_years, updated_at
      FROM newchums.chum_preferences
      WHERE user_id = ${userId}
      LIMIT 1
    `) as {
      reliability_level: string;
      sociability_level: string;
      presentation_level: string;
      hosting_level: string;
      age_pref_years: number | null;
      updated_at: string;
    }[];

    if (rows.length === 0) {
      return c.json({
        ok: true,
        preferences: {
          reliability: "preferred",
          sociability: "open",
          presentation: "open",
          hosting: "open",
          age: null,
        },
      });
    }

    const r = rows[0];
    return c.json({
      ok: true,
      preferences: {
        reliability: r.reliability_level,
        sociability: r.sociability_level,
        presentation: r.presentation_level,
        hosting: r.hosting_level,
        age: r.age_pref_years ?? null,
      },
    });
  } catch (err) {
    console.error("[GET /chum-preferences]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PUT /chum-preferences, save current user's chum preference settings */
app.put("/chum-preferences", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

  const body = await c.req.json<{
    reliability?: string;
    sociability?: string;
    presentation?: string;
    hosting?: string;
    age?: number | null;
  }>();

  const reliability = (PREF_LEVELS.includes(body.reliability as PrefLevel) ? body.reliability : "preferred") as PrefLevel;
  const sociability = (PREF_LEVELS.includes(body.sociability as PrefLevel) ? body.sociability : "open") as PrefLevel;
  const presentation = (PREF_LEVELS.includes(body.presentation as PrefLevel) ? body.presentation : "open") as PrefLevel;
  const hosting = (PREF_LEVELS.includes(body.hosting as PrefLevel) ? body.hosting : "open") as PrefLevel;
  const agePrefYears: number | null =
    body.age != null && AGE_PREF_YEAR_OPTIONS.includes(body.age) ? body.age : null;

  try {
    await sql`
      INSERT INTO newchums.chum_preferences (user_id, reliability_level, sociability_level, presentation_level, hosting_level, age_pref_years, updated_at)
      VALUES (${userId}, ${reliability}, ${sociability}, ${presentation}, ${hosting}, ${agePrefYears}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        reliability_level = ${reliability},
        sociability_level = ${sociability},
        presentation_level = ${presentation},
        hosting_level = ${hosting},
        age_pref_years = ${agePrefYears},
        updated_at = NOW()
    `;

    return c.json({
      ok: true,
      preferences: { reliability, sociability, presentation, hosting, age: agePrefYears },
    });
  } catch (err) {
    console.error("[PUT /chum-preferences]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Community Roadmap ────────────────────────────────────────────────────────

const ROADMAP_STATUSES = ["received", "needs_clarification", "in_progress", "planned", "completed", "not_planned"] as const;
const ROADMAP_CATEGORIES = ["feature_request", "bug", "general_feedback"] as const;
const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  needs_clarification: "Needs clarification",
  in_progress: "In progress",
  planned: "Planned",
  completed: "Completed",
  not_planned: "Not planned",
};

/** GET /roadmap, public list, optionally includes viewer vote/follow state */
app.get("/roadmap", async (c) => {
  const sql = getSql(c.env);
  const url = new URL(c.req.url);
  const statusFilter = url.searchParams.get("status") || "active";
  const category = url.searchParams.get("category") || "";
  const sort = url.searchParams.get("sort") || "votes";
  const search = url.searchParams.get("search") || "";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
  const offset = Number(url.searchParams.get("offset")) || 0;

  let viewerUserId: string | null = null;
  let viewerIsSuperAdmin = false;
  try {
    const payload = await requireAuth(c);
    if (payload?.email) {
      const u = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
      if (u.length > 0) {
        viewerUserId = u[0].id;
        viewerIsSuperAdmin = u[0].role === "super_admin";
      }
    }
  } catch { /* unauthenticated is fine */ }

  try {
    let statusClause: string;
    if (statusFilter === "completed") {
      statusClause = `AND ri.status IN ('completed', 'not_planned')`;
    } else if (statusFilter === "all") {
      statusClause = "";
    } else {
      statusClause = `AND ri.status NOT IN ('completed', 'not_planned')`;
    }

    const categoryClause = category && ROADMAP_CATEGORIES.includes(category as typeof ROADMAP_CATEGORIES[number])
      ? `AND ri.category = '${category}'`
      : "";

    const orderClause = sort === "newest" ? "ri.created_at DESC" : "ri.vote_count DESC, ri.created_at DESC";

    // Visibility rule: items with status='received' or is_private=true are
    // hidden from non-author / non-admin viewers. Author and super admins
    // always see their own / all items respectively.
    const items = await sql`
      SELECT ri.id, ri.title, ri.body, ri.category, ri.status, ri.vote_count,
             ri.comment_count, ri.follower_count, ri.completed_at, ri.created_at,
             ri.merged_into_item_id, ri.is_anonymous, ri.is_private, ri.author_user_id,
             u.username AS author_username
      FROM newchums.roadmap_items ri
      JOIN newchums.users u ON u.id = ri.author_user_id
      WHERE ri.is_removed = false
        AND ri.merged_into_item_id IS NULL
        ${statusFilter === "completed" ? sql`AND ri.status IN ('completed', 'not_planned')` : statusFilter === "all" ? sql`` : sql`AND ri.status NOT IN ('completed', 'not_planned')`}
        ${category && ROADMAP_CATEGORIES.includes(category as typeof ROADMAP_CATEGORIES[number]) ? sql`AND ri.category = ${category}` : sql``}
        ${search ? sql`AND ri.title ILIKE ${"%" + search + "%"}` : sql``}
        ${viewerUserId ? sql`AND ((ri.status != 'received' AND ri.is_private = false) OR ri.author_user_id = ${viewerUserId})` : sql`AND ri.status != 'received' AND ri.is_private = false`}
      ORDER BY ${sort === "newest" ? sql`ri.created_at DESC` : sql`ri.vote_count DESC, ri.created_at DESC`}
      LIMIT ${limit} OFFSET ${offset}
    `;

    let viewerVotes: Set<string> = new Set();
    let viewerFollows: Set<string> = new Set();
    if (viewerUserId && items.length > 0) {
      const itemIds = (items as { id: string }[]).map((i) => i.id);
      const votes = (await sql`SELECT item_id FROM newchums.roadmap_votes WHERE user_id = ${viewerUserId} AND item_id = ANY(${itemIds})`) as { item_id: string }[];
      votes.forEach((v) => viewerVotes.add(v.item_id));
      const follows = (await sql`SELECT item_id FROM newchums.roadmap_follows WHERE user_id = ${viewerUserId} AND item_id = ANY(${itemIds})`) as { item_id: string }[];
      follows.forEach((f) => viewerFollows.add(f.item_id));
    }

    const total = (await sql`
      SELECT COUNT(*)::int AS count FROM newchums.roadmap_items ri
      WHERE ri.is_removed = false AND ri.merged_into_item_id IS NULL
        ${statusFilter === "completed" ? sql`AND ri.status IN ('completed', 'not_planned')` : statusFilter === "all" ? sql`` : sql`AND ri.status NOT IN ('completed', 'not_planned')`}
        ${category && ROADMAP_CATEGORIES.includes(category as typeof ROADMAP_CATEGORIES[number]) ? sql`AND ri.category = ${category}` : sql``}
        ${search ? sql`AND ri.title ILIKE ${"%" + search + "%"}` : sql``}
        ${viewerUserId ? sql`AND ((ri.status != 'received' AND ri.is_private = false) OR ri.author_user_id = ${viewerUserId})` : sql`AND ri.status != 'received' AND ri.is_private = false`}
    `) as { count: number }[];

    return c.json({
      ok: true,
      items: items.map((i: Record<string, unknown>) => {
        const isAnon = i.is_anonymous === true;
        return {
          ...i,
          body: i.body ? String(i.body).slice(0, 200) : null,
          author_username: isAnon ? "anonymous" : i.author_username,
          is_anonymous: isAnon,
          author_user_id: undefined,
          viewer_voted: viewerVotes.has(i.id as string),
          viewer_following: viewerFollows.has(i.id as string),
        };
      }),
      total: total[0].count,
    });
  } catch (err) {
    console.error("[GET /roadmap]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /roadmap/:id, single item detail with comments, admin notes, merge info */
app.get("/roadmap/:id", async (c) => {
  const sql = getSql(c.env);
  const itemId = c.req.param("id");

  let viewerUserId: string | null = null;
  let viewerIsSuperAdmin = false;
  try {
    const payload = await requireAuth(c);
    if (payload?.email) {
      const u = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
      if (u.length > 0) {
        viewerUserId = u[0].id;
        viewerIsSuperAdmin = u[0].role === "super_admin";
      }
    }
  } catch { /* unauthenticated is fine */ }

  try {
    const items = (await sql`
      SELECT ri.*, u.username AS author_username
      FROM newchums.roadmap_items ri
      JOIN newchums.users u ON u.id = ri.author_user_id
      WHERE ri.id = ${itemId} AND ri.is_removed = false
    `) as Record<string, unknown>[];

    if (items.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    // Items with "received" status OR is_private = true are only visible to
    // the author and super admins. Both gates are OR'd together.
    const item0 = items[0];
    const isHidden = item0.status === "received" || item0.is_private === true;
    if (isHidden && !viewerIsSuperAdmin && item0.author_user_id !== viewerUserId) {
      return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    }
    const item = items[0];

    const comments = await sql`
      SELECT rc.id, rc.body, rc.created_at, rc.is_removed,
             u.username AS author_username
      FROM newchums.roadmap_comments rc
      JOIN newchums.users u ON u.id = rc.user_id
      WHERE rc.item_id = ${itemId}
      ORDER BY rc.created_at ASC
    `;

    const adminNotes = await sql`
      SELECT ran.id, ran.body, ran.status_before, ran.status_after, ran.created_at,
             u.username AS admin_username
      FROM newchums.roadmap_admin_notes ran
      JOIN newchums.users u ON u.id = ran.admin_user_id
      WHERE ran.item_id = ${itemId}
      ORDER BY ran.created_at ASC
    `;

    let mergedInto: { id: string; title: string } | null = null;
    if (item.merged_into_item_id) {
      const target = (await sql`SELECT id, title FROM newchums.roadmap_items WHERE id = ${item.merged_into_item_id}`) as { id: string; title: string }[];
      if (target.length > 0) mergedInto = target[0];
    }

    let viewerVoted = false;
    let viewerFollowing = false;
    if (viewerUserId) {
      const v = (await sql`SELECT 1 FROM newchums.roadmap_votes WHERE user_id = ${viewerUserId} AND item_id = ${itemId}`) as unknown[];
      viewerVoted = v.length > 0;
      const f = (await sql`SELECT 1 FROM newchums.roadmap_follows WHERE user_id = ${viewerUserId} AND item_id = ${itemId}`) as unknown[];
      viewerFollowing = f.length > 0;
    }

    const viewerIsAuthor = viewerUserId !== null && item.author_user_id === viewerUserId;
    const isAnon = item.is_anonymous === true;

    return c.json({
      ok: true,
      item: {
        ...item,
        author_username: isAnon ? "anonymous" : item.author_username,
        author_user_id: undefined,
        viewer_voted: viewerVoted,
        viewer_following: viewerFollowing,
        viewer_is_author: viewerIsAuthor,
      },
      comments: comments.filter((cm: Record<string, unknown>) => !cm.is_removed).map((cm: Record<string, unknown>) => ({
        id: cm.id, body: cm.body, created_at: cm.created_at, author_username: cm.author_username,
      })),
      admin_notes: adminNotes,
      merged_into: mergedInto,
    });
  } catch (err) {
    console.error("[GET /roadmap/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /roadmap, submit a new roadmap item (authenticated) */
app.post("/roadmap", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);

  const sql = getSql(c.env);
  const users = (await sql`SELECT id, username FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; username: string }[];
  if (users.length === 0) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const userId = users[0].id;

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const title = String(body.title ?? "").trim();
  const description = String(body.body ?? "").trim();
  const category = String(body.category ?? "feature_request");
  const attachmentKey = typeof body.attachment_key === "string" && body.attachment_key.startsWith("roadmap_attachments/")
    ? body.attachment_key.trim()
    : null;
  const isAnonymous = body.is_anonymous === true;

  if (!title || title.length > 200) return c.json({ ok: false, error: "VALIDATION", message: "Title is required (max 200 chars)" }, 400);
  if (description.length > 5000) return c.json({ ok: false, error: "VALIDATION", message: "Description too long (max 5000 chars)" }, 400);
  if (!ROADMAP_CATEGORIES.includes(category as typeof ROADMAP_CATEGORIES[number]))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid category" }, 400);

  const titleCheck = validateCleanText(title);
  if (!titleCheck.ok) return c.json({ ok: false, error: "CONTENT_POLICY", message: titleCheck.reason }, 400);
  if (description) {
    const bodyCheck = validateCleanText(description);
    if (!bodyCheck.ok) return c.json({ ok: false, error: "CONTENT_POLICY", message: bodyCheck.reason }, 400);
  }

  try {
    const rows = (await sql`
      INSERT INTO newchums.roadmap_items (author_user_id, category, title, body, attachment_key, is_anonymous, vote_count, follower_count)
      VALUES (${userId}, ${category}, ${title}, ${description || null}, ${attachmentKey}, ${isAnonymous}, 1, 1)
      RETURNING id
    `) as { id: string }[];

    const itemId = rows[0].id;

    // Auto-vote and auto-follow the submitter
    await sql`INSERT INTO newchums.roadmap_votes (user_id, item_id) VALUES (${userId}, ${itemId})`;
    await sql`INSERT INTO newchums.roadmap_follows (user_id, item_id) VALUES (${userId}, ${itemId})`;

    return c.json({ ok: true, id: itemId });
  } catch (err) {
    console.error("[POST /roadmap]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /roadmap/:id/vote, toggle upvote */
app.post("/roadmap/:id/vote", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);

  const sql = getSql(c.env);
  const users = (await sql`SELECT id FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string }[];
  if (users.length === 0) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const userId = users[0].id;
  const itemId = c.req.param("id");

  try {
    const existing = (await sql`SELECT 1 FROM newchums.roadmap_votes WHERE user_id = ${userId} AND item_id = ${itemId}`) as unknown[];
    if (existing.length > 0) {
      await sql`DELETE FROM newchums.roadmap_votes WHERE user_id = ${userId} AND item_id = ${itemId}`;
      await sql`UPDATE newchums.roadmap_items SET vote_count = GREATEST(0, vote_count - 1), updated_at = NOW() WHERE id = ${itemId}`;
      const updated = (await sql`SELECT vote_count FROM newchums.roadmap_items WHERE id = ${itemId}`) as { vote_count: number }[];
      return c.json({ ok: true, voted: false, vote_count: updated[0]?.vote_count ?? 0 });
    } else {
      await sql`INSERT INTO newchums.roadmap_votes (user_id, item_id) VALUES (${userId}, ${itemId})`;
      await sql`UPDATE newchums.roadmap_items SET vote_count = vote_count + 1, updated_at = NOW() WHERE id = ${itemId}`;
      const updated = (await sql`SELECT vote_count FROM newchums.roadmap_items WHERE id = ${itemId}`) as { vote_count: number }[];
      return c.json({ ok: true, voted: true, vote_count: updated[0]?.vote_count ?? 0 });
    }
  } catch (err) {
    console.error("[POST /roadmap/:id/vote]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /roadmap/:id/follow, toggle follow */
app.post("/roadmap/:id/follow", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);

  const sql = getSql(c.env);
  const users = (await sql`SELECT id FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string }[];
  if (users.length === 0) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const userId = users[0].id;
  const itemId = c.req.param("id");

  try {
    const existing = (await sql`SELECT 1 FROM newchums.roadmap_follows WHERE user_id = ${userId} AND item_id = ${itemId}`) as unknown[];
    if (existing.length > 0) {
      await sql`DELETE FROM newchums.roadmap_follows WHERE user_id = ${userId} AND item_id = ${itemId}`;
      await sql`UPDATE newchums.roadmap_items SET follower_count = GREATEST(0, follower_count - 1), updated_at = NOW() WHERE id = ${itemId}`;
      const updated = (await sql`SELECT follower_count FROM newchums.roadmap_items WHERE id = ${itemId}`) as { follower_count: number }[];
      return c.json({ ok: true, following: false, follower_count: updated[0]?.follower_count ?? 0 });
    } else {
      await sql`INSERT INTO newchums.roadmap_follows (user_id, item_id) VALUES (${userId}, ${itemId})`;
      await sql`UPDATE newchums.roadmap_items SET follower_count = follower_count + 1, updated_at = NOW() WHERE id = ${itemId}`;
      const updated = (await sql`SELECT follower_count FROM newchums.roadmap_items WHERE id = ${itemId}`) as { follower_count: number }[];
      return c.json({ ok: true, following: true, follower_count: updated[0]?.follower_count ?? 0 });
    }
  } catch (err) {
    console.error("[POST /roadmap/:id/follow]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PUT /roadmap/:id, edit a roadmap item (author only) */
app.put("/roadmap/:id", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);

  const sql = getSql(c.env);
  const itemId = c.req.param("id");
  const users = (await sql`SELECT id FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string }[];
  if (users.length === 0) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const userId = users[0].id;

  const existing = (await sql`SELECT author_user_id, status FROM newchums.roadmap_items WHERE id = ${itemId} AND is_removed = false`) as { author_user_id: string; status: string }[];
  if (existing.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (existing[0].author_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const description = typeof body.body === "string" ? body.body.trim() : undefined;
  const category = typeof body.category === "string" ? body.category : undefined;

  if (title !== undefined && (!title || title.length > 200)) return c.json({ ok: false, error: "VALIDATION", message: "Title is required (max 200 chars)" }, 400);
  if (description !== undefined && description.length > 5000) return c.json({ ok: false, error: "VALIDATION", message: "Description too long (max 5000 chars)" }, 400);
  if (category !== undefined && !ROADMAP_CATEGORIES.includes(category as typeof ROADMAP_CATEGORIES[number]))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid category" }, 400);

  if (title !== undefined) {
    const titleCheck = validateCleanText(title);
    if (!titleCheck.ok) return c.json({ ok: false, error: "CONTENT_POLICY", message: titleCheck.reason }, 400);
  }
  if (description) {
    const bodyCheck = validateCleanText(description);
    if (!bodyCheck.ok) return c.json({ ok: false, error: "CONTENT_POLICY", message: bodyCheck.reason }, 400);
  }

  try {
    const sets: string[] = [];
    if (title !== undefined) sets.push("title");
    if (description !== undefined) sets.push("body");
    if (category !== undefined) sets.push("category");
    if (sets.length === 0) return c.json({ ok: false, error: "VALIDATION", message: "Nothing to update" }, 400);

    await sql`
      UPDATE newchums.roadmap_items SET
        ${title !== undefined ? sql`title = ${title},` : sql``}
        ${description !== undefined ? sql`body = ${description || null},` : sql``}
        ${category !== undefined ? sql`category = ${category},` : sql``}
        updated_at = NOW()
      WHERE id = ${itemId}
    `;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[PUT /roadmap/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** DELETE /roadmap/:id, soft-delete a roadmap item (author only) */
app.delete("/roadmap/:id", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);

  const sql = getSql(c.env);
  const itemId = c.req.param("id");
  const users = (await sql`SELECT id FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string }[];
  if (users.length === 0) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const userId = users[0].id;

  const existing = (await sql`SELECT author_user_id FROM newchums.roadmap_items WHERE id = ${itemId} AND is_removed = false`) as { author_user_id: string }[];
  if (existing.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (existing[0].author_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  try {
    await sql`UPDATE newchums.roadmap_items SET is_removed = true, updated_at = NOW() WHERE id = ${itemId}`;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /roadmap/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /roadmap/:id/comment, add a comment */
app.post("/roadmap/:id/comment", async (c) => {
  const authPayload = await requireAuth(c);
  if (!authPayload?.email) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);

  const sql = getSql(c.env);
  const users = (await sql`SELECT id, username FROM newchums.users WHERE email = ${authPayload.email} LIMIT 1`) as { id: string; username: string }[];
  if (users.length === 0) return c.json({ ok: false, error: "AUTH_REQUIRED" }, 401);
  const userId = users[0].id;

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const commentBody = String(body.body ?? "").trim();
  if (!commentBody || commentBody.length > 2000) return c.json({ ok: false, error: "VALIDATION", message: "Comment is required (max 2000 chars)" }, 400);

  const check = validateCleanText(commentBody);
  if (!check.ok) return c.json({ ok: false, error: "CONTENT_POLICY", message: check.reason }, 400);

  const itemId = c.req.param("id");

  try {
    const item = (await sql`SELECT id FROM newchums.roadmap_items WHERE id = ${itemId} AND is_removed = false`) as { id: string }[];
    if (item.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const rows = (await sql`
      INSERT INTO newchums.roadmap_comments (item_id, user_id, body)
      VALUES (${itemId}, ${userId}, ${commentBody})
      RETURNING id, created_at
    `) as { id: string; created_at: string }[];

    await sql`UPDATE newchums.roadmap_items SET comment_count = comment_count + 1, updated_at = NOW() WHERE id = ${itemId}`;

    return c.json({
      ok: true,
      comment: { id: rows[0].id, body: commentBody, created_at: rows[0].created_at, author_username: users[0].username },
    });
  } catch (err) {
    console.error("[POST /roadmap/:id/comment]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /roadmap/:id/attachment, serve the attachment image from R2 */
app.get("/roadmap/:id/attachment", async (c) => {
  if (!c.env.MEDIA_BUCKET) return c.json({ ok: false, error: "MEDIA_NOT_CONFIGURED" }, 503);
  const itemId = c.req.param("id");
  const sql = getSql(c.env);

  // Honor the same visibility gates as the item itself: hidden items
  // (status='received' or is_private=true) are only accessible to the author
  // and super admins.
  let viewerUserId: string | null = null;
  let viewerIsSuperAdmin = false;
  try {
    const payload = await requireAuth(c);
    if (payload?.email) {
      const u = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
      if (u.length > 0) {
        viewerUserId = u[0].id;
        viewerIsSuperAdmin = u[0].role === "super_admin";
      }
    }
  } catch { /* unauthenticated is fine */ }

  try {
    const rows = (await sql`
      SELECT attachment_key, status, is_private, author_user_id
      FROM newchums.roadmap_items WHERE id = ${itemId} AND is_removed = false
    `) as { attachment_key: string | null; status: string; is_private: boolean; author_user_id: string }[];
    if (rows.length === 0 || !rows[0].attachment_key) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const row = rows[0];
    const isHidden = row.status === "received" || row.is_private === true;
    if (isHidden && !viewerIsSuperAdmin && row.author_user_id !== viewerUserId) {
      return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    }

    const obj = await c.env.MEDIA_BUCKET.get(row.attachment_key);
    if (!obj) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return new Response(obj.body, { headers });
  } catch (err) {
    console.error("[GET /roadmap/:id/attachment]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Roadmap Admin endpoints ──────────────────────────────────────────────────

/** Helper: send roadmap update emails to followers (non-blocking) */
async function sendRoadmapNotifications(
  sql: ReturnType<typeof getSql>,
  env: Bindings,
  itemId: string,
  updateType: "status_change" | "merged",
  opts: { statusLabel?: string; adminNote?: string | null; mergedIntoTitle?: string; mergedIntoId?: string },
) {
  try {
    const item = (await sql`SELECT title FROM newchums.roadmap_items WHERE id = ${itemId}`) as { title: string }[];
    if (item.length === 0) return;

    const followers = (await sql`
      SELECT rf.user_id, u.email, u.name, u.username, up.notification_prefs
      FROM newchums.roadmap_follows rf
      JOIN newchums.users u ON u.id = rf.user_id
      LEFT JOIN newchums.user_profile up ON up.user_id = rf.user_id
      WHERE rf.item_id = ${itemId}
    `) as { user_id: string; email: string; name: string | null; username: string | null; notification_prefs: unknown }[];

    for (const follower of followers) {
      const prefs = normalizeNotificationPrefs(follower.notification_prefs);
      if (!prefs.items.roadmap_updates?.enabled) continue;

      const recipientName = follower.name?.trim() || follower.username?.replace(/^@/, "") || "there";
      const unsubToken = await createUnsubscribeToken(env.NEXTAUTH_SECRET!, follower.user_id, "roadmap_updates");

      await sendRoadmapUpdateEmail(env, {
        to: follower.email,
        recipientName,
        itemTitle: item[0].title,
        itemUrl: `${env.WEB_BASE_URL}/roadmap/${itemId}`,
        updateType,
        statusLabel: opts.statusLabel,
        adminNote: opts.adminNote,
        mergedIntoTitle: opts.mergedIntoTitle,
        mergedIntoUrl: opts.mergedIntoId ? `${env.WEB_BASE_URL}/roadmap/${opts.mergedIntoId}` : undefined,
        unsubscribeUrl: `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
      });
    }
  } catch (err) {
    console.error("[sendRoadmapNotifications]", err);
  }
}

/** GET /admin/roadmap, list all items for moderation */
app.get("/admin/roadmap", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const url = new URL(c.req.url);
  const statusFilter = url.searchParams.get("status") || "";
  const category = url.searchParams.get("category") || "";
  const search = url.searchParams.get("search") || "";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 100);
  const offset = Number(url.searchParams.get("offset")) || 0;

  // "removed" is a synthetic status that maps to the existing `is_removed`
  // soft-delete flag, not a real status enum value. By default the admin view
  // hides removed items so they only appear when the admin explicitly filters
  // by "Removed" — matching the behavior the community-facing roadmap has
  // always had (`WHERE is_removed = false`).
  const removedFilter =
    statusFilter === "removed"
      ? sql`AND ri.is_removed = true`
      : sql`AND ri.is_removed = false`;
  const realStatusFilter =
    statusFilter && statusFilter !== "removed" && ROADMAP_STATUSES.includes(statusFilter as typeof ROADMAP_STATUSES[number])
      ? sql`AND ri.status = ${statusFilter}`
      : sql``;

  try {
    const items = await sql`
      SELECT ri.*, u.username AS author_username, u.email AS author_email
      FROM newchums.roadmap_items ri
      JOIN newchums.users u ON u.id = ri.author_user_id
      WHERE 1=1
        ${removedFilter}
        ${realStatusFilter}
        ${category && ROADMAP_CATEGORIES.includes(category as typeof ROADMAP_CATEGORIES[number]) ? sql`AND ri.category = ${category}` : sql``}
        ${search ? sql`AND ri.title ILIKE ${"%" + search + "%"}` : sql``}
      ORDER BY ri.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const total = (await sql`
      SELECT COUNT(*)::int AS count FROM newchums.roadmap_items ri
      WHERE 1=1
        ${removedFilter}
        ${realStatusFilter}
        ${category && ROADMAP_CATEGORIES.includes(category as typeof ROADMAP_CATEGORIES[number]) ? sql`AND ri.category = ${category}` : sql``}
        ${search ? sql`AND ri.title ILIKE ${"%" + search + "%"}` : sql``}
    `) as { count: number }[];

    return c.json({ ok: true, items, total: total[0].count });
  } catch (err) {
    console.error("[GET /admin/roadmap]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /admin/roadmap/:id/status, update status with optional note */
app.post("/admin/roadmap/:id/status", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const itemId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const newStatus = String(body.status ?? "");
  const note = String(body.note ?? "").trim();

  if (!ROADMAP_STATUSES.includes(newStatus as typeof ROADMAP_STATUSES[number]))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid status" }, 400);

  try {
    const current = (await sql`SELECT status FROM newchums.roadmap_items WHERE id = ${itemId}`) as { status: string }[];
    if (current.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const oldStatus = current[0].status;
    const completedAt = newStatus === "completed" ? sql`NOW()` : newStatus !== "completed" && oldStatus === "completed" ? sql`NULL` : sql`completed_at`;

    await sql`
      UPDATE newchums.roadmap_items
      SET status = ${newStatus}, completed_at = ${newStatus === "completed" ? new Date().toISOString() : null}, updated_at = NOW()
      WHERE id = ${itemId}
    `;

    if (note) {
      await sql`
        INSERT INTO newchums.roadmap_admin_notes (item_id, admin_user_id, body, status_before, status_after)
        VALUES (${itemId}, ${admin.id}, ${note}, ${oldStatus}, ${newStatus})
      `;
    } else if (oldStatus !== newStatus) {
      await sql`
        INSERT INTO newchums.roadmap_admin_notes (item_id, admin_user_id, body, status_before, status_after)
        VALUES (${itemId}, ${admin.id}, ${`Status changed to ${STATUS_LABELS[newStatus] ?? newStatus}`}, ${oldStatus}, ${newStatus})
      `;
    }

    c.executionCtx.waitUntil(
      sendRoadmapNotifications(sql, c.env, itemId, "status_change", {
        statusLabel: STATUS_LABELS[newStatus] ?? newStatus,
        adminNote: note || null,
      })
    );

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /admin/roadmap/:id/status]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /admin/roadmap/:id/merge, merge item into target */
app.post("/admin/roadmap/:id/merge", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const sourceId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const targetId = String(body.target_item_id ?? "");
  if (!targetId) return c.json({ ok: false, error: "VALIDATION", message: "target_item_id required" }, 400);
  if (sourceId === targetId) return c.json({ ok: false, error: "VALIDATION", message: "Cannot merge into itself" }, 400);

  try {
    const source = (await sql`SELECT id, title FROM newchums.roadmap_items WHERE id = ${sourceId} AND merged_into_item_id IS NULL`) as { id: string; title: string }[];
    const target = (await sql`SELECT id, title FROM newchums.roadmap_items WHERE id = ${targetId} AND is_removed = false AND merged_into_item_id IS NULL`) as { id: string; title: string }[];

    if (source.length === 0) return c.json({ ok: false, error: "NOT_FOUND", message: "Source item not found or already merged" }, 404);
    if (target.length === 0) return c.json({ ok: false, error: "NOT_FOUND", message: "Target item not found" }, 404);

    // Mark source as merged
    await sql`UPDATE newchums.roadmap_items SET merged_into_item_id = ${targetId}, updated_at = NOW() WHERE id = ${sourceId}`;

    // Transfer votes (skip duplicates)
    await sql`
      INSERT INTO newchums.roadmap_votes (user_id, item_id, created_at)
      SELECT user_id, ${targetId}, NOW()
      FROM newchums.roadmap_votes WHERE item_id = ${sourceId}
      ON CONFLICT (user_id, item_id) DO NOTHING
    `;

    // Transfer follows (skip duplicates)
    await sql`
      INSERT INTO newchums.roadmap_follows (user_id, item_id, created_at)
      SELECT user_id, ${targetId}, NOW()
      FROM newchums.roadmap_follows WHERE item_id = ${sourceId}
      ON CONFLICT (user_id, item_id) DO NOTHING
    `;

    // Recompute counts on target
    await sql`
      UPDATE newchums.roadmap_items SET
        vote_count = (SELECT COUNT(*)::int FROM newchums.roadmap_votes WHERE item_id = ${targetId}),
        follower_count = (SELECT COUNT(*)::int FROM newchums.roadmap_follows WHERE item_id = ${targetId}),
        updated_at = NOW()
      WHERE id = ${targetId}
    `;

    // Admin note on target
    await sql`
      INSERT INTO newchums.roadmap_admin_notes (item_id, admin_user_id, body, status_before, status_after)
      VALUES (${targetId}, ${admin.id}, ${`A similar idea, "${source[0].title}", was combined with this one. Votes and followers have been transferred here.`}, NULL, NULL)
    `;

    c.executionCtx.waitUntil(
      sendRoadmapNotifications(sql, c.env, sourceId, "merged", {
        mergedIntoTitle: target[0].title,
        mergedIntoId: targetId,
      })
    );

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /admin/roadmap/:id/merge]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /admin/roadmap/:id/edit, edit item title, body, category, privacy */
app.post("/admin/roadmap/:id/edit", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const itemId = c.req.param("id");

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const title = String(body.title ?? "").trim();
  const description = body.body != null ? String(body.body).trim() : undefined;
  const category = body.category ? String(body.category) : undefined;
  const isPrivate = typeof body.is_private === "boolean" ? body.is_private : undefined;

  if (!title || title.length > 200) return c.json({ ok: false, error: "VALIDATION", message: "Title is required (max 200 chars)" }, 400);
  if (description !== undefined && description.length > 5000) return c.json({ ok: false, error: "VALIDATION", message: "Description too long (max 5000 chars)" }, 400);
  if (category && !ROADMAP_CATEGORIES.includes(category as typeof ROADMAP_CATEGORIES[number]))
    return c.json({ ok: false, error: "VALIDATION", message: "Invalid category" }, 400);

  try {
    const existing = (await sql`SELECT id FROM newchums.roadmap_items WHERE id = ${itemId}`) as { id: string }[];
    if (existing.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    await sql`
      UPDATE newchums.roadmap_items
      SET title = ${title},
          body = ${description !== undefined ? (description || null) : sql`body`},
          category = ${category ?? sql`category`},
          is_private = ${isPrivate !== undefined ? isPrivate : sql`is_private`},
          updated_at = NOW()
      WHERE id = ${itemId}
    `;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /admin/roadmap/:id/edit]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /admin/roadmap/:id/remove, soft-remove item */
app.post("/admin/roadmap/:id/remove", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const itemId = c.req.param("id");

  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* no body is fine */ }

  const reason = String(body.reason ?? "").trim();

  try {
    await sql`
      UPDATE newchums.roadmap_items SET is_removed = true, removal_reason = ${reason || null}, updated_at = NOW()
      WHERE id = ${itemId}
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /admin/roadmap/:id/remove]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /admin/roadmap/:id/restore, restore removed item */
app.post("/admin/roadmap/:id/restore", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const itemId = c.req.param("id");

  try {
    await sql`
      UPDATE newchums.roadmap_items SET is_removed = false, removal_reason = NULL, updated_at = NOW()
      WHERE id = ${itemId}
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /admin/roadmap/:id/restore]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** DELETE /admin/roadmap/comments/:id, remove a comment */
app.delete("/admin/roadmap/comments/:id", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const commentId = c.req.param("id");

  try {
    const comment = (await sql`SELECT item_id FROM newchums.roadmap_comments WHERE id = ${commentId}`) as { item_id: string }[];
    if (comment.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    await sql`UPDATE newchums.roadmap_comments SET is_removed = true WHERE id = ${commentId}`;
    await sql`UPDATE newchums.roadmap_items SET comment_count = GREATEST(0, comment_count - 1), updated_at = NOW() WHERE id = ${comment[0].item_id}`;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /admin/roadmap/comments/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

export { ChatRoom } from "./ChatRoom";

// ─── Attendance assurance cron processing ─────────────────────────────────────

async function processAttendanceAssurance(
  sql: ReturnType<typeof getSql>,
  env: Bindings,
  ctx: ExecutionContext,
) {
  const now = new Date();

  // Phase 1: Open confirmation windows, send initial confirmation requests
  const eventsNeedingInitialSend = (await sql`
    SELECT e.id, e.host_user_id, e.title, e.starts_at, e.timezone,
           e.confirmation_window_hours, e.confirmation_cutoff_hours,
           e.location_type, e.location_name, e.location_address, e.location_area, e.online_link,
           COALESCE(e.is_qa, false) AS is_qa
    FROM newchums.events e
    WHERE e.require_reconfirmation = true
      AND e.status = 'published'
      AND e.confirmation_sent_at IS NULL
      AND e.starts_at > NOW()
      AND e.starts_at - (e.confirmation_window_hours || ' hours')::interval <= NOW()
  `) as Array<{
    id: string; host_user_id: string; title: string; starts_at: string;
    timezone: string | null; confirmation_window_hours: number;
    confirmation_cutoff_hours: number; location_type: string;
    location_name: string | null; location_address: string | null;
    location_area: string | null; online_link: string | null; is_qa: boolean;
  }>;

  for (const ev of eventsNeedingInitialSend) {
    try {
      const goingRsvps = (await sql`
        SELECT er.user_id, u.email, u.name, u.username
        FROM newchums.event_rsvps er
        JOIN newchums.users u ON u.id = er.user_id
        WHERE er.event_id = ${ev.id} AND er.status = 'going'
      `) as Array<{ user_id: string; email: string; name: string | null; username: string | null }>;

      for (const att of goingRsvps) {
        await sql`
          INSERT INTO newchums.event_confirmations (event_id, user_id, status)
          VALUES (${ev.id}, ${att.user_id}, 'pending')
          ON CONFLICT (event_id, user_id) DO NOTHING
        `;
      }

      await sql`UPDATE newchums.events SET confirmation_sent_at = NOW() WHERE id = ${ev.id}`;

      const tz = ev.timezone || "UTC";
      const cutoffAt = new Date(new Date(ev.starts_at).getTime() - Number(ev.confirmation_cutoff_hours) * 3600000);
      const deadline = formatEventDate(cutoffAt.toISOString(), tz);
      const eventDate = formatEventDate(ev.starts_at, tz);
      const eventUrl = `${env.WEB_BASE_URL}/events/${ev.id}`;
      // Privacy-conscious location for the email body: never include the full
      // street address. Online → "Online". In-person → venue name + city/area
      // (mirrors the feedback email treatment so the family stays consistent).
      let eventLocation = "";
      if (ev.location_type === "online") {
        eventLocation = "Online";
      } else {
        const area = ev.location_area || deriveApproxArea(ev.location_address) || "";
        eventLocation = [ev.location_name, area].filter(Boolean).join(", ");
      }

      const goingUserIds = goingRsvps.map((a) => a.user_id);
      const prefsMap = await batchLoadNotificationPrefs(sql, goingUserIds);

      // QA plans: only send emails/notifications to super admin recipients
      const qaAdminIds = ev.is_qa ? await batchLoadSuperAdminIds(sql, goingUserIds) : null;

      for (const att of goingRsvps) {
        // QA plan isolation: skip non-super-admin recipients
        if (qaAdminIds && !qaAdminIds.has(att.user_id)) continue;

        const prefs = normalizeNotificationPrefs(prefsMap.get(att.user_id));
        if (prefs.items.attendance_confirmation?.enabled === false) continue;

        try {
          const ctaUrl = `${eventUrl}?section=confirmation`;
          const isHost = att.user_id === ev.host_user_id;
          const recipientName = att.name?.trim() || att.username?.replace(/^@/, "") || "there";

          const unsubToken = await createUnsubscribeToken(env.NEXTAUTH_SECRET, att.user_id, "attendance_confirmation");
          const unsubscribeUrl = `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

          await sendConfirmationRequestEmail(env, {
            to: att.email, recipientName, eventTitle: ev.title, eventDate,
            eventLocation, eventUrl, ctaUrl,
            isHost, isReminder: false, isFinal: false, deadline, unsubscribeUrl,
          });

          await sql`
            INSERT INTO newchums.notifications (user_id, type, entity_id, metadata)
            VALUES (${att.user_id}, 'confirmation_requested', ${ev.id}, ${JSON.stringify({ eventTitle: ev.title })})
          `;

          await sql`
            UPDATE newchums.event_confirmations
            SET reminder_count = 1, last_reminder_at = NOW(), updated_at = NOW()
            WHERE event_id = ${ev.id} AND user_id = ${att.user_id}
          `;
        } catch { /* noop, don't let one email failure stop the batch */ }
      }

      // Guest attendees: create confirmation rows and send emails
      const goingGuests = (await sql`
        SELECT er.guest_email, er.guest_name
        FROM newchums.event_rsvps er
        WHERE er.event_id = ${ev.id} AND er.status = 'going'
          AND er.user_id IS NULL AND er.guest_email IS NOT NULL
      `) as Array<{ guest_email: string; guest_name: string | null }>;

      for (const guest of goingGuests) {
        await sql`
          INSERT INTO newchums.event_confirmations (event_id, user_id, guest_email, status)
          VALUES (${ev.id}, ${null}, ${guest.guest_email}, 'pending')
          ON CONFLICT (event_id, guest_email) DO NOTHING
        `;
      }

      for (const guest of goingGuests) {
        try {
          const recipientName = guest.guest_name?.trim() || guest.guest_email.split("@")[0] || "there";

          const guestToken = await createGuestConfirmationToken(env.NEXTAUTH_SECRET, ev.id, guest.guest_email);
          const confirmUrl = `${eventUrl}?guest_confirm_token=${encodeURIComponent(guestToken)}&action=confirm`;
          const declineUrl = `${eventUrl}?guest_confirm_token=${encodeURIComponent(guestToken)}&action=decline`;
          const viewToken = await createInviteToken(env.NEXTAUTH_SECRET, ev.id, undefined, guest.guest_email);
          const viewUrl = `${eventUrl}?invite_token=${encodeURIComponent(viewToken)}`;

          await sendGuestConfirmationRequestEmail(env, {
            to: guest.guest_email, recipientName, eventTitle: ev.title, eventDate,
            eventLocation, eventUrl, confirmUrl, declineUrl, viewUrl,
            isReminder: false, isFinal: false, deadline,
          });

          await sql`
            UPDATE newchums.event_confirmations
            SET reminder_count = 1, last_reminder_at = NOW(), updated_at = NOW()
            WHERE event_id = ${ev.id} AND guest_email = ${guest.guest_email}
          `;
        } catch { /* noop */ }
      }
    } catch (err) {
      console.error(`[attendance-assurance] initial send failed for event ${ev.id}:`, err);
    }
  }

  // Phase 2: Send follow-up reminders to pending confirmations
  const eventsWithPending = (await sql`
    SELECT DISTINCT e.id, e.host_user_id, e.title, e.starts_at, e.timezone,
           e.confirmation_cutoff_hours, e.location_type, e.location_name,
           e.location_address, e.location_area, e.online_link,
           COALESCE(e.is_qa, false) AS is_qa
    FROM newchums.events e
    WHERE e.require_reconfirmation = true
      AND e.status = 'published'
      AND e.confirmation_sent_at IS NOT NULL
      AND e.cutoff_processed_at IS NULL
      AND e.starts_at > NOW()
      AND EXISTS (
        SELECT 1 FROM newchums.event_confirmations ec
        WHERE ec.event_id = e.id AND ec.status = 'pending'
      )
  `) as Array<{
    id: string; host_user_id: string; title: string; starts_at: string;
    timezone: string | null; confirmation_cutoff_hours: number;
    location_type: string; location_name: string | null;
    location_address: string | null; location_area: string | null;
    online_link: string | null; is_qa: boolean;
  }>;

  for (const ev of eventsWithPending) {
    try {
      const startsAtMs = new Date(ev.starts_at).getTime();
      const hoursUntil = (startsAtMs - now.getTime()) / 3600000;
      const tz = ev.timezone || "UTC";
      const cutoffAt = new Date(startsAtMs - Number(ev.confirmation_cutoff_hours) * 3600000);
      const deadline = formatEventDate(cutoffAt.toISOString(), tz);
      const eventDate = formatEventDate(ev.starts_at, tz);
      const eventUrl = `${env.WEB_BASE_URL}/events/${ev.id}`;
      // Privacy-conscious location for the email body — see Phase 1 above.
      let eventLocation = "";
      if (ev.location_type === "online") {
        eventLocation = "Online";
      } else {
        const area = ev.location_area || deriveApproxArea(ev.location_address) || "";
        eventLocation = [ev.location_name, area].filter(Boolean).join(", ");
      }

      // ~12h before: send first follow-up (reminder_count = 1)
      // ~3h before: send final reminder (reminder_count = 2)
      let targetReminderCount: number | null = null;
      let isFinal = false;
      if (hoursUntil <= 3) {
        targetReminderCount = 2;
        isFinal = true;
      } else if (hoursUntil <= 12) {
        targetReminderCount = 1;
      }

      if (targetReminderCount === null) continue;

      const pendingUsers = (await sql`
        SELECT ec.user_id, ec.reminder_count, u.email, u.name, u.username
        FROM newchums.event_confirmations ec
        JOIN newchums.users u ON u.id = ec.user_id
        WHERE ec.event_id = ${ev.id}
          AND ec.status = 'pending'
          AND ec.reminder_count < ${targetReminderCount + 1}
      `) as Array<{ user_id: string; reminder_count: number; email: string; name: string | null; username: string | null }>;

      const pendingUserIds = pendingUsers.map((a) => a.user_id);
      const reminderPrefsMap = await batchLoadNotificationPrefs(sql, pendingUserIds);

      // QA plans: only send to super admin recipients
      const qaReminderAdminIds = ev.is_qa ? await batchLoadSuperAdminIds(sql, pendingUserIds) : null;

      for (const att of pendingUsers) {
        if (qaReminderAdminIds && !qaReminderAdminIds.has(att.user_id)) continue;
        if (att.reminder_count >= targetReminderCount + 1) continue;

        const prefs = normalizeNotificationPrefs(reminderPrefsMap.get(att.user_id));
        if (prefs.items.attendance_confirmation?.enabled === false) continue;

        try {
          const ctaUrl = `${eventUrl}?section=confirmation`;
          const isHost = att.user_id === ev.host_user_id;
          const recipientName = att.name?.trim() || att.username?.replace(/^@/, "") || "there";

          const unsubToken = await createUnsubscribeToken(env.NEXTAUTH_SECRET, att.user_id, "attendance_confirmation");
          const unsubscribeUrl = `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

          await sendConfirmationRequestEmail(env, {
            to: att.email, recipientName, eventTitle: ev.title, eventDate,
            eventLocation, eventUrl, ctaUrl,
            isHost, isReminder: true, isFinal, deadline, unsubscribeUrl,
          });

          await sql`
            INSERT INTO newchums.notifications (user_id, type, entity_id, metadata)
            VALUES (${att.user_id}, 'confirmation_requested', ${ev.id}, ${JSON.stringify({ eventTitle: ev.title })})
          `;

          await sql`
            UPDATE newchums.event_confirmations
            SET reminder_count = ${targetReminderCount + 1}, last_reminder_at = NOW(), updated_at = NOW()
            WHERE event_id = ${ev.id} AND user_id = ${att.user_id}
          `;
        } catch { /* noop */ }
      }

      // Guest reminders (allowed for QA plans since guests were intentionally invited)
      {
        const pendingGuests = (await sql`
          SELECT ec.guest_email, ec.reminder_count, er.guest_name
          FROM newchums.event_confirmations ec
          JOIN newchums.event_rsvps er
            ON er.event_id = ec.event_id
            AND er.guest_email = ec.guest_email
            AND er.user_id IS NULL
          WHERE ec.event_id = ${ev.id}
            AND ec.status = 'pending'
            AND ec.guest_email IS NOT NULL
            AND ec.reminder_count < ${targetReminderCount + 1}
        `) as Array<{ guest_email: string; reminder_count: number; guest_name: string | null }>;

        for (const guest of pendingGuests) {
          if (guest.reminder_count >= targetReminderCount + 1) continue;
          try {
            const recipientName = guest.guest_name?.trim() || guest.guest_email.split("@")[0] || "there";

            const guestToken = await createGuestConfirmationToken(env.NEXTAUTH_SECRET, ev.id, guest.guest_email);
            const confirmUrl = `${eventUrl}?guest_confirm_token=${encodeURIComponent(guestToken)}&action=confirm`;
            const declineUrl = `${eventUrl}?guest_confirm_token=${encodeURIComponent(guestToken)}&action=decline`;
            const viewToken = await createInviteToken(env.NEXTAUTH_SECRET, ev.id, undefined, guest.guest_email);
            const viewUrl = `${eventUrl}?invite_token=${encodeURIComponent(viewToken)}`;

            await sendGuestConfirmationRequestEmail(env, {
              to: guest.guest_email, recipientName, eventTitle: ev.title, eventDate,
              eventLocation, eventUrl, confirmUrl, declineUrl, viewUrl,
              isReminder: true, isFinal, deadline,
            });

            await sql`
              UPDATE newchums.event_confirmations
              SET reminder_count = ${targetReminderCount + 1}, last_reminder_at = NOW(), updated_at = NOW()
              WHERE event_id = ${ev.id} AND guest_email = ${guest.guest_email}
            `;
          } catch { /* noop */ }
        }
      }
    } catch (err) {
      console.error(`[attendance-assurance] reminder failed for event ${ev.id}:`, err);
    }
  }

  // Phase 3: Process cutoffs, expire pending confirmations and evaluate viability
  const eventsAtCutoff = (await sql`
    SELECT e.id, e.host_user_id, e.title, e.starts_at, e.timezone,
           e.confirmation_cutoff_hours, e.min_confirmed_attendees, e.fallback_policy,
           e.location_type, e.location_name, e.location_address, e.online_link,
           COALESCE(e.is_qa, false) AS is_qa
    FROM newchums.events e
    WHERE e.require_reconfirmation = true
      AND e.status = 'published'
      AND e.confirmation_sent_at IS NOT NULL
      AND e.cutoff_processed_at IS NULL
      AND e.starts_at > NOW()
      AND e.starts_at - (e.confirmation_cutoff_hours || ' hours')::interval <= NOW()
  `) as Array<{
    id: string; host_user_id: string; title: string; starts_at: string;
    timezone: string | null; confirmation_cutoff_hours: number;
    min_confirmed_attendees: number | null; fallback_policy: string;
    location_type: string; location_name: string | null;
    location_address: string | null; online_link: string | null;
    is_qa: boolean;
  }>;

  for (const ev of eventsAtCutoff) {
    try {
      await sql`
        UPDATE newchums.event_confirmations
        SET status = 'expired', updated_at = NOW()
        WHERE event_id = ${ev.id} AND status = 'pending'
      `;

      await sql`UPDATE newchums.events SET cutoff_processed_at = NOW() WHERE id = ${ev.id}`;

      const minRequired = ev.min_confirmed_attendees ? Number(ev.min_confirmed_attendees) : null;
      if (minRequired == null) continue;

      const confirmedRows = (await sql`
        SELECT COUNT(*)::int AS c FROM newchums.event_confirmations
        WHERE event_id = ${ev.id} AND status = 'confirmed'
      `) as { c: number }[];
      const confirmedCount = confirmedRows[0].c;

      if (confirmedCount >= minRequired) continue;

      if (ev.fallback_policy === "auto_cancel") {
        await sql`
          UPDATE newchums.events SET status = 'canceled', canceled_at = NOW(), cancellation_reason = 'min_attendees_not_met', updated_at = NOW()
          WHERE id = ${ev.id}
        `;
        const attendees = (await sql`
          SELECT u.id AS user_id, u.email, u.name, u.username
          FROM newchums.event_rsvps er
          JOIN newchums.users u ON u.id = er.user_id
          WHERE er.event_id = ${ev.id} AND er.status IN ('going', 'maybe')
        `) as Array<{ user_id: string; email: string; name: string | null; username: string | null }>;

        const tz = ev.timezone || "UTC";
        const cancelEventDate = formatEventDate(ev.starts_at, tz);
        const cancelEventLocation = ev.location_type === "online" ? (ev.online_link || "Online") : [ev.location_name, ev.location_address].filter(Boolean).join(", ") || "";

        // QA plans: only notify super admin attendees
        const qaCancelAdminIds = ev.is_qa ? await batchLoadSuperAdminIds(sql, attendees.map((a) => a.user_id)) : null;

        for (const att of attendees) {
          if (qaCancelAdminIds && !qaCancelAdminIds.has(att.user_id)) continue;
          try {
            const recipientName = att.name?.trim() || att.username?.replace(/^@/, "") || "there";
            const unsubToken = await createUnsubscribeToken(env.NEXTAUTH_SECRET, att.user_id, "event_changed_canceled");
            await sendPlanAutoCancelledEmail(env, {
              to: att.email, recipientName, eventTitle: ev.title,
              confirmedCount, minRequired,
              eventDate: cancelEventDate, eventLocation: cancelEventLocation,
              unsubscribeUrl: `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
            });
          } catch { /* noop */ }
        }
      } else if (ev.fallback_policy === "notify_host") {
        const hostUser = (await sql`SELECT email, name, username FROM newchums.users WHERE id = ${ev.host_user_id}`) as { email: string; name: string | null; username: string | null }[];
        if (hostUser.length > 0) {
          try {
            const hostName = hostUser[0].name?.trim() || hostUser[0].username?.replace(/^@/, "") || "there";
            const tz = ev.timezone || "UTC";
            const eventDate = formatEventDate(ev.starts_at, tz);
            const eventLocation = ev.location_type === "online" ? (ev.online_link || "Online") : [ev.location_name, ev.location_address].filter(Boolean).join(", ") || "";
            const unsubToken = await createUnsubscribeToken(env.NEXTAUTH_SECRET, ev.host_user_id, "attendance_confirmation");
            await sendPlanAtRiskEmail(env, {
              to: hostUser[0].email, hostName, eventTitle: ev.title,
              eventUrl: `${env.WEB_BASE_URL}/events/${ev.id}`,
              eventDate, eventLocation,
              confirmedCount, minRequired,
              unsubscribeUrl: `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
            });
          } catch { /* noop */ }
        }
      }
      // fallback_policy === "proceed": no action needed
    } catch (err) {
      console.error(`[attendance-assurance] cutoff processing failed for event ${ev.id}:`, err);
    }
  }
}

// ─── Event match digest ───────────────────────────────────────────────────────
//
// Hobby matching uses **effective category**, not exact interest identity.
// Effective category = COALESCE(NULLIF(TRIM(category), ''), name), lower-cased.
// So "MTG Draft" and "MTG Commander" (both category "MTG") match each other,
// while "Dog walking" with no category falls back to its own name.
// See `effectiveCategoryOf` in web/src/lib/interestUtils.ts for the JS twin.

async function processEventMatchDigest(
  sql: ReturnType<typeof getSql>,
  env: Bindings,
  ctx: ExecutionContext,
) {
  if (!env.POSTMARK_TEMPLATE_EVENT_MATCH_DIGEST) return;

  const rows = (await sql`
    WITH eligible_users AS (
      SELECT
        u.id AS user_id,
        u.email,
        u.name,
        u.role,
        up.home_lat,
        up.home_lng,
        up.travel_radius_km,
        up.notification_prefs,
        up.event_digest_sent_at
      FROM newchums.users u
      JOIN newchums.user_profile up ON up.user_id = u.id
      WHERE up.home_lat IS NOT NULL
        AND up.home_lng IS NOT NULL
        AND (up.event_digest_sent_at IS NULL OR up.event_digest_sent_at < NOW() - INTERVAL '23 hours')
    ),
    matching AS (
      SELECT DISTINCT ON (eu.user_id, e.id)
        eu.user_id,
        eu.email,
        eu.name,
        eu.notification_prefs,
        e.id AS event_id,
        e.host_user_id,
        e.title AS event_title,
        COALESCE(e.description, '') AS event_description,
        e.starts_at,
        e.location_name,
        e.location_address,
        e.location_visibility,
        COALESCE(e.location_area, '') AS location_area,
        e.timezone,
        e.max_seats,
        e.reserve_seats,
        EXISTS (
          SELECT 1 FROM newchums.event_rsvps er_rec
          WHERE er_rec.event_id = e.id AND er_rec.user_id = eu.user_id
        ) AS recipient_has_rsvp,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er_g WHERE er_g.event_id = e.id AND er_g.status = 'going') AS going_count,
        (
          SELECT COUNT(*)::int FROM newchums.event_invites ei
          WHERE ei.event_id = e.id AND ei.user_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM newchums.event_rsvps er2
              WHERE er2.event_id = ei.event_id AND er2.user_id = ei.user_id
            )
        ) AS pending_invite_no_rsvp_count,
        (
          SELECT COUNT(*)::int FROM newchums.event_rsvps er
          INNER JOIN newchums.event_invites ei ON ei.event_id = er.event_id AND ei.user_id = er.user_id
          WHERE er.event_id = e.id AND er.status = 'maybe'
        ) AS maybe_invitee_count
      FROM (
        (-- Public plans: shared hobby + in travel radius
        SELECT DISTINCT ON (eu.user_id, e.id)
          eu.user_id,
          eu.email,
          eu.name,
          eu.notification_prefs,
          e.id AS event_id
        FROM eligible_users eu
        JOIN newchums.user_interests ui ON ui.user_id = eu.user_id
        JOIN newchums.interests ui_i ON ui_i.id = ui.interest_id AND ui_i.is_deleted = false
        JOIN newchums.interests ei_i
          ON LOWER(COALESCE(NULLIF(TRIM(ei_i.category), ''), ei_i.name))
           = LOWER(COALESCE(NULLIF(TRIM(ui_i.category), ''), ui_i.name))
          AND ei_i.is_deleted = false
        JOIN newchums.event_interests ei ON ei.interest_id = ei_i.id
        JOIN newchums.events e ON e.id = ei.event_id
        WHERE e.status = 'published'
          AND e.visibility = 'public'
          AND (COALESCE(e.is_qa, false) = false OR eu.role = 'super_admin')
          AND e.location_type = 'in_person'
          AND e.starts_at > NOW()
          AND e.host_user_id != eu.user_id
          AND e.location_lat IS NOT NULL
          AND e.location_lng IS NOT NULL
          AND e.created_at > COALESCE(eu.event_digest_sent_at, NOW() - INTERVAL '24 hours')
          AND (e.max_seats IS NULL OR (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'going') < e.max_seats)
          -- Suppress plans the recipient is already connected to: any RSVP
          -- (going/maybe/cant_make_it) or any invite (matched by user_id OR
          -- by email so a legacy email-only invite still counts after the
          -- recipient signs up). Keeps the digest a "new things you don't
          -- know about" channel rather than a second outreach for plans
          -- they've already been pulled into.
          AND NOT EXISTS (
            SELECT 1 FROM newchums.event_rsvps er_dedup
            WHERE er_dedup.event_id = e.id AND er_dedup.user_id = eu.user_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM newchums.event_invites ei_dedup
            WHERE ei_dedup.event_id = e.id
              AND (
                ei_dedup.user_id = eu.user_id
                OR LOWER(ei_dedup.email) = LOWER(eu.email)
              )
          )
          AND 6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(eu.home_lat)) * cos(radians(e.location_lat)) *
              cos(radians(e.location_lng) - radians(eu.home_lng)) +
              sin(radians(eu.home_lat)) * sin(radians(e.location_lat))
            ))
          ) <= COALESCE(eu.travel_radius_km, 200)
        ORDER BY eu.user_id, e.id, e.starts_at)
        UNION ALL
        (-- Chums-only: same hobby + radius rules as public, plus recipient in host's On NewChums contacts
        SELECT DISTINCT ON (eu.user_id, e.id)
          eu.user_id,
          eu.email,
          eu.name,
          eu.notification_prefs,
          e.id AS event_id
        FROM eligible_users eu
        JOIN newchums.user_interests ui ON ui.user_id = eu.user_id
        JOIN newchums.interests ui_i ON ui_i.id = ui.interest_id AND ui_i.is_deleted = false
        JOIN newchums.interests ei_i
          ON LOWER(COALESCE(NULLIF(TRIM(ei_i.category), ''), ei_i.name))
           = LOWER(COALESCE(NULLIF(TRIM(ui_i.category), ''), ui_i.name))
          AND ei_i.is_deleted = false
        JOIN newchums.event_interests ei ON ei.interest_id = ei_i.id
        JOIN newchums.events e ON e.id = ei.event_id
        JOIN newchums.user_contacts uc ON uc.user_id = e.host_user_id AND uc.linked_user_id = eu.user_id AND uc.type = 'on_newchums'
        WHERE e.visibility = 'chums_only'
          AND e.status = 'published'
          AND (COALESCE(e.is_qa, false) = false OR eu.role = 'super_admin')
          AND e.location_type = 'in_person'
          AND e.starts_at > NOW()
          AND e.host_user_id != eu.user_id
          AND e.location_lat IS NOT NULL
          AND e.location_lng IS NOT NULL
          AND e.created_at > COALESCE(eu.event_digest_sent_at, NOW() - INTERVAL '24 hours')
          AND (e.max_seats IS NULL OR (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'going') < e.max_seats)
          -- Same recipient-already-connected suppression as the public branch
          -- above. Keeps chums-only digests consistent with public ones.
          AND NOT EXISTS (
            SELECT 1 FROM newchums.event_rsvps er_dedup
            WHERE er_dedup.event_id = e.id AND er_dedup.user_id = eu.user_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM newchums.event_invites ei_dedup
            WHERE ei_dedup.event_id = e.id
              AND (
                ei_dedup.user_id = eu.user_id
                OR LOWER(ei_dedup.email) = LOWER(eu.email)
              )
          )
          AND 6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(eu.home_lat)) * cos(radians(e.location_lat)) *
              cos(radians(e.location_lng) - radians(eu.home_lng)) +
              sin(radians(eu.home_lat)) * sin(radians(e.location_lat))
            ))
          ) <= COALESCE(eu.travel_radius_km, 200)
        ORDER BY eu.user_id, e.id, e.starts_at)
      ) AS mid
      JOIN eligible_users eu ON eu.user_id = mid.user_id
      JOIN newchums.events e ON e.id = mid.event_id
      ORDER BY eu.user_id, e.id, e.starts_at
    )
    SELECT
      m.user_id,
      m.email,
      m.name,
      m.notification_prefs,
      json_agg(json_build_object(
        'eventId', m.event_id,
        'hostUserId', m.host_user_id,
        'title', m.event_title,
        'description', m.event_description,
        'startsAt', m.starts_at,
        'locationName', m.location_name,
        'locationAddress', m.location_address,
        'locationVisibility', m.location_visibility,
        'locationArea', m.location_area,
        'recipientHasRsvp', m.recipient_has_rsvp,
        'timezone', m.timezone,
        'maxSeats', m.max_seats,
        'reserveSeats', m.reserve_seats,
        'goingCount', m.going_count,
        'pendingInviteNoRsvpCount', m.pending_invite_no_rsvp_count,
        'maybeInviteeCount', m.maybe_invitee_count,
        'prefOverrides', e.pref_overrides
      ) ORDER BY m.starts_at) AS plans
    FROM matching m
    JOIN newchums.events e ON e.id = m.event_id
    GROUP BY m.user_id, m.email, m.name, m.notification_prefs
  `) as {
    user_id: string;
    email: string;
    name: string | null;
    notification_prefs: unknown;
    plans: {
      eventId: string;
      hostUserId: string;
      title: string;
      description: string;
      startsAt: string;
      locationName: string | null;
      locationAddress: string | null;
      locationVisibility: string | null;
      locationArea: string;
      recipientHasRsvp: boolean;
      timezone: string | null;
      maxSeats: number | null;
      reserveSeats: boolean;
      goingCount: number;
      pendingInviteNoRsvpCount: number;
      maybeInviteeCount: number;
      prefOverrides: unknown;
    }[];
  }[];

  if (rows.length === 0) {
    console.log("[event-match-digest] eligible=0 (no matching user+plan pairs found)");
    return;
  }

  // ── Chum preference filtering for digest ────────────────────────────────────
  // Two-directional check:
  //   1. Viewer's prefs on host: does the host's metrics meet the recipient's thresholds?
  //   2. Host's prefs on viewer: does the recipient's metrics meet the host's thresholds?
  // Both must pass for a plan to be included in the digest.

  const allRecipientIds = rows.map((r) => r.user_id);
  const allHostIds = [...new Set(rows.flatMap((r) => (Array.isArray(r.plans) ? r.plans : []).map((p) => p.hostUserId)))];
  const allInvolvedIds = [...new Set([...allRecipientIds, ...allHostIds])];

  const [prefsByUser, metricsByUser, dobsByUser] = await Promise.all([
    batchLoadChumPrefs(sql, allInvolvedIds),
    batchLoadMetrics(sql, allInvolvedIds),
    batchLoadDobs(sql, allInvolvedIds),
  ]);

  const userIds: string[] = [];
  const emailPromises: Promise<unknown>[] = [];
  let matchSkippedPref = 0;
  let matchSkippedEmpty = 0;
  let matchQueued = 0;

  for (const row of rows) {
    const prefs = normalizeNotificationPrefs(row.notification_prefs);
    if (prefs.items.event_match?.enabled === false) { matchSkippedPref++; continue; }

    let candidatePlans = Array.isArray(row.plans) ? row.plans : [];

    const recipientPrefs = prefsByUser.get(row.user_id) ?? null;
    const recipientMetrics = metricsByUser.get(row.user_id) ?? {};
    const recipientDob = dobsByUser.get(row.user_id) ?? null;

    candidatePlans = candidatePlans.filter((p) => {
      const hostMetrics = metricsByUser.get(p.hostUserId) ?? {};
      const hostGlobalPrefs = prefsByUser.get(p.hostUserId) ?? null;
      const hostDob = dobsByUser.get(p.hostUserId) ?? null;

      // 1. Does the host pass the recipient's preferences? (includeHosting = true)
      const viewerCheck = evaluateChumPreferences(recipientPrefs, hostMetrics, true, {
        checkerDob: recipientDob,
        targetDob: hostDob,
      });
      if (!viewerCheck.passes) return false;

      // 2. Does the recipient pass the host's preferences? (includeHosting = false)
      // Resolve plan-level overrides before evaluating
      const planOverrides = parsePrefOverrides(p.prefOverrides);
      const effectiveHostPrefs = resolveEffectiveHostPrefs(hostGlobalPrefs, planOverrides);
      const hostCheck = evaluateChumPreferences(effectiveHostPrefs, recipientMetrics, false, {
        checkerDob: hostDob,
        targetDob: recipientDob,
      });
      if (!hostCheck.passes) return false;

      return true;
    });

    const plans = candidatePlans.slice(0, 10);
    if (plans.length === 0) { matchSkippedEmpty++; continue; }

    const recipientName = row.name?.trim() || "there";

    let unsubscribeUrl = "";
    try {
      if (env.NEXTAUTH_SECRET) {
        const token = await createUnsubscribeToken(env.NEXTAUTH_SECRET, row.user_id, "event_match");
        unsubscribeUrl = `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
      }
    } catch { /* skip token on failure */ }

    const formattedPlans = plans.map((p) => {
      let dateStr: string;
      try {
        const dt = new Date(p.startsAt);
        dateStr = dt.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: p.timezone || undefined,
        });
      } catch {
        const dt = new Date(p.startsAt);
        dateStr = dt.toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit",
        });
      }

      return {
        title: p.title,
        description: p.description,
        date: dateStr,
        location: formatEventMatchDigestLocation({
          locationName: p.locationName,
          locationAddress: p.locationAddress,
          locationArea: p.locationArea ?? "",
          locationVisibility: p.locationVisibility,
          recipientHasRsvp: p.recipientHasRsvp === true,
        }),
        seatLine: formatEventMatchSeatLine({
          maxSeats: p.maxSeats,
          goingCount: Number(p.goingCount ?? 0) || 0,
          reserveSeats: p.reserveSeats === true,
          pendingInviteNoRsvpCount: Number(p.pendingInviteNoRsvpCount ?? 0) || 0,
          maybeInviteeCount: Number(p.maybeInviteeCount ?? 0) || 0,
        }),
        url: `${env.WEB_BASE_URL}/events/${p.eventId}`,
      };
    });

    emailPromises.push(
      sendEventMatchDigestEmail(env, {
        to: row.email,
        recipientName,
        plans: formattedPlans,
        unsubscribeUrl,
      }),
    );
    userIds.push(row.user_id);
    matchQueued++;
  }

  if (userIds.length > 0) {
    ctx.waitUntil(
      Promise.allSettled(emailPromises).then(async (results) => {
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) console.error(`[event-match-digest] ${failed}/${results.length} email sends failed`);
        await sql`
          UPDATE newchums.user_profile
          SET event_digest_sent_at = NOW()
          WHERE user_id = ANY(${userIds}::uuid[])
        `;
      }),
    );
  }

  console.log(`[event-match-digest] eligible=${rows.length} skippedPref=${matchSkippedPref} skippedEmpty=${matchSkippedEmpty} queued=${matchQueued}`);
}

// ─── Post-plan feedback email ─────────────────────────────────────────────────

async function processPlanFeedbackEmails(
  sql: ReturnType<typeof getSql>,
  env: Bindings,
  ctx: ExecutionContext,
) {
  if (!env.POSTMARK_TEMPLATE_PLAN_FEEDBACK) return;

  // Find published plans that ended 3+ hours ago but haven't had feedback emails sent
  const plans = (await sql`
    SELECT e.id, e.title, e.host_user_id,
           e.starts_at, e.timezone,
           e.location_type, e.location_name, e.location_address, e.location_area, e.online_link,
           COALESCE(e.is_qa, false) AS is_qa
    FROM newchums.events e
    WHERE e.status = 'published'
      AND e.starts_at <= NOW() - INTERVAL '3 hours'
      AND e.feedback_email_sent_at IS NULL
    ORDER BY e.starts_at ASC
    LIMIT 20
  `) as { id: string; title: string; host_user_id: string; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; location_area: string | null; online_link: string | null; is_qa: boolean }[];

  if (plans.length === 0) return;

  let fbTotal = 0;
  let fbSkippedPref = 0;
  let fbQueued = 0;

  for (const plan of plans) {
    const tz = plan.timezone || "UTC";
    const planDate = formatEventDate(plan.starts_at, tz);
    // Privacy-conscious location for the feedback email: never include the
    // street address. Online → "Online". In-person → venue name + city/area
    // (falls back to derived area or just the venue/area on its own).
    let planLocation = "";
    if (plan.location_type === "online") {
      planLocation = "Online";
    } else {
      const area = plan.location_area || deriveApproxArea(plan.location_address) || "";
      planLocation = [plan.location_name, area].filter(Boolean).join(", ");
    }

    const recipients = (await sql`
      SELECT u.id, u.email, u.name, up.notification_prefs
      FROM newchums.event_rsvps er
      JOIN newchums.users u ON u.id = er.user_id
      LEFT JOIN newchums.user_profile up ON up.user_id = u.id
      WHERE er.event_id = ${plan.id} AND er.status = 'going'
      UNION
      SELECT u.id, u.email, u.name, up.notification_prefs
      FROM newchums.users u
      LEFT JOIN newchums.user_profile up ON up.user_id = u.id
      WHERE u.id = ${plan.host_user_id}
    `) as { id: string; email: string; name: string | null; notification_prefs: unknown }[];

    // QA plans: only send feedback emails to super admin recipients
    const qaFbAdminIds = plan.is_qa ? await batchLoadSuperAdminIds(sql, recipients.map((r) => r.id)) : null;

    const emailPromises: Promise<unknown>[] = [];
    for (const r of recipients) {
      if (qaFbAdminIds && !qaFbAdminIds.has(r.id)) continue;
      fbTotal++;
      const prefs = normalizeNotificationPrefs(r.notification_prefs);
      if (prefs.items.feedback_requests?.enabled === false) { fbSkippedPref++; continue; }

      const recipientName = r.name?.trim() || "there";
      let unsubscribeUrl = "";
      try {
        if (env.NEXTAUTH_SECRET) {
          const token = await createUnsubscribeToken(env.NEXTAUTH_SECRET, r.id, "feedback_requests");
          unsubscribeUrl = `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
        }
      } catch { /* skip token on failure */ }

      emailPromises.push(
        sendPlanFeedbackEmail(env, {
          to: r.email,
          recipientName,
          planTitle: plan.title,
          planUrl: `${env.WEB_BASE_URL}/events/${plan.id}?section=feedback`,
          planDate,
          planLocation,
          unsubscribeUrl,
        }),
      );
      fbQueued++;
    }

    ctx.waitUntil(
      Promise.allSettled(emailPromises).then(async (results) => {
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) console.error(`[plan-feedback] ${failed}/${results.length} email sends failed for plan ${plan.id}`);
        await sql`
          UPDATE newchums.events
          SET feedback_email_sent_at = NOW()
          WHERE id = ${plan.id}
        `;
      }),
    );
  }

  console.log(`[plan-feedback] plans=${plans.length} recipients=${fbTotal} skippedPref=${fbSkippedPref} queued=${fbQueued}`);
}

// ─── Auto-cancel plans with no attendees ─────────────────────────────────────

async function cancelNoAttendeePlans(sql: ReturnType<typeof getSql>) {
  // Find published plans that have started (within the last 2 hours to avoid
  // retroactively cancelling old plans) where the host is the only participant
  //, i.e. no one else RSVP'd "going".
  const abandoned = (await sql`
    SELECT e.id
    FROM newchums.events e
    WHERE e.status = 'published'
      AND e.starts_at <= NOW()
      AND e.starts_at > NOW() - INTERVAL '2 hours'
      AND NOT EXISTS (
        SELECT 1 FROM newchums.event_rsvps er
        WHERE er.event_id = e.id
          AND er.user_id != e.host_user_id
          AND er.status = 'going'
      )
  `) as { id: string }[];

  if (abandoned.length > 0) {
    const ids = abandoned.map((ev) => ev.id);
    try {
      await sql`
        UPDATE newchums.events
        SET status = 'canceled', canceled_at = NOW(), cancellation_reason = 'no_attendees', updated_at = NOW()
        WHERE id = ANY(${ids}::uuid[]) AND status = 'published'
      `;
    } catch (err) {
      console.error("[cancelNoAttendeePlans]", ids, err);
    }
  }
}

// ─── Local recognition badge computation ─────────────────────────────────────

async function computeLocalBadges(sql: ReturnType<typeof getSql>) {
  const BADGE_RADIUS_KM = 50;
  const BADGE_MIN_THRESHOLD = 1;
  const now = new Date().toISOString();
  const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000).toISOString();

  // Get all users with a home location
  const locatedUsers = (await sql`
    SELECT user_id, home_lat, home_lng FROM user_profile
    WHERE home_lat IS NOT NULL AND home_lng IS NOT NULL
  `) as { user_id: string; home_lat: number; home_lng: number }[];

  if (locatedUsers.length === 0) return;

  // Build a lookup for fast access
  const locMap = new Map(locatedUsers.map((u) => [u.user_id, u]));

  // ── Attendee counts per user (global, we'll filter by radius per-user later) ──
  const attendeeCounts = (await sql`
    SELECT r.user_id, COUNT(DISTINCT e.id)::int AS cnt
    FROM newchums.event_rsvps r
    JOIN newchums.events e ON e.id = r.event_id
    WHERE r.status = 'going'
      AND r.committed_at IS NOT NULL
      AND e.status != 'canceled'
      AND COALESCE(e.is_qa, false) = false
      AND e.starts_at < ${now}
      AND e.starts_at >= ${twelveMonthsAgo}
      AND NOT EXISTS (
        SELECT 1 FROM newchums.attendance_issues ai
        WHERE ai.plan_id = e.id AND ai.reported_user_id = r.user_id
          AND ai.issue_type IN ('no_show', 'very_late')
          AND COALESCE(ai.status, 'active') != 'dismissed'
      )
    GROUP BY r.user_id
    HAVING COUNT(DISTINCT e.id) >= ${BADGE_MIN_THRESHOLD}
  `) as { user_id: string; cnt: number }[];

  const attendeeMap = new Map(attendeeCounts.map((r) => [r.user_id, r.cnt]));

  // ── Host counts per user ──
  const hostCounts = (await sql`
    SELECT e.host_user_id AS user_id, COUNT(DISTINCT e.id)::int AS cnt
    FROM newchums.events e
    WHERE e.status != 'canceled'
      AND COALESCE(e.is_qa, false) = false
      AND e.starts_at < ${now}
      AND e.starts_at >= ${twelveMonthsAgo}
      AND COALESCE(e.cancellation_reason, '') != 'no_attendees'
      AND EXISTS (
        SELECT 1 FROM newchums.event_rsvps er
        WHERE er.event_id = e.id
          AND er.user_id != e.host_user_id
          AND er.committed_at IS NOT NULL
      )
    GROUP BY e.host_user_id
    HAVING COUNT(DISTINCT e.id) >= ${BADGE_MIN_THRESHOLD}
  `) as { user_id: string; cnt: number }[];

  const hostMap = new Map(hostCounts.map((r) => [r.user_id, r.cnt]));

  // ── Haversine helper ──
  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLng = (lng2 - lng1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Compute badges per user by ranking within their local area ──
  type BadgeRow = { user_id: string; badge_type: string; tier: string; count: number; rank: number; total_in_area: number };
  const allBadges: BadgeRow[] = [];

  for (const user of locatedUsers) {
    // Find all located users within radius
    const nearby = locatedUsers.filter(
      (other) => haversineKm(user.home_lat, user.home_lng, other.home_lat, other.home_lng) <= BADGE_RADIUS_KM
    );

    // Top Attendee ranking
    const attendeeInArea = nearby
      .map((u) => ({ user_id: u.user_id, cnt: attendeeMap.get(u.user_id) ?? 0 }))
      .filter((u) => u.cnt >= BADGE_MIN_THRESHOLD)
      .sort((a, b) => b.cnt - a.cnt);

    if (attendeeInArea.length > 0) {
      const idx = attendeeInArea.findIndex((u) => u.user_id === user.user_id);
      if (idx >= 0) {
        const rank = idx + 1;
        const pctile = rank / attendeeInArea.length;
        const tier = pctile <= 0.10 ? "gold" : pctile <= 0.20 ? "silver" : pctile <= 0.30 ? "bronze" : null;
        if (tier) {
          allBadges.push({ user_id: user.user_id, badge_type: "top_attendee", tier, count: attendeeInArea[idx].cnt, rank, total_in_area: attendeeInArea.length });
        }
      }
    }

    // Top Host ranking
    const hostInArea = nearby
      .map((u) => ({ user_id: u.user_id, cnt: hostMap.get(u.user_id) ?? 0 }))
      .filter((u) => u.cnt >= BADGE_MIN_THRESHOLD)
      .sort((a, b) => b.cnt - a.cnt);

    if (hostInArea.length > 0) {
      const idx = hostInArea.findIndex((u) => u.user_id === user.user_id);
      if (idx >= 0) {
        const rank = idx + 1;
        const pctile = rank / hostInArea.length;
        const tier = pctile <= 0.10 ? "gold" : pctile <= 0.20 ? "silver" : pctile <= 0.30 ? "bronze" : null;
        if (tier) {
          allBadges.push({ user_id: user.user_id, badge_type: "top_host", tier, count: hostInArea[idx].cnt, rank, total_in_area: hostInArea.length });
        }
      }
    }
  }

  // ── Write results: clear old badges and insert new ones ──
  await sql`DELETE FROM newchums.user_badges`;

  if (allBadges.length > 0) {
    // Batch insert in chunks of 500
    for (let i = 0; i < allBadges.length; i += 500) {
      const chunk = allBadges.slice(i, i + 500);
      await sql`
        INSERT INTO newchums.user_badges (user_id, badge_type, tier, count, rank, total_in_area, computed_at)
        SELECT * FROM UNNEST(
          ${chunk.map((b) => b.user_id)}::uuid[],
          ${chunk.map((b) => b.badge_type)}::text[],
          ${chunk.map((b) => b.tier)}::text[],
          ${chunk.map((b) => b.count)}::int[],
          ${chunk.map((b) => b.rank)}::int[],
          ${chunk.map((b) => b.total_in_area)}::int[],
          ${chunk.map(() => now)}::timestamptz[]
        )
      `;
    }
  }

  console.log(`[computeLocalBadges] computed ${allBadges.length} badges for ${locatedUsers.length} located users`);
}

// ─── Scheduled handler ────────────────────────────────────────────────────────

async function handleScheduled(
  _event: ScheduledEvent,
  env: Bindings,
  ctx: ExecutionContext,
) {
  const sql = getSql(env);

  // Attendance assurance processing (runs every invocation)
  try {
    await processAttendanceAssurance(sql, env, ctx);
  } catch (err) {
    console.error("[scheduled] attendance assurance error:", err);
  }

  // Auto-cancel plans where no one else joined and the event time has arrived
  try {
    await cancelNoAttendeePlans(sql);
  } catch (err) {
    console.error("[scheduled] no-attendee cancel error:", err);
  }

  // Unread chat digest
  try {
    const chatRows = (await sql`
      WITH participant AS (
        SELECT er.user_id, er.event_id
        FROM newchums.event_rsvps er WHERE er.status = 'going'
        UNION
        SELECT e.host_user_id AS user_id, e.id AS event_id
        FROM newchums.events e WHERE e.status != 'canceled'
      ),
      unread AS (
        SELECT
          p.user_id,
          p.event_id,
          e.title AS event_title,
          COUNT(cm.id)::int AS unread_count
        FROM participant p
        JOIN newchums.event_chat_messages cm
          ON cm.event_id = p.event_id
          AND cm.user_id != p.user_id
        JOIN newchums.events e
          ON e.id = p.event_id AND e.status != 'canceled'
        JOIN newchums.users pu ON pu.id = p.user_id
        LEFT JOIN newchums.event_chat_reads cr
          ON cr.event_id = p.event_id AND cr.user_id = p.user_id
        LEFT JOIN newchums.user_profile up
          ON up.user_id = p.user_id
        WHERE cm.created_at > COALESCE(cr.last_read_at, '1970-01-01'::timestamptz)
          AND cm.created_at > COALESCE(up.chat_digest_sent_at, '1970-01-01'::timestamptz)
          AND (COALESCE(e.is_qa, false) = false OR pu.role = 'super_admin')
        GROUP BY p.user_id, p.event_id, e.title
      )
      SELECT
        u.id AS user_id,
        u.email,
        u.name,
        up.notification_prefs,
        json_agg(json_build_object(
          'eventId', unread.event_id,
          'eventTitle', unread.event_title,
          'unreadCount', unread.unread_count
        ) ORDER BY unread.unread_count DESC) AS plans
      FROM unread
      JOIN newchums.users u ON u.id = unread.user_id
      LEFT JOIN newchums.user_profile up ON up.user_id = u.id
      WHERE (up.chat_digest_sent_at IS NULL OR up.chat_digest_sent_at < NOW() - INTERVAL '23 hours')
      GROUP BY u.id, u.email, u.name, up.notification_prefs
    `) as {
      user_id: string;
      email: string;
      name: string | null;
      notification_prefs: unknown;
      plans: { eventId: string; eventTitle: string; unreadCount: number }[];
    }[];

    let chatSkippedPref = 0;
    let chatSkippedEmpty = 0;
    let chatQueued = 0;

    if (chatRows.length > 0) {
      const userIds: string[] = [];
      const emailPromises: Promise<unknown>[] = [];

      for (const row of chatRows) {
        const prefs = normalizeNotificationPrefs(row.notification_prefs);
        if (prefs.items.unread_chat_digest?.enabled === false) { chatSkippedPref++; continue; }

        const plans = (Array.isArray(row.plans) ? row.plans : []).slice(0, 10);
        if (plans.length === 0) { chatSkippedEmpty++; continue; }

        const recipientName = row.name?.trim() || "there";

        let unsubscribeUrl = "";
        try {
          if (env.NEXTAUTH_SECRET) {
            const token = await createUnsubscribeToken(env.NEXTAUTH_SECRET, row.user_id, "unread_chat_digest");
            unsubscribeUrl = `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
          }
        } catch { /* skip token on failure */ }

        emailPromises.push(
          sendUnreadChatDigestEmail(env, {
            to: row.email,
            recipientName,
            plans: plans.map((p) => ({
              title: p.eventTitle,
              unreadCount: p.unreadCount,
              url: `${env.WEB_BASE_URL}/events/${p.eventId}?section=chat`,
            })),
            unsubscribeUrl,
          }),
        );
        userIds.push(row.user_id);
        chatQueued++;
      }

      if (userIds.length > 0) {
        ctx.waitUntil(
          Promise.allSettled(emailPromises).then(async (results) => {
            const failed = results.filter((r) => r.status === "rejected").length;
            if (failed > 0) console.error(`[chat-digest] ${failed}/${results.length} email sends failed`);
            await sql`
              UPDATE newchums.user_profile
              SET chat_digest_sent_at = NOW()
              WHERE user_id = ANY(${userIds}::uuid[])
            `;
          }),
        );
      }
    }

    console.log(`[chat-digest] eligible=${chatRows.length} skippedPref=${chatSkippedPref} skippedEmpty=${chatSkippedEmpty} queued=${chatQueued}`);
  } catch (err) {
    console.error("[scheduled] chat digest error:", err);
  }

  // Event match digest
  try {
    await processEventMatchDigest(sql, env, ctx);
  } catch (err) {
    console.error("[scheduled] event match digest error:", err);
  }

  // Post-plan feedback reminder emails
  try {
    await processPlanFeedbackEmails(sql, env, ctx);
  } catch (err) {
    console.error("[scheduled] plan feedback email error:", err);
  }

  // Local recognition badges (hourly refresh)
  try {
    await computeLocalBadges(sql);
  } catch (err) {
    console.error("[scheduled] local badges error:", err);
  }
}

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    fetch: app.fetch,
    scheduled: handleScheduled,
  } as ExportedHandler<Bindings>,
);
