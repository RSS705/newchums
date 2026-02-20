import { sql } from "@/lib/db";

/**
 * Ensure user exists in DB by email (creates with email, name, username=null if new).
 * Returns { id, username }.
 * Used for Google OAuth users who may not exist until first app access.
 */
export async function getOrCreateAppUser(
  email: string,
  name?: string | null
): Promise<{ id: string; username: string | null }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("getOrCreateAppUser requires email");

  const existing = (await sql`
    SELECT id, username
    FROM users
    WHERE email = ${normalized}
    LIMIT 1
  `) as { id: string; username: string | null }[];

  if (existing.length > 0) return existing[0];

  try {
    const inserted = (await sql`
      INSERT INTO users (email, name)
      VALUES (${normalized}, ${name ?? null})
      RETURNING id, username
    `) as { id: string; username: string | null }[];

    if (inserted.length > 0) return inserted[0];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("users_email_key") ||
      msg.includes("unique") ||
      msg.includes("duplicate") ||
      msg.includes("violates unique constraint")
    ) {
      const retry = (await sql`
        SELECT id, username
        FROM users
        WHERE email = ${normalized}
        LIMIT 1
      `) as { id: string; username: string | null }[];
      if (retry.length > 0) return retry[0];
    }
    throw err;
  }

  const fallback = (await sql`
    SELECT id, username
    FROM users
    WHERE email = ${normalized}
    LIMIT 1
  `) as { id: string; username: string | null }[];

  if (fallback.length > 0) return fallback[0];
  throw new Error("Failed to get or create app user");
}
