import { sql } from "@/lib/db";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legalVersions";

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

/** Normalize accepted_legal_at (Date | string | null) to an ISO string or null. */
function normalizeAcceptedLegalAt(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") {
    const t = val.trim();
    return t === "" ? null : t;
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString();
  }
  return null;
}

type AppUser = {
  id: string;
  username: string | null;
  date_of_birth: string | null;
  name: string | null;
  role: string | null;
  is_suspended: boolean;
  /** True when the account was created via the lightweight plan-entry flow
   *  and the user hasn't set a password yet. Drives the in-app "finish
   *  setting up your account" nudge. */
  password_setup_pending: boolean;
  /** ISO timestamp of the user's most recent legal-acceptance record, or
   *  null if the user has never accepted Terms / Privacy. Populated by
   *  credentials signup at INSERT time, by Google-OAuth post-login via
   *  /auth/record-legal-acceptance, and by the accept-legal onboarding
   *  interstitial for users whose acceptance was lost (e.g. mobile Safari
   *  clearing sessionStorage during the OAuth redirect). The (app)
   *  layout reads this to decide whether to send the user to the
   *  interstitial before onboarding/username. */
  accepted_legal_at: string | null;
};

type AppUserRaw = Omit<AppUser, "date_of_birth" | "password_setup_pending" | "accepted_legal_at"> & {
  date_of_birth: unknown;
  password_setup_pending?: boolean | null;
  accepted_legal_at: unknown;
};

function hydrateAppUser(row: AppUserRaw): AppUser {
  return {
    ...row,
    is_suspended: Boolean(row.is_suspended),
    date_of_birth: normalizeDateOfBirth(row.date_of_birth),
    password_setup_pending: Boolean(row.password_setup_pending),
    accepted_legal_at: normalizeAcceptedLegalAt(row.accepted_legal_at),
  };
}

/**
 * Ensure user exists in DB by email (creates with email, name, username=null, date_of_birth=null if new).
 * Returns { id, username, date_of_birth, name, role, is_suspended }.
 * Used for Google OAuth users who may not exist until first app access.
 */
export async function getOrCreateAppUser(
  email: string,
  name?: string | null
): Promise<AppUser> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("getOrCreateAppUser requires email");

  const existing = (await sql`
    SELECT id, username, date_of_birth, name, role, is_suspended,
           COALESCE(password_setup_pending, false) AS password_setup_pending,
           accepted_legal_at
    FROM users
    WHERE email = ${normalized}
    LIMIT 1
  `) as AppUserRaw[];

  if (existing.length > 0) {
    return hydrateAppUser(existing[0]);
  }

  try {
    const inserted = (await sql`
      INSERT INTO users (email, name, email_verified_at,
                         accepted_terms_version, accepted_privacy_version, accepted_legal_at)
      VALUES (${normalized}, ${name ?? null}, now(),
              ${CURRENT_TERMS_VERSION}, ${CURRENT_PRIVACY_VERSION}, now())
      RETURNING id, username, date_of_birth, name, role, is_suspended,
               COALESCE(password_setup_pending, false) AS password_setup_pending,
               accepted_legal_at
    `) as AppUserRaw[];

    if (inserted.length > 0) {
      return hydrateAppUser(inserted[0]);
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
        SELECT id, username, date_of_birth, name, role, is_suspended,
               COALESCE(password_setup_pending, false) AS password_setup_pending,
               accepted_legal_at
        FROM users
        WHERE email = ${normalized}
        LIMIT 1
      `) as AppUserRaw[];
      if (retry.length > 0) {
        return hydrateAppUser(retry[0]);
      }
    }
    throw err;
  }

  const fallback = (await sql`
    SELECT id, username, date_of_birth, name, role, is_suspended,
           COALESCE(password_setup_pending, false) AS password_setup_pending,
           accepted_legal_at
    FROM users
    WHERE email = ${normalized}
    LIMIT 1
  `) as AppUserRaw[];

  if (fallback.length > 0) {
    return hydrateAppUser(fallback[0]);
  }
  throw new Error("Failed to get or create app user");
}
