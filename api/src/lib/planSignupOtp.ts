/**
 * One-time code (OTP) helpers for the lightweight plan-signup flow (B1).
 *
 * The code is a 6-digit numeric string, uniformly distributed via rejection
 * sampling, stored only as a sha256 hash (hashResetToken) on the same
 * email_verification_tokens row as the magic-link token. Codes are single
 * use, expire with the row, and are invalidated after
 * PLAN_SIGNUP_OTP_MAX_ATTEMPTS failed guesses. Raw codes must never be
 * logged.
 */

/** Row TTL for plan-signup code + link (both credentials share it). */
export const PLAN_SIGNUP_CODE_EXPIRY_MS = 10 * 60 * 1000;

/** TTL for the one-time session-grant token minted after a correct code. */
export const PLAN_SIGNUP_GRANT_EXPIRY_MS = 5 * 60 * 1000;

/** Failed guesses allowed before the row is invalidated. */
export const PLAN_SIGNUP_OTP_MAX_ATTEMPTS = 5;

/** Server-enforced cooldown between plan-signup emails per address. */
export const PLAN_SIGNUP_RESEND_COOLDOWN_SECONDS = 45;

/** Uniform 6-digit numeric code, "000000".."999999". */
export function generateOtpCode(): string {
  const buf = new Uint32Array(1);
  // Rejection-sample so the modulo does not bias the low codes. 4294000000
  // is the largest multiple of 1_000_000 that fits in a uint32.
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < 4_294_000_000) {
      return String(buf[0] % 1_000_000).padStart(6, "0");
    }
  }
}

export type SignupIntent = "going" | "maybe";

/** Sanitize a client-supplied intent value; anything else becomes null. */
export function parseSignupIntent(raw: unknown): SignupIntent | null {
  return raw === "going" || raw === "maybe" ? raw : null;
}
