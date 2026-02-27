import * as Sentry from "@sentry/cloudflare";
import { hashSync } from "bcryptjs";
import { Hono } from "hono";
import { inspectRoutes } from "hono/dev";
import { isAtLeast18, parseDateOnly } from "./ageValidation";
import { getBearerToken, verifyAuthToken } from "./auth";
import { DATABASE_URL_HINT, type Bindings, getSql } from "./db";
import {
  sendPasswordResetEmail,
  sendRsvpConfirmationEmail,
  sendVerificationEmail,
} from "./email/send";
import { canAccessInternalTestRoute, notFound } from "./internalAccess";
import { nameToSlug, slugToName, validateInterestName } from "./interests";
import { ensureAppUserId } from "./profile";
import { generateResetToken, hashResetToken } from "./resetTokens";
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

app.get("/", (c) => c.text("NewChums API is live"));
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
    },
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
      SELECT id FROM users WHERE email = ${normalizedEmail} LIMIT 1
    `) as { id: string }[];
    if (existingEmail.length > 0) {
      return c.json({ ok: false, error: "EMAIL_EXISTS" }, 409);
    }

    const existingUsername = (await sql`
      SELECT id FROM users WHERE username_norm = ${usernameNorm} LIMIT 1
    `) as { id: string }[];
    if (existingUsername.length > 0) {
      return c.json({ ok: false, error: "USERNAME_TAKEN" }, 409);
    }

    const passwordHash = hashSync(body.password, 10);
    await sql`
      INSERT INTO users (email, name, username, username_norm, password_hash, date_of_birth, email_verified_at)
      VALUES (${normalizedEmail}, ${normalizedName}, ${usernameDisplay}, ${usernameNorm}, ${passwordHash}, ${parsedDob}, NULL)
    `;
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
    return c.json({ ok: false, error: "OAUTH_ACCOUNT", message: "This account uses Google sign-in." }, 409);
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
          ORDER BY name ASC
          LIMIT 20
        `) as { id: string; name: string; slug: string }[])
      : ((await sql`
          SELECT id, name, category, slug, sort_order
          FROM interests
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

async function requireAuth(c: { req: Request; env: Bindings }) {
  const token = getBearerToken(c.req);
  if (!token || !c.env.NEXTAUTH_SECRET) {
    return null;
  }
  return verifyAuthToken(token, c.env.NEXTAUTH_SECRET);
}

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
    const profileRows = (await sql`
      SELECT home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events
      FROM user_profile WHERE user_id = ${appUserId} LIMIT 1
    `) as Array<{
      home_city: string | null;
      home_lat: number | null;
      home_lng: number | null;
      travel_radius_km: number;
      email_chat_digest: boolean;
      email_new_events: boolean;
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
    if (!profile) {
      return c.json({
        ok: true,
        profile: {
          home_city: null,
          home_lat: null,
          home_lng: null,
          travel_radius_km: 25,
          interest_slugs: [] as string[],
          interest_items: [] as { slug: string; name: string }[],
          email_chat_digest: true,
          email_new_events: true,
        },
      });
    }
    return c.json({
      ok: true,
      profile: {
        home_city: profile.home_city,
        home_lat: profile.home_lat,
        home_lng: profile.home_lng,
        travel_radius_km: profile.travel_radius_km,
        interest_slugs: interestRows.map((r) => r.slug),
        interest_items,
        email_chat_digest: profile.email_chat_digest,
        email_new_events: profile.email_new_events,
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
      home_city?: string | null;
      home_lat?: number | string | null;
      home_lng?: number | string | null;
      travel_radius_km?: number;
      interest_slugs?: string[];
      email_chat_digest?: boolean;
      email_new_events?: boolean;
    };
    const existingRows = (await sql`
      SELECT home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events
      FROM user_profile WHERE user_id = ${appUserId} LIMIT 1
    `) as Array<{
      home_city: string | null;
      home_lat: number | null;
      home_lng: number | null;
      travel_radius_km: number;
      email_chat_digest: boolean;
      email_new_events: boolean;
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
    if (rawInterestSlugs !== null) {
      const normalized = rawInterestSlugs
        .map((s) => nameToSlug(String(s).trim()))
        .filter((s) => s.length > 0);
      finalInterestSlugs = [...new Set(normalized)];
      for (const slug of finalInterestSlugs) {
        const nameForValidation = slugToName(slug);
        const v = validateInterestName(nameForValidation);
        if (!v.valid) {
          return c.json(
            { ok: false, error: { code: "INVALID_INPUT", message: v.error } },
            400,
          );
        }
      }
      const existingRows = (await sql`
        SELECT id, slug FROM interests WHERE LOWER(slug) = ANY(${finalInterestSlugs.map((s) => s.toLowerCase())})
      `) as { id: string; slug: string }[];
      const existingBySlug = new Map(existingRows.map((r) => [r.slug.toLowerCase(), r.id]));
      for (const slug of finalInterestSlugs) {
        if (!existingBySlug.has(slug.toLowerCase())) {
          const name = slugToName(slug);
          try {
            await sql`
              INSERT INTO interests (name, category, slug, sort_order, is_seed)
              VALUES (${name}, '', ${slug}, 0, false)
            `;
          } catch {
            // Ignore duplicate (race with concurrent insert)
          }
        }
      }
    }
    const home_city =
      "home_city" in body
        ? (body.home_city ?? null)
        : (existing?.home_city ?? null);
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
    const upsertQuery = hasLocation
      ? sql`
          INSERT INTO user_profile (user_id, home_city, home_lat, home_lng, home_location, travel_radius_km, email_chat_digest, email_new_events)
          VALUES (${appUserId}, ${home_city}, ${home_lat}, ${home_lng}, ST_SetSRID(ST_MakePoint(${home_lng}, ${home_lat}), 4326)::geography, ${travel_radius_km}, ${email_chat_digest}, ${email_new_events})
          ON CONFLICT (user_id) DO UPDATE SET
            home_city = EXCLUDED.home_city,
            home_lat = EXCLUDED.home_lat,
            home_lng = EXCLUDED.home_lng,
            home_location = ST_SetSRID(ST_MakePoint(${home_lng}, ${home_lat}), 4326)::geography,
            travel_radius_km = EXCLUDED.travel_radius_km,
            email_chat_digest = EXCLUDED.email_chat_digest,
            email_new_events = EXCLUDED.email_new_events
        `
      : sql`
          INSERT INTO user_profile (user_id, home_city, home_lat, home_lng, home_location, travel_radius_km, email_chat_digest, email_new_events)
          VALUES (${appUserId}, ${home_city}, ${home_lat}, ${home_lng}, NULL, ${travel_radius_km}, ${email_chat_digest}, ${email_new_events})
          ON CONFLICT (user_id) DO UPDATE SET
            home_city = EXCLUDED.home_city,
            home_lat = EXCLUDED.home_lat,
            home_lng = EXCLUDED.home_lng,
            home_location = NULL,
            travel_radius_km = EXCLUDED.travel_radius_km,
            email_chat_digest = EXCLUDED.email_chat_digest,
            email_new_events = EXCLUDED.email_new_events
        `;
    const txQueries: unknown[] = [upsertQuery];
    if (rawInterestSlugs !== null) {
      txQueries.push(
        sql`DELETE FROM user_interests WHERE user_id = ${appUserId}`,
      );
      txQueries.push(
        finalInterestSlugs.length > 0
          ? sql`
              INSERT INTO user_interests (user_id, interest_id)
              SELECT ${appUserId}, i.id FROM interests i WHERE i.slug = ANY(${finalInterestSlugs})
            `
          : sql`SELECT 1`,
      );
    }
    await sql.transaction(txQueries);
    const profileRows = (await sql`
      SELECT home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events
      FROM user_profile WHERE user_id = ${appUserId} LIMIT 1
    `) as Array<{
      home_city: string | null;
      home_lat: number | null;
      home_lng: number | null;
      travel_radius_km: number;
      email_chat_digest: boolean;
      email_new_events: boolean;
    }>;
    const interestRows = (await sql`
      SELECT i.slug FROM user_interests ui
      JOIN interests i ON i.id = ui.interest_id
      WHERE ui.user_id = ${appUserId}
      ORDER BY i.sort_order, i.name
    `) as { slug: string }[];
    const profile = profileRows[0]!;
    return c.json({
      ok: true,
      profile: {
        home_city: profile.home_city,
        home_lat: profile.home_lat,
        home_lng: profile.home_lng,
        travel_radius_km: profile.travel_radius_km,
        interest_slugs: interestRows.map((r) => r.slug),
        email_chat_digest: profile.email_chat_digest,
        email_new_events: profile.email_new_events,
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

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
  }),
  {
    fetch: app.fetch,
  },
);
