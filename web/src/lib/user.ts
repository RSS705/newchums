import { sql } from "@/lib/db";

/** Normalize date_of_birth from DB (may be Date or string) to YYYY-MM-DD string or null. */
function normalizeDateOfBirth(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") {
    const t = val.trim();
    return t === "" ? null : t;
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Ensure user exists in DB by email (creates with email, name, username=null, date_of_birth=null if new).
 * Returns { id, username, date_of_birth, name } (date_of_birth as YYYY-MM-DD string or null).
 * Used for Google OAuth users who may not exist until first app access.
 */
export async function getOrCreateAppUser(
  email: string,
  name?: string | null
): Promise<{ id: string; username: string | null; date_of_birth: string | null; name: string | null }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("getOrCreateAppUser requires email");

  const existing = (await sql`
    SELECT id, username, date_of_birth, name
    FROM users
    WHERE email = ${normalized}
    LIMIT 1
  `) as { id: string; username: string | null; date_of_birth: unknown; name: string | null }[];

  if (existing.length > 0) {
    return {
      ...existing[0],
      date_of_birth: normalizeDateOfBirth(existing[0].date_of_birth),
    };
  }

  try {
    const inserted = (await sql`
      INSERT INTO users (email, name, email_verified_at)
      VALUES (${normalized}, ${name ?? null}, now())
      RETURNING id, username, date_of_birth, name
    `) as { id: string; username: string | null; date_of_birth: unknown; name: string | null }[];

    if (inserted.length > 0) {
      return {
        ...inserted[0],
        date_of_birth: normalizeDateOfBirth(inserted[0].date_of_birth),
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("users_email_key") ||
      msg.includes("unique") ||
      msg.includes("duplicate") ||
      msg.includes("violates unique constraint")
    ) {
      const retry = (await sql`
        SELECT id, username, date_of_birth, name
        FROM users
        WHERE email = ${normalized}
        LIMIT 1
      `) as { id: string; username: string | null; date_of_birth: unknown; name: string | null }[];
      if (retry.length > 0) {
        return {
          ...retry[0],
          date_of_birth: normalizeDateOfBirth(retry[0].date_of_birth),
        };
      }
    }
    throw err;
  }

  const fallback = (await sql`
    SELECT id, username, date_of_birth, name
    FROM users
    WHERE email = ${normalized}
    LIMIT 1
  `) as { id: string; username: string | null; date_of_birth: unknown; name: string | null }[];

  if (fallback.length > 0) {
    return {
      ...fallback[0],
      date_of_birth: normalizeDateOfBirth(fallback[0].date_of_birth),
    };
  }
  throw new Error("Failed to get or create app user");
}
