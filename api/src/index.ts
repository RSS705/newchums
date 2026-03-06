import * as Sentry from "@sentry/cloudflare";
import { compareSync, hashSync } from "bcryptjs";
import { Hono } from "hono";
import { inspectRoutes } from "hono/dev";
import { isAtLeast18, parseDateOnly } from "./ageValidation";
import { getBearerToken, verifyAuthToken } from "./auth";
import { DATABASE_URL_HINT, type Bindings, getSql } from "./db";
import {
  sendContactFormEmail,
  sendEmailChangeConfirmEmail,
  sendEmailChangeNotifyOldEmail,
  sendEmailChangeSuccessEmail,
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
    const displayName = user.name?.trim() ?? "NewChums user";
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

app.get("/events", async (c) => {
  const sql = getSql(c.env);
  const rows = await sql<
    {
      id: string;
      creator_id: string | null;
      title: string;
      description: string | null;
      location_name: string;
      location_address: string | null;
      location_place_id: string | null;
      lat: number;
      lng: number;
      starts_at: string;
      duration_minutes: number | null;
      seat_limit: number;
      skill_level: string | null;
      is_private: boolean;
      created_at: string;
    }[]
  >`
    select
      id,
      creator_id,
      title,
      description,
      location_name,
      location_address,
      location_place_id,
      st_y(location::geometry) as lat,
      st_x(location::geometry) as lng,
      starts_at,
      duration_minutes,
      seat_limit,
      skill_level,
      is_private,
      created_at
    from events
    order by starts_at desc
    limit 50
  `;
  return c.json({ ok: true, events: rows });
});

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
    const purpose = (body.purpose ?? "avatar") as "avatar";
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

    return c.json({
      ok: true,
      uploadToken,
      objectKey,
      uploadUrl: `/media/upload/${uploadToken}`,
      viewUrl: `/users/${appUserId}/avatar`,
      constraints: { maxBytes: 2 * 1024 * 1024, allowedTypes: ["image/jpeg", "image/png", "image/webp"] },
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
    const body = (await c.req.json()) as { objectKey?: string; purpose?: string };
    const objectKey = (body.objectKey ?? "").trim();
    const purpose = (body.purpose ?? "avatar") as "avatar";

    if (!objectKey || !objectKey.startsWith("avatars/")) {
      return c.json({ ok: false, error: "INVALID_OBJECT_KEY" }, 400);
    }

    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(
      sql,
      payload.email,
      (payload as { name?: string | null }).name,
    );

    // Ensure objectKey belongs to this user (avatars/<userId>/...)
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

app.post("/events", async (c) => {
  const body = await c.req.json<{
    creator_id?: string | null;
    title?: string;
    description?: string | null;
    location_name?: string;
    location_address?: string | null;
    location_place_id?: string | null;
    lat?: number;
    lng?: number;
    starts_at?: string;
    duration_minutes?: number | null;
    seat_limit?: number;
    skill_level?: string | null;
    is_private?: boolean | null;
  }>();

  if (
    !body.title ||
    !body.location_name ||
    body.lat == null ||
    body.lng == null ||
    !body.starts_at ||
    body.seat_limit == null
  ) {
    return c.json(
      {
        ok: false,
        error:
          "title, location_name, lat, lng, starts_at, and seat_limit are required",
      },
      400,
    );
  }

  const sql = getSql(c.env);
  const rows = await sql<
    {
      id: string;
      created_at: string;
    }[]
  >`
    insert into events (
      creator_id,
      title,
      description,
      location_name,
      location_address,
      location_place_id,
      location,
      starts_at,
      duration_minutes,
      seat_limit,
      skill_level,
      is_private
    )
    values (
      ${body.creator_id ?? null},
      ${body.title},
      ${body.description ?? null},
      ${body.location_name},
      ${body.location_address ?? null},
      ${body.location_place_id ?? null},
      st_makepoint(${body.lng}, ${body.lat})::geography,
      ${body.starts_at},
      ${body.duration_minutes ?? 120},
      ${body.seat_limit},
      ${body.skill_level ?? "all"},
      ${body.is_private ?? false}
    )
    returning id, created_at
  `;

  return c.json({ ok: true, event: rows[0] ?? null }, 201);
});

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

    // Find all user_interests rows pointing at source
    const sourceUserRows = (await sql`
      SELECT user_id FROM user_interests WHERE interest_id = ${sourceInterestId}
    `) as { user_id: string }[];

    if (sourceUserRows.length === 0) {
      // No user associations to migrate — just soft-delete the source
      await sql`
        UPDATE interests
        SET is_deleted = true,
            deleted_at = now(),
            deleted_by_user_id = ${admin.id},
            merged_into_interest_id = ${targetInterestId}
        WHERE id = ${sourceInterestId}
      `;
      return c.json({ ok: true, movedCount: 0, dedupedCount: 0, sourceId: sourceInterestId, targetId: targetInterestId });
    }

    // Find which of those users already have the target interest
    const sourceUserIds = sourceUserRows.map((r) => r.user_id);
    const alreadyHaveTarget = (await sql`
      SELECT user_id FROM user_interests
      WHERE interest_id = ${targetInterestId}
        AND user_id = ANY(${sourceUserIds})
    `) as { user_id: string }[];
    const alreadyHaveTargetSet = new Set(alreadyHaveTarget.map((r) => r.user_id));

    const toUpdate = sourceUserIds.filter((uid) => !alreadyHaveTargetSet.has(uid));
    const toDelete = sourceUserIds.filter((uid) => alreadyHaveTargetSet.has(uid));

    // Move users without target: update interest_id to target
    if (toUpdate.length > 0) {
      await sql`
        UPDATE user_interests
        SET interest_id = ${targetInterestId}
        WHERE interest_id = ${sourceInterestId}
          AND user_id = ANY(${toUpdate})
      `;
    }

    // Dedup: remove source rows for users who already have target
    if (toDelete.length > 0) {
      await sql`
        DELETE FROM user_interests
        WHERE interest_id = ${sourceInterestId}
          AND user_id = ANY(${toDelete})
      `;
    }

    // Soft-delete the source interest and record the merge target
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
      movedCount: toUpdate.length,
      dedupedCount: toDelete.length,
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
             uc.created_at AS chummed_at
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
      chummed_at: string | Date;
    }[];
    const chums = rows.map((r) => ({
      userId: r.id,
      displayName: r.name?.trim() ?? "NewChums user",
      handle: r.username ? (r.username.startsWith("@") ? r.username : `@${r.username}`) : null,
      avatarUrl: buildAvatarUrl(r.id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
      chummedAt: r.chummed_at,
    }));
    return c.json({ ok: true, chums });
  } catch (err) {
    console.error("[GET /chums]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
  }
});

/** GET /chums/search?q= — search eligible users to add as a Chum.
 *  Excludes self and users with is_hidden_from_search = true.
 *  Returns up to 10 results including whether each is already a Chum. */
app.get("/chums/search", async (c) => {
  const payload = await requireAuth(c);
  if (!payload?.email || typeof payload.email !== "string") {
    return c.json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) {
    return c.json({ ok: true, users: [] });
  }
  try {
    const sql = getSql(c.env);
    const appUserId = await ensureAppUserId(sql, payload.email, (payload as { name?: string | null }).name);
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
    const users = rows.map((r) => ({
      userId: r.id,
      displayName: r.name?.trim() ?? "NewChums user",
      handle: r.username ? (r.username.startsWith("@") ? r.username : `@${r.username}`) : null,
      avatarUrl: buildAvatarUrl(r.id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
      isChummed: r.is_chummed === true,
    }));
    return c.json({ ok: true, users });
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
      SELECT 1 FROM user_chums
      WHERE user_id = ${appUserId} AND chum_user_id = ${targetId}
      LIMIT 1
    `) as unknown[];
    return c.json({ ok: true, isChummed: rows.length > 0 });
  } catch (err) {
    console.error("[GET /chums/check/:userId]", err);
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
      SELECT u.id, u.name, u.username, u.avatar_key, u.avatar_updated_at
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
    }[];
    const chums = rows.map((r) => ({
      userId: r.id,
      displayName: r.name?.trim() ?? "NewChums user",
      handle: r.username ? (r.username.startsWith("@") ? r.username : `@${r.username}`) : null,
      avatarUrl: buildAvatarUrl(r.id, r.avatar_key, r.avatar_updated_at, c.env.MEDIA_BUCKET),
    }));
    return c.json({ ok: true, chums, total, hasMore: offset + limit < total });
  } catch (err) {
    console.error("[GET /public/users/:handle/chums]", err);
    return c.json({ ok: false, error: { code: "SERVER_ERROR" } }, 500);
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
