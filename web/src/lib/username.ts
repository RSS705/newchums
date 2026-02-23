/**
 * Username validation and normalization.
 * Source of truth for: regex, length, leading/trailing underscore rules.
 */

export const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

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
