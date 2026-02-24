/**
 * Profile helpers: ensureAppUserId and types.
 */

export async function ensureAppUserId(
  sql: ReturnType<import("./db").getSql>,
  email: string,
  name?: string | null
): Promise<string> {
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
    if (
      msg.includes("users_email_key") ||
      msg.includes("unique") ||
      msg.includes("duplicate") ||
      msg.includes("violates unique constraint")
    ) {
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
