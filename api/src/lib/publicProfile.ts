/**
 * Public profile helpers: age computation, no DOB exposure.
 */

import { parseDateOnly } from "../ageValidation";

/**
 * Compute age in years from YYYY-MM-DD date of birth.
 * Returns null for invalid or missing input.
 */
export function computeAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth?.trim()) return null;
  const parts = parseDateOnly(dateOfBirth.trim());
  if (!parts) return null;

  const today = new Date();
  const birth = new Date(parts.y, parts.m - 1, parts.d);
  if (birth > today) return null;

  let age = today.getFullYear() - parts.y;
  const monthDiff = today.getMonth() - (parts.m - 1);
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parts.d)) {
    age--;
  }
  return age;
}
