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
  sendChatMessageNotifyEmail,
  sendChumInviteEmail,
  sendDmMessageNotifyEmail,
  sendContactFormEmail,
  sendEmailChangeConfirmEmail,
  sendEmailChangeNotifyOldEmail,
  sendEmailChangeSuccessEmail,
  sendEventChangedEmail,
  sendRsvpReconfirmRequestEmail,
  type PlanChangeItem,
  sendEventInviteEmail,
  sendEventJoinEmail,
  sendEventLeaveEmail,
  sendEventMaybeEmail,
  sendJoinRequestApprovedEmail,
  sendJoinRequestDeclinedEmail,
  sendJoinRequestEmail,
  sendPasswordResetEmail,
  sendEventMatchDigestEmail,
  formatEventMatchSeatLine,
  sendVerificationEmail,
  sendConfirmationRequestEmail,
  sendPlanAtRiskEmail,
  sendPlanAutoCancelledEmail,
  sendPlanRemovedByAdminEmail,
  sendRoadmapUpdateEmail,
  sendPlanFeedbackEmail,
  sendConcernReportAlert,
  sendCommunityJoinRequestEmail,
  sendCommunityJoinApprovedEmail,
  sendCommunityJoinDeclinedEmail,
  sendCommunityMemberRemovedEmail,
  sendCommunityMemberUnblockedEmail,
  sendCommunityJoinRequestReopenedEmail,
  sendCommunityAnnouncementEmail,
  sendMagicLinkSignupEmail,
  sendPlanSigninEmail,
  sendSigninLinkEmail,
} from "./email/send";
import { canAccessInternalTestRoute, notFound } from "./internalAccess";
import { nameToSlug, slugToName, validateInterestName } from "./interests";
import { ensureAppUserId } from "./profile";
import { generateResetToken, hashResetToken } from "./resetTokens";
import { isValidContactSubject } from "./lib/contact";
import {
  computePlanDeleteImpact,
  computeUserDeleteImpact,
  hardDeletePlan,
  hardDeleteUser,
} from "./lib/adminHardDelete";
import { checkDbRateLimit, isDbRateLimited, recordDbRateEvent } from "./lib/dbRateLimit";
import {
  generateOtpCode,
  parseSignupIntent,
  PLAN_SIGNUP_CODE_EXPIRY_MS,
  PLAN_SIGNUP_GRANT_EXPIRY_MS,
  PLAN_SIGNUP_OTP_MAX_ATTEMPTS,
  PLAN_SIGNUP_RESEND_COOLDOWN_SECONDS,
} from "./lib/planSignupOtp";
import {
  recordPlanCreationFunnelEvents,
  recordPlanSignupVerified,
  recordProductEvent,
  recordRsvpFunnelEvents,
  runAfterResponse,
} from "./lib/productEvents";
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
import { checkContactRateLimit, checkRateLimit } from "./lib/contactRateLimit";
import {
  countOwnedCommunities,
  isValidSubscriptionPlan,
  MAX_OWNED_COMMUNITIES,
  type SubscriptionPlan,
} from "./lib/subscriptionAccess";
import { htmlToPlainText } from "./lib/htmlToPlainText";
import {
  buildEmailEventLocation,
  deriveApproxArea,
  joinNameAndAddress,
  type EmailLocationInput,
  type EmailLocationRole,
} from "./lib/locationFormat";
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
  MAX_COMMUNITY_BANNER_BYTES,
  MAX_EVENT_BANNER_BYTES,
  MAX_ROADMAP_ATTACHMENT_BYTES,
  MAX_SCHEDULE_BLOCK_BANNER_BYTES,
  buildObjectKey,
  createUploadToken,
  validateMediaInit,
  verifyUploadToken,
} from "./media";
import {
  generateFunUsername,
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
  const allowedOrigin = origin && CORS_ALLOWED_ORIGINS.has(origin) ? origin : null;

  if (allowedOrigin) {
    c.header("Access-Control-Allow-Origin", allowedOrigin);
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

  // Handlers that return a raw `new Response(...)` (media streamed from R2:
  // avatars, event/community banners) bypass Hono's prepared headers, so the
  // headers set above never reach the client on those routes. Browser fetch()
  // of a banner (e.g. copy-a-plan carrying the image over) then fails CORS
  // even though <img> tags render fine. Re-apply CORS onto the final
  // response. Skip WebSocket upgrades (101 responses have immutable headers
  // on Workers).
  if (
    allowedOrigin &&
    c.res.status !== 101 &&
    !c.res.headers.has("Access-Control-Allow-Origin")
  ) {
    try {
      c.res.headers.set("Access-Control-Allow-Origin", allowedOrigin);
      c.res.headers.set("Vary", "Origin");
    } catch {
      /* immutable headers on this response type; leave it as-is */
    }
  }
});

// ─── Suspension guard + activity tracking ────────────────────────────────────
// Any authenticated request from a suspended user returns 403 immediately.
// Public routes (no Bearer token) are unaffected. The same users lookup feeds
// two activity trackers: the hourly-throttled users.last_active_at column
// (KPI active-user counts) and a per-request row in user_activity_log (the
// super-admin behavior drill-in; 90-day retention enforced by the hourly cron).
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
  let sql: ReturnType<typeof getSql> | null = null;
  let userId: string | null = null;
  try {
    sql = getSql(c.env);
    const rows = (await sql`
      SELECT id, is_suspended, last_active_at FROM users WHERE email = ${payload.email} LIMIT 1
    `) as { id: string; is_suspended: boolean; last_active_at: string | null }[];
    if (rows[0]?.is_suspended === true) {
      return c.json(
        { ok: false, error: { code: "USER_SUSPENDED", message: "Your account has been suspended." } },
        403,
      );
    }
    userId = rows[0]?.id ?? null;
    // Throttled activity tracking, at most once per hour per user
    const lastActive = rows[0]?.last_active_at ? new Date(rows[0].last_active_at).getTime() : 0;
    if (Date.now() - lastActive > 3_600_000) {
      sql`UPDATE newchums.users SET last_active_at = NOW() WHERE email = ${payload.email}`.catch(() => {});
    }
  } catch {
    // If DB lookup fails, allow the request through, individual routes will fail safely.
  }
  await next();
  // Per-request activity log. Path only, never the query string (magic-link
  // and invite tokens travel in query params). `route` is the pattern of the
  // handler that actually responded (e.g. /events/:id) so requests can be
  // grouped by surface. matchedRoutes lists every pattern the router matched
  // (middleware and overlapping routes like /events/explore vs /events/:id),
  // so index by routeIndex rather than scanning; middleware entries carry
  // method ALL / path "*" and are stored as null (as are 404s).
  if (userId && sql) {
    const matched = c.req.matchedRoutes[c.req.routeIndex];
    const routeEntry = matched && matched.method !== "ALL" && matched.path !== "*" ? matched : null;
    const pathname = new URL(c.req.url).pathname.slice(0, 300);
    const insert = sql`
      INSERT INTO newchums.user_activity_log (user_id, method, path, route, status)
      VALUES (${userId}, ${c.req.method}, ${pathname}, ${routeEntry?.path ?? null}, ${c.res.status})
    `.catch(() => {});
    try {
      c.executionCtx.waitUntil(insert);
    } catch {
      // executionCtx unavailable (e.g. tests); the insert still runs fire-and-forget.
    }
  }
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
        u.avatar_key, u.avatar_updated_at, u.created_at,
        COALESCE(u.is_hidden_age, false) AS is_hidden_age,
        COALESCE(u.is_hidden_from_external_indexing, false) AS is_hidden_from_external_indexing,
        COALESCE(u.is_hidden_chum_list, false) AS is_hidden_chum_list,
        COALESCE(u.is_hidden_shoutouts, false) AS is_hidden_shoutouts,
        COALESCE(u.is_hidden_communities, false) AS is_hidden_communities,
        COALESCE(u.is_suspended, false) AS is_suspended,
        COALESCE(u.dm_privacy, 'everyone') AS dm_privacy
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
      created_at: string | Date | null;
      is_hidden_age: boolean;
      is_hidden_from_external_indexing: boolean;
      is_hidden_chum_list: boolean;
      is_hidden_shoutouts: boolean;
      is_hidden_communities: boolean;
      is_suspended: boolean;
      dm_privacy: string;
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

    // Account creation date drives the "Joined {Month Year}" trust line in
    // the public profile hero. Returned as an ISO string when present so the
    // client doesn't have to deal with the underlying driver type variance.
    const memberSince = user.created_at
      ? typeof user.created_at === "string"
        ? user.created_at
        : (user.created_at as Date).toISOString()
      : null;

    // Can the authenticated viewer message this person? Powers the profile's
    // "Message" button. False for logged-out viewers, self, suspended
    // targets, blocked pairs, and privacy-denied new conversations; an
    // existing conversation always allows (replies bypass dm_privacy).
    let viewerCanMessage = false;
    if (viewerAuthenticated && authPayload?.email && !user.is_suspended) {
      try {
        const viewerId = await ensureAppUserId(sql, authPayload.email, (authPayload as { name?: string | null }).name);
        if (viewerId !== user.id && !(await dmPairBlocked(sql, viewerId, user.id))) {
          const [pairA, pairB] = dmPair(viewerId, user.id);
          const existing = (await sql`
            SELECT 1 FROM newchums.dm_conversations WHERE user_a = ${pairA} AND user_b = ${pairB} LIMIT 1
          `) as unknown[];
          viewerCanMessage = existing.length > 0
            ? true
            : await dmCanStartConversation(sql, viewerId, { id: user.id, dm_privacy: user.dm_privacy });
        }
      } catch {
        // Non-essential enrichment; leave viewerCanMessage false on error.
      }
    }

    return c.json({
      ok: true,
      viewerCanMessage,
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
        memberSince,
        is_hidden_from_external_indexing: user.is_hidden_from_external_indexing ?? false,
        is_hidden_chum_list: user.is_hidden_chum_list ?? false,
        is_hidden_shoutouts: user.is_hidden_shoutouts ?? false,
        is_hidden_communities: user.is_hidden_communities ?? false,
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
        AND COALESCE(e.is_qa, false) = false
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

    // Two distinct reliability metrics derived from one base scan:
    //
    // Going follow-through: of plans the user committed to (committed_at set),
    //   how many they're still 'going' on. Captures backing out (Going→Maybe
    //   or Going→Can't make it) ahead of the event.
    //
    // Shows up: of plans the user *stayed* committed to (still 'going' at
    //   query time), how many they were NOT reported as a no-show / very-late
    //   on. Merely backing out ahead of time neither helps nor hurts this
    //   metric, the plan leaves both sides of the ratio. Only an attendance
    //   issue against a still-'going' RSVP moves the needle.
    //
    // Includes both hosted and attended plans, the host is expected to show
    // up too. QA and cancelled plans are filtered out.
    const followThrough = (await sql`
      SELECT
        COUNT(*)::int AS total_committed,
        COUNT(*) FILTER (WHERE r.status = 'going')::int AS going_kept,
        COUNT(*) FILTER (
          WHERE r.status = 'going'
          AND NOT EXISTS (
            SELECT 1 FROM newchums.attendance_issues ai
            WHERE ai.plan_id = e.id
              AND ai.reported_user_id = r.user_id
              AND ai.issue_type IN ('no_show', 'very_late')
              AND COALESCE(ai.status, 'active') != 'dismissed'
          )
        )::int AS shown_up
      FROM newchums.event_rsvps r
      JOIN newchums.events e ON e.id = r.event_id
      WHERE r.user_id = ${targetUserId}
        AND r.committed_at IS NOT NULL
        AND e.status != 'canceled'
        AND COALESCE(e.is_qa, false) = false
        AND e.starts_at < ${now}
    `) as { total_committed: number; going_kept: number; shown_up: number }[];

    const confirmation = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE ec.status IN ('confirmed', 'declined'))::int AS responded,
        COUNT(*)::int AS total_requested
      FROM newchums.event_confirmations ec
      JOIN newchums.events e ON e.id = ec.event_id
      WHERE ec.user_id = ${targetUserId}
        AND COALESCE(e.is_qa, false) = false
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
            AND er.user_id IS DISTINCT FROM e.host_user_id
            AND er.committed_at IS NOT NULL
        )
        AND COALESCE(e.cancellation_reason, '') NOT IN ('no_attendees', 'min_attendees_required_not_met')
    `) as { completed: number; total_hosted: number }[];

    return c.json({
      ok: true,
      record: {
        goingFollowThrough: {
          numerator: followThrough[0]?.going_kept ?? 0,
          denominator: followThrough[0]?.total_committed ?? 0,
        },
        // "Shows up" denominator is the count of plans the user STAYED
        // committed to (still 'going' at query time), same as goingKept;
        // so backing out before the event drops the plan from both sides
        // rather than penalizing this metric.
        followThrough: {
          numerator: followThrough[0]?.shown_up ?? 0,
          denominator: followThrough[0]?.going_kept ?? 0,
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

      // Adopt any pending email-only invites matching this email so the new user
      // shows up as "invited" on plans they were invited to before signing up.
      try {
        await sql`
          UPDATE newchums.event_invites
          SET user_id = ${newUserId}
          WHERE LOWER(email) = ${normalizedEmail} AND user_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM newchums.event_invites i2
              WHERE i2.event_id = event_invites.event_id AND i2.user_id = ${newUserId}
            )
        `;
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
  // Intentionally allow accounts with password_hash IS NULL to proceed. That
  // state covers both Google-OAuth-only accounts and lightweight plan-signup
  // accounts (which never collect a password at RSVP time), and in both
  // cases letting the reset flow set a password is the right recovery path:
  // lightweight users get a way back in without another plan-signup link,
  // and Google users gain an optional second sign-in method alongside Google
  // without disturbing their existing flow.

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
  // Setting a password via reset also closes out any pending lightweight-
  // signup setup state so the product stops nudging the user to finish.
  await sql`
    UPDATE users
    SET password_hash = ${passwordHash},
        password_setup_pending = FALSE
    WHERE id = ${record.user_id}
  `;
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
    SELECT id, email_verified_at FROM users WHERE email = ${normalizedEmail} LIMIT 1
  `) as { id: string; email_verified_at: string | null }[];
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

  // Funnel event: classic email+password signup finished verification. Only
  // on the NULL -> set transition so a re-confirm never double-counts.
  if (!users[0].email_verified_at) {
    runAfterResponse(
      c,
      recordProductEvent(sql, {
        name: "signup_completed",
        userId: users[0].id,
        params: { method: "password" },
      }),
    );
  }
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

// Public suggestion endpoint used by the signup form to pre-fill the username
// field. Uses the same <Adjective><Animal><###> generator as lightweight
// plan-signup, and checks uniqueness against username_norm before returning.
app.get("/auth/username/suggest", async (c) => {
  const sql = getSql(c.env);
  try {
    const username = await generateFunUsername(sql);
    return c.json({ ok: true, username });
  } catch (err) {
    console.error("[auth/username/suggest] generateFunUsername failed", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
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
  const marked = (await sql`
    UPDATE users
    SET email_verified_at = COALESCE(email_verified_at, NOW())
    WHERE email = ${normalized} AND email_verified_at IS NULL
    RETURNING id
  `) as { id: string }[];
  // Funnel event: the UPDATE only matches on the first (NULL -> set)
  // transition, so a returned row means a Google-OAuth signup just completed.
  if (marked.length > 0) {
    runAfterResponse(
      c,
      recordProductEvent(sql, {
        name: "signup_completed",
        userId: marked[0].id,
        params: { method: "google" },
      }),
    );
  }
  return c.json({ ok: true });
});

// ---- Lightweight plan signup (magic link) ----
//
// Replaces the old guest participation flow. Unauthenticated visitors on a
// plan's share/invite link fill in email + DOB + legal-acceptance checkbox
// and submit to this endpoint. The server either:
//   - redirects existing accounts to /login via a notice email
//   - creates a new user row and emails a one-time magic link that signs
//     them in and returns them to the plan URL
//
// Magic-link tokens live in the existing `email_verification_tokens` table
// (15-minute TTL, hashed with hashResetToken, single-use).

/** Server-pinned current legal versions. Clients must not set these. */
const CURRENT_TERMS_VERSION = "2026-03-17";
const CURRENT_PRIVACY_VERSION = "2026-03-17";
const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const PLAN_SIGNUP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const PLAN_SIGNUP_RATE_LIMIT_PER_IP = 10;
const PLAN_SIGNUP_RATE_LIMIT_PER_EMAIL = 3;
/** Code-verify guesses allowed per IP per window, across all emails. */
const PLAN_SIGNUP_VERIFY_RATE_LIMIT_PER_IP = 30;

/** Sanitize the `next` URL to a relative same-origin path; fallback to "/". */
function sanitizePlanSignupNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed) return "/";
  // Must be a relative path starting with "/", and must not be protocol-relative ("//...")
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  return trimmed;
}

app.post("/auth/plan-signup/request", async (c) => {
  let body: {
    email?: string;
    date_of_birth?: string;
    accepted_legal?: boolean;
    turnstile_token?: string;
    next?: string;
    intent?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const dob = body.date_of_birth?.trim() ?? "";
  const acceptedLegal = body.accepted_legal === true;
  const turnstileToken = typeof body.turnstile_token === "string" ? body.turnstile_token : "";
  const next = sanitizePlanSignupNext(body.next);
  const intent = parseSignupIntent(body.intent);

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return c.json({ ok: false, error: "INVALID_EMAIL" }, 400);
  }
  // Intentionally no password collection here. This endpoint creates a
  // real account but flags password_setup_pending = TRUE so the product
  // can prompt the user to finish setup after they land back on the plan.
  if (!acceptedLegal) {
    return c.json({ ok: false, error: "LEGAL_REQUIRED" }, 400);
  }
  const parts = parseDateOnly(dob);
  if (!parts) {
    return c.json({ ok: false, error: "INVALID_DATE" }, 400);
  }
  const today = new Date();
  const birth = new Date(parts.y, parts.m - 1, parts.d);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (birth > todayMidnight) {
    return c.json({ ok: false, error: "FUTURE_DATE" }, 400);
  }
  if (!isAtLeast18(dob)) {
    return c.json(
      {
        ok: false,
        error: "UNDERAGE",
        message: "NewChums is currently available to people 18 and older.",
      },
      400,
    );
  }
  const parsedDob = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;

  const requestIp =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";

  const sql = getSql(c.env);

  // Rate-limit both by IP and by email so bots can't sweep either axis.
  // Postgres-backed (migration 104): the KV limiter is a no-op in production
  // because the KV binding is not provisioned. Buckets are shared with the
  // resend endpoint so total issuance stays bounded across both.
  const ipLimit = await checkDbRateLimit(
    sql,
    `plan-signup:ip:${requestIp}`,
    PLAN_SIGNUP_RATE_LIMIT_PER_IP,
    PLAN_SIGNUP_RATE_LIMIT_WINDOW_MS,
  );
  if (!ipLimit.allowed) {
    return c.json({ ok: false, error: "RATE_LIMITED" }, 429);
  }
  const emailLimit = await checkDbRateLimit(
    sql,
    `plan-signup:email:${email}`,
    PLAN_SIGNUP_RATE_LIMIT_PER_EMAIL,
    PLAN_SIGNUP_RATE_LIMIT_WINDOW_MS,
  );
  if (!emailLimit.allowed) {
    return c.json({ ok: false, error: "RATE_LIMITED" }, 429);
  }
  // Send cooldown: only charged after an email actually goes out (see the
  // recordDbRateEvent call below), so a validation failure here never locks
  // the user out of retrying. Applies to the code-email branch only; the
  // existing-account branch keeps its prior behavior.
  const cooldownBucket = `plan-signup:cooldown:${email}`;
  const underCooldown = await isDbRateLimited(
    sql,
    cooldownBucket,
    1,
    PLAN_SIGNUP_RESEND_COOLDOWN_SECONDS * 1000,
  );

  // Turnstile: unauthenticated endpoint. Required when the secret is configured.
  if (c.env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return c.json({ ok: false, error: "TURNSTILE_REQUIRED" }, 400);
    }
    const verifyResult = await verifyTurnstileToken(turnstileToken, c.env.TURNSTILE_SECRET_KEY, requestIp);
    if (!verifyResult.success) {
      return c.json({ ok: false, error: "TURNSTILE_FAILED" }, 400);
    }
  }

  // Pull plan title for email context, if `next` points at a plan URL.
  // Failure to resolve is non-fatal; email just uses "a plan" as a fallback.
  // planId is only kept when the row exists so the token INSERT's event_id
  // FK (migration 104) can never fail on a bogus URL, and the stored RSVP
  // intent is only meaningful when tied to a real plan.
  let planTitle = "a plan";
  let planId: string | null = null;
  try {
    const planIdMatch = next.match(/^\/events\/([a-zA-Z0-9-]+)(?:[/?].*)?$/);
    if (planIdMatch?.[1]) {
      const rows = (await sql`
        SELECT id, title FROM newchums.events WHERE id = ${planIdMatch[1]} LIMIT 1
      `) as { id: string; title: string | null }[];
      if (rows[0]) {
        planId = rows[0].id;
        if (rows[0].title) planTitle = rows[0].title;
      }
    }
  } catch {
    // ignore; planTitle remains "a plan"
  }
  const storedIntent = planId ? intent : null;

  // Branch on account state.
  const existing = (await sql`
    SELECT id, email_verified_at, is_suspended
    FROM newchums.users
    WHERE email = ${email}
    LIMIT 1
  `) as { id: string; email_verified_at: string | null; is_suspended: boolean }[];

  if (existing.length > 0 && existing[0].email_verified_at) {
    // Verified existing account: no DB writes, no magic link. Send a signin-notice
    // email pointing at /login?next=<plan>. Client redirects to the same URL.
    if (existing[0].is_suspended) {
      // Uniform response for suspended accounts, don't leak suspension state to a stranger.
      return c.json({ ok: true, state: "existing_account", next });
    }
    const loginUrl = `${c.env.WEB_BASE_URL}/login?next=${encodeURIComponent(next)}`;
    try {
      await sendPlanSigninEmail(c.env, { to: email, loginUrl, planTitle });
    } catch (err) {
      console.error("[plan-signup] sendPlanSigninEmail failed", err);
      // Still return existing_account; client will redirect to /login and the user can log in without the email.
    }
    return c.json({ ok: true, state: "existing_account", next });
  }

  // New or unverified account: create/update user row and issue a magic-link token.
  let userId: string;
  if (existing.length > 0 && !existing[0].email_verified_at) {
    // Abandoned credential signup or previous lightweight-signup that didn't complete.
    // Refresh DOB + legal fields so an attacker can't rotate under-age / over-age submissions.
    // password_setup_pending is left untouched so a user mid-setup is not
    // demoted out of their pending state by a re-submission.
    userId = existing[0].id;
    await sql`
      UPDATE newchums.users
      SET date_of_birth = ${parsedDob},
          accepted_terms_version = ${CURRENT_TERMS_VERSION},
          accepted_privacy_version = ${CURRENT_PRIVACY_VERSION},
          accepted_legal_at = NOW()
      WHERE id = ${userId}
    `;
  } else {
    // Fresh account. No password is collected here; the user is flagged
    // password_setup_pending so the product nudges them to set one after
    // they land back on the plan.
    const username = await generateFunUsername(sql);
    const usernameNorm = username.toLowerCase();
    const inserted = (await sql`
      INSERT INTO newchums.users (
        email, username, username_norm, date_of_birth, email_verified_at, password_hash,
        password_setup_pending,
        accepted_terms_version, accepted_privacy_version, accepted_legal_at
      )
      VALUES (
        ${email}, ${username}, ${usernameNorm}, ${parsedDob}, NULL, NULL,
        TRUE,
        ${CURRENT_TERMS_VERSION}, ${CURRENT_PRIVACY_VERSION}, NOW()
      )
      RETURNING id
    `) as { id: string }[];
    userId = inserted[0]?.id;
    if (!userId) {
      console.error("[plan-signup] INSERT returned no id");
      return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
    }
    // Create a minimal user_profile row so later /profile updates have something to UPDATE.
    try {
      const defaultPrefsJson = getDefaultPrefsJson();
      await sql`
        INSERT INTO user_profile (
          user_id, home_city, home_lat, home_lng, home_location, travel_radius_km,
          email_chat_digest, email_new_events, bio, notification_prefs
        )
        VALUES (
          ${userId}, NULL, NULL, NULL, NULL, NULL,
          true, true, NULL, ${defaultPrefsJson}::jsonb
        )
      `;
    } catch (err) {
      // user_profile row is auxiliary; failure here shouldn't block signup.
      console.error("[plan-signup] user_profile insert failed (non-fatal)", err);
    }
  }

  // Cooldown gate for the code-email branch. Checked read-only up front and
  // charged only after a successful send, so a Turnstile or validation
  // failure never locks the user out of retrying.
  if (underCooldown) {
    return c.json(
      { ok: false, error: "COOLDOWN", retry_after_seconds: PLAN_SIGNUP_RESEND_COOLDOWN_SECONDS },
      429,
    );
  }

  const issued = await issuePlanSignupCodeEmail(sql, c.env, {
    userId,
    email,
    next,
    planId,
    planTitle,
    intent: storedIntent,
  });
  if (!issued.ok) {
    return c.json({ ok: false, error: "EMAIL_SEND_FAILED" }, 500);
  }
  await recordDbRateEvent(sql, cooldownBucket);
  runAfterResponse(
    c,
    recordProductEvent(sql, {
      name: "signup_email_sent",
      userId,
      eventId: planId,
      params: { kind: "initial" },
    }),
  );

  return c.json({
    ok: true,
    state: "pending",
    next,
    resend_cooldown_seconds: PLAN_SIGNUP_RESEND_COOLDOWN_SECONDS,
  });
});

/**
 * Mint the plan-signup credentials (6-digit code + magic-link token on ONE
 * email_verification_tokens row) and send the email carrying both. Prior
 * unused tokens are invalidated first (last-issued-wins). On send failure
 * the fresh row is rolled back so no dead-end credential stays active.
 * Shared by /auth/plan-signup/request and /auth/plan-signup/resend.
 *
 * The raw code exists only in this scope and the outbound email. Never log it.
 */
async function issuePlanSignupCodeEmail(
  sql: ReturnType<typeof getSql>,
  env: Bindings,
  args: {
    userId: string;
    email: string;
    next: string;
    planId: string | null;
    planTitle: string;
    intent: "going" | "maybe" | null;
  },
): Promise<{ ok: boolean }> {
  await sql`
    UPDATE newchums.email_verification_tokens
    SET used_at = NOW()
    WHERE user_id = ${args.userId} AND used_at IS NULL
  `;
  const rawToken = generateResetToken();
  const tokenHash = await hashResetToken(rawToken);
  const otpCode = generateOtpCode();
  const otpHash = await hashResetToken(otpCode);
  const expiresAt = new Date(Date.now() + PLAN_SIGNUP_CODE_EXPIRY_MS);
  await sql`
    INSERT INTO newchums.email_verification_tokens (user_id, token_hash, expires_at, otp_hash, event_id, signup_intent)
    VALUES (${args.userId}, ${tokenHash}, ${expiresAt}, ${otpHash}, ${args.planId}, ${args.intent})
  `;

  const confirmUrl = `${env.WEB_BASE_URL}/auth/magic?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(args.email)}&next=${encodeURIComponent(args.next)}`;
  try {
    await sendMagicLinkSignupEmail(env, {
      to: args.email,
      confirmUrl,
      planTitle: args.planTitle,
      otpCode,
    });
  } catch (err) {
    console.error("[plan-signup] sendMagicLinkSignupEmail failed", err);
    await sql`
      UPDATE newchums.email_verification_tokens
      SET used_at = NOW()
      WHERE user_id = ${args.userId} AND token_hash = ${tokenHash}
    `;
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Verify the 6-digit plan-signup code typed on the plan page (B1).
 *
 * Security model: codes are single use, expire with the row (10 min), are
 * invalidated after PLAN_SIGNUP_OTP_MAX_ATTEMPTS failed guesses (counter
 * incremented atomically BEFORE comparison so parallel guesses can't dodge
 * the cap), and only the newest row is ever active (issuance invalidates
 * prior rows, so two devices resolve as last-issued-wins). Per-IP request
 * cap on top. Responses for "no such account" and "no active code" are the
 * same CODE_EXPIRED so the endpoint is not an account-existence oracle.
 * Raw codes are never logged.
 *
 * On success this endpoint verifies the email (same NULL-to-set transition
 * guard as magic-link consume, firing the same product events exactly once)
 * and returns a short-lived single-use session-grant token. The client
 * exchanges that grant through the EXISTING Auth.js magic-link provider
 * (signIn("magic-link") -> /auth/magic-link/consume), so session issuance
 * has exactly one code path and consume's semantics stay untouched; the
 * grant consume is a no-op for verification because the user is already
 * verified by then.
 */
app.post("/auth/plan-signup/verify-code", async (c) => {
  let body: { email?: string; code?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "INVALID_JSON" }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)) {
    return c.json({ ok: false, error: "INVALID_INPUT" }, 400);
  }

  const requestIp =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";
  const sql = getSql(c.env);
  const ipLimit = await checkDbRateLimit(
    sql,
    `plan-signup-verify:ip:${requestIp}`,
    PLAN_SIGNUP_VERIFY_RATE_LIMIT_PER_IP,
    PLAN_SIGNUP_RATE_LIMIT_WINDOW_MS,
  );
  if (!ipLimit.allowed) {
    return c.json({ ok: false, error: "RATE_LIMITED" }, 429);
  }

  const users = (await sql`
    SELECT id, email, name, is_suspended, email_verified_at
    FROM newchums.users
    WHERE email = ${email}
    LIMIT 1
  `) as { id: string; email: string; name: string | null; is_suspended: boolean; email_verified_at: string | null }[];
  if (users.length === 0) {
    // Uniform with "no active code" below; no account-existence oracle.
    return c.json({ ok: false, error: "CODE_EXPIRED" }, 400);
  }
  const user = users[0];

  const tokenRows = (await sql`
    SELECT id, otp_hash, event_id, signup_intent
    FROM newchums.email_verification_tokens
    WHERE user_id = ${user.id}
      AND otp_hash IS NOT NULL
      AND used_at IS NULL
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `) as { id: string; otp_hash: string; event_id: string | null; signup_intent: string | null }[];
  if (tokenRows.length === 0) {
    return c.json({ ok: false, error: "CODE_EXPIRED" }, 400);
  }
  const tokenRow = tokenRows[0];

  const codeHash = await hashResetToken(code);

  if (codeHash !== tokenRow.otp_hash) {
    // Stale-code check: a code from a superseded or expired row (the user
    // requested a resend, or two devices raced) reads as "we sent a newer
    // one" and does NOT burn an attempt on the active code. Only genuine
    // wrong guesses count toward the cap.
    const stale = (await sql`
      SELECT 1 AS one FROM newchums.email_verification_tokens
      WHERE user_id = ${user.id}
        AND otp_hash = ${codeHash}
        AND id != ${tokenRow.id}
        AND created_at > NOW() - INTERVAL '1 day'
      LIMIT 1
    `) as unknown[];
    if (stale.length > 0) {
      return c.json({ ok: false, error: "CODE_EXPIRED" }, 400);
    }
    // Wrong guess: count it atomically so concurrent guesses can't dodge
    // the cap, then invalidate the row on the final allowed failure.
    const bumped = (await sql`
      UPDATE newchums.email_verification_tokens
      SET otp_attempts = otp_attempts + 1
      WHERE id = ${tokenRow.id} AND used_at IS NULL
      RETURNING otp_attempts
    `) as { otp_attempts: number }[];
    if (bumped.length === 0) {
      // Raced with a concurrent consume/invalidate.
      return c.json({ ok: false, error: "CODE_EXPIRED" }, 400);
    }
    const attempts = bumped[0].otp_attempts;
    if (attempts >= PLAN_SIGNUP_OTP_MAX_ATTEMPTS) {
      await sql`UPDATE newchums.email_verification_tokens SET used_at = NOW() WHERE id = ${tokenRow.id}`;
      return c.json({ ok: false, error: "CODE_ATTEMPTS_EXCEEDED" }, 400);
    }
    return c.json(
      { ok: false, error: "CODE_INCORRECT", attempts_remaining: PLAN_SIGNUP_OTP_MAX_ATTEMPTS - attempts },
      400,
    );
  }

  if (user.is_suspended) {
    // Mirror magic-link consume: suspended users don't burn the credential.
    return c.json({ ok: false, error: "ACCOUNT_SUSPENDED" }, 403);
  }

  // Correct code: burn the row single-use (the conditional UPDATE makes
  // concurrent correct submissions race safely; the loser sees zero rows),
  // then invalidate any stale unused siblings.
  const burned = (await sql`
    UPDATE newchums.email_verification_tokens SET used_at = NOW()
    WHERE id = ${tokenRow.id} AND used_at IS NULL
    RETURNING id
  `) as { id: string }[];
  if (burned.length === 0) {
    return c.json({ ok: false, error: "CODE_EXPIRED" }, 400);
  }
  await sql`
    UPDATE newchums.email_verification_tokens SET used_at = NOW()
    WHERE user_id = ${user.id} AND used_at IS NULL
  `;
  await sql`UPDATE newchums.users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ${user.id}`;
  if (!user.email_verified_at) {
    runAfterResponse(c, recordPlanSignupVerified(sql, user.id));
  }

  const grantRaw = generateResetToken();
  const grantHash = await hashResetToken(grantRaw);
  const grantExpires = new Date(Date.now() + PLAN_SIGNUP_GRANT_EXPIRY_MS);
  await sql`
    INSERT INTO newchums.email_verification_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${grantHash}, ${grantExpires})
  `;

  return c.json({
    ok: true,
    grant_token: grantRaw,
    intent: tokenRow.signup_intent,
    event_id: tokenRow.event_id,
  });
});

/**
 * Re-send the plan-signup code email (B1). No Turnstile here (the widget's
 * token is single use and a re-solve mid-flow is hostile UX); abuse is
 * bounded instead by the same Postgres issuance caps as the request
 * endpoint (shared buckets) plus the per-email cooldown. Responds ok
 * uniformly whether or not a pending signup exists, so it is not an
 * account-existence oracle. Only acts on accounts that are unverified and
 * not suspended; anyone else silently gets nothing.
 */
app.post("/auth/plan-signup/resend", async (c) => {
  let body: { email?: string; next?: string; intent?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "INVALID_JSON" }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  const next = sanitizePlanSignupNext(body.next);
  const intent = parseSignupIntent(body.intent);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return c.json({ ok: false, error: "INVALID_EMAIL" }, 400);
  }

  const requestIp =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";
  const sql = getSql(c.env);

  const ipLimit = await checkDbRateLimit(
    sql,
    `plan-signup:ip:${requestIp}`,
    PLAN_SIGNUP_RATE_LIMIT_PER_IP,
    PLAN_SIGNUP_RATE_LIMIT_WINDOW_MS,
  );
  if (!ipLimit.allowed) return c.json({ ok: false, error: "RATE_LIMITED" }, 429);
  const emailLimit = await checkDbRateLimit(
    sql,
    `plan-signup:email:${email}`,
    PLAN_SIGNUP_RATE_LIMIT_PER_EMAIL,
    PLAN_SIGNUP_RATE_LIMIT_WINDOW_MS,
  );
  if (!emailLimit.allowed) return c.json({ ok: false, error: "RATE_LIMITED" }, 429);

  const cooldownBucket = `plan-signup:cooldown:${email}`;
  const underCooldown = await isDbRateLimited(
    sql,
    cooldownBucket,
    1,
    PLAN_SIGNUP_RESEND_COOLDOWN_SECONDS * 1000,
  );
  if (underCooldown) {
    return c.json(
      { ok: false, error: "COOLDOWN", retry_after_seconds: PLAN_SIGNUP_RESEND_COOLDOWN_SECONDS },
      429,
    );
  }

  const users = (await sql`
    SELECT id, is_suspended, email_verified_at
    FROM newchums.users
    WHERE email = ${email}
    LIMIT 1
  `) as { id: string; is_suspended: boolean; email_verified_at: string | null }[];
  const user = users[0];
  if (!user || user.is_suspended || user.email_verified_at) {
    // Uniform response; nothing to resend for verified/unknown/suspended.
    return c.json({ ok: true, resend_cooldown_seconds: PLAN_SIGNUP_RESEND_COOLDOWN_SECONDS });
  }

  // Resolve plan context: prefer the client-provided next URL, fall back to
  // the latest stored row (covers a client that lost its URL state).
  let planTitle = "a plan";
  let planId: string | null = null;
  try {
    const planIdMatch = next.match(/^\/events\/([a-zA-Z0-9-]+)(?:[/?].*)?$/);
    const candidateId = planIdMatch?.[1] ?? null;
    if (candidateId) {
      const rows = (await sql`
        SELECT id, title FROM newchums.events WHERE id = ${candidateId} LIMIT 1
      `) as { id: string; title: string | null }[];
      if (rows[0]) {
        planId = rows[0].id;
        if (rows[0].title) planTitle = rows[0].title;
      }
    }
    if (!planId) {
      const prior = (await sql`
        SELECT t.event_id, e.title
        FROM newchums.email_verification_tokens t
        LEFT JOIN newchums.events e ON e.id = t.event_id
        WHERE t.user_id = ${user.id} AND t.event_id IS NOT NULL
        ORDER BY t.created_at DESC
        LIMIT 1
      `) as { event_id: string | null; title: string | null }[];
      if (prior[0]?.event_id) {
        planId = prior[0].event_id;
        if (prior[0].title) planTitle = prior[0].title;
      }
    }
  } catch {
    // non-fatal; email copy falls back to "a plan"
  }
  const storedIntent = planId ? intent : null;

  const issued = await issuePlanSignupCodeEmail(sql, c.env, {
    userId: user.id,
    email,
    next,
    planId,
    planTitle,
    intent: storedIntent,
  });
  if (!issued.ok) {
    return c.json({ ok: false, error: "EMAIL_SEND_FAILED" }, 500);
  }
  await recordDbRateEvent(sql, cooldownBucket);
  runAfterResponse(
    c,
    recordProductEvent(sql, {
      name: "signup_email_sent",
      userId: user.id,
      eventId: planId,
      params: { kind: "resend" },
    }),
  );
  return c.json({ ok: true, resend_cooldown_seconds: PLAN_SIGNUP_RESEND_COOLDOWN_SECONDS });
});

/**
 * Request a sign-in magic link for accounts where password setup is still
 * pending. Intended for the legacy return-visit case: a user created via
 * the lightweight plan-entry flow never set a password, and now they're
 * trying to sign in. Rather than leave them stuck on the password form
 * with a confusing error, the login page surfaces a "send me a sign-in
 * link" action that calls this endpoint.
 *
 * For any other account state (password set, or account does not exist)
 * the endpoint returns ok regardless so we don't reveal account existence
 * to a stranger probing emails; only pending accounts actually receive
 * an email.
 *
 * Rate limits mirror plan-signup so a bad actor can't sweep either axis.
 */
app.post("/auth/signin-link/request", async (c) => {
  let body: { email?: string; turnstile_token?: string; next?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "INVALID_JSON" }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  const turnstileToken = typeof body.turnstile_token === "string" ? body.turnstile_token : "";
  // Ignore any client-supplied `next` for this flow. The recipient is a
  // lightweight-signup user who never set a password; landing them on the
  // Explore feed (the default) means they'd just hit the same problem
  // again on next sign-out. Hard-coding `/settings#account` here drops
  // them on the password-setup section so the PasswordSetupBanner's CTA
  // and the in-page "Set a password" form are both immediately visible
  // and they can finish setup in one step.
  const next = "/settings#account";

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return c.json({ ok: false, error: "INVALID_EMAIL" }, 400);
  }

  const requestIp =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";
  const ipLimit = await checkRateLimit(
    c.env.CONTACT_RATELIMIT_KV,
    `signin-link:ip:${requestIp}`,
    PLAN_SIGNUP_RATE_LIMIT_PER_IP,
    PLAN_SIGNUP_RATE_LIMIT_WINDOW_MS,
  );
  if (!ipLimit.allowed) return c.json({ ok: false, error: "RATE_LIMITED" }, 429);
  const emailLimit = await checkRateLimit(
    c.env.CONTACT_RATELIMIT_KV,
    `signin-link:email:${email}`,
    PLAN_SIGNUP_RATE_LIMIT_PER_EMAIL,
    PLAN_SIGNUP_RATE_LIMIT_WINDOW_MS,
  );
  if (!emailLimit.allowed) return c.json({ ok: false, error: "RATE_LIMITED" }, 429);

  if (c.env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) return c.json({ ok: false, error: "TURNSTILE_REQUIRED" }, 400);
    const verifyResult = await verifyTurnstileToken(turnstileToken, c.env.TURNSTILE_SECRET_KEY, requestIp);
    if (!verifyResult.success) return c.json({ ok: false, error: "TURNSTILE_FAILED" }, 400);
  }

  const sql = getSql(c.env);
  const rows = (await sql`
    SELECT id, is_suspended, password_setup_pending
    FROM newchums.users
    WHERE email = ${email}
    LIMIT 1
  `) as { id: string; is_suspended: boolean; password_setup_pending: boolean }[];

  // Only issue a link for real pending accounts. For any other state (no
  // account, password set, suspended) return ok silently so an attacker
  // can't distinguish pending from non-pending via the response.
  const user = rows[0];
  if (!user || user.is_suspended || !user.password_setup_pending) {
    return c.json({ ok: true });
  }

  await sql`
    UPDATE newchums.email_verification_tokens SET used_at = NOW()
    WHERE user_id = ${user.id} AND used_at IS NULL
  `;
  const rawToken = generateResetToken();
  const tokenHash = await hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);
  await sql`
    INSERT INTO newchums.email_verification_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${tokenHash}, ${expiresAt})
  `;

  const confirmUrl = `${c.env.WEB_BASE_URL}/auth/magic?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`;
  // Use the dedicated sign-in-link template instead of the lightweight-
  // signup confirmation template. The two flows look the same on the wire
  // (both consume an email_verification_tokens row) but the recipient's
  // mental model is different: this is a returning account, not a fresh
  // signup, so "Confirm to finish signing up" / "create your NewChums
  // account" copy was misleading. See sendSigninLinkEmail in send.ts.
  try {
    await sendSigninLinkEmail(c.env, { to: email, confirmUrl });
  } catch (err) {
    console.error("[signin-link] sendSigninLinkEmail failed", err);
    await sql`
      UPDATE newchums.email_verification_tokens
      SET used_at = NOW()
      WHERE user_id = ${user.id} AND token_hash = ${tokenHash}
    `;
    return c.json({ ok: false, error: "EMAIL_SEND_FAILED" }, 500);
  }

  return c.json({ ok: true });
});

/**
 * First-time password setup for lightweight-signup accounts. Unlike
 * /auth/profile/change-password this does not require a current password,
 * because the whole point of password_setup_pending = TRUE is that the
 * account has never had one. The endpoint is only willing to set a
 * password when:
 *   - the caller is authenticated, and
 *   - the account is currently flagged password_setup_pending.
 *
 * On success we hash + store the password and flip the flag off. Any
 * outstanding sign-in-link tokens are invalidated so a stale magic
 * link can't act as a backdoor after the user has a real credential.
 */
app.post("/auth/password/set", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "INVALID_JSON" }, 400);
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length < 8) {
    return c.json({ ok: false, error: "INVALID_PASSWORD", message: "Password must be at least 8 characters." }, 400);
  }

  const sql = getSql(c.env);
  const normalized = payload.email.trim().toLowerCase();
  const rows = (await sql`
    SELECT id, password_setup_pending
    FROM newchums.users
    WHERE email = ${normalized}
    LIMIT 1
  `) as { id: string; password_setup_pending: boolean }[];
  const user = rows[0];
  if (!user) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!user.password_setup_pending) {
    // The account is not in pending state. Refuse to bypass the current-
    // password requirement; the caller should use the normal change-password
    // flow instead.
    return c.json({ ok: false, error: "ALREADY_SET", message: "This account already has a password. Use change password instead." }, 409);
  }

  const passwordHash = hashSync(password, 10);
  await sql`
    UPDATE newchums.users
    SET password_hash = ${passwordHash},
        password_setup_pending = FALSE
    WHERE id = ${user.id}
  `;
  await sql`
    UPDATE newchums.email_verification_tokens
    SET used_at = NOW()
    WHERE user_id = ${user.id} AND used_at IS NULL
  `;
  return c.json({ ok: true });
});

/**
 * Consume a magic-link token. Called by the web-side `magic-link` Credentials
 * provider from Auth.js. On success:
 *   - marks the token row `used_at = NOW()`
 *   - sets `email_verified_at = NOW()` on the user (idempotent)
 *   - returns `{ok:true, user:{id, email, name, is_suspended}}` so the Credentials
 *     provider can build the session record and signal `AccountSuspended` if needed
 */
app.post("/auth/magic-link/consume", async (c) => {
  let body: { email?: string; token?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "INVALID_JSON" }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  const tokenRaw = body.token?.trim();
  if (!email || !tokenRaw) {
    return c.json({ ok: false, error: "INVALID_INPUT" }, 400);
  }

  const sql = getSql(c.env);
  const users = (await sql`
    SELECT id, email, name, is_suspended, email_verified_at
    FROM newchums.users
    WHERE email = ${email}
    LIMIT 1
  `) as { id: string; email: string; name: string | null; is_suspended: boolean; email_verified_at: string | null }[];
  if (users.length === 0) {
    return c.json({ ok: false, error: "INVALID_OR_EXPIRED" }, 400);
  }
  const user = users[0];

  const tokenHash = await hashResetToken(tokenRaw);
  const tokens = (await sql`
    SELECT id
    FROM newchums.email_verification_tokens
    WHERE user_id = ${user.id}
      AND token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `) as { id: string }[];
  if (tokens.length === 0) {
    return c.json({ ok: false, error: "INVALID_OR_EXPIRED" }, 400);
  }

  if (user.is_suspended) {
    // Do not mark the token used, suspended users shouldn't burn a token.
    return c.json({ ok: false, error: "ACCOUNT_SUSPENDED" }, 403);
  }

  await sql`UPDATE newchums.email_verification_tokens SET used_at = NOW() WHERE id = ${tokens[0].id}`;
  await sql`UPDATE newchums.users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ${user.id}`;

  // Funnel events: a previously unverified account consuming a magic link is
  // a plan-signup verification completing (magic-link tokens for unverified
  // users are only minted by /auth/plan-signup/request). Returning
  // password_setup_pending users (signin-link flow) are already verified and
  // fire nothing. Off the critical path; failures never affect the response.
  if (!user.email_verified_at) {
    runAfterResponse(c, recordPlanSignupVerified(sql, user.id));
  }

  return c.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, is_suspended: false },
  });
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
      SELECT name, username, email, date_of_birth, gender, profile_theme, avatar_key, avatar_updated_at, role, subscription_plan,
        (password_hash IS NOT NULL) AS has_password,
        COALESCE(password_setup_pending, false) AS password_setup_pending,
        COALESCE(is_hidden_from_search, false) AS is_hidden_from_search,
        COALESCE(is_hidden_from_external_indexing, false) AS is_hidden_from_external_indexing,
        COALESCE(is_hidden_age, false) AS is_hidden_age,
        COALESCE(is_hidden_chum_list, false) AS is_hidden_chum_list,
        COALESCE(is_hidden_from_chum_lists, false) AS is_hidden_from_chum_lists,
        COALESCE(is_hidden_shoutouts, false) AS is_hidden_shoutouts,
        COALESCE(is_hidden_communities, false) AS is_hidden_communities,
        COALESCE(tutorial_nudges_off, false) AS tutorial_nudges_off,
        COALESCE(dm_privacy, 'everyone') AS dm_privacy
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
      subscription_plan: string;
      has_password: boolean;
      password_setup_pending: boolean;
      is_hidden_from_search: boolean;
      is_hidden_from_external_indexing: boolean;
      is_hidden_age: boolean;
      is_hidden_chum_list: boolean;
      is_hidden_from_chum_lists: boolean;
      is_hidden_shoutouts: boolean;
      is_hidden_communities: boolean;
      tutorial_nudges_off: boolean;
      dm_privacy: string;
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
    const passwordSetupPending = userInfo?.password_setup_pending ?? false;
    const isHiddenFromSearch = userInfo?.is_hidden_from_search ?? false;
    const isHiddenFromExternalIndexing = userInfo?.is_hidden_from_external_indexing ?? false;
    const isHiddenAge = userInfo?.is_hidden_age ?? false;
    const isHiddenChumList = userInfo?.is_hidden_chum_list ?? false;
    const isHiddenFromChumLists = userInfo?.is_hidden_from_chum_lists ?? false;
    const isHiddenShoutouts = userInfo?.is_hidden_shoutouts ?? false;
    const isHiddenCommunities = userInfo?.is_hidden_communities ?? false;
    const tutorialNudgesOff = userInfo?.tutorial_nudges_off ?? false;
    const dmPrivacy = userInfo?.dm_privacy ?? "everyone";
    const role = userInfo?.role ?? null;
    const subscriptionPlan = userInfo?.subscription_plan ?? "free";
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
          password_setup_pending: passwordSetupPending,
          is_hidden_from_search: isHiddenFromSearch,
          is_hidden_from_external_indexing: isHiddenFromExternalIndexing,
          is_hidden_age: isHiddenAge,
          is_hidden_chum_list: isHiddenChumList,
          is_hidden_from_chum_lists: isHiddenFromChumLists,
          is_hidden_shoutouts: isHiddenShoutouts,
          is_hidden_communities: isHiddenCommunities,
          tutorial_nudges_off: tutorialNudgesOff,
          dm_privacy: dmPrivacy,
          role,
          subscription_plan: subscriptionPlan,
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
        password_setup_pending: passwordSetupPending,
        is_hidden_from_search: isHiddenFromSearch,
        is_hidden_from_external_indexing: isHiddenFromExternalIndexing,
        is_hidden_age: isHiddenAge,
        is_hidden_chum_list: isHiddenChumList,
        is_hidden_from_chum_lists: isHiddenFromChumLists,
        is_hidden_shoutouts: isHiddenShoutouts,
        is_hidden_communities: isHiddenCommunities,
        tutorial_nudges_off: tutorialNudgesOff,
        dm_privacy: dmPrivacy,
        role,
        subscription_plan: subscriptionPlan,
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
      is_hidden_communities?: boolean;
      dm_privacy?: string;
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
    // Upper bound matches the "Anywhere" option in
    // web/src/config/travelRadius.ts (ANYWHERE_RADIUS_KM = 20000). The
    // discovery endpoints (/communities, /events/explore) treat any value
    // ≥ 20000 as "no distance filter"; rejecting it here was blocking users
    // who picked "Anywhere" from Edit Profile.
    if (
      travel_radius_km != null &&
      (!Number.isFinite(travel_radius_km) ||
      travel_radius_km < 1 ||
      travel_radius_km > 20000)
    ) {
      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "travel_radius_km must be between 1 and 20000",
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
    if ("is_hidden_communities" in body && body.is_hidden_communities !== undefined) {
      const val = body.is_hidden_communities === true;
      txQueries.push(sql`UPDATE newchums.users SET is_hidden_communities = ${val} WHERE id = ${appUserId}`);
    }
    if ("dm_privacy" in body && body.dm_privacy !== undefined) {
      const val = String(body.dm_privacy);
      if (DM_PRIVACY_LEVELS.includes(val as (typeof DM_PRIVACY_LEVELS)[number])) {
        txQueries.push(sql`UPDATE newchums.users SET dm_privacy = ${val} WHERE id = ${appUserId}`);
      }
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
    const purpose = (body.purpose ?? "avatar") as
      | "avatar"
      | "event_banner"
      | "roadmap_attachment"
      | "community_avatar"
      | "community_banner"
      | "community_schedule_block_banner";
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

    const maxBytes =
      purpose === "roadmap_attachment" ? MAX_ROADMAP_ATTACHMENT_BYTES :
      purpose === "community_banner" ? MAX_COMMUNITY_BANNER_BYTES :
      purpose === "community_schedule_block_banner" ? MAX_SCHEDULE_BLOCK_BANNER_BYTES :
      purpose === "event_banner" ? MAX_EVENT_BANNER_BYTES :
      MAX_AVATAR_BYTES;
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
    const body = (await c.req.json()) as {
      objectKey?: string; purpose?: string; eventId?: string;
      communityId?: string; scheduleBlockId?: string;
    };
    const objectKey = (body.objectKey ?? "").trim();
    const purpose = (body.purpose ?? "avatar") as
      | "avatar"
      | "event_banner"
      | "roadmap_attachment"
      | "community_avatar"
      | "community_banner"
      | "community_schedule_block_banner";

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

    if (purpose === "community_banner") {
      // Community banner is a Free-tier feature available to all community
      // owners. Access is gated on community ownership only (super admins
      // can still manage on behalf of the owner, same pattern as community
      // avatar). Previously gated as Community Pro; that gate was lifted
      // when banner upload moved to Free.
      const expectedPrefix = `community_banners/${appUserId}/`;
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
      const cm = (await sql`
        SELECT id, owner_user_id FROM newchums.communities WHERE id = ${communityId} LIMIT 1
      `) as { id: string; owner_user_id: string }[];
      if (cm.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
      const isSuperAdmin = ((await sql`SELECT role FROM newchums.users WHERE id = ${appUserId} LIMIT 1`) as { role: string | null }[])[0]?.role === "super_admin";
      if (cm[0].owner_user_id !== appUserId && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
      await sql`UPDATE newchums.communities SET banner_key = ${objectKey}, updated_at = now() WHERE id = ${communityId}`;
      return c.json({ ok: true, bannerUrl: `/communities/${communityId}/banner?v=${Date.now()}` });
    }

    if (purpose === "community_schedule_block_banner") {
      // Schedule block banners share the community-banner permission
      // model: community owner or super admin only. The objectKey must
      // be in the caller's own upload prefix; the schedule block must
      // belong to the named community; and that community must be
      // managed by the caller. The block id is required so we know
      // which row to stamp the key onto.
      const expectedPrefix = `community_schedule_block_banners/${appUserId}/`;
      if (!objectKey.startsWith(expectedPrefix)) {
        return c.json({ ok: false, error: "FORBIDDEN" }, 403);
      }
      const communityId = body.communityId?.trim();
      const scheduleBlockId = body.scheduleBlockId?.trim();
      if (!communityId) return c.json({ ok: false, error: "MISSING_COMMUNITY_ID" }, 400);
      if (!scheduleBlockId) return c.json({ ok: false, error: "MISSING_SCHEDULE_BLOCK_ID" }, 400);
      const obj = await c.env.MEDIA_BUCKET.head(objectKey);
      if (!obj) return c.json({ ok: false, error: "OBJECT_NOT_FOUND" }, 404);
      const cm = (await sql`
        SELECT id, owner_user_id FROM newchums.communities WHERE id = ${communityId} LIMIT 1
      `) as { id: string; owner_user_id: string }[];
      if (cm.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
      const isSuperAdmin = ((await sql`SELECT role FROM newchums.users WHERE id = ${appUserId} LIMIT 1`) as { role: string | null }[])[0]?.role === "super_admin";
      if (cm[0].owner_user_id !== appUserId && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
      const block = (await sql`
        SELECT id FROM newchums.community_schedule_blocks
        WHERE id = ${scheduleBlockId} AND community_id = ${communityId} AND deleted_at IS NULL
        LIMIT 1
      `) as { id: string }[];
      if (block.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
      await sql`
        UPDATE newchums.community_schedule_blocks
        SET banner_key = ${objectKey}, updated_at = NOW()
        WHERE id = ${scheduleBlockId} AND community_id = ${communityId}
      `;
      return c.json({
        ok: true,
        bannerUrl: `/communities/${communityId}/schedule-blocks/${scheduleBlockId}/banner?v=${Date.now()}`,
      });
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

/**
 * Public serving endpoint for the community banner image. Mirrors the
 * /avatar endpoint; no auth required because the banner is intentionally
 * visible on all community detail surfaces (public, restricted private
 * landing, and logged-in). The Community Pro gate lives on the upload /
 * finalize path, once a banner is stored we just serve the bytes.
 */
app.get("/communities/:communityId/banner", async (c) => {
  const communityId = c.req.param("communityId");
  if (!communityId || !c.env.MEDIA_BUCKET) return c.notFound();
  try {
    const sql = getSql(c.env);
    const rows = (await sql`SELECT banner_key FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { banner_key: string | null }[];
    const bannerKey = rows[0]?.banner_key ?? null;
    if (!bannerKey) return c.notFound();
    const obj = await c.env.MEDIA_BUCKET.get(bannerKey);
    if (!obj) return c.notFound();
    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(obj.body, { headers, status: 200 });
  } catch {
    return c.notFound();
  }
});

/**
 * Schedule block banner serving. Public, no auth: schedule blocks are
 * shown on the public community page when `schedule_enabled` is on,
 * so the image is too. The path includes the community id so the URL
 * is predictable and matches the rest of the schedule routes; the
 * row's `community_id` is verified server-side so a logged-out viewer
 * can't request a block image by id-stuffing across communities.
 * Cached for 24h with the cache-bust `?v=` query the finalize step
 * returns. Blocks marked inactive (`is_active = false`) still serve
 * their image so the manager preview keeps working; the public list
 * endpoint is the gate that suppresses inactive blocks for visitors.
 */
app.get("/communities/:communityId/schedule-blocks/:blockId/banner", async (c) => {
  const communityId = c.req.param("communityId");
  const blockId = c.req.param("blockId");
  if (!communityId || !blockId || !c.env.MEDIA_BUCKET) return c.notFound();
  try {
    const sql = getSql(c.env);
    const rows = (await sql`
      SELECT banner_key FROM newchums.community_schedule_blocks
      WHERE id = ${blockId} AND community_id = ${communityId} AND deleted_at IS NULL
      LIMIT 1
    `) as { banner_key: string | null }[];
    const bannerKey = rows[0]?.banner_key ?? null;
    if (!bannerKey) return c.notFound();
    const obj = await c.env.MEDIA_BUCKET.get(bannerKey);
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

// Returns user rows enriched with the signals needed by the Super Admin Users
// tab to spot people stuck in the signup / RSVP funnel:
//   - email_verified_at, password_setup_pending, has_password: setup state
//   - rsvp_count, hosted_count: plan activity (any RSVP or hosted plan)
// All counts come from existing tables; no schema additions are required.
type AdminUserRow = {
  id: string;
  created_at: string | null;
  last_active_at: string | null;
  email: string;
  username: string | null;
  name: string | null;
  role: string | null;
  subscription_plan: string;
  is_suspended: boolean;
  suspended_at: string | null;
  email_verified_at: string | null;
  password_setup_pending: boolean;
  has_password: boolean;
  rsvp_count: number;
  hosted_count: number;
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
          SELECT
            u.id, u.created_at, u.last_active_at, u.email, u.username, u.name, u.role, u.subscription_plan,
            u.is_suspended, u.suspended_at, u.email_verified_at,
            COALESCE(u.password_setup_pending, false) AS password_setup_pending,
            (u.password_hash IS NOT NULL) AS has_password,
            COALESCE((SELECT COUNT(*)::int FROM newchums.event_rsvps r WHERE r.user_id = u.id), 0) AS rsvp_count,
            COALESCE((SELECT COUNT(*)::int FROM newchums.events e WHERE e.host_user_id = u.id), 0) AS hosted_count
          FROM users u
          WHERE
            LOWER(u.email) LIKE ${likePattern}
            OR LOWER(COALESCE(u.username, '')) LIKE ${likePattern}
            OR LOWER(COALESCE(u.name, '')) LIKE ${likePattern}
            OR CAST(u.id AS TEXT) LIKE ${likePattern}
          ORDER BY u.created_at DESC NULLS LAST
        `) as AdminUserRow[])
      : ((await sql`
          SELECT
            u.id, u.created_at, u.last_active_at, u.email, u.username, u.name, u.role, u.subscription_plan,
            u.is_suspended, u.suspended_at, u.email_verified_at,
            COALESCE(u.password_setup_pending, false) AS password_setup_pending,
            (u.password_hash IS NOT NULL) AS has_password,
            COALESCE((SELECT COUNT(*)::int FROM newchums.event_rsvps r WHERE r.user_id = u.id), 0) AS rsvp_count,
            COALESCE((SELECT COUNT(*)::int FROM newchums.events e WHERE e.host_user_id = u.id), 0) AS hosted_count
          FROM users u
          ORDER BY u.created_at DESC NULLS LAST
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

// ─── PATCH /admin/users/:id/subscription-plan ───────────────────────────────

app.patch("/admin/users/:id/subscription-plan", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "id required" } }, 400);

  let plan: string;
  try {
    const body = await c.req.json<{ plan?: string }>();
    plan = typeof body.plan === "string" ? body.plan.trim() : "";
  } catch {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "JSON body required" } }, 400);
  }

  if (!isValidSubscriptionPlan(plan)) {
    return c.json(
      { ok: false, error: { code: "INVALID_PLAN", message: "Plan must be free, super_host, or community_pro" } },
      400,
    );
  }

  try {
    const sql = getSql(c.env);

    const existing = (await sql`
      SELECT id, subscription_plan FROM users WHERE id = ${id} LIMIT 1
    `) as { id: string; subscription_plan: string }[];
    if (existing.length === 0) {
      return c.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
    }

    const oldPlan = existing[0].subscription_plan;
    if (oldPlan === plan) {
      return c.json({ ok: true, subscription_plan: plan, changed: false });
    }

    await sql`
      UPDATE users SET subscription_plan = ${plan} WHERE id = ${id}
    `;

    await sql`
      INSERT INTO subscription_plan_history (user_id, old_plan, new_plan, assigned_by)
      VALUES (${id}, ${oldPlan}, ${plan}, ${admin.id})
    `;

    return c.json({ ok: true, subscription_plan: plan, changed: true });
  } catch (err) {
    console.error("[PATCH /admin/users/:id/subscription-plan]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

// ─── PATCH /admin/users/:id/role ─────────────────────────────────────────────
//
// Toggles a user's role between 'super_admin' and regular (NULL). Used by the
// Admin column on the super-admin Users tab.

app.patch("/admin/users/:id/role", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "id required" } }, 400);

  // Body: { role: 'super_admin' } promotes, { role: null } demotes. Anything
  // else is rejected; the role column is intentionally narrow today.
  let role: string | null;
  try {
    const body = await c.req.json<{ role?: string | null }>();
    if (body.role === null || body.role === undefined || body.role === "") {
      role = null;
    } else if (typeof body.role === "string" && body.role === "super_admin") {
      role = "super_admin";
    } else {
      return c.json(
        { ok: false, error: { code: "INVALID_ROLE", message: "Role must be 'super_admin' or null" } },
        400,
      );
    }
  } catch {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", message: "JSON body required" } }, 400);
  }

  try {
    const sql = getSql(c.env);
    const existing = (await sql`
      SELECT id, role FROM users WHERE id = ${id} LIMIT 1
    `) as { id: string; role: string | null }[];
    if (existing.length === 0) {
      return c.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
    }

    const oldRole = existing[0].role;
    if (oldRole === role) {
      return c.json({ ok: true, role, changed: false });
    }

    // Prevent admins from demoting themselves out of admin and locking
    // themselves out of admin tooling. Promotion (would never apply since
    // you'd already be super_admin) is also a no-op safely.
    if (id === admin.id && oldRole === "super_admin" && role !== "super_admin") {
      return c.json({ ok: false, error: { code: "CANNOT_DEMOTE_SELF" } }, 400);
    }

    await sql`UPDATE users SET role = ${role} WHERE id = ${id}`;
    return c.json({ ok: true, role, changed: true });
  } catch (err) {
    console.error("[PATCH /admin/users/:id/role]", err);
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
        cr.dm_conversation_id,
        cr.dm_evidence,
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
      plan_id: string | null;
      reason: string;
      details: string | null;
      status: string;
      created_at: string;
      dm_conversation_id: string | null;
      dm_evidence: unknown;
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
        source: r.dm_conversation_id ? "direct_message" : "plan",
        dmEvidence: r.dm_evidence ?? null,
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
        e.hide_from_explore,
        h.name AS host_name, h.username AS host_username, h.email AS host_email,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'going') AS going_count,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'maybe') AS maybe_count,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id) AS total_rsvps,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('id', c2.id, 'slug', c2.slug, 'name', c2.name) ORDER BY c2.name)
           FROM newchums.event_communities ec2
           JOIN newchums.communities c2 ON c2.id = ec2.community_id
           WHERE ec2.event_id = e.id),
          '[]'::jsonb
        ) AS communities
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
      hide_from_explore: boolean;
      host_name: string | null; host_username: string | null; host_email: string | null;
      going_count: number; maybe_count: number; total_rsvps: number;
      communities: Array<{ id: string; slug: string; name: string }>;
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

/**
 * PATCH /admin/plans/:id/community, super admin sets or clears a plan's
 * community link, bypassing the host-must-be-a-member check that gates
 * `PATCH /events/:id`. Used to hand-place a plan into a community when the
 * host isn't (yet) in it. The host is intentionally not notified, this is a
 * back-office override and the visible plan-change diff would just be noise.
 *
 * Honors the `invite_only` invariant from the Plan Feed and Community
 * Visibility Contract: invite-only plans cannot be linked to a community,
 * and `hide_from_explore` is only meaningful while a community is linked.
 */
app.patch("/admin/plans/:id/community", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const eventId = c.req.param("id");
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const sql = getSql(c.env);
  const rawCommunityIds = "community_ids" in body
    ? (Array.isArray(body.community_ids)
        ? (body.community_ids as unknown[])
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter((v): v is string => !!v)
        : [])
    : undefined;
  if (rawCommunityIds === undefined)
    return c.json({ ok: false, error: "VALIDATION", message: "community_ids is required (use [] to clear)" }, 400);
  const dedupedCommunityIds = Array.from(new Set(rawCommunityIds)).slice(0, 10);

  const rawHideFromExplore = "hide_from_explore" in body ? body.hide_from_explore === true : undefined;

  try {
    const rows = (await sql`
      SELECT id, visibility FROM newchums.events WHERE id = ${eventId} LIMIT 1
    `) as { id: string; visibility: string }[];
    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const ev = rows[0];
    if (ev.visibility === "invite_only" && dedupedCommunityIds.length > 0)
      return c.json({ ok: false, error: "VALIDATION", message: "Invite-only plans cannot be linked to a community" }, 400);

    if (dedupedCommunityIds.length > 0) {
      const cRows = (await sql`
        SELECT id FROM newchums.communities WHERE id = ANY(${dedupedCommunityIds}::uuid[])
      `) as { id: string }[];
      const found = new Set(cRows.map((r) => r.id));
      const missing = dedupedCommunityIds.filter((cid) => !found.has(cid));
      if (missing.length > 0)
        return c.json({ ok: false, error: "VALIDATION", message: "One or more communities not found" }, 400);
    }

    // When all links are cleared, the per-plan members-only toggle stops
    // being meaningful, mirror the column-pair invariant from PATCH
    // /events/:id.
    const effectiveHideFromExplore: boolean = dedupedCommunityIds.length === 0
      ? false
      : (rawHideFromExplore ?? false);

    await sql`
      UPDATE newchums.events
      SET hide_from_explore = ${effectiveHideFromExplore},
          updated_at        = NOW()
      WHERE id = ${eventId}
    `;

    await sql`DELETE FROM newchums.event_communities WHERE event_id = ${eventId}`;
    if (dedupedCommunityIds.length > 0) {
      await sql`
        INSERT INTO newchums.event_communities (event_id, community_id)
        SELECT ${eventId}::uuid, unnest(${dedupedCommunityIds}::uuid[])
        ON CONFLICT DO NOTHING
      `;
    }

    const updated = (await sql`
      SELECT e.id, e.hide_from_explore,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name) ORDER BY c.name)
           FROM newchums.event_communities ec
           JOIN newchums.communities c ON c.id = ec.community_id
           WHERE ec.event_id = e.id),
          '[]'::jsonb
        ) AS communities
      FROM newchums.events e
      WHERE e.id = ${eventId}
      LIMIT 1
    `) as { id: string; hide_from_explore: boolean; communities: Array<{ id: string; slug: string; name: string }> }[];

    return c.json({ ok: true, plan: updated[0] ?? null });
  } catch (err) {
    console.error("[PATCH /admin/plans/:id/community]", err);
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

// ─── GET /admin/kpis/funnel ──────────────────────────────────────────────────
//
// First-party funnel counts from newchums.product_events (migration 103).
// Steps that only exist client-side (plan_link_opened, rsvp_form_started,
// rsvp_form_submitted, share_link_copied, plan_created) live in GA; the
// admin UI renders those rows as "see GA" instead of a count.
// ?days=7|30|0 (0 = all time; default 30).

app.get("/admin/kpis/funnel", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

  const sql = getSql(c.env);
  const rawDays = c.req.query("days");
  const wantAll = rawDays === "0" || rawDays === "all";
  const rangeDays = wantAll ? 0 : Math.max(Math.floor(Number(rawDays)) || 30, 1);
  const startDateIso = new Date(Date.now() - rangeDays * 86_400_000).toISOString();

  try {
    const rows = (wantAll
      ? await sql`
          SELECT event_name, COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS users
          FROM newchums.product_events
          GROUP BY event_name
        `
      : await sql`
          SELECT event_name, COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS users
          FROM newchums.product_events
          WHERE created_at >= ${startDateIso}::timestamptz
          GROUP BY event_name
        `) as { event_name: string; total: number; users: number }[];

    const byName = new Map(rows.map((r) => [r.event_name, r]));
    const count = (name: string) => Number(byName.get(name)?.total ?? 0);
    const userCount = (name: string) => Number(byName.get(name)?.users ?? 0);

    return c.json({
      ok: true,
      data: {
        rangeDays,
        invitee: {
          // rsvp_verified is once-per-user by unique index, so total == users.
          verified: count("rsvp_verified"),
          // A plan-signup user can RSVP to several plans; the funnel counts people.
          rsvpRecordedUsers: userCount("rsvp_recorded"),
        },
        host: {
          signups: count("signup_completed"),
          firstPlans: count("first_plan_created"),
          plansReached3Rsvps: count("plan_reached_3_rsvps"),
          // Distinct hosts behind those plans, for a people-to-people conversion step.
          hostsReached3Rsvps: userCount("plan_reached_3_rsvps"),
          secondPlans: count("second_plan_created"),
        },
      },
    });
  } catch (err) {
    console.error("[GET /admin/kpis/funnel]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Admin hard delete (test-data hygiene) + moderation chat transcript ──────
//
// Super-admin-only cleanup for real accounts/plans created while testing in
// production (QA-flagged plans are excluded from analytics up front; this is
// the after-the-fact cleanup). Cascade + audit semantics live in
// api/src/lib/adminHardDelete.ts. Hard rules: no notification emails of any
// kind fire from these paths; a super admin can never hard-delete their own
// account or another super admin; every action writes newchums.admin_audit
// inside the same transaction as the cascade.

app.get("/admin/users/:id/delete-impact", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const targetId = c.req.param("id");
  try {
    const rows = (await sql`
      SELECT id, email, username, name, role FROM newchums.users WHERE id = ${targetId} LIMIT 1
    `) as { id: string; email: string; username: string | null; name: string | null; role: string | null }[];
    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const target = rows[0];
    const blockedReason =
      target.id === admin.id ? "TARGET_SELF" : target.role === "super_admin" ? "TARGET_SUPER_ADMIN" : null;
    const { impact, hostedPlanIds } = await computeUserDeleteImpact(sql, targetId);
    return c.json({
      ok: true,
      target: { id: target.id, email: target.email, username: target.username, name: target.name },
      blockedReason,
      impact,
      hostedPlanCount: hostedPlanIds.length,
      confirmWith: target.username ?? target.email,
    });
  } catch (err) {
    console.error("[GET /admin/users/:id/delete-impact]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.post("/admin/users/:id/hard-delete", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const targetId = c.req.param("id");
  let body: { confirm?: string };
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  try {
    const rows = (await sql`
      SELECT id, email, username, username_norm, role FROM newchums.users WHERE id = ${targetId} LIMIT 1
    `) as { id: string; email: string; username: string | null; username_norm: string | null; role: string | null }[];
    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const target = rows[0];
    if (target.id === admin.id) return c.json({ ok: false, error: "TARGET_SELF", message: "You cannot hard-delete your own account." }, 400);
    if (target.role === "super_admin") return c.json({ ok: false, error: "TARGET_SUPER_ADMIN", message: "Super admin accounts cannot be hard-deleted." }, 400);

    // Typed confirmation: the username (leading @ and case ignored), or the
    // email for accounts that somehow lack one.
    const confirmRaw = (body.confirm ?? "").trim().replace(/^@/, "").toLowerCase();
    const expected = (target.username_norm ?? target.username ?? target.email).toLowerCase();
    if (!confirmRaw || confirmRaw !== expected) {
      return c.json({ ok: false, error: "CONFIRMATION_MISMATCH", message: "Type the account's username exactly to confirm." }, 400);
    }

    const { impact, hostedPlanIds } = await computeUserDeleteImpact(sql, targetId);
    await hardDeleteUser(sql, {
      actorUserId: admin.id,
      targetUserId: targetId,
      targetLabel: target.username ?? target.email,
      impact,
      hostedPlanIds,
    });

    // Post-commit: quiet the deleted plans' chat rooms (stateless relays;
    // message history was removed by the SQL cascade). Best effort.
    let chatRoomsPurged = 0;
    for (const planId of hostedPlanIds) {
      try {
        const doId = c.env.CHAT_ROOM.idFromName(planId);
        await c.env.CHAT_ROOM.get(doId).fetch("https://chat-room/purge", { method: "POST" });
        chatRoomsPurged++;
      } catch (err) {
        console.error("[admin hard-delete] chat purge failed for plan", planId, err);
      }
    }

    return c.json({ ok: true, impact, chatRoomsPurged });
  } catch (err) {
    console.error("[POST /admin/users/:id/hard-delete]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.get("/admin/plans/:id/delete-impact", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const eventId = c.req.param("id");
  try {
    const rows = (await sql`
      SELECT e.id, e.title, e.is_qa, u.username AS host_username, u.email AS host_email
      FROM newchums.events e JOIN newchums.users u ON u.id = e.host_user_id
      WHERE e.id = ${eventId} LIMIT 1
    `) as { id: string; title: string; is_qa: boolean | null; host_username: string | null; host_email: string }[];
    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const impact = await computePlanDeleteImpact(sql, eventId);
    return c.json({
      ok: true,
      target: {
        id: rows[0].id,
        title: rows[0].title,
        isQa: rows[0].is_qa === true,
        host: rows[0].host_username ?? rows[0].host_email,
      },
      impact,
      confirmWith: rows[0].title,
    });
  } catch (err) {
    console.error("[GET /admin/plans/:id/delete-impact]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

app.post("/admin/plans/:id/hard-delete", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const eventId = c.req.param("id");
  let body: { confirm?: string };
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  try {
    const rows = (await sql`
      SELECT id, title FROM newchums.events WHERE id = ${eventId} LIMIT 1
    `) as { id: string; title: string }[];
    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if ((body.confirm ?? "").trim() !== rows[0].title.trim()) {
      return c.json({ ok: false, error: "CONFIRMATION_MISMATCH", message: "Type the plan title exactly to confirm." }, 400);
    }

    const impact = await computePlanDeleteImpact(sql, eventId);
    await hardDeletePlan(sql, { actorUserId: admin.id, eventId, planTitle: rows[0].title, impact });

    let chatRoomPurged = false;
    try {
      const doId = c.env.CHAT_ROOM.idFromName(eventId);
      await c.env.CHAT_ROOM.get(doId).fetch("https://chat-room/purge", { method: "POST" });
      chatRoomPurged = true;
    } catch (err) {
      console.error("[admin hard-delete] chat purge failed for plan", eventId, err);
    }

    return c.json({ ok: true, impact, chatRoomPurged });
  } catch (err) {
    console.error("[POST /admin/plans/:id/hard-delete]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// Read-only plan chat transcript for moderation. Deliberately separate from
// the participant chat endpoint: no membership requirement (super admin
// only), no read-state reads or writes, no unread side effects for anyone,
// no websocket/presence. Plan group chat is admin-readable for moderation;
// DMs remain not browsable (see AGENTS.md). Each OPEN (first page, no
// cursor) is logged to admin_audit.
app.get("/admin/events/:id/chat-transcript", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const eventId = c.req.param("id");
  try {
    const ev = (await sql`
      SELECT id, title FROM newchums.events WHERE id = ${eventId} LIMIT 1
    `) as { id: string; title: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const before = c.req.query("before");
    const limitParam = Math.min(Math.max(Number(c.req.query("limit") ?? 200), 1), 500);
    const messages = (await sql`
      SELECT m.id, m.body, m.created_at, m.user_id,
             u.name AS sender_name, u.username AS sender_username
      FROM newchums.event_chat_messages m
      JOIN newchums.users u ON u.id = m.user_id
      WHERE m.event_id = ${eventId}
        ${before ? sql`AND m.created_at < ${before}` : sql``}
      ORDER BY m.created_at DESC
      LIMIT ${limitParam + 1}
    `) as Array<{ id: string; body: string; created_at: string; user_id: string; sender_name: string | null; sender_username: string | null }>;
    const hasMore = messages.length > limitParam;
    if (hasMore) messages.pop();
    messages.reverse();

    if (!before) {
      await sql`
        INSERT INTO newchums.admin_audit (actor_user_id, action, subject_type, subject_id, subject_label, detail)
        VALUES (${admin.id}, 'plan_chat_transcript_viewed', 'event', ${eventId}, ${ev[0].title}, ${JSON.stringify({ messageCount: messages.length, hasMore })}::jsonb)
      `;
    }

    return c.json({
      ok: true,
      planTitle: ev[0].title,
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.created_at,
        senderId: m.user_id,
        senderName: m.sender_name?.trim() || m.sender_username?.replace(/^@/, "") || "Someone",
        senderHandle: m.sender_username ? `@${m.sender_username.replace(/^@/, "")}` : null,
      })),
      hasMore,
      oldestCursor: messages.length > 0 ? messages[0].created_at : null,
    });
  } catch (err) {
    console.error("[GET /admin/events/:id/chat-transcript]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ── User activity log (KPI drill-in) ─────────────────────────────────────────

const ACTIVITY_LOG_PAGE_SIZE = 50;
const ACTIVITY_LOG_MAX_PAGE_SIZE = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /admin/activity?days=&user_id=&q=&path=&offset=&limit=
 *
 *  Paginated view over user_activity_log (one row per authenticated API
 *  request, written by the suspension-guard middleware, 90-day retention).
 *  Filters combine: `days` bounds the window (default 30, max 365), `user_id`
 *  narrows to one account, `q` matches email / handle / name, `path` is a
 *  substring match on the request path. `active_days` counts distinct UTC
 *  days with at least one matching request; it is primarily meaningful when
 *  filtered to a single user ("how often do they come back"). */
app.get("/admin/activity", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);

  const daysRaw = Number(c.req.query("days"));
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.floor(daysRaw), 365) : 30;
  const userIdRaw = (c.req.query("user_id") ?? "").trim();
  if (userIdRaw && !UUID_RE.test(userIdRaw)) {
    return c.json({ ok: false, error: "INVALID_USER_ID" }, 400);
  }
  const userId = userIdRaw || null;
  const q = (c.req.query("q") ?? "").trim();
  const pathQ = (c.req.query("path") ?? "").trim();
  const limitRaw = Number(c.req.query("limit"));
  const offsetRaw = Number(c.req.query("offset"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(Math.floor(limitRaw), ACTIVITY_LOG_MAX_PAGE_SIZE)
    : ACTIVITY_LOG_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  try {
    const [countRow] = (await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(DISTINCT al.user_id)::int AS unique_users,
             COUNT(DISTINCT (al.occurred_at AT TIME ZONE 'UTC')::date)::int AS active_days
      FROM newchums.user_activity_log al
      JOIN newchums.users u ON u.id = al.user_id
      WHERE al.occurred_at >= NOW() - (${days} * INTERVAL '1 day')
        AND (${userId}::uuid IS NULL OR al.user_id = ${userId}::uuid)
        AND (${pathQ} = '' OR al.path ILIKE '%' || ${pathQ} || '%')
        AND (${q} = '' OR u.email ILIKE '%' || ${q} || '%' OR u.username ILIKE '%' || ${q} || '%' OR u.name ILIKE '%' || ${q} || '%')
    `) as { total: number; unique_users: number; active_days: number }[];
    const total = countRow?.total ?? 0;

    const entries = (await sql`
      SELECT al.id, al.user_id, al.method, al.path, al.route, al.status, al.occurred_at,
             u.email, u.username, u.name
      FROM newchums.user_activity_log al
      JOIN newchums.users u ON u.id = al.user_id
      WHERE al.occurred_at >= NOW() - (${days} * INTERVAL '1 day')
        AND (${userId}::uuid IS NULL OR al.user_id = ${userId}::uuid)
        AND (${pathQ} = '' OR al.path ILIKE '%' || ${pathQ} || '%')
        AND (${q} = '' OR u.email ILIKE '%' || ${q} || '%' OR u.username ILIKE '%' || ${q} || '%' OR u.name ILIKE '%' || ${q} || '%')
      ORDER BY al.occurred_at DESC, al.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as {
      id: string;
      user_id: string;
      method: string;
      path: string;
      route: string | null;
      status: number | null;
      occurred_at: string;
      email: string;
      username: string | null;
      name: string | null;
    }[];

    return c.json({
      ok: true,
      entries,
      total,
      unique_users: countRow?.unique_users ?? 0,
      active_days: countRow?.active_days ?? 0,
      days,
      limit,
      offset,
      has_more: offset + entries.length < total,
    });
  } catch (err) {
    console.error("[GET /admin/activity]", err);
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
      JOIN newchums.event_communities ec ON ec.community_id = cm.id
      JOIN newchums.events e ON e.id = ec.event_id
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
          AND (${communityId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_communities ec_kpi WHERE ec_kpi.event_id = e.id AND ec_kpi.community_id = ${communityId}::uuid))
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
          AND (${communityId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_communities ec_kpi WHERE ec_kpi.event_id = e.id AND ec_kpi.community_id = ${communityId}::uuid))
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
          AND (${communityId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_communities ec_kpi WHERE ec_kpi.event_id = e.id AND ec_kpi.community_id = ${communityId}::uuid))
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
          AND (${communityId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_communities ec_kpi WHERE ec_kpi.event_id = e.id AND ec_kpi.community_id = ${communityId}::uuid))
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
          AND (${communityId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_communities ec_kpi WHERE ec_kpi.event_id = e.id AND ec_kpi.community_id = ${communityId}::uuid))
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
          AND (${communityId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_communities ec_kpi WHERE ec_kpi.event_id = e.id AND ec_kpi.community_id = ${communityId}::uuid))
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
          AND (${communityId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_communities ec_kpi WHERE ec_kpi.event_id = e.id AND ec_kpi.community_id = ${communityId}::uuid))
      ),
      with_attendees AS (
        SELECT fe.id, fe.status
        FROM fe
        WHERE EXISTS (
          SELECT 1 FROM newchums.event_rsvps er
          WHERE er.event_id = fe.id
            AND er.user_id IS DISTINCT FROM fe.host_user_id
            AND er.committed_at IS NOT NULL
        )
        AND COALESCE(fe.cancellation_reason, '') NOT IN ('no_attendees', 'min_attendees_required_not_met')
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
          AND (${communityId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_communities ec_kpi WHERE ec_kpi.event_id = e.id AND ec_kpi.community_id = ${communityId}::uuid))
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
          AND (${communityId}::text IS NULL OR EXISTS (SELECT 1 FROM newchums.event_communities ec_kpi WHERE ec_kpi.event_id = e.id AND ec_kpi.community_id = ${communityId}::uuid))
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
    // ILIKE + BTRIM so legacy rows with stray whitespace still match. Ordering
    // ranks prefix matches (name then handle) above substring hits so typing
    // "Oliv" surfaces "Olivia" before "Polivia".
    const qLower = q.toLowerCase();
    const likePattern = `%${qLower}%`;
    const prefixPattern = `${qLower}%`;
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
          BTRIM(COALESCE(u.name, '')) ILIKE ${likePattern}
          OR COALESCE(u.username, '') ILIKE ${likePattern}
        )
      ORDER BY
        CASE
          WHEN BTRIM(COALESCE(u.name, '')) ILIKE ${prefixPattern} THEN 0
          WHEN COALESCE(u.username, '') ILIKE ${prefixPattern} THEN 1
          ELSE 2
        END,
        u.name ASC NULLS LAST
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

// ─── Direct messages (Inbox) ─────────────────────────────────────────────────
// 1:1 async messaging, deliberately framed as an email-like Inbox rather than
// real-time chat (plain request/response + light client polling; no
// websockets). Reachability rules:
//   - users.dm_privacy gates NEW conversations only ('everyone' default,
//     'chums_and_plans', 'no_one'); replies inside an existing conversation
//     are always allowed (you opted in by messaging them).
//   - Per-user blocks silence both directions, beat every setting, and are
//     never disclosed to the blocked side (sends fail with the same generic
//     NOT_ALLOWED as privacy denials).
// Email model: at most one notification per conversation until the recipient
// reads the thread (dm_participant_state.notified_at is claimed when an email
// goes out and cleared on read), gated by the 'direct_message' pref.
// Admin visibility: deliberately NO admin browse view over message content;
// messages reach admins only via a conduct report's dm_evidence snapshot.

const DM_PRIVACY_LEVELS = ["everyone", "chums_and_plans", "no_one"] as const;
const DM_MAX_BODY_LENGTH = 5000;
const DM_SNIPPET_LENGTH = 140;
const DM_NEW_CONVERSATIONS_PER_DAY = 10;
const DM_THREAD_MESSAGE_LIMIT = 200;
const DM_REPORT_EVIDENCE_MESSAGES = 20;

/** Canonical (user_a, user_b) ordering for the conversation pair. */
function dmPair(u1: string, u2: string): [string, string] {
  return u1 < u2 ? [u1, u2] : [u2, u1];
}

function dmSnippet(text: string, max = DM_SNIPPET_LENGTH): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}...` : oneLine;
}

/** A block in either direction kills messaging entirely. */
async function dmPairBlocked(sql: ReturnType<typeof getSql>, u1: string, u2: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM newchums.user_blocks
    WHERE (blocker_user_id = ${u1} AND blocked_user_id = ${u2})
       OR (blocker_user_id = ${u2} AND blocked_user_id = ${u1})
    LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

/** May `senderId` START a new conversation with the recipient? Existing
 *  conversations bypass this; blocks are checked separately. */
async function dmCanStartConversation(
  sql: ReturnType<typeof getSql>,
  senderId: string,
  recipient: { id: string; dm_privacy: string | null },
): Promise<boolean> {
  const level = recipient.dm_privacy ?? "everyone";
  if (level === "no_one") return false;
  if (level !== "chums_and_plans") return true;
  // chums_and_plans: the sender is in the recipient's On NewChums chums, or
  // the two shared a plan (either was host or had a Going RSVP on the same
  // event). QA plans are excluded outright so a QA plan can never
  // manufacture a messaging relationship between real users.
  const chum = (await sql`
    SELECT 1 FROM newchums.user_contacts
    WHERE user_id = ${recipient.id} AND linked_user_id = ${senderId} AND type = 'on_newchums'
    LIMIT 1
  `) as unknown[];
  if (chum.length > 0) return true;
  const shared = (await sql`
    SELECT 1 FROM newchums.events e
    WHERE COALESCE(e.is_qa, false) = false
      AND (
        e.host_user_id = ${senderId}
        OR EXISTS (
          SELECT 1 FROM newchums.event_rsvps ra
          WHERE ra.event_id = e.id AND ra.user_id = ${senderId} AND ra.status = 'going'
        )
      )
      AND (
        e.host_user_id = ${recipient.id}
        OR EXISTS (
          SELECT 1 FROM newchums.event_rsvps rb
          WHERE rb.event_id = e.id AND rb.user_id = ${recipient.id} AND rb.status = 'going'
        )
      )
    LIMIT 1
  `) as unknown[];
  return shared.length > 0;
}

type DmOtherUserRow = {
  other_id: string;
  other_name: string | null;
  other_username: string | null;
  other_avatar_key: string | null;
  other_avatar_updated_at: string | null;
};

function dmOtherUserPayload(r: DmOtherUserRow, mediaBucket: unknown) {
  return {
    userId: r.other_id,
    name: r.other_name,
    username: r.other_username,
    avatarUrl: buildAvatarUrl(r.other_id, r.other_avatar_key, r.other_avatar_updated_at, mediaBucket),
  };
}

/** GET /inbox?with=<userId>
 *
 *  Conversation list for the viewer, newest activity first. The optional
 *  `with` param resolves a compose target (used by entry points that link to
 *  /inbox?to=<userId>): if a conversation with that user already exists its
 *  id is returned so the client opens it; otherwise `canMessage` says whether
 *  a new conversation may be started. */
app.get("/inbox", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

    const rows = (await sql`
      SELECT
        dc.id, dc.last_message_at,
        other.id AS other_id, other.name AS other_name, other.username AS other_username,
        other.avatar_key AS other_avatar_key, other.avatar_updated_at AS other_avatar_updated_at,
        lm.body AS last_body, lm.sender_user_id AS last_sender_id, lm.created_at AS last_at,
        (
          SELECT COUNT(*)::int FROM newchums.dm_messages m
          WHERE m.conversation_id = dc.id
            AND m.sender_user_id != ${appUserId}
            AND m.created_at > COALESCE(ps.last_read_at, '1970-01-01'::timestamptz)
        ) AS unread_count
      FROM newchums.dm_conversations dc
      JOIN newchums.users other
        ON other.id = CASE WHEN dc.user_a = ${appUserId} THEN dc.user_b ELSE dc.user_a END
      LEFT JOIN newchums.dm_participant_state ps
        ON ps.conversation_id = dc.id AND ps.user_id = ${appUserId}
      LEFT JOIN LATERAL (
        SELECT m2.body, m2.sender_user_id, m2.created_at
        FROM newchums.dm_messages m2
        WHERE m2.conversation_id = dc.id
        ORDER BY m2.created_at DESC
        LIMIT 1
      ) lm ON true
      WHERE dc.user_a = ${appUserId} OR dc.user_b = ${appUserId}
      ORDER BY dc.last_message_at DESC
      LIMIT 100
    `) as Array<DmOtherUserRow & {
      id: string;
      last_message_at: string;
      last_body: string | null;
      last_sender_id: string | null;
      last_at: string | null;
      unread_count: number;
    }>;

    const conversations = rows.map((r) => ({
      id: r.id,
      otherUser: dmOtherUserPayload(r, c.env.MEDIA_BUCKET),
      lastMessage: r.last_body
        ? {
            snippet: dmSnippet(r.last_body, 80),
            isMine: r.last_sender_id === appUserId,
            createdAt: r.last_at,
          }
        : null,
      lastMessageAt: r.last_message_at,
      unreadCount: r.unread_count,
    }));

    // Optional compose target resolution (non-UUID values are ignored rather
    // than reaching the uuid cast in SQL, which would 500 the whole list)
    let composeTarget: unknown = null;
    const withParam = (c.req.query("with") ?? "").trim();
    if (withParam && UUID_RE.test(withParam)) {
      const targetRows = (await sql`
        SELECT id, name, username, avatar_key, avatar_updated_at,
          COALESCE(is_suspended, false) AS is_suspended,
          COALESCE(dm_privacy, 'everyone') AS dm_privacy
        FROM newchums.users WHERE id = ${withParam} LIMIT 1
      `) as Array<{
        id: string;
        name: string | null;
        username: string | null;
        avatar_key: string | null;
        avatar_updated_at: string | null;
        is_suspended: boolean;
        dm_privacy: string;
      }>;
      const target = targetRows[0];
      if (target && target.id !== appUserId) {
        const [pairA, pairB] = dmPair(appUserId, target.id);
        const existing = (await sql`
          SELECT id FROM newchums.dm_conversations WHERE user_a = ${pairA} AND user_b = ${pairB} LIMIT 1
        `) as { id: string }[];
        const blocked = await dmPairBlocked(sql, appUserId, target.id);
        const canMessage =
          !target.is_suspended &&
          !blocked &&
          (existing.length > 0 || (await dmCanStartConversation(sql, appUserId, target)));
        composeTarget = {
          userId: target.id,
          name: target.name,
          username: target.username,
          avatarUrl: buildAvatarUrl(target.id, target.avatar_key, target.avatar_updated_at, c.env.MEDIA_BUCKET),
          conversationId: existing[0]?.id ?? null,
          canMessage,
        };
      }
    }

    return c.json({ ok: true, conversations, composeTarget });
  } catch (err) {
    console.error("[GET /inbox]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /inbox/unread-count, cheap badge count: conversations with at least
 *  one unread message from the other side. */
app.get("/inbox/unread-count", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const [row] = (await sql`
      SELECT COUNT(*)::int AS unread
      FROM newchums.dm_conversations dc
      LEFT JOIN newchums.dm_participant_state ps
        ON ps.conversation_id = dc.id AND ps.user_id = ${appUserId}
      WHERE (dc.user_a = ${appUserId} OR dc.user_b = ${appUserId})
        AND EXISTS (
          SELECT 1 FROM newchums.dm_messages m
          WHERE m.conversation_id = dc.id
            AND m.sender_user_id != ${appUserId}
            AND m.created_at > COALESCE(ps.last_read_at, '1970-01-01'::timestamptz)
        )
    `) as { unread: number }[];
    return c.json({ ok: true, unread: row?.unread ?? 0 });
  } catch (err) {
    console.error("[GET /inbox/unread-count]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /inbox/contacts, candidate recipients for the "New message" picker:
 *  the viewer's On NewChums chums plus people from recent plans they shared
 *  (either was host or had a Going RSVP on the same published, non-QA event
 *  within the last 120 days). Suspended users and blocked pairs (either
 *  direction) are excluded; people already in the chums list are deduped out
 *  of the plans section. Reachability (dm_privacy) is deliberately NOT
 *  evaluated per candidate here; the compose flow resolves it when a person
 *  is picked, so a denial shows the standard "isn't accepting messages"
 *  notice instead of silently hiding people from the list. */
app.get("/inbox/contacts", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

    const chumRows = (await sql`
      SELECT u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at
      FROM newchums.user_contacts uc
      JOIN newchums.users u ON u.id = uc.linked_user_id
      WHERE uc.user_id = ${appUserId} AND uc.type = 'on_newchums'
        AND COALESCE(u.is_suspended, false) = false
        AND NOT EXISTS (
          SELECT 1 FROM newchums.user_blocks b
          WHERE (b.blocker_user_id = ${appUserId} AND b.blocked_user_id = u.id)
             OR (b.blocker_user_id = u.id AND b.blocked_user_id = ${appUserId})
        )
      ORDER BY LOWER(COALESCE(NULLIF(TRIM(u.name), ''), u.username, '')) ASC
      LIMIT 100
    `) as { id: string; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | null }[];

    const planMateRows = (await sql`
      WITH my_events AS (
        SELECT e.id, e.title, e.starts_at, e.host_user_id
        FROM newchums.events e
        WHERE COALESCE(e.is_qa, false) = false
          AND e.status = 'published'
          AND e.starts_at > NOW() - INTERVAL '120 days'
          AND (
            e.host_user_id = ${appUserId}
            OR EXISTS (
              SELECT 1 FROM newchums.event_rsvps r
              WHERE r.event_id = e.id AND r.user_id = ${appUserId} AND r.status = 'going'
            )
          )
      ),
      participants AS (
        SELECT me.title, me.starts_at, me.host_user_id AS user_id FROM my_events me
        UNION ALL
        SELECT me.title, me.starts_at, r.user_id
        FROM my_events me
        JOIN newchums.event_rsvps r ON r.event_id = me.id AND r.status = 'going'
      )
      SELECT DISTINCT ON (u.id)
        u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at,
        p.title AS plan_title, p.starts_at AS plan_starts_at
      FROM participants p
      JOIN newchums.users u ON u.id = p.user_id
      WHERE u.id != ${appUserId}
        AND COALESCE(u.is_suspended, false) = false
        AND NOT EXISTS (
          SELECT 1 FROM newchums.user_blocks b
          WHERE (b.blocker_user_id = ${appUserId} AND b.blocked_user_id = u.id)
             OR (b.blocker_user_id = u.id AND b.blocked_user_id = ${appUserId})
        )
      ORDER BY u.id, p.starts_at DESC
      LIMIT 100
    `) as { id: string; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | null; plan_title: string; plan_starts_at: string }[];

    const toEntry = (r: { id: string; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | null }) => ({
      userId: r.id,
      name: r.name,
      username: r.username,
      avatarUrl: buildAvatarUrl(r.id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
    });

    const chumIds = new Set(chumRows.map((r) => r.id));
    const fromPlans = planMateRows
      .filter((r) => !chumIds.has(r.id))
      .sort((a, b) => new Date(b.plan_starts_at).getTime() - new Date(a.plan_starts_at).getTime())
      .map((r) => ({ ...toEntry(r), planTitle: r.plan_title, planAt: r.plan_starts_at }));

    return c.json({ ok: true, chums: chumRows.map(toEntry), fromPlans });
  } catch (err) {
    console.error("[GET /inbox/contacts]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /inbox/:conversationId, the thread. Marks the conversation read for
 *  the viewer (and clears the email-notify claim) as a side effect. */
app.get("/inbox/:conversationId", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const conversationId = c.req.param("conversationId");
    const convRows = (await sql`
      SELECT dc.id,
        other.id AS other_id, other.name AS other_name, other.username AS other_username,
        other.avatar_key AS other_avatar_key, other.avatar_updated_at AS other_avatar_updated_at,
        COALESCE(other.is_suspended, false) AS other_suspended
      FROM newchums.dm_conversations dc
      JOIN newchums.users other
        ON other.id = CASE WHEN dc.user_a = ${appUserId} THEN dc.user_b ELSE dc.user_a END
      WHERE dc.id = ${conversationId}
        AND (dc.user_a = ${appUserId} OR dc.user_b = ${appUserId})
      LIMIT 1
    `) as Array<DmOtherUserRow & { id: string; other_suspended: boolean }>;
    const conv = convRows[0];
    if (!conv) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const messageRows = (await sql`
      SELECT id, sender_user_id, body, created_at
      FROM (
        SELECT id, sender_user_id, body, created_at
        FROM newchums.dm_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at DESC
        LIMIT ${DM_THREAD_MESSAGE_LIMIT}
      ) latest
      ORDER BY created_at ASC
    `) as { id: string; sender_user_id: string; body: string; created_at: string }[];

    // Mark read + release the email-notify claim
    await sql`
      INSERT INTO newchums.dm_participant_state (conversation_id, user_id, last_read_at, notified_at)
      VALUES (${conversationId}, ${appUserId}, NOW(), NULL)
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET last_read_at = NOW(), notified_at = NULL
    `;

    const viewerBlockRows = (await sql`
      SELECT 1 FROM newchums.user_blocks
      WHERE blocker_user_id = ${appUserId} AND blocked_user_id = ${conv.other_id}
      LIMIT 1
    `) as unknown[];

    return c.json({
      ok: true,
      conversation: {
        id: conv.id,
        otherUser: { ...dmOtherUserPayload(conv, c.env.MEDIA_BUCKET), isSuspended: conv.other_suspended },
        viewerHasBlocked: viewerBlockRows.length > 0,
      },
      messages: messageRows.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.created_at,
        isMine: m.sender_user_id === appUserId,
      })),
    });
  } catch (err) {
    console.error("[GET /inbox/:conversationId]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /inbox/send, send a message. Body: { to_user_id, body }.
 *
 *  Creates the conversation on first contact (privacy + rate-limit gated) or
 *  appends to the existing one (blocks only). Returns the conversation id so
 *  the client can navigate into the thread. Privacy and block denials share
 *  one generic NOT_ALLOWED so blocks are never disclosed. */
app.post("/inbox/send", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const body = await c.req.json<{ to_user_id?: string; body?: string }>().catch(() => ({} as { to_user_id?: string; body?: string }));
    const toUserId = (body.to_user_id ?? "").trim();
    const text = typeof body.body === "string" ? body.body.trim() : "";

    if (!toUserId) return c.json({ ok: false, error: "INVALID_RECIPIENT" }, 400);
    if (toUserId === appUserId) return c.json({ ok: false, error: "CANNOT_MESSAGE_SELF" }, 400);
    if (!text) return c.json({ ok: false, error: "EMPTY_MESSAGE", message: "Write a message first." }, 400);
    if (text.length > DM_MAX_BODY_LENGTH) {
      return c.json({ ok: false, error: "MESSAGE_TOO_LONG", message: `Messages are limited to ${DM_MAX_BODY_LENGTH} characters.` }, 400);
    }
    const safety = validateCleanText(text);
    if (!safety.ok) {
      return c.json({ ok: false, error: "INAPPROPRIATE_TEXT", message: safety.reason ?? "Please rephrase your message." }, 400);
    }

    const senderRows = (await sql`
      SELECT name, username, email, (email_verified_at IS NOT NULL) AS verified
      FROM newchums.users WHERE id = ${appUserId} LIMIT 1
    `) as { name: string | null; username: string | null; email: string; verified: boolean }[];
    if (!senderRows[0]?.verified) {
      return c.json({ ok: false, error: "EMAIL_UNVERIFIED", message: "Verify your email before sending messages." }, 403);
    }

    const recipientRows = (await sql`
      SELECT id, name, username, email,
        COALESCE(is_suspended, false) AS is_suspended,
        COALESCE(dm_privacy, 'everyone') AS dm_privacy
      FROM newchums.users WHERE id = ${toUserId} LIMIT 1
    `) as Array<{
      id: string;
      name: string | null;
      username: string | null;
      email: string;
      is_suspended: boolean;
      dm_privacy: string;
    }>;
    const recipient = recipientRows[0];
    const notAllowed = () =>
      c.json({ ok: false, error: "NOT_ALLOWED", message: "This person isn't accepting new messages right now." }, 403);
    if (!recipient || recipient.is_suspended) return notAllowed();
    if (await dmPairBlocked(sql, appUserId, recipient.id)) return notAllowed();

    const [pairA, pairB] = dmPair(appUserId, recipient.id);
    const existingRows = (await sql`
      SELECT id FROM newchums.dm_conversations WHERE user_a = ${pairA} AND user_b = ${pairB} LIMIT 1
    `) as { id: string }[];

    let conversationId = existingRows[0]?.id ?? null;
    if (!conversationId) {
      if (!(await dmCanStartConversation(sql, appUserId, recipient))) return notAllowed();
      // New-conversation rate limit, enforced in Postgres (the KV limiter is
      // unbound in prod). Repliers are never limited; this only makes
      // mass-spam boring.
      const [rate] = (await sql`
        SELECT COUNT(*)::int AS n FROM newchums.dm_conversations
        WHERE created_by = ${appUserId} AND created_at > NOW() - INTERVAL '24 hours'
      `) as { n: number }[];
      if ((rate?.n ?? 0) >= DM_NEW_CONVERSATIONS_PER_DAY) {
        return c.json({ ok: false, error: "RATE_LIMITED", message: "You've started a lot of new conversations today. Try again tomorrow." }, 429);
      }
      // ON CONFLICT guards the race where both sides message first at once.
      const created = (await sql`
        INSERT INTO newchums.dm_conversations (user_a, user_b, created_by)
        VALUES (${pairA}, ${pairB}, ${appUserId})
        ON CONFLICT (user_a, user_b) DO UPDATE SET last_message_at = newchums.dm_conversations.last_message_at
        RETURNING id
      `) as { id: string }[];
      conversationId = created[0].id;
    }

    const inserted = (await sql`
      INSERT INTO newchums.dm_messages (conversation_id, sender_user_id, body)
      VALUES (${conversationId}, ${appUserId}, ${text})
      RETURNING id, created_at
    `) as { id: string; created_at: string }[];

    await sql`UPDATE newchums.dm_conversations SET last_message_at = NOW() WHERE id = ${conversationId}`;
    // Sending implies you've seen the thread up to now.
    await sql`
      INSERT INTO newchums.dm_participant_state (conversation_id, user_id, last_read_at)
      VALUES (${conversationId}, ${appUserId}, NOW())
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()
    `;

    // Email notification: claim notified_at atomically so at most one email
    // goes out per conversation until the recipient reads it. The claim is
    // taken even when the pref is off (it's cleared on read either way).
    try {
      await sql`
        INSERT INTO newchums.dm_participant_state (conversation_id, user_id)
        VALUES (${conversationId}, ${recipient.id})
        ON CONFLICT (conversation_id, user_id) DO NOTHING
      `;
      const claimed = (await sql`
        UPDATE newchums.dm_participant_state
        SET notified_at = NOW()
        WHERE conversation_id = ${conversationId} AND user_id = ${recipient.id} AND notified_at IS NULL
        RETURNING user_id
      `) as unknown[];
      if (claimed.length > 0) {
        const prefRows = (await sql`
          SELECT notification_prefs FROM user_profile WHERE user_id = ${recipient.id} LIMIT 1
        `) as { notification_prefs: unknown }[];
        const prefs = normalizeNotificationPrefs(prefRows[0]?.notification_prefs);
        if (prefs.items.direct_message?.enabled !== false && recipient.email) {
          const sender = senderRows[0];
          const senderName = sender?.name?.trim() || (sender?.username ? `@${sender.username}` : null) || "Someone";
          const unsubscribeToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, recipient.id, "direct_message");
          await sendDmMessageNotifyEmail(c.env, {
            to: recipient.email,
            recipientName: recipient.name?.trim() || recipient.username || "there",
            senderName,
            senderHandle: sender?.username ? `@${sender.username}` : null,
            messagePreview: dmSnippet(text),
            inboxUrl: `${c.env.WEB_BASE_URL}/inbox?c=${conversationId}`,
            unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
          });
        }
      }
    } catch (emailErr) {
      console.error("[POST /inbox/send] notify email failed (message saved):", emailErr);
    }

    return c.json({
      ok: true,
      conversation_id: conversationId,
      message: { id: inserted[0].id, body: text, createdAt: inserted[0].created_at, isMine: true },
    });
  } catch (err) {
    console.error("[POST /inbox/send]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /inbox/:conversationId/report, report the other participant.
 *  Body: { reason, details? }. Snapshots the recent messages into
 *  dm_evidence so the report stays reviewable on its own; this snapshot is
 *  the only path by which message content reaches admins. */
app.post("/inbox/:conversationId/report", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const conversationId = c.req.param("conversationId");
    const body = await c.req.json<{ reason?: string; details?: string }>().catch(() => ({} as { reason?: string; details?: string }));

    if (!CONDUCT_REASONS.includes(body.reason as (typeof CONDUCT_REASONS)[number])) {
      return c.json({ ok: false, error: "INVALID_REASON" }, 400);
    }

    const convRows = (await sql`
      SELECT dc.id,
        other.id AS other_id, other.name AS other_name, other.username AS other_username, other.email AS other_email
      FROM newchums.dm_conversations dc
      JOIN newchums.users other
        ON other.id = CASE WHEN dc.user_a = ${appUserId} THEN dc.user_b ELSE dc.user_a END
      WHERE dc.id = ${conversationId}
        AND (dc.user_a = ${appUserId} OR dc.user_b = ${appUserId})
      LIMIT 1
    `) as Array<{ id: string; other_id: string; other_name: string | null; other_username: string | null; other_email: string }>;
    const conv = convRows[0];
    if (!conv) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const evidenceRows = (await sql`
      SELECT m.body, m.created_at, m.sender_user_id, u.name AS sender_name, u.username AS sender_username
      FROM newchums.dm_messages m
      JOIN newchums.users u ON u.id = m.sender_user_id
      WHERE m.conversation_id = ${conversationId}
      ORDER BY m.created_at DESC
      LIMIT ${DM_REPORT_EVIDENCE_MESSAGES}
    `) as { body: string; created_at: string; sender_user_id: string; sender_name: string | null; sender_username: string | null }[];
    const evidence = evidenceRows
      .reverse()
      .map((m) => ({
        sender: m.sender_name?.trim() || (m.sender_username ? `@${m.sender_username}` : m.sender_user_id),
        isReported: m.sender_user_id === conv.other_id,
        body: m.body,
        at: m.created_at,
      }));

    const inserted = (await sql`
      INSERT INTO newchums.conduct_reports (plan_id, reporter_user_id, reported_user_id, reason, details, dm_conversation_id, dm_evidence)
      VALUES (NULL, ${appUserId}, ${conv.other_id}, ${body.reason}, ${body.details?.trim() || null}, ${conversationId}, ${JSON.stringify(evidence)}::jsonb)
      RETURNING id, created_at
    `) as { id: string; created_at: string }[];

    // Admin alert email (fire-and-forget; report is already saved)
    try {
      const reporterRows = (await sql`
        SELECT name, email, username FROM newchums.users WHERE id = ${appUserId} LIMIT 1
      `) as { name: string | null; email: string; username: string | null }[];
      const reporter = reporterRows[0];
      const baseUrl = c.env.WEB_BASE_URL || "https://newchums.com";
      await sendConcernReportAlert(c.env, {
        reporterName: reporter?.name?.trim() || reporter?.username || reporter?.email || "Unknown",
        reporterEmail: reporter?.email || "unknown",
        reportedName: conv.other_name?.trim() || conv.other_username || conv.other_email || "Unknown",
        reportedEmail: conv.other_email || "unknown",
        planTitle: "Direct message conversation",
        concernReason: CONDUCT_REASON_LABELS[body.reason as keyof typeof CONDUCT_REASON_LABELS] ?? body.reason ?? "Unknown",
        details: body.details?.trim() || "(none provided; see attached messages in the Safety tab)",
        submittedAt: inserted[0]?.created_at ? new Date(inserted[0].created_at).toUTCString() : new Date().toUTCString(),
        reportUrl: `${baseUrl}/admin/safety`,
        reporterProfileUrl: `${baseUrl}/admin/chums/${appUserId}`,
        reportedProfileUrl: `${baseUrl}/admin/chums/${conv.other_id}`,
        planUrl: `${baseUrl}/admin/safety`,
      });
    } catch (emailErr) {
      console.error("[POST /inbox/:conversationId/report] alert email failed (report saved):", emailErr);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /inbox/:conversationId/report]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /me/blocks, the viewer's blocked-users list (for Settings). */
app.get("/me/blocks", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const rows = (await sql`
      SELECT b.blocked_user_id, b.created_at,
        u.name, u.username, u.avatar_key, u.avatar_updated_at
      FROM newchums.user_blocks b
      JOIN newchums.users u ON u.id = b.blocked_user_id
      WHERE b.blocker_user_id = ${appUserId}
      ORDER BY b.created_at DESC
    `) as { blocked_user_id: string; created_at: string; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | null }[];
    return c.json({
      ok: true,
      blocks: rows.map((r) => ({
        userId: r.blocked_user_id,
        name: r.name,
        username: r.username,
        avatarUrl: buildAvatarUrl(r.blocked_user_id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[GET /me/blocks]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /users/:id/block, block a user (silences messaging both ways). */
app.post("/users/:id/block", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const targetId = c.req.param("id");
    if (targetId === appUserId) return c.json({ ok: false, error: "CANNOT_BLOCK_SELF" }, 400);
    const exists = (await sql`SELECT 1 FROM newchums.users WHERE id = ${targetId} LIMIT 1`) as unknown[];
    if (exists.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    await sql`
      INSERT INTO newchums.user_blocks (blocker_user_id, blocked_user_id)
      VALUES (${appUserId}, ${targetId})
      ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /users/:id/block]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** DELETE /users/:id/block, unblock. */
app.delete("/users/:id/block", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const targetId = c.req.param("id");
    await sql`
      DELETE FROM newchums.user_blocks
      WHERE blocker_user_id = ${appUserId} AND blocked_user_id = ${targetId}
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /users/:id/block]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
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

    // Unread direct-message summaries (mirrors the unread-chat surface)
    const dmRows = (await sql`
      SELECT
        dc.id AS conversation_id,
        other.name AS other_name,
        other.username AS other_username,
        COUNT(m.id)::int AS unread_count,
        MAX(m.created_at) AS latest_at,
        (
          SELECT m3.body FROM newchums.dm_messages m3
          WHERE m3.conversation_id = dc.id
          ORDER BY m3.created_at DESC LIMIT 1
        ) AS latest_body
      FROM newchums.dm_conversations dc
      JOIN newchums.users other
        ON other.id = CASE WHEN dc.user_a = ${appUserId} THEN dc.user_b ELSE dc.user_a END
      LEFT JOIN newchums.dm_participant_state ps
        ON ps.conversation_id = dc.id AND ps.user_id = ${appUserId}
      JOIN newchums.dm_messages m
        ON m.conversation_id = dc.id
        AND m.sender_user_id != ${appUserId}
        AND m.created_at > COALESCE(ps.last_read_at, '1970-01-01'::timestamptz)
      WHERE dc.user_a = ${appUserId} OR dc.user_b = ${appUserId}
      GROUP BY dc.id, other.name, other.username
      ORDER BY MAX(m.created_at) DESC
      LIMIT 10
    `) as {
      conversation_id: string;
      other_name: string | null;
      other_username: string | null;
      unread_count: number;
      latest_at: string;
      latest_body: string | null;
    }[];
    const unreadDms = dmRows.map((r) => ({
      conversationId: r.conversation_id,
      otherName: r.other_name?.trim() || (r.other_username ? `@${r.other_username}` : "Someone"),
      unreadCount: r.unread_count,
      latestAt: r.latest_at,
      latestMessageBody: r.latest_body ? (r.latest_body.length > 80 ? r.latest_body.slice(0, 80) + "..." : r.latest_body) : null,
    }));

    return c.json({ ok: true, notifications, unreadChats, unreadDms });
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

/** GET /public/users/:handle/communities, public-facing list of the profile
 *  owner's active community memberships. Respects users.is_hidden_communities.
 *  Auth optional. Closed communities and non-active memberships are excluded.
 *  For private communities, only safe preview-style fields are returned (the
 *  same surface area /communities/:slug already exposes on its restricted
 *  response): id, slug, name, avatar_url, visibility, is_online, member_count,
 *  hobby tags. Click-through to /communities/[slug] still enforces normal
 *  community access rules. */
app.get("/public/users/:handle/communities", async (c) => {
  const handleParam = c.req.param("handle")?.trim();
  if (!handleParam) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  const handleNorm = handleParam.toLowerCase().trim();
  try {
    const sql = getSql(c.env);
    const ownerRows = (await sql`
      SELECT id, COALESCE(is_hidden_communities, false) AS is_hidden_communities
      FROM newchums.users
      WHERE username_norm = ${handleNorm} AND username IS NOT NULL
      LIMIT 1
    `) as { id: string; is_hidden_communities: boolean }[];
    const owner = ownerRows[0];
    if (!owner) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (owner.is_hidden_communities) {
      return c.json({ ok: true, communities: [], hidden: true });
    }
    const rows = (await sql`
      SELECT c.id, c.slug, c.name, c.avatar_key, c.visibility, c.is_online,
        (SELECT COUNT(*)::int FROM newchums.community_members cm2
          WHERE cm2.community_id = c.id AND cm2.status = 'active') AS member_count,
        (SELECT COALESCE(json_agg(json_build_object('name', ii.name, 'slug', ii.slug)
                                  ORDER BY ii.sort_order, ii.name), '[]'::json)
          FROM newchums.community_interests ci
          JOIN newchums.interests ii ON ii.id = ci.interest_id AND ii.is_deleted = false
          WHERE ci.community_id = c.id) AS hobbies
      FROM newchums.community_members cm
      JOIN newchums.communities c ON c.id = cm.community_id
      WHERE cm.user_id = ${owner.id}
        AND cm.status = 'active'
        AND COALESCE(c.status, 'active') = 'active'
      ORDER BY c.name ASC
    `) as Array<{
      id: string;
      slug: string;
      name: string;
      avatar_key: string | null;
      visibility: string;
      is_online: boolean | null;
      member_count: number;
      hobbies: { name: string; slug: string }[] | null;
    }>;
    const communities = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      avatarUrl: r.avatar_key && c.env.MEDIA_BUCKET
        ? `/communities/${r.id}/avatar?v=${encodeURIComponent(r.avatar_key.split("/").pop() ?? "")}`
        : null,
      visibility: r.visibility,
      isOnline: r.is_online === true,
      memberCount: r.member_count,
      hobbies: Array.isArray(r.hobbies) ? r.hobbies : [],
    }));
    return c.json({ ok: true, communities });
  } catch (err) {
    console.error("[GET /public/users/:handle/communities]", err);
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

/** Minimum age of an unresolved community join request before the requester
 *  may re-submit (which bumps created_at + message on the existing row and
 *  re-notifies the owner). See AGENTS.md -> Community join-request lifecycle.
 *  A shorter cooldown would risk spamming owners; a longer one would leave
 *  users stuck. Exposed to the client via the restricted /communities/:slug
 *  response so the UI can show the countdown. */
const COMMUNITY_JOIN_REQUEST_COOLDOWN_DAYS = 7;

/** Longer than the pending-refresh cooldown because an owner has already
 *  actively rejected the requester, re-asking sooner reads as pestering. */
const COMMUNITY_JOIN_REQUEST_DECLINED_COOLDOWN_DAYS = 30;

/** Shared cooldown math for community-join-request timestamps. Returns
 *  whether the cooldown has elapsed and, if not, how many whole days remain
 *  (floor of 1 so a still-active cooldown never renders as "0 days"). */
function joinRequestCooldownState(
  tsRaw: string | Date | null | undefined,
  cooldownDays: number
): { elapsed: boolean; daysRemaining: number | null } {
  if (tsRaw == null) return { elapsed: true, daysRemaining: null };
  const tsMs = typeof tsRaw === "string" ? Date.parse(tsRaw) : tsRaw.getTime();
  const ageMs = Date.now() - tsMs;
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  if (ageMs >= cooldownMs) return { elapsed: true, daysRemaining: null };
  return {
    elapsed: false,
    daysRemaining: Math.max(1, Math.ceil((cooldownMs - ageMs) / (24 * 60 * 60 * 1000))),
  };
}

/** Weekday codes used as the keys on `communities.operating_hours`. Order
 *  matches the conventional Mon-Sun week we render on the detail page. */
const OPERATING_HOURS_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type OperatingHoursDay = typeof OPERATING_HOURS_DAYS[number];

/** Zero-padded 24-hour `HH:MM` format. Close may be before open (overnight). */
const OPERATING_HOURS_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type OperatingHoursEntry =
  | { closed: true }
  | { open: string; close: string };

type OperatingHours = Partial<Record<OperatingHoursDay, OperatingHoursEntry>>;

/**
 * Parse and validate a community `operating_hours` payload.
 *
 * Accepts `null` or `undefined` (means "no hours") and returns them as-is
 * so callers can distinguish "clear existing hours" from "leave unchanged".
 * For object payloads, unknown day keys are dropped and each day is
 * normalized to either `{ closed: true }` or `{ open, close }` with
 * zero-padded `HH:MM` times. Returns `{ error }` with a human-readable
 * message when any day entry is malformed so the API can surface a 400.
 *
 * An empty object (no recognized days after filtering) is stored as `null`
 * so a community without hours stays in one canonical shape in the DB.
 */
function parseOperatingHours(raw: unknown): { ok: true; value: OperatingHours | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Operating hours must be an object keyed by weekday" };
  }
  const out: OperatingHours = {};
  for (const day of OPERATING_HOURS_DAYS) {
    const entry = (raw as Record<string, unknown>)[day];
    if (entry === undefined || entry === null) continue;
    if (typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, error: `Invalid entry for ${day}` };
    }
    const e = entry as Record<string, unknown>;
    if (e.closed === true) {
      out[day] = { closed: true };
      continue;
    }
    const openRaw = typeof e.open === "string" ? e.open.trim() : "";
    const closeRaw = typeof e.close === "string" ? e.close.trim() : "";
    if (!openRaw && !closeRaw) continue; // treat empty entry as "not set"
    if (!OPERATING_HOURS_TIME_RE.test(openRaw) || !OPERATING_HOURS_TIME_RE.test(closeRaw)) {
      return { ok: false, error: `Invalid time for ${day}; use HH:MM 24-hour format` };
    }
    out[day] = { open: openRaw, close: closeRaw };
  }
  // Normalize empty object to null so the DB stores one canonical "no hours" shape.
  return { ok: true, value: Object.keys(out).length === 0 ? null : out };
}

/** POST /communities, create a community */
app.post("/communities", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

  const ownedCount = await countOwnedCommunities(sql, userId);
  if (ownedCount >= MAX_OWNED_COMMUNITIES) {
    return c.json(
      {
        ok: false,
        error: "COMMUNITY_CAP_REACHED",
        message: `You can own up to ${MAX_OWNED_COMMUNITIES} active communities. Close one before creating another.`,
        limit: MAX_OWNED_COMMUNITIES,
        owned: ownedCount,
      },
      403,
    );
  }

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
  if (!description) return c.json({ ok: false, error: "VALIDATION", message: "Description is required", field: "description" }, 400);

  // Unified access model: "open" or "private". Maps to visibility + join_mode.
  // Also accepts legacy visibility/join_mode fields for backward compatibility.
  let visibility: string;
  let joinMode: string;
  if (body.access !== undefined) {
    const access = String(body.access);
    if (access === "open") { visibility = "public"; joinMode = "open"; }
    else if (access === "private") { visibility = "private"; joinMode = "approval_required"; }
    else return c.json({ ok: false, error: "VALIDATION", message: "Access must be 'open' or 'private'", field: "access" }, 400);
  } else {
    visibility = String(body.visibility ?? "public");
    if (!VALID_COMMUNITY_VISIBILITY.includes(visibility as typeof VALID_COMMUNITY_VISIBILITY[number]))
      return c.json({ ok: false, error: "VALIDATION", message: "Invalid visibility", field: "visibility" }, 400);
    joinMode = String(body.join_mode ?? "open");
    if (!VALID_COMMUNITY_JOIN_MODE.includes(joinMode as typeof VALID_COMMUNITY_JOIN_MODE[number]))
      return c.json({ ok: false, error: "VALIDATION", message: "Invalid join mode", field: "join_mode" }, 400);
  }
  const chatEnabled = body.chat_enabled !== false;

  const isOnline = body.is_online === true;
  const website = body.website ? String(body.website).trim().slice(0, 500) : null;
  const discordUrl = body.discord_url ? String(body.discord_url).trim().slice(0, 500) : null;

  const locationName = body.location_name ? String(body.location_name).trim().slice(0, 200) : null;
  const locationAddress = body.location_address ? String(body.location_address).trim().slice(0, 500) : null;
  const locationLat = body.location_lat != null && Number.isFinite(Number(body.location_lat)) ? Number(body.location_lat) : null;
  const locationLng = body.location_lng != null && Number.isFinite(Number(body.location_lng)) ? Number(body.location_lng) : null;

  if (!isOnline) {
    if (!locationName && !locationAddress) {
      return c.json({ ok: false, error: "VALIDATION", message: "Location is required for in-person communities", field: "location" }, 400);
    }
    // Require coordinates from a Google Places pick. Without these, the
    // community can't be placed on the distance filter used by the
    // Communities discovery feed, which previously meant communities
    // with only typed text ended up with stale coordinates from a prior
    // unrelated pick, so they appeared at the wrong location.
    if (locationLat == null || locationLng == null) {
      return c.json({ ok: false, error: "VALIDATION", message: "Please pick a location from the suggestions", field: "location" }, 400);
    }
  }

  // Hobbies/interests are required
  const interestItems = Array.isArray(body.interest_items) ? body.interest_items as { slug: string; name: string }[] : [];
  if (interestItems.length === 0)
    return c.json({ ok: false, error: "VALIDATION", message: "Add at least one hobby so people can find this community", field: "hobby" }, 400);

  // Optional operating hours. Omitting or sending null = no published hours.
  const hoursParse = parseOperatingHours(body.operating_hours);
  if (!hoursParse.ok) return c.json({ ok: false, error: "VALIDATION", message: hoursParse.error, field: "operating_hours" }, 400);
  const operatingHours = hoursParse.value;

  try {
    const existing = (await sql`SELECT id FROM newchums.communities WHERE slug = ${slug}`) as { id: string }[];
    if (existing.length > 0) return c.json({ ok: false, error: "SLUG_TAKEN", message: "That handle is already taken" }, 409);

    const rows = (await sql`
      INSERT INTO newchums.communities (name, slug, description, visibility, join_mode, chat_enabled, is_online, website, discord_url, location_name, location_address, location_lat, location_lng, owner_user_id, operating_hours)
      VALUES (${name}, ${slug}, ${description}, ${visibility}, ${joinMode}, ${chatEnabled}, ${isOnline}, ${website}, ${discordUrl}, ${locationName}, ${locationAddress}, ${locationLat}, ${locationLng}, ${userId}, ${operatingHours ? JSON.stringify(operatingHours) : null}::jsonb)
      RETURNING id, slug, created_at
    `) as { id: string; slug: string; created_at: string }[];
    const community = rows[0];

    await sql`INSERT INTO newchums.community_members (community_id, user_id, role, status) VALUES (${community.id}, ${userId}, 'owner', 'active')`;

    // Link hobbies/interests
    if (interestItems.length > 0) {
      const interestIds: string[] = [];
      for (const item of interestItems) {
        const slugVal = String(item.slug ?? "").trim().toLowerCase();
        const nameVal = String(item.name ?? "").trim();
        if (!slugVal || !nameVal) continue;
        const existing = (await sql`SELECT id FROM newchums.interests WHERE slug = ${slugVal} AND is_deleted = false LIMIT 1`) as { id: string }[];
        if (existing[0]) { interestIds.push(existing[0].id); continue; }
        // Insert a fresh interest. `category` is NOT NULL so we must supply an
        // empty string; `is_seed = false` marks it as user-created. ON CONFLICT
        // DO NOTHING means a slug that exists but is soft-deleted is left alone
        // (admins soft-delete inappropriate hobbies; users shouldn't resurrect
        // them by re-submitting the same slug). Matches the plan-side pattern.
        try {
          await sql`INSERT INTO newchums.interests (name, category, slug, sort_order, is_seed, created_by_user_id) VALUES (${nameVal}, '', ${slugVal}, 0, false, ${userId}) ON CONFLICT (slug) DO NOTHING`;
        } catch { /* ignore concurrent insert race */ }
        const fetched = (await sql`SELECT id FROM newchums.interests WHERE LOWER(slug) = LOWER(${slugVal}) AND is_deleted = false LIMIT 1`) as { id: string }[];
        if (fetched[0]) interestIds.push(fetched[0].id);
      }
      if (interestIds.length > 0) {
        await sql`INSERT INTO newchums.community_interests (community_id, interest_id) SELECT ${community.id}, UNNEST(${interestIds}::uuid[]) ON CONFLICT DO NOTHING`;
      }
    }

    return c.json({ ok: true, community: { id: community.id, slug: community.slug, created_at: community.created_at } }, 201);
  } catch (err) {
    console.error("[POST /communities]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /communities, list/search communities with discovery */
app.get("/communities", async (c) => {
  const payload = await requireAuth(c);
  const sql = getSql(c.env);
  const search = c.req.query("q")?.trim() ?? null;
  const mine = c.req.query("mine") === "1";
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 20), 1), 50);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  const lat = c.req.query("lat") ? Number(c.req.query("lat")) : null;
  const lng = c.req.query("lng") ? Number(c.req.query("lng")) : null;
  const radiusKm = Math.min(Math.max(Number(c.req.query("radius_km") ?? 200), 1), 20000);
  const hasLocation = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng);
  const hobbySlug = c.req.query("hobby") ?? null;
  const personalizeParam = c.req.query("personalize") ?? "1";
  const personalizeEnabled = personalizeParam !== "0";

  let userId: string | null = null;
  let isSuperAdmin = false;
  if (payload?.email) {
    const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
    if (userRows[0]) { userId = userRows[0].id; isSuperAdmin = userRows[0].role === "super_admin"; }
  }

  // Fetch viewer's hobby categories for personalization
  let userEffectiveCategories: string[] = [];
  if (userId && personalizeEnabled) {
    const userHobbies = (await sql`
      SELECT DISTINCT LOWER(COALESCE(NULLIF(TRIM(i.category), ''), i.name)) AS eff
      FROM newchums.user_interests ui
      JOIN newchums.interests i ON i.id = ui.interest_id AND i.is_deleted = false
      WHERE ui.user_id = ${userId}
    `) as { eff: string }[];
    userEffectiveCategories = userHobbies.map((h) => h.eff);
  }
  const hasUserHobbies = userEffectiveCategories.length > 0;

  try {
    const q = search ? `%${search}%` : null;
    const hobbyMatchExpr = hasUserHobbies && personalizeEnabled
      ? sql`(
          SELECT COUNT(DISTINCT LOWER(COALESCE(NULLIF(TRIM(ii.category), ''), ii.name)))::int
          FROM newchums.community_interests ci2
          JOIN newchums.interests ii ON ii.id = ci2.interest_id AND ii.is_deleted = false
          WHERE ci2.community_id = c.id
            AND LOWER(COALESCE(NULLIF(TRIM(ii.category), ''), ii.name)) = ANY(${userEffectiveCategories})
        )`
      : sql`0`;

    const distanceExpr = hasLocation
      ? sql`CASE
          WHEN c.location_lat IS NOT NULL AND c.location_lng IS NOT NULL THEN
            6371 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians(${lat})) * cos(radians(c.location_lat)) *
                cos(radians(c.location_lng) - radians(${lng})) +
                sin(radians(${lat})) * sin(radians(c.location_lat))
              ))
            )
          ELSE NULL
        END`
      : sql`NULL`;

    if (mine && userId) {
      const communities = (await sql`
        SELECT c.id, c.slug, c.name, c.description, c.visibility, c.join_mode, c.avatar_key, c.banner_key,
          c.location_name, c.location_address, c.location_lat, c.location_lng,
          c.owner_user_id, c.created_at, c.is_online,
          (SELECT COUNT(*)::int FROM newchums.community_members cm WHERE cm.community_id = c.id AND cm.status = 'active') AS member_count,
          cme.role AS viewer_role,
          (SELECT COUNT(*)::int FROM newchums.events e JOIN newchums.event_communities ec ON ec.event_id = e.id WHERE ec.community_id = c.id AND e.status = 'published' AND e.starts_at >= NOW() AND (COALESCE(e.is_qa, false) = false OR ${isSuperAdmin})) AS upcoming_plan_count,
          ${hobbyMatchExpr} AS hobby_match_count,
          ${distanceExpr} AS distance_km,
          (SELECT COALESCE(json_agg(json_build_object('name', ii.name, 'slug', ii.slug)), '[]'::json)
           FROM newchums.community_interests ci3
           JOIN newchums.interests ii ON ii.id = ci3.interest_id AND ii.is_deleted = false
           WHERE ci3.community_id = c.id) AS hobbies
        FROM newchums.communities c
        JOIN newchums.community_members cme ON cme.community_id = c.id AND cme.user_id = ${userId} AND cme.status = 'active'
        WHERE COALESCE(c.status, 'active') = 'active'
          ${q ? sql`AND (c.name ILIKE ${q} OR c.slug ILIKE ${q})` : sql``}
        ORDER BY c.name ASC LIMIT ${limit} OFFSET ${offset}
      `) as Record<string, unknown>[];
      const hasMore = communities.length === limit;
      return c.json({ ok: true, communities, hasMore });
    }

    // Discovery query: distance filtering for offline, personalization ranking
    const distanceFilter = hasLocation && radiusKm < 20000
      ? sql`AND (
          c.is_online = true
          OR c.location_lat IS NULL OR c.location_lng IS NULL
          OR 6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(${lat})) * cos(radians(c.location_lat)) *
              cos(radians(c.location_lng) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(c.location_lat))
            ))
          ) <= ${radiusKm}
        )`
      : sql``;

    const hobbyFilter = hobbySlug
      ? sql`AND EXISTS (
          SELECT 1 FROM newchums.interests ii_pick
          WHERE ii_pick.slug = ${hobbySlug} AND ii_pick.is_deleted = false
            AND EXISTS (
              SELECT 1 FROM newchums.community_interests ci4
              JOIN newchums.interests ii4 ON ii4.id = ci4.interest_id AND ii4.is_deleted = false
              WHERE ci4.community_id = c.id
                AND LOWER(COALESCE(NULLIF(TRIM(ii4.category), ''), ii4.name))
                  = LOWER(COALESCE(NULLIF(TRIM(ii_pick.category), ''), ii_pick.name))
            )
        )`
      : sql``;

    const orderClause = hasLocation
      ? sql`hobby_match_count DESC, distance_km ASC NULLS LAST, member_count DESC, c.created_at DESC`
      : sql`hobby_match_count DESC, member_count DESC, c.created_at DESC`;

    const viewerRoleExpr = userId
      ? sql`(SELECT vcm.role FROM newchums.community_members vcm WHERE vcm.community_id = c.id AND vcm.user_id = ${userId} AND vcm.status = 'active' LIMIT 1)`
      : sql`NULL`;

    const communities = (await sql`
      SELECT c.id, c.slug, c.name, c.description, c.visibility, c.join_mode, c.avatar_key, c.banner_key,
        c.location_name, c.owner_user_id, c.created_at, c.is_online,
        (SELECT COUNT(*)::int FROM newchums.community_members cm WHERE cm.community_id = c.id AND cm.status = 'active') AS member_count,
        ${viewerRoleExpr} AS viewer_role,
        (SELECT COUNT(*)::int FROM newchums.events e JOIN newchums.event_communities ec ON ec.event_id = e.id WHERE ec.community_id = c.id AND e.status = 'published' AND e.starts_at >= NOW() AND (COALESCE(e.is_qa, false) = false OR ${isSuperAdmin})) AS upcoming_plan_count,
        ${hobbyMatchExpr} AS hobby_match_count,
        ${distanceExpr} AS distance_km,
        (SELECT COALESCE(json_agg(json_build_object('name', ii.name, 'slug', ii.slug)), '[]'::json)
         FROM newchums.community_interests ci3
         JOIN newchums.interests ii ON ii.id = ci3.interest_id AND ii.is_deleted = false
         WHERE ci3.community_id = c.id) AS hobbies
      FROM newchums.communities c
      WHERE COALESCE(c.status, 'active') = 'active'
        ${q ? sql`AND (c.name ILIKE ${q} OR c.slug ILIKE ${q})` : sql``}
        ${distanceFilter}
        ${hobbyFilter}
      ORDER BY ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `) as Record<string, unknown>[];
    const hasMore = communities.length === limit;
    return c.json({ ok: true, communities, hasMore });
  } catch (err) {
    console.error("[GET /communities]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /public/communities, logged-out discovery feed.
 *
 *  Powers the public `/communities` page for non-authenticated visitors, the
 *  community equivalent of the public `/events/explore/public` feed. The
 *  response shape is intentionally a lean subset of `GET /communities` so
 *  the existing community-card JSX keeps working for both logged-in and
 *  logged-out renders without branching on shape.
 *
 *  Privacy contract (the reason this is a separate endpoint):
 *    - ONLY returns `visibility = 'public'` communities. Private
 *      communities are fully excluded from the public discovery list,
 *      public search, and any public browsing surface.
 *    - Only `status = 'active'` communities; closed ones are hidden
 *      everywhere in discovery.
 *    - Never emits viewer-scoped fields (`viewer_role`,
 *      `hobby_match_count`), since there is no viewer.
 *    - Returns `distance_km` only when the caller supplied a usable
 *      `lat` / `lng` pair (from the manual Places picker on the page).
 *      No raw coordinates are leaked beyond what the community already
 *      publishes via `location_name`.
 *
 *  Supported query params (all optional):
 *    q           Case-insensitive match against `name` or `slug`.
 *    lat, lng    Viewer-entered location coordinates (from the page's
 *                manual Places picker, never a geolocation API).
 *    radius_km   Distance cap for *offline* communities only; online
 *                communities bypass distance regardless. Defaults to
 *                200km to match the authenticated feed's default.
 *    hobby       Single hobby slug filter. Matches on effective hobby
 *                category (same normalization as the authenticated feed)
 *                so a hobby slug like `mtg` matches a community tagged
 *                under any variant in the same category.
 *    limit       Clamped to [1, 50], default 20.
 *    offset      Non-negative, default 0.
 */
app.get("/public/communities", async (c) => {
  const sql = getSql(c.env);
  const search = c.req.query("q")?.trim() ?? null;
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 20), 1), 50);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const lat = c.req.query("lat") ? Number(c.req.query("lat")) : null;
  const lng = c.req.query("lng") ? Number(c.req.query("lng")) : null;
  const hasLocation =
    lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
  const radiusKm = Math.min(Math.max(Number(c.req.query("radius_km") ?? 200), 1), 20000);
  const hobbySlug = c.req.query("hobby") ?? null;

  try {
    const q = search ? `%${search}%` : null;

    const distanceExpr = hasLocation
      ? sql`CASE
          WHEN c.location_lat IS NOT NULL AND c.location_lng IS NOT NULL THEN
            6371 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians(${lat})) * cos(radians(c.location_lat)) *
                cos(radians(c.location_lng) - radians(${lng})) +
                sin(radians(${lat})) * sin(radians(c.location_lat))
              ))
            )
          ELSE NULL
        END`
      : sql`NULL`;

    // Distance filter matches the authenticated feed: only excludes
    // offline communities outside radius; online communities pass through
    // regardless of viewer location (they're location-agnostic).
    const distanceFilter = hasLocation && radiusKm < 20000
      ? sql`AND (
          c.is_online = true
          OR c.location_lat IS NULL OR c.location_lng IS NULL
          OR 6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(${lat})) * cos(radians(c.location_lat)) *
              cos(radians(c.location_lng) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(c.location_lat))
            ))
          ) <= ${radiusKm}
        )`
      : sql``;

    const hobbyFilter = hobbySlug
      ? sql`AND EXISTS (
          SELECT 1 FROM newchums.interests ii_pick
          WHERE ii_pick.slug = ${hobbySlug} AND ii_pick.is_deleted = false
            AND EXISTS (
              SELECT 1 FROM newchums.community_interests ci4
              JOIN newchums.interests ii4 ON ii4.id = ci4.interest_id AND ii4.is_deleted = false
              WHERE ci4.community_id = c.id
                AND LOWER(COALESCE(NULLIF(TRIM(ii4.category), ''), ii4.name))
                  = LOWER(COALESCE(NULLIF(TRIM(ii_pick.category), ''), ii_pick.name))
            )
        )`
      : sql``;

    // No viewer to personalize against. Public discovery orders by
    // location proximity when the viewer has entered a location, then
    // alphabetically by name so the list reads as browseable rather than
    // "biggest communities first". Alphabetical order is case-
    // insensitive (`LOWER(c.name)`) so capitalization quirks don't
    // scatter the list. `created_at DESC` is a last-resort tiebreak for
    // the rare same-name / same-distance case.
    const orderClause = hasLocation
      ? sql`distance_km ASC NULLS LAST, LOWER(c.name) ASC, c.created_at DESC`
      : sql`LOWER(c.name) ASC, c.created_at DESC`;

    const communities = (await sql`
      SELECT c.id, c.slug, c.name, c.description, c.visibility, c.join_mode, c.avatar_key, c.banner_key,
        c.location_name, c.owner_user_id, c.created_at, c.is_online,
        (SELECT COUNT(*)::int FROM newchums.community_members cm WHERE cm.community_id = c.id AND cm.status = 'active') AS member_count,
        NULL::text AS viewer_role,
        (SELECT COUNT(*)::int FROM newchums.events e
         JOIN newchums.event_communities ec ON ec.event_id = e.id
         WHERE ec.community_id = c.id
           AND e.status = 'published'
           AND e.starts_at >= NOW()
           AND COALESCE(e.is_qa, false) = false
           AND COALESCE(e.hide_from_explore, false) = false
           AND e.visibility = 'public') AS upcoming_plan_count,
        0::int AS hobby_match_count,
        ${distanceExpr} AS distance_km,
        (SELECT COALESCE(json_agg(json_build_object('name', ii.name, 'slug', ii.slug)), '[]'::json)
         FROM newchums.community_interests ci3
         JOIN newchums.interests ii ON ii.id = ci3.interest_id AND ii.is_deleted = false
         WHERE ci3.community_id = c.id) AS hobbies
      FROM newchums.communities c
      WHERE COALESCE(c.status, 'active') = 'active'
        AND c.visibility = 'public'
        ${q ? sql`AND (c.name ILIKE ${q} OR c.slug ILIKE ${q})` : sql``}
        ${distanceFilter}
        ${hobbyFilter}
      ORDER BY ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `) as Record<string, unknown>[];
    const hasMore = communities.length === limit;
    return c.json({ ok: true, communities, hasMore });
  } catch (err) {
    console.error("[GET /public/communities]", err);
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

    // Fetch community hobbies (needed for both restricted and full responses)
    const communityHobbies = (await sql`
      SELECT i.name, i.slug
      FROM newchums.community_interests ci
      JOIN newchums.interests i ON i.id = ci.interest_id AND i.is_deleted = false
      WHERE ci.community_id = ${community.id}
    `) as { name: string; slug: string }[];

    if (community.visibility === "private" && !isSuperAdmin) {
      // Logged-out viewers get a restricted public-style preview of private
      // communities so the slug URL is shareable (e.g. for posters and QR
      // codes) without exposing members, plans, website, or Discord links.
      // Same shape as the non-member restricted response, minus any viewer-
      // specific state (pending/declined/removed) which can't apply to an
      // anonymous viewer.
      if (!userId) {
        const planCountRows = (await sql`
          SELECT COUNT(*)::int AS cnt FROM newchums.events e
          JOIN newchums.event_communities ec ON ec.event_id = e.id
          WHERE ec.community_id = ${community.id}
            AND e.status = 'published'
            AND e.starts_at >= NOW()
            AND COALESCE(e.is_qa, false) = false
        `) as { cnt: number }[];
        const upcomingPlanCount = planCountRows[0]?.cnt ?? 0;
        return c.json({
          ok: true,
          community: {
            id: community.id, slug: community.slug, name: community.name,
            description: community.description, avatar_key: community.avatar_key,
            // Banner renders on the restricted landing so the page feels
            // finished; it's visual only, no plan/member info leaks through.
            banner_key: community.banner_key,
            visibility: community.visibility, join_mode: community.join_mode,
            is_online: community.is_online, location_name: community.location_name,
            member_count: community.member_count,
            hobbies: communityHobbies,
            upcoming_plan_count: upcomingPlanCount,
            // Operating hours are intentionally omitted here; see restricted-
            // response privacy rule in Technical_Specs.md.
          },
          viewerMembership: null,
          viewerPendingRequest: false,
          viewerDeclinedRequest: false,
          restricted: true,
        });
      }
      const memberRows = (await sql`
        SELECT 1 FROM newchums.community_members WHERE community_id = ${community.id} AND user_id = ${userId} AND status = 'active' LIMIT 1
      `) as unknown[];
      if (memberRows.length === 0) {
        // If the viewer was previously removed from this community, we block
        // any join / request-to-join path (enforced server-side in POST /join
        // too). Surfaced on the restricted view so the UI can explain it.
        const removedRows = (await sql`
          SELECT removal_reason FROM newchums.community_members
          WHERE community_id = ${community.id} AND user_id = ${userId} AND status = 'removed'
          LIMIT 1
        `) as { removal_reason: string | null }[];
        if (removedRows.length > 0) {
          // Private-community non-members don't see website / discord_url
          // (members-only fields). See the Community field visibility rules
          // in AGENTS.md / Technical_Specs.md.
          return c.json({
            ok: true,
            community: {
              id: community.id, slug: community.slug, name: community.name,
              description: community.description, avatar_key: community.avatar_key,
              banner_key: community.banner_key,
              visibility: community.visibility, join_mode: community.join_mode,
              is_online: community.is_online, location_name: community.location_name,
              member_count: community.member_count,
              hobbies: communityHobbies,
              // operating_hours intentionally omitted on restricted responses.
            },
            viewerMembership: null,
            viewerRemoved: true,
            viewerRemovedReason: removedRows[0].removal_reason ?? null,
            restricted: true,
          });
        }

        // These three queries are independent of each other, run in parallel.
        // Partial unique index on (community_id, user_id) WHERE status='pending'
        // guarantees at most one pending row. The declined query uses the most
        // recent row because a user may have multiple declines over time.
        const [pendingRows, declinedRows, planCountRows] = await Promise.all([
          sql`
            SELECT created_at FROM newchums.community_join_requests
            WHERE community_id = ${community.id} AND user_id = ${userId} AND status = 'pending'
            LIMIT 1
          ` as Promise<{ created_at: string | Date }[]>,
          sql`
            SELECT reviewed_at, created_at FROM newchums.community_join_requests
            WHERE community_id = ${community.id} AND user_id = ${userId} AND status = 'declined'
            ORDER BY COALESCE(reviewed_at, created_at) DESC
            LIMIT 1
          ` as Promise<{ reviewed_at: string | Date | null; created_at: string | Date }[]>,
          sql`
            SELECT COUNT(*)::int AS cnt FROM newchums.events e
            JOIN newchums.event_communities ec ON ec.event_id = e.id
            WHERE ec.community_id = ${community.id}
              AND e.status = 'published'
              AND e.starts_at >= NOW()
              AND COALESCE(e.is_qa, false) = false
          ` as Promise<{ cnt: number }[]>,
        ]);
        const upcomingPlanCount = planCountRows[0]?.cnt ?? 0;

        const pendingCreatedAt = pendingRows[0]?.created_at ?? null;
        const pendingCreatedAtIso = pendingCreatedAt
          ? typeof pendingCreatedAt === "string"
            ? pendingCreatedAt
            : pendingCreatedAt.toISOString()
          : null;
        const pendingCooldown = joinRequestCooldownState(pendingCreatedAtIso, COMMUNITY_JOIN_REQUEST_COOLDOWN_DAYS);
        // Pre-formatted so the card's age line doesn't depend on the client clock.
        const pendingSentLabel = (() => {
          if (!pendingCreatedAtIso) return null;
          const ageMs = Date.now() - new Date(pendingCreatedAtIso).getTime();
          const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
          if (days < 1) return "Sent today";
          if (days === 1) return "Sent 1 day ago";
          return `Sent ${days} days ago`;
        })();

        // reviewed_at is set on decline; fall back to created_at for any
        // historical rows predating the reviewed_at column being populated.
        const declinedTsRaw = declinedRows[0]?.reviewed_at ?? declinedRows[0]?.created_at ?? null;
        const declinedCooldown = joinRequestCooldownState(declinedTsRaw, COMMUNITY_JOIN_REQUEST_DECLINED_COOLDOWN_DAYS);

        return c.json({
          ok: true,
          // Private-community non-members don't see website / discord_url
          // or operating_hours (same restricted-response rule).
          community: {
            id: community.id, slug: community.slug, name: community.name,
            description: community.description, avatar_key: community.avatar_key,
            banner_key: community.banner_key,
            visibility: community.visibility, join_mode: community.join_mode,
            is_online: community.is_online, location_name: community.location_name,
            member_count: community.member_count,
            hobbies: communityHobbies,
            upcoming_plan_count: upcomingPlanCount,
          },
          viewerMembership: null,
          viewerPendingRequest: pendingRows.length > 0,
          viewerPendingRequestCreatedAt: pendingCreatedAtIso,
          viewerPendingRequestSentLabel: pendingSentLabel,
          viewerPendingRequestRefreshable: pendingCooldown.elapsed && pendingRows.length > 0,
          viewerPendingRequestDaysUntilRefreshable: pendingCooldown.daysRemaining,
          viewerPendingRequestCooldownDays: COMMUNITY_JOIN_REQUEST_COOLDOWN_DAYS,
          viewerDeclinedRequest: declinedRows.length > 0,
          viewerDeclinedDaysUntilRetriable: declinedCooldown.daysRemaining,
          restricted: true,
        });
      }
    }

    let viewerMembership: { role: string; status: string } | null = null;
    let viewerPendingRequest = false;
    let viewerRemoved = false;
    if (userId) {
      const memberRows = (await sql`
        SELECT role, status FROM newchums.community_members
        WHERE community_id = ${community.id} AND user_id = ${userId} AND status IN ('active', 'removed')
        LIMIT 1
      `) as { role: string; status: string }[];
      if (memberRows[0]?.status === "active") viewerMembership = memberRows[0];
      else if (memberRows[0]?.status === "removed") viewerRemoved = true;
      else {
        const pendingRows = (await sql`SELECT 1 FROM newchums.community_join_requests WHERE community_id = ${community.id} AND user_id = ${userId} AND status = 'pending' LIMIT 1`) as unknown[];
        viewerPendingRequest = pendingRows.length > 0;
      }
    }

    const ownerAvatarUrl = buildAvatarUrl(String(community.owner_user_id), community.owner_avatar_key as string | null, community.owner_avatar_updated_at as string | null, c.env.MEDIA_BUCKET);
    const isOwnerOrAdmin = isSuperAdmin || (viewerMembership?.role === "owner");

    let pendingRequests: Record<string, unknown>[] = [];
    let declinedRequests: Record<string, unknown>[] = [];
    if (isOwnerOrAdmin && community.join_mode === "approval_required") {
      const rawRequests = (await sql`
        SELECT cjr.id, cjr.user_id, cjr.created_at, cjr.message, u.name, u.username, u.avatar_key, u.avatar_updated_at
        FROM newchums.community_join_requests cjr
        JOIN newchums.users u ON u.id = cjr.user_id
        WHERE cjr.community_id = ${community.id} AND cjr.status = 'pending'
        ORDER BY cjr.created_at ASC
      `) as { id: string; user_id: string; created_at: string; message: string | null; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | null }[];
      pendingRequests = rawRequests.map((r) => ({
        ...r,
        avatar_url: buildAvatarUrl(r.user_id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
      }));

      // Declined requests still inside the cooldown window, excluding users
      // who have since re-requested or joined / been blocked by other paths.
      // Only these are actionable via "Undo denial", once the cooldown
      // lapses the user can request again on their own.
      const cooldownInterval = `${COMMUNITY_JOIN_REQUEST_DECLINED_COOLDOWN_DAYS} days`;
      const rawDeclined = (await sql`
        SELECT cjr.id, cjr.user_id, cjr.created_at, cjr.reviewed_at, cjr.message,
               u.name, u.username, u.avatar_key, u.avatar_updated_at
        FROM newchums.community_join_requests cjr
        JOIN newchums.users u ON u.id = cjr.user_id
        WHERE cjr.community_id = ${community.id}
          AND cjr.status = 'declined'
          AND COALESCE(cjr.reviewed_at, cjr.created_at) >= NOW() - ${cooldownInterval}::interval
          AND NOT EXISTS (
            SELECT 1 FROM newchums.community_join_requests cjr2
            WHERE cjr2.community_id = cjr.community_id
              AND cjr2.user_id = cjr.user_id
              AND cjr2.status IN ('pending', 'approved')
          )
          AND NOT EXISTS (
            SELECT 1 FROM newchums.community_members cm
            WHERE cm.community_id = cjr.community_id
              AND cm.user_id = cjr.user_id
          )
        ORDER BY cjr.reviewed_at DESC NULLS LAST, cjr.created_at DESC
        LIMIT 100
      `) as { id: string; user_id: string; created_at: string; reviewed_at: string | null; message: string | null; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | null }[];
      declinedRequests = rawDeclined.map((r) => ({
        ...r,
        avatar_url: buildAvatarUrl(r.user_id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
      }));
    }

    let shareToken: string | null = null;
    if (community.visibility === "private" && (isOwnerOrAdmin) && c.env.NEXTAUTH_SECRET) {
      shareToken = await new SignJWT({ cid: String(community.id), purpose: "community_share" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .sign(new TextEncoder().encode(c.env.NEXTAUTH_SECRET));
    }

    // Banner upload is now a Free-tier capability (was previously gated as
    // Community Pro). Owner + super-admin permission still applies; the
    // edit form gates the uploader on `viewerCanEditBanner` instead of the
    // old `viewerHasProBannerAccess` flag. The flag is kept (always true
    // for owner/admin viewers) so older clients continue to render the
    // uploader without a redeploy; new clients should read
    // `viewerCanEditBanner`.
    const viewerCanEditBanner = isOwnerOrAdmin;

    // Tab indicator for the Announcements tab. Logged-out viewers never
    // need a badge (they have no seen-state to compare against). For
    // logged-in viewers we compare the latest non-deleted announcement's
    // `created_at` against the viewer's `last_seen_at` for this community
    // (`community_announcement_seen`); a NULL row is treated as "never
    // seen" so brand-new viewers will see the indicator if any
    // announcements exist. Cheap query, single round trip.
    let hasUnseenAnnouncements = false;
    // `viewerAnnouncementMuted` reflects only the per-community mute row,
    // not the global notification preference. The Settings UI exposes the
    // global toggle separately, and we want this flag to mean "the
    // viewer has explicitly silenced this community" so the overflow menu
    // can render the right action label without the global toggle
    // confusing the local state.
    let viewerAnnouncementMuted = false;
    if (userId) {
      const unseenRows = (await sql`
        SELECT EXISTS (
          SELECT 1 FROM newchums.community_announcements a
          WHERE a.community_id = ${community.id}
            AND a.deleted_at IS NULL
            AND a.created_at > COALESCE(
              (SELECT s.last_seen_at FROM newchums.community_announcement_seen s
               WHERE s.user_id = ${userId} AND s.community_id = ${community.id} LIMIT 1),
              '1970-01-01'::timestamptz
            )
        ) AS has_unseen
      `) as { has_unseen: boolean }[];
      hasUnseenAnnouncements = unseenRows[0]?.has_unseen === true;

      const muteRows = (await sql`
        SELECT 1 FROM newchums.community_announcement_mutes
        WHERE user_id = ${userId} AND community_id = ${community.id}
        LIMIT 1
      `) as unknown[];
      viewerAnnouncementMuted = muteRows.length > 0;
    }

    return c.json({
      ok: true,
      community: {
        ...(community as Record<string, unknown>),
        owner_avatar_url: ownerAvatarUrl,
        hobbies: communityHobbies,
      },
      viewerMembership,
      viewerPendingRequest,
      viewerRemoved,
      viewerCanEditBanner,
      viewerHasProBannerAccess: viewerCanEditBanner,
      hasUnseenAnnouncements,
      viewerAnnouncementMuted,
      pendingRequests: isOwnerOrAdmin ? pendingRequests : undefined,
      declinedRequests: isOwnerOrAdmin ? declinedRequests : undefined,
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
    if (body.description !== undefined) {
      const d = body.description ? String(body.description).trim().slice(0, 2000) : null;
      if (!d) return c.json({ ok: false, error: "VALIDATION", message: "Description is required", field: "description" }, 400);
      updates.push("description"); vals.push(d);
    }
    // Unified access model: prefer "access" field, fall back to legacy visibility/join_mode
    if (body.access !== undefined) {
      const access = String(body.access);
      if (access === "open") { updates.push("visibility"); vals.push("public"); updates.push("join_mode"); vals.push("open"); }
      else if (access === "private") { updates.push("visibility"); vals.push("private"); updates.push("join_mode"); vals.push("approval_required"); }
      else return c.json({ ok: false, error: "VALIDATION", message: "Access must be 'open' or 'private'" }, 400);
    } else {
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
    }
    if (body.chat_enabled !== undefined) { updates.push("chat_enabled"); vals.push(body.chat_enabled !== false); }
    if (body.schedule_enabled !== undefined) { updates.push("schedule_enabled"); vals.push(body.schedule_enabled !== false); }
    if (body.is_online !== undefined) { updates.push("is_online"); vals.push(body.is_online === true); }
    if (body.website !== undefined) { updates.push("website"); vals.push(body.website ? String(body.website).trim().slice(0, 500) : null); }
    if (body.discord_url !== undefined) { updates.push("discord_url"); vals.push(body.discord_url ? String(body.discord_url).trim().slice(0, 500) : null); }
    if (body.location_name !== undefined) { updates.push("location_name"); vals.push(body.location_name ? String(body.location_name).trim().slice(0, 200) : null); }
    if (body.location_address !== undefined) { updates.push("location_address"); vals.push(body.location_address ? String(body.location_address).trim().slice(0, 500) : null); }
    if (body.location_lat !== undefined) { updates.push("location_lat"); vals.push(body.location_lat != null && Number.isFinite(Number(body.location_lat)) ? Number(body.location_lat) : null); }
    if (body.location_lng !== undefined) { updates.push("location_lng"); vals.push(body.location_lng != null && Number.isFinite(Number(body.location_lng)) ? Number(body.location_lng) : null); }
    if (body.avatar_key !== undefined) { updates.push("avatar_key"); vals.push(body.avatar_key ? String(body.avatar_key) : null); }
    if (body.banner_key !== undefined) {
      // Only accept explicit clear (null) via PATCH. Setting a key goes
      // through /media/finalize so the Pro gate and R2-object existence
      // are checked there, bypassing it via a raw PATCH is not allowed.
      if (body.banner_key !== null) {
        return c.json({ ok: false, error: "VALIDATION", message: "Set a banner via /media/finalize; PATCH only accepts null to clear it.", field: "banner_key" }, 400);
      }
      updates.push("banner_key"); vals.push(null);
    }
    if (body.operating_hours !== undefined) {
      const parsed = parseOperatingHours(body.operating_hours);
      if (!parsed.ok) return c.json({ ok: false, error: "VALIDATION", message: parsed.error, field: "operating_hours" }, 400);
      updates.push("operating_hours"); vals.push(parsed.value);
    }

    // Enforce location consistency. If the patch touches online/location,
    // the resulting state (merge of existing row + patched fields) must
    // have coordinates when offline. This mirrors the POST /communities
    // check and prevents text-only edits from leaving stale or missing
    // lat/lng that silently break the distance filter in discovery.
    const touchesLocation =
      body.is_online !== undefined ||
      body.location_name !== undefined ||
      body.location_address !== undefined ||
      body.location_lat !== undefined ||
      body.location_lng !== undefined;
    if (touchesLocation) {
      const current = (await sql`
        SELECT is_online, location_lat, location_lng
        FROM newchums.communities WHERE id = ${community.id} LIMIT 1
      `) as { is_online: boolean; location_lat: number | null; location_lng: number | null }[];
      const curr = current[0];
      const finalIsOnline = body.is_online !== undefined ? body.is_online === true : (curr?.is_online ?? false);
      const finalLat = body.location_lat !== undefined
        ? (body.location_lat != null && Number.isFinite(Number(body.location_lat)) ? Number(body.location_lat) : null)
        : (curr?.location_lat ?? null);
      const finalLng = body.location_lng !== undefined
        ? (body.location_lng != null && Number.isFinite(Number(body.location_lng)) ? Number(body.location_lng) : null)
        : (curr?.location_lng ?? null);
      if (!finalIsOnline && (finalLat == null || finalLng == null)) {
        return c.json({ ok: false, error: "VALIDATION", message: "Please pick a location from the suggestions", field: "location" }, 400);
      }
    }

    // Handle interest_items update (replace all community interests)
    if (Array.isArray(body.interest_items)) {
      const interestItems = body.interest_items as { slug: string; name: string }[];
      if (interestItems.length === 0)
        return c.json({ ok: false, error: "VALIDATION", message: "Add at least one hobby", field: "hobby" }, 400);
      const interestIds: string[] = [];
      for (const item of interestItems) {
        const slugVal = String(item.slug ?? "").trim().toLowerCase();
        const nameVal = String(item.name ?? "").trim();
        if (!slugVal || !nameVal) continue;
        const existing = (await sql`SELECT id FROM newchums.interests WHERE slug = ${slugVal} AND is_deleted = false LIMIT 1`) as { id: string }[];
        if (existing[0]) { interestIds.push(existing[0].id); continue; }
        // Insert a fresh interest. `category` is NOT NULL so we must supply an
        // empty string; `is_seed = false` marks it as user-created. ON CONFLICT
        // DO NOTHING means a slug that exists but is soft-deleted is left alone
        // (admins soft-delete inappropriate hobbies; users shouldn't resurrect
        // them by re-submitting the same slug). Matches the plan-side pattern.
        try {
          await sql`INSERT INTO newchums.interests (name, category, slug, sort_order, is_seed, created_by_user_id) VALUES (${nameVal}, '', ${slugVal}, 0, false, ${userId}) ON CONFLICT (slug) DO NOTHING`;
        } catch { /* ignore concurrent insert race */ }
        const fetched = (await sql`SELECT id FROM newchums.interests WHERE LOWER(slug) = LOWER(${slugVal}) AND is_deleted = false LIMIT 1`) as { id: string }[];
        if (fetched[0]) interestIds.push(fetched[0].id);
      }
      await sql`DELETE FROM newchums.community_interests WHERE community_id = ${community.id}`;
      if (interestIds.length > 0) {
        await sql`INSERT INTO newchums.community_interests (community_id, interest_id) SELECT ${community.id}, UNNEST(${interestIds}::uuid[]) ON CONFLICT DO NOTHING`;
      }
    }

    if (updates.length === 0 && !Array.isArray(body.interest_items)) return c.json({ ok: true });

    const fieldMap = Object.fromEntries(updates.map((col, i) => [col, vals[i]]));
    const cid = community.id;
    if (fieldMap.name !== undefined) await sql`UPDATE newchums.communities SET name = ${fieldMap.name as string}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.description !== undefined) await sql`UPDATE newchums.communities SET description = ${fieldMap.description as string | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.visibility !== undefined) await sql`UPDATE newchums.communities SET visibility = ${fieldMap.visibility as string}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.join_mode !== undefined) await sql`UPDATE newchums.communities SET join_mode = ${fieldMap.join_mode as string}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.chat_enabled !== undefined) await sql`UPDATE newchums.communities SET chat_enabled = ${fieldMap.chat_enabled as boolean}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.schedule_enabled !== undefined) await sql`UPDATE newchums.communities SET schedule_enabled = ${fieldMap.schedule_enabled as boolean}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.is_online !== undefined) await sql`UPDATE newchums.communities SET is_online = ${fieldMap.is_online as boolean}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.website !== undefined) await sql`UPDATE newchums.communities SET website = ${fieldMap.website as string | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.discord_url !== undefined) await sql`UPDATE newchums.communities SET discord_url = ${fieldMap.discord_url as string | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.location_name !== undefined) await sql`UPDATE newchums.communities SET location_name = ${fieldMap.location_name as string | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.location_address !== undefined) await sql`UPDATE newchums.communities SET location_address = ${fieldMap.location_address as string | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.location_lat !== undefined) await sql`UPDATE newchums.communities SET location_lat = ${fieldMap.location_lat as number | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.location_lng !== undefined) await sql`UPDATE newchums.communities SET location_lng = ${fieldMap.location_lng as number | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.avatar_key !== undefined) await sql`UPDATE newchums.communities SET avatar_key = ${fieldMap.avatar_key as string | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.banner_key !== undefined) await sql`UPDATE newchums.communities SET banner_key = ${fieldMap.banner_key as string | null}, updated_at = now() WHERE id = ${cid}`;
    if (fieldMap.operating_hours !== undefined) {
      const hours = fieldMap.operating_hours as OperatingHours | null;
      await sql`UPDATE newchums.communities SET operating_hours = ${hours ? JSON.stringify(hours) : null}::jsonb, updated_at = now() WHERE id = ${cid}`;
    }

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
    await sql`DELETE FROM newchums.event_communities WHERE community_id = ${cid}`;
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

  // Parse optional message from body
  let joinMessage: string | null = null;
  try {
    const body = await c.req.json();
    if (body.message && typeof body.message === "string") {
      joinMessage = body.message.trim().slice(0, 500) || null;
    }
  } catch { /* body may be empty for open joins */ }

  try {
    const communityRows = (await sql`SELECT id, slug, join_mode, visibility, owner_user_id, name FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string; slug: string; join_mode: string; visibility: string; owner_user_id: string; name: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const community = communityRows[0];

    const existingMemberRows = (await sql`
      SELECT status FROM newchums.community_members WHERE community_id = ${communityId} AND user_id = ${userId} LIMIT 1
    `) as { status: string }[];
    if (existingMemberRows[0]?.status === "active") return c.json({ ok: true, status: "already_member" });
    // A removed member can't rejoin, regardless of community visibility or
    // join_mode. Returning ok:true with a distinct status lets the client
    // surface a banner instead of treating it like an error.
    if (existingMemberRows[0]?.status === "removed") return c.json({ ok: true, status: "removed" });

    if (community.join_mode === "approval_required") {
      // Partial unique index on (community_id, user_id) WHERE status='pending'
      // guarantees at most one row.
      const existingReq = (await sql`
        SELECT id, created_at FROM newchums.community_join_requests
        WHERE community_id = ${communityId} AND user_id = ${userId} AND status = 'pending'
        LIMIT 1
      `) as { id: string; created_at: string | Date }[];

      let requestAction: "pending" | "refreshed" = "pending";

      if (existingReq.length > 0) {
        const pendingCooldown = joinRequestCooldownState(existingReq[0].created_at, COMMUNITY_JOIN_REQUEST_COOLDOWN_DAYS);
        if (!pendingCooldown.elapsed) {
          return c.json({
            ok: true,
            status: "already_pending",
            cooldownDays: COMMUNITY_JOIN_REQUEST_COOLDOWN_DAYS,
            daysRemaining: pendingCooldown.daysRemaining,
          });
        }

        // Cooldown met: bump created_at + message on the existing row so the
        // owner's Requests tab re-sorts it to the top and the notification +
        // email fire again (owner may have missed the first one). The
        // pending-only partial unique index makes a second insert invalid.
        await sql`
          UPDATE newchums.community_join_requests
          SET created_at = NOW(), message = ${joinMessage}
          WHERE id = ${existingReq[0].id}
        `;
        requestAction = "refreshed";
      } else {
        // No pending request, but check for a recent decline first. The
        // decline cooldown stops a user from re-submitting immediately after
        // a rejection.
        const recentDeclined = (await sql`
          SELECT reviewed_at, created_at FROM newchums.community_join_requests
          WHERE community_id = ${communityId} AND user_id = ${userId} AND status = 'declined'
          ORDER BY COALESCE(reviewed_at, created_at) DESC
          LIMIT 1
        `) as { reviewed_at: string | Date | null; created_at: string | Date }[];
        if (recentDeclined.length > 0) {
          const declinedCooldown = joinRequestCooldownState(
            recentDeclined[0].reviewed_at ?? recentDeclined[0].created_at,
            COMMUNITY_JOIN_REQUEST_DECLINED_COOLDOWN_DAYS
          );
          if (!declinedCooldown.elapsed) {
            return c.json({
              ok: true,
              status: "declined_cooldown",
              cooldownDays: COMMUNITY_JOIN_REQUEST_DECLINED_COOLDOWN_DAYS,
              daysRemaining: declinedCooldown.daysRemaining,
            });
          }
        }

        await sql`
          INSERT INTO newchums.community_join_requests (community_id, user_id, message)
          VALUES (${communityId}, ${userId}, ${joinMessage})
        `;
      }

      // Notify owner (in-app + email). Fires for both a brand-new request
      // and a refreshed one; the cooldown above is what prevents this from
      // becoming a spam vector.
      const ownerRows = (await sql`SELECT email, name FROM newchums.users WHERE id = ${community.owner_user_id} LIMIT 1`) as { email: string; name: string | null }[];
      const requesterRows = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId} LIMIT 1`) as { name: string | null; username: string | null }[];
      const requesterName = requesterRows[0]?.name || requesterRows[0]?.username || "Someone";

      // In-app notification
      await sql`
        INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
        VALUES (${community.owner_user_id}, 'community_join_request', ${userId}, ${communityId}, ${JSON.stringify({ communityName: community.name, communitySlug: community.slug, requesterName, refreshed: requestAction === "refreshed" })})
      `;

      // Email
      if (ownerRows[0]) {
        const ownerProfileRows = (await sql`SELECT notification_prefs FROM user_profile WHERE user_id = ${community.owner_user_id} LIMIT 1`) as { notification_prefs: unknown }[];
        const ownerPrefs = normalizeNotificationPrefs(ownerProfileRows[0]?.notification_prefs);
        if (ownerPrefs.items.community_join_request_received?.enabled !== false) {
          c.executionCtx.waitUntil(sendCommunityJoinRequestEmail(c.env, {
            to: ownerRows[0].email,
            ownerName: ownerRows[0].name || "there",
            requesterName,
            communityName: community.name,
            // Deep-link the "Review request" CTA straight into the Requests
            // tab so the owner doesn't land on Plans and have to go hunt
            // for the request they came here to act on. The client reads
            // ?tab=requests on mount and clamps to Plans when the viewer
            // isn't eligible to see the Requests tab.
            communityUrl: `${c.env.WEB_BASE_URL}/communities/${community.slug}?tab=requests`,
            message: joinMessage,
          }));
        }
      }

      return c.json({ ok: true, status: requestAction });
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
      SELECT cm.id, cm.user_id, cm.role, cm.status, cm.created_at, cm.removed_at, cm.removal_reason,
             u.name, u.username, u.avatar_key, u.avatar_updated_at
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

    // Only the owner (or super admin) needs history of removed members.
    // Everyone else sees just the active roster.
    const ownerRows = (await sql`SELECT owner_user_id FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { owner_user_id: string }[];
    const isOwner = !!userId && userId === ownerRows[0]?.owner_user_id;
    const removedMembers = (isOwner || isSuperAdmin)
      ? ((await sql`
          SELECT cm.id, cm.user_id, cm.role, cm.status, cm.created_at, cm.removed_at, cm.removal_reason,
                 u.name, u.username, u.avatar_key, u.avatar_updated_at
          FROM newchums.community_members cm
          JOIN newchums.users u ON u.id = cm.user_id
          WHERE cm.community_id = ${communityId} AND cm.status = 'removed'
          ORDER BY cm.removed_at DESC NULLS LAST, cm.created_at DESC
          LIMIT 100
        `) as Record<string, unknown>[]).map((m) => ({
          ...m,
          avatar_url: buildAvatarUrl(String(m.user_id), m.avatar_key as string | null, m.avatar_updated_at as string | null, c.env.MEDIA_BUCKET),
        }))
      : [];

    return c.json({ ok: true, members: membersWithAvatars, removedMembers });
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

  let removalReason: string | null = null;
  try {
    const body = await c.req.json();
    if (body && typeof body.reason === "string") {
      const trimmed = body.reason.trim().slice(0, 500);
      if (trimmed.length > 0) removalReason = trimmed;
    }
  } catch { /* body optional */ }

  try {
    const communityRows = (await sql`SELECT id, name, slug, owner_user_id FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string; name: string; slug: string; owner_user_id: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const community = communityRows[0];
    if (community.owner_user_id !== userRows[0].id && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
    if (targetUserId === community.owner_user_id) return c.json({ ok: false, error: "CANNOT_REMOVE_OWNER" }, 400);

    // Row must already exist (unique on (community_id, user_id)); an UPDATE
    // is enough. Also records who removed them + when for later history.
    const updated = (await sql`
      UPDATE newchums.community_members
      SET status = 'removed',
          removal_reason = ${removalReason},
          removed_at = NOW(),
          removed_by_user_id = ${userRows[0].id}
      WHERE community_id = ${communityId} AND user_id = ${targetUserId}
      RETURNING 1
    `) as unknown[];
    if (updated.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    // In-app notification + email to the removed user. Both are best-effort
    //, a failure here must not undo the removal.
    const targetRows = (await sql`SELECT email, name FROM newchums.users WHERE id = ${targetUserId} LIMIT 1`) as { email: string; name: string | null }[];
    const target = targetRows[0];
    if (target) {
      try {
        await sql`
          INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
          VALUES (${targetUserId}, 'community_member_removed', ${userRows[0].id}, ${communityId}, ${JSON.stringify({ communityName: community.name, communitySlug: community.slug })})
        `;
      } catch { /* noop */ }

      const recipientName = target.name?.trim() || "there";
      c.executionCtx.waitUntil(
        sendCommunityMemberRemovedEmail(c.env, {
          to: target.email,
          recipientName,
          communityName: community.name,
          communityUrl: `${c.env.WEB_BASE_URL}/communities/${community.slug}`,
          removalReason,
        }).catch(() => { /* email failures are swallowed; removal itself succeeded */ }),
      );
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /communities/:id/members/:userId/remove]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /communities/:id/members/:userId/unblock, lift a prior remove+block.
 *  Deletes the community_members row outright, the user is back to being a
 *  plain non-member and may request to join again on their own. Crucially
 *  this does NOT auto-re-add them; the owner is just opening the door. */
app.post("/communities/:id/members/:userId/unblock", async (c) => {
  const communityId = c.req.param("id");
  const targetUserId = c.req.param("userId");
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
  if (!userRows[0]) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const isSuperAdmin = userRows[0].role === "super_admin";

  try {
    const communityRows = (await sql`SELECT id, name, slug, owner_user_id FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string; name: string; slug: string; owner_user_id: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const community = communityRows[0];
    if (community.owner_user_id !== userRows[0].id && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

    const deleted = (await sql`
      DELETE FROM newchums.community_members
      WHERE community_id = ${communityId} AND user_id = ${targetUserId} AND status = 'removed'
      RETURNING 1
    `) as unknown[];
    if (deleted.length === 0) return c.json({ ok: false, error: "NOT_BLOCKED" }, 404);

    // In-app notification + email, both best-effort.
    const targetRows = (await sql`SELECT email, name FROM newchums.users WHERE id = ${targetUserId} LIMIT 1`) as { email: string; name: string | null }[];
    const target = targetRows[0];
    try {
      await sql`
        INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
        VALUES (${targetUserId}, 'community_member_unblocked', ${userRows[0].id}, ${communityId}, ${JSON.stringify({ communityName: community.name, communitySlug: community.slug })})
      `;
    } catch { /* noop */ }

    if (target) {
      const recipientName = target.name?.trim() || "there";
      c.executionCtx.waitUntil(
        sendCommunityMemberUnblockedEmail(c.env, {
          to: target.email,
          recipientName,
          communityName: community.name,
          communityUrl: `${c.env.WEB_BASE_URL}/communities/${community.slug}`,
        }).catch(() => { /* email failure doesn't undo the unblock */ }),
      );
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /communities/:id/members/:userId/unblock]", err);
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

    const community = communityRows[0];

    // In-app notification to requester
    const notifType = action === "approve" ? "community_join_request_approved" : "community_join_request_declined";
    await sql`
      INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
      VALUES (${reqRows[0].user_id}, ${notifType}, ${userRows[0].id}, ${communityId}, ${JSON.stringify({ communityName: community.name, communitySlug: community.slug })})
    `;

    // Email notification to requester
    const requesterRows = (await sql`SELECT email, name FROM newchums.users WHERE id = ${reqRows[0].user_id} LIMIT 1`) as { email: string; name: string | null }[];
    if (requesterRows[0]) {
      if (action === "approve") {
        c.executionCtx.waitUntil(sendCommunityJoinApprovedEmail(c.env, {
          to: requesterRows[0].email,
          userName: requesterRows[0].name || "there",
          communityName: community.name,
          communityUrl: `${c.env.WEB_BASE_URL}/communities/${community.slug}`,
        }));
      } else if (action === "decline") {
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

/** POST /communities/:id/join-requests/:requestId/undo-decline, reverse a
 *  prior decline while the 30-day cooldown is still active. Deletes the
 *  declined row so the cooldown no longer applies, the requester can submit
 *  a fresh request on their own, but is NOT automatically added. */
app.post("/communities/:id/join-requests/:requestId/undo-decline", async (c) => {
  const communityId = c.req.param("id");
  const requestId = c.req.param("requestId");
  const payload = await requireAuth(c);
  if (!payload?.email) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const sql = getSql(c.env);
  const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
  if (!userRows[0]) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const isSuperAdmin = userRows[0].role === "super_admin";

  try {
    const communityRows = (await sql`SELECT id, name, slug, owner_user_id FROM newchums.communities WHERE id = ${communityId} LIMIT 1`) as { id: string; name: string; slug: string; owner_user_id: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const community = communityRows[0];
    if (community.owner_user_id !== userRows[0].id && !isSuperAdmin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);

    const reqRows = (await sql`
      SELECT id, user_id, status FROM newchums.community_join_requests
      WHERE id = ${requestId} AND community_id = ${communityId}
      LIMIT 1
    `) as { id: string; user_id: string; status: string }[];
    if (!reqRows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (reqRows[0].status !== "declined") return c.json({ ok: false, error: "NOT_DECLINED" }, 409);

    await sql`DELETE FROM newchums.community_join_requests WHERE id = ${requestId}`;

    const targetUserId = reqRows[0].user_id;
    const targetRows = (await sql`SELECT email, name FROM newchums.users WHERE id = ${targetUserId} LIMIT 1`) as { email: string; name: string | null }[];
    const target = targetRows[0];

    try {
      await sql`
        INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
        VALUES (${targetUserId}, 'community_join_request_reopened', ${userRows[0].id}, ${communityId}, ${JSON.stringify({ communityName: community.name, communitySlug: community.slug })})
      `;
    } catch { /* noop */ }

    if (target) {
      const recipientName = target.name?.trim() || "there";
      c.executionCtx.waitUntil(
        sendCommunityJoinRequestReopenedEmail(c.env, {
          to: target.email,
          recipientName,
          communityName: community.name,
          communityUrl: `${c.env.WEB_BASE_URL}/communities/${community.slug}`,
        }).catch(() => { /* email failure doesn't undo the action */ }),
      );
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /communities/:id/join-requests/:requestId/undo-decline]", err);
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

    const rawRequests = (await sql`
      SELECT cjr.id, cjr.user_id, cjr.created_at, cjr.message, u.name, u.username, u.avatar_key, u.avatar_updated_at
      FROM newchums.community_join_requests cjr
      JOIN newchums.users u ON u.id = cjr.user_id
      WHERE cjr.community_id = ${communityId} AND cjr.status = 'pending'
      ORDER BY cjr.created_at ASC
    `) as { id: string; user_id: string; created_at: string; message: string | null; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | null }[];
    const requests = rawRequests.map((r) => ({
      ...r,
      avatar_url: buildAvatarUrl(r.user_id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
    }));

    return c.json({ ok: true, requests });
  } catch (err) {
    console.error("[GET /communities/:id/join-requests]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /communities/:id/events, community plan feed.
 *
 *  Default mode (?past omitted or false): upcoming plans (allowing a 24-hour
 *  lookback so a plan that just ended is still visible at the top of the
 *  feed).
 *
 *  Past mode (?past=true): "Recently happened" social-proof feed for the
 *  community page, used below the upcoming list. Returns plans from the
 *  last 90 days that are filtered to "successful" past plans (at least
 *  one non-host RSVP marked Going). Past mode never includes plans that
 *  start in the future. The visibility matrix and QA-isolation rules are
 *  identical to upcoming mode; community privacy still gates the
 *  endpoint itself, hide_from_explore is irrelevant in this feed.
 */
app.get("/communities/:id/events", async (c) => {
  const communityId = c.req.param("id");
  const payload = await requireAuth(c);
  const sql = getSql(c.env);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 12), 1), 50);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const pastMode = c.req.query("past") === "true";

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

    // Time-window filter:
    //  - upcoming mode: plans whose start time is later than 24 hours ago
    //    (so a plan that just ended is still visible briefly).
    //  - past mode: plans whose start time is in the past and within the
    //    last 90 days, with a participation signal so we don't surface
    //    lonely past plans as social proof.
    const timeFilter = pastMode
      ? sql`e.starts_at < now() AND e.starts_at >= now() - interval '90 days' AND EXISTS (
          SELECT 1 FROM newchums.event_rsvps er_signal
          WHERE er_signal.event_id = e.id
            AND er_signal.user_id IS DISTINCT FROM e.host_user_id
            AND er_signal.status = 'going'
        )`
      : sql`e.starts_at > now() - interval '24 hours'`;
    const orderClause = pastMode ? sql`e.starts_at DESC` : sql`e.starts_at ASC`;

    const events = (await sql`
      SELECT e.id, e.title, e.description, e.starts_at, e.timezone, e.location_type, e.location_name, e.location_area,
        e.location_address, e.location_visibility, e.online_link, e.location_lat, e.location_lng,
        e.visibility, e.status, e.max_seats, e.banner_key, e.host_user_id, e.created_at, e.allow_alt_times,
        COALESCE(e.is_qa, false) AS is_qa,
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
        r_viewer.status AS my_rsvp_status,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('id', c2.id, 'slug', c2.slug, 'name', c2.name) ORDER BY c2.name)
           FROM newchums.event_communities ec2
           JOIN newchums.communities c2 ON c2.id = ec2.community_id
           WHERE ec2.event_id = e.id
             AND COALESCE(c2.status, 'active') = 'active'),
          '[]'::jsonb
        ) AS communities
      FROM newchums.events e
      JOIN newchums.users u ON u.id = e.host_user_id
      JOIN newchums.event_communities ec_filter ON ec_filter.event_id = e.id AND ec_filter.community_id = ${communityId}
      LEFT JOIN newchums.event_rsvps r_viewer ON r_viewer.event_id = e.id AND r_viewer.user_id = ${userId}
      WHERE e.status = 'published' AND ${timeFilter}
        AND (COALESCE(e.is_qa, false) = false OR ${isSuperAdmin})
        -- Community linkage is organizational context only; it does not expand
        -- the audience beyond the plan's base visibility rule. See
        -- AGENTS.md -> Plan Feed and Community Visibility Contract.
        --
        -- invite_only plans never appear in the community feed. Invitees
        -- reach the plan via their invite link; the host can find it in
        -- Your Plans. The Add/Edit plan forms also prevent new invite_only
        -- plans from being linked to a community, but we enforce the rule
        -- here too for any legacy rows.
        AND e.visibility != 'invite_only'
        -- chums_only plans are still scoped to the host, the host's
        -- on-NewChums chums, and anyone already RSVP'd, even inside the
        -- community feed. Community membership alone is not enough.
        AND (
          e.visibility = 'public'
          OR (e.visibility = 'chums_only' AND (
            ${userId}::text IS NOT NULL AND (
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
            )
          ))
        )
      ORDER BY ${orderClause}
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

    // Logged-out viewers must not see exact addresses, venue names, online
    // meeting links, or precise coordinates on the community plan feed.
    // Mirrors the public Explore feed (`GET /events/explore/public`) and the
    // public plan-detail preview (`GET /events/:id` access state `public`).
    // The `locationDisplay` field is computed server-side so all surfaces
    // agree on the privacy-safe fallback ("London, ON" rather than the
    // generic "General area" when an approximate area is derivable).
    const viewerAuthenticated = !!userId;

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

      const rawLocationArea = (ev.location_area as string | null) ?? null;
      const rawLocationAddress = (ev.location_address as string | null) ?? null;
      const locationType = String(ev.location_type ?? "in_person");
      // Approximate area used both for the privacy-safe `locationDisplay`
      // fallback and for the redacted `locationArea` field on logged-out
      // responses. Same precedence the public Explore feed uses.
      const approxArea = (rawLocationArea && rawLocationArea.trim())
        || deriveApproxArea(rawLocationAddress)
        || null;
      const locationDisplay = locationType === "online"
        ? "Online"
        : approxArea || "General area";

      // Normalized camelCase payload. The prior spread mixed DB snake_case
      // with ad-hoc camelCase (hasPrefMismatch, isQa) and forced the sole
      // caller (CommunityDetailClient) to hand-pick which convention to use
      // per field. All plan-card fields are now camelCase.
      return {
        id: String(ev.id),
        title: String(ev.title ?? ""),
        description: (ev.description as string | null) ?? null,
        startsAt: String(ev.starts_at ?? ""),
        timezone: (ev.timezone as string | null) ?? null,
        locationType,
        locationDisplay,
        // Logged-out viewers receive only privacy-safe location fields:
        // approximate area + display string, never venue/street/online
        // link/coords. Authenticated viewers continue to see the same
        // detail set as before (the plan-detail page applies its own
        // visibility-aware redaction once they open a plan).
        locationName: viewerAuthenticated ? ((ev.location_name as string | null) ?? null) : null,
        locationAddress: viewerAuthenticated ? rawLocationAddress : null,
        locationArea: approxArea,
        locationVisibility: (ev.location_visibility as string | null) ?? null,
        locationLat: viewerAuthenticated && ev.location_lat != null ? Number(ev.location_lat) : null,
        locationLng: viewerAuthenticated && ev.location_lng != null ? Number(ev.location_lng) : null,
        onlineLink: viewerAuthenticated ? ((ev.online_link as string | null) ?? null) : null,
        visibility: String(ev.visibility ?? "public"),
        status: String(ev.status ?? "published"),
        maxSeats: ev.max_seats != null ? Number(ev.max_seats) : null,
        bannerKey: (ev.banner_key as string | null) ?? null,
        hostUserId: String(ev.host_user_id),
        hostName: (ev.host_name as string | null) ?? null,
        hostUsername: (ev.host_username as string | null) ?? null,
        hostAvatarUrl: buildAvatarUrl(String(ev.host_user_id), ev.host_avatar_key as string | null, ev.host_avatar_updated_at as string | null, c.env.MEDIA_BUCKET),
        createdAt: String(ev.created_at ?? ""),
        allowAltTimes: ev.allow_alt_times === true,
        goingCount: Number(ev.going_count ?? 0),
        maybeCount: Number(ev.maybe_count ?? 0),
        hobbyNames: (ev.hobby_names as string | null) ?? null,
        hobbies: ev.hobbies,
        isHost: ev.is_host === true,
        myRsvpStatus: (ev.my_rsvp_status as string | null) ?? null,
        communities: (ev.communities as Array<{ id: string; slug: string; name: string }> | null) ?? [],
        hasPrefMismatch,
        isQa: ev.is_qa === true,
      };
    });

    return c.json({ ok: true, events: eventsWithAvatars });
  } catch (err) {
    console.error("[GET /communities/:id/events]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Community announcements (v1) ───────────────────────────────────────────
//
// Tab-based announcement feed on the community detail page. Visibility
// follows the existing community-page rules: public communities are
// readable by anyone (logged-out included); private communities require an
// active member or super admin. Management (create / edit / pin / delete)
// is restricted to community owner + super admin. v1 deliberately scopes
// to the announcement list, no email blast, no in-app bell notification,
// no comments, reactions, attachments, or scheduling. The tab indicator
// uses a per-user last-seen timestamp (`community_announcement_seen`)
// rather than per-announcement read rows.

const MAX_ANNOUNCEMENT_TITLE_LEN = 200;
const MAX_ANNOUNCEMENT_BODY_LEN = 10000;

/**
 * Resolve viewer state needed by every announcement endpoint:
 *  - the requesting user's id (or null for logged-out callers)
 *  - whether they're a super admin
 *  - the community row (or null if missing/closed-and-not-admin)
 *  - the viewer's active membership row (if any)
 *
 * Returns `null` for the community when the caller should receive a 404
 * (missing or closed-without-super-admin), so handlers can fail fast.
 */
async function resolveAnnouncementContext(
  sql: ReturnType<typeof getSql>,
  c: Parameters<Parameters<typeof app.get>[1]>[0],
  communityId: string,
): Promise<{
  userId: string | null;
  isSuperAdmin: boolean;
  community: { id: string; visibility: string; status: string; owner_user_id: string } | null;
  viewerMembership: { role: string; status: string } | null;
}> {
  const payload = await requireAuth(c);
  let userId: string | null = null;
  let isSuperAdmin = false;
  if (payload?.email) {
    const userRows = (await sql`SELECT id, role FROM newchums.users WHERE email = ${payload.email} LIMIT 1`) as { id: string; role: string | null }[];
    if (userRows[0]) { userId = userRows[0].id; isSuperAdmin = userRows[0].role === "super_admin"; }
  }
  const rows = (await sql`
    SELECT id, visibility, COALESCE(status, 'active') AS status, owner_user_id
    FROM newchums.communities
    WHERE id = ${communityId}
    LIMIT 1
  `) as { id: string; visibility: string; status: string; owner_user_id: string }[];
  const community = rows[0] ?? null;
  if (!community || (community.status === "closed" && !isSuperAdmin)) {
    return { userId, isSuperAdmin, community: null, viewerMembership: null };
  }
  let viewerMembership: { role: string; status: string } | null = null;
  if (userId) {
    const m = (await sql`
      SELECT role, status FROM newchums.community_members
      WHERE community_id = ${communityId} AND user_id = ${userId}
      LIMIT 1
    `) as { role: string; status: string }[];
    viewerMembership = m[0] ?? null;
  }
  return { userId, isSuperAdmin, community, viewerMembership };
}

function viewerCanReadAnnouncements(
  community: { visibility: string },
  viewerMembership: { status: string } | null,
  isSuperAdmin: boolean,
): boolean {
  if (community.visibility === "public") return true;
  if (isSuperAdmin) return true;
  return viewerMembership?.status === "active";
}

function viewerCanManageAnnouncements(
  community: { owner_user_id: string },
  userId: string | null,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  return !!userId && community.owner_user_id === userId;
}

/** GET /communities/:id/announcements, ordered pinned-first then newest-first.
 *  Returns the same set of fields the detail UI needs: title, sanitized HTML
 *  body, author handle/display, pin/timestamp metadata, and the viewer's
 *  permission to manage. Logged-out viewers on a public community see the
 *  same list minus management affordances. */
app.get("/communities/:id/announcements", async (c) => {
  const sql = getSql(c.env);
  const communityId = c.req.param("id");
  const { userId, isSuperAdmin, community, viewerMembership } =
    await resolveAnnouncementContext(sql, c, communityId);
  if (!community) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!viewerCanReadAnnouncements(community, viewerMembership, isSuperAdmin)) {
    return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  try {
    const rows = (await sql`
      SELECT a.id, a.title, a.body, a.is_pinned, a.created_at, a.updated_at,
             a.author_user_id, u.name AS author_name, u.username AS author_username,
             u.avatar_key AS author_avatar_key, u.avatar_updated_at AS author_avatar_updated_at
      FROM newchums.community_announcements a
      JOIN newchums.users u ON u.id = a.author_user_id
      WHERE a.community_id = ${communityId} AND a.deleted_at IS NULL
      ORDER BY a.is_pinned DESC, a.created_at DESC
    `) as Array<{
      id: string; title: string; body: string; is_pinned: boolean;
      created_at: string; updated_at: string;
      author_user_id: string; author_name: string | null; author_username: string | null;
      author_avatar_key: string | null; author_avatar_updated_at: string | Date | null;
    }>;

    const announcements = rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      isPinned: r.is_pinned,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      authorUserId: r.author_user_id,
      // Match the same handle/name precedence used elsewhere on plan / community
      // payloads: prefer `@username`, fall back to display name.
      authorName: (() => {
        const u = r.author_username?.replace(/^@/, "");
        return u ? `@${u}` : (r.author_name?.trim() || "Someone");
      })(),
      // Same `buildAvatarUrl` helper used by community members / event hosts;
      // returns a versioned `/users/:id/avatar?v=<ts>` URL that survives
      // CDN caching when the user changes their avatar, or null when no
      // avatar is set so the client falls back to a name initial.
      authorAvatarUrl: buildAvatarUrl(
        r.author_user_id,
        r.author_avatar_key,
        r.author_avatar_updated_at,
        c.env.MEDIA_BUCKET,
      ),
    }));

    return c.json({
      ok: true,
      announcements,
      viewerCanManage: viewerCanManageAnnouncements(community, userId, isSuperAdmin),
    });
  } catch (err) {
    console.error("[GET /communities/:id/announcements]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /communities/:id/announcements, owner / super admin only.
 *  Body: `{ title, body, is_pinned? }`. Title required, body sanitized via
 *  the shared `sanitizeDescriptionHtml` helper so the same allow-list as
 *  community / plan descriptions applies. */
app.post("/communities/:id/announcements", async (c) => {
  const sql = getSql(c.env);
  const communityId = c.req.param("id");
  const { userId, isSuperAdmin, community } =
    await resolveAnnouncementContext(sql, c, communityId);
  if (!userId) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!community) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!viewerCanManageAnnouncements(community, userId, isSuperAdmin)) {
    return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
  if (!rawTitle) return c.json({ ok: false, error: "VALIDATION", message: "Title is required", field: "title" }, 400);
  if (rawTitle.length > MAX_ANNOUNCEMENT_TITLE_LEN)
    return c.json({ ok: false, error: "VALIDATION", message: `Title must be ${MAX_ANNOUNCEMENT_TITLE_LEN} characters or less`, field: "title" }, 400);

  const rawBody = typeof body.body === "string" ? body.body.trim() : "";
  if (!rawBody) return c.json({ ok: false, error: "VALIDATION", message: "Message is required", field: "body" }, 400);
  const sanitizedBody = sanitizeDescriptionHtml(rawBody.slice(0, MAX_ANNOUNCEMENT_BODY_LEN));
  if (!sanitizedBody) return c.json({ ok: false, error: "VALIDATION", message: "Message is required", field: "body" }, 400);

  const isPinned = body.is_pinned === true;
  const notifyMembers = body.notify_members === true;

  try {
    const inserted = (await sql`
      INSERT INTO newchums.community_announcements
        (community_id, author_user_id, title, body, is_pinned)
      VALUES (${communityId}, ${userId}, ${rawTitle}, ${sanitizedBody}, ${isPinned})
      RETURNING id, created_at, updated_at
    `) as { id: string; created_at: string; updated_at: string }[];

    let eligibleRecipientCount = 0;
    if (notifyMembers) {
      // Resolve the community's slug + name once so the email batch and
      // the deeplinks (mute / settings) use the same canonical
      // identifiers. The community row from `resolveAnnouncementContext`
      // doesn't carry these, so a second small lookup is cheaper than
      // expanding that helper just for the email path.
      try {
        const communityRows = (await sql`
          SELECT slug, name FROM newchums.communities WHERE id = ${communityId} LIMIT 1
        `) as { slug: string; name: string }[];
        const communityRow = communityRows[0];
        if (communityRow) {
          // Eligible members: active membership, not suspended, not the
          // author. The global `community_announcements` notification
          // preference (default ON) supersedes the per-community mute row
          // at send time, but we don't read the global pref off the
          // membership row, normalize it through the same helper used
          // everywhere else so the default-true semantics stay consistent
          // for users with missing keys. The per-community mute is a
          // simple LEFT JOIN: presence == muted.
          const recipients = (await sql`
            SELECT u.id, u.email, u.name, u.username,
                   p.notification_prefs,
                   m.user_id IS NOT NULL AS muted
            FROM newchums.community_members cm
            JOIN newchums.users u ON u.id = cm.user_id
            LEFT JOIN newchums.user_profile p ON p.user_id = cm.user_id
            LEFT JOIN newchums.community_announcement_mutes m
              ON m.user_id = cm.user_id AND m.community_id = cm.community_id
            WHERE cm.community_id = ${communityId}
              AND cm.status = 'active'
              AND cm.user_id <> ${userId}
              AND COALESCE(u.is_suspended, false) = false
          `) as {
            id: string; email: string; name: string | null; username: string | null;
            notification_prefs: unknown; muted: boolean;
          }[];

          const settingsUrl = `${c.env.WEB_BASE_URL}/settings#notifications`;
          // The `announcement=<id>` query param does double duty: it
          // tells the community detail client which post to highlight /
          // scroll to, AND `(app)/layout.tsx` treats its presence as an
          // auth gate so a logged-out recipient is bounced through
          // /login?next=... before any HTML renders. Bare ?tab=announcements
          // is still publicly viewable; the auth requirement is opt-in
          // via this email-only param so normal browsing of public
          // community announcements stays unauthenticated.
          const announcementId = inserted[0].id;
          const communityUrl = `${c.env.WEB_BASE_URL}/communities/${communityRow.slug}?tab=announcements&announcement=${encodeURIComponent(announcementId)}`;
          const communityMuteUrl = `${c.env.WEB_BASE_URL}/communities/${communityRow.slug}?mute=announcements`;
          const communityName = communityRow.name;
          const announcementBodyHtml = sanitizedBody;
          const announcementBodyText = htmlToPlainText(sanitizedBody);

          const eligible = recipients.filter((r) => {
            if (r.muted) return false;
            const prefs = normalizeNotificationPrefs(r.notification_prefs);
            return prefs.items.community_announcements?.enabled !== false;
          });
          eligibleRecipientCount = eligible.length;

          const sendBatch = async () => {
            for (const r of eligible) {
              try {
                const recipientName = r.name?.trim() || r.username?.replace(/^@/, "") || "there";
                let unsubscribeUrl: string | undefined;
                if (c.env.NEXTAUTH_SECRET) {
                  try {
                    const token = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, r.id, "community_announcements");
                    unsubscribeUrl = `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
                  } catch { /* unsubscribe link is optional */ }
                }
                await sendCommunityAnnouncementEmail(c.env, {
                  to: r.email,
                  recipientName,
                  communityName,
                  communityUrl,
                  announcementTitle: rawTitle,
                  announcementBodyHtml,
                  announcementBodyText,
                  communityMuteUrl,
                  settingsUrl,
                  unsubscribeUrl,
                });
              } catch (sendErr) {
                console.error("[POST /communities/:id/announcements] email send", sendErr);
              }
            }
          };

          // Run the batch in the background so the create response stays
          // snappy even on communities with many members. Per-recipient
          // failures inside `sendBatch` are already swallowed; the outer
          // catch here only guards against a thrown promise from the
          // wrapper itself.
          c.executionCtx.waitUntil(sendBatch().catch(() => { /* noop */ }));
        }
      } catch (notifyErr) {
        console.error("[POST /communities/:id/announcements] notify setup", notifyErr);
      }
    }

    return c.json({
      ok: true,
      announcement: {
        id: inserted[0].id,
        createdAt: inserted[0].created_at,
        updatedAt: inserted[0].updated_at,
      },
      // `notified: true` means the email batch was queued.
      // `notifyQueuedCount` is the eligible-recipient count computed
      // synchronously before the batch is handed to `waitUntil`, so the
      // toast copy can read "Posted (Emailing N members)". The actual
      // Resend calls run in the background; per-recipient send
      // failures are swallowed so they don't undo the create.
      notified: notifyMembers,
      notifyQueuedCount: notifyMembers ? eligibleRecipientCount : 0,
    });
  } catch (err) {
    console.error("[POST /communities/:id/announcements]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PATCH /communities/:id/announcements/:announcementId.
 *  Accepts partial updates: `title`, `body`, `is_pinned`. Same management
 *  permissions as create. Pin/unpin lives on this endpoint rather than its
 *  own POST so the host can pin while editing in a single request. */
app.patch("/communities/:id/announcements/:announcementId", async (c) => {
  const sql = getSql(c.env);
  const communityId = c.req.param("id");
  const announcementId = c.req.param("announcementId");
  const { userId, isSuperAdmin, community } =
    await resolveAnnouncementContext(sql, c, communityId);
  if (!userId) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!community) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!viewerCanManageAnnouncements(community, userId, isSuperAdmin)) {
    return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  const existing = (await sql`
    SELECT id FROM newchums.community_announcements
    WHERE id = ${announcementId} AND community_id = ${communityId} AND deleted_at IS NULL
    LIMIT 1
  `) as { id: string }[];
  if (existing.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const titleProvided = "title" in body;
  let nextTitle: string | null = null;
  if (titleProvided) {
    const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
    if (!rawTitle) return c.json({ ok: false, error: "VALIDATION", message: "Title is required", field: "title" }, 400);
    if (rawTitle.length > MAX_ANNOUNCEMENT_TITLE_LEN)
      return c.json({ ok: false, error: "VALIDATION", message: `Title must be ${MAX_ANNOUNCEMENT_TITLE_LEN} characters or less`, field: "title" }, 400);
    nextTitle = rawTitle;
  }

  const bodyProvided = "body" in body;
  let nextBody: string | null = null;
  if (bodyProvided) {
    const rawBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!rawBody) return c.json({ ok: false, error: "VALIDATION", message: "Message is required", field: "body" }, 400);
    const sanitized = sanitizeDescriptionHtml(rawBody.slice(0, MAX_ANNOUNCEMENT_BODY_LEN));
    if (!sanitized) return c.json({ ok: false, error: "VALIDATION", message: "Message is required", field: "body" }, 400);
    nextBody = sanitized;
  }

  const pinProvided = "is_pinned" in body;
  const nextPin = pinProvided ? body.is_pinned === true : null;

  try {
    await sql`
      UPDATE newchums.community_announcements
      SET title      = COALESCE(${titleProvided ? nextTitle : null}, title),
          body       = COALESCE(${bodyProvided ? nextBody : null}, body),
          is_pinned  = CASE WHEN ${pinProvided} THEN ${nextPin} ELSE is_pinned END,
          updated_at = NOW()
      WHERE id = ${announcementId} AND community_id = ${communityId}
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /communities/:id/announcements/:announcementId]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** DELETE /communities/:id/announcements/:announcementId. Soft delete by
 *  stamping `deleted_at`, preserving an audit trail and letting us recover
 *  accidentally removed posts on request. */
app.delete("/communities/:id/announcements/:announcementId", async (c) => {
  const sql = getSql(c.env);
  const communityId = c.req.param("id");
  const announcementId = c.req.param("announcementId");
  const { userId, isSuperAdmin, community } =
    await resolveAnnouncementContext(sql, c, communityId);
  if (!userId) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!community) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!viewerCanManageAnnouncements(community, userId, isSuperAdmin)) {
    return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  }
  try {
    await sql`
      UPDATE newchums.community_announcements
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${announcementId} AND community_id = ${communityId} AND deleted_at IS NULL
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /communities/:id/announcements/:announcementId]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PUT /communities/:id/announcement-mute. Auth required.
 *  Body: `{ muted: boolean }`. Toggles the per-community mute marker for
 *  the calling user. The global `community_announcements` notification
 *  preference still supersedes this at send time, but a global toggle
 *  on/off does NOT touch this row, so the per-community choice survives
 *  a global flip. Idempotent: re-muting an already-muted community is a
 *  noop, same for unmute. */
app.put("/communities/:id/announcement-mute", async (c) => {
  const sql = getSql(c.env);
  const communityId = c.req.param("id");
  const { userId, isSuperAdmin, community, viewerMembership } =
    await resolveAnnouncementContext(sql, c, communityId);
  if (!userId) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!community) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  // The mute pref is a member-level preference. Non-members and
  // logged-out viewers don't need a row; super admins are allowed
  // through so they can self-test the flow on private communities.
  if (!isSuperAdmin && viewerMembership?.status !== "active") {
    return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }
  const muted = body.muted === true;

  try {
    if (muted) {
      await sql`
        INSERT INTO newchums.community_announcement_mutes (user_id, community_id)
        VALUES (${userId}, ${communityId})
        ON CONFLICT (user_id, community_id) DO NOTHING
      `;
    } else {
      await sql`
        DELETE FROM newchums.community_announcement_mutes
        WHERE user_id = ${userId} AND community_id = ${communityId}
      `;
    }
    return c.json({ ok: true, muted });
  } catch (err) {
    console.error("[PUT /communities/:id/announcement-mute]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /communities/:id/announcements/seen. Auth required; logged-out
 *  viewers don't track seen state. Upserts the viewer's `last_seen_at` to
 *  now, which the tab indicator compares against the latest non-deleted
 *  announcement's `created_at`. */
app.post("/communities/:id/announcements/seen", async (c) => {
  const sql = getSql(c.env);
  const communityId = c.req.param("id");
  const { userId, isSuperAdmin, community, viewerMembership } =
    await resolveAnnouncementContext(sql, c, communityId);
  if (!userId) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!community) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!viewerCanReadAnnouncements(community, viewerMembership, isSuperAdmin)) {
    return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  }
  try {
    await sql`
      INSERT INTO newchums.community_announcement_seen (user_id, community_id, last_seen_at)
      VALUES (${userId}, ${communityId}, NOW())
      ON CONFLICT (user_id, community_id) DO UPDATE
        SET last_seen_at = EXCLUDED.last_seen_at
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /communities/:id/announcements/seen]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Community schedule (v1) ────────────────────────────────────────────────
//
// Recurring weekly time blocks shown on a community's Schedule tab.
// Visibility follows the existing community-page rules (delegated to
// `resolveAnnouncementContext` + `viewerCanReadAnnouncements`):
//   - public communities: anyone can read (logged out included)
//   - private communities: active member or super admin
// Management (create / edit / delete) is restricted to community owner
// + super admin, same as announcements. v1 only ever stores
// `entry_type = 'weekly_recurring'`; the column is exposed in responses
// so future one-off variants don't need a payload change.

const MAX_SCHEDULE_TITLE_LEN = 120;
const MAX_SCHEDULE_DESCRIPTION_LEN = 2000;

type ScheduleBlockRow = {
  id: string;
  entry_type: string;
  day_of_week: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
  title: string;
  description: string | null;
  banner_key: string | null;
  is_active: boolean;
  sort_order: number;
  location_name: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  created_at: string;
  updated_at: string;
};

function shapeScheduleBlock(r: ScheduleBlockRow) {
  return {
    id: r.id,
    entryType: r.entry_type,
    dayOfWeek: r.day_of_week,
    specificDate: r.specific_date,
    // TIME columns serialize as "HH:MM:SS"; the client only needs HH:MM
    // for display + comparison, but we leave the wire shape intact and
    // let the client trim. Future date-time pickers can reuse the full
    // string without a backend change.
    startTime: r.start_time,
    endTime: r.end_time,
    title: r.title,
    description: r.description,
    bannerKey: r.banner_key,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    locationName: r.location_name,
    locationAddress: r.location_address,
    locationLat: r.location_lat,
    locationLng: r.location_lng,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Validate a HH:MM[:SS] string and normalize to "HH:MM:00" so PG's TIME
 *  comparator behaves predictably. Rejects 24:00 / negative / non-numeric
 *  values up front so the CHECK constraint is the second line of defense,
 *  not the first. */
function parseTimeOfDay(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] != null ? Number(m[3]) : 0;
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
  if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null;
  if (!Number.isFinite(ss) || ss < 0 || ss > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** GET /communities/:id/schedule-blocks. Same access matrix as
 *  announcements; non-deleted rows ordered by day, then within-day
 *  sort_order, then start_time. Manager flag is included so the
 *  Schedule tab can decide whether to render edit affordances without
 *  a second round trip. */
app.get("/communities/:id/schedule-blocks", async (c) => {
  const sql = getSql(c.env);
  const communityId = c.req.param("id");
  const { userId, isSuperAdmin, community, viewerMembership } =
    await resolveAnnouncementContext(sql, c, communityId);
  if (!community) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!viewerCanReadAnnouncements(community, viewerMembership, isSuperAdmin)) {
    return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  try {
    const rows = (await sql`
      SELECT id, entry_type, day_of_week, specific_date,
             start_time::text AS start_time,
             end_time::text   AS end_time,
             title, description, banner_key, is_active, sort_order,
             location_name, location_address, location_lat, location_lng,
             created_at, updated_at
      FROM newchums.community_schedule_blocks
      WHERE community_id = ${communityId} AND deleted_at IS NULL
      ORDER BY day_of_week ASC NULLS LAST, sort_order ASC, start_time ASC, created_at ASC
    `) as ScheduleBlockRow[];

    const viewerCanManage = viewerCanManageAnnouncements(community, userId, isSuperAdmin);
    // Non-managers only see active blocks. Managers see drafts too so
    // they can finish a partially-filled entry without needing a
    // separate admin surface.
    const visible = viewerCanManage ? rows : rows.filter((r) => r.is_active);
    return c.json({
      ok: true,
      blocks: visible.map(shapeScheduleBlock),
      viewerCanManage,
    });
  } catch (err) {
    console.error("[GET /communities/:id/schedule-blocks]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /communities/:id/schedule-blocks. Owner / super admin only.
 *  Body: `{ title, description?, day_of_week, start_time, end_time,
 *           sort_order?, is_active? }`. v1 always writes
 *  `entry_type = 'weekly_recurring'`; the column is reserved for a
 *  future one-off variant and accepting it here would let a client
 *  bypass the v1 invariant.
 */
app.post("/communities/:id/schedule-blocks", async (c) => {
  const sql = getSql(c.env);
  const communityId = c.req.param("id");
  const { userId, isSuperAdmin, community } =
    await resolveAnnouncementContext(sql, c, communityId);
  if (!userId) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!community) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!viewerCanManageAnnouncements(community, userId, isSuperAdmin)) {
    return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
  if (!rawTitle) return c.json({ ok: false, error: "VALIDATION", message: "Title is required", field: "title" }, 400);
  if (rawTitle.length > MAX_SCHEDULE_TITLE_LEN)
    return c.json({ ok: false, error: "VALIDATION", message: `Title must be ${MAX_SCHEDULE_TITLE_LEN} characters or less`, field: "title" }, 400);
  const titleSafe = validateCleanText(rawTitle, "title");
  if (!titleSafe.ok) return c.json({ ok: false, error: "INAPPROPRIATE_TEXT", field: "title" }, 400);

  const rawDescription = typeof body.description === "string" ? body.description.trim() : "";
  if (rawDescription.length > MAX_SCHEDULE_DESCRIPTION_LEN)
    return c.json({ ok: false, error: "VALIDATION", message: `Description must be ${MAX_SCHEDULE_DESCRIPTION_LEN} characters or less`, field: "description" }, 400);
  // Description is rich-text HTML produced by the shared RichTextEditor.
  // Run it through the same sanitizer as community / plan / announcement
  // descriptions so the allow-list is uniform across surfaces, then
  // store the cleaned HTML. An empty editor sends "" and stores NULL.
  const sanitizedDescription = rawDescription.length > 0 ? sanitizeDescriptionHtml(rawDescription) : "";
  const description = sanitizedDescription.length > 0 ? sanitizedDescription : null;

  const dowRaw = body.day_of_week;
  const dayOfWeek = typeof dowRaw === "number" && Number.isFinite(dowRaw) ? Math.floor(dowRaw) : NaN;
  if (!Number.isFinite(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)
    return c.json({ ok: false, error: "VALIDATION", message: "Day of week must be 0–6", field: "day_of_week" }, 400);

  const startTime = parseTimeOfDay(body.start_time);
  if (!startTime) return c.json({ ok: false, error: "VALIDATION", message: "Start time is required (HH:MM)", field: "start_time" }, 400);
  const endTime = parseTimeOfDay(body.end_time);
  if (!endTime) return c.json({ ok: false, error: "VALIDATION", message: "End time is required (HH:MM)", field: "end_time" }, 400);
  if (endTime <= startTime) {
    // v1 deliberately rejects overnight / end-before-start windows. The
    // CHECK constraint enforces the same invariant; this just surfaces a
    // user-friendly message before the round trip to PG.
    return c.json({ ok: false, error: "VALIDATION", message: "End time must be after start time", field: "end_time" }, 400);
  }

  const sortOrderRaw = body.sort_order;
  const sortOrder = typeof sortOrderRaw === "number" && Number.isFinite(sortOrderRaw) ? Math.floor(sortOrderRaw) : 0;
  const isActive = body.is_active !== false;

  // Location fields, all optional. Mirror the `communities` schema:
  // name + address are free-form text (clipped to 200/500 to match
  // community columns), lat/lng are numeric. We store whatever the
  // client picked from PlacesAutocompleteInput as-is, since the same
  // component is the source of truth for both surfaces and the values
  // are already verified by Google.
  const locationName = typeof body.location_name === "string"
    ? body.location_name.trim().slice(0, 200) || null
    : null;
  const locationAddress = typeof body.location_address === "string"
    ? body.location_address.trim().slice(0, 500) || null
    : null;
  const locationLat = typeof body.location_lat === "number" && Number.isFinite(body.location_lat)
    ? Number(body.location_lat) : null;
  const locationLng = typeof body.location_lng === "number" && Number.isFinite(body.location_lng)
    ? Number(body.location_lng) : null;

  try {
    const inserted = (await sql`
      INSERT INTO newchums.community_schedule_blocks
        (community_id, entry_type, day_of_week, start_time, end_time,
         title, description, sort_order, is_active, created_by_user_id,
         location_name, location_address, location_lat, location_lng)
      VALUES (${communityId}, 'weekly_recurring', ${dayOfWeek},
              ${startTime}::time, ${endTime}::time,
              ${rawTitle}, ${description}, ${sortOrder}, ${isActive}, ${userId},
              ${locationName}, ${locationAddress}, ${locationLat}, ${locationLng})
      RETURNING id, entry_type, day_of_week, specific_date,
                start_time::text AS start_time,
                end_time::text   AS end_time,
                title, description, banner_key, is_active, sort_order,
                location_name, location_address, location_lat, location_lng,
                created_at, updated_at
    `) as ScheduleBlockRow[];
    return c.json({ ok: true, block: shapeScheduleBlock(inserted[0]) });
  } catch (err) {
    console.error("[POST /communities/:id/schedule-blocks]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PATCH /communities/:id/schedule-blocks/:blockId. Partial update of
 *  `title`, `description`, `day_of_week`, `start_time`, `end_time`,
 *  `is_active`, `sort_order`. Owner / super admin only. */
app.patch("/communities/:id/schedule-blocks/:blockId", async (c) => {
  const sql = getSql(c.env);
  const communityId = c.req.param("id");
  const blockId = c.req.param("blockId");
  const { userId, isSuperAdmin, community } =
    await resolveAnnouncementContext(sql, c, communityId);
  if (!userId) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!community) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!viewerCanManageAnnouncements(community, userId, isSuperAdmin)) {
    return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  const existing = (await sql`
    SELECT id, day_of_week,
           start_time::text AS start_time,
           end_time::text   AS end_time
    FROM newchums.community_schedule_blocks
    WHERE id = ${blockId} AND community_id = ${communityId} AND deleted_at IS NULL
    LIMIT 1
  `) as { id: string; day_of_week: number | null; start_time: string; end_time: string }[];
  if (existing.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }

  let nextTitle: string | null = null;
  if ("title" in body) {
    const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
    if (!rawTitle) return c.json({ ok: false, error: "VALIDATION", message: "Title is required", field: "title" }, 400);
    if (rawTitle.length > MAX_SCHEDULE_TITLE_LEN)
      return c.json({ ok: false, error: "VALIDATION", message: `Title must be ${MAX_SCHEDULE_TITLE_LEN} characters or less`, field: "title" }, 400);
    const titleSafe = validateCleanText(rawTitle, "title");
    if (!titleSafe.ok) return c.json({ ok: false, error: "INAPPROPRIATE_TEXT", field: "title" }, 400);
    nextTitle = rawTitle;
  }

  let nextDescription: string | null = null;
  let descriptionProvided = false;
  if ("description" in body) {
    descriptionProvided = true;
    if (body.description === null) {
      nextDescription = null;
    } else {
      const raw = typeof body.description === "string" ? body.description.trim() : "";
      if (raw.length > MAX_SCHEDULE_DESCRIPTION_LEN)
        return c.json({ ok: false, error: "VALIDATION", message: `Description must be ${MAX_SCHEDULE_DESCRIPTION_LEN} characters or less`, field: "description" }, 400);
      // Sanitize on the way in so PATCH stores the same shape as POST.
      const sanitized = raw.length > 0 ? sanitizeDescriptionHtml(raw) : "";
      nextDescription = sanitized.length > 0 ? sanitized : null;
    }
  }

  let nextDayOfWeek: number | null = null;
  let dayOfWeekProvided = false;
  if ("day_of_week" in body) {
    dayOfWeekProvided = true;
    const dow = typeof body.day_of_week === "number" && Number.isFinite(body.day_of_week)
      ? Math.floor(body.day_of_week as number)
      : NaN;
    if (!Number.isFinite(dow) || dow < 0 || dow > 6)
      return c.json({ ok: false, error: "VALIDATION", message: "Day of week must be 0–6", field: "day_of_week" }, 400);
    nextDayOfWeek = dow;
  }

  let nextStartTime: string | null = null;
  if ("start_time" in body) {
    const t = parseTimeOfDay(body.start_time);
    if (!t) return c.json({ ok: false, error: "VALIDATION", message: "Start time must be HH:MM", field: "start_time" }, 400);
    nextStartTime = t;
  }
  let nextEndTime: string | null = null;
  if ("end_time" in body) {
    const t = parseTimeOfDay(body.end_time);
    if (!t) return c.json({ ok: false, error: "VALIDATION", message: "End time must be HH:MM", field: "end_time" }, 400);
    nextEndTime = t;
  }

  // Cross-field validation: the merged window must satisfy end > start.
  // If only one side of the window is in the patch, fall back to the
  // current row value so partial updates still get checked.
  const finalStart = nextStartTime ?? existing[0].start_time;
  const finalEnd = nextEndTime ?? existing[0].end_time;
  if (finalEnd <= finalStart) {
    return c.json({ ok: false, error: "VALIDATION", message: "End time must be after start time", field: "end_time" }, 400);
  }

  let nextIsActive: boolean | null = null;
  if ("is_active" in body) nextIsActive = body.is_active !== false;
  let nextSortOrder: number | null = null;
  if ("sort_order" in body) {
    const n = typeof body.sort_order === "number" && Number.isFinite(body.sort_order)
      ? Math.floor(body.sort_order as number)
      : 0;
    nextSortOrder = n;
  }
  // banner_key only accepts explicit-clear (null) via PATCH. Setting a
  // key goes through `/media/finalize` so the upload, ownership, and R2
  // existence checks happen there, bypassing them via a raw PATCH is
  // not allowed (mirrors the community-banner PATCH rule).
  let bannerClearProvided = false;
  if ("banner_key" in body) {
    if (body.banner_key !== null) {
      return c.json({ ok: false, error: "VALIDATION", message: "Set a banner via /media/finalize; PATCH only accepts null to clear it.", field: "banner_key" }, 400);
    }
    bannerClearProvided = true;
  }

  // Location: nullable, mirrors the `communities` PATCH semantics.
  // Each field is independently patched. Sending `null` (or omitting
  // the field by sending an empty string) clears that slot. Sending
  // `undefined` (key absent from body) leaves the existing value
  // alone. Lat/lng are numbers or null; non-numeric input is treated
  // as null so the column never holds garbage.
  let nextLocationName: string | null = null;
  let locationNameProvided = false;
  if ("location_name" in body) {
    locationNameProvided = true;
    nextLocationName = typeof body.location_name === "string"
      ? body.location_name.trim().slice(0, 200) || null
      : null;
  }
  let nextLocationAddress: string | null = null;
  let locationAddressProvided = false;
  if ("location_address" in body) {
    locationAddressProvided = true;
    nextLocationAddress = typeof body.location_address === "string"
      ? body.location_address.trim().slice(0, 500) || null
      : null;
  }
  let nextLocationLat: number | null = null;
  let locationLatProvided = false;
  if ("location_lat" in body) {
    locationLatProvided = true;
    nextLocationLat = typeof body.location_lat === "number" && Number.isFinite(body.location_lat)
      ? Number(body.location_lat) : null;
  }
  let nextLocationLng: number | null = null;
  let locationLngProvided = false;
  if ("location_lng" in body) {
    locationLngProvided = true;
    nextLocationLng = typeof body.location_lng === "number" && Number.isFinite(body.location_lng)
      ? Number(body.location_lng) : null;
  }

  try {
    const isActiveProvided = nextIsActive !== null;
    const isActiveValue = nextIsActive === true;
    await sql`
      UPDATE newchums.community_schedule_blocks
      SET title            = COALESCE(${nextTitle}, title),
          description      = CASE WHEN ${descriptionProvided} THEN ${nextDescription} ELSE description END,
          day_of_week      = CASE WHEN ${dayOfWeekProvided} THEN ${nextDayOfWeek} ELSE day_of_week END,
          start_time       = COALESCE(${nextStartTime}::time, start_time),
          end_time         = COALESCE(${nextEndTime}::time, end_time),
          is_active        = CASE WHEN ${isActiveProvided} THEN ${isActiveValue} ELSE is_active END,
          sort_order       = COALESCE(${nextSortOrder}, sort_order),
          banner_key       = CASE WHEN ${bannerClearProvided} THEN NULL ELSE banner_key END,
          location_name    = CASE WHEN ${locationNameProvided} THEN ${nextLocationName} ELSE location_name END,
          location_address = CASE WHEN ${locationAddressProvided} THEN ${nextLocationAddress} ELSE location_address END,
          location_lat     = CASE WHEN ${locationLatProvided} THEN ${nextLocationLat} ELSE location_lat END,
          location_lng     = CASE WHEN ${locationLngProvided} THEN ${nextLocationLng} ELSE location_lng END,
          updated_at       = NOW()
      WHERE id = ${blockId} AND community_id = ${communityId}
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /communities/:id/schedule-blocks/:blockId]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** DELETE /communities/:id/schedule-blocks/:blockId. Soft delete via
 *  `deleted_at`, mirroring the announcements convention so a hasty
 *  delete can be recovered manually if a host asks. */
app.delete("/communities/:id/schedule-blocks/:blockId", async (c) => {
  const sql = getSql(c.env);
  const communityId = c.req.param("id");
  const blockId = c.req.param("blockId");
  const { userId, isSuperAdmin, community } =
    await resolveAnnouncementContext(sql, c, communityId);
  if (!userId) return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!community) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  if (!viewerCanManageAnnouncements(community, userId, isSuperAdmin)) {
    return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  }
  try {
    await sql`
      UPDATE newchums.community_schedule_blocks
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${blockId} AND community_id = ${communityId} AND deleted_at IS NULL
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /communities/:id/schedule-blocks/:blockId]", err);
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
        (SELECT COUNT(*)::int FROM newchums.event_communities ec WHERE ec.community_id = c.id) AS plan_count
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

/**
 * POST /admin/communities/:id/change-owner, super admin reassigns ownership.
 *
 * Ownership is stored in two places for historical reasons:
 *   - `communities.owner_user_id` (authoritative FK)
 *   - `community_members` row with `role = 'owner', status = 'active'`
 *
 * This endpoint keeps both in sync. The old owner stays in the community as
 * a regular active member (role demoted to 'member'); the new owner is
 * reactivated if previously removed, upserted if not already a member, and
 * has any pending/declined join requests for this community cleared so a
 * stale request row can't confuse future lifecycle logic. No-ops when the
 * target user is already the owner.
 *
 * Community Pro status follows the new owner's subscription plan. If the
 * incoming owner is not on Community Pro, any existing banner stays visible
 * (banner_key is untouched) but can no longer be edited or replaced until
 * someone with Pro is the owner again; the Pro gate lives at the media
 * finalize path, not here.
 */
app.post("/admin/communities/:id/change-owner", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const communityId = c.req.param("id");
  const sql = getSql(c.env);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "INVALID_JSON" }, 400); }
  const newOwnerId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!newOwnerId) return c.json({ ok: false, error: "VALIDATION", message: "userId is required", field: "userId" }, 400);

  try {
    const communityRows = (await sql`
      SELECT id, owner_user_id, name FROM newchums.communities WHERE id = ${communityId} LIMIT 1
    `) as { id: string; owner_user_id: string; name: string }[];
    if (!communityRows[0]) return c.json({ ok: false, error: "NOT_FOUND", message: "Community not found" }, 404);
    const community = communityRows[0];

    if (community.owner_user_id === newOwnerId) {
      return c.json({ ok: true, status: "no_change" });
    }

    // Verify the incoming owner exists and is not suspended. A suspended
    // account shouldn't be promoted to owner; super admin can unsuspend
    // first if that's the actual intent.
    const userRows = (await sql`
      SELECT id, COALESCE(is_suspended, false) AS is_suspended
      FROM newchums.users WHERE id = ${newOwnerId} LIMIT 1
    `) as { id: string; is_suspended: boolean }[];
    if (!userRows[0]) return c.json({ ok: false, error: "USER_NOT_FOUND", message: "New owner user not found" }, 404);
    if (userRows[0].is_suspended) {
      return c.json({ ok: false, error: "USER_SUSPENDED", message: "Cannot assign ownership to a suspended user" }, 400);
    }

    const oldOwnerId = community.owner_user_id;

    // 1. Flip the authoritative FK first so any concurrent read sees the
    //    new owner even if the membership updates below fail midway.
    await sql`UPDATE newchums.communities SET owner_user_id = ${newOwnerId}, updated_at = now() WHERE id = ${communityId}`;

    // 2. Demote the old owner's membership row to 'member'. Row is always
    //    present in practice (POST /communities inserts one on create);
    //    if it somehow isn't, the UPDATE is a no-op and the old owner is
    //    simply not a member anymore, which matches the "owner left the
    //    community behind" edge case.
    await sql`
      UPDATE newchums.community_members
      SET role = 'member'
      WHERE community_id = ${communityId} AND user_id = ${oldOwnerId}
    `;

    // 3. Upsert the new owner's membership row. If they had a 'removed'
    //    row, reactivate it; if they're already an active member, promote
    //    them; otherwise insert fresh. Super admin overriding a removal
    //    is intentional, the alternative (requiring unblock first) adds
    //    friction without adding real safety.
    const existingMember = (await sql`
      SELECT id, status FROM newchums.community_members
      WHERE community_id = ${communityId} AND user_id = ${newOwnerId}
      LIMIT 1
    `) as { id: string; status: string }[];
    if (existingMember[0]) {
      await sql`
        UPDATE newchums.community_members
        SET role = 'owner', status = 'active', removed_at = NULL, removal_reason = NULL
        WHERE id = ${existingMember[0].id}
      `;
    } else {
      await sql`
        INSERT INTO newchums.community_members (community_id, user_id, role, status)
        VALUES (${communityId}, ${newOwnerId}, 'owner', 'active')
      `;
    }

    // 4. Withdraw any pending join request the new owner had for this
    //    community, they're now the owner, the request is moot. Declined
    //    rows stay in place for auditing, they don't block anything once
    //    the user is a full owner.
    await sql`
      UPDATE newchums.community_join_requests
      SET status = 'withdrawn', reviewed_at = now()
      WHERE community_id = ${communityId} AND user_id = ${newOwnerId} AND status = 'pending'
    `;

    return c.json({ ok: true, status: "changed", oldOwnerId, newOwnerId });
  } catch (err) {
    console.error("[POST /admin/communities/:id/change-owner]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

// ─── Events ─────────────────────────────────────────────────────────────────

const VALID_VISIBILITY = ["invite_only", "chums_only", "public"] as const;
const VALID_LOCATION_TYPE = ["in_person", "online"] as const;
const VALID_LOCATION_VISIBILITY = ["exact_everyone", "exact_joined_only", "approximate_only"] as const;
const VALID_RSVP_STATUS = ["going", "maybe", "cant_make_it"] as const;

/** Build location display without duplicating overlap between name and address.
 *  Falls back to "TBD" when neither field is populated. The dedupe rules live
 *  in joinNameAndAddress so emails and UI formatters share one implementation. */
function buildLocationDisplay(name: string | null, address: string | null): string {
  return joinNameAndAddress(name, address) || "TBD";
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
  // Per-plan host preference: when true, suppress the Going/Maybe/Can't-make-it
  // emails to the host for this plan (including invited users' attendance
  // updates). Defaults off so existing behaviour is unchanged.
  const muteHostAttendanceEmails = body.mute_host_attendance_emails === true;
  const requireApproval = body.require_approval === true;
  const status = body.status === "draft" ? "draft" : "published";
  const timezone = body.timezone && typeof body.timezone === "string" ? body.timezone.trim().slice(0, 64) : "UTC";
  const prefOverrides = parsePrefOverrides(body.pref_overrides ?? null);
  // Community linkage is organizational context only, not an audience
  // expansion. invite_only plans do not participate in community discovery
  // (Explore already excludes them, and GET /communities/:id/events excludes
  // them from the community feed), so we also refuse to store the link at
  // all. The Add/Edit plan forms hide the community controls when
  // invite_only is selected; this server-side guard catches any client that
  // bypasses that UI or any legacy payload.
  const rawCommunityIds = Array.isArray(body.community_ids)
    ? (body.community_ids as unknown[])
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v): v is string => !!v)
    : [];
  // De-duplicate while preserving order; cap at 10 communities per plan to
  // keep response payloads sensible and the membership-check loop bounded.
  const dedupedCommunityIds = Array.from(new Set(rawCommunityIds)).slice(0, 10);
  const communityIds: string[] = visibility === "invite_only" ? [] : dedupedCommunityIds;
  // hide_from_explore is only meaningful when at least one community is
  // linked; clear it when no communities are linked (keeps the DB row
  // consistent).
  const hideFromExplore = communityIds.length > 0 && body.hide_from_explore === true;

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

  // Optional RSVP-based minimum, independent of the 24-hour attendance check.
  // If fewer than this many people are "going" 2 hours before start, the
  // cron auto-cancels the plan. Host counts toward the threshold (host is
  // auto-RSVP'd as "going" on creation; same counting definition as
  // goingCount everywhere else).
  let minAttendeesRequired: number | null = null;
  if (body.min_attendees_required != null && body.min_attendees_required !== "") {
    const raw = Number(body.min_attendees_required);
    if (!Number.isFinite(raw) || raw < 1)
      return c.json({ ok: false, error: "VALIDATION", message: "Minimum attendees required must be at least 1", field: "min_attendees_required" }, 400);
    const floored = Math.floor(raw);
    if (maxSeats != null && floored > maxSeats)
      return c.json({ ok: false, error: "VALIDATION", message: "Minimum attendees required cannot be greater than the seat count", field: "min_attendees_required" }, 400);
    minAttendeesRequired = Math.min(500, floored);
  }

  const locationName = body.location_name ? String(body.location_name).trim().slice(0, 200) : null;
  const locationAddress = body.location_address ? String(body.location_address).trim().slice(0, 500) : null;
  const locationPlaceId = body.location_place_id ? String(body.location_place_id) : null;
  const locationLat = body.location_lat != null && Number.isFinite(Number(body.location_lat)) ? Number(body.location_lat) : null;
  const locationLng = body.location_lng != null && Number.isFinite(Number(body.location_lng)) ? Number(body.location_lng) : null;

  // In-person plans need real coordinates so the Explore / digest distance
  // filters can place them. Freeform typed text with no Google Places pick
  // would otherwise store null lat/lng and silently vanish from discovery
  // for everyone with a travel radius. Mirrors the guard on POST
  // /communities.
  if (locationType === "in_person" && (locationLat == null || locationLng == null)) {
    return c.json({ ok: false, error: "VALIDATION", message: "Please pick a location from the suggestions", field: "location" }, 400);
  }

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

  // Validate community_ids if provided. The user must be an active member
  // of every community they're attaching the plan to.
  if (communityIds.length > 0) {
    const cmRows = (await sql`
      SELECT community_id FROM newchums.community_members
      WHERE community_id = ANY(${communityIds}::uuid[])
        AND user_id = ${userId}
        AND status = 'active'
    `) as { community_id: string }[];
    const memberOf = new Set(cmRows.map((r) => r.community_id));
    const missing = communityIds.filter((cid) => !memberOf.has(cid));
    if (missing.length > 0)
      return c.json({ ok: false, error: "VALIDATION", message: "You must be a member of every selected community", field: "community_ids" }, 400);
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
        min_confirmed_attendees, fallback_policy, min_attendees_required, pref_overrides, hide_from_explore, is_qa, mute_host_attendance_emails
      ) VALUES (
        ${userId}, ${title}, ${description}, ${interestId}, ${startsDate.toISOString()},
        ${locationType}, ${locationName}, ${locationAddress}, ${locationPlaceId}, ${locationLat}, ${locationLng},
        ${locationVisibility}, ${locationArea}, ${onlineLink},
        ${maxSeats}, ${visibility}, ${status}, ${allowAltTimes}, ${altTimesMode}, ${availabilityDeadlineAt}, ${allowAttendeeInvites}, ${reserveSeats}, ${requireReconfirmation}, ${requireApproval}, ${timezone},
        ${minConfirmedAttendees}, ${fallbackPolicy}, ${minAttendeesRequired}, ${prefOverrides ? JSON.stringify(prefOverrides) : null}, ${hideFromExplore}, ${isQa}, ${muteHostAttendanceEmails}
      )
      RETURNING id, created_at
    `) as { id: string; created_at: string }[];

    const eventId = rows[0].id;

    // Funnel events: first_plan_created / second_plan_created (host loop).
    // QA plans stay out of product analytics entirely. Runs off the critical
    // path; failures never affect the response.
    if (!isQa) {
      runAfterResponse(c, recordPlanCreationFunnelEvents(sql, { planId: eventId, hostUserId: userId }));
    }

    // Link the new plan to its communities via the junction table.
    if (communityIds.length > 0) {
      try {
        await sql`
          INSERT INTO newchums.event_communities (event_id, community_id)
          SELECT ${eventId}::uuid, unnest(${communityIds}::uuid[])
          ON CONFLICT DO NOTHING
        `;
      } catch (err) {
        console.error("[POST /events] event_communities insert failed:", err);
      }
    }

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

      // Privacy-safe location string for invite emails. Invitees have NOT
      // joined yet, so the `not_joined` role intentionally hides the exact
      // address when the plan's visibility is exact_joined_only or
      // approximate_only.
      const invitePlanForLoc: EmailLocationInput = {
        location_type: locationType,
        location_visibility: locationVisibility,
        location_name: locationName,
        location_address: locationAddress,
        location_area: locationArea,
        online_link: onlineLink,
      };
      const inviteEmailLocation = buildEmailEventLocation(invitePlanForLoc, "not_joined");

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
                    eventLocation: inviteEmailLocation,
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
                eventLocation: inviteEmailLocation,
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
        ) THEN true ELSE false END AS has_unread_chat,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('id', c2.id, 'slug', c2.slug, 'name', c2.name) ORDER BY c2.name)
           FROM newchums.event_communities ec2
           JOIN newchums.communities c2 ON c2.id = ec2.community_id
           WHERE ec2.event_id = e.id
             AND COALESCE(c2.status, 'active') = 'active'),
          '[]'::jsonb
        ) AS communities
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
      communities: Array<{ id: string; slug: string; name: string }>;
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
        communities: r.communities ?? [],
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
        e.location_area, e.location_address, e.online_link,
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
      location_type: string; location_area: string | null; location_address: string | null; online_link: string | null;
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
      // Mirror the public plan-detail page's approximate-area logic: prefer
      // the stored `location_area`, then derive from the full address (street
      // segment stripped, country normalized) so the card reads "London, ON"
      // instead of the generic "General area" placeholder. `location_address`
      // itself is never exposed in the response, only the derived area.
      const approxArea = (r.location_area && r.location_area.trim())
        || deriveApproxArea(r.location_address)
        || null;
      const locationDisplay =
        r.location_type === "online" ? "Online"
          : approxArea || "General area";
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

/** GET /explore/local-signal, lightweight support signal for the bottom of the
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
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('id', c2.id, 'slug', c2.slug, 'name', c2.name) ORDER BY c2.name)
           FROM newchums.event_communities ec2
           JOIN newchums.communities c2 ON c2.id = ec2.community_id
           WHERE ec2.event_id = e.id
             AND COALESCE(c2.status, 'active') = 'active'),
          '[]'::jsonb
        ) AS communities
      FROM newchums.events e
      LEFT JOIN newchums.interests i ON i.id = e.interest_id
      LEFT JOIN newchums.users h ON h.id = e.host_user_id
      LEFT JOIN newchums.event_rsvps r ON r.event_id = e.id AND r.user_id = ${userId}
      LEFT JOIN newchums.chum_preferences hp ON hp.user_id = e.host_user_id
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
        -- Community members-only gate. Semantically the same rule is applied
        -- in processEventMatchDigest's UNION branches (see membersOnlyGate);
        -- the extra er_hid RSVP-bypass branch here is deliberate, Explore
        -- needs to keep the plan visible to a RSVP'd non-member, whereas the
        -- digest already suppresses plans the recipient has an RSVP on. If
        -- you change the hide_from_explore gate, update both sites together.
        AND (
          COALESCE(e.hide_from_explore, false) = false
          OR EXISTS (
            SELECT 1 FROM newchums.event_communities ec_hid
            JOIN newchums.community_members cm_viewer ON cm_viewer.community_id = ec_hid.community_id
            WHERE ec_hid.event_id = e.id
              AND cm_viewer.user_id = ${userId}
              AND cm_viewer.status = 'active'
          )
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
      communities: Array<{ id: string; slug: string; name: string }>;
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
        communities: r.communities ?? [],
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

/** GET /events/recently-happened/public, social-proof feed of recent past public plans.
 *
 *  No auth required. Returns a small set of public-visibility plans that
 *  already ran in the last 30 days and that show evidence of actually
 *  running (at least one non-host RSVP marked Going). Used by both the
 *  logged-out landing page and the logged-in Explore page as a secondary
 *  "Recently happened" section, so visitors, stores, and organizers can
 *  see that real gatherings are happening through NewChums.
 *
 *  Privacy contract is identical to GET /events/explore/public:
 *    - visibility = 'public' only, never chums_only or invite_only
 *    - hide_from_explore = false (the "Only show this plan to community
 *      members" toggle removes the plan from this social-proof feed too)
 *    - is_qa = false (QA isolation is preserved on every surface; no
 *      super-admin bypass here, since social proof is intended for the
 *      normal user-visible discovery experience)
 *    - status = 'published' (cancellation flips status to 'canceled' so
 *      this also excludes canceled plans)
 *    - exposes only privacy-safe fields (location_area, no exact
 *      address / lat-lng / online link)
 *
 *  "Successful" signal: at least one non-host RSVP marked Going. This is
 *  the cleanest indicator currently available in the schema; we don't
 *  have a separate "actually ran" flag, so we treat a non-host attendee
 *  as evidence the plan happened. Plans where only the host RSVP'd are
 *  filtered out so we never surface lonely past plans as social proof.
 */
app.get("/events/recently-happened/public", async (c) => {
  const sql = getSql(c.env);

  const pageLimit = Math.min(Math.max(Number(c.req.query("limit") ?? 6), 1), 12);
  const lookbackDays = 30;
  const now = new Date();
  const since = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  try {
    const rows = (await sql`
      SELECT
        e.id, e.title, e.description, e.starts_at, e.timezone, e.location_type,
        e.location_area, e.location_address, e.max_seats, e.visibility, e.status, e.banner_key,
        COALESCE(
          (SELECT json_agg(json_build_object('name', ii.name, 'slug', ii.slug, 'category', ii.category))
           FROM newchums.event_interests ei2
           JOIN newchums.interests ii ON ii.id = ei2.interest_id
           WHERE ei2.event_id = e.id AND ii.is_deleted = false),
          '[]'::json
        ) AS hobbies,
        i.name AS interest_name, i.slug AS interest_slug,
        h.name AS host_name, h.username AS host_username,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('id', c2.id, 'slug', c2.slug, 'name', c2.name) ORDER BY c2.name)
           FROM newchums.event_communities ec2
           JOIN newchums.communities c2 ON c2.id = ec2.community_id
           WHERE ec2.event_id = e.id
             AND COALESCE(c2.status, 'active') = 'active'),
          '[]'::jsonb
        ) AS communities,
        (SELECT COUNT(*)::int FROM newchums.event_rsvps er WHERE er.event_id = e.id AND er.status = 'going') AS going_count
      FROM newchums.events e
      LEFT JOIN newchums.interests i ON i.id = e.interest_id
      LEFT JOIN newchums.users h ON h.id = e.host_user_id
      WHERE e.status = 'published'
        AND e.starts_at < ${now.toISOString()}
        AND e.starts_at >= ${since.toISOString()}
        AND e.visibility = 'public'
        AND COALESCE(e.hide_from_explore, false) = false
        AND COALESCE(e.is_qa, false) = false
        AND EXISTS (
          SELECT 1 FROM newchums.event_rsvps er_signal
          WHERE er_signal.event_id = e.id
            AND er_signal.user_id IS DISTINCT FROM e.host_user_id
            AND er_signal.status = 'going'
        )
      ORDER BY e.starts_at DESC
      LIMIT ${pageLimit}
    `) as Array<{
      id: string; title: string; description: string | null; starts_at: string; timezone: string | null;
      location_type: string; location_area: string | null; location_address: string | null;
      max_seats: number | null; visibility: string; status: string; banner_key: string | null;
      hobbies: Array<{ name: string; slug: string }> | string;
      interest_name: string | null; interest_slug: string | null;
      host_name: string | null; host_username: string | null;
      communities: Array<{ id: string; slug: string; name: string }>;
      going_count: number;
    }>;

    const events = rows.map((r) => {
      const parsedHobbies = typeof r.hobbies === "string" ? JSON.parse(r.hobbies) : (r.hobbies ?? []);
      const hobbyList = Array.isArray(parsedHobbies) && parsedHobbies.length > 0
        ? parsedHobbies as Array<{ name: string; slug: string }>
        : r.interest_name ? [{ name: r.interest_name, slug: r.interest_slug ?? "" }] : [];
      // Same approximate-area logic as the public plan-detail page and the
      // upcoming public Explore feed: prefer the stored `location_area`, then
      // derive from `location_address`. The full address itself is never
      // exposed; only the derived area is sent to the client.
      const approxArea = (r.location_area && r.location_area.trim())
        || deriveApproxArea(r.location_address)
        || null;
      const locationDisplay =
        r.location_type === "online" ? "Online"
          : approxArea || "General area";
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
        maybeCount: 0,
        distanceKm: null,
        bannerKey: r.banner_key ?? null,
        communities: r.communities ?? [],
      };
    });

    return c.json({ ok: true, events });
  } catch (err) {
    console.error("[GET /events/recently-happened/public]", err);
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

  // Token-based access for email invite recipients or share-link visitors.
  // Invite tokens are signed JWTs; share tokens are short deterministic HMACs.
  // Unauthenticated visitors see the plan preview + lightweight signup card;
  // after magic-link confirmation they return here as a real authenticated user.
  const inviteTokenParam = c.req.query("invite_token") ?? null;
  const shareTokenParam = c.req.query("share_token") ?? null;
  let tokenInviteEmail: string | null = null;
  let tokenGrantsAccess = false;
  // Email the invite_token was issued for, when known. Captured for both
  // authed and unauthed viewers so it can drive (a) prefill on the
  // lightweight signup card and (b) post-signup invite adoption when the
  // user signed up with a different address than the host invited them at.
  let inviteTokenEmail: string | null = null;
  if (inviteTokenParam) {
    const decoded = await verifyInviteToken(inviteTokenParam, c.env.NEXTAUTH_SECRET);
    if (decoded && decoded.eventId === eventId) {
      tokenGrantsAccess = true;
      if (decoded.email) {
        inviteTokenEmail = decoded.email.toLowerCase();
      } else if (decoded.userId) {
        // Invite token for a registered user. Resolve their email so we can
        // prefill the signup/login flow when unauthenticated, and use the
        // same email below for cross-email adoption when authenticated.
        const tokenUserRows = (await sql`SELECT email FROM newchums.users WHERE id = ${decoded.userId} LIMIT 1`) as { email: string }[];
        if (tokenUserRows[0]) inviteTokenEmail = tokenUserRows[0].email.toLowerCase();
      }
      if (!userId) tokenInviteEmail = inviteTokenEmail;
    }
  } else if (shareTokenParam) {
    if (await verifyShareToken(shareTokenParam, eventId, c.env.NEXTAUTH_SECRET)) {
      tokenGrantsAccess = true;
    }
  }

  // Adopt email-only invites when a logged-in user views an event with a
  // valid invite path. Two adoption paths:
  //   1. The user's account email matches an email-only invite row (the
  //      common case: lightweight-signup with the same address the host
  //      invited).
  //   2. The viewer holds a valid invite_token but signed up with a
  //      different email than the token was issued for (typo, multiple
  //      addresses, forwarded link). The signed token is itself proof
  //      the host extended an invite that this account is now using, so
  //      we mirror the email-only row into a user-bound row. The
  //      original email-only row stays untouched so the address it was
  //      sent to can still claim it later.
  if (userId && authPayload?.email) {
    const userEmail = (authPayload.email as string).toLowerCase();
    try {
      // (1) Account-email match.
      await sql`
        UPDATE newchums.event_invites
        SET user_id = ${userId}
        WHERE event_id = ${eventId} AND LOWER(email) = ${userEmail} AND user_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM newchums.event_invites i2 WHERE i2.event_id = ${eventId} AND i2.user_id = ${userId})
      `;

      // (2) Invite-token email differs from the signed-in email. INSERT a
      //     parallel user-bound row so the viewer is recognised as invited
      //     by the SELECT-by-user_id checks below and by the RSVP gate.
      //     SELECT confirms a real email-only row exists for the token's
      //     email so a forged or stale token can never manufacture access.
      //     ON CONFLICT DO NOTHING handles the (event_id, user_id) partial
      //     unique index so a returning viewer does not duplicate.
      if (inviteTokenEmail && inviteTokenEmail !== userEmail) {
        await sql`
          INSERT INTO newchums.event_invites (event_id, user_id, email, invited_by)
          SELECT ${eventId}, ${userId}, NULL, invited_by
          FROM newchums.event_invites
          WHERE event_id = ${eventId} AND LOWER(email) = ${inviteTokenEmail} AND user_id IS NULL
          LIMIT 1
          ON CONFLICT DO NOTHING
        `;
      }
    } catch (adoptErr) {
      console.error("[GET /events/:id] invite adoption error (non-fatal):", adoptErr);
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
    // Tokenized access (share_token or invite_token) is allowed so that intentionally
    // shared QA plans can be previewed by non-admin testers, who still complete the
    // lightweight signup flow before RSVPing.
    // Resolved once for the QA gate and the admin-view payload below.
    const viewerIsSuperAdmin = userId ? await checkIsSuperAdmin(sql, userId) : false;
    if (event.is_qa && !tokenGrantsAccess) {
      if (!userId) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
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

    // Communities the plan belongs to (zero, one, or more).
    const communityList = (await sql`
      SELECT c.id, c.slug, c.name
      FROM newchums.event_communities ec
      JOIN newchums.communities c ON c.id = ec.community_id
      WHERE ec.event_id = ${eventId}
        AND COALESCE(c.status, 'active') = 'active'
      ORDER BY c.name ASC
    `) as { id: string; slug: string; name: string }[];

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
          timezone: event.timezone ?? null,
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
          muteHostAttendanceEmails: false,
          isInvited: false,
          hasRsvp: false,
          goingCount: Number(goingCount),
          maybeCount: Number(maybeCount),
          minConfirmedAttendees: null,
          fallbackPolicy: null,
          minAttendeesRequired: (event as Record<string, unknown>).min_attendees_required != null
            ? Number((event as Record<string, unknown>).min_attendees_required)
            : null,
          confirmationWindowOpen: false,
          confirmationCutoffAt: null,
          confirmedCount: 0,
          pendingConfirmationCount: 0,
          myConfirmationStatus: null,
          planViability: null,
          communities: communityList,
          hideFromExplore: false,
        },
        rsvps: [],
        altTimes: [],
        invites: [],
        joinRequests: [],
      });
    }

    const rsvps = (await sql`
      SELECT er.status, er.note, er.user_id, er.hide_name,
             u.name, u.username, u.avatar_key, u.avatar_updated_at
      FROM newchums.event_rsvps er
      JOIN newchums.users u ON u.id = er.user_id
      WHERE er.event_id = ${eventId}
      ORDER BY er.created_at ASC
    `) as Array<{ status: string; note: string | null; user_id: string; hide_name: boolean; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | Date | null }>;

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
      SELECT eat.id, eat.suggested_at, eat.ends_at, eat.user_id, u.name, u.username
      FROM newchums.event_alt_times eat
      JOIN newchums.users u ON u.id = eat.user_id
      WHERE eat.event_id = ${eventId}
      ORDER BY eat.created_at ASC
    `) as Array<{ id: string; suggested_at: string; ends_at: string | null; user_id: string; name: string | null; username: string | null }>;

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

    // Check if current viewer is invited (needed by frontend for request-to-join gating).
    // For unauthenticated invite-token visitors we resolve against the token's email;
    // they'll become attached to this invite row after completing lightweight signup.
    const isInvited = userId
      ? ((await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId} LIMIT 1`) as unknown[]).length > 0
      : tokenInviteEmail
        ? ((await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND LOWER(email) = ${tokenInviteEmail} LIMIT 1`) as unknown[]).length > 0
        : false;

    // Attendance assurance, confirmation state
    const requiresConfirmation = event.require_reconfirmation === true;
    let confirmations: Array<{ user_id: string; status: string; responded_at: string | null }> = [];
    let confirmationWindowOpen = false;
    // confirmationsIssued stays true once Phase 1 has fired, independent of the
    // event's current status. The plan-detail UI reads it to decide whether
    // per-attendee confirmation badges are meaningful (needed post-cancellation
    // so users can see who didn't confirm and understand why the plan auto-canceled).
    let confirmationsIssued = false;
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
      confirmationsIssued = event.confirmation_sent_at != null;

      confirmations = (await sql`
        SELECT user_id, status, responded_at
        FROM newchums.event_confirmations
        WHERE event_id = ${eventId}
      `) as typeof confirmations;

      confirmedCount = confirmations.filter((c) => c.status === "confirmed").length;
      pendingConfirmationCount = confirmations.filter((c) => c.status === "pending").length;
      if (userId) {
        myConfirmationStatus = confirmations.find((c) => c.user_id === userId)?.status ?? null;
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
    const confirmationByUserId = new Map(confirmations.map((c) => [c.user_id, c.status]));

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

    // B1 crash recovery: if the viewer verified via plan signup but the
    // client died before applying their stored RSVP intent, surface it so
    // the plan page can auto-apply through the normal RSVP endpoint. Only
    // meaningful while no RSVP row exists; an existing RSVP wins outright.
    let viewerPendingIntent: string | null = null;
    if (userId) {
      try {
        const intentRows = (await sql`
          SELECT t.signup_intent
          FROM newchums.email_verification_tokens t
          WHERE t.user_id = ${userId}
            AND t.event_id = ${eventId}
            AND t.signup_intent IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM newchums.event_rsvps r
              WHERE r.event_id = ${eventId} AND r.user_id = ${userId}
            )
          ORDER BY t.created_at DESC
          LIMIT 1
        `) as { signup_intent: string }[];
        viewerPendingIntent = intentRows[0]?.signup_intent ?? null;
      } catch {
        // non-fatal; intent recovery is best-effort
      }
    }

    return c.json({
      ok: true,
      accessState,
      shareToken,
      prefNote,
      viewerUserId: userId ?? null,
      viewerPendingIntent,
      // Super-admin moderation payload. Normal-user redaction above is
      // untouched; this is an additional, clearly-labeled channel that only
      // exists on super-admin responses (server-gated, never sent otherwise).
      ...(viewerIsSuperAdmin
        ? {
            adminView: {
              locationVisibility: locVis,
              exactLocation: {
                name: (event.location_name as string | null) ?? null,
                address: (event.location_address as string | null) ?? null,
                lat: (event.location_lat as number | null) ?? null,
                lng: (event.location_lng as number | null) ?? null,
                onlineLink: (event.online_link as string | null) ?? null,
              },
            },
          }
        : {}),
      viewerEmail: authPayload?.email ? (authPayload.email as string).toLowerCase() : null,
      // Email the invite_token was issued for, exposed only to unauthenticated
      // viewers so the lightweight signup card can prefill it. Once the user
      // is authenticated this field is dropped (their session already has the
      // canonical email and there's nothing to prefill).
      inviteeEmail: !userId ? tokenInviteEmail : null,
      shareLinkModalDismissed,
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        startsAt: event.starts_at,
        timezone: event.timezone ?? null,
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
        muteHostAttendanceEmails: event.mute_host_attendance_emails === true,
        isInvited,
        hasRsvp,
        // Attendance assurance
        minConfirmedAttendees: event.min_confirmed_attendees ? Number(event.min_confirmed_attendees) : null,
        fallbackPolicy: requiresConfirmation ? (event.fallback_policy ?? "notify_host") : null,
        // RSVP-based minimum attendees (separate from the 24-hour attendance check).
        // Visible to all access states so the cancellation banner / details note
        // can render after a min_attendees_required_not_met cancellation.
        minAttendeesRequired: event.min_attendees_required != null ? Number(event.min_attendees_required) : null,
        confirmationWindowOpen,
        confirmationsIssued,
        confirmationCutoffAt,
        confirmedCount,
        pendingConfirmationCount,
        myConfirmationStatus,
        planViability,
        prefOverrides: isHost ? (event.pref_overrides ?? null) : undefined,
        communities: communityList,
        hideFromExplore: isHost ? (event.hide_from_explore === true) : undefined,
        isQa: event.is_qa === true ? true : undefined,
      },
      // Non-attending viewers (authenticated, invite) see handles instead of real names
      // to protect user privacy. Attending viewers (host, RSVP'd) see real names.
      rsvps: rsvps.map((r) => {
        const rHandle = r.username?.replace(/^@/, "") ?? null;
        const rPrefNotes = attendeePrefNotes.get(r.user_id) ?? null;
        const nameHidden = r.hide_name === true;
        const displayName = nameHidden
          ? (rHandle || "Someone")
          : accessState === "attending"
            ? (r.name?.trim() || rHandle || "Someone")
            : (rHandle || "Someone");
        return {
          userId: r.user_id,
          name: displayName,
          handle: rHandle ? `@${rHandle}` : null,
          status: r.status,
          note: r.note,
          avatarUrl: buildAvatarUrl(r.user_id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
          confirmationStatus: confirmationByUserId.get(r.user_id) ?? null,
          ...(rPrefNotes ? { prefNotes: rPrefNotes } : {}),
          ...(userId && r.user_id !== userId ? { isChumSaved: chumSavedSet.has(r.user_id) } : {}),
          // Only tell the viewer about their own hide_name state
          ...(userId && r.user_id === userId ? { hideName: nameHidden } : {}),
        };
      }),
      altTimes: altTimes.map((a) => {
        const aHandle = a.username?.replace(/^@/, "") ?? null;
        const displayName = accessState === "attending"
          ? (a.name?.trim() || aHandle || "Someone")
          : (aHandle || "Someone");
        return {
          id: a.id,
          userId: a.user_id,
          name: displayName,
          handle: aHandle ? `@${aHandle}` : null,
          suggestedAt: a.suggested_at,
          endsAt: a.ends_at,
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
    // Fetch the plan without the publish-status filter first so we can give
    // a targeted error when RSVP is blocked because of plan state (draft or
    // canceled) rather than masking it behind a generic NOT_FOUND, which
    // made it look like the plan itself had disappeared.
    const ev = (await sql`SELECT id, host_user_id, visibility, status, max_seats, title, locked_at, canceled_at, require_approval, reserve_seats, require_reconfirmation, mute_host_attendance_emails, confirmation_sent_at, starts_at, timezone, location_type, location_name, location_address, location_visibility, location_area, online_link, is_qa FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; visibility: string; status: string; max_seats: number | null; title: string; locked_at: string | null; canceled_at: string | null; require_approval: boolean; reserve_seats: boolean; require_reconfirmation: boolean; mute_host_attendance_emails: boolean; confirmation_sent_at: string | null; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; location_visibility: string | null; location_area: string | null; online_link: string | null; is_qa: boolean }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const event = ev[0];
    if (event.status === "canceled" || event.canceled_at) {
      return c.json({ ok: false, error: "EVENT_CANCELED", message: "This plan has been canceled." }, 409);
    }
    if (event.status !== "published") {
      return c.json({ ok: false, error: "EVENT_NOT_PUBLISHED", message: "This plan isn't accepting RSVPs yet." }, 409);
    }

    // QA plan isolation. Mirrors the GET /events/:id policy: super admins
    // always see the plan, and non-admin visitors may only RSVP when they
    // got here through a legitimate path. GET accepts a valid share_token
    // or invite_token in the URL; the POST accepts the same in the body,
    // OR an existing invite row (adopted onto the user's account), OR an
    // existing RSVP. Without any of those, reject with NOT_FOUND so we
    // don't leak existence of QA plans to random authenticated users.
    if (event.is_qa) {
      const isSuperAdmin = await checkIsSuperAdmin(sql, userId);
      if (!isSuperAdmin) {
        let qaAccessGranted = false;

        const shareToken = typeof body.share_token === "string" ? body.share_token : null;
        if (shareToken) {
          qaAccessGranted = await verifyShareToken(shareToken, eventId, c.env.NEXTAUTH_SECRET);
        }
        if (!qaAccessGranted) {
          const inviteToken = typeof body.invite_token === "string" ? body.invite_token : null;
          if (inviteToken) {
            const decoded = await verifyInviteToken(inviteToken, c.env.NEXTAUTH_SECRET);
            qaAccessGranted = decoded?.eventId === eventId;
          }
        }
        if (!qaAccessGranted) {
          // Prior invite adoption (GET /events/:id) may have already linked
          // this user to an event_invites row; that counts as legitimate
          // access here so the token is not required on every subsequent
          // RSVP action.
          const inviteRows = (await sql`
            SELECT 1 FROM newchums.event_invites
            WHERE event_id = ${eventId} AND user_id = ${userId}
            LIMIT 1
          `) as unknown[];
          if (inviteRows.length > 0) qaAccessGranted = true;
        }
        if (!qaAccessGranted) {
          const rsvpRows = (await sql`
            SELECT 1 FROM newchums.event_rsvps
            WHERE event_id = ${eventId} AND user_id = ${userId}
            LIMIT 1
          `) as unknown[];
          if (rsvpRows.length > 0) qaAccessGranted = true;
        }

        if (!qaAccessGranted) {
          return c.json({ ok: false, error: "NOT_FOUND" }, 404);
        }
      }
    }

    if (event.host_user_id === userId) return c.json({ ok: false, error: "VALIDATION", message: "Hosts cannot RSVP to their own event" }, 400);

    const existingRsvp = (await sql`SELECT id, status FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId}`) as { id: string; status: string }[];
    // Captured before the upsert: null means this is the user's first
    // response to the plan. The host notification emails use it to pick
    // accurate copy (a first-time "can't make it" is a decline, not
    // "someone left your plan").
    const previousStatus = existingRsvp[0]?.status ?? null;

    if (event.locked_at) {
      if (existingRsvp.length === 0)
        return c.json({ ok: false, error: "EVENT_LOCKED", message: "This plan is locked and not accepting new participants" }, 403);
    }

    // Invite-only gate: non-invited users cannot RSVP to invite-only plans.
    // Bypassed by a valid share_token (came in via Copy Link) or a valid
    // invite_token (came in via the email-invite link). The invite_token
    // bypass mirrors the QA-plan check above and is the safety net for the
    // email-mismatch case where GET adoption couldn't link the row but the
    // viewer still holds a valid signed invite.
    if (event.visibility === "invite_only" && existingRsvp.length === 0) {
      const invited = (await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId} LIMIT 1`) as unknown[];
      if (invited.length === 0) {
        const shareToken = typeof body.share_token === "string" ? body.share_token : null;
        const hasValidShareToken = shareToken ? await verifyShareToken(shareToken, eventId, c.env.NEXTAUTH_SECRET) : false;
        let hasValidInviteToken = false;
        if (!hasValidShareToken) {
          const inviteToken = typeof body.invite_token === "string" ? body.invite_token : null;
          if (inviteToken) {
            const decoded = await verifyInviteToken(inviteToken, c.env.NEXTAUTH_SECRET);
            hasValidInviteToken = decoded?.eventId === eventId;
          }
        }
        if (!hasValidShareToken && !hasValidInviteToken)
          return c.json({ ok: false, error: "INVITE_ONLY", message: "This plan is invite only. Ask the host for a share link or invite." }, 403);
      }
    }

    // Require-approval gate: non-invited users without an existing RSVP must
    // go through the request flow.
    //
    // Bypassed (in priority order) when ANY of the following is true:
    //   (a) an `event_invites` row exists for the user, set by either a direct
    //       host invite or by `invite_token` adoption inside GET /events/:id;
    //   (b) the request body carries a valid host-generated `share_token` for
    //       this plan (Copy Link share path); or
    //   (c) the request body carries a valid `invite_token` for this plan
    //       (the email-mismatch safety net, mirrors the invite_only gate
    //       above where GET-side adoption couldn't link the row).
    //
    // All three represent host-extended access. Without (a), (b) or (c), a
    // logged-in user discovering an approval-required plan via Explore /
    // community / direct URL still has to send a join request. This mirrors
    // the bypass set used by the `invite_only` gate immediately above so the
    // two gates behave consistently.
    if (event.require_approval && existingRsvp.length === 0) {
      const invited = (await sql`SELECT 1 FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId} LIMIT 1`) as unknown[];
      if (invited.length === 0) {
        const shareToken = typeof body.share_token === "string" ? body.share_token : null;
        const hasValidShareToken = shareToken
          ? await verifyShareToken(shareToken, eventId, c.env.NEXTAUTH_SECRET)
          : false;
        let hasValidInviteToken = false;
        if (!hasValidShareToken) {
          const inviteToken = typeof body.invite_token === "string" ? body.invite_token : null;
          if (inviteToken) {
            const decoded = await verifyInviteToken(inviteToken, c.env.NEXTAUTH_SECRET);
            hasValidInviteToken = decoded?.eventId === eventId;
          }
        }
        if (!hasValidShareToken && !hasValidInviteToken)
          return c.json({ ok: false, error: "APPROVAL_REQUIRED", message: "This plan requires host approval before joining" }, 403);
      }
    }

    if (status === "going" && event.max_seats) {
      const goingCount = (await sql`SELECT COUNT(*)::int AS c FROM newchums.event_rsvps WHERE event_id = ${eventId} AND status = 'going'`) as { c: number }[];
      let occupiedSeats = goingCount[0].c;
      // When reserve_seats is on, pending invites (no RSVP yet, not declined)
      // hold a seat. The requester's own held seat is excluded: an invitee
      // upgrading Maybe -> Going simply converts the seat they were already
      // holding, so it must not block their own upgrade. Without the
      // exclusion, a full plan whose Going attendees were reset to Maybe by
      // the date-change reconfirmation flow would lock every invited
      // attendee out of reconfirming (their own reservation reads as the
      // plan being full).
      if (event.reserve_seats) {
        const reservedCount = (await sql`
          SELECT COUNT(*)::int AS c FROM newchums.event_invites ei
          WHERE ei.event_id = ${eventId}
            AND ei.user_id IS NOT NULL
            AND ei.user_id != ${userId}
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

    // Funnel events: rsvp_recorded (invitee loop) + plan_reached_3_rsvps
    // (host loop). Off the critical path; failures never affect the RSVP.
    runAfterResponse(
      c,
      recordRsvpFunnelEvents(sql, {
        planId: eventId,
        hostUserId: event.host_user_id,
        isQa: event.is_qa === true,
        rsvpUserId: userId,
        rsvpStatus: status,
        rsvpRowCreated: previousStatus === null,
      }),
    );

    // Sync confirmation state when RSVP changes during active confirmation window
    if (event.require_reconfirmation) {
      if (status === "cant_make_it") {
        await sql`
          UPDATE newchums.event_confirmations
          SET status = 'declined', responded_at = NOW(), updated_at = NOW()
          WHERE event_id = ${eventId} AND user_id = ${userId} AND status IN ('pending', 'confirmed')
        `;
      } else if (status === "maybe") {
        // Going -> Maybe softens the commitment. A prior 'confirmed' status is
        // no longer valid for min_confirmed_attendees counting, so roll it back
        // to 'pending' (responded_at cleared). 'declined' and 'expired' rows
        // stay as they are: both capture an explicit or lifecycle-final state
        // that shouldn't silently undo itself when the RSVP softens.
        await sql`
          UPDATE newchums.event_confirmations
          SET status = 'pending', responded_at = NULL, updated_at = NOW()
          WHERE event_id = ${eventId} AND user_id = ${userId} AND status = 'confirmed'
        `;
      } else if (status === "going") {
        const hasConfirmation = (await sql`
          SELECT id FROM newchums.event_confirmations WHERE event_id = ${eventId} AND user_id = ${userId}
        `) as { id: string }[];
        if (hasConfirmation.length === 0 && event.confirmation_sent_at) {
          await sql`
            INSERT INTO newchums.event_confirmations (event_id, user_id, status)
            VALUES (${eventId}, ${userId}, 'pending')
            ON CONFLICT (event_id, user_id) WHERE user_id IS NOT NULL DO NOTHING
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
        // Recipient is the host, so they always see exact regardless of
        // location_visibility (they own the plan).
        const rsvpEventLocation = buildEmailEventLocation(
          {
            location_type: event.location_type,
            location_visibility: event.location_visibility,
            location_name: event.location_name,
            location_address: event.location_address,
            location_area: event.location_area,
            online_link: event.online_link,
          },
          "host",
        );
        const baseEmailArgs = { to: hostUser[0].email, hostName, attendeeName, eventTitle: event.title, eventUrl, attendeeMessage: note, eventDate: rsvpEventDate, eventLocation: rsvpEventLocation, previousStatus };

        // Per-plan host mute: when enabled, suppress all three attendance
        // emails (Going/Maybe/Can't make it) for this plan, regardless of the
        // host's account-level prefs. Covers invited users' updates too, since
        // they RSVP through this same endpoint. The in-app notification above,
        // join-request emails, and at-risk emails are intentionally unaffected.
        const muteAttendanceEmails = event.mute_host_attendance_emails === true;
        if (!muteAttendanceEmails && status === "going" && hostPrefs.items.host_join?.enabled !== false) {
          const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, event.host_user_id, "host_join");
          await sendEventJoinEmail(c.env, { ...baseEmailArgs, unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}` });
        }
        if (!muteAttendanceEmails && status === "maybe" && hostPrefs.items.host_maybe?.enabled !== false) {
          const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, event.host_user_id, "host_maybe");
          await sendEventMaybeEmail(c.env, { ...baseEmailArgs, unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}` });
        }
        if (!muteAttendanceEmails && status === "cant_make_it" && hostPrefs.items.host_leave?.enabled !== false) {
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

    await markConfirmationRequestedNotificationsRead(sql, userId, eventId);
    return c.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error("[POST /events/:id/confirm]", err);
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
      INSERT INTO newchums.event_alt_times (event_id, user_id, suggested_at, ends_at)
      VALUES (${eventId}, ${userId}, ${suggestedDate.toISOString()}, ${endsAtDate ? endsAtDate.toISOString() : null})
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
    const row = (await sql`SELECT id, user_id, suggested_at, ends_at FROM newchums.event_alt_times WHERE id = ${altTimeId}`) as { id: string; user_id: string; suggested_at: string; ends_at: string | null }[];
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

    await sql`
      UPDATE newchums.event_alt_times SET
        suggested_at = ${suggestedAt ? suggestedAt.toISOString() : row[0].suggested_at},
        ends_at      = ${endsAt !== undefined ? (endsAt ? endsAt.toISOString() : null) : row[0].ends_at}
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
  if (!env.NEXTAUTH_SECRET) return;
  const eventUrl = `${env.WEB_BASE_URL}/events/${eventId}`;

  // Fetch event details for date/location display in the email
  const evRows = (await sql`
    SELECT starts_at, timezone, location_type, location_name, location_address, location_visibility, location_area, online_link, COALESCE(is_qa, false) AS is_qa
    FROM newchums.events WHERE id = ${eventId} LIMIT 1
  `) as { starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; location_visibility: string | null; location_area: string | null; online_link: string | null; is_qa: boolean }[];
  const ev = evRows[0];
  const eventDate = ev ? formatEventDate(ev.starts_at, ev.timezone || "UTC") : "";
  // Recipients of this email are attending non-host users (WHERE status IN
  // ('going', 'maybe') AND user_id != hostUserId). They've joined, so they
  // get exact address for exact_everyone / exact_joined_only plans and
  // approximate only for approximate_only plans, mirroring the plan page.
  const eventLocation = ev
    ? buildEmailEventLocation(ev, "joined")
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

/**
 * Host changed the plan's date/time and asked attendees to reconfirm.
 * The PATCH handler has already softened every non-host 'going' RSVP to
 * 'maybe'; this notifies everyone who was Going or Maybe before the flip
 * (`wasGoingByUser`): an in-app notification always, plus the
 * rsvpReconfirmRequest email gated by the same event_changed_canceled
 * preference as other plan-change emails. Replaces (not supplements) the
 * generic notifyAttendeesPlanChanged run for that edit, so attendees get
 * one email per edit. Mirrors its sibling's QA isolation and per-recipient
 * error swallowing.
 */
async function notifyAttendeesReconfirmRequest(
  sql: ReturnType<typeof getSql>,
  env: Bindings,
  eventId: string,
  hostUserId: string,
  eventTitle: string,
  oldStartsAt: string,
  changes: PlanChangeItem[],
  wasGoingByUser: Map<string, boolean>,
): Promise<void> {
  if (!env.NEXTAUTH_SECRET) return;
  if (wasGoingByUser.size === 0) return;
  const eventUrl = `${env.WEB_BASE_URL}/events/${eventId}`;

  const evRows = (await sql`
    SELECT starts_at, timezone, location_type, location_name, location_address, location_visibility, location_area, online_link, COALESCE(is_qa, false) AS is_qa
    FROM newchums.events WHERE id = ${eventId} LIMIT 1
  `) as { starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; location_visibility: string | null; location_area: string | null; online_link: string | null; is_qa: boolean }[];
  const ev = evRows[0];
  if (!ev) return;
  const tz = ev.timezone || "UTC";
  const newDate = formatEventDate(ev.starts_at, tz);
  const oldDate = formatEventDate(oldStartsAt, tz);
  // Recipients are attending non-host users, so they get the joined-viewer
  // location treatment, same as the plan-changed email.
  const eventLocation = buildEmailEventLocation(ev, "joined");

  const hostRows = (await sql`
    SELECT username, name FROM newchums.users WHERE id = ${hostUserId} LIMIT 1
  `) as { username: string | null; name: string | null }[];
  const host = hostRows[0];
  const hostUsernameSlug = host?.username?.replace(/^@/, "").trim() || null;
  const hostNameTrimmed = host?.name?.trim() || null;
  const hostDisplayName = hostNameTrimmed || hostUsernameSlug || "The host";
  const notificationMetadata = {
    eventTitle,
    newDate,
    ...(hostUsernameSlug ? { hostUsername: hostUsernameSlug } : {}),
    ...(hostNameTrimmed ? { hostName: hostNameTrimmed } : {}),
  };

  const recipientIds = Array.from(wasGoingByUser.keys());
  const attendees = (await sql`
    SELECT u.id, u.email, u.name, u.username
    FROM newchums.users u
    WHERE u.id = ANY(${recipientIds}::uuid[])
  `) as Array<{ id: string; email: string; name: string | null; username: string | null }>;

  // The date/time change is the centerpiece of the email; the "Also
  // changed" block only carries any other edits made in the same save.
  const otherChanges = changes.filter((ch) => ch.fieldName !== "Date & time");

  // QA plans: only notify super admin attendees
  const qaAdminIds = ev.is_qa ? await batchLoadSuperAdminIds(sql, attendees.map((a) => a.id)) : null;

  for (const att of attendees) {
    if (qaAdminIds && !qaAdminIds.has(att.id)) continue;
    try {
      await sql`
        INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
        VALUES (${att.id}, 'event_reconfirm_requested', ${hostUserId}, ${eventId}, ${JSON.stringify(notificationMetadata)})
      `;

      const profileRows = (await sql`
        SELECT notification_prefs FROM newchums.user_profile WHERE user_id = ${att.id} LIMIT 1
      `) as Array<{ notification_prefs: unknown }>;
      const prefs = normalizeNotificationPrefs(profileRows[0]?.notification_prefs);
      if (prefs.items.event_changed_canceled?.enabled === false) continue;

      const unsubToken = await createUnsubscribeToken(env.NEXTAUTH_SECRET, att.id, "event_changed_canceled");
      const unsubscribeUrl = `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
      const recipientName = att.name?.trim() || att.username?.replace(/^@/, "") || "there";

      await sendRsvpReconfirmRequestEmail(env, {
        to: att.email,
        recipientName,
        hostName: hostDisplayName,
        eventTitle,
        eventUrl,
        newDate,
        oldDate,
        eventLocation,
        wasGoing: wasGoingByUser.get(att.id) === true,
        changes: otherChanges,
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
             require_reconfirmation, min_confirmed_attendees, fallback_policy, min_attendees_required,
             alt_times_mode, availability_deadline_at,
             location_type, location_name, location_address, location_place_id, location_lat, location_lng,
             location_visibility, location_area, online_link
      FROM newchums.events WHERE id = ${eventId}
    `) as { id: string; host_user_id: string; status: string; title: string; description: string | null; starts_at: string; timezone: string | null; max_seats: number | null; visibility: string; require_reconfirmation: boolean; min_confirmed_attendees: number | null; fallback_policy: string; min_attendees_required: number | null; alt_times_mode: string | null; availability_deadline_at: string | null; location_type: string; location_name: string | null; location_address: string | null; location_place_id: string | null; location_lat: number | null; location_lng: number | null; location_visibility: string; location_area: string | null; online_link: string | null }[];
    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (rows[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
    if (rows[0].status === "canceled") return c.json({ ok: false, error: "VALIDATION", message: "Cannot edit a canceled plan" }, 400);

    // Banner-only partial update. The Edit form removes a banner with a
    // follow-up PATCH whose body is exactly { banner_key: null }; the
    // full-field validation below (title, starts_at, hobbies, ...) must
    // not apply to that call, and it fires no attendee notifications.
    // Clearing is the only mutation accepted here; setting a banner key
    // still goes exclusively through /media/finalize so its ownership
    // checks cannot be bypassed. Anything else falls through to normal
    // full-body validation.
    {
      const bodyKeys = Object.keys(body);
      if (bodyKeys.length === 1 && bodyKeys[0] === "banner_key" && body.banner_key === null) {
        await sql`UPDATE newchums.events SET banner_key = NULL, updated_at = NOW() WHERE id = ${eventId}`;
        return c.json({ ok: true });
      }
    }

    // Existing community links, used to determine which entries are newly
    // added (and therefore need a fresh membership check) vs already
    // present (which a host who left the community can keep).
    const existingCommunityRows = (await sql`
      SELECT community_id FROM newchums.event_communities WHERE event_id = ${eventId}
    `) as { community_id: string }[];
    const existingCommunityIds = new Set(existingCommunityRows.map((r) => r.community_id));

    const rawTitle = body.title != null ? String(body.title).trim() : null;
    if (!rawTitle) return c.json({ ok: false, error: "VALIDATION", message: "Title is required", field: "title" }, 400);
    if (rawTitle.length > 200) return c.json({ ok: false, error: "VALIDATION", message: "Title must be 200 characters or less", field: "title" }, 400);

    const description = body.description != null ? sanitizeDescriptionHtml(String(body.description).trim().slice(0, 5000)) || null : null;

    const startsAtRaw = body.starts_at ? String(body.starts_at) : null;
    if (!startsAtRaw) return c.json({ ok: false, error: "VALIDATION", message: "Date and time are required", field: "starts_at" }, 400);
    const startsAt = new Date(startsAtRaw);
    if (isNaN(startsAt.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid date/time", field: "starts_at" }, 400);

    // max_seats handling on PATCH:
    // 1. If the field is missing from the body, preserve the existing value (no-op clear).
    //    Previously the SQL always overwrote with the computed value, so a partial PATCH
    //    that didn't include max_seats would silently wipe it.
    // 2. If the field is present but null, that's an explicit "no limit" clear.
    // 3. If the field is present and numeric, validate strictly and reject invalid values
    //    instead of silently coercing them to null. Matches POST /events behaviour.
    const maxSeatsProvided = "max_seats" in body;
    let maxSeats: number | null = rows[0].max_seats;
    if (maxSeatsProvided) {
      if (body.max_seats == null) {
        maxSeats = null;
      } else {
        const rawMaxSeats = Number(body.max_seats);
        if (isNaN(rawMaxSeats) || rawMaxSeats < 1 || rawMaxSeats > 500)
          return c.json({ ok: false, error: "VALIDATION", message: "Seats must be between 1 and 500", field: "max_seats" }, 400);
        maxSeats = Math.floor(rawMaxSeats);
      }
    }

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
    const patchMuteHostAttendanceEmails = body.mute_host_attendance_emails != null ? body.mute_host_attendance_emails === true : undefined;

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
      patchLocationLat = body.location_lat != null && Number.isFinite(Number(body.location_lat)) ? Number(body.location_lat) : null;
      patchLocationLng = body.location_lng != null && Number.isFinite(Number(body.location_lng)) ? Number(body.location_lng) : null;

      // In-person plans must have resolvable coordinates (see matching
      // guard on POST /events). Without lat/lng the Explore and digest
      // distance filters drop the plan from everyone's feed.
      if (lt === "in_person" && (patchLocationLat == null || patchLocationLng == null)) {
        return c.json({ ok: false, error: "VALIDATION", message: "Please pick a location from the suggestions", field: "location" }, 400);
      }

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
    // Community links are an array; the field is only present when the form
    // detected a change from the original list. Server-side invariant:
    // invite_only plans can never be linked to a community, so we force the
    // list empty if the caller is setting visibility=invite_only in this
    // PATCH. Mirror of the POST /events guard. See AGENTS.md -> Plan Feed
    // and Community Visibility Contract.
    let patchCommunityIds: string[] | undefined;
    if ("community_ids" in body) {
      const raw = Array.isArray(body.community_ids)
        ? (body.community_ids as unknown[])
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter((v): v is string => !!v)
        : [];
      patchCommunityIds = visibility === "invite_only"
        ? []
        : Array.from(new Set(raw)).slice(0, 10);
    } else if (visibility === "invite_only" && existingCommunityIds.size > 0) {
      // Caller didn't touch community_ids but is switching to invite_only;
      // detach all existing links to enforce the invariant.
      patchCommunityIds = [];
    }
    // hide_from_explore is only meaningful when at least one community is
    // linked. When the effective community list is empty (explicitly cleared
    // or forced empty by invite_only), clear hide_from_explore too so the
    // two values cannot drift apart.
    const patchHideFromExploreRaw = "hide_from_explore" in body ? body.hide_from_explore === true : undefined;
    const effectiveCommunityCount = patchCommunityIds !== undefined
      ? patchCommunityIds.length
      : existingCommunityIds.size;
    const patchHideFromExplore: boolean | undefined =
      effectiveCommunityCount === 0
        ? false
        : patchHideFromExploreRaw;
    // Mirror the POST /events guard: only newly-added community links need a
    // fresh membership check. Communities that were already linked stay
    // linked even if the host later left them, so a host who left a
    // community can still edit other plan fields without being forced to
    // detach.
    if (patchCommunityIds !== undefined) {
      const newlyAdded = patchCommunityIds.filter((cid) => !existingCommunityIds.has(cid));
      if (newlyAdded.length > 0) {
        const cmRows = (await sql`
          SELECT community_id FROM newchums.community_members
          WHERE community_id = ANY(${newlyAdded}::uuid[])
            AND user_id = ${userId}
            AND status = 'active'
        `) as { community_id: string }[];
        const memberOf = new Set(cmRows.map((r) => r.community_id));
        const missing = newlyAdded.filter((cid) => !memberOf.has(cid));
        if (missing.length > 0)
          return c.json({ ok: false, error: "VALIDATION", message: "You must be a member of every selected community", field: "community_ids" }, 400);
      }
    }
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

    // Optional RSVP-based minimum attendees, independent of the 24-hour
    // attendance check. Validated against the effective max_seats so the
    // PATCH can't leave the row in a state that violates the seat-cap CHECK.
    let patchMinAttendeesRequired: number | null = null;
    if (body.min_attendees_required != null && body.min_attendees_required !== "") {
      const raw = Number(body.min_attendees_required);
      if (!Number.isFinite(raw) || raw < 1)
        return c.json({ ok: false, error: "VALIDATION", message: "Minimum attendees required must be at least 1", field: "min_attendees_required" }, 400);
      const floored = Math.floor(raw);
      if (maxSeats != null && floored > maxSeats)
        return c.json({ ok: false, error: "VALIDATION", message: "Minimum attendees required cannot be greater than the seat count", field: "min_attendees_required" }, 400);
      patchMinAttendeesRequired = Math.min(500, floored);
    }

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
          mute_host_attendance_emails = COALESCE(${patchMuteHostAttendanceEmails ?? null}, mute_host_attendance_emails),
          timezone                 = COALESCE(${patchTimezone}, timezone),
          min_confirmed_attendees  = ${patchMinConfirmed},
          fallback_policy          = ${patchFallbackPolicy},
          min_attendees_required   = ${patchMinAttendeesRequired},
          pref_overrides           = CASE WHEN ${patchPrefOverrides !== undefined} THEN ${patchPrefOverrides !== undefined ? (patchPrefOverrides ? JSON.stringify(patchPrefOverrides) : null) : null}::jsonb ELSE pref_overrides END,
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

    // Sync community links: replace the junction rows with the new list
    // (only when the caller actually sent community_ids, or when the
    // invite_only invariant is forcing a clear).
    if (patchCommunityIds !== undefined) {
      await sql`DELETE FROM newchums.event_communities WHERE event_id = ${eventId}`;
      if (patchCommunityIds.length > 0) {
        await sql`
          INSERT INTO newchums.event_communities (event_id, community_id)
          SELECT ${eventId}::uuid, unnest(${patchCommunityIds}::uuid[])
          ON CONFLICT DO NOTHING
        `;
      }
    }

    // Build a human-readable diff for the email notification
    const before = rows[0];
    const effectiveTz = patchTimezone ?? before.timezone ?? "UTC";
    const changes: PlanChangeItem[] = [];
    const VIS_LABEL: Record<string, string> = { public: "Public", chums_only: "Chums only", invite_only: "Invite only" };
    const truncate = (s: string | null, n: number): string => s ? (s.length > n ? s.slice(0, n) + "…" : s) : "(none)";

    if (before.title !== rawTitle)
      changes.push({ fieldName: "Title", oldValue: before.title, newValue: rawTitle });

    const dateTimeChanged = new Date(before.starts_at).getTime() !== startsAt.getTime();
    if (dateTimeChanged)
      changes.push({
        fieldName: "Date & time",
        oldValue: formatEventDate(before.starts_at, effectiveTz),
        newValue: formatEventDate(startsAt.toISOString(), effectiveTz),
      });

    if ((before.description ?? null) !== description)
      changes.push({
        fieldName: "Description",
        // Description is rich-text HTML; convert to plain text so the
        // "What changed" block in the event-changed email doesn't render
        // literal tags.
        oldValue: truncate(htmlToPlainText(before.description) || null, 150),
        newValue: truncate(htmlToPlainText(description) || null, 150),
      });

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

    if ((before.min_attendees_required ?? null) !== patchMinAttendeesRequired)
      changes.push({
        fieldName: "Minimum attendees required",
        oldValue: before.min_attendees_required != null ? `${before.min_attendees_required} people` : "Not set",
        newValue: patchMinAttendeesRequired != null ? `${patchMinAttendeesRequired} people` : "Not set",
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

    // Host-requested RSVP reconfirmation. Only honored when the date/time
    // actually changed (the edit form only offers the toggle then; this is
    // the server-side backstop, and it also keeps the banner-removal
    // follow-up PATCH and other partial callers inert). Every non-host
    // 'going' RSVP is softened to 'maybe' so the Who's-in list shows who
    // has reconfirmed for the new time, and everyone who was Going or
    // Maybe is asked to respond.
    //
    // committed_at is cleared on the flipped rows: that stamp recorded a
    // commitment to the OLD time, and the "Going follow-through"
    // reliability metric counts any committed row that is no longer
    // 'going' as the attendee backing out. Without the clear, the host's
    // change would ding every attendee's public reliability stats.
    // Re-RSVPing Going writes a fresh committed_at via the RSVP upsert's
    // COALESCE, so the plan re-enters the metrics once they re-commit.
    const reconfirmRequested = body.reconfirm_rsvps === true && dateTimeChanged;
    let rsvpsReset = 0;
    let reconfirmRecipientCount = 0;
    if (reconfirmRequested) {
      // Snapshot going/maybe attendees before the flip so the email can
      // tell "you were Going" apart from "you were already Maybe".
      const reconfirmRecipients = (await sql`
        SELECT user_id, status FROM newchums.event_rsvps
        WHERE event_id = ${eventId} AND status IN ('going', 'maybe') AND user_id != ${userId}
      `) as { user_id: string; status: string }[];

      const flipped = (await sql`
        UPDATE newchums.event_rsvps
        SET status = 'maybe', committed_at = NULL, updated_at = NOW()
        WHERE event_id = ${eventId} AND status = 'going' AND user_id != ${userId}
        RETURNING user_id
      `) as { user_id: string }[];
      rsvpsReset = flipped.length;

      if (flipped.length > 0) {
        // Mirror the user-initiated Going -> Maybe sync from
        // POST /events/:id/rsvp: a prior 'confirmed' 24-hour attendance
        // check response was for the old time, so roll it back to
        // 'pending'. 'declined' and 'expired' rows stay final.
        await sql`
          UPDATE newchums.event_confirmations
          SET status = 'pending', responded_at = NULL, updated_at = NOW()
          WHERE event_id = ${eventId} AND status = 'confirmed'
            AND user_id = ANY(${flipped.map((f) => f.user_id)}::uuid[])
        `;
      }

      reconfirmRecipientCount = reconfirmRecipients.length;
      if (reconfirmRecipients.length > 0) {
        const wasGoingByUser = new Map(reconfirmRecipients.map((r) => [r.user_id, r.status === "going"]));
        c.executionCtx.waitUntil(
          notifyAttendeesReconfirmRequest(sql, c.env, eventId, userId, rawTitle, before.starts_at, changes, wasGoingByUser),
        );
      }
    }

    // Host can opt out of attendee notifications for this edit. A
    // reconfirmation request already notifies every going/maybe attendee
    // (with the change list included), so the generic plan-changed
    // notification is suppressed for that edit to avoid double-emailing.
    const shouldNotify = body.notify_attendees !== false && !reconfirmRequested;
    if (shouldNotify) {
      c.executionCtx.waitUntil(
        notifyAttendeesPlanChanged(sql, c.env, eventId, userId, rawTitle, "updated", changes),
      );
    }

    return c.json({ ok: true, rsvps_reset: rsvpsReset, reconfirm_requested: reconfirmRecipientCount });
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
  if (!targetUserId)
    return c.json({ ok: false, error: "VALIDATION", message: "user_id is required" }, 400);
  const reason = body.reason ? String(body.reason).trim().slice(0, 500) : null;

  try {
    const ev = (await sql`SELECT id, host_user_id, title, status, starts_at, timezone, location_type, location_name, location_address, location_visibility, location_area, online_link FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; title: string; status: string; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; location_visibility: string | null; location_area: string | null; online_link: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const event = ev[0];

    if (event.host_user_id !== userId)
      return c.json({ ok: false, error: "FORBIDDEN", message: "Only the host can remove attendees" }, 403);

    if (new Date(event.starts_at) < new Date())
      return c.json({ ok: false, error: "VALIDATION", message: "Attendees cannot be removed from past events" }, 400);

    if (targetUserId === userId)
      return c.json({ ok: false, error: "VALIDATION", message: "You cannot remove yourself from your own plan" }, 400);

    const rsvpRows = (await sql`SELECT id, status FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${targetUserId}`) as { id: string; status: string }[];
    if (rsvpRows.length === 0)
      return c.json({ ok: false, error: "NOT_FOUND", message: "This person is not an attendee of this plan" }, 404);

    const statusAtRemoval = rsvpRows[0].status;

    await sql`DELETE FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${targetUserId}`;

    // Also clear any attendance-check confirmation row so a stale 'confirmed'
    // status doesn't keep contributing to min_confirmed_attendees after the
    // removed user has been taken off the plan.
    await sql`DELETE FROM newchums.event_confirmations WHERE event_id = ${eventId} AND user_id = ${targetUserId}`;

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
            // Removed attendees are treated like declined requesters: once
            // access is revoked, the email uses approximate area only
            // regardless of visibility. The user may already know the
            // exact address from their prior attending state, but the
            // removal email itself should not re-surface it.
            eventLocation: buildEmailEventLocation(event, "declined"),
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
    const ev = (await sql`SELECT id, host_user_id, title, starts_at, timezone, location_type, location_name, location_address, location_visibility, location_area, online_link FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; title: string; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; location_visibility: string | null; location_area: string | null; online_link: string | null }[];
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
    // Invite target never joined the plan; they're in the "declined" role
    // for location-privacy purposes. Approximate area only regardless of
    // plan visibility.
    const eventLocation = buildEmailEventLocation(event, "declined");

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
    const ev = (await sql`SELECT id, host_user_id, title, starts_at, status, timezone, location_type, location_name, location_address, location_visibility, location_area, online_link, allow_attendee_invites, allow_alt_times, alt_times_mode, availability_deadline_at FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; title: string; starts_at: string; status: string; timezone: string; location_type: string; location_name: string | null; location_address: string | null; location_visibility: string | null; location_area: string | null; online_link: string | null; allow_attendee_invites: boolean; allow_alt_times: boolean; alt_times_mode: string | null; availability_deadline_at: string | null }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const isHost = ev[0].host_user_id === userId;
    if (!isHost) {
      if (!ev[0].allow_attendee_invites)
        return c.json({ ok: false, error: "FORBIDDEN", message: "The host has disabled attendee invitations for this plan" }, 403);
      const goingCheck = (await sql`SELECT 1 FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId} AND status = 'going' LIMIT 1`) as unknown[];
      if (goingCheck.length === 0)
        return c.json({ ok: false, error: "FORBIDDEN", message: "Only Going attendees can invite others to this plan" }, 403);
    }

    // Invitees have NOT joined yet, so emails show approximate area for
    // exact_joined_only and approximate_only plans. This applies whether
    // the inviter is the host or a Going attendee; the recipient's role
    // is what matters.
    const inviteLocationDisplay = buildEmailEventLocation(ev[0], "not_joined");

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
  // Per-message opt-in: when true, this message notifies the plan's attendees
  // (Going + Maybe + host, minus the sender) by email + an in-app notification.
  // Unflagged messages stay silent (real-time broadcast + unread badge only).
  const notifyAttendees = body.notify_attendees === true;

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
      INSERT INTO newchums.event_chat_messages (event_id, user_id, body, notify_attendees)
      VALUES (${eventId}, ${userId}, ${messageBody}, ${notifyAttendees})
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

    // Notify attendees when the sender opted in. Runs in the background so the
    // send response stays fast. Recipients = Going + Maybe RSVPs + host, minus
    // the sender. Each recipient always gets an in-app notification; the email
    // additionally respects their chat-notification pref and a 2-minute
    // per-recipient rate limit so a burst of flagged messages can't spam them.
    if (notifyAttendees) {
      const senderName = chatMessage.senderName;
      const preview = messageBody.length > 280 ? `${messageBody.slice(0, 277)}...` : messageBody;
      c.executionCtx.waitUntil((async () => {
        try {
          const evRows = (await sql`SELECT title FROM newchums.events WHERE id = ${eventId}`) as { title: string }[];
          const eventTitle = evRows[0]?.title ?? "your plan";
          const recipients = (await sql`
            SELECT u.id, u.email, u.name, up.notification_prefs
            FROM newchums.users u
            LEFT JOIN newchums.user_profile up ON up.user_id = u.id
            WHERE u.id != ${userId}
              AND u.id IN (
                SELECT user_id FROM newchums.event_rsvps
                  WHERE event_id = ${eventId} AND status IN ('going', 'maybe')
                UNION
                SELECT host_user_id FROM newchums.events WHERE id = ${eventId}
              )
          `) as { id: string; email: string; name: string | null; notification_prefs: unknown }[];

          const eventUrl = `${c.env.WEB_BASE_URL}/events/${eventId}?section=chat`;
          const notifyMetadata = JSON.stringify({ eventTitle, senderName, preview });

          for (const r of recipients) {
            // In-app notification: always created (never rate-limited).
            try {
              await sql`
                INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
                VALUES (${r.id}, 'chat_message', ${userId}, ${eventId}, ${notifyMetadata})
              `;
            } catch { /* one bad insert shouldn't stop the rest */ }

            // Email: respect the recipient's chat-notification pref (the
            // repurposed unread_chat_digest toggle)...
            const prefs = normalizeNotificationPrefs(r.notification_prefs);
            if (prefs.items.unread_chat_digest?.enabled === false) continue;

            // ...and the per-recipient/per-plan rate limit. The conditional
            // upsert atomically "claims" a send only when the last email was
            // over 2 minutes ago (or never), so a flurry of flagged messages
            // can't double-send to the same person.
            let claimed = false;
            try {
              const claim = (await sql`
                INSERT INTO newchums.event_chat_notify_sends (event_id, recipient_user_id, last_sent_at)
                VALUES (${eventId}, ${r.id}, NOW())
                ON CONFLICT (event_id, recipient_user_id) DO UPDATE
                  SET last_sent_at = NOW()
                  WHERE event_chat_notify_sends.last_sent_at < NOW() - INTERVAL '2 minutes'
                RETURNING recipient_user_id
              `) as { recipient_user_id: string }[];
              claimed = claim.length > 0;
            } catch { claimed = false; }
            if (!claimed) continue;

            try {
              const unsubToken = await createUnsubscribeToken(c.env.NEXTAUTH_SECRET, r.id, "unread_chat_digest");
              await sendChatMessageNotifyEmail(c.env, {
                to: r.email,
                recipientName: r.name?.trim() || "there",
                senderName,
                eventTitle,
                messagePreview: preview,
                eventUrl,
                unsubscribeUrl: `${c.env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
              });
            } catch { /* email failure shouldn't break others */ }
          }
        } catch (notifyErr) {
          console.error("[POST /events/:id/chat] notify failed", notifyErr);
        }
      })());
    }

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
      SELECT id, host_user_id, title, status, require_approval, locked_at, max_seats, starts_at, timezone, location_type, location_name, location_address, location_visibility, location_area, online_link
      FROM newchums.events WHERE id = ${eventId}
    `) as { id: string; host_user_id: string; title: string; status: string; require_approval: boolean; locked_at: string | null; max_seats: number | null; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; location_visibility: string | null; location_area: string | null; online_link: string | null }[];
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
            // `?section=join-requests` is the auth-required marker the web
            // (app)/layout reads to redirect logged-out viewers through /login
            // first, then back to the host's "Join requests" card. This is the
            // pattern that fixes the "Plan not found" symptom on QA plans
            // (where the public-preview path 404s) and on private plans where
            // a logged-out host has no view permission.
            eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}?section=join-requests`,
            eventDate: formatEventDate(event.starts_at, event.timezone || "UTC"),
            // Recipient is the host: always sees exact.
            eventLocation: buildEmailEventLocation(event, "host"),
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
      SELECT id, host_user_id, title, max_seats, starts_at, timezone, location_type, location_name, location_address, location_visibility, location_area, online_link, is_qa FROM newchums.events WHERE id = ${eventId} AND status = 'published'
    `) as { id: string; host_user_id: string; title: string; max_seats: number | null; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; location_visibility: string | null; location_area: string | null; online_link: string | null; is_qa: boolean | null }[];
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

    // Add as Going. The pre-check only feeds the funnel event below (was
    // this a fresh RSVP row or an upgrade of an existing one).
    const priorRsvp = (await sql`
      SELECT 1 AS one FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${req[0].user_id} LIMIT 1
    `) as unknown[];
    await sql`
      INSERT INTO newchums.event_rsvps (event_id, user_id, status, committed_at)
      VALUES (${eventId}, ${req[0].user_id}, 'going', NOW())
      ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'going', updated_at = NOW(),
        committed_at = COALESCE(newchums.event_rsvps.committed_at, NOW())
    `;

    // Funnel events: approval-path RSVPs count the same as direct RSVPs.
    runAfterResponse(
      c,
      recordRsvpFunnelEvents(sql, {
        planId: eventId,
        hostUserId: ev[0].host_user_id,
        isQa: ev[0].is_qa === true,
        rsvpUserId: req[0].user_id,
        rsvpStatus: "going",
        rsvpRowCreated: priorRsvp.length === 0,
      }),
    );

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
            // `?section=attendees` triggers the same auth-redirect pattern as
            // join-requests (see AUTH_REQUIRED_EVENT_SECTIONS in
            // web/src/app/(app)/layout.tsx) so a logged-out approved viewer
            // is sent through /login first, then scrolls to Who's in.
            eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}?section=attendees`,
            eventDate: formatEventDate(ev[0].starts_at, ev[0].timezone || "UTC"),
            // Recipient has just joined (RSVP row is created as 'going'
            // right above this block). Role = "joined": they see exact
            // address for exact_everyone / exact_joined_only plans and
            // approximate only for approximate_only plans.
            eventLocation: buildEmailEventLocation(ev[0], "joined"),
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
      SELECT id, host_user_id, title, starts_at, timezone, location_type, location_name, location_address, location_visibility, location_area, online_link FROM newchums.events WHERE id = ${eventId} AND status = 'published'
    `) as { id: string; host_user_id: string; title: string; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; location_visibility: string | null; location_area: string | null; online_link: string | null }[];
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
            // Declined requester: approximate area only, regardless of
            // plan visibility. A declined user must not receive the exact
            // address via email even if the plan is exact_everyone.
            eventLocation: buildEmailEventLocation(ev[0], "declined"),
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
    // Only people who actually attended can leave feedback. A 'cant_make_it'
    // RSVP (or no RSVP) means they didn't attend → NOT_PARTICIPANT; the client
    // then shows the normal past-plan view. Mirrors the reviewee query below,
    // which already scopes to going/maybe + host.
    const attended = (await sql`
      SELECT 1 FROM newchums.event_rsvps
      WHERE event_id = ${eventId} AND user_id = ${userId}
        AND status IN ('going', 'maybe') LIMIT 1
    `).length > 0;
    if (!isHost && !attended)
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
      .map((a) => {
        const realName = a.name?.trim() || null;
        const handle = a.username ? `@${a.username.replace(/^@/, "")}` : null;
        // displayName is the canonical primary label and remains backward
        // compatible with existing clients: prefer the real/display name when
        // available, fall back to the handle, then to a generic placeholder.
        // The frontend now also receives `name` and `handle` separately so it
        // can render "Real Name @handle" side-by-side without re-deriving.
        const displayName = realName || handle || "Someone";
        return {
          userId: a.id,
          displayName,
          name: realName,
          handle,
          username: a.username ?? null,
          isHost: a.id === ev[0].host_user_id,
        };
      });

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

    // Only people who actually attended can leave feedback (see GET handler).
    const isHost = ev[0].host_user_id === userId;
    const attended = (await sql`
      SELECT 1 FROM newchums.event_rsvps
      WHERE event_id = ${eventId} AND user_id = ${userId}
        AND status IN ('going', 'maybe') LIMIT 1
    `).length > 0;
    if (!isHost && !attended)
      return c.json({ ok: false, error: "NOT_PARTICIPANT" }, 403);

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
  // by "Removed", matching the behavior the community-facing roadmap has
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

// ─── QR redirect management (super admin + public resolve) ───────────────────
//
// Internal redirect layer so printed QR codes stay useful even when their
// destination changes. The public slug is `/qr/{code}` served by a Next.js
// route handler, which calls the scan endpoint below for resolution + scan
// logging, then issues a 302. Validation + logging live in the API so the
// business rules don't leak into the web layer.

const QR_CODE_MAX_LEN = 64;
const QR_TITLE_MAX_LEN = 200;
const QR_DEST_MAX_LEN = 2048;
const QR_NOTES_MAX_LEN = 2000;
const QR_STORE_MAX_LEN = 200;
const QR_VARIANT_MAX_LEN = 64;
const QR_CODE_REGEX = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;
const QR_MEDIA_TYPES = ["card", "poster"] as const;
type QrMediaType = (typeof QR_MEDIA_TYPES)[number];

/** Window (seconds) in which repeat scans from the same code + UA + country
 *  collapse into the prior log row instead of being inserted as new ones.
 *  Designed for the most common duplicate-source pattern: a real user double-
 *  taps the QR (camera fires twice, browser hits the redirect twice), or an
 *  unfurler / preview bot retries within a few seconds. The destination URL
 *  the user lands on is unchanged, only the scan log is deduped. */
const QR_SCAN_DEDUPE_WINDOW_SECONDS = 30;

/** Default page size for the admin scan log. Chosen to keep the first render
 *  dense without dragging the page-one payload past a sensible size. */
const QR_SCAN_PAGE_SIZE = 25;
/** Hard cap on the `limit` query param for the paginated scan log. Keeps a
 *  stray `?limit=100000` from fetching the entire table. */
const QR_SCAN_MAX_PAGE_SIZE = 200;

type QrScanRow = {
  id: string;
  scanned_at: string;
  country: string | null;
  city: string | null;
  region: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  timezone: string | null;
};

/** User-agent substrings that identify link-preview / unfurler / crawler
 *  traffic we don't want to count as scans. We still resolve the redirect
 *  for these clients so previews work, we just don't insert a scan row.
 *  Substrings are matched case-insensitively against the full UA string. */
const QR_BOT_UA_SUBSTRINGS = [
  "slackbot",
  "discordbot",
  "telegrambot",
  "twitterbot",
  "facebookexternalhit",
  "facebot",
  "linkedinbot",
  "whatsapp",
  "skypeuripreview",
  "googlebot",
  "bingbot",
  "duckduckbot",
  "yandexbot",
  "baiduspider",
  "applebot",
  "embedly",
  "redditbot",
  "pinterest",
  "msnbot",
  "ahrefsbot",
  "semrushbot",
  "mj12bot",
  "petalbot",
  "headlesschrome",
  "phantomjs",
  "curl/",
  "wget/",
  "python-requests",
  "node-fetch",
];

/** Returns true if the UA looks like a bot/preview crawler we should not log
 *  as a scan. Conservative on purpose, real Chrome/Safari/Firefox UAs do not
 *  match any of these substrings. */
function looksLikeBotUserAgent(ua: string | null): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  for (const needle of QR_BOT_UA_SUBSTRINGS) {
    if (lower.includes(needle)) return true;
  }
  return false;
}

function normalizeMediaType(raw: unknown): QrMediaType | null | "INVALID" {
  // null/empty string => clear; valid known value => set; anything else => sentinel
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return "INVALID";
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if ((QR_MEDIA_TYPES as readonly string[]).includes(trimmed)) return trimmed as QrMediaType;
  return "INVALID";
}

function normalizeFreeFormString(raw: unknown, maxLen: number): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

/** Validate a destination URL submitted by a super admin. Rejects anything
 *  that isn't an absolute http/https URL so we can't ship a poster that
 *  redirects to `javascript:` or `data:` schemes. Returns the normalized
 *  URL string on success, or null on failure. */
function validateQrDestinationUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > QR_DEST_MAX_LEN) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

function normalizeQrCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  if (!QR_CODE_REGEX.test(trimmed)) return null;
  return trimmed;
}

type QrRedirectRow = {
  id: string;
  code: string;
  title: string;
  destination_url: string;
  notes: string | null;
  is_active: boolean;
  media_type: QrMediaType | null;
  assigned_store: string | null;
  campaign_variant: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
};

/** GET /admin/qr-redirects, list, with per-record scan summary. The `q`
 *  search term is matched case-insensitively against `code`, `title`, and
 *  `assigned_store` so the admin search box is one box covering the three
 *  fields someone is most likely to type. Filtering by media_type / store /
 *  active / used is done client-side off the same payload, the result set is
 *  bounded to 500 rows which is plenty for the QR inventory. */
app.get("/admin/qr-redirects", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  try {
    const q = c.req.query("q")?.trim().toUpperCase() || null;
    const likePattern = q ? `%${q}%` : null;
    const rows = likePattern
      ? (await sql`
          SELECT r.id, r.code, r.title, r.destination_url, r.notes, r.is_active,
                 r.media_type, r.assigned_store, r.campaign_variant,
                 r.created_at, r.updated_at, r.created_by,
                 COALESCE(s.scan_count, 0)::int AS scan_count,
                 s.last_scanned_at
          FROM newchums.qr_redirects r
          LEFT JOIN (
            SELECT qr_redirect_id,
                   COUNT(*) AS scan_count,
                   MAX(scanned_at) AS last_scanned_at
            FROM newchums.qr_redirect_scans
            GROUP BY qr_redirect_id
          ) s ON s.qr_redirect_id = r.id
          WHERE r.code LIKE ${likePattern}
             OR UPPER(r.title) LIKE ${likePattern}
             OR UPPER(COALESCE(r.assigned_store, '')) LIKE ${likePattern}
          ORDER BY r.created_at DESC
          LIMIT 500
        `) as (QrRedirectRow & { scan_count: number; last_scanned_at: string | null })[]
      : (await sql`
          SELECT r.id, r.code, r.title, r.destination_url, r.notes, r.is_active,
                 r.media_type, r.assigned_store, r.campaign_variant,
                 r.created_at, r.updated_at, r.created_by,
                 COALESCE(s.scan_count, 0)::int AS scan_count,
                 s.last_scanned_at
          FROM newchums.qr_redirects r
          LEFT JOIN (
            SELECT qr_redirect_id,
                   COUNT(*) AS scan_count,
                   MAX(scanned_at) AS last_scanned_at
            FROM newchums.qr_redirect_scans
            GROUP BY qr_redirect_id
          ) s ON s.qr_redirect_id = r.id
          ORDER BY r.created_at DESC
          LIMIT 500
        `) as (QrRedirectRow & { scan_count: number; last_scanned_at: string | null })[];
    return c.json({ ok: true, items: rows });
  } catch (err) {
    console.error("[GET /admin/qr-redirects]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /admin/qr-redirects, create a new redirect. */
app.post("/admin/qr-redirects", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  try {
    const body = await c.req.json() as {
      code?: unknown; title?: unknown; destination_url?: unknown;
      notes?: unknown; is_active?: unknown;
      media_type?: unknown; assigned_store?: unknown; campaign_variant?: unknown;
    };
    const code = normalizeQrCode(body.code);
    if (!code) return c.json({ ok: false, error: "INVALID_CODE", message: "Code must be 2–64 chars of A–Z, 0–9, '-' or '_' and start with an alphanumeric." }, 400);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > QR_TITLE_MAX_LEN) return c.json({ ok: false, error: "INVALID_TITLE" }, 400);
    const destination = validateQrDestinationUrl(body.destination_url);
    if (!destination) return c.json({ ok: false, error: "INVALID_DESTINATION", message: "Destination must be an absolute http(s) URL." }, 400);
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, QR_NOTES_MAX_LEN) || null : null;
    const isActive = body.is_active !== false;

    const mediaType = normalizeMediaType(body.media_type);
    if (mediaType === "INVALID") return c.json({ ok: false, error: "INVALID_MEDIA_TYPE", message: "Media type must be 'card', 'poster', or empty." }, 400);
    const assignedStore = normalizeFreeFormString(body.assigned_store, QR_STORE_MAX_LEN);
    const campaignVariant = normalizeFreeFormString(body.campaign_variant, QR_VARIANT_MAX_LEN);

    const existing = (await sql`SELECT id FROM newchums.qr_redirects WHERE code = ${code} LIMIT 1`) as { id: string }[];
    if (existing.length > 0) return c.json({ ok: false, error: "CODE_TAKEN", message: "A QR redirect with that code already exists." }, 409);

    const inserted = (await sql`
      INSERT INTO newchums.qr_redirects (
        code, title, destination_url, notes, is_active,
        media_type, assigned_store, campaign_variant, created_by
      )
      VALUES (
        ${code}, ${title}, ${destination}, ${notes}, ${isActive},
        ${mediaType}, ${assignedStore}, ${campaignVariant}, ${admin.id}
      )
      RETURNING id, code, title, destination_url, notes, is_active,
                media_type, assigned_store, campaign_variant,
                created_at, updated_at, created_by
    `) as QrRedirectRow[];
    return c.json({ ok: true, item: inserted[0] });
  } catch (err) {
    console.error("[POST /admin/qr-redirects]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /admin/qr-redirects/:id, single record plus the first page of scans.
 *  Scan pagination is driven by `GET /admin/qr-redirects/:id/scans`; this
 *  endpoint returns the first page so the initial render is a single round
 *  trip. */
app.get("/admin/qr-redirects/:id", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const id = c.req.param("id");
  try {
    const rows = (await sql`
      SELECT id, code, title, destination_url, notes, is_active,
             media_type, assigned_store, campaign_variant,
             created_at, updated_at, created_by
      FROM newchums.qr_redirects WHERE id = ${id} LIMIT 1
    `) as QrRedirectRow[];
    if (!rows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const [summary] = (await sql`
      SELECT COUNT(*)::int AS scan_count, MAX(scanned_at) AS last_scanned_at
      FROM newchums.qr_redirect_scans WHERE qr_redirect_id = ${id}
    `) as { scan_count: number; last_scanned_at: string | null }[];

    const recentScans = (await sql`
      SELECT id, scanned_at, country, city, region, latitude, longitude, timezone
      FROM newchums.qr_redirect_scans
      WHERE qr_redirect_id = ${id}
      ORDER BY scanned_at DESC
      LIMIT ${QR_SCAN_PAGE_SIZE}
    `) as QrScanRow[];

    return c.json({
      ok: true,
      item: rows[0],
      scan_count: summary?.scan_count ?? 0,
      last_scanned_at: summary?.last_scanned_at ?? null,
      recent_scans: recentScans,
      scan_page_size: QR_SCAN_PAGE_SIZE,
      scan_has_more: (summary?.scan_count ?? 0) > recentScans.length,
    });
  } catch (err) {
    console.error("[GET /admin/qr-redirects/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /admin/qr-redirects/:id/scans?offset=N&limit=M
 *
 *  Paginated scan log. The list view caps `limit` at QR_SCAN_MAX_PAGE_SIZE
 *  so a malicious/typo caller can't ask for 100k rows in one shot. The
 *  response carries `has_more` (derived from `total`) so the client can
 *  render a Load-more affordance without a separate count request. */
app.get("/admin/qr-redirects/:id/scans", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const id = c.req.param("id");
  const limitRaw = Number(c.req.query("limit"));
  const offsetRaw = Number(c.req.query("offset"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(Math.floor(limitRaw), QR_SCAN_MAX_PAGE_SIZE)
    : QR_SCAN_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  try {
    const exists = (await sql`SELECT id FROM newchums.qr_redirects WHERE id = ${id} LIMIT 1`) as { id: string }[];
    if (!exists[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    const [countRow] = (await sql`
      SELECT COUNT(*)::int AS total
      FROM newchums.qr_redirect_scans
      WHERE qr_redirect_id = ${id}
    `) as { total: number }[];
    const total = countRow?.total ?? 0;

    const scans = (await sql`
      SELECT id, scanned_at, country, city, region, latitude, longitude, timezone
      FROM newchums.qr_redirect_scans
      WHERE qr_redirect_id = ${id}
      ORDER BY scanned_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as QrScanRow[];

    return c.json({
      ok: true,
      scans,
      total,
      limit,
      offset,
      has_more: offset + scans.length < total,
    });
  } catch (err) {
    console.error("[GET /admin/qr-redirects/:id/scans]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PATCH /admin/qr-redirects/:id, update fields. Accepts any subset. The
 *  three operational metadata fields (`media_type`, `assigned_store`,
 *  `campaign_variant`) follow the same convention as `notes`: explicit
 *  `null` (or empty string after trim) clears the value, an absent key
 *  leaves it untouched. This lets the admin "unassign" a code from a store
 *  by editing the field to empty without needing a dedicated endpoint. */
app.patch("/admin/qr-redirects/:id", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const id = c.req.param("id");
  try {
    const body = await c.req.json() as {
      code?: unknown; title?: unknown; destination_url?: unknown;
      notes?: unknown; is_active?: unknown;
      media_type?: unknown; assigned_store?: unknown; campaign_variant?: unknown;
    };
    const existing = (await sql`SELECT id, code FROM newchums.qr_redirects WHERE id = ${id} LIMIT 1`) as { id: string; code: string }[];
    if (!existing[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);

    let nextCode: string | null = null;
    if (body.code !== undefined) {
      nextCode = normalizeQrCode(body.code);
      if (!nextCode) return c.json({ ok: false, error: "INVALID_CODE" }, 400);
      if (nextCode !== existing[0].code) {
        const dup = (await sql`SELECT id FROM newchums.qr_redirects WHERE code = ${nextCode} AND id != ${id} LIMIT 1`) as { id: string }[];
        if (dup.length > 0) return c.json({ ok: false, error: "CODE_TAKEN" }, 409);
      }
    }

    let nextTitle: string | null = null;
    if (body.title !== undefined) {
      if (typeof body.title !== "string") return c.json({ ok: false, error: "INVALID_TITLE" }, 400);
      nextTitle = body.title.trim();
      if (!nextTitle || nextTitle.length > QR_TITLE_MAX_LEN) return c.json({ ok: false, error: "INVALID_TITLE" }, 400);
    }

    let nextDest: string | null = null;
    if (body.destination_url !== undefined) {
      nextDest = validateQrDestinationUrl(body.destination_url);
      if (!nextDest) return c.json({ ok: false, error: "INVALID_DESTINATION" }, 400);
    }

    // notes: null clears, string sets
    const touchesNotes = body.notes !== undefined;
    const nextNotes = touchesNotes
      ? (typeof body.notes === "string" ? body.notes.trim().slice(0, QR_NOTES_MAX_LEN) || null : null)
      : null;

    const touchesActive = body.is_active !== undefined;
    const nextActive = touchesActive ? (body.is_active !== false) : null;

    const touchesMedia = body.media_type !== undefined;
    let nextMedia: QrMediaType | null = null;
    if (touchesMedia) {
      const parsed = normalizeMediaType(body.media_type);
      if (parsed === "INVALID") return c.json({ ok: false, error: "INVALID_MEDIA_TYPE" }, 400);
      nextMedia = parsed;
    }

    const touchesStore = body.assigned_store !== undefined;
    const nextStore = touchesStore ? normalizeFreeFormString(body.assigned_store, QR_STORE_MAX_LEN) : null;

    const touchesVariant = body.campaign_variant !== undefined;
    const nextVariant = touchesVariant ? normalizeFreeFormString(body.campaign_variant, QR_VARIANT_MAX_LEN) : null;

    const updated = (await sql`
      UPDATE newchums.qr_redirects
      SET
        code = COALESCE(${nextCode}, code),
        title = COALESCE(${nextTitle}, title),
        destination_url = COALESCE(${nextDest}, destination_url),
        notes = CASE WHEN ${touchesNotes}::boolean THEN ${nextNotes} ELSE notes END,
        is_active = CASE WHEN ${touchesActive}::boolean THEN ${nextActive}::boolean ELSE is_active END,
        media_type = CASE WHEN ${touchesMedia}::boolean THEN ${nextMedia} ELSE media_type END,
        assigned_store = CASE WHEN ${touchesStore}::boolean THEN ${nextStore} ELSE assigned_store END,
        campaign_variant = CASE WHEN ${touchesVariant}::boolean THEN ${nextVariant} ELSE campaign_variant END,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, code, title, destination_url, notes, is_active,
                media_type, assigned_store, campaign_variant,
                created_at, updated_at, created_by
    `) as QrRedirectRow[];
    return c.json({ ok: true, item: updated[0] });
  } catch (err) {
    console.error("[PATCH /admin/qr-redirects/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** DELETE /admin/qr-redirects/:id, hard delete; scans cascade. */
app.delete("/admin/qr-redirects/:id", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const id = c.req.param("id");
  try {
    const existing = (await sql`SELECT id FROM newchums.qr_redirects WHERE id = ${id} LIMIT 1`) as { id: string }[];
    if (!existing[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    await sql`DELETE FROM newchums.qr_redirects WHERE id = ${id}`;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /admin/qr-redirects/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** DELETE /admin/qr-redirects/:id/scans/:scanId, remove a single scan row.
 *  Hard delete, no confirmation on the server side (the UI matches). Used
 *  mainly to keep the scan table tidy during testing. */
app.delete("/admin/qr-redirects/:id/scans/:scanId", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  const redirectId = c.req.param("id");
  const scanId = c.req.param("scanId");
  try {
    const existing = (await sql`
      SELECT id FROM newchums.qr_redirect_scans
      WHERE id = ${scanId} AND qr_redirect_id = ${redirectId}
      LIMIT 1
    `) as { id: string }[];
    if (!existing[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    await sql`DELETE FROM newchums.qr_redirect_scans WHERE id = ${scanId}`;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /admin/qr-redirects/:id/scans/:scanId]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** DELETE /admin/qr-redirect-scans, wipe every scan row across every QR
 *  code. Destructive but reversible only by re-scanning; intended for
 *  pre-launch testing when operators are validating every printed
 *  poster and card, which otherwise leaves hundreds of real test scans
 *  on the inventory. The client gates this behind a confirm dialog.
 *
 *  Uses a sibling resource path (`qr-redirect-scans`) rather than the
 *  nested `qr-redirects/:id/scans` convention so the URL can never be
 *  mis-routed through the `:id` parameter match. Returns the number of
 *  deleted rows so the success toast can be specific.
 */
app.delete("/admin/qr-redirect-scans", async (c) => {
  const admin = await requireSuperAdmin(c);
  if (!admin) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
  const sql = getSql(c.env);
  try {
    const deletedRows = (await sql`
      DELETE FROM newchums.qr_redirect_scans RETURNING id
    `) as { id: string }[];
    return c.json({ ok: true, deleted: deletedRows.length });
  } catch (err) {
    console.error("[DELETE /admin/qr-redirect-scans]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /public/qr/:code/scan, resolve a code + log the scan. Called by the
 *  Next.js /qr/[code] route handler (server-side) so the web layer stays a
 *  thin pass-through. Returns the destination URL when active, or
 *  { ok: false, error: "NOT_FOUND" | "INACTIVE" } so the caller can route to
 *  a sensible fallback page instead of a broken destination. Scan metadata
 *  (user-agent, referer, country) is trusted from the caller, this route is
 *  not exposed on the public API contract beyond the /qr/ path.
 *
 *  No auth: QR codes are designed to be scanned by anyone.
 *
 *  Scan-count trustworthiness:
 *
 *    1. **Bot / preview filter.** If the inbound UA matches any known
 *       link-preview / unfurler / generic crawler substring, we still resolve
 *       the redirect (so previews keep working) but we do NOT insert a scan
 *       row. Without this, sharing a QR URL in Slack/Discord/iMessage tripled
 *       the count for a single real-world scan.
 *
 *    2. **Short-window dedupe.** If a scan from the same code + UA + country
 *       was logged within the last QR_SCAN_DEDUPE_WINDOW_SECONDS, treat the
 *       new request as the same scan and skip the insert. This collapses the
 *       browser's HEAD-then-GET pre-check pattern and a real user double-
 *       tapping the camera. We deliberately do NOT extend the window beyond
 *       ~30s, otherwise a legitimate "user revisits the poster a minute
 *       later" would be silently dropped, which is real engagement.
 *
 *  Both behaviors are intentionally conservative. The `redirect` itself is
 *  never affected, only what we record in the scan log.
 */
app.post("/public/qr/:code/scan", async (c) => {
  const sql = getSql(c.env);
  const code = normalizeQrCode(c.req.param("code"));
  if (!code) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
  try {
    const rows = (await sql`
      SELECT id, destination_url, is_active
      FROM newchums.qr_redirects WHERE code = ${code} LIMIT 1
    `) as { id: string; destination_url: string; is_active: boolean }[];
    if (!rows[0]) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (!rows[0].is_active) return c.json({ ok: false, error: "INACTIVE" }, 410);

    let meta: {
      userAgent?: unknown;
      referer?: unknown;
      country?: unknown;
      city?: unknown;
      region?: unknown;
      latitude?: unknown;
      longitude?: unknown;
      timezone?: unknown;
      skipLog?: unknown;
    } = {};
    try { meta = await c.req.json(); } catch { /* metadata is optional */ }

    const ua = typeof meta.userAgent === "string" ? meta.userAgent.slice(0, 500) : null;
    const ref = typeof meta.referer === "string" ? meta.referer.slice(0, 500) : null;
    const country = typeof meta.country === "string" ? meta.country.slice(0, 8) : null;
    // City / region / timezone are CF-supplied strings; cap generously so a
    // malicious caller can't blow out the row size. Coordinates arrive as
    // numbers but we accept numeric strings defensively and clamp the DB
    // NUMERIC(8,5) range to a safe float before inserting.
    const city = typeof meta.city === "string" ? meta.city.slice(0, 200) : null;
    const region = typeof meta.region === "string" ? meta.region.slice(0, 200) : null;
    const timezone = typeof meta.timezone === "string" ? meta.timezone.slice(0, 100) : null;
    const pickLatLon = (raw: unknown, bound: number): number | null => {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : null;
      if (n === null || !Number.isFinite(n)) return null;
      if (n < -bound || n > bound) return null;
      return Math.round(n * 1e5) / 1e5;
    };
    const latitude = pickLatLon(meta.latitude, 90);
    const longitude = pickLatLon(meta.longitude, 180);
    // The Next.js handler sets skipLog: true for HEAD pre-flights so they
    // can resolve without ever reaching the dedupe layer.
    const callerSkipLog = meta.skipLog === true;

    const shouldLog = !callerSkipLog && !looksLikeBotUserAgent(ua);

    // Log opportunistically. Never block the redirect on a log write failure;
    // a working redirect matters more than a perfect scan count.
    if (shouldLog) {
      try {
        // Short-window dedupe: skip insert if an identical (code, UA, country)
        // scan landed within QR_SCAN_DEDUPE_WINDOW_SECONDS. We compare on the
        // exact UA string the caller sent (after our 500-char truncation),
        // which is good enough to collapse the common "HEAD then GET" /
        // "double-tap" pattern without dropping unrelated scans that happen
        // to share a country.
        const recent = (await sql`
          SELECT id FROM newchums.qr_redirect_scans
          WHERE qr_redirect_id = ${rows[0].id}
            AND scanned_at > NOW() - (${QR_SCAN_DEDUPE_WINDOW_SECONDS}::int * INTERVAL '1 second')
            AND user_agent IS NOT DISTINCT FROM ${ua}
            AND country IS NOT DISTINCT FROM ${country}
          ORDER BY scanned_at DESC
          LIMIT 1
        `) as { id: string }[];
        if (recent.length === 0) {
          await sql`
            INSERT INTO newchums.qr_redirect_scans
              (qr_redirect_id, user_agent, referer, country, city, region, latitude, longitude, timezone)
            VALUES
              (${rows[0].id}, ${ua}, ${ref}, ${country}, ${city}, ${region}, ${latitude}, ${longitude}, ${timezone})
          `;
        }
      } catch (logErr) {
        console.error("[POST /public/qr/:code/scan] scan-log failed", logErr);
      }
    }

    return c.json({ ok: true, destinationUrl: rows[0].destination_url });
  } catch (err) {
    console.error("[POST /public/qr/:code/scan]", err);
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
           e.location_type, e.location_name, e.location_address, e.location_visibility, e.location_area, e.online_link,
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
    location_visibility: string | null; location_area: string | null;
    online_link: string | null; is_qa: boolean;
  }>;

  for (const ev of eventsNeedingInitialSend) {
    try {
      const goingRsvps = (await sql`
        SELECT er.user_id, u.email, u.name, u.username,
               COALESCE(ec.reminder_count, 0) AS reminder_count
        FROM newchums.event_rsvps er
        JOIN newchums.users u ON u.id = er.user_id
        LEFT JOIN newchums.event_confirmations ec
          ON ec.event_id = er.event_id AND ec.user_id = er.user_id
        WHERE er.event_id = ${ev.id} AND er.status = 'going'
      `) as Array<{ user_id: string; email: string; name: string | null; username: string | null; reminder_count: number }>;

      for (const att of goingRsvps) {
        await sql`
          INSERT INTO newchums.event_confirmations (event_id, user_id, status)
          VALUES (${ev.id}, ${att.user_id}, 'pending')
          ON CONFLICT (event_id, user_id) WHERE user_id IS NOT NULL DO NOTHING
        `;
      }

      const tz = ev.timezone || "UTC";
      const cutoffAt = new Date(new Date(ev.starts_at).getTime() - Number(ev.confirmation_cutoff_hours) * 3600000);
      const deadline = formatEventDate(cutoffAt.toISOString(), tz);
      const eventDate = formatEventDate(ev.starts_at, tz);
      const eventUrl = `${env.WEB_BASE_URL}/events/${ev.id}`;

      const goingUserIds = goingRsvps.map((a) => a.user_id);
      const prefsMap = await batchLoadNotificationPrefs(sql, goingUserIds);

      // QA plans: only send emails/notifications to super admin recipients
      const qaAdminIds = ev.is_qa ? await batchLoadSuperAdminIds(sql, goingUserIds) : null;

      for (const att of goingRsvps) {
        // Idempotency: skip recipients who already received the initial email on
        // a prior cron attempt. reminder_count is bumped to 1 only after a
        // successful send, so this correctly retries failed recipients without
        // double-sending successful ones.
        if (att.reminder_count >= 1) continue;
        // QA plan isolation: skip non-super-admin recipients
        if (qaAdminIds && !qaAdminIds.has(att.user_id)) continue;

        const prefs = normalizeNotificationPrefs(prefsMap.get(att.user_id));
        if (prefs.items.attendance_confirmation?.enabled === false) continue;

        try {
          const ctaUrl = `${eventUrl}?section=confirmation`;
          const isHost = att.user_id === ev.host_user_id;
          const recipientName = att.name?.trim() || att.username?.replace(/^@/, "") || "there";

          // Location per plan-page rule: host always sees exact, joined
          // attendees see exact for exact_everyone / exact_joined_only and
          // approximate for approximate_only.
          const eventLocation = buildEmailEventLocation(ev, isHost ? "host" : "joined");

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

      // Mark the event as processed for Phase 1. Stamped at the very end of the
      // per-event block so that a throw in any of the steps above leaves
      // confirmation_sent_at NULL and the next cron tick retries the event. The
      // per-recipient reminder_count gates above ensure retries don't
      // double-send to recipients who already received the initial email.
      await sql`UPDATE newchums.events SET confirmation_sent_at = NOW() WHERE id = ${ev.id}`;
    } catch (err) {
      console.error(`[attendance-assurance] initial send failed for event ${ev.id}:`, err);
    }
  }

  // Phase 2: Send follow-up reminders to pending confirmations
  const eventsWithPending = (await sql`
    SELECT DISTINCT e.id, e.host_user_id, e.title, e.starts_at, e.timezone,
           e.confirmation_cutoff_hours, e.location_type, e.location_name,
           e.location_address, e.location_visibility, e.location_area, e.online_link,
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
    location_address: string | null; location_visibility: string | null;
    location_area: string | null; online_link: string | null; is_qa: boolean;
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

          // Location per plan-page rule, same as Phase 1.
          const eventLocation = buildEmailEventLocation(ev, isHost ? "host" : "joined");

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

    } catch (err) {
      console.error(`[attendance-assurance] reminder failed for event ${ev.id}:`, err);
    }
  }

  // Phase 3: Process cutoffs, expire pending confirmations and evaluate viability
  const eventsAtCutoff = (await sql`
    SELECT e.id, e.host_user_id, e.title, e.starts_at, e.timezone,
           e.confirmation_cutoff_hours, e.min_confirmed_attendees, e.fallback_policy,
           e.location_type, e.location_name, e.location_address, e.location_visibility, e.location_area, e.online_link,
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
    location_address: string | null; location_visibility: string | null;
    location_area: string | null; online_link: string | null;
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

        // QA plans: only notify super admin attendees
        const qaCancelAdminIds = ev.is_qa ? await batchLoadSuperAdminIds(sql, attendees.map((a) => a.user_id)) : null;

        for (const att of attendees) {
          if (qaCancelAdminIds && !qaCancelAdminIds.has(att.user_id)) continue;
          try {
            const recipientName = att.name?.trim() || att.username?.replace(/^@/, "") || "there";
            // Location per plan-page rule: recipient was a going/maybe
            // attendee at the moment of auto-cancel. Role = "joined"
            // (or "host" if they happen to be the host, who's in the
            // attendees set too).
            const isHost = att.user_id === ev.host_user_id;
            const cancelEventLocation = buildEmailEventLocation(ev, isHost ? "host" : "joined");
            const unsubToken = await createUnsubscribeToken(env.NEXTAUTH_SECRET, att.user_id, "event_changed_canceled");
            await sendPlanAutoCancelledEmail(env, {
              to: att.email, recipientName, eventTitle: ev.title,
              eventUrl: `${env.WEB_BASE_URL}/events/${ev.id}`,
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
            // Recipient is the host: always sees exact.
            const eventLocation = buildEmailEventLocation(ev, "host");
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

  // Phase 4: RSVP-based "minimum attendees required" auto-cancel.
  //
  // Distinct from Phase 3 above:
  //   Phase 3 evaluates min_confirmed_attendees against the 24-hour
  //   attendance check confirmations and only fires when require_reconfirmation
  //   is on and fallback_policy = 'auto_cancel'.
  //   Phase 4 evaluates min_attendees_required against raw "going" RSVPs
  //   and fires for any plan with min_attendees_required set, independent
  //   of the 24-hour attendance check.
  //
  // Cutoff is a fixed 2 hours before starts_at, matching the default
  // confirmation_cutoff_hours and the wording shown on the plan-detail page
  // and in form helper text.
  //
  // Dedup: the WHERE clause filters to status = 'published'. If Phase 3
  // already cancelled the same plan in the same cron tick, the row is now
  // 'canceled' and falls out here, so attendees never get two cancellation
  // emails. The same gate protects against any future auto-cancel reason
  // running in the same tick.
  const eventsAtMinAttendeesCutoff = (await sql`
    SELECT e.id, e.host_user_id, e.title, e.starts_at, e.timezone,
           e.min_attendees_required,
           e.location_type, e.location_name, e.location_address,
           e.location_visibility, e.location_area, e.online_link,
           COALESCE(e.is_qa, false) AS is_qa,
           (SELECT COUNT(*)::int FROM newchums.event_rsvps er
              WHERE er.event_id = e.id AND er.status = 'going') AS going_count
    FROM newchums.events e
    WHERE e.min_attendees_required IS NOT NULL
      AND e.status = 'published'
      AND e.starts_at > NOW()
      AND e.starts_at - INTERVAL '2 hours' <= NOW()
  `) as Array<{
    id: string; host_user_id: string; title: string; starts_at: string;
    timezone: string | null; min_attendees_required: number;
    location_type: string; location_name: string | null;
    location_address: string | null; location_visibility: string | null;
    location_area: string | null; online_link: string | null;
    is_qa: boolean; going_count: number;
  }>;

  for (const ev of eventsAtMinAttendeesCutoff) {
    try {
      const minRequired = Number(ev.min_attendees_required);
      const goingCount = Number(ev.going_count);
      if (goingCount >= minRequired) continue;

      // Cancel-and-claim: only flip to 'canceled' if still 'published'. A
      // concurrent cancel (host-cancel, Phase 3 auto-cancel, or another cron
      // worker) would have already moved status forward, so the UPDATE
      // returns 0 rows and we skip the email batch entirely. This keeps the
      // dedup guarantee even under overlap.
      const claimed = (await sql`
        UPDATE newchums.events
        SET status = 'canceled', canceled_at = NOW(),
            cancellation_reason = 'min_attendees_required_not_met', updated_at = NOW()
        WHERE id = ${ev.id} AND status = 'published'
        RETURNING id
      `) as { id: string }[];
      if (claimed.length === 0) continue;

      const attendees = (await sql`
        SELECT u.id AS user_id, u.email, u.name, u.username
        FROM newchums.event_rsvps er
        JOIN newchums.users u ON u.id = er.user_id
        WHERE er.event_id = ${ev.id} AND er.status IN ('going', 'maybe')
      `) as Array<{ user_id: string; email: string; name: string | null; username: string | null }>;

      const tz = ev.timezone || "UTC";
      const cancelEventDate = formatEventDate(ev.starts_at, tz);

      // QA plans: only notify super admin attendees
      const qaCancelAdminIds = ev.is_qa ? await batchLoadSuperAdminIds(sql, attendees.map((a) => a.user_id)) : null;

      for (const att of attendees) {
        if (qaCancelAdminIds && !qaCancelAdminIds.has(att.user_id)) continue;
        try {
          const recipientName = att.name?.trim() || att.username?.replace(/^@/, "") || "there";
          const isHost = att.user_id === ev.host_user_id;
          const cancelEventLocation = buildEmailEventLocation(ev, isHost ? "host" : "joined");
          const unsubToken = await createUnsubscribeToken(env.NEXTAUTH_SECRET, att.user_id, "event_changed_canceled");
          await sendPlanAutoCancelledEmail(env, {
            to: att.email, recipientName, eventTitle: ev.title,
            eventUrl: `${env.WEB_BASE_URL}/events/${ev.id}`,
            confirmedCount: goingCount, minRequired,
            reason: "min_attendees_required",
            eventDate: cancelEventDate, eventLocation: cancelEventLocation,
            unsubscribeUrl: `${env.WEB_BASE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
          });
        } catch { /* noop */ }
      }
    } catch (err) {
      console.error(`[attendance-assurance] min_attendees_required cancel failed for event ${ev.id}:`, err);
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
  // Community members-only gate, shared between the public and chums_only
  // UNION branches below. A community-linked plan with hide_from_explore=true
  // is only delivered to active members of that community, same semantic
  // rule as the Explore-feed query at the other site (search for cm_viewer).
  // The Explore query additionally allows an RSVP-bypass branch; the digest
  // omits that because it separately suppresses any plan the recipient
  // already has an RSVP on.
  const membersOnlyGate = sql`(
    COALESCE(e.hide_from_explore, false) = false
    OR EXISTS (
      SELECT 1 FROM newchums.event_communities ec_digest
      JOIN newchums.community_members cm_digest ON cm_digest.community_id = ec_digest.community_id
      WHERE ec_digest.event_id = e.id
        AND cm_digest.user_id = eu.user_id
        AND cm_digest.status = 'active'
    )
  )`;

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
          -- Community members-only gate (see membersOnlyGate above).
          AND ${membersOnlyGate}
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
          -- Community members-only gate (see membersOnlyGate above).
          AND ${membersOnlyGate}
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
        'prefOverrides', e.pref_overrides,
        'isQa', COALESCE(e.is_qa, false)
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
      isQa: boolean;
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

      // QA plans are intentionally hidden from the unauthenticated
      // /events/:id route (the API returns 404 for non-super-admin viewers
      // and for any logged-out viewer). A bare /events/:id link in the
      // digest email therefore lands a logged-out super-admin recipient on
      // a "Plan not found" page even though the digest only sent them the
      // QA plan because they are a super admin. Routing the QA-plan CTA
      // through /login?next=/events/:id keeps the recipient gated, and
      // after sign-in the existing safe-redirect helper returns them to
      // the plan where their session can satisfy QA isolation. Non-QA
      // plans keep the direct link so the public preview is reachable
      // for cold readers.
      const planPath = `/events/${p.eventId}`;
      const url = p.isQa
        ? `${env.WEB_BASE_URL}/login?next=${encodeURIComponent(planPath)}`
        : `${env.WEB_BASE_URL}${planPath}`;

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
        url,
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
  // Find published plans that ended 3+ hours ago but haven't had feedback emails sent
  const plans = (await sql`
    SELECT e.id, e.title, e.host_user_id,
           e.starts_at, e.timezone,
           e.location_type, e.location_name, e.location_address, e.location_visibility, e.location_area, e.online_link,
           COALESCE(e.is_qa, false) AS is_qa
    FROM newchums.events e
    WHERE e.status = 'published'
      AND e.starts_at <= NOW() - INTERVAL '3 hours'
      AND e.feedback_email_sent_at IS NULL
    ORDER BY e.starts_at ASC
    LIMIT 20
  `) as { id: string; title: string; host_user_id: string; starts_at: string; timezone: string | null; location_type: string; location_name: string | null; location_address: string | null; location_visibility: string | null; location_area: string | null; online_link: string | null; is_qa: boolean }[];

  if (plans.length === 0) return;

  let fbTotal = 0;
  let fbSkippedPref = 0;
  let fbQueued = 0;

  for (const plan of plans) {
    const tz = plan.timezone || "UTC";
    const planDate = formatEventDate(plan.starts_at, tz);

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

      // Location per plan-page rule. Host always sees exact. Going
      // attendees see exact for exact_everyone / exact_joined_only,
      // approximate for approximate_only.
      const planLocation = buildEmailEventLocation(
        plan,
        r.id === plan.host_user_id ? "host" : "joined",
      );
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
  //, i.e. no one else RSVP'd "going". `IS DISTINCT FROM` is kept as defensive
  // NULL-safety even though user_id is now NOT NULL post-guest-removal.
  const abandoned = (await sql`
    SELECT e.id
    FROM newchums.events e
    WHERE e.status = 'published'
      AND e.starts_at <= NOW()
      AND e.starts_at > NOW() - INTERVAL '2 hours'
      AND NOT EXISTS (
        SELECT 1 FROM newchums.event_rsvps er
        WHERE er.event_id = e.id
          AND er.user_id IS DISTINCT FROM e.host_user_id
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
  const BADGE_MIN_USERS = 10; // Minimum users in area for badges to be awarded (ensures gold/silver/bronze are all achievable)
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
      AND COALESCE(e.cancellation_reason, '') NOT IN ('no_attendees', 'min_attendees_required_not_met')
      AND EXISTS (
        SELECT 1 FROM newchums.event_rsvps er
        WHERE er.event_id = e.id
          AND er.user_id IS DISTINCT FROM e.host_user_id
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

    if (attendeeInArea.length >= BADGE_MIN_USERS) {
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

    if (hostInArea.length >= BADGE_MIN_USERS) {
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

  // Unread chat digest: retired. Plan chat is now silent by default; a sender
  // opts in per message ("Notify attendees") to email + in-app notify the
  // plan's attendees immediately (see POST /events/:id/chat). The recipient-side
  // unread_chat_digest pref now governs those per-message emails. The in-app
  // unread-chat surface in the notification bell is unaffected (see GET notifications).

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

  // Per-request activity log retention: keep 90 days (see migration 101 and
  // the suspension-guard middleware that writes the rows)
  try {
    await sql`DELETE FROM newchums.user_activity_log WHERE occurred_at < NOW() - INTERVAL '90 days'`;
  } catch (err) {
    console.error("[scheduled] activity log retention error:", err);
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
