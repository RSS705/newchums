/**
 * Date of birth validation (13+ minimum).
 * Signup uses ageValidation.isAtLeast18 (18+) directly; this module is retained for
 * potential 13+ flows. Uses parseDateOnly from ageValidation for timezone-safe parsing.
 */

import { getAgeYears, parseDateOnly } from "./ageValidation";

export function validateDateOfBirth(value: string): {
  valid: boolean;
  error?: "REQUIRED" | "INVALID_DATE" | "TOO_YOUNG" | "FUTURE_DATE";
  parsed?: string;
} {
  const trimmed = value?.trim();
  if (!trimmed) {
    return { valid: false, error: "REQUIRED" };
  }

  const parts = parseDateOnly(trimmed);
  if (!parts) {
    return { valid: false, error: "INVALID_DATE" };
  }

  const today = new Date();
  const age = getAgeYears(trimmed, today);
  if (age < 0) {
    return { valid: false, error: "FUTURE_DATE" };
  }
  if (age < 13) {
    return { valid: false, error: "TOO_YOUNG" };
  }

  const normalized = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
  return { valid: true, parsed: normalized };
}
