import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";
import { DATABASE_URL_HINT, type Bindings, getSql } from "./db";
import {
  sendPasswordResetEmail,
  sendRsvpConfirmationEmail,
  sendVerificationEmail,
} from "./email/send";
import { canAccessInternalTestRoute, notFound } from "./internalAccess";

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

app.use("*", async (c, next) => {
  const startedAt = Date.now();
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();

  await next();

  const durationMs = Date.now() - startedAt;
  const cfRay = c.res.headers.get("CF-RAY");
  await axiomIngest(c.env, [
    {
      message: "api_request",
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration_ms: durationMs,
      request_id: requestId,
      cf_ray: cfRay ?? null,
    },
  ]);
});

app.get("/", (c) => c.text("NewChums API is live"));
app.get("/health", (c) =>
  c.json({ ok: true, service: "api", ts: new Date().toISOString() }),
);
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

  await axiomIngest(c.env, [
    { message: "axiom test log", level: "info" },
  ]);
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
