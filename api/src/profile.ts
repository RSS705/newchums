/**
 * Profile helpers: ensureAppUserId and types.
 */

export async function ensureAppUserId(
  sql: ReturnType<typeof import("./db").getSql>,
  email: string,
  name?: string | null
): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("ensureAppUserId requires email");

  const existing = (await sql`
    SELECT id FROM newchums.users WHERE email = ${normalized} LIMIT 1
  `) as { id: string }[];
  if (existing.length > 0) {
    return existing[0].id;
  }

  let newUserId: string | null = null;
  try {
    const inserted = (await sql`
      INSERT INTO newchums.users (email, name, email_verified_at)
      VALUES (${normalized}, ${name ?? null}, now())
      RETURNING id
    `) as { id: string }[];
    if (inserted.length > 0) newUserId = inserted[0].id;
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

  if (!newUserId) {
    const fallback = (await sql`
      SELECT id FROM newchums.users WHERE email = ${normalized} LIMIT 1
    `) as { id: string }[];
    if (fallback.length > 0) return fallback[0].id;
    throw new Error("Failed to ensure app user");
  }

  // Auto-link: promote Private Contacts whose email matches this new user
  // (mutual-chum replacement path: when the invited-off-platform person signs
  // up, the inviter's Private Contact entry flips to On NewChums).
  try {
    await sql`
      UPDATE newchums.user_contacts
      SET type = 'on_newchums', linked_user_id = ${newUserId}
      WHERE LOWER(contact_email) = ${normalized}
        AND type = 'private'
        AND linked_user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM newchums.user_contacts uc2
          WHERE uc2.user_id = user_contacts.user_id
            AND uc2.linked_user_id = ${newUserId}
        )
    `;
    await sql`
      DELETE FROM newchums.user_contacts
      WHERE LOWER(contact_email) = ${normalized}
        AND type = 'private'
        AND linked_user_id IS NULL
    `;
  } catch (autoLinkErr) {
    console.error("[ensureAppUserId] auto-link private contacts failed (non-fatal):", autoLinkErr);
  }

  return newUserId;
}
