import { Hono } from "hono";
import { DATABASE_URL_HINT, type Bindings, getSql } from "./db";

const app = new Hono<{ Bindings: Bindings }>();

const DEV_USER_RETURN_COLUMNS = `
  id,
  email,
  name,
  created_at
`;

app.get("/", (c) => c.text("NewChums API is live"));
app.get("/health", (c) => c.json({ ok: true }));

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
      400
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
      [id]
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
    if (body.name !== undefined) updates.push({ column: "name", value: body.name });
    if (body.password_hash !== undefined) {
      updates.push({ column: "password_hash", value: body.password_hash });
    }

    if (updates.length === 0) {
      return c.json({ ok: false, error: "No valid fields to update" }, 400);
    }

    const setClauses = updates.map(
      (update, i) => `${update.column} = $${i + 1}`
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
      [id]
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

export default app;
