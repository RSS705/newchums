import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";

export const runtime = "edge";

type ProfileRow = {
  home_city: string | null;
  home_lat: number | null;
  home_lng: number | null;
  travel_radius_km: number;
  email_chat_digest: boolean;
  email_new_events: boolean;
};

type InterestSlugRow = { slug: string };

/** Resolves app user id from newchums.users by email; creates row if missing. */
async function ensureAppUserId(email: string, name?: string | null): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("ensureAppUserId requires email");

  const existing = (await sql`
    SELECT id FROM newchums.users WHERE email = ${normalized} LIMIT 1
  `) as { id: string }[];
  if (existing.length > 0) return existing[0].id;

  try {
    const inserted = (await sql`
      INSERT INTO newchums.users (email, name)
      VALUES (${normalized}, ${name ?? null})
      RETURNING id
    `) as { id: string }[];
    if (inserted.length > 0) return inserted[0].id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("users_email_key") || msg.includes("unique") || msg.includes("duplicate") || msg.includes("violates unique constraint")) {
      const retry = (await sql`
        SELECT id FROM newchums.users WHERE email = ${normalized} LIMIT 1
      `) as { id: string }[];
      if (retry.length > 0) return retry[0].id;
    }
    throw err;
  }

  const fallback = (await sql`
    SELECT id FROM newchums.users WHERE email = ${normalized} LIMIT 1
  `) as { id: string }[];
  if (fallback.length > 0) return fallback[0].id;
  throw new Error("Failed to ensure app user");
}

export async function GET() {
  try {
    const session = await auth();
    const email = (session?.user as { email?: string })?.email;
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Missing session email" } },
        { status: 401 }
      );
    }

    const appUserId = await ensureAppUserId(email, session?.user ? (session.user as { name?: string | null }).name : null);

    const profileRows = (await sql`
      SELECT home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events
      FROM user_profile
      WHERE user_id = ${appUserId}
      LIMIT 1
    `) as ProfileRow[];

    const profile = profileRows[0];

    const interestRows = (await sql`
      SELECT i.slug
      FROM user_interests ui
      JOIN interests i ON i.id = ui.interest_id
      WHERE ui.user_id = ${appUserId}
      ORDER BY i.sort_order, i.name
    `) as InterestSlugRow[];

    const interest_slugs = interestRows.map((r) => r.slug);

    if (!profile) {
      return NextResponse.json({
        ok: true,
        profile: {
          home_city: null,
          home_lat: null,
          home_lng: null,
          travel_radius_km: 25,
          interest_slugs: [] as string[],
          email_chat_digest: true,
          email_new_events: true,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      profile: {
        home_city: profile.home_city,
        home_lat: profile.home_lat,
        home_lng: profile.home_lng,
        travel_radius_km: profile.travel_radius_km,
        interest_slugs,
        email_chat_digest: profile.email_chat_digest,
        email_new_events: profile.email_new_events,
      },
    });
  } catch (err) {
    console.error("Profile fetch error:", err);
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "Failed to fetch profile" } },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    const email = (session?.user as { email?: string })?.email;
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Missing session email" } },
        { status: 401 }
      );
    }

    const appUserId = await ensureAppUserId(email, session?.user ? (session.user as { name?: string | null }).name : null);

    const body = (await request.json()) as {
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
    `) as ProfileRow[];

    const existing = existingRows[0];

    const travel_radius_km =
      "travel_radius_km" in body && body.travel_radius_km != null
        ? Number(body.travel_radius_km)
        : existing?.travel_radius_km ?? 25;
    if (!Number.isFinite(travel_radius_km) || travel_radius_km < 1 || travel_radius_km > 200) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_INPUT", message: "travel_radius_km must be between 1 and 200" } },
        { status: 400 }
      );
    }

    const updatingLocation = "home_lat" in body || "home_lng" in body;
    const latRaw = body.home_lat;
    const lngRaw = body.home_lng;
    const latCoerced = latRaw != null && String(latRaw).trim() !== "" ? Number(latRaw) : null;
    const lngCoerced = lngRaw != null && String(lngRaw).trim() !== "" ? Number(lngRaw) : null;

    if (updatingLocation) {
      const bothPresent = latCoerced != null && lngCoerced != null && Number.isFinite(latCoerced) && Number.isFinite(lngCoerced);
      const bothAbsent = (latCoerced == null || !Number.isFinite(latCoerced)) && (lngCoerced == null || !Number.isFinite(lngCoerced));
      if (!bothPresent && !bothAbsent) {
        return NextResponse.json(
          { ok: false, error: { code: "INVALID_INPUT", message: "home_lat and home_lng must both be present and valid, or both be null/empty" } },
          { status: 400 }
        );
      }
      if (bothPresent) {
        if (latCoerced < -90 || latCoerced > 90) {
          return NextResponse.json(
            { ok: false, error: { code: "INVALID_INPUT", message: "home_lat must be between -90 and 90" } },
            { status: 400 }
          );
        }
        if (lngCoerced < -180 || lngCoerced > 180) {
          return NextResponse.json(
            { ok: false, error: { code: "INVALID_INPUT", message: "home_lng must be between -180 and 180" } },
            { status: 400 }
          );
        }
      }
    }

    const home_lat = updatingLocation ? (Number.isFinite(latCoerced) ? latCoerced : null) : existing?.home_lat ?? null;
    const home_lng = updatingLocation ? (Number.isFinite(lngCoerced) ? lngCoerced : null) : existing?.home_lng ?? null;

    const interest_slugs = "interest_slugs" in body ? (body.interest_slugs ?? []) : null;
    if (interest_slugs !== null && interest_slugs.length > 0) {
      const known = (await sql`
        SELECT slug FROM interests WHERE slug = ANY(${interest_slugs})
      `) as { slug: string }[];
      const knownSet = new Set(known.map((r) => r.slug));
      const unknown = interest_slugs.filter((s) => !knownSet.has(s));
      if (unknown.length > 0) {
        return NextResponse.json(
          { ok: false, error: { code: "INVALID_INPUT", message: `Unknown interest slugs: ${unknown.join(", ")}` } },
          { status: 400 }
        );
      }
    }

    const home_city = "home_city" in body ? (body.home_city ?? null) : existing?.home_city ?? null;
    const email_chat_digest = "email_chat_digest" in body ? (body.email_chat_digest ?? true) : existing?.email_chat_digest ?? true;
    const email_new_events = "email_new_events" in body ? (body.email_new_events ?? true) : existing?.email_new_events ?? true;

    const hasLocation = home_lat != null && home_lng != null && Number.isFinite(home_lat) && Number.isFinite(home_lng);

    const upsertQuery = hasLocation
      ? sql`
          INSERT INTO user_profile (user_id, home_city, home_lat, home_lng, home_location, travel_radius_km, email_chat_digest, email_new_events)
          VALUES (
            ${appUserId},
            ${home_city},
            ${home_lat},
            ${home_lng},
            ST_SetSRID(ST_MakePoint(${home_lng}, ${home_lat}), 4326)::geography,
            ${travel_radius_km},
            ${email_chat_digest},
            ${email_new_events}
          )
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
          VALUES (
            ${appUserId},
            ${home_city},
            ${home_lat},
            ${home_lng},
            NULL,
            ${travel_radius_km},
            ${email_chat_digest},
            ${email_new_events}
          )
          ON CONFLICT (user_id) DO UPDATE SET
            home_city = EXCLUDED.home_city,
            home_lat = EXCLUDED.home_lat,
            home_lng = EXCLUDED.home_lng,
            home_location = NULL,
            travel_radius_km = EXCLUDED.travel_radius_km,
            email_chat_digest = EXCLUDED.email_chat_digest,
            email_new_events = EXCLUDED.email_new_events
        `;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txQueries: any[] = [upsertQuery];

    if (interest_slugs !== null) {
      txQueries.push(sql`DELETE FROM user_interests WHERE user_id = ${appUserId}`);
      txQueries.push(
        interest_slugs.length > 0
          ? sql`
              INSERT INTO user_interests (user_id, interest_id)
              SELECT ${appUserId}, i.id FROM interests i WHERE i.slug = ANY(${interest_slugs})
            `
          : sql`SELECT 1`
      );
    }

    await sql.transaction(txQueries);

    const profileRows = (await sql`
      SELECT home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events
      FROM user_profile WHERE user_id = ${appUserId} LIMIT 1
    `) as ProfileRow[];

    const interestRows = (await sql`
      SELECT i.slug FROM user_interests ui
      JOIN interests i ON i.id = ui.interest_id
      WHERE ui.user_id = ${appUserId}
      ORDER BY i.sort_order, i.name
    `) as InterestSlugRow[];

    const profile = profileRows[0]!;
    return NextResponse.json({
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
    console.error("Profile update error:", err);
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "Failed to update profile" } },
      { status: 500 }
    );
  }
}
