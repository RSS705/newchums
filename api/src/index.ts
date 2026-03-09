import * as Sentry from "@sentry/cloudflare";
import { compareSync, hashSync } from "bcryptjs";
import { Hono } from "hono";
import { inspectRoutes } from "hono/dev";
import { isAtLeast18, parseDateOnly } from "./ageValidation";
import { getBearerToken, verifyAuthToken } from "./auth";
import { DATABASE_URL_HINT, type Bindings, getSql } from "./db";
import {
  sendChumInviteEmail,
  sendContactFormEmail,
  sendEmailChangeConfirmEmail,
  sendEmailChangeNotifyOldEmail,
  sendEmailChangeSuccessEmail,
  sendEventCanceledEmail,
  sendEventInviteEmail,
  sendEventRsvpUpdateEmail,
  sendPasswordResetEmail,
  sendRsvpConfirmationEmail,
  sendVerificationEmail,
} from "./email/send";
import { canAccessInternalTestRoute, notFound } from "./internalAccess";
import { nameToSlug, slugToName, validateInterestName } from "./interests";
import { ensureAppUserId } from "./profile";
import { generateResetToken, hashResetToken } from "./resetTokens";
import { isValidContactSubject } from "./lib/contact";
import { computeAge } from "./lib/publicProfile";
import { checkContactRateLimit } from "./lib/contactRateLimit";
import { validateCleanText } from "./lib/contentSafety";
import { verifyTurnstileToken } from "./lib/turnstile";
import {
  getDefaultPrefsJson,
  normalizeNotificationPrefs,
  validateAndMergeInput,
  VALID_KEYS,
} from "./lib/notificationPrefs";
import {
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
      SELECT is_suspended FROM users WHERE email = ${payload.email} LIMIT 1
    `) as { is_suspended: boolean }[];
    if (rows[0]?.is_suspended === true) {
      return c.json(
        { ok: false, error: { code: "USER_SUSPENDED", message: "Your account has been suspended." } },
        403,
      );
    }
  } catch {
    // If DB lookup fails, allow the request through — individual routes will fail safely.
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
  try {
    const sql = getSql(c.env);
    const userRows = (await sql`
      SELECT u.id, u.name, u.username, u.date_of_birth, u.gender, u.profile_theme,
        u.avatar_key, u.avatar_updated_at,
        COALESCE(u.is_hidden_age, false) AS is_hidden_age,
        COALESCE(u.is_hidden_from_external_indexing, false) AS is_hidden_from_external_indexing,
        COALESCE(u.is_hidden_chum_list, false) AS is_hidden_chum_list
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
    const age =
      user.is_hidden_age === true ? null : computeAge(dobStr);
    const avatarKey = user.avatar_key ?? null;
    const avatarUpdatedAt = user.avatar_updated_at;
    const avatarUrl =
      avatarKey && c.env.MEDIA_BUCKET
        ? `/users/${user.id}/avatar?v=${avatarUpdatedAt ? new Date(avatarUpdatedAt as Date).getTime() : 0}`
        : null;
    const rawUsername = (user.username ?? "").trim().replace(/^@/, "");
    const displayName = user.name?.trim() || rawUsername || "NewChums user";
    const handle = (user.username ?? "").trim();
    const publicGender =
      user.gender && user.gender !== "prefer_not_to_say" ? user.gender : null;
    return c.json({
      ok: true,
      user: {
        userId: user.id,
        displayName,
        handle: handle ? (handle.startsWith("@") ? handle : `@${handle}`) : null,
        age,
        gender: publicGender,
        profile_theme: user.profile_theme ?? null,
        bio: profile?.bio ?? null,
        hobbies: interestRows.map((r) => r.name),
        avatarUrl,
        is_hidden_from_external_indexing: user.is_hidden_from_external_indexing ?? false,
        is_hidden_chum_list: user.is_hidden_chum_list ?? false,
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
    const inserted = (await sql`
      INSERT INTO users (email, name, username, username_norm, password_hash, date_of_birth, email_verified_at)
      VALUES (${normalizedEmail}, ${normalizedName}, ${usernameDisplay}, ${usernameNorm}, ${passwordHash}, ${parsedDob}, NULL)
      RETURNING id
    `) as { id: string }[];
    const newUserId = inserted[0]?.id;
    if (newUserId) {
      const defaultPrefsJson = getDefaultPrefsJson();
      await sql`
        INSERT INTO user_profile (user_id, home_city, home_lat, home_lng, home_location, travel_radius_km, email_chat_digest, email_new_events, bio, notification_prefs)
        VALUES (${newUserId}, NULL, NULL, NULL, NULL, 25, true, true, NULL, ${defaultPrefsJson}::jsonb)
      `;
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
    return c.json({ verified: false });
  }

  const sql = getSql(c.env);
  const rows = (await sql`
    SELECT email_verified_at FROM users WHERE email = ${email} LIMIT 1
  `) as { email_verified_at: string | null }[];
  if (rows.length === 0) {
    return c.json({ verified: false });
  }
  return c.json({ verified: !!rows[0].email_verified_at });
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
          SELECT id, name, slug
          FROM interests
          WHERE LOWER(name) LIKE ${likePattern}
            AND (is_deleted IS NULL OR is_deleted = false)
          ORDER BY name ASC
          LIMIT 20
        `) as { id: string; name: string; slug: string }[])
      : ((await sql`
          SELECT id, name, category, slug, sort_order
          FROM interests
          WHERE is_deleted IS NULL OR is_deleted = false
          ORDER BY sort_order ASC, name ASC
        `) as {
          id: string;
          name: string;
          category: string;
          slug: string;
          sort_order: number;
        }[]);
    return c.json({
      ok: true,
      interests: rows.map((r) =>
        "category" in r
          ? { id: r.id, name: r.name, category: r.category, slug: r.slug, sort_order: r.sort_order }
          : { id: r.id, name: r.name, slug: r.slug },
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
        VALUES (${appUserId}, NULL, NULL, NULL, NULL, 25, true, true, NULL, ${prefsJson}::jsonb)
        ON CONFLICT (user_id) DO UPDATE SET notification_prefs = EXCLUDED.notification_prefs
      `;
    }
    return c.json({ ok: true, prefs });
  } catch (err) {
    console.error("[PUT /notification-preferences]", err);
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
        COALESCE(is_hidden_from_chum_lists, false) AS is_hidden_from_chum_lists
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
    }>;
    const userInfo = userRows[0];
    const profileRows = (await sql`
      SELECT home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events, bio
      FROM user_profile WHERE user_id = ${appUserId} LIMIT 1
    `) as Array<{
      home_city: string | null;
      home_lat: number | null;
      home_lng: number | null;
      travel_radius_km: number;
      email_chat_digest: boolean;
      email_new_events: boolean;
      bio?: string | null;
    }>;
    const profile = profileRows[0];
    const interestRows = (await sql`
      SELECT i.slug, i.name
      FROM user_interests ui
      JOIN interests i ON i.id = ui.interest_id
      WHERE ui.user_id = ${appUserId}
      ORDER BY i.sort_order, i.name
    `) as { slug: string; name: string }[];
    const interest_items = interestRows.map((r) => ({ slug: r.slug, name: r.name }));
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
    // different API (e.g. prod when sharing DB), so we don't check R2 here—avoids empty avatar_url
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
    const role = userInfo?.role ?? null;
    const gender = userInfo?.gender ?? null;
    const profileTheme = userInfo?.profile_theme ?? null;

    if (!profile) {
      return c.json({
        ok: true,
        profile: {
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
          travel_radius_km: 25,
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
          role,
        },
      });
    }
    return c.json({
      ok: true,
      profile: {
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
      travel_radius_km: number;
      email_chat_digest: boolean;
      email_new_events: boolean;
      bio?: string | null;
    }>;
    const existing = existingRows[0];
    const travel_radius_km =
      "travel_radius_km" in body && body.travel_radius_km != null
        ? Number(body.travel_radius_km)
        : (existing?.travel_radius_km ?? 25);
    if (
      !Number.isFinite(travel_radius_km) ||
      travel_radius_km < 1 ||
      travel_radius_km > 200
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
    const nameBySlug = new Map<string, string>();
    if (Array.isArray(rawInterestItems)) {
      for (const it of rawInterestItems) {
        const slug = it?.slug != null ? nameToSlug(String(it.slug).trim()) : "";
        const name = it?.name != null ? String(it.name).trim() : "";
        if (slug && name) nameBySlug.set(slug.toLowerCase(), name);
      }
    }
    if (rawInterestSlugs !== null) {
      const normalized = rawInterestSlugs
        .map((s) => nameToSlug(String(s).trim()))
        .filter((s) => s.length > 0);
      finalInterestSlugs = [...new Set(normalized)];
      for (const slug of finalInterestSlugs) {
        const nameForValidation = nameBySlug.get(slug.toLowerCase()) ?? slugToName(slug);
        const v = validateInterestName(nameForValidation);
        if (!v.valid) {
          return c.json(
            { ok: false, error: { code: "INVALID_INPUT", message: v.error } },
            400,
          );
        }
        const hobbyCheck = validateCleanText(nameForValidation, "hobby");
        if (!hobbyCheck.ok) {
          return c.json(
            { ok: false, error: { code: "INAPPROPRIATE_TEXT", field: "hobby", message: hobbyCheck.reason } },
            400,
          );
        }
      }
      // Resolve each user-submitted slug to an active interest, handling soft-deleted
      // and merged interests. We intentionally preserve user-provided casing for new interests.
      const existingRows = (await sql`
        SELECT id, name, slug, is_deleted, merged_into_interest_id
        FROM interests
        WHERE LOWER(slug) = ANY(${finalInterestSlugs.map((s) => s.toLowerCase())})
      `) as { id: string; name: string; slug: string; is_deleted: boolean; merged_into_interest_id: string | null }[];
      const existingBySlug = new Map(existingRows.map((r) => [r.slug.toLowerCase(), r]));

      // Pre-fetch any merge targets so we can remap deleted->canonical in one pass
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
      for (const slug of finalInterestSlugs) {
        const existing = existingBySlug.get(slug.toLowerCase());
        if (!existing) {
          // Truly new interest: create it
          const name = (nameBySlug.get(slug.toLowerCase()) ?? slugToName(slug)).trim().replace(/\s+/g, " ");
          try {
            await sql`
              INSERT INTO interests (name, category, slug, sort_order, is_seed, created_by_user_id)
              VALUES (${name}, '', ${slug}, 0, false, ${appUserId})
            `;
          } catch {
            // Ignore duplicate (race with concurrent insert)
          }
          resolvedSlugs.push(slug);
        } else if (!existing.is_deleted) {
          // Active interest: use as-is (use stored slug for canonical casing)
          resolvedSlugs.push(existing.slug);
        } else if (existing.merged_into_interest_id) {
          // Deleted but merged into a canonical interest: remap transparently
          const target = mergeTargetById.get(existing.merged_into_interest_id);
          if (target && !target.is_deleted) {
            resolvedSlugs.push(target.slug);
          } else {
            // Merge target is also deleted or gone — treat as unavailable
            return c.json(
              { ok: false, error: { code: "INTEREST_DELETED", field: "hobby", message: "That hobby is not available. Please choose a different hobby." } },
              400,
            );
          }
        } else {
          // Deleted with no merge target — reject
          return c.json(
            { ok: false, error: { code: "INTEREST_DELETED", field: "hobby", message: "That hobby is not available. Please choose a different hobby." } },
            400,
          );
        }
      }
      // Deduplicate after remapping (e.g. two slugs that both merged into same target)
      finalInterestSlugs = [...new Set(resolvedSlugs)];
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
        COALESCE(is_hidden_from_chum_lists, false) AS is_hidden_from_chum_lists
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
    }>;
    const userAfter = userRowsAfter[0];
    const profileRows = (await sql`
      SELECT home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events, bio
      FROM user_profile WHERE user_id = ${appUserId} LIMIT 1
    `) as Array<{
      home_city: string | null;
      home_lat: number | null;
      home_lng: number | null;
      travel_radius_km: number;
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
    const purpose = (body.purpose ?? "avatar") as "avatar" | "event_banner";
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

    const maxBytes = purpose === "event_banner" ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
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
    const body = (await c.req.json()) as { objectKey?: string; purpose?: string; eventId?: string };
    const objectKey = (body.objectKey ?? "").trim();
    const purpose = (body.purpose ?? "avatar") as "avatar" | "event_banner";

    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(
      sql,
      payload.email,
      (payload as { name?: string | null }).name,
    );

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

    // Remove all user connections — caller should merge first if they want to preserve them
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
          SELECT id, created_at, email, username, name, role, is_suspended, suspended_at
          FROM users
          WHERE
            LOWER(email) LIKE ${likePattern}
            OR LOWER(COALESCE(username, '')) LIKE ${likePattern}
            OR LOWER(COALESCE(name, '')) LIKE ${likePattern}
            OR CAST(id AS TEXT) LIKE ${likePattern}
          ORDER BY created_at DESC NULLS LAST
        `) as AdminUserRow[])
      : ((await sql`
          SELECT id, created_at, email, username, name, role, is_suspended, suspended_at
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

// ---- Chums ----

/** Shared helper: build the avatar URL string used in chum responses. */
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

/** GET /chums — list all chums for the authenticated user (private). */
app.get("/chums", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const rows = (await sql`
      SELECT u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at,
             u.date_of_birth, COALESCE(u.is_hidden_age, false) AS is_hidden_age,
             uc.created_at AS chummed_at, uc.note,
             EXISTS(
               SELECT 1 FROM user_chums back
               WHERE back.user_id = uc.chum_user_id AND back.chum_user_id = ${appUserId}
             ) AS is_mutual
      FROM user_chums uc
      JOIN newchums.users u ON u.id = uc.chum_user_id
      WHERE uc.user_id = ${appUserId}
      ORDER BY uc.created_at DESC
    `) as {
      id: string;
      name: string | null;
      username: string | null;
      avatar_key: string | null;
      avatar_updated_at: string | Date | null;
      date_of_birth: string | Date | null;
      is_hidden_age: boolean;
      chummed_at: string | Date;
      note: string | null;
      is_mutual: boolean;
    }[];
    const chums = rows.map((r) => {
      const uname = r.username?.replace(/^@/, "") ?? null;
      let birthday: { month: number; day: number } | null = null;
      if (!r.is_hidden_age && r.date_of_birth) {
        const dobStr = typeof r.date_of_birth === "string" ? r.date_of_birth : (r.date_of_birth as Date).toISOString().slice(0, 10);
        const parts = dobStr.split("-");
        if (parts.length >= 3) birthday = { month: parseInt(parts[1], 10), day: parseInt(parts[2], 10) };
      }
      return {
        userId: r.id,
        displayName: r.name?.trim() || uname || "NewChums user",
        handle: uname ? `@${uname}` : null,
        avatarUrl: buildAvatarUrl(r.id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
        chummedAt: r.chummed_at,
        isMutual: r.is_mutual === true,
        note: r.note ?? null,
        birthday,
      };
    });
    return c.json({ ok: true, chums });
  } catch (err) {
    console.error("[GET /chums]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** PATCH /chums/:userId/note — save or clear the private note for a chum entry. */
app.patch("/chums/:userId/note", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    const targetId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({})) as { note?: unknown };
    const rawNote = body.note != null ? String(body.note).trim() : null;
    const note = rawNote && rawNote.length > 0 ? rawNote.slice(0, 500) : null;

    const result = (await sql`
      UPDATE newchums.user_chums SET note = ${note}
      WHERE user_id = ${appUserId} AND chum_user_id = ${targetId}
      RETURNING id
    `) as { id: string }[];
    if (result.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /chums/:userId/note]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GET /chums/search?q= — search eligible users to add as a Chum.
 *  Excludes self and users with is_hidden_from_search = true.
 *  If q looks like an email, performs exact email lookup instead of name/handle search.
 *  Returns up to 10 results with isChummed; for email lookups also returns inviteEligible
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
      // Never allow lookup of self
      if (emailNorm === payload.email.toLowerCase()) {
        return c.json({ ok: true, users: [], inviteEligible: false });
      }
      const rows = (await sql`
        SELECT u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at,
               COALESCE(u.is_hidden_from_search, false) AS is_hidden,
               COALESCE(u.is_suspended, false) AS is_suspended,
               (uc.chum_user_id IS NOT NULL) AS is_chummed
        FROM newchums.users u
        LEFT JOIN user_chums uc ON uc.user_id = ${appUserId} AND uc.chum_user_id = u.id
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
        is_chummed: boolean;
      }[];
      const match = rows[0];
      // If the account exists but is hidden from search or suspended, treat as not found.
      // This avoids confirming the existence of hidden accounts.
      if (!match || match.is_hidden || match.is_suspended) {
        // Check whether a pending invite already exists (only if no eligible user found)
        const inviteRows = (await sql`
          SELECT 1 FROM newchums.chum_invites
          WHERE inviter_user_id = ${appUserId}
            AND invitee_email = ${emailNorm}
            AND status = 'pending'
            AND expires_at > NOW()
          LIMIT 1
        `) as unknown[];
        const alreadyInvited = inviteRows.length > 0;
        return c.json({ ok: true, users: [], inviteEligible: true, inviteeEmail: emailNorm, alreadyInvited });
      }
      const muname = match.username?.replace(/^@/, "") ?? null;
      const users = [{
        userId: match.id,
        displayName: match.name?.trim() || muname || "NewChums user",
        handle: muname ? `@${muname}` : null,
        avatarUrl: buildAvatarUrl(match.id, match.avatar_key, match.avatar_updated_at, c.env.MEDIA_BUCKET),
        isChummed: match.is_chummed === true,
      }];
      return c.json({ ok: true, users, inviteEligible: false });
    }

    // ── Name / handle search path ─────────────────────────────────────────────
    const likePattern = `%${q.toLowerCase()}%`;
    const rows = (await sql`
      SELECT u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at,
             (uc.chum_user_id IS NOT NULL) AS is_chummed
      FROM newchums.users u
      LEFT JOIN user_chums uc
        ON uc.user_id = ${appUserId} AND uc.chum_user_id = u.id
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
      is_chummed: boolean;
    }[];
    const users = rows.map((r) => {
      const uname = r.username?.replace(/^@/, "") ?? null;
      return {
        userId: r.id,
        displayName: r.name?.trim() || uname || "NewChums user",
        handle: uname ? `@${uname}` : null,
        avatarUrl: buildAvatarUrl(r.id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
        isChummed: r.is_chummed === true,
      };
    });
    return c.json({ ok: true, users, inviteEligible: false });
  } catch (err) {
    console.error("[GET /chums/search]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** GET /chums/check/:userId — returns whether the authenticated user has this person as a Chum. */
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
      SELECT
        EXISTS(SELECT 1 FROM user_chums WHERE user_id = ${appUserId} AND chum_user_id = ${targetId}) AS is_chummed,
        EXISTS(SELECT 1 FROM user_chums WHERE user_id = ${targetId}  AND chum_user_id = ${appUserId}) AS they_chummed_me,
        (SELECT COUNT(*)::int
         FROM user_chums a
         JOIN user_chums b ON a.chum_user_id = b.chum_user_id
         WHERE a.user_id = ${appUserId} AND b.user_id = ${targetId}) AS shared_count
    `) as { is_chummed: boolean; they_chummed_me: boolean; shared_count: number }[];
    const row = rows[0];
    const isChummed = row?.is_chummed === true;
    const isMutual = isChummed && row?.they_chummed_me === true;
    return c.json({ ok: true, isChummed, isMutual, sharedCount: row?.shared_count ?? 0 });
  } catch (err) {
    console.error("[GET /chums/check/:userId]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** POST /chums/invite — send a Chum invite email to an address not yet on NewChums.
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

    // Can't invite yourself
    if (inviteeEmail === payload.email.toLowerCase()) {
      return c.json({ ok: false, error: { code: "CANNOT_INVITE_SELF" } }, 400);
    }

    // If a user already exists at this email and is eligible, frontend should add directly
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

    // Prevent duplicate pending invite
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

    // Rate limit: max 10 invites per inviter in last 24 h
    const recentRows = (await sql`
      SELECT COUNT(*)::int AS cnt FROM newchums.chum_invites
      WHERE inviter_user_id = ${appUserId}
        AND created_at > NOW() - INTERVAL '24 hours'
    `) as { cnt: number }[];
    if ((recentRows[0]?.cnt ?? 0) >= 10) {
      return c.json({ ok: false, error: { code: "RATE_LIMITED", message: "You've sent too many invites today. Try again tomorrow." } }, 429);
    }

    // Generate token, hash it, store hash only
    const { generateResetToken, hashResetToken } = await import("./resetTokens");
    const token = generateResetToken();
    const tokenHash = await hashResetToken(token);

    await sql`
      INSERT INTO newchums.chum_invites (inviter_user_id, invitee_email, token_hash)
      VALUES (${appUserId}, ${inviteeEmail}, ${tokenHash})
    `;

    // Resolve inviter display name for the email
    const inviterRows = (await sql`
      SELECT name, username FROM newchums.users WHERE id = ${appUserId} LIMIT 1
    `) as { name: string | null; username: string | null }[];
    const inviter = inviterRows[0];
    const inviterName =
      inviter?.name?.trim() ||
      (inviter?.username ? (inviter.username.startsWith("@") ? inviter.username : `@${inviter.username}`) : null) ||
      "A NewChums member";

    const inviteUrl = `${c.env.WEB_BASE_URL}/signup?invite=${encodeURIComponent(token)}`;

    // Send email (non-fatal if it fails to avoid silent DB state / email mismatch)
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

/** POST /chums/invite/accept — consume an invite token after account creation.
 *  Called by the web app immediately after successful signup when an invite token is present.
 *  Accepts the invite, marks it accepted, and creates mutual Chum links. */
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

    // Find valid pending invite
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

    // Verify the signing-up email matches the invite
    if (invite.invitee_email !== newUserEmail) {
      return c.json({ ok: false, error: { code: "EMAIL_MISMATCH" } }, 400);
    }

    // Look up the newly created user
    const newUserRows = (await sql`
      SELECT id FROM newchums.users WHERE LOWER(email) = ${newUserEmail} LIMIT 1
    `) as { id: string }[];
    const newUserId = newUserRows[0]?.id;
    if (!newUserId) {
      return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);
    }

    const inviterId = invite.inviter_user_id;

    // Mark invite accepted
    await sql`
      UPDATE newchums.chum_invites
      SET status = 'accepted', accepted_at = NOW(), accepted_user_id = ${newUserId}
      WHERE id = ${invite.id}
    `;

    // Create mutual Chum links (both directions), ignoring conflicts
    await sql`
      INSERT INTO user_chums (user_id, chum_user_id)
      VALUES (${inviterId}, ${newUserId}), (${newUserId}, ${inviterId})
      ON CONFLICT (user_id, chum_user_id) DO NOTHING
    `;

    // Create notifications for both sides
    try {
      await sql`
        INSERT INTO newchums.notifications (user_id, type, actor_user_id)
        VALUES
          (${newUserId}, 'chum_added_you', ${inviterId}),
          (${inviterId}, 'chum_added_you', ${newUserId})
        ON CONFLICT DO NOTHING
      `;
    } catch {
      // Non-fatal
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /chums/invite/accept]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** POST /chums/:userId — add a user to the authenticated user's Chum list. */
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
      return c.json({ ok: false, error: { code: "CANNOT_CHUM_SELF", message: "You cannot add yourself as a Chum." } }, 400);
    }
    const targetRows = (await sql`
      SELECT id FROM newchums.users WHERE id = ${targetId} LIMIT 1
    `) as { id: string }[];
    if (targetRows.length === 0) {
      return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);
    }
    const insertResult = (await sql`
      INSERT INTO user_chums (user_id, chum_user_id)
      VALUES (${appUserId}, ${targetId})
      ON CONFLICT (user_id, chum_user_id) DO NOTHING
      RETURNING id
    `) as { id: string }[];
    // Only create a notification when a new chum was actually added (not a duplicate).
    // Removing and re-adding later creates a new notification because the conflict is gone.
    // Must be awaited — Cloudflare Workers abandon unawaited promises when the response is sent.
    if (insertResult.length > 0) {
      try {
        await sql`
          INSERT INTO newchums.notifications (user_id, type, actor_user_id)
          VALUES (${targetId}, 'chum_added_you', ${appUserId})
        `;
      } catch (notifErr) {
        console.error("[POST /chums/:userId] notification insert failed (non-fatal):", notifErr);
      }
    }
    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /chums/:userId]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** DELETE /chums/:userId — remove a user from the authenticated user's Chum list. */
app.delete("/chums/:userId", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const targetId = c.req.param("userId");
  if (!targetId) return c.json({ ok: false, error: "INVALID_ID" }, 400);
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
    await sql`
      DELETE FROM user_chums
      WHERE user_id = ${appUserId} AND chum_user_id = ${targetId}
    `;
    return c.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /chums/:userId]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** GET /notifications — fetch recent notifications for the authenticated user. */
app.get("/notifications", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
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
    return c.json({ ok: true, notifications });
  } catch (err) {
    console.error("[GET /notifications]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** POST /notifications/read — mark notifications as read.
 *  Body: { ids?: string[] } — if ids omitted or empty, marks all unread as read. */
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

/** GET /public/users/:handle/chums — public-facing paginated Chum list for a profile.
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
    // Optional viewer auth: if logged in and not the owner, compute isMutualWithViewer per chum.
    // When viewerId is null the EXISTS subquery safely returns false for all rows.
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
      FROM user_chums uc
      JOIN newchums.users u ON u.id = uc.chum_user_id
      WHERE uc.user_id = ${owner.id}
        AND COALESCE(u.is_hidden_from_chum_lists, false) = false
        AND u.username IS NOT NULL
    `) as { total: string }[];
    const total = parseInt(countRows[0]?.total ?? "0", 10);
    const rows = (await sql`
      SELECT u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at,
        (EXISTS(SELECT 1 FROM user_chums v1 WHERE v1.user_id = ${viewerId} AND v1.chum_user_id = u.id)
         AND EXISTS(SELECT 1 FROM user_chums v2 WHERE v2.user_id = u.id AND v2.chum_user_id = ${viewerId}))
           AS is_mutual_with_viewer
      FROM user_chums uc
      JOIN newchums.users u ON u.id = uc.chum_user_id
      WHERE uc.user_id = ${owner.id}
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
      is_mutual_with_viewer: boolean;
    }[];
    const chums = rows.map((r) => {
      const uname = r.username?.replace(/^@/, "") ?? null;
      return {
        userId: r.id,
        displayName: r.name?.trim() || uname || "NewChums user",
        handle: uname ? `@${uname}` : null,
        avatarUrl: buildAvatarUrl(r.id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
        isMutualWithViewer: r.is_mutual_with_viewer === true,
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

/** POST /events — create a new event/plan */
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

  const description = body.description ? String(body.description).trim().slice(0, 2000) : null;
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
  const requireReconfirmation = body.require_reconfirmation === true;
  const status = body.status === "draft" ? "draft" : "published";

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

  try {
    // --- Resolve interests (look up existing or create new) ---
    // Validate and canonicalise any explicitly provided UUIDs
    const resolvedInterestIds: string[] = [];
    for (const iid of seedInterestIds) {
      const rows = (await sql`SELECT id FROM newchums.interests WHERE id = ${iid} AND is_deleted = false`) as { id: string }[];
      if (rows.length > 0 && !resolvedInterestIds.includes(iid)) resolvedInterestIds.push(iid);
    }

    // Process interest_items — create missing interests then collect IDs
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
            // else: merged target also gone — skip silently
          }
          // else: deleted with no merge target — skip silently

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
        max_seats, visibility, status, allow_alt_times, require_reconfirmation
      ) VALUES (
        ${userId}, ${title}, ${description}, ${interestId}, ${startsDate.toISOString()},
        ${locationType}, ${locationName}, ${locationAddress}, ${locationPlaceId}, ${locationLat}, ${locationLng},
        ${locationVisibility}, ${locationArea}, ${onlineLink},
        ${maxSeats}, ${visibility}, ${status}, ${allowAltTimes}, ${requireReconfirmation}
      )
      RETURNING id, created_at
    `) as { id: string; created_at: string }[];

    const eventId = rows[0].id;

    for (const iid of resolvedInterestIds) {
      try {
        await sql`INSERT INTO newchums.event_interests (event_id, interest_id) VALUES (${eventId}, ${iid}) ON CONFLICT DO NOTHING`;
      } catch { /* skip invalid interest refs */ }
    }

    // Creator counts as attending: add host as RSVP "going" so they appear in participant counts and event details
    await sql`
      INSERT INTO newchums.event_rsvps (event_id, user_id, status)
      VALUES (${eventId}, ${userId}, 'going')
      ON CONFLICT (event_id, user_id) DO NOTHING
    `;

    const invitees = Array.isArray(body.invitees) ? (body.invitees as Array<{ user_id?: string; email?: string }>) : [];
    for (const inv of invitees.slice(0, 50)) {
      const invUserId = inv.user_id ? String(inv.user_id) : null;
      const invEmail = inv.email ? String(inv.email).trim().toLowerCase() : null;
      if (!invUserId && !invEmail) continue;

      try {
        await sql`
          INSERT INTO newchums.event_invites (event_id, user_id, email, invited_by)
          VALUES (${eventId}, ${invUserId}, ${invEmail}, ${userId})
          ON CONFLICT DO NOTHING
        `;

        if (status === "published") {
          if (invUserId) {
            await sql`
              INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
              VALUES (${invUserId}, 'event_invite', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: title })})
            `;
            const invUser = (await sql`SELECT email, name FROM newchums.users WHERE id = ${invUserId}`) as { email: string; name: string | null }[];
            if (invUser.length > 0) {
              const hostUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
              const hostName = hostUser[0]?.name?.trim() || hostUser[0]?.username?.replace(/^@/, "") || "Someone";
              try {
                await sendEventInviteEmail(c.env, {
                  to: invUser[0].email,
                  recipientName: invUser[0].name?.trim() || "there",
                  hostName,
                  eventTitle: title,
                  eventDate: startsDate.toISOString(),
                  eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
                });
              } catch { /* noop if template missing */ }
            }
          } else if (invEmail) {
            const hostUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
            const hostName = hostUser[0]?.name?.trim() || hostUser[0]?.username?.replace(/^@/, "") || "Someone";
            try {
              await sendEventInviteEmail(c.env, {
                to: invEmail,
                recipientName: "there",
                hostName,
                eventTitle: title,
                eventDate: startsDate.toISOString(),
                eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
              });
            } catch { /* noop if template missing */ }
          }
        }
      } catch { /* skip individual invite failures */ }
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

/** GET /events/mine — list events I host or am invited to / RSVPd */
app.get("/events/mine", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

  const filter = c.req.query("filter") ?? "upcoming";
  const now = new Date().toISOString();

  try {
    const rows = (await sql`
      SELECT
        e.id, e.title, e.description, e.starts_at, e.location_type,
        e.location_name, e.location_address, e.location_visibility, e.location_area, e.online_link,
        e.max_seats, e.visibility, e.status, e.allow_alt_times,
        e.host_user_id, e.created_at, e.canceled_at, e.banner_key,
        COALESCE(
          (SELECT json_agg(json_build_object('name', ii.name, 'slug', ii.slug))
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
        CASE WHEN e.host_user_id = ${userId} THEN true ELSE false END AS is_host
      FROM newchums.events e
      LEFT JOIN newchums.interests i ON i.id = e.interest_id
      LEFT JOIN newchums.users h ON h.id = e.host_user_id
      LEFT JOIN newchums.event_rsvps r ON r.event_id = e.id AND r.user_id = ${userId}
      WHERE e.status != 'draft'
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
      created_at: string; canceled_at: string | null; banner_key: string | null;
      hobbies: Array<{ name: string; slug: string }> | string;
      interest_name: string | null; interest_slug: string | null;
      host_name: string | null; host_username: string | null;
      my_rsvp_status: string | null;
      going_count: number; maybe_count: number; is_host: boolean;
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
      };
    });

    return c.json({ ok: true, events });
  } catch (err) {
    console.error("[GET /events/mine]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** GET /events/explore — discoverable events for the logged-in user.
 *  MUST be registered before /events/:id to prevent "explore" being parsed as a UUID. */
app.get("/events/explore", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string")
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const sql = getSql(c.env);
  const userId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);

  const lat = c.req.query("lat") ? Number(c.req.query("lat")) : null;
  const lng = c.req.query("lng") ? Number(c.req.query("lng")) : null;
  const radiusKm = Math.min(Math.max(Number(c.req.query("radius_km") ?? 200), 1), 20000);
  const hobbySlug = c.req.query("hobby") ?? null;
  const search = c.req.query("q")?.trim() ?? null;
  const pageLimit = Math.min(Math.max(Number(c.req.query("limit") ?? 12), 1), 50);
  const pageOffset = Math.max(Number(c.req.query("offset") ?? 0), 0);

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
    const chumIds = (await sql`SELECT chum_user_id FROM newchums.user_chums WHERE user_id = ${userId}`) as { chum_user_id: string }[];
    const chumIdList = chumIds.map((r) => r.chum_user_id);

    const rows = (await sql`
      SELECT
        e.id, e.title, e.description, e.starts_at, e.location_type,
        e.location_name, e.location_address, e.location_visibility, e.location_area, e.online_link,
        e.location_lat, e.location_lng,
        e.max_seats, e.visibility, e.status, e.allow_alt_times,
        e.host_user_id, e.created_at, e.banner_key,
        COALESCE(
          (SELECT json_agg(json_build_object('name', ii.name, 'slug', ii.slug))
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
        END AS distance_km
      FROM newchums.events e
      LEFT JOIN newchums.interests i ON i.id = e.interest_id
      LEFT JOIN newchums.users h ON h.id = e.host_user_id
      LEFT JOIN newchums.event_rsvps r ON r.event_id = e.id AND r.user_id = ${userId}
      WHERE e.status = 'published'
        AND e.starts_at >= ${now.toISOString()}
        AND e.visibility != 'invite_only'
        AND (
          e.visibility = 'public'
          OR (e.visibility = 'chums_only' AND (
            e.host_user_id = ${userId}
            OR e.host_user_id = ANY(${chumIdList.length > 0 ? chumIdList : ["00000000-0000-0000-0000-000000000000"]})
          ))
        )
        ${hobbySlug ? sql`AND EXISTS (SELECT 1 FROM newchums.event_interests ei3 JOIN newchums.interests ii3 ON ii3.id = ei3.interest_id WHERE ei3.event_id = e.id AND ii3.slug = ${hobbySlug})` : sql``}
        ${search ? sql`AND (e.title ILIKE ${"%" + search + "%"} OR e.description ILIKE ${"%" + search + "%"})` : sql``}
        ${dateEnd ? sql`AND e.starts_at <= ${dateEnd.toISOString()}` : sql``}
        ${hasLocation && radiusKm < 20000 ? sql`AND (e.location_lat IS NULL OR e.location_lng IS NULL OR 6371 * acos(LEAST(1.0, GREATEST(-1.0, cos(radians(${lat ?? 0})) * cos(radians(e.location_lat)) * cos(radians(e.location_lng) - radians(${lng ?? 0})) + sin(radians(${lat ?? 0})) * sin(radians(e.location_lat))))) <= ${radiusKm})` : sql``}
      ORDER BY
        CASE WHEN e.host_user_id = ${userId} THEN 0 ELSE 1 END,
        ${hasLocation ? sql`distance_km ASC NULLS LAST` : sql`e.starts_at ASC`},
        e.starts_at ASC
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
      my_rsvp_status: string | null;
      going_count: number; maybe_count: number; is_host: boolean;
      distance_km: number | null;
    }>;

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
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        startsAt: r.starts_at,
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

/** GET /events/:id — event details */
app.get("/events/:id", async (c) => {
  const eventId = c.req.param("id");
  const sql = getSql(c.env);

  let userId: string | null = null;
  const authPayload = await requireAuth(c);
  if (authPayload?.email) {
    userId = await ensureAppUserId(sql, authPayload.email, (authPayload as { name?: string | null }).name);
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

    if (event.visibility === "invite_only" && !isHost) {
      if (!userId) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
      const invite = (await sql`SELECT id FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId}`) as { id: string }[];
      const rsvp = (await sql`SELECT id FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId}`) as { id: string }[];
      if (invite.length === 0 && rsvp.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    }

    if (event.visibility === "chums_only" && !isHost) {
      if (!userId) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
      const isChum = (await sql`SELECT id FROM newchums.user_chums WHERE user_id = ${event.host_user_id} AND chum_user_id = ${userId}`) as { id: string }[];
      const invite = (await sql`SELECT id FROM newchums.event_invites WHERE event_id = ${eventId} AND user_id = ${userId}`) as { id: string }[];
      const rsvp = (await sql`SELECT id FROM newchums.event_rsvps WHERE event_id = ${eventId} AND user_id = ${userId}`) as { id: string }[];
      if (isChum.length === 0 && invite.length === 0 && rsvp.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    }

    const rsvps = (await sql`
      SELECT er.status, er.note, er.user_id, u.name, u.username, u.avatar_key, u.avatar_updated_at
      FROM newchums.event_rsvps er
      JOIN newchums.users u ON u.id = er.user_id
      WHERE er.event_id = ${eventId}
      ORDER BY er.created_at ASC
    `) as Array<{ status: string; note: string | null; user_id: string; name: string | null; username: string | null; avatar_key: string | null; avatar_updated_at: string | Date | null }>;

    const altTimes = (await sql`
      SELECT eat.suggested_at, eat.note, eat.user_id, u.name, u.username
      FROM newchums.event_alt_times eat
      JOIN newchums.users u ON u.id = eat.user_id
      WHERE eat.event_id = ${eventId}
      ORDER BY eat.created_at ASC
    `) as Array<{ suggested_at: string; note: string | null; user_id: string; name: string | null; username: string | null }>;

    const eventHobbies = (await sql`
      SELECT ii.name, ii.slug
      FROM newchums.event_interests ei2
      JOIN newchums.interests ii ON ii.id = ei2.interest_id
      WHERE ei2.event_id = ${eventId} AND ii.is_deleted = false
      ORDER BY ei2.created_at ASC
    `) as Array<{ name: string; slug: string }>;

    const hobbyList = eventHobbies.length > 0
      ? eventHobbies
      : (event as Record<string, unknown>).interest_name
        ? [{ name: (event as Record<string, unknown>).interest_name as string, slug: ((event as Record<string, unknown>).interest_slug as string) ?? "" }]
        : [];

    const invites = (await sql`
      SELECT ei.user_id, ei.email, u.name, u.username
      FROM newchums.event_invites ei
      LEFT JOIN newchums.users u ON u.id = ei.user_id
      WHERE ei.event_id = ${eventId}
      ORDER BY ei.created_at ASC
    `) as Array<{ user_id: string | null; email: string | null; name: string | null; username: string | null }>;

    return c.json({
      ok: true,
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
        requireReconfirmation: event.require_reconfirmation === true,
        canceledAt: event.canceled_at,
        createdAt: event.created_at,
        bannerKey: event.banner_key ?? null,
        hobby: hobbyList[0]?.name ?? null,
        hobbySlug: hobbyList[0]?.slug ?? null,
        hobbies: hobbyList,
        hostName: (() => { const u = ((event as Record<string, unknown>).host_username as string)?.replace(/^@/, ""); return u ? `@${u}` : (((event as Record<string, unknown>).host_name as string)?.trim() || "Someone"); })(),
        hostUserId: event.host_user_id,
        isHost: isHost === true,
      },
      rsvps: rsvps.map((r) => {
        const rHandle = r.username?.replace(/^@/, "") ?? null;
        return {
          userId: r.user_id,
          name: r.name?.trim() || rHandle || "Someone",
          handle: rHandle ? `@${rHandle}` : null,
          status: r.status,
          note: r.note,
          avatarUrl: buildAvatarUrl(r.user_id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
        };
      }),
      altTimes: altTimes.map((a) => ({
        userId: a.user_id,
        name: a.name?.trim() || a.username?.replace(/^@/, "") || "Someone",
        suggestedAt: a.suggested_at,
        note: a.note,
      })),
      invites: invites.map((inv) => ({
        userId: inv.user_id,
        email: inv.email,
        name: inv.name?.trim() || inv.username?.replace(/^@/, "") || inv.email || "Invited",
      })),
    });
  } catch (err) {
    console.error("[GET /events/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/rsvp — RSVP to an event */
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
    const ev = (await sql`SELECT id, host_user_id, visibility, status, max_seats, title FROM newchums.events WHERE id = ${eventId} AND status = 'published'`) as { id: string; host_user_id: string; visibility: string; status: string; max_seats: number | null; title: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    const event = ev[0];

    if (event.host_user_id === userId) return c.json({ ok: false, error: "VALIDATION", message: "Hosts cannot RSVP to their own event" }, 400);

    if (status === "going" && event.max_seats) {
      const goingCount = (await sql`SELECT COUNT(*)::int AS c FROM newchums.event_rsvps WHERE event_id = ${eventId} AND status = 'going'`) as { c: number }[];
      if (goingCount[0].c >= event.max_seats)
        return c.json({ ok: false, error: "EVENT_FULL", message: "This gathering is full" }, 409);
    }

    await sql`
      INSERT INTO newchums.event_rsvps (event_id, user_id, status, note)
      VALUES (${eventId}, ${userId}, ${status}, ${note})
      ON CONFLICT (event_id, user_id) DO UPDATE SET status = ${status}, note = ${note}, updated_at = NOW()
    `;

    const statusLabel = status === "going" ? "Going" : status === "maybe" ? "Maybe" : "Can't make it";
    await sql`
      INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
      VALUES (${event.host_user_id}, 'event_rsvp', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: event.title, rsvpStatus: statusLabel })})
    `;

    const hostUser = (await sql`SELECT email, name, username FROM newchums.users WHERE id = ${event.host_user_id}`) as { email: string; name: string | null; username: string | null }[];
    const attendeeUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
    if (hostUser.length > 0) {
      try {
        await sendEventRsvpUpdateEmail(c.env, {
          to: hostUser[0].email,
          hostName: hostUser[0].name?.trim() || hostUser[0].username?.replace(/^@/, "") || "there",
          attendeeName: attendeeUser[0]?.name?.trim() || attendeeUser[0]?.username?.replace(/^@/, "") || "Someone",
          eventTitle: event.title,
          rsvpStatus: statusLabel,
          eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
        });
      } catch { /* noop */ }
    }

    return c.json({ ok: true, status });
  } catch (err) {
    console.error("[POST /events/:id/rsvp]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/alt-time — suggest an alternate time */
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
  if (!suggestedAt) return c.json({ ok: false, error: "VALIDATION", message: "Suggested date/time is required", field: "suggested_at" }, 400);

  const suggestedDate = new Date(suggestedAt);
  if (isNaN(suggestedDate.getTime())) return c.json({ ok: false, error: "VALIDATION", message: "Invalid date/time", field: "suggested_at" }, 400);

  const note = body.note ? String(body.note).trim().slice(0, 500) : null;

  try {
    const ev = (await sql`SELECT id, host_user_id, allow_alt_times, title FROM newchums.events WHERE id = ${eventId} AND status = 'published'`) as { id: string; host_user_id: string; allow_alt_times: boolean; title: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (!ev[0].allow_alt_times) return c.json({ ok: false, error: "VALIDATION", message: "This event does not accept alternate time suggestions" }, 400);

    await sql`
      INSERT INTO newchums.event_alt_times (event_id, user_id, suggested_at, note)
      VALUES (${eventId}, ${userId}, ${suggestedDate.toISOString()}, ${note})
    `;

    const user = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
    const suggestorName = user[0]?.name?.trim() || user[0]?.username?.replace(/^@/, "") || "Someone";

    await sql`
      INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
      VALUES (${ev[0].host_user_id}, 'event_alt_time', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: ev[0].title, suggestorName, suggestedAt: suggestedDate.toISOString() })})
    `;

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/alt-time]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** PATCH /events/:id — edit core event fields (host only, published events) */
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
      SELECT id, host_user_id, status FROM newchums.events WHERE id = ${eventId}
    `) as { id: string; host_user_id: string; status: string }[];
    if (rows.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (rows[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN" }, 403);
    if (rows[0].status === "canceled") return c.json({ ok: false, error: "VALIDATION", message: "Cannot edit a canceled plan" }, 400);

    const rawTitle = body.title != null ? String(body.title).trim() : null;
    if (!rawTitle) return c.json({ ok: false, error: "VALIDATION", message: "Title is required", field: "title" }, 400);
    if (rawTitle.length > 200) return c.json({ ok: false, error: "VALIDATION", message: "Title must be 200 characters or less", field: "title" }, 400);

    const description = body.description != null ? String(body.description).trim().slice(0, 2000) || null : null;

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
      SET title                  = ${rawTitle},
          description            = ${description},
          starts_at              = ${startsAt.toISOString()},
          interest_id            = ${patchPrimaryInterestId},
          max_seats              = ${maxSeats},
          visibility             = ${visibility},
          require_reconfirmation = ${patchRequireReconfirmation},
          updated_at             = NOW()
      WHERE id = ${eventId}
    `;

    await sql`DELETE FROM newchums.event_interests WHERE event_id = ${eventId}`;
    for (const iid of patchInterestIds) {
      await sql`INSERT INTO newchums.event_interests (event_id, interest_id) VALUES (${eventId}, ${iid}) ON CONFLICT DO NOTHING`;
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /events/:id]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/cancel — cancel an event (host only) */
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

    await sql`UPDATE newchums.events SET status = 'canceled', canceled_at = NOW(), updated_at = NOW() WHERE id = ${eventId}`;

    const attendees = (await sql`
      SELECT u.id, u.email, u.name, u.username
      FROM newchums.event_rsvps er
      JOIN newchums.users u ON u.id = er.user_id
      WHERE er.event_id = ${eventId}
    `) as Array<{ id: string; email: string; name: string | null; username: string | null }>;

    const hostUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
    const hostName = hostUser[0]?.name?.trim() || hostUser[0]?.username?.replace(/^@/, "") || "Someone";

    for (const att of attendees) {
      await sql`
        INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
        VALUES (${att.id}, 'event_canceled', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: ev[0].title })})
      `;
      try {
        await sendEventCanceledEmail(c.env, {
          to: att.email,
          recipientName: att.name?.trim() || att.username?.replace(/^@/, "") || "there",
          hostName,
          eventTitle: ev[0].title,
          eventDate: ev[0].starts_at,
        });
      } catch { /* noop */ }
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("[POST /events/:id/cancel]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

/** POST /events/:id/invite — add invitees to a published event */
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
    const ev = (await sql`SELECT id, host_user_id, title, starts_at, status FROM newchums.events WHERE id = ${eventId}`) as { id: string; host_user_id: string; title: string; starts_at: string; status: string }[];
    if (ev.length === 0) return c.json({ ok: false, error: "NOT_FOUND" }, 404);
    if (ev[0].host_user_id !== userId) return c.json({ ok: false, error: "FORBIDDEN", message: "Only the host can invite" }, 403);

    const invitees = Array.isArray(body.invitees) ? (body.invitees as Array<{ user_id?: string; email?: string }>) : [];
    let added = 0;

    const hostUser = (await sql`SELECT name, username FROM newchums.users WHERE id = ${userId}`) as { name: string | null; username: string | null }[];
    const hostName = hostUser[0]?.name?.trim() || hostUser[0]?.username?.replace(/^@/, "") || "Someone";

    for (const inv of invitees.slice(0, 50)) {
      const invUserId = inv.user_id ? String(inv.user_id) : null;
      const invEmail = inv.email ? String(inv.email).trim().toLowerCase() : null;
      if (!invUserId && !invEmail) continue;

      const result = (await sql`
        INSERT INTO newchums.event_invites (event_id, user_id, email, invited_by)
        VALUES (${eventId}, ${invUserId}, ${invEmail}, ${userId})
        ON CONFLICT DO NOTHING
        RETURNING id
      `) as { id: string }[];

      if (result.length > 0) {
        added++;
        if (ev[0].status === "published" && invUserId) {
          await sql`
            INSERT INTO newchums.notifications (user_id, type, actor_user_id, entity_id, metadata)
            VALUES (${invUserId}, 'event_invite', ${userId}, ${eventId}, ${JSON.stringify({ eventTitle: ev[0].title })})
          `;
          const invUser = (await sql`SELECT email, name FROM newchums.users WHERE id = ${invUserId}`) as { email: string; name: string | null }[];
          if (invUser.length > 0) {
            try {
              await sendEventInviteEmail(c.env, {
                to: invUser[0].email,
                recipientName: invUser[0].name?.trim() || "there",
                hostName,
                eventTitle: ev[0].title,
                eventDate: ev[0].starts_at,
                eventUrl: `${c.env.WEB_BASE_URL}/events/${eventId}`,
              });
            } catch { /* noop */ }
          }
        }
      }
    }

    return c.json({ ok: true, added });
  } catch (err) {
    console.error("[POST /events/:id/invite]", err);
    return c.json({ ok: false, error: "SERVER_ERROR" }, 500);
  }
});

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    fetch: app.fetch,
  },
);
