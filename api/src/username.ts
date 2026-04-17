/**
 * Username validation, normalization, and fun auto-generation.
 * Source of truth for: regex, length, leading/trailing underscore rules.
 */

import { USERNAME_ADJECTIVES, USERNAME_ANIMALS } from "./data/usernameWords";
import { validateCleanText } from "./lib/contentSafety";

export const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;
export const USERNAME_MAX_LENGTH = 20;

/** Normalize for uniqueness checks: trim + lowercase */
export function normalizeUsernameForUniq(value: string): string {
  return value.trim().toLowerCase();
}

/** Trim only; preserves user's preferred casing for display */
export function normalizeUsernameDisplay(value: string): string {
  return value.trim();
}

export function validateUsername(value: string): {
  valid: boolean;
  error?: "INVALID_INPUT" | "INVALID_USERNAME";
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: "INVALID_INPUT" };
  }
  if (!USERNAME_REGEX.test(trimmed)) {
    return { valid: false, error: "INVALID_USERNAME" };
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("_") || lower.endsWith("_")) {
    return { valid: false, error: "INVALID_USERNAME" };
  }
  return { valid: true };
}

// ── Fun username auto-generation ────────────────────────────────────────────

type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Build a single candidate username: <Adjective><Animal><###>, trimmed to 20 chars. */
function draftCandidate(): string {
  const adjective = pick(USERNAME_ADJECTIVES);
  let animal = pick(USERNAME_ANIMALS);
  const digits = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  let candidate = `${adjective}${animal}${digits}`;
  if (candidate.length > USERNAME_MAX_LENGTH) {
    // Preserve adjective + digits; truncate the animal to fit.
    const room = USERNAME_MAX_LENGTH - adjective.length - digits.length;
    if (room >= 3) {
      animal = animal.slice(0, room);
      candidate = `${adjective}${animal}${digits}`;
    } else {
      // Adjective already too long; fall back to truncated form.
      candidate = candidate.slice(0, USERNAME_MAX_LENGTH);
    }
  }
  return candidate;
}

/**
 * Auto-generate a fun, unique username for lightweight signups.
 *
 * Format: <Adjective><Animal><###> (e.g. HappyOtter273, CosmicBadger041).
 * Checks uniqueness against `users.username_norm` (lowercase index).
 * Retries on collisions and on occasional contentSafety false-positives.
 * Falls back to "Chum" + 6 hex chars after repeated failure.
 */
export async function generateFunUsername(sql: SqlClient): Promise<string> {
  const MAX_ATTEMPTS = 10;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = draftCandidate();

    // Defensive content-safety check. Word lists are pre-vetted but
    // combinations like "BallsyBear" could sneak through if someone adds
    // the wrong word later. Retry on any flag.
    const safety = validateCleanText(candidate, "username");
    if (!safety.ok) continue;

    // USERNAME_REGEX is guaranteed by construction (alphanumeric only, length ok),
    // but check anyway so a future word-list edit can't silently break this.
    if (!USERNAME_REGEX.test(candidate)) continue;

    const norm = candidate.toLowerCase();
    const rows = (await sql`
      SELECT 1 FROM newchums.users WHERE username_norm = ${norm} LIMIT 1
    `) as { "?column?": number }[];
    if (rows.length === 0) return candidate;
  }

  // Fallback: Chum + 6 hex chars (e.g. "Chum4a8c92"). Effectively never collides.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `Chum${randomHex(3)}`;
    const norm = candidate.toLowerCase();
    const rows = (await sql`
      SELECT 1 FROM newchums.users WHERE username_norm = ${norm} LIMIT 1
    `) as { "?column?": number }[];
    if (rows.length === 0) return candidate;
  }

  throw new Error("generateFunUsername: exhausted all attempts (database may be in a bad state)");
}
